import { getKvConfig } from "@/lib/runtime";

/**
 * Cliente mínimo para la API REST de Upstash Redis (compatible con Vercel KV /
 * Upstash del Marketplace de Vercel). Usa POST con el comando en el cuerpo, de
 * modo que los reportes grandes no quedan limitados por la longitud de la URL.
 */

type KvValue = string | number;

export class KvError extends Error {}

async function call<T>(body: unknown, pathSuffix = ""): Promise<T> {
  const config = getKvConfig();
  if (!config) throw new KvError("El almacén KV no está configurado.");

  const response = await fetch(`${config.url}${pathSuffix}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : response.statusText;
    throw new KvError(`Error KV (${response.status}): ${message}`);
  }
  return data as T;
}

export async function kvCommand<T = unknown>(...args: KvValue[]): Promise<T> {
  const data = await call<{ result?: T; error?: string }>(args.map(String));
  if (data?.error) throw new KvError(data.error);
  return data.result as T;
}

export async function kvPipeline(commands: KvValue[][]): Promise<unknown[]> {
  if (commands.length === 0) return [];
  const data = await call<Array<{ result?: unknown; error?: string }>>(
    commands.map((command) => command.map(String)),
    "/pipeline",
  );
  return data.map((entry) => {
    if (entry?.error) throw new KvError(entry.error);
    return entry?.result;
  });
}

export async function kvGetJson<T>(key: string): Promise<T | undefined> {
  const raw = await kvCommand<string | null>("GET", key);
  if (raw == null || raw === "") return undefined;
  return JSON.parse(raw) as T;
}

export async function kvSetJson(key: string, value: unknown): Promise<void> {
  await kvCommand("SET", key, JSON.stringify(value));
}
