import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getAppUrl } from "@/lib/app-url";
import { BRAND } from "@/lib/brand";

const appUrl = getAppUrl();

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${BRAND.appName} · ${BRAND.companyShort}`,
    template: `%s · ${BRAND.appName}`,
  },
  description:
    "Auditorías de presencia digital e inteligencia de marca para negocios locales, con análisis estratégico asistido por IA y entregables con la identidad de Cyber Valtorix.",
  applicationName: BRAND.appName,
};

export const viewport: Viewport = {
  themeColor: "#F5F5F7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
