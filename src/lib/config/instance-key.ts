import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getHomeDir, getKvConfig, getMysqlConfig, isVercel } from "@/lib/runtime";

function getPhantomHome(): string {
  return getHomeDir();
}

/**
 * Llave explícita por variable de entorno (recomendada en Vercel):
 * APP_ENCRYPTION_KEY = 64 caracteres hex (`openssl rand -hex 32`).
 * Si no existe y hay KV en Vercel, se deriva de forma determinista del token
 * KV para que todas las instancias puedan descifrar las mismas llaves.
 */
function keyFromEnvironment(): Buffer | undefined {
  const explicit = process.env.APP_ENCRYPTION_KEY?.trim();
  if (explicit) {
    if (/^[a-f0-9]{64}$/i.test(explicit)) return Buffer.from(explicit, "hex");
    return crypto.createHash("sha256").update(explicit).digest();
  }
  const mysqlConfig = getMysqlConfig();
  if (isVercel() && mysqlConfig) {
    return crypto
      .createHash("sha256")
      .update(`estudio-de-marcas:${mysqlConfig.host}:${mysqlConfig.user}:${mysqlConfig.password}`)
      .digest();
  }
  const kv = getKvConfig();
  if (isVercel() && kv) {
    return crypto.createHash("sha256").update(`estudio-de-marcas:${kv.token}`).digest();
  }
  return undefined;
}

export function getInstanceKeyPath(): string {
  return path.join(getPhantomHome(), ".phantom-reach", "instance.key");
}

export function loadInstanceKey(): Buffer {
  const fromEnv = keyFromEnvironment();
  if (fromEnv) return fromEnv;

  const keyPath = getInstanceKeyPath();
  const dir = path.dirname(keyPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(keyPath)) {
    const key = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(keyPath, `${key}\n`, { encoding: "utf8", mode: 0o600 });
  }

  const hex = fs.readFileSync(keyPath, "utf8").trim();
  if (!/^[a-f0-9]{64}$/i.test(hex)) {
    throw new Error(
      "Llave de instancia inválida. Elimina .phantom-reach/instance.key y vuelve a ingresar las llaves guardadas."
    );
  }

  return Buffer.from(hex, "hex");
}
