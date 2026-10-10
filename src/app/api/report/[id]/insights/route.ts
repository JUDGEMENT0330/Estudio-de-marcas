import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOwnedReport, requireRouteUser } from "@/lib/auth/route";
import { newInsight } from "@/lib/agents/report-agent";
import type { AuditResult } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/**
 * Aportes del agente IA aprobados por el usuario. Se guardan en
 * `result.agent_insights` y aparecen en PDF, Word, PowerPoint y Excel.
 */

const insightSchema = z.object({
  task: z.string().max(40).default("custom"),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20_000),
  sources: z.array(z.string().url().max(2000)).max(30).default([]),
  provider: z.string().max(40).optional(),
});

async function loadReport(id: string) {
  const { user, response } = await requireRouteUser();
  if (response) return { response };
  const owned = await requireOwnedReport(id, user.id);
  if (owned.response) return { response: owned.response };
  if (!owned.report.result || owned.report.type !== "audit") {
    return { response: NextResponse.json({ error: "El reporte aún no está listo" }, { status: 400 }) };
  }
  return { report: owned.report, result: owned.report.result as AuditResult };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadReport(id);
  if (loaded.response) return loaded.response;

  const parsed = insightSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
  }

  const insights = [...(loaded.result.agent_insights ?? []), newInsight(parsed.data)];
  await db.updateReport(id, { result: { ...loaded.result, agent_insights: insights } });
  return NextResponse.json({ insights });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadReport(id);
  if (loaded.response) return loaded.response;

  const insightId = request.nextUrl.searchParams.get("insightId");
  const insights = (loaded.result.agent_insights ?? []).filter((insight) => insight.id !== insightId);
  await db.updateReport(id, { result: { ...loaded.result, agent_insights: insights } });
  return NextResponse.json({ insights });
}
