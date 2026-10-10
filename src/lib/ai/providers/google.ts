/**
 * Google Gemini provider implementation.
 *
 * Uses the NEW @google/genai SDK (not the deprecated @google/generative-ai).
 * Single frontier model: Gemini 2.5 Flash — best price-performance for tool use.
 *
 * Supports three modes:
 * 1. Single-turn completions (complete / extractJSON)
 * 2. Agentic tool-use loops (completeWithTools)
 * 3. Vertex AI auth for OAuth (via GOOGLE_VERTEX_PROJECT + ADC)
 */

import { GoogleGenAI, Type } from "@google/genai";
import type {
  LLMProvider,
  LLMCapabilities,
  CompletionRequest,
  CompletionResponse,
  AgenticRequest,
  AgenticResponse,
} from "../types";

// ---------------------------------------------------------------------------
// Model constant — single frontier model
// ---------------------------------------------------------------------------

// Alias que Google mantiene apuntando al modelo Flash vigente. Evita que la app
// se rompa cuando Google retira una versión concreta (p. ej. gemini-2.5-flash).
// GOOGLE_AI_MODEL permite fijar un modelo específico.
const DEFAULT_MODEL = "gemini-flash-latest";

/** Modelo en uso; cambia si Google retira el configurado. */
let _activeModel: string | undefined;

function currentModel(): string {
  return _activeModel ?? (process.env.GOOGLE_AI_MODEL?.trim() || DEFAULT_MODEL);
}

/** ¿El error indica que el modelo ya no existe o no está disponible? */
export function isModelUnavailableError(error: unknown): boolean {
  const status = (error as { status?: number; code?: number })?.status ?? (error as { code?: number })?.code;
  const message = error instanceof Error ? error.message : String(error);
  return (
    status === 404 ||
    /NOT_FOUND|no longer available|is not found|not supported for generateContent|does not exist/i.test(message)
  );
}

/** Modelo que Google sugiere en el mensaje de error ("use models/gemini-…"). */
export function suggestedModelFromError(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  return message.match(/use\s+models\/(gemini-[\w.-]+)/i)?.[1];
}

/**
 * Elige el mejor modelo Flash disponible para esta llave: soporta
 * generateContent, sin variantes experimentales/preview/lite/tts/imagen, y con
 * el número de versión más alto.
 */
