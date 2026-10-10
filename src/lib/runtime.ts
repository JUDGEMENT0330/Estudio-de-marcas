import path from "node:path";

/**
 * Detección del entorno de ejecución.
 *
 * - Local: SQLite en ./data y llave de cifrado en ./.phantom-reach.
 * - Vercel: el sistema de archivos es efímero (solo /tmp es escribible), así
 *   que la persistencia real se delega a un almacén KV (Upstash Redis / Vercel KV)
 *   cuando está configurado.
 */
export function isVercel(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

export interface KvConfig {
  url: string;
  token: string;
}

export function getKvConfig(): KvConfig | null {
  const url = (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    ""
  ).trim();
  const token = (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ""
  ).trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

export function isKvConfigured(): boolean {
  return getKvConfig() !== null;
}

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
}

/**
 * Base de datos MySQL (p. ej. la incluida en el hosting de Hostinger).
 * Acepta DATABASE_URL / MYSQL_URL con formato mysql://usuario:clave@host:3306/base
 * o las variables sueltas MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD,
 * MYSQL_DATABASE. MYSQL_SSL=true activa TLS.
 */
export function getMysqlConfig(): MysqlConfig | null {
  const url = [process.env.MYSQL_URL, process.env.DATABASE_URL]
    .map((value) => value?.trim())
    .find((value) => value && /^mysql:\/\//i.test(value));
  const ssl = /^(1|true|yes|si|sí)$/i.test(process.env.MYSQL_SSL?.trim() ?? "");
  if (url) {
    try {
      const parsed = new URL(url);
      const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
      if (!parsed.hostname || !database) return null;
      return {
        host: parsed.hostname,
        port: Number(parsed.port || 3306),
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database,
        ssl: ssl || parsed.searchParams.get("ssl") === "true",
      };
    } catch {
      return null;
    }
  }
  const host = process.env.MYSQL_HOST?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const database = process.env.MYSQL_DATABASE?.trim();
  if (!host || !user || !database) return null;
  return {
    host,
    port: Number(process.env.MYSQL_PORT?.trim() || 3306),
    user,
    password: process.env.MYSQL_PASSWORD ?? "",
    database,
    ssl,
  };
}

export function isMysqlConfigured(): boolean {
  return getMysqlConfig() !== null;
}

export type StorageBackend = "mysql" | "kv" | "sqlite" | "sqlite-efimero";

export function getStorageBackend(): StorageBackend {
  const forced = process.env.STORAGE_BACKEND?.trim().toLowerCase();
  if (forced === "sqlite") return isVercel() ? "sqlite-efimero" : "sqlite";
  if (forced === "kv" && isKvConfigured()) return "kv";
  if (forced === "mysql" && isMysqlConfigured()) return "mysql";
  if (isMysqlConfigured()) return "mysql";
  if (isKvConfigured()) return "kv";
  return isVercel() ? "sqlite-efimero" : "sqlite";
}

/** Directorio escribible para datos locales (SQLite, llave de instancia). */
export function getDataDir(): string {
  if (process.env.PHANTOM_REACH_DATA_DIR) {
    return path.resolve(process.env.PHANTOM_REACH_DATA_DIR);
  }
  if (isVercel()) return "/tmp/estudio-de-marcas";
  return path.join(process.cwd(), "data");
}

/** Directorio raíz donde vive `.phantom-reach/instance.key`. */
export function getHomeDir(): string {
  if (process.env.PHANTOM_REACH_HOME) return process.env.PHANTOM_REACH_HOME;
  if (isVercel()) return "/tmp/estudio-de-marcas";
  return process.cwd();
}
