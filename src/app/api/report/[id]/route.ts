import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOwnedReport, requireRouteUser } from "@/lib/auth/route";
import { sanitizeAuditResultContent } from "@/lib/reports/content-contract";
import { normalizeAuditInput, startAuditRun } from "@/lib/reports/run-audit";
import type { AuditInput, AuditResult } from "@/lib/db/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// "Actualizar" vuelve a correr la auditoría en segundo plano.
export const maxDuration = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const sanitizedReport = report.result && report.type === "audit"
    ? { ...report, result: sanitizeAuditResultContent(report.result as any) }
    : report;

  return NextResponse.json(sanitizedReport);
}

const optionalText = z.string().max(500).optional();
const optionalUrl = z.string().url().max(2000).optional().or(z.literal(""));

const patchSchema = z.object({
  /** Datos del negocio a corregir (se combinan con los actuales). */
  input: z
    .object({
      businessName: z.string().trim().min(1, "El nombre del negocio es obligatorio").max(200).optional(),
      city: optionalText,
      state: optionalText,
      url: optionalUrl,
      googleMapsUrl: optionalUrl,
      customDirection: z.string().max(4000).optional(),
    })
    .optional(),
  /** true = volver a ejecutar la auditoría con los datos (editados o no). */
  regenerate: z.boolean().optional(),
});

/** Edita los datos del reporte y/o lo actualiza volviendo a correr la auditoría. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRouteUser();
  if (response) return response;
  const owned = await requireOwnedReport(id, user.id);
  if (owned.response) return owned.response;
  const report = owned.report;

  if (report.type !== "audit") {
    return NextResponse.json({ error: "Solo se pueden editar auditorías" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }
  const { input: changes, regenerate } = parsed.data;

  if (regenerate && (report.status === "processing" || report.status === "queued")) {
    return NextResponse.json({ error: "El reporte ya se está generando" }, { status: 409 });
  }
  if (regenerate && user.audit_credits_remaining <= 0) {
    return NextResponse.json({ error: "No quedan créditos de auditoría." }, { status: 403 });
  }

  const input = normalizeAuditInput({ ...(report.input as AuditInput), ...changes });
  if (changes) await db.updateReport(id, { input });

  if (regenerate) {
    await db.trackUsage({ user_id: user.id, action: "audit", credits_consumed: 1 });
    // Los aportes del agente IA aprobados se conservan.
    const insights = (report.result as AuditResult | undefined)?.agent_insights;
    await startAuditRun(id, input, { agent_insights: insights });
  }

  return NextResponse.json({ ok: true, reportId: id, status: regenerate ? "processing" : report.status, input });
}

/** Elimina el reporte de forma permanente. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRouteUser();
  if (response) return response;
  const owned = await requireOwnedReport(id, user.id);
  if (owned.response) return owned.response;

  await db.deleteReport(id);
  return NextResponse.json({ ok: true });
}
