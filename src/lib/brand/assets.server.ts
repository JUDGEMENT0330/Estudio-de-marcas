import fs from "node:fs";
import path from "node:path";

/**
 * Lee los activos de marca desde /public/brand para incrustarlos en los
 * documentos generados en el servidor. Se cachean en memoria.
 */
const cache = new Map<string, Buffer | null>();

export type BrandAssetName = "escudo" | "icono-footer" | "firma-sello";

export function readBrandAsset(name: BrandAssetName): Buffer | null {
  if (cache.has(name)) return cache.get(name) ?? null;
  const candidates = [
    path.join(process.cwd(), "public", "brand", `${name}.png`),
    path.join(__dirname, "..", "..", "..", "public", "brand", `${name}.png`),
  ];
  for (const file of candidates) {
    try {
      const data = fs.readFileSync(file);
      cache.set(name, data);
      return data;
    } catch {
      // probar siguiente ruta
    }
  }
  cache.set(name, null);
  return null;
}

export function brandAssetDataUri(name: BrandAssetName): string | null {
  const data = readBrandAsset(name);
  return data ? `data:image/png;base64,${data.toString("base64")}` : null;
}
