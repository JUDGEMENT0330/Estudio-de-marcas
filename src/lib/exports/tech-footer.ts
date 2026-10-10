import zlib from "node:zlib";
import type { DocImage } from "./doc-image";

/**
 * Banda de pie de página con estética tecnológica (pista de circuito con
 * nodos, trazas a 45°, paquetes de datos y un chip hexagonal al centro).
 *
 * Se dibuja en tiempo de ejecución con los colores de la marca y se codifica
 * como PNG sin dependencias, para usarla igual en PDF, Word y PowerPoint.
 */

export const TECH_FOOTER_WIDTH = 1800;
export const TECH_FOOTER_HEIGHT = 60;

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const clean = hex.replace(/^#/, "");
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) || 0) as RGB;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
}

class Canvas {
  readonly px: Float32Array;
  constructor(readonly w: number, readonly h: number) {
    this.px = new Float32Array(w * h * 4);
  }

  /** Mezcla "over" con alfa premultiplicado implícito. */
  blend(x: number, y: number, color: RGB, alpha: number) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const a0 = this.px[i + 3];
    const a = alpha + a0 * (1 - alpha);
    if (a <= 0) return;
    for (let c = 0; c < 3; c += 1) {
      this.px[i + c] = (color[c] * alpha + this.px[i + c] * a0 * (1 - alpha)) / a;
    }
    this.px[i + 3] = a;
  }

  /** Segmento con extremos redondeados y antialiasing por distancia. */
  line(x1: number, y1: number, x2: number, y2: number, width: number, color: (x: number) => RGB, alpha: (x: number) => number = () => 1) {
    const r = width / 2;
    const minX = Math.floor(Math.min(x1, x2) - r - 1);
    const maxX = Math.ceil(Math.max(x1, x2) + r + 1);
    const minY = Math.floor(Math.min(y1, y2) - r - 1);
    const maxY = Math.ceil(Math.max(y1, y2) + r + 1);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
        const d = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
        const coverage = Math.max(0, Math.min(1, r + 0.5 - d));
        if (coverage > 0) this.blend(x, y, color(px), coverage * alpha(px));
      }
    }
  }

  circle(cx: number, cy: number, radius: number, color: RGB, alpha = 1, ring?: number) {
    for (let y = Math.floor(cy - radius - 2); y <= Math.ceil(cy + radius + 2); y += 1) {
      for (let x = Math.floor(cx - radius - 2); x <= Math.ceil(cx + radius + 2); x += 1) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const coverage = ring
          ? Math.max(0, Math.min(1, ring / 2 + 0.5 - Math.abs(d - radius)))
          : Math.max(0, Math.min(1, radius + 0.5 - d));
        if (coverage > 0) this.blend(x, y, color, coverage * alpha);
      }
    }
  }

  polygon(points: [number, number][], fill: RGB, alpha = 1) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)) - 1; y <= Math.ceil(Math.max(...ys)) + 1; y += 1) {
      for (let x = Math.floor(Math.min(...xs)) - 1; x <= Math.ceil(Math.max(...xs)) + 1; x += 1) {
        // Supermuestreo 4×4 para bordes suaves.
        let hits = 0;
        for (let sy = 0; sy < 4; sy += 1) {
          for (let sx = 0; sx < 4; sx += 1) {
            if (inside(points, x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hits += 1;
          }
        }
        if (hits) this.blend(x, y, fill, (hits / 16) * alpha);
      }
    }
  }

  toPng(): Buffer {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y += 1) {
      const row = y * (this.w * 4 + 1);
      raw[row] = 0;
      for (let x = 0; x < this.w; x += 1) {
        const i = (y * this.w + x) * 4;
        const o = row + 1 + x * 4;
        raw[o] = Math.round(this.px[i]);
        raw[o + 1] = Math.round(this.px[i + 1]);
        raw[o + 2] = Math.round(this.px[i + 2]);
        raw[o + 3] = Math.round(this.px[i + 3] * 255);
      }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0);
    ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; // profundidad
    ihdr[9] = 6; // RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

function inside(points: [number, number][], x: number, y: number): boolean {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
  }
  return result;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const cache = new Map<string, DocImage>();

/**
 * Banda tecnológica en los colores de la marca.
 * @param primary color principal (hex sin #)
 * @param accent color de acento (hex sin #)
 * @param blue color intermedio del degradado (hex sin #)
 */
export function techFooterBand(primary: string, accent: string, blue: string): DocImage {
  const key = `${primary}-${accent}-${blue}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const W = TECH_FOOTER_WIDTH;
  const H = TECH_FOOTER_HEIGHT;
  const cv = new Canvas(W, H);
  const p = hexToRgb(primary);
  const a = hexToRgb(accent);
  const b = hexToRgb(blue);
  const railY = 30;
  const cx = W / 2;
  const hexR = 17;

  // Degradado principal → azul → acento a lo largo de la pista.
  const gradient = (x: number): RGB => {
    const t = x / W;
    return t < 0.5 ? mix(p, b, t * 2) : mix(b, a, (t - 0.5) * 2);
  };
  // Desvanecido en los extremos para que la banda "flote".
  const fade = (x: number) => Math.min(1, x / (W * 0.06), (W - x) / (W * 0.06));

  // Pista principal (interrumpida por el chip central).
  cv.line(0, railY, cx - hexR - 6, railY, 3, gradient, fade);
  cv.line(cx + hexR + 6, railY, W, railY, 3, gradient, fade);

  // Trazas de circuito a 45° que terminan en nodos huecos.
  const traces: [number, -1 | 1, number][] = [
    [0.1, -1, 70], [0.19, 1, 40], [0.28, -1, 110], [0.39, 1, 55],
    [0.61, -1, 55], [0.72, 1, 110], [0.81, -1, 40], [0.9, 1, 70],
  ];
  for (const [fx, dir, run] of traces) {
    const x0 = W * fx;
    const rise = 14;
    const y1 = railY + dir * rise;
    const color = gradient(x0);
    cv.line(x0, railY, x0 + rise, y1, 1.6, () => color, () => 0.75);
    cv.line(x0 + rise, y1, x0 + rise + run, y1, 1.6, () => color, () => 0.75);
    cv.circle(x0 + rise + run + 3.5, y1, 3.5, color, 0.9, 1.6);
    cv.circle(x0, railY, 4.2, color, 1);
  }

  // Paquetes de datos viajando hacia el centro.
  for (const fx of [0.33, 0.35, 0.445, 0.455, 0.545, 0.555, 0.65, 0.67]) {
    const x = W * fx;
    const color = gradient(x);
    cv.polygon([[x - 3, railY - 3], [x + 3, railY - 3], [x + 3, railY + 3], [x - 3, railY + 3]], color, 0.95);
  }

  // Chip hexagonal central.
  const hex = (r: number): [number, number][] =>
    Array.from({ length: 6 }, (_, i) => {
      const angle = (Math.PI / 3) * i;
      return [cx + r * Math.cos(angle), railY + r * Math.sin(angle)] as [number, number];
    });
  cv.polygon(hex(hexR + 1.5), p, 1);
  cv.polygon(hex(hexR - 1.5), [255, 255, 255], 1);
  cv.polygon(hex(hexR - 5), a, 1);
  cv.circle(cx, railY, 3.2, [255, 255, 255], 1);
  // Conectores del chip.
  cv.line(cx - hexR - 6, railY, cx - hexR, railY, 3, () => p);
  cv.line(cx + hexR, railY, cx + hexR + 6, railY, 3, () => a);

  const image: DocImage = { data: cv.toPng(), type: "png", width: W, height: H };
  cache.set(key, image);
  return image;
}
