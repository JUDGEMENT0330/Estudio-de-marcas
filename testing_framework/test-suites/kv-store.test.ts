import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Simula la API REST de Upstash (comandos y /pipeline) en memoria para
 * verificar el almacenamiento que se usa en Vercel.
 */
function createFakeUpstash() {
  const strings = new Map<string, string>();
  const zsets = new Map<string, Map<string, number>>();
  const lists = new Map<string, string[]>();
  const hashes = new Map<string, Map<string, string>>();

  const exec = (cmd: string[]): unknown => {
    const [op, key, ...args] = cmd;
    switch (op.toUpperCase()) {
      case "GET": return strings.get(key) ?? null;
      case "SET": strings.set(key, args[0]); return "OK";
      case "MGET": return [key, ...args].map((k) => strings.get(k) ?? null);
      case "ZADD": {
        const z = zsets.get(key) ?? new Map();
        z.set(args[1], Number(args[0]));
        zsets.set(key, z);
        return 1;
      }
      case "ZRANGE": {
        const entries = [...(zsets.get(key) ?? new Map()).entries()].sort((a, b) => a[1] - b[1]);
        if (args.includes("BYSCORE")) {
          const max = Number(args[1]);
          return entries.filter(([, s]) => s <= max).map(([m]) => m);
        }
        const members = entries.map(([m]) => m);
        return args.includes("REV") ? members.reverse() : members;
      }
      case "LPUSH": lists.set(key, [args[0], ...(lists.get(key) ?? [])]); return 1;
      case "LTRIM": lists.set(key, (lists.get(key) ?? []).slice(Number(args[0]), Number(args[1]) + 1)); return "OK";
      case "LRANGE": return lists.get(key) ?? [];
      case "HSET": { const h = hashes.get(key) ?? new Map(); h.set(args[0], args[1]); hashes.set(key, h); return 1; }
      case "HGET": return hashes.get(key)?.get(args[0]) ?? null;
      case "HVALS": return [...(hashes.get(key)?.values() ?? [])];
      case "HDEL": hashes.get(key)?.delete(args[0]); return 1;
      default: throw new Error(`Comando no soportado en el mock: ${op}`);
    }
  };

  return vi.fn(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const payload = url.endsWith("/pipeline")
      ? (body as string[][]).map((c) => ({ result: exec(c) }))
      : { result: exec(body as string[]) };
    return new Response(JSON.stringify(payload), { status: 200 });
  });
}

describe("KV store (Vercel)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("KV_REST_API_URL", "https://fake-upstash.test");
    vi.stubEnv("KV_REST_API_TOKEN", "token-de-prueba");
    vi.stubGlobal("fetch", createFakeUpstash());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("selects the KV backend when KV credentials exist", async () => {
    const { getStorageBackend } = await import("@/lib/runtime");
    expect(getStorageBackend()).toBe("kv");
  });

  it("stores, updates and lists reports newest first", async () => {
    const { createKvDb } = await import("@/lib/db/kv-store");
    const db = createKvDb();
    const user = await db.getLocalWorkspaceUser();
    expect(await db.getUserByEmail(user.email)).toMatchObject({ id: user.id });

    const first = await db.createReport({ user_id: user.id, type: "audit", input: { businessName: "Primero" } });
    await new Promise((r) => setTimeout(r, 5));
    const second = await db.createReport({ user_id: user.id, type: "audit", input: { businessName: "Segundo" } });

    await db.updateReport(first.id, { status: "completed", scores: { overall_score: 80 } as never });
    expect((await db.getReport(first.id))?.status).toBe("completed");
    expect(await db.getReportPublic(second.id)).toBeUndefined();

    const list = await db.getReportsByUser(user.id);
    expect(list.map((r) => (r.input as { businessName: string }).businessName)).toEqual(["Segundo", "Primero"]);

    await db.trackUsage({ user_id: user.id, action: "audit", credits_consumed: 1 });
    expect(await db.getMonthlyUsageCount(user.id, "audit")).toBe(1);
  });

  it("encrypts secrets in KV and reads them back", async () => {
    vi.stubEnv("APP_ENCRYPTION_KEY", "a".repeat(64));
    const secrets = await import("@/lib/config/local-secrets");
    await secrets.setSecret("google_places_api_key", "Google Places", "google", "AIza-secreto-123456");
    expect(await secrets.getSecret("google_places_api_key")).toBe("AIza-secreto-123456");
    const meta = await secrets.listSecretMetadata();
    expect(meta[0]).toMatchObject({ key: "google_places_api_key", configured: true });
    expect(JSON.stringify(meta)).not.toContain("AIza-secreto-123456");
    await secrets.deleteSecret("google_places_api_key");
    expect(await secrets.getSecret("google_places_api_key")).toBeUndefined();
  });
});
