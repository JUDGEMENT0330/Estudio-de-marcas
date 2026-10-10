import { randomUUID } from "crypto";
import { kvCommand, kvGetJson, kvPipeline, kvSetJson } from "@/lib/kv/client";
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
import type { DbInterface } from "./index";
import type { LocalSqliteDb } from "./local-sqlite";

/**
 * Almacenamiento persistente sobre Redis (Upstash / Vercel KV).
 *
 * Pensado para Vercel, donde el disco es efímero y cada invocación puede caer
 * en una instancia distinta: el reporte que una función escribe en segundo
 * plano debe ser visible para la función que responde al sondeo del cliente.
 */

const PREFIX = process.env.KV_PREFIX?.trim() || "edm";
const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
const LOCAL_USER_EMAIL = "local@cybervaltorix.local";
const LOCAL_CREDITS = 999999;
// En Vercel una función no vive más de maxDuration; si un reporte sigue en
// "processing" pasado este margen, la función que lo generaba ya murió.
const STALE_PROCESSING_MS = 20 * 60 * 1000;

const k = {
  user: (id: string) => `${PREFIX}:user:${id}`,
  userIdx: (field: string, value: string) => `${PREFIX}:user-idx:${field}:${value.toLowerCase()}`,
  report: (id: string) => `${PREFIX}:report:${id}`,
  userReports: (userId: string) => `${PREFIX}:reports:user:${userId}`,
  expiring: () => `${PREFIX}:reports:expiring`,
  usage: (userId: string) => `${PREFIX}:usage:${userId}`,
  leads: (userId: string) => `${PREFIX}:leads:${userId}`,
};

const nowIso = () => new Date().toISOString();

const USER_INDEX_FIELDS = [
  "auth_user_id",
  "email",
  "widget_api_key",
  "stripe_customer_id",
] as const;

async function indexUser(user: User): Promise<void> {
  const commands: (string | number)[][] = [["SET", k.user(user.id), JSON.stringify(user)]];
  for (const field of USER_INDEX_FIELDS) {
    const value = user[field];
    if (typeof value === "string" && value) {
      commands.push(["SET", k.userIdx(field, value), user.id]);
    }
  }
  await kvPipeline(commands);
}

async function getUserByIndex(field: string, value: string): Promise<User | undefined> {
  if (!value) return undefined;
  const id = await kvCommand<string | null>("GET", k.userIdx(field, value));
  return id ? kvGetJson<User>(k.user(id)) : undefined;
}

function reconcile(report: Report): Report {
  if (
    (report.status === "processing" || report.status === "queued") &&
    !report.result &&
    Date.now() - new Date(report.updated_at).getTime() > STALE_PROCESSING_MS
  ) {
    return { ...report, status: "failed" };
  }
  return report;
}

export function createKvDb(): LocalSqliteDb {
  const getUser = (id: string) => kvGetJson<User>(k.user(id));

  async function getLocalWorkspaceUser(): Promise<User> {
    const existing = await getUser(LOCAL_USER_ID);
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
    await indexUser(user);
    return user;
  }

  async function getReport(id: string): Promise<Report | undefined> {
    const report = await kvGetJson<Report>(k.report(id));
    return report ? reconcile(report) : undefined;
  }

  const db: LocalSqliteDb = {
    getLocalWorkspaceUser,
    close() {},

    getUser,
    getUserByAuthUserId: (value) => getUserByIndex("auth_user_id", value),
    getUserByEmail: (value) => getUserByIndex("email", value),
    getUserByWidgetApiKey: (value) => getUserByIndex("widget_api_key", value),
    getUserByStripeCustomerId: (value) => getUserByIndex("stripe_customer_id", value),

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
      await indexUser(user);
      return user;
    },

    async updateUser(id, data) {
      const current = await getUser(id);
      if (!current) return undefined;
      const { id: _id, created_at: _created, ...safe } = data;
      const updated: User = { ...current, ...safe, updated_at: nowIso() };
      await indexUser(updated);
      return updated;
    },

    getReport,

    async getReportPublic(id) {
      const report = await getReport(id);
      if (!report || report.status !== "completed") return undefined;
      if (report.expires_at && new Date(report.expires_at) < new Date()) return undefined;
      return report;
    },

    async getReportsByUser(userId) {
      const ids = await kvCommand<string[]>("ZRANGE", k.userReports(userId), 0, -1, "REV");
      if (!ids?.length) return [];
      const raw = await kvCommand<(string | null)[]>("MGET", ...ids.map(k.report));
      return raw
        .filter((value): value is string => Boolean(value))
        .map((value) => reconcile(JSON.parse(value) as Report));
    },

    async getExpiredReports(nowIsoValue) {
      const ids = await kvCommand<string[]>(
        "ZRANGE",
        k.expiring(),
        "-inf",
        new Date(nowIsoValue).getTime(),
        "BYSCORE",
      );
      const reports = await Promise.all((ids ?? []).map(getReport));
      return reports.filter(
        (report): report is Report => Boolean(report) && report!.status !== "failed",
      );
    },

    async createReport(data: {
      user_id: string;
      type: ReportType;
      input: AuditInput | ScoutInput;
      is_widget_generated?: boolean;
    }) {
      const now = nowIso();
      const report: Report = {
        id: randomUUID(),
        user_id: data.user_id,
        type: data.type,
        status: "queued",
        input: data.input,
        is_widget_generated: Boolean(data.is_widget_generated),
        created_at: now,
        updated_at: now,
      };
      await kvPipeline([
        ["SET", k.report(report.id), JSON.stringify(report)],
        ["ZADD", k.userReports(report.user_id), Date.now(), report.id],
      ]);
      return report;
    },

    async updateReport(id, data) {
      const current = await kvGetJson<Report>(k.report(id));
      if (!current) return undefined;
      const { id: _id, created_at: _created, ...safe } = data;
      const updated: Report = { ...current, ...safe, updated_at: nowIso() };
      await kvSetJson(k.report(id), updated);
      if (updated.expires_at) {
        await kvCommand("ZADD", k.expiring(), new Date(updated.expires_at).getTime(), id);
      }
      return reconcile(updated);
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
      await kvPipeline([
        ["LPUSH", k.usage(data.user_id), JSON.stringify(usage)],
        ["LTRIM", k.usage(data.user_id), 0, 4999],
      ]);
      return usage;
    },

    async getUserUsage(userId) {
      const raw = await kvCommand<string[]>("LRANGE", k.usage(userId), 0, -1);
      return (raw ?? []).map((value) => JSON.parse(value) as ApiUsage);
    },

    async getMonthlyUsageCount(userId, action) {
      const now = new Date();
      const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const usage = await db.getUserUsage(userId);
      return usage.filter(
        (item) => item.action === action && new Date(item.created_at).getTime() >= start,
      ).length;
    },

    async createWidgetLead(data: Omit<WidgetLead, "id" | "created_at">) {
      const lead: WidgetLead = { ...data, id: randomUUID(), created_at: nowIso() };
      await kvCommand("LPUSH", k.leads(data.user_id), JSON.stringify(lead));
      return lead;
    },

    async getWidgetLeads(userId) {
      const raw = await kvCommand<string[]>("LRANGE", k.leads(userId), 0, -1);
      return (raw ?? []).map((value) => JSON.parse(value) as WidgetLead);
    },
  };

  return db;
}
