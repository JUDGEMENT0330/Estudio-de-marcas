import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "@/lib/mysql/pool";
import type {
  ApiUsage,
  AuditInput,
  Report,
  ReportType,
  ScoutInput,
  UsageAction,
  User,
  WidgetLead,
} from "./types";
import type { LocalSqliteDb } from "./local-sqlite";

/**
 * Almacenamiento en MySQL (base de datos del hosting de Hostinger u otro
 * proveedor). Mismo contrato que SQLite/KV; el esquema se crea solo.
 */

const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
const LOCAL_USER_EMAIL = "local@cybervaltorix.local";
const LOCAL_CREDITS = 999999;
const STALE_PROCESSING_MS = 20 * 60 * 1000;

const USER_COLUMNS = new Set([
  "auth_user_id", "email", "name", "plan", "stripe_customer_id",
  "audit_credits_remaining", "scout_credits_remaining", "widget_api_key",
  "white_label_config", "updated_at",
]);
const REPORT_COLUMNS = new Set([
  "user_id", "type", "status", "input", "result", "scores", "pdf_storage_path",
  "email_sent_at", "expires_at", "is_widget_generated", "updated_at",
]);
const JSON_COLUMNS = new Set(["white_label_config", "input", "result", "scores", "metadata"]);

const nowIso = () => new Date().toISOString();

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === "") return fallback;
  const parsed = JSON.parse(String(value));
  return parsed == null ? fallback : (parsed as T);
}

