import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnedReport, requireRouteUser } from "@/lib/auth/route";
import { syncAIConfigFromSecrets } from "@/lib/ai/runtime-config";
import { AGENT_TASKS, runReportAgent } from "@/lib/agents/report-agent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const PROVIDER_LABEL: Record<string, string> = { anthropic: "Claude (Anthropic)", openai: "OpenAI", google: "Gemini (Google)" };

/** Estado de la IA y tareas disponibles para el panel del agente. */
export async function GET() {
  const { response } = await requireRouteUser();
  if (response) return response;
  const ai = await syncAIConfigFromSecrets();
  return NextResponse.json({
    configured: ai.configured,
    provider: ai.provider,
    providerLabel: PROVIDER_LABEL[ai.provider] ?? ai.provider,
    available: ai.available,
    tasks: AGENT_TASKS.map(({ id, label, description, research }) => ({ id, label, description, research })),
  });
}

const bodySchema = z.object({
  task: z.string().max(40).default("custom"),
  instruction: z.string().max(4000).optional(),
});

/** Ejecuta una tarea del agente y devuelve un borrador (no se guarda). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, response } = await requireRouteUser();
  if (response) return response;
  const owned = await requireOwnedReport(id, user.id);
  if (owned.response) return owned.response;
  if (owned.report.status !== "completed" || !owned.report.result || owned.report.type !== "audit") {
    return NextResponse.json({ error: "El reporte aún no está listo" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  try {
    const draft = await runReportAgent(owned.report, parsed.data.task, parsed.data.instruction);
    return NextResponse.json({ draft });
  } catch (error) {
    console.error("[agent] error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
