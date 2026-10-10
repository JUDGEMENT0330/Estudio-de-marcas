import fs from "node:fs";
import path from "node:path";
import { BRAND, BRAND_COLORS } from "@/lib/brand";
import { readBrandAsset } from "@/lib/brand/assets.server";
import type { AuditInput, Report, WhiteLabelConfig } from "@/lib/db/types";
import { loadDocImage, toDocImage, type DocImage } from "./doc-image";
import { techFooterBand } from "./tech-footer";

/**
 * Identidad de marca resuelta para un documento exportado.
 * Valores por defecto: Cyber Valtorix. El usuario puede personalizar razón
 * social, contacto, colores, logo, firmante, cargo y firma desde Configuración.
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
  /** Logo en PNG o JPEG (convertido si venía en otro formato). */
  logo: DocImage | null;
  /** true cuando el logo configurado por URL no se pudo usar y se cayó al escudo. */
  logoFallback: boolean;
  /** Banda tecnológica del pie de página, en los colores de la marca. */
  footerBand: DocImage;
  /** Firma y sello: de Configuración, variable de entorno o archivo local privado. */
  signature: DocImage | null;
}

function cleanHex(value: string | undefined, fallback: string): string {
  const hex = value?.trim().replace(/^#/, "");
  return hex && /^[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : fallback;
}

function readSignatureFile(): Buffer | null {
  const b64 = process.env.BRAND_SIGNATURE_BASE64?.trim();
  if (b64) {
    try {
      return Buffer.from(b64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ""), "base64");
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

/**
 * Tamaño de una imagen dentro de una caja (alto máximo y ancho máximo),
 * conservando su proporción original.
 */
export function fitImage(image: DocImage | null, maxHeight: number, maxWidth: number): { width: number; height: number } {
  const ratio = image && image.height > 0 ? image.width / image.height : 1;
  let height = maxHeight;
  let width = height * ratio;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }
  return { width, height };
}

export function fitLogo(brand: DocBrand, maxHeight: number, maxWidth: number): { width: number; height: number } {
  return fitImage(brand.logo, maxHeight, maxWidth);
}

export async function resolveDocBrand(config?: WhiteLabelConfig): Promise<DocBrand> {
  const [customLogo, uploadedSignature, fileSignature] = await Promise.all([
    loadDocImage(config?.logo_url),
    loadDocImage(config?.signature_data),
    toDocImage(readSignatureFile()),
  ]);
  if (config?.logo_url?.trim() && !customLogo) {
    console.warn("[doc-brand] El logo configurado no es una imagen utilizable; se usa el escudo por defecto.");
  }
  const primary = cleanHex(config?.primary_color, BRAND_COLORS.navy);
  const accent = cleanHex(config?.secondary_color, BRAND_COLORS.gold);
  return {
    company: config?.company_name?.trim() || BRAND.company,
    companyShort: BRAND.companyShort,
    email: config?.contact_email?.trim() || BRAND.email,
    phone: config?.contact_phone?.trim() || BRAND.phone,
    website: BRAND.website,
    signer: config?.signer_name?.trim() || BRAND.signer,
    signerRole: config?.signer_role?.trim() || BRAND.signerRole,
    primary,
    accent,
    blue: BRAND_COLORS.blue,
    teal: BRAND_COLORS.teal,
    text: BRAND_COLORS.dgray,
    logo: customLogo ?? (await toDocImage(readBrandAsset("escudo"))),
    logoFallback: Boolean(config?.logo_url?.trim() && !customLogo),
    footerBand: techFooterBand(primary, accent, BRAND_COLORS.blue),
    signature: uploadedSignature ?? fileSignature,
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