function mapUser(row: RowDataPacket): User {
  return {
    id: row.id,
    auth_user_id: row.auth_user_id ?? undefined,
    email: row.email,
    name: row.name ?? undefined,
    plan: row.plan,
    stripe_customer_id: row.stripe_customer_id ?? undefined,
    audit_credits_remaining: Number(row.audit_credits_remaining),
    scout_credits_remaining: Number(row.scout_credits_remaining),
    widget_api_key: row.widget_api_key ?? undefined,
    white_label_config: parseJson(row.white_label_config, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapReport(row: RowDataPacket): Report {
  const report = {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    status: row.status,
    input: parseJson(row.input, {}),
    result: parseJson(row.result, undefined),
    scores: parseJson(row.scores, undefined),
    pdf_storage_path: row.pdf_storage_path ?? undefined,
    email_sent_at: row.email_sent_at ?? undefined,
    expires_at: row.expires_at ?? undefined,
    is_widget_generated: Number(row.is_widget_generated) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  } as Report;
  if (
    (report.status === "processing" || report.status === "queued") &&
    !report.result &&
    Date.now() - new Date(report.updated_at).getTime() > STALE_PROCESSING_MS
  ) {
    report.status = "failed";
  }
  return report;
}

function toColumns(data: Record<string, unknown>, allowed: Set<string>): [string[], unknown[]] {
  const cols: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || !allowed.has(key)) continue;
    cols.push(`\`${key}\` = ?`);
    if (JSON_COLUMNS.has(key)) values.push(JSON.stringify(value ?? null));
    else if (key === "is_widget_generated") values.push(value ? 1 : 0);
    else values.push(value);
  }
  return [cols, values];
}

async function rows(sql: string, params: unknown[] = []): Promise<RowDataPacket[]> {
  const pool = await getMysqlPool();
  const [result] = await pool.query<RowDataPacket[]>(sql, params);
  return result;
}

async function run(sql: string, params: unknown[] = []): Promise<void> {
  const pool = await getMysqlPool();
  await pool.query(sql, params);
}

export function createMysqlDb(): LocalSqliteDb {
  const getUserBy = async (column: string, value: string) => {
    if (!value) return undefined;
    const found = await rows(`SELECT * FROM edm_users WHERE \`${column}\` = ? LIMIT 1`, [value]);
    return found[0] ? mapUser(found[0]) : undefined;
  };

  async function insertUser(user: User): Promise<void> {
    await run(
      `INSERT INTO edm_users (id, auth_user_id, email, name, plan, stripe_customer_id,
        audit_credits_remaining, scout_credits_remaining, widget_api_key, white_label_config,
        created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id, user.auth_user_id ?? null, user.email, user.name ?? null, user.plan,
        user.stripe_customer_id ?? null, user.audit_credits_remaining, user.scout_credits_remaining,
        user.widget_api_key ?? null, JSON.stringify(user.white_label_config ?? {}),
        user.created_at, user.updated_at,
      ],
    );
  }

  async function getReport(id: string): Promise<Report | undefined> {
    const found = await rows("SELECT * FROM edm_reports WHERE id = ? LIMIT 1", [id]);
    return found[0] ? mapReport(found[0]) : undefined;
  }

  const db: LocalSqliteDb = {
    async getLocalWorkspaceUser() {
      const existing = await getUserBy("id", LOCAL_USER_ID);
      if (existing) return existing;
      const now = nowIso();
      const user: User = {
        id: LOCAL_USER_ID,
        email: LOCAL_USER_EMAIL,
        name: "Espacio de trabajo",
        plan: "agency",
        audit_credits_remaining: LOCAL_CREDITS,
        scout_credits_remaining: LOCAL_CREDITS,
        white_label_config: {},
        created_at: now,
        updated_at: now,
      };
      try {
        await insertUser(user);
      } catch (error) {
        // Dos invocaciones simultáneas pueden intentar crearlo a la vez.
        const again = await getUserBy("id", LOCAL_USER_ID);
        if (again) return again;
        throw error;
      }
      return user;
    },

    close() {},

    getUser: (id) => getUserBy("id", id),
    getUserByAuthUserId: (value) => getUserBy("auth_user_id", value),
    getUserByEmail: (value) => getUserBy("email", value),
    getUserByWidgetApiKey: (value) => getUserBy("widget_api_key", value),
    getUserByStripeCustomerId: (value) => getUserBy("stripe_customer_id", value),

    async createUser(data) {
      const now = nowIso();
      const user: User = {
        id: data.id ?? randomUUID(),
        auth_user_id: data.auth_user_id,
        email: data.email,
        name: data.name,
        plan: data.plan ?? "agency",
        stripe_customer_id: data.stripe_customer_id,
        audit_credits_remaining: LOCAL_CREDITS,
        scout_credits_remaining: LOCAL_CREDITS,
        widget_api_key: data.widget_api_key,
        white_label_config: {},
        created_at: now,
        updated_at: now,
      };
      await insertUser(user);
      return user;
    },

    async updateUser(id, data) {
      const [cols, values] = toColumns({ ...data, updated_at: nowIso() }, USER_COLUMNS);
      if (cols.length) await run(`UPDATE edm_users SET ${cols.join(", ")} WHERE id = ?`, [...values, id]);
      return getUserBy("id", id);
    },

    getReport,

    async getReportPublic(id) {
      const report = await getReport(id);
      if (!report || report.status !== "completed") return undefined;
      if (report.expires_at && new Date(report.expires_at) < new Date()) return undefined;
      return report;
    },

    async getReportsByUser(userId) {
      const found = await rows("SELECT * FROM edm_reports WHERE user_id = ? ORDER BY created_at DESC", [userId]);
      return found.map(mapReport);
    },

    async getExpiredReports(now) {
      const found = await rows(
        "SELECT * FROM edm_reports WHERE expires_at IS NOT NULL AND expires_at < ? AND status <> 'failed'",
        [now],
      );
      return found.map(mapReport);
    },

    async createReport(data: {
      user_id: string;
      type: ReportType;
      input: AuditInput | ScoutInput;
      is_widget_generated?: boolean;
    }) {
      const now = nowIso();
      const id = randomUUID();
      await run(
        `INSERT INTO edm_reports (id, user_id, type, status, input, is_widget_generated, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)`,
        [id, data.user_id, data.type, JSON.stringify(data.input), data.is_widget_generated ? 1 : 0, now, now],
      );
      const report = await getReport(id);
      if (!report) throw new Error(`No se pudo crear el reporte ${id}`);
      return report;
    },

    async updateReport(id, data) {
      const [cols, values] = toColumns({ ...data, updated_at: nowIso() }, REPORT_COLUMNS);
      if (cols.length) await run(`UPDATE edm_reports SET ${cols.join(", ")} WHERE id = ?`, [...values, id]);
      return getReport(id);
    },

    async trackUsage(data: {
      user_id: string;
      action: UsageAction;
      credits_consumed: number;
      stripe_metered_event_id?: string;
      metadata?: Record<string, unknown>;
    }) {
      const usage = {
        id: randomUUID(),
        user_id: data.user_id,
        action: data.action,
        credits_consumed: data.credits_consumed,
        stripe_metered_event_id: data.stripe_metered_event_id,
        created_at: nowIso(),
        metadata: data.metadata ?? {},
      } as ApiUsage;
      await run(
        `INSERT INTO edm_api_usage (id, user_id, action, credits_consumed, stripe_metered_event_id, created_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [usage.id, usage.user_id, usage.action, usage.credits_consumed, data.stripe_metered_event_id ?? null, usage.created_at, JSON.stringify(usage.metadata)],
      );
      return usage;
    },

    async getUserUsage(userId) {
      const found = await rows("SELECT * FROM edm_api_usage WHERE user_id = ? ORDER BY created_at DESC", [userId]);
      return found.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        action: row.action,
        credits_consumed: Number(row.credits_consumed),
        stripe_metered_event_id: row.stripe_metered_event_id ?? undefined,
        created_at: row.created_at,
        metadata: parseJson(row.metadata, {}),
      })) as ApiUsage[];
    },

    async getMonthlyUsageCount(userId, action) {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const found = await rows(
        "SELECT COUNT(*) AS total FROM edm_api_usage WHERE user_id = ? AND action = ? AND created_at >= ?",
        [userId, action, start],
      );
      return Number(found[0]?.total ?? 0);
    },

    async createWidgetLead(data: Omit<WidgetLead, "id" | "created_at">) {
      const lead: WidgetLead = { ...data, id: randomUUID(), created_at: nowIso() };
      await run(
        `INSERT INTO edm_widget_leads (id, user_id, visitor_email, visitor_name, business_audited, report_id, created_at, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [lead.id, lead.user_id, lead.visitor_email, lead.visitor_name ?? null, lead.business_audited, lead.report_id ?? null, lead.created_at, lead.delivered_at ?? null],
      );
      return lead;
    },

    async getWidgetLeads(userId) {
      const found = await rows("SELECT * FROM edm_widget_leads WHERE user_id = ? ORDER BY created_at DESC", [userId]);
      return found.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        visitor_email: row.visitor_email,
        visitor_name: row.visitor_name ?? undefined,
        business_audited: row.business_audited,
        report_id: row.report_id ?? undefined,
        created_at: row.created_at,
        delivered_at: row.delivered_at ?? undefined,
      }));
    },
  };

  return db;
}
