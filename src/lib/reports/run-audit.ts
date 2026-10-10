import { after } from "next/server";
import { db } from "@/lib/db";
import { runAuditPipeline } from "@/lib/agents/orchestrator";
import type { AuditInput, AuditResult } from "@/lib/db/types";

/**
 * Marca el reporte como "en proceso" y ejecuta la auditoría en segundo plano.
 * `after` mantiene viva la función en Vercel hasta que termina el pipeline;
 * en local se comporta igual. La usan la auditoría nueva y "Actualizar".
 *
 * @param keep campos del resultado anterior que deben conservarse (p. ej.
 *   los aportes del agente IA aprobados por el usuario).
 */
export async function startAuditRun(
  reportId: string,
  input: AuditInput,
  keep: Pick<AuditResult, "agent_insights"> = {},
): Promise<void> {
  await db.updateReport(reportId, { status: "processing" });

  after(() =>
    runAuditPipeline(input)
      .then(async ({ result, scores }) => {
        const merged: AuditResult = keep.agent_insights?.length ? { ...result, agent_insights: keep.agent_insights } : result;
        await db.updateReport(reportId, { status: "completed", result: merged, scores });
        console.log(`[audit] Pipeline completed for report ${reportId}`);
      })
      .catch(async (pipelineError: unknown) => {
        await db.updateReport(reportId, { status: "failed" });
        console.error(
          `[audit] Pipeline failed for report ${reportId}:`,
          pipelineError instanceof Error ? pipelineError.message : pipelineError,
        );
      }),
  );
}

/** Limpia una entrada de auditoría: cadenas vacías → undefined. */
export function normalizeAuditInput(input: AuditInput): AuditInput {
  const clean = (value?: string) => value?.trim() || undefined;
  return {
    businessName: input.businessName.trim(),
    city: clean(input.city),
    state: clean(input.state),
    url: clean(input.url),
    googleMapsUrl: clean(input.googleMapsUrl),
    customDirection: clean(input.customDirection),
  };
}
