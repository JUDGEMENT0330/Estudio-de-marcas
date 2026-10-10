import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Reporte · Estudio de Marcas · Cyber Valtorix";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #16294A 0%, #1F3864 55%, #2E75B6 100%)",
          color: "#FFFFFF",
          padding: "68px 80px",
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600, color: "#C09A3A", letterSpacing: 4 }}>
          CYBER VALTORIX SAS. DE C.V.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5 }}>
            Estudio de Marcas
          </div>
          <div style={{ fontSize: 28, color: "rgba(255,255,255,0.78)", maxWidth: 860, lineHeight: 1.35 }}>
            Auditorías de presencia digital e inteligencia de marca para negocios.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, color: "rgba(255,255,255,0.6)" }}>
          <span>alexmancia@cybervaltorix.com</span>
          <span>7803 9807</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
