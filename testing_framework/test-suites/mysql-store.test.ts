import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integración real contra MySQL/MariaDB (la base de datos del hosting).
 * Se ejecuta solo si MYSQL_TEST_URL está definida, por ejemplo:
 *   MYSQL_TEST_URL=mysql://usuario:clave@127.0.0.1:3306/base npm test
 */
const url = process.env.MYSQL_TEST_URL;

describe("runtime MySQL config", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("parses URL-encoded credentials and prefers MySQL over KV", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://u123_app:Clave%23Prueba1@srv123.hstgr.io:3306/u123_estudio");
    vi.stubEnv("KV_REST_API_URL", "https://kv.test");
    vi.stubEnv("KV_REST_API_TOKEN", "x");
    const { getMysqlConfig, getStorageBackend } = await import("@/lib/runtime");
    expect(getMysqlConfig()).toMatchObject({
      host: "srv123.hstgr.io",
      port: 3306,
      user: "u123_app",
      password: "Clave#Prueba1",
      database: "u123_estudio",
    });
    expect(getStorageBackend()).toBe("mysql");
  });

  it("accepts separate MYSQL_* variables", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("MYSQL_HOST", "127.0.0.1");
    vi.stubEnv("MYSQL_USER", "app");
    vi.stubEnv("MYSQL_PASSWORD", "secreto");
    vi.stubEnv("MYSQL_DATABASE", "estudio");
    const { getMysqlConfig } = await import("@/lib/runtime");
    expect(getMysqlConfig()).toMatchObject({ host: "127.0.0.1", port: 3306, database: "estudio" });
  });
});

describe.skipIf(!url)("MySQL store (integración)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("APP_ENCRYPTION_KEY", "b".repeat(64));
  });

  afterEach(async () => {
    const { closeMysqlPool } = await import("@/lib/mysql/pool");
    await closeMysqlPool();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    vi.stubEnv("DATABASE_URL", url!);
    const { getMysqlPool, closeMysqlPool } = await import("@/lib/mysql/pool");
    const pool = await getMysqlPool();
    for (const table of ["edm_reports", "edm_api_usage", "edm_widget_leads", "edm_secrets", "edm_users"]) {
      await pool.query(`DELETE FROM ${table}`);
    }
    await closeMysqlPool();
    vi.unstubAllEnvs();
  });

  it("creates schema, stores reports with accents and large JSON, lists newest first", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const user = await (db as unknown as { getLocalWorkspaceUser(): Promise<{ id: string }> }).getLocalWorkspaceUser();

    const first = await db.createReport({ user_id: user.id, type: "audit", input: { businessName: "Perfumería Áurea" } });
    await new Promise((r) => setTimeout(r, 10));
    const second = await db.createReport({ user_id: user.id, type: "audit", input: { businessName: "Café Ñandú" } });

    const big = { notes: "x".repeat(2_000_000), emoji: "✨" };
    await db.updateReport(first.id, { status: "completed", result: big as never });

    const stored = await db.getReport(first.id);
    expect(stored?.status).toBe("completed");
    expect((stored?.result as unknown as typeof big).notes.length).toBe(2_000_000);
    expect((stored?.result as unknown as typeof big).emoji).toBe("✨");

    const list = await db.getReportsByUser(user.id);
    expect(list.slice(0, 2).map((r) => r.id)).toEqual([second.id, first.id]);
    expect((list[1].input as { businessName: string }).businessName).toBe("Perfumería Áurea");

    await db.updateUser(user.id, { white_label_config: { company_name: "CYBER VALTORIX SAS. DE C.V." } });
    expect((await db.getUser(user.id))?.white_label_config?.company_name).toBe("CYBER VALTORIX SAS. DE C.V.");

    await db.trackUsage({ user_id: user.id, action: "audit", credits_consumed: 1 });
    expect(await db.getMonthlyUsageCount(user.id, "audit")).toBe(1);
  });

  it("stores encrypted API keys in MySQL", async () => {
    const secrets = await import("@/lib/config/local-secrets");
    await secrets.setSecret("google_places_api_key", "Google Places", "google", "AIza-mysql-987654");
    await secrets.setSecret("google_places_api_key", "Google Places", "google", "AIza-mysql-reemplazo");
    expect(await secrets.getSecret("google_places_api_key")).toBe("AIza-mysql-reemplazo");
    await secrets.updateSecretTestStatus("google_places_api_key", "connected", "ok");
    const meta = await secrets.listSecretMetadata();
    expect(meta[0]).toMatchObject({ key: "google_places_api_key", status: "connected" });

    const { getMysqlPool } = await import("@/lib/mysql/pool");
    const [raw] = await (await getMysqlPool()).query("SELECT encrypted_value FROM edm_secrets");
    expect(JSON.stringify(raw)).not.toContain("AIza-mysql-reemplazo");

    await secrets.deleteSecret("google_places_api_key");
    expect(await secrets.getSecret("google_places_api_key")).toBeUndefined();
  });
});
