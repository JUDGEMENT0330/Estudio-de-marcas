import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import ReportPDF from "./report-pdf";
import type { Report, WhiteLabelConfig } from "@/lib/db/types";
import { buildDocContent } from "@/lib/exports/doc-content";
import { resolveDocBrand } from "@/lib/exports/doc-brand";

export async function generateReportPDF(report: Report, branding?: WhiteLabelConfig): Promise<Buffer> {
  try {
    const brand = await resolveDocBrand(branding);
    const content = buildDocContent(report);
    const pdfDocument = ReportPDF({ content, brand }) as ReactElement;
    const buffer = await renderToBuffer(pdfDocument as Parameters<typeof renderToBuffer>[0]);
    return Buffer.from(buffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw new Error(
      `No se pudo generar el PDF: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
