import fs from "node:fs";
import path from "node:path";
import { BRAND, BRAND_COLORS } from "@/lib/brand";
import { readBrandAsset } from "@/lib/brand/assets.server";
import type { AuditInput, Report, WhiteLabelConfig } from "@/lib/db/types";

/**
 * Identidad de marca resuelta para un documento exportado.
 * Valores por defecto: Cyber Valtorix. El usuario puede personalizar razón
 * social, contacto, colores y logo desde Configuración.
 */
export interface DocBrand {
  company: string;
  companyShort: string;
  email: string;
  phone: string;
  website: string;
  signer: string;
  signerRole: string;
  /** Hex sin "#" */
  primary: string;
  accent: string;
  blue: string;
  teal: string;
  text: string;
  logo: Buffer | null;
  footerIcon: Buffer | null;
  /** Firma y sello: solo si existe localmente o por variable de entorno. */
  signature: Buffer | null;
}

function cleanHex(value: string | undefined, fallback: string): string {
  const hex = value?.trim().replace(/^#/, "");
  return hex && /^[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : fallback;
}

async function fetchLogo(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith("data:image/png;base64,")) {
      return Buffer.from(url.slice("data:image/png;base64,".length), "base64");
    }
    if (!/^https:\/\//i.test(url)) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !type.includes("png")) return null;
    const data = Buffer.from(await response.arrayBuffer());
    return data.length > 0 && data.length < 3_000_000 ? data : null;
  } catch {
    return null;
  }
}

function readSignature(): Buffer | null {
  const b64 = process.env.BRAND_SIGNATURE_BASE64?.trim();
  if (b64) {
    try {
      return Buffer.from(b64.replace(/^data:image\/png;base64,/, ""), "base64");
    } catch {
      return null;
    }
  }
  const custom = process.env.BRAND_SIGNATURE_PATH?.trim();
  const candidates = [
    custom,
    path.join(process.cwd(), "private", "firma-sello.png"),
    path.join(process.cwd(), "public", "brand", "firma-sello.png"),
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    try {
      return fs.readFileSync(file);
    } catch {
      // siguiente
    }
  }
  return null;
}

export async function resolveDocBrand(config?: WhiteLabelConfig): Promise<DocBrand> {
  const customLogo = config?.logo_url ? await fetchLogo(config.logo_url) : null;
  return {
    company: config?.company_name?.trim() || BRAND.company,
    companyShort: BRAND.companyShort,
    email: config?.contact_email?.trim() || BRAND.email,
    phone: config?.contact_phone?.trim() || BRAND.phone,
    website: BRAND.website,
    signer: BRAND.signer,
    signerRole: BRAND.signerRole,
    primary: cleanHex(config?.primary_color, BRAND_COLORS.navy),
    accent: cleanHex(config?.secondary_color, BRAND_COLORS.gold),
    blue: BRAND_COLORS.blue,
    teal: BRAND_COLORS.teal,
    text: BRAND_COLORS.dgray,
    logo: customLogo ?? readBrandAsset("escudo"),
    footerIcon: readBrandAsset("icono-footer"),
    signature: readSignature(),
  };
}

/** Nombre de archivo seguro: "Auditoria Digital_ Nombre del Negocio.ext" */
export function exportFilename(report: Report, ext: string): { ascii: string; utf8: string } {
  const input = report.input as AuditInput;
  const name = (input?.businessName || "Negocio").trim();
  const utf8 = `Auditoria Digital_ ${name}.${ext}`;
  const ascii = utf8
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ._-]/g, "")
    .replace(/\s+/g, " ");
  return { ascii, utf8 };
}

export function contentDisposition(report: Report, ext: string): string {
  const { ascii, utf8 } = exportFilename(report, ext);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(utf8)}`;
}