export function pickBestFlashModel(names: string[]): string | undefined {
  const version = (name: string) => Number(name.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  return names
    .map((name) => name.replace(/^models\//, ""))
    .filter((name) => /^gemini-[\d.]+-flash$/.test(name) || name === "gemini-flash-latest")
    .sort((a, b) => (a === "gemini-flash-latest" ? -1 : b === "gemini-flash-latest" ? 1 : version(b) - version(a)))[0];
}

async function discoverModel(): Promise<string | undefined> {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.GOOGLE_VERTEX_PROJECT) return undefined;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    return pickBestFlashModel(
      (data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => m.name),
    );
  } catch {
    return undefined;
  }
}

/**
 * Llama a generateContent con el modelo actual. Si Google responde que el
 * modelo ya no está disponible, cambia al sugerido (o al mejor Flash de la
 * cuenta) y reintenta una vez.
 */
async function generateWithFallback(
  client: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">,
) {
  const model = currentModel();
  try {
    return await client.models.generateContent({ ...params, model });
  } catch (error) {
    if (!isModelUnavailableError(error)) throw error;
    const replacement = [suggestedModelFromError(error), await discoverModel(), DEFAULT_MODEL].find(
      (candidate) => candidate && candidate !== model,
    );
    if (!replacement) throw error;
    console.warn(`[ai/google] El modelo "${model}" no está disponible; se usará "${replacement}".`);
    _activeModel = replacement;
    return client.models.generateContent({ ...params, model: replacement });
  }
}

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

let _client: GoogleGenAI | null | undefined;

function getClient(): GoogleGenAI | null {
  if (_client !== undefined) return _client;

  const vertexProject = process.env.GOOGLE_VERTEX_PROJECT;
  const vertexLocation = process.env.GOOGLE_VERTEX_LOCATION || "us-central1";
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

  if (vertexProject) {
    // Vertex AI mode — uses Application Default Credentials (ADC) or service account
    // This is the OAuth path for Google: gcloud auth application-default login
    console.log("[ai/google] Using Vertex AI mode with project:", vertexProject);
    _client = new GoogleGenAI({
      vertexai: true,
      project: vertexProject,
      location: vertexLocation,
    });
    return _client;
  }

  if (!apiKey) {
    console.warn(
      "[ai/google] Neither GOOGLE_AI_API_KEY, GEMINI_API_KEY, nor GOOGLE_VERTEX_PROJECT set — Google provider disabled"
    );
    _client = null;
    return null;
  }

  _client = new GoogleGenAI({ apiKey });
  return _client;
}

/** Reset the singleton (used when auth config changes at runtime). */
export function resetGoogleClient(): void {
  _client = undefined;
  _activeModel = undefined;
}

// ---------------------------------------------------------------------------
// Robust JSON extraction — same strategies as other providers
// ---------------------------------------------------------------------------

function robustParseJSON<T>(text: string): T | null {
  const trimmed = text.trim();

  try { return JSON.parse(trimmed) as T; } catch { /* continue */ }

  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)(?:\n?```\s*$|$)/i;
  const fenceMatch = trimmed.match(fencePattern);
  if (fenceMatch?.[1]) {
    const inner = fenceMatch[1].trim();
    try { return JSON.parse(inner) as T; } catch {
      const balanced = extractBalancedJSON(inner);
      if (balanced) { try { return JSON.parse(balanced) as T; } catch { /* */ } }
      const repaired = repairTruncatedJSON(inner);
      if (repaired) { try { return JSON.parse(repaired) as T; } catch { /* */ } }
    }
  }

  const balanced = extractBalancedJSON(trimmed);
  if (balanced) { try { return JSON.parse(balanced) as T; } catch { /* */ } }

  const firstBrace = trimmed.indexOf("{");
  if (firstBrace >= 0) {
    const jsonCandidate = trimmed.slice(firstBrace);
    try { return JSON.parse(jsonCandidate) as T; } catch {
      const repaired = repairTruncatedJSON(jsonCandidate);
      if (repaired) { try { return JSON.parse(repaired) as T; } catch { /* */ } }
    }
  }

  console.error("[ai/google] robustParseJSON: all strategies failed, text starts with:", trimmed.slice(0, 200));
  return null;
}

function extractBalancedJSON(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"' && !escape) { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

function repairTruncatedJSON(json: string): string | null {
  let s = json.trim().replace(/,\s*$/, "");
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"' && !escape) { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop();
    }
  }
  if (inString) s += '"';
  while (stack.length > 0) s += stack.pop();
  return s;
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

class GoogleProvider implements LLMProvider {
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const client = getClient();
    if (!client) return { text: null };

    const {
      system,
      prompt,
      maxTokens = 1024,
      temperature = 0.3,
    } = req;

    const response = await generateWithFallback(client, {
      contents: prompt,
      config: {
        ...(system ? { systemInstruction: system } : {}),
        maxOutputTokens: maxTokens,
        temperature,
      },
    });

    const text = response.text ?? null;

    // Check for truncation
    const candidates = response.candidates;
    if (candidates?.[0]?.finishReason === "MAX_TOKENS") {
      console.warn(
        `[ai/google] Response TRUNCATED (finishReason=MAX_TOKENS). ` +
        `maxOutputTokens=${maxTokens}. Consider increasing maxTokens.`
      );
    }

    return {
      text,
      usage: response.usageMetadata
        ? {
          inputTokens: response.usageMetadata.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata.candidatesTokenCount ?? 0,
        }
        : undefined,
    };
  }

  async extractJSON<T = unknown>(req: CompletionRequest): Promise<T | null> {
    console.log(`[ai/google] extractJSON called (maxTokens=${req.maxTokens}, promptLen=${req.prompt.length})`);

    let text: string | null;
    try {
      const response = await this.complete(req);
      text = response.text;
    } catch (apiError) {
      console.error("[ai/google] extractJSON: API call failed:", apiError instanceof Error ? apiError.message : String(apiError));
      throw apiError;
    }

    if (!text) {
      console.error("[ai/google] extractJSON: API returned empty/null text");
      return null;
    }

    console.log(`[ai/google] extractJSON: got response (${text.length} chars), starts with: ${JSON.stringify(text.slice(0, 100))}`);
    console.log(`[ai/google] extractJSON: ends with: ${JSON.stringify(text.slice(-100))}`);

    try {
      const parsed = robustParseJSON<T>(text);
      if (parsed !== null) {
        console.log("[ai/google] extractJSON: successfully parsed JSON");
        return parsed;
      }
      console.error("[ai/google] extractJSON: FAILED to parse. Response length:", text.length);
      return null;
    } catch (e) {
      console.error("[ai/google] extractJSON: exception during parse:", e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  /**
   * Agentic tool-use loop for Google Gemini.
   *
   * Converts our ToolDefinition format to Gemini's functionDeclarations format,
   * then runs a multi-turn loop until the model produces a final text response.
   */
  async completeWithTools(req: AgenticRequest): Promise<AgenticResponse> {
    const client = getClient();
    if (!client) return { text: null, toolCalls: [] };

    const {
      system,
      prompt,
      tools,
      executeTools,
      maxTokens = 8192,
      temperature = 0.4,
      maxTurns = 15,
    } = req;

    // Convert our tool definitions to Gemini functionDeclarations format
    const geminiTools = [{
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: convertToGeminiSchema(t.input_schema),
      })),
    }];

    // Build conversation contents
    const contents: any[] = [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ];

    const allToolCalls: { name: string; input: any; result: any }[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await generateWithFallback(client, {
        contents,
        config: {
          ...(system ? { systemInstruction: system } : {}),
          maxOutputTokens: maxTokens,
          temperature,
          // Gemini rechaza una lista de funciones vacía.
          ...(tools.length ? { tools: geminiTools } : {}),
        },
      });

      // Track usage
      if (response.usageMetadata) {
        totalInputTokens += response.usageMetadata.promptTokenCount ?? 0;
        totalOutputTokens += response.usageMetadata.candidatesTokenCount ?? 0;
      }

      // Check if the model wants to call functions
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        // Add model's response (with function calls) to conversation
        contents.push({
          role: "model",
          parts: functionCalls.map((fc: any) => ({ functionCall: fc })),
        });

        // Execute each function call and build response parts
        const functionResponseParts: any[] = [];

        for (const fc of functionCalls) {
          const functionName = fc.name;
          const functionArgs = fc.args || {};

          console.log(`[ai/google] Tool call: ${functionName}`, JSON.stringify(functionArgs).slice(0, 200));

          let result: string;
          try {
            result = await executeTools(functionName!, functionArgs as Record<string, unknown>);
          } catch (err) {
            result = `Error executing tool ${functionName}: ${err instanceof Error ? err.message : String(err)}`;
            console.error(`[ai/google] Tool error:`, result);
          }

          allToolCalls.push({ name: functionName!, input: functionArgs, result });

          functionResponseParts.push({
            functionResponse: {
              name: functionName,
              response: { result },
            },
          });
        }

        // Add function responses to conversation
        contents.push({
          role: "user",
          parts: functionResponseParts,
        });
        // Continue loop
      } else {
        // Model produced final text
        const text = response.text ?? null;
        return {
          text,
          toolCalls: allToolCalls,
          usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        };
      }
    }

    // Hit max turns
    console.warn(`[ai/google] Hit max turns (${maxTurns}) in agentic loop`);
    return {
      text: "Analysis incomplete — reached maximum tool call limit. Results may be partial.",
      toolCalls: allToolCalls,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    };
  }

  isConfigured(): boolean {
    return getClient() !== null;
  }

  getCapabilities(): LLMCapabilities {
    return {
      supportsExtendedThinking: true, // Gemini 2.5 supports thinking
      supportsParallelToolCalls: true,
      supportsStructuredOutput: true,
      maxContextTokens: 1_000_000,
    };
  }

  getProviderName(): string {
    return "google";
  }
}

// ---------------------------------------------------------------------------
// Schema conversion: our JSON Schema → Gemini's Type-based schema
// ---------------------------------------------------------------------------

/**
 * Convert a JSON Schema object to Gemini's parameter format.
 * Gemini expects Type enum values instead of "string", "number", etc.
 */
function convertToGeminiSchema(schema: any): any {
  if (!schema) return undefined;

  const typeMap: Record<string, any> = {
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    array: Type.ARRAY,
    object: Type.OBJECT,
  };

  const result: any = {};

  if (schema.type) {
    result.type = typeMap[schema.type] || Type.STRING;
  }

  if (schema.description) {
    result.description = schema.description;
  }

  if (schema.enum) {
    result.enum = schema.enum;
  }

  if (schema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      result.properties[key] = convertToGeminiSchema(value);
    }
  }

  if (schema.required) {
    result.required = schema.required;
  }

  if (schema.items) {
    result.items = convertToGeminiSchema(schema.items);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Export singleton instance
// ---------------------------------------------------------------------------

export const googleProvider = new GoogleProvider();
