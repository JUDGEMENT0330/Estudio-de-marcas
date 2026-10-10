import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Las llaves de IA guardadas en Configuración deben llegar a los proveedores
 * y, si el proveedor elegido no tiene llave, usarse uno que sí la tenga.
 */
const stored: Record<string, string | undefined> = {};

vi.mock("@/lib/config/local-secrets", () => ({
  getSecret: vi.fn(async (key: string) => stored[key]),
}));

const ENV_KEYS = ["LLM_PROVIDER", "ANTHROPIC_API_KEY", "ANTHROPIC_OAUTH_TOKEN", "OPENAI_API_KEY", "OPENAI_OAUTH_TOKEN", "CODEX_ACCESS_TOKEN", "GOOGLE_AI_API_KEY", "GEMINI_API_KEY", "GOOGLE_VERTEX_PROJECT"];
const saved: Record<string, string | undefined> = {};

describe("syncAIConfigFromSecrets", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    for (const key of Object.keys(stored)) delete stored[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("usa la llave de Gemini guardada aunque LLM_PROVIDER no esté definido", async () => {
    stored.google_ai_api_key = "gemini-test-key";
    const { syncAIConfigFromSecrets } = await import("@/lib/ai/runtime-config");
    const status = await syncAIConfigFromSecrets();
    expect(process.env.GOOGLE_AI_API_KEY).toBe("gemini-test-key");
    expect(status.provider).toBe("google");
    expect(status.available).toEqual(["google"]);
  });

  it("respeta el proveedor elegido cuando tiene llave", async () => {
    stored.openai_api_key = "sk-openai";
    stored.anthropic_api_key = "sk-ant";
    stored.llm_provider = "openai";
    const { syncAIConfigFromSecrets } = await import("@/lib/ai/runtime-config");
    const status = await syncAIConfigFromSecrets();
    expect(status.provider).toBe("openai");
    expect(status.available).toEqual(["anthropic", "openai"]);
  });

  it("cambia a un proveedor con llave si el elegido no tiene", async () => {
    stored.llm_provider = "anthropic";
    stored.openai_api_key = "sk-openai";
    const { syncAIConfigFromSecrets } = await import("@/lib/ai/runtime-config");
    expect((await syncAIConfigFromSecrets()).provider).toBe("openai");
  });

  it("reporta IA no configurada cuando no hay llaves", async () => {
    const { syncAIConfigFromSecrets } = await import("@/lib/ai/runtime-config");
    const status = await syncAIConfigFromSecrets();
    expect(status.available).toEqual([]);
  });
});
