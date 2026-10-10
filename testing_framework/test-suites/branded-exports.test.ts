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
