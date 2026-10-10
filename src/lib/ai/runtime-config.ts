import { getSecret, type LocalSecretKey } from "@/lib/config/local-secrets";
import { getAuthInfo, resetProviders } from "./claude";

/**
 * Las llaves de IA que se guardan en Configuración viven cifradas en la base
 * de datos, pero los proveedores (Anthropic, OpenAI, Gemini) leen
 * `process.env`. Esta función copia las llaves guardadas al entorno del
 * proceso y elige automáticamente un proveedor que sí tenga llave.
 *
 * Prioridad: llave guardada en Configuración > variable de entorno.
 * Se llama al inicio de cada auditoría y de cada tarea del agente.
 */

const KEY_ENV: [LocalSecretKey, string, string][] = [
  ["anthropic_api_key", "ANTHROPIC_API_KEY", "anthropic"],
  ["openai_api_key", "OPENAI_API_KEY", "openai"],
  ["google_ai_api_key", "GOOGLE_AI_API_KEY", "google"],
];

const PROVIDERS = ["anthropic", "openai", "google"] as const;
type ProviderName = (typeof PROVIDERS)[number];

/** Variables de entorno originales (antes de aplicar llaves guardadas). */
const original = {
  provider: process.env.LLM_PROVIDER,
  keys: Object.fromEntries(KEY_ENV.map(([, env]) => [env, process.env[env]])) as Record<string, string | undefined>,
};

async function safeSecret(key: LocalSecretKey): Promise<string | undefined> {
  try {
    return (await getSecret(key))?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function hasCredential(provider: ProviderName): boolean {
  switch (provider) {
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_OAUTH_TOKEN);
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_OAUTH_TOKEN || process.env.CODEX_ACCESS_TOKEN);
    case "google":
      return Boolean(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_VERTEX_PROJECT);
  }
}

export interface AIRuntimeStatus {
  configured: boolean;
  provider: string;
  /** Proveedores con credencial disponible. */
  available: ProviderName[];
}

export async function syncAIConfigFromSecrets(): Promise<AIRuntimeStatus> {
  const before = JSON.stringify([process.env.LLM_PROVIDER, ...KEY_ENV.map(([, env]) => process.env[env])]);

  const [storedProvider, ...storedKeys] = await Promise.all([
    safeSecret("llm_provider"),
    ...KEY_ENV.map(([key]) => safeSecret(key)),
  ]);

  KEY_ENV.forEach(([, env], i) => {
    const value = storedKeys[i] ?? original.keys[env];
    if (value) process.env[env] = value;
    else delete process.env[env];
  });

  const available = PROVIDERS.filter(hasCredential);
  const requested = (storedProvider || original.provider || "").toLowerCase() as ProviderName;
  // Si el proveedor pedido no tiene llave, usar el primero que sí la tenga
  // (antes, guardar solo la llave de OpenAI o Gemini dejaba la IA apagada).
  const chosen = PROVIDERS.includes(requested) && hasCredential(requested) ? requested : available[0] ?? (requested || "anthropic");
  process.env.LLM_PROVIDER = chosen;

  const after = JSON.stringify([process.env.LLM_PROVIDER, ...KEY_ENV.map(([, env]) => process.env[env])]);
  if (before !== after) resetProviders();

  const info = getAuthInfo();
  return { configured: info.configured, provider: info.provider, available };
}
