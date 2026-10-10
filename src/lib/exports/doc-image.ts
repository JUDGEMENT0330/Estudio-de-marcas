/**
 * Imágenes para los documentos exportados (logo, firma, pie).
 *
 * Word, PowerPoint, Excel y el PDF solo aceptan PNG y JPEG de forma nativa.
 * Aquí se detecta el formato real por su firma binaria (no por el
 * Content-Type, que muchos hostings envían mal) y, cuando es WebP, GIF, SVG
 * u otro, se intenta convertir a PNG con `sharp` si está disponible.
 */

export type DocImageType = "png" | "jpg";

export interface DocImage {
  data: Buffer;
  type: DocImageType;
  width: number;
  height: number;
}

const MAX_BYTES = 5_000_000;

function pngSize(data: Buffer): { width: number; height: number } | null {
  if (data.length < 24 || data.readUInt32BE(12) !== 0x49484452) return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

/** Recorre los segmentos JPEG hasta el marcador SOFn, que trae el tamaño. */
function jpegSize(data: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = data.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

export function sniffImageType(data: Buffer): DocImageType | "other" {
  if (data.length > 8 && data.readUInt32BE(0) === 0x89504e47) return "png";
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  return "other";
}

/** Convierte cualquier formato a PNG con sharp (si el entorno lo tiene). */
async function convertToPng(data: Buffer): Promise<Buffer | null> {
  try {
    const moduleName = "sharp";
    const mod = await import(/* webpackIgnore: true */ moduleName);
    const sharp = (mod.default ?? mod) as (input: Buffer, options?: Record<string, unknown>) => {
      resize: (options: Record<string, unknown>) => { png: () => { toBuffer: () => Promise<Buffer> } };
    };
    return await sharp(data, { density: 300 }).resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: false }).png().toBuffer();
  } catch {
    return null;
  }
}

/** Normaliza un buffer a una imagen utilizable en los documentos. */
export async function toDocImage(raw: Buffer | null | undefined): Promise<DocImage | null> {
  if (!raw || raw.length === 0 || raw.length > MAX_BYTES) return null;
  let data = raw;
  let type = sniffImageType(data);
  if (type === "other") {
    const converted = await convertToPng(data);
    if (!converted) return null;
    data = converted;
    type = "png";
  }
  const size = type === "png" ? pngSize(data) : jpegSize(data);
  if (!size || size.width <= 0 || size.height <= 0) return null;
  return { data, type, ...size };
}

/**
 * Carga una imagen desde una URL https o un data URI (PNG, JPEG, WebP, SVG…).
 * Devuelve null si no se puede usar en los documentos.
 */
export async function loadDocImage(source: string | undefined | null): Promise<DocImage | null> {
  const value = source?.trim();
  if (!value) return null;
  try {
    const dataUri = value.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
    if (dataUri) return toDocImage(Buffer.from(dataUri[1], "base64"));
    if (!/^https?:\/\//i.test(value)) return null;
    const response = await fetch(value, {
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5", "User-Agent": "Mozilla/5.0 (EstudioDeMarcas)" },
      redirect: "follow",
    });
    if (!response.ok) return null;
    return toDocImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

/** Data URI listo para @react-pdf o pptxgenjs. */
export function imageDataUri(image: DocImage | null, prefix = "data:"): string | null {
  if (!image) return null;
  const mime = image.type === "jpg" ? "image/jpeg" : "image/png";
  return `${prefix}${mime};base64,${image.data.toString("base64")}`;
}
