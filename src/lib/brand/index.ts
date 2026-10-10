/**
 * Identidad de marca Cyber Valtorix — fuente única para la app y los
 * documentos exportados (PDF, DOCX, PPTX, XLSX).
 *
 * Todos los valores pueden sobreescribirse por variables de entorno para
 * reutilizar la plataforma con otra razón social sin tocar código.
 */

export const BRAND_COLORS = {
  navy: "1F3864",
  gold: "C09A3A",
  blue: "2E75B6",
  teal: "17616E",
  dgray: "404040",
  white: "FFFFFF",
  lnavy: "D5E8F0",
  lgold: "FFF2CC",
  footerLine: "4F81BD",
  red: "C0392B",
  green: "2E7D4F",
  appleGray: "6E6E73",
  appleBg: "F5F5F7",
} as const;

export const BRAND = {
  appName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Estudio de Marcas",
  company: process.env.BRAND_COMPANY?.trim() || "CYBER VALTORIX SAS. DE C.V.",
  companyShort: process.env.BRAND_COMPANY_SHORT?.trim() || "Cyber Valtorix",
  email: process.env.BRAND_EMAIL?.trim() || "alexmancia@cybervaltorix.com",
  phone: process.env.BRAND_PHONE?.trim() || "7803 9807",
  website: process.env.BRAND_WEBSITE?.trim() || "https://cybervaltorix.com",
  signer: process.env.BRAND_SIGNER?.trim() || "MDSc BORIS ALEXANDER RODRÍGUEZ MANCÍA",
  signerRole: process.env.BRAND_SIGNER_ROLE?.trim() || "GERENTE",
  country: process.env.BRAND_COUNTRY?.trim() || "El Salvador",
  locale: "es-SV",
} as const;

/** Rutas públicas de los activos de marca (servidos desde /public). */
export const BRAND_ASSETS = {
  shield: "/brand/escudo.png",
  footerIcon: "/brand/icono-footer.png",
  signature: "/brand/firma-sello.png",
} as const;

export function formatDateEs(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("es-SV", { year: "numeric", month: "long", day: "numeric" });
}

export function formatMonthYearEs(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const text = date.toLocaleDateString("es-SV", { year: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
