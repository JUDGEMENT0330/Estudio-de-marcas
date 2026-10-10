import { NextRequest, NextResponse } from "next/server";
import { requireOwnedReport, requireRouteUser } from "@/lib/auth/route";
import { generateReportDOCX } from "@/lib/exports/generate-docx";
import { sanitizeAuditResultContent } from "@/lib/reports/content-contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, response } = await requireRouteUser();
    if (response) {
      return response;
    }

    const ownedReport = await requireOwnedReport(id, user.id);
    if (ownedReport.response) {
      return ownedReport.response;
    }

    const report = ownedReport.report;

    if (report.status !== "completed" || !report.result) {
      return NextResponse.json({ error: "El reporte aún no está listo" }, { status: 400 });
    }

    const exportReport = report.type === "audit"
      ? { ...report, result: sanitizeAuditResultContent(report.result as any) }
      : report;
    const buffer = await generateReportDOCX(exportReport);

    const businessName = (report.input as any).businessName || "Business";
    const filename = `${businessName.replace(/[^a-zA-Z0-9]/g, "_")}_Audit_Report.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("DOCX generation error:", err);
    return NextResponse.json(
      { error: "No se pudo generar el Word", message: err.message },
      { status: 500 }
    );
  }
}
