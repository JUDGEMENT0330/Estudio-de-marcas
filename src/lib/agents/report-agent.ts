import { randomUUID } from "node:crypto";
import { complete, completeWithTools } from "@/lib/ai/claude";
import { syncAIConfigFromSecrets } from "@/lib/ai/runtime-config";
import { AGENTIC_TOOL_DEFINITIONS, executeAgenticTool } from "@/lib/agents/tools/agentic-tools";
import { buildDocContent } from "@/lib/exports/doc-content";
import { sanitizeAuditResultContent } from "@/lib/reports/content-contract";
import type { AgentInsight, AuditInput, AuditResult, Report } from "@/lib/db/types";

/**
 * Agente de IA que trabaja sobre un reporte ya generado, desde el navegador.
 *
 * Lee los datos de la auditoría, puede buscar en Google Places, leer páginas
 * web públicas (con protección SSRF) y buscar en la web, y devuelve un
 * borrador en español. El usuario lo revisa/edita y decide si lo agrega al
 * informe; nada se guarda sin su aprobación.
 */

export interface AgentTask {
  id: string;
  label: string;
  description: string;
  /** Usa herramientas (web, Places) además de los datos del reporte. */
  research: boolean;
  instruction: string;
}

export const AGENT_TASKS: AgentTask[] = [
  {
    id: "resumen",
    label: "Resumen para dirección",
    description: "Reescribe el resumen ejecutivo en una página clara para el dueño o gerente.",
    research: false,
    instruction:
      "Write a one-page executive brief for the business owner: current situation, the 3 most important problems (with the evidence from the audit), the 3 highest-impact actions, and what success looks like in 90 days. Plain business language, no jargon.",
  },
  {
    id: "plan90",
    label: "Plan 30-60-90 días",
    description: "Convierte las recomendaciones en un plan de trabajo con responsables y métricas.",
    research: false,
    instruction:
      "Turn the audit findings and recommendations into a 30-60-90 day action plan. For each phase: concrete tasks, who should own them (owner, staff, agency), estimated effort, and the KPI to track. Prioritize by impact and effort shown in the audit.",
  },
  {
    id: "competencia",
    label: "Investigar competencia",
    description: "Busca competidores cercanos y compara reputación, reseñas y presencia web.",
    research: true,
    instruction:
      "Research the business's direct local competitors. Use search_google_places / get_place_details (and web_search if useful) to find 3-5 real competitors near the business. Compare rating, review count, website and visible strengths. Then explain where the audited business wins, where it loses and 3 concrete moves to beat them. Only use data returned by the tools or present in the audit.",
  },
  {
    id: "sitio",
    label: "Revisar el sitio web",
    description: "Lee el sitio del negocio y propone mejoras de SEO, mensaje y conversión.",
    research: true,
    instruction:
      "Fetch the business website (and up to 3 important internal pages) with fetch_webpage. Review the value proposition, calls to action, contact options (WhatsApp, phone, forms), local SEO signals (city, services, schema hints, titles) and trust elements (reviews, certifications). Combine with the audit's website performance data and give a prioritized list of fixes with example copy in Spanish.",
  },
  {
    id: "contenido",
    label: "Calendario de contenido",
    description: "Propone 4 semanas de publicaciones y copys listos para redes sociales.",
    research: false,
    instruction:
      "Create a 4-week social media content calendar tailored to this business and its audit gaps (2-3 posts per week). For each post: channel, objective, format, ready-to-publish copy in Spanish and a call to action. Add 5 Google Business Profile post ideas.",
  },
  {
    id: "resenas",
    label: "Reputación y reseñas",
    description: "Estrategia para conseguir más reseñas y plantillas de respuesta.",
    research: false,
    instruction:
      "Design a review-generation and reputation strategy based on the audit's review data: how to ask for reviews (moments, channels, scripts for staff and WhatsApp), response templates for 5-star, 3-star and 1-star reviews in Spanish, and the weekly KPI to monitor.",
  },
  {
    id: "verificar",
    label: "Verificar datos",
    description: "Contrasta los datos clave del reporte con fuentes públicas y señala diferencias.",
    research: true,
    instruction:
      "Fact-check the key facts of the audit (name, address, phone, website, rating, review count, social profiles) against public sources using the tools. Produce a table-like list: fact, value in the audit, value found, source, status (coincide / difiere / no verificado). Never guess: if a tool does not return the data, mark it as 'no verificado'.",
  },
];

const SYSTEM_PROMPT = `You are a senior digital-marketing strategist at Cyber Valtorix, working as an autonomous research agent on top of an existing digital-presence audit.

Rules:
- Ground every claim in the AUDIT DATA provided or in results returned by your tools. Never invent numbers, competitors, reviews or URLs.
- When something cannot be verified, say so explicitly.
- Use tools only when they add verifiable information; stop researching once you have enough (max ~6 tool calls).
- The final answer is a section that will be pasted into a client-facing report.

Output format (strict):
- First line: "# " followed by a short section title in Spanish.
- Then the body using only: "## " subheadings, "- " bullet points and plain paragraphs. No tables, no code blocks, no emojis.
- End with a "## Fuentes" list of the URLs you actually used (omit it if you used none).`;

