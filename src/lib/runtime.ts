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

export type StorageBackend = "kv" | "sqlite" | "sqlite-efimero";

export function getStorageBackend(): StorageBackend {
  if (process.env.STORAGE_BACKEND === "sqlite") {
    return isVercel() ? "sqlite-efimero" : "sqlite";
  }
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
