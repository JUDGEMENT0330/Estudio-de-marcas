import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Google retira modelos (p. ej. gemini-2.5-flash para cuentas nuevas). La app
 * debe cambiar sola al modelo sugerido o al mejor Flash disponible.
 */
const generateContent = vi.fn();
vi.mock("@google/genai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const RETIRED = JSON.stringify({
  error: {
    code: 404,
    message:
      "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash for the latest features and improvements.",
    status: "NOT_FOUND",
  },
});

describe("Gemini: modelos nuevos y retirados", () => {
  afterEach(() => {
    generateContent.mockReset();
    delete process.env.GOOGLE_AI_API_KEY;
    delete process.env.GOOGLE_AI_MODEL;
  });

  it("detecta el error y extrae el modelo sugerido", async () => {
    const { isModelUnavailableError, suggestedModelFromError } = await import("@/lib/ai/providers/google");
    const error = Object.assign(new Error(RETIRED), { status: 404 });
    expect(isModelUnavailableError(error)).toBe(true);
    expect(suggestedModelFromError(error)).toBe("gemini-3.8-flash");
    expect(isModelUnavailableError(new Error("quota exceeded"))).toBe(false);
  });

  it("elige el Flash estable más nuevo de la lista", async () => {
    const { pickBestFlashModel } = await import("@/lib/ai/providers/google");
    expect(
      pickBestFlashModel(["models/gemini-2.5-flash", "models/gemini-3.8-flash", "models/gemini-3.9-flash-preview-01", "models/gemini-3.8-flash-lite"]),
    ).toBe("gemini-3.8-flash");
  });

  it("reintenta con el modelo sugerido y lo recuerda", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-key";
    process.env.GOOGLE_AI_MODEL = "gemini-2.5-flash";
    const { googleProvider, resetGoogleClient } = await import("@/lib/ai/providers/google");
    resetGoogleClient();
    generateContent
      .mockRejectedValueOnce(Object.assign(new Error(RETIRED), { status: 404 }))
      .mockResolvedValue({ text: "hola", candidates: [] });

    const first = await googleProvider.complete({ prompt: "x" });
    expect(first.text).toBe("hola");
    expect(generateContent.mock.calls.map((call) => call[0].model)).toEqual(["gemini-2.5-flash", "gemini-3.8-flash"]);

    await googleProvider.complete({ prompt: "y" });
    expect(generateContent.mock.calls[2][0].model).toBe("gemini-3.8-flash");
  });

  it("usa el alias gemini-flash-latest por defecto", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-key";
    const { googleProvider, resetGoogleClient } = await import("@/lib/ai/providers/google");
    resetGoogleClient();
    generateContent.mockResolvedValue({ text: "ok", candidates: [] });
    await googleProvider.complete({ prompt: "x" });
    expect(generateContent.mock.calls[0][0].model).toBe("gemini-flash-latest");
    // Margen para el razonamiento interno: evita respuestas vacías.
    expect(generateContent.mock.calls[0][0].config.maxOutputTokens).toBe(1024 + 8192);
  });

  it("conserva thoughtSignature al reenviar las llamadas a herramientas (Gemini 3)", async () => {
    process.env.GOOGLE_AI_API_KEY = "test-key";
    const { googleProvider, resetGoogleClient } = await import("@/lib/ai/providers/google");
    resetGoogleClient();
    const call = { id: "call-1", name: "fetch_webpage", args: { url: "https://example.com" } };
    generateContent
      .mockResolvedValueOnce({
        functionCalls: [call],
        candidates: [{ content: { role: "model", parts: [{ functionCall: call, thoughtSignature: "firma-123" }] } }],
      })
      .mockResolvedValueOnce({ text: "listo", functionCalls: [], candidates: [] });

    const result = await googleProvider.completeWithTools({
      prompt: "x",
      tools: [{ name: "fetch_webpage", description: "d", input_schema: { type: "object", properties: { url: { type: "string" } } } }],
      executeTools: async () => "contenido",
    });

    expect(result.text).toBe("listo");
    const second = generateContent.mock.calls[1][0].contents;
    expect(second[1].parts[0].thoughtSignature).toBe("firma-123");
    expect(second[2].parts[0].functionResponse).toMatchObject({ id: "call-1", name: "fetch_webpage" });
  });
});