function compactContext(report: Report): string {
  const result = sanitizeAuditResultContent(report.result as AuditResult);
  const input = report.input as AuditInput;
  const content = buildDocContent({ ...report, result });
  const gbp = result.gbp_health;
  const context = {
    negocio: {
      nombre: gbp?.business_name || input.businessName,
      ciudad: input.city,
      estado: input.state,
      sitio_web: gbp?.website || input.url,
      google_maps: input.googleMapsUrl,
      direccion: gbp?.address,
      telefono: gbp?.phone,
      calificacion: gbp?.rating,
      resenas: gbp?.review_count,
      indicaciones_del_usuario: input.customDirection,
    },
    puntaje: { total: content.score, nota: content.grade, nivel: content.scoreTier },
    veredicto: [content.verdictHeadline, content.verdictSubline, content.bottomLine].filter(Boolean),
    resumen: content.summaryParagraphs,
    metricas: content.keyStats,
    hallazgos: content.insights,
    modulos: content.modules.map((m) => ({
      area: m.label,
      nota: m.grade,
      puntaje: m.score,
      metricas: Object.fromEntries(m.metrics),
      hallazgos: m.findings.slice(0, 6),
      recomendaciones: m.recommendations.slice(0, 5),
    })),
    recomendaciones: content.recommendations.slice(0, 10).map((r) => ({
      titulo: r.title,
      detalle: r.description,
      impacto: r.impact,
      esfuerzo: r.effort,
      plazo: r.timeframe,
    })),
    competidores: result.competitive_comparison?.competitors?.slice(0, 6),
    señales: content.signals.slice(0, 8),
    cobertura: content.coverage,
    aportes_previos: (result.agent_insights ?? []).map((i) => i.title),
  };
  const json = JSON.stringify(context);
  return json.length > 40_000 ? `${json.slice(0, 40_000)}…` : json;
}

function collectSources(text: string, toolCalls: { name: string; input: any }[]): string[] {
  const urls = new Set<string>();
  for (const call of toolCalls) {
    if (call.name === "fetch_webpage" && typeof call.input?.url === "string") urls.add(call.input.url);
  }
  for (const match of text.matchAll(/https?:\/\/[^\s)\]>"']+/g)) urls.add(match[0].replace(/[.,;:]+$/, ""));
  return [...urls].slice(0, 15);
}

export interface AgentDraft extends Omit<AgentInsight, "id" | "created_at"> {
  toolsUsed: { name: string; detail: string }[];
}

export async function runReportAgent(report: Report, taskId: string, customInstruction?: string): Promise<AgentDraft> {
  const ai = await syncAIConfigFromSecrets();
  if (!ai.configured) {
    throw new Error("No hay una llave de IA configurada. Agrega la de Anthropic, OpenAI o Gemini en Configuración.");
  }

  const task = AGENT_TASKS.find((t) => t.id === taskId);
  const instruction = [task?.instruction, customInstruction?.trim() ? `User request (in Spanish): ${customInstruction.trim()}` : ""]
    .filter(Boolean)
    .join("\n\n");
  if (!instruction) throw new Error("Indica qué quieres que haga el agente.");

  const research = task ? task.research : true;
  const prompt = `AUDIT DATA (JSON):\n${compactContext(report)}\n\nTASK:\n${instruction}`;
  // Sin investigación no se pasan herramientas: algunos proveedores rechazan una lista vacía.
  const response = research
    ? await completeWithTools({
        system: SYSTEM_PROMPT,
        prompt,
        tools: AGENTIC_TOOL_DEFINITIONS,
        executeTools: executeAgenticTool,
        maxTokens: 4096,
        temperature: 0.4,
        maxTurns: 8,
      })
    : { text: await complete({ system: SYSTEM_PROMPT, prompt, maxTokens: 4096, temperature: 0.4 }), toolCalls: [] };

  const text = response.text?.trim();
  if (!text) throw new Error("El agente no devolvió contenido. Intenta de nuevo.");

  const lines = text.split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line.trim()));
  const title = titleIndex >= 0 ? lines[titleIndex].trim().replace(/^#\s+/, "") : task?.label ?? "Análisis complementario";
  const body = (titleIndex >= 0 ? lines.filter((_, i) => i !== titleIndex) : lines).join("\n");
  // Las fuentes se listan aparte en los documentos.
  const content = body.replace(/\n##\s*Fuentes[\s\S]*$/i, "").trim();

  return {
    task: task?.id ?? "custom",
    title,
    content,
    sources: collectSources(text, response.toolCalls),
    provider: ai.provider,
    toolsUsed: response.toolCalls.map((call) => ({
      name: call.name,
      detail: String(call.input?.url ?? call.input?.query ?? call.input?.place_id ?? ""),
    })),
  };
}

export function newInsight(data: Omit<AgentInsight, "id" | "created_at">): AgentInsight {
  return { ...data, id: randomUUID(), created_at: new Date().toISOString() };
}
