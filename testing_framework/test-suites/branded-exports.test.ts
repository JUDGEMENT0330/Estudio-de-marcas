import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createMockAuditResult, createMockReport, createMockReportScores } from "../test-utils/mock-factories";
import { buildDocContent } from "@/lib/exports/doc-content";
import { generateReportDOCX } from "@/lib/exports/generate-docx";
import { generateReportPPTX } from "@/lib/exports/generate-pptx";
import { generateReportXLSX } from "@/lib/exports/generate-xlsx";
import { generateReportPDF } from "@/lib/pdf/generate-pdf";
import { contentDisposition } from "@/lib/exports/doc-brand";

/**
 * Genera los cuatro formatos con la marca Cyber Valtorix. Si se define
 * EXPORT_PREVIEW_DIR, guarda los archivos para revisarlos a mano.
 */
const report = createMockReport({
  status: "completed",
  input: { businessName: "Perfumería Áurea", city: "San Salvador", state: "San Salvador" },
  result: createMockAuditResult(),
  scores: createMockReportScores(),
});

const previewDir = process.env.EXPORT_PREVIEW_DIR;
function save(name: string, data: Buffer) {
  if (!previewDir) return;
  fs.mkdirSync(previewDir, { recursive: true });
  fs.writeFileSync(path.join(previewDir, name), data);
}

describe("branded exports", () => {
  it("builds Spanish document content", () => {
    const content = buildDocContent(report);
    expect(content.businessName).toBe("Perfumería Áurea");
    expect(content.modules.length).toBeGreaterThan(0);
    expect(content.modules.map((m) => m.label)).toContain("Rendimiento del sitio web");
  });

  it("generates DOCX, PPTX, XLSX and PDF", async () => {
    const [docx, pptx, xlsx, pdf] = await Promise.all([
      generateReportDOCX(report),
      generateReportPPTX(report),
      generateReportXLSX(report),
      generateReportPDF(report),
    ]);
    for (const buf of [docx, pptx, xlsx]) expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    save("muestra.docx", docx);
    save("muestra.pptx", pptx);
    save("muestra.xlsx", xlsx);
    save("muestra.pdf", pdf);
  });

  it("uses an accent-safe Spanish filename", () => {
    expect(contentDisposition(report, "pdf")).toContain('filename="Auditoria Digital_ Perfumeria Aurea.pdf"');
    expect(contentDisposition(report, "pdf")).toContain("filename*=UTF-8''");
  });
});

describe("logo, firma y pie", () => {
  const jpeg = fs.readFileSync(path.join(__dirname, "..", "fixtures", "logo-ancho.jpg"));
  const jpegUri = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

  it("detecta PNG y JPEG por su firma binaria y lee su tamaño", async () => {
    const { toDocImage, sniffImageType } = await import("@/lib/exports/doc-image");
    // PNG mínimo de 900×240 (solo cabecera IHDR) para validar la lectura de tamaño.
    const header = Buffer.alloc(33);
    header.writeUInt32BE(0x89504e47, 0);
    header.writeUInt32BE(0x49484452, 12);
    header.writeUInt32BE(900, 16);
    header.writeUInt32BE(240, 20);
    expect(await toDocImage(header)).toMatchObject({ type: "png", width: 900, height: 240 });
    expect(sniffImageType(jpeg)).toBe("jpg");
    expect(await toDocImage(jpeg)).toMatchObject({ type: "jpg", width: 240, height: 80 });
    expect(await toDocImage(Buffer.from("<html>no es una imagen</html>"))).toBeNull();
  });

  it("conserva la proporción de logos anchos", async () => {
    const { fitImage } = await import("@/lib/exports/doc-brand");
    const wide = { data: Buffer.alloc(0), type: "png" as const, width: 900, height: 240 };
    expect(fitImage(wide, 40, 1000)).toEqual({ width: 150, height: 40 });
    const capped = fitImage(wide, 40, 75);
    expect(capped.width).toBe(75);
    expect(capped.height).toBeCloseTo(20);
  });

  it("usa el logo JPEG, el firmante y la firma configurados", async () => {
    const { resolveDocBrand } = await import("@/lib/exports/doc-brand");
    const brand = await resolveDocBrand({
      logo_url: jpegUri,
      signer_name: "Nombre de Prueba",
      signer_role: "DIRECTOR",
      signature_data: jpegUri,
    });
    expect(brand.logo).toMatchObject({ type: "jpg", width: 240 });
    expect(brand.logoFallback).toBe(false);
    expect(brand.signer).toBe("Nombre de Prueba");
    expect(brand.signerRole).toBe("DIRECTOR");
    expect(brand.signature?.type).toBe("jpg");
    expect(brand.footerBand.data.subarray(1, 4).toString()).toBe("PNG");
  });

  it("cae al escudo cuando la URL del logo no es una imagen", async () => {
    const { resolveDocBrand } = await import("@/lib/exports/doc-brand");
    const brand = await resolveDocBrand({ logo_url: "data:image/png;base64,bm8gZXMgcG5n" });
    expect(brand.logoFallback).toBe(true);
    expect(brand.logo?.type).toBe("png");
  });

  it("genera los cuatro formatos con logo JPEG, firma y aportes del agente", async () => {
    const withInsights = {
      ...report,
      result: {
        ...(report.result as object),
        agent_insights: [
          {
            id: "a1",
            task: "plan90",
            title: "Plan de acción 30-60-90 días",
            content: "## Primeros 30 días\n- Completar el perfil de Google\n- Responder **todas** las reseñas\n\nMedir llamadas semanalmente.",
            sources: ["https://example.com/fuente"],
            created_at: new Date().toISOString(),
          },
        ],
      },
    } as typeof report;
    const config = { logo_url: jpegUri, signature_data: jpegUri, signer_name: "Nombre de Prueba", signer_role: "GERENTE" };
    const content = buildDocContent(withInsights);
    expect(content.agentInsights[0].blocks).toEqual([
      { kind: "h", text: "Primeros 30 días" },
      { kind: "li", text: "Completar el perfil de Google" },
      { kind: "li", text: "Responder todas las reseñas" },
      { kind: "p", text: "Medir llamadas semanalmente." },
    ]);
    const [docx, pptx, xlsx, pdf] = await Promise.all([
      generateReportDOCX(withInsights, config),
      generateReportPPTX(withInsights, config),
      generateReportXLSX(withInsights, config),
      generateReportPDF(withInsights, config),
    ]);
    for (const buf of [docx, pptx, xlsx]) expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    save("con-ia.docx", docx);
    save("con-ia.pptx", pptx);
    save("con-ia.xlsx", xlsx);
    save("con-ia.pdf", pdf);
  });
});
