import type {
  AuditInput,
  AuditResult,
  EnhancedRecommendation,
  ExecutiveSummaryData,
  Recommendation,
  Report,
} from "@/lib/db/types";
import { filterClientFacingReportItems } from "@/lib/reports/content-quality";
import {
  filterUnverifiedRevenueStats,
  shouldShowRevenueDollars,
  stripDollarClaims,
  visibleRevenueFindings,
} from "@/lib/reports/revenue-display";
import {
  gradeLevel,
  humanizeModuleKey,
  humanizeModuleReferences,
  localizeGrade,
  translateEnum,
  type GradeLevel,
} from "@/lib/reports/display-labels";
import { buildAuditCoverageSummary } from "@/lib/reports/coverage";
import { formatDateEs } from "@/lib/brand";

/**
 * Modelo de contenido único (en español) para todos los documentos
 * exportados. PDF, Word, PowerPoint y Excel leen de aquí para que los cuatro
 * formatos cuenten exactamente la misma historia.
 */

export interface DocModule {
  key: string;
  label: string;
  grade: string;
  level: GradeLevel;
  score: number;
  metrics: [string, string][];
  findings: string[];
  recommendations: string[];
  aiBacked: boolean;
}

export interface DocRecommendation {
  title: string;
  description: string;
  impact: string;
  effort: string;
  impactRaw: "high" | "medium" | "low";
  timeframe?: string;
  outcome?: string;
  module?: string;
}

export interface DocInsightBlock {
  kind: "h" | "p" | "li";
  text: string;
}

export interface DocInsight {
  title: string;
  blocks: DocInsightBlock[];
  sources: string[];
}

/**
 * Convierte el texto del agente (formato ligero tipo Markdown) en bloques
 * simples que los cuatro formatos saben dibujar.
 */
export function parseInsightContent(content: string): DocInsightBlock[] {
  const clean = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)")
      .trim();
  const blocks: DocInsightBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "p", text: clean(paragraph.join(" ")) });
    paragraph = [];
  };
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (heading) {
      flush();
      blocks.push({ kind: "h", text: clean(heading[1]) });
    } else if (item) {
      flush();
      blocks.push({ kind: "li", text: clean(item[1]) });
    } else if (/^\|?\s*:?-{3,}/.test(line)) {
      continue;
    } else {
      paragraph.push(line.replace(/^\|\s*|\s*\|$/g, "").replace(/\s*\|\s*/g, " · "));
    }
  }
  flush();
  return blocks.filter((block) => block.text);
}

export interface DocContent {
  businessName: string;
  location: string;
  dateLong: string;
  score: number;
  grade: string;
  level: GradeLevel;
  scoreTier: string;
  verdictHeadline: string;
  verdictSubline: string;
  bottomLine: string;
  summaryParagraphs: string[];
  keyStats: { label: string; value: string; sentiment: "positive" | "negative" | "neutral" }[];
  insights: string[];
  strength?: { module: string; headline: string; detail: string };
  gap?: { module: string; headline: string; detail: string };
  hiddenOpportunity: string;
  pathForward: { priority: number; action: string; outcome: string }[];
  competitiveNarrative: string;
  causalChains: { chain: string; impact: string; fix: string; modules: string[] }[];
  hiddenStrengths: { strength: string; opportunity: string }[];
  compoundingGaps: { description: string; impact: string }[];
  priorityActions: { action: string; rationale: string; roi: string; timeframe: string; unlocks: string }[];
  recommendations: DocRecommendation[];
  signals: { headline: string; detail: string; source: string; confidence: string }[];
  modules: DocModule[];
  coverage: { label: string; detail: string; status: string }[];
  coverageConfidence: string;
  caveats: string[];
  showRevenueDollars: boolean;
  hasAI: boolean;
  /** Aportes del agente IA aprobados por el usuario. */
  agentInsights: DocInsight[];
}

const MODULE_LABELS: Record<string, string> = {
  gbp_health: "Perfil de Google Business",
  review_sentiment: "Reseñas y reputación",
  website_performance: "Rendimiento del sitio web",
  tech_stack: "Tecnología y madurez digital",
  social_presence: "Presencia en redes sociales",
  citation_consistency: "Consistencia en directorios",
  competitive_comparison: "Análisis competitivo",
  revenue_impact: "Impacto en el negocio",
};

export function scoreTierLabel(score: number): string {
  if (score >= 85) return "Nivel superior";
  if (score >= 70) return "Competitivo";
  if (score >= 55) return "En riesgo";
  return "Crítico";
}

function money(n: number | undefined): string {
  return `$${Math.round(n ?? 0).toLocaleString("es-SV")}`;
}

function yesNo(value: unknown): string {
  return value ? "Sí" : "No";
}

function moduleMetrics(key: string, r: any, showDollars: boolean): [string, string][] {
  switch (key) {
    case "gbp_health":
      return [
        ["Calificación", r.rating ? `${r.rating} / 5` : "N/D"],
        ["Reseñas", String(r.review_count ?? 0)],
        ["Fotos", String(r.photos_count ?? 0)],
        ["Completitud", `${r.completeness_pct ?? 0}%`],
      ];
    case "review_sentiment":
      return [
        ["Calificación Google", r.google_rating ? `${r.google_rating} / 5` : "N/D"],
        ["Tendencia", translateEnum(r.trend_direction) || "—"],
        ["Tasa de respuesta", `${r.owner_response_rate ?? 0}%`],
        ["Ritmo", `${r.review_velocity ?? 0} / mes`],
      ];
    case "website_performance":
      return [
        ["Rendimiento", `${r.performance_score ?? 0}/100`],
        ["SEO", `${r.seo_score ?? 0}/100`],
        ["Accesibilidad", `${r.accessibility_score ?? 0}/100`],
        ["SSL", r.ssl_valid ? "Válido" : "Ausente"],
      ];
    case "tech_stack":
      return [
        ["Madurez digital", `${r.digital_maturity_score ?? 0}/100`],
        ["CMS", r.cms || "Desconocido"],
        ["Analítica", r.analytics?.length ? r.analytics.join(", ") : "Ninguna"],
        ["Reservas", r.booking_system || "Ninguno"],
      ];
    case "social_presence":
      return [
        ["Plataformas", String(r.platforms_found ?? 0)],
        ["Activas", String(r.platforms_active ?? 0)],
        ["Seguidores", (r.total_following ?? 0).toLocaleString("es-SV")],
        ["Datos consistentes", yesNo(r.nap_consistent)],
      ];
    case "citation_consistency":
      return [
        ["Encontrados", String(r.total_found ?? 0)],
        ["Correctos", String(r.total_correct ?? 0)],
        ["Inconsistentes", String(r.total_inconsistent ?? 0)],
        ["Faltantes", String(r.total_missing ?? 0)],
      ];
    case "competitive_comparison":
      return [
        ["Posición", translateEnum(r.target_position) || "—"],
        ["Competidores", String(r.competitors?.length ?? 0)],
      ];
    case "revenue_impact":
      return showDollars
        ? [
            ["Fuga mensual", money(r.total_monthly_leakage?.mid)],
            ["Impacto anual", money(r.annual_impact?.mid)],
          ]
        : [
            ["Nivel de impacto", translateEnum(r.opportunity_assessment?.impact_level) || "Solo señales"],
            ["Base de ingresos", "No verificada"],
          ];
    default:
      return [];
  }
}

export function buildDocContent(report: Report): DocContent {
  const result = (report.result ?? {}) as AuditResult;
  const input = report.input as AuditInput;
  const scores = report.scores;
  const ai = result.ai_analysis;
  const showDollars = shouldShowRevenueDollars(result.revenue_impact);
  const t = (text: string | undefined) =>
    humanizeModuleReferences(showDollars ? text || "" : stripDollarClaims(text || ""));

  const summary = result.executive_summary;
  const structured =
    typeof summary === "object" && summary !== null && "verdict_tier" in summary
      ? (summary as ExecutiveSummaryData)
      : null;

  const summaryParagraphs = structured
    ? [structured.verdict_subline, ...(structured.three_insights ?? structured.core_story ?? [])]
        .filter(Boolean)
        .map((p) => t(p))
    : typeof summary === "string"
      ? summary.split(/\n{2,}/).map((p) => t(p)).filter(Boolean)
      : [];

  const modules: DocModule[] = (
    [
      ["gbp_health", result.gbp_health],
      ["review_sentiment", result.review_sentiment],
      ["website_performance", result.website_performance],
      ["tech_stack", result.tech_stack],
      ["social_presence", result.social_presence],
      ["citation_consistency", result.citation_consistency],
      ["competitive_comparison", result.competitive_comparison],
      ["revenue_impact", result.revenue_impact],
    ] as const
  )
    .filter(([, data]) => data !== undefined && data !== null)
    .map(([key, data]) => {
      const d = data as any;
      const aiModule = ai?.module_analyses?.[key];
      const aiFindings = filterClientFacingReportItems([
        ...(aiModule?.expert_findings ?? []),
        ...(aiModule?.hidden_insights ?? []),
      ]);
      const aiRecs = filterClientFacingReportItems(
        (aiModule?.recommendations ?? [])
          .map((r: { title?: string; description?: string }) => r.title || r.description || "")
          .filter(Boolean),
      );
      const hasAI = aiFindings.length > 0;
      let findings = hasAI ? aiFindings : filterClientFacingReportItems(d.findings ?? []);
      if (key === "revenue_impact" && !showDollars) {
        findings = visibleRevenueFindings(findings, result.revenue_impact);
      }
      const recommendations =
        hasAI && aiRecs.length > 0 ? aiRecs : filterClientFacingReportItems(d.recommendations ?? []);
      const score = aiModule?.score_override ?? d.score ?? 0;
      return {
        key,
        label:
          key === "revenue_impact" && showDollars
            ? "Impacto en ingresos"
            : MODULE_LABELS[key] ?? humanizeModuleKey(key),
        grade: localizeGrade(d.grade),
        level: gradeLevel(d.grade, score),
        score,
        metrics: moduleMetrics(key, d, showDollars),
        findings: findings.map(t).slice(0, 5),
        recommendations: recommendations.map(t).slice(0, 4),
        aiBacked: hasAI,
      };
    });

  const enhanced = result.enhanced_recommendations ?? [];
  const recSource: (EnhancedRecommendation | Recommendation)[] = enhanced.length
    ? enhanced
    : result.recommendations ?? [];
  const recommendations: DocRecommendation[] = recSource.slice(0, 8).map((rec) => {
    const e = rec as EnhancedRecommendation;
    return {
      title: t(rec.title),
      description: t(rec.description),
      impact: translateEnum(rec.impact),
      effort: translateEnum(rec.effort),
      impactRaw: rec.impact,
      timeframe: e.timeframe,
      outcome: e.expected_outcome ? t(e.expected_outcome) : undefined,
      module: rec.module ? humanizeModuleKey(rec.module) : undefined,
    };
  });

  const coverageSummary = buildAuditCoverageSummary(result);
  const coverageKind: Record<string, string> = {
    checked: "Verificado",
    sampled: "Muestreado",
    not_checked: "No verificado",
  };

  const stats = structured
    ? filterUnverifiedRevenueStats(structured.key_stats ?? structured.key_data_points ?? [], result.revenue_impact)
    : [];

  const strengthRaw = structured?.top_strength as any;
  const gapRaw = (structured?.critical_gap ?? structured?.critical_weakness) as any;

  const score = scores?.overall_score ?? 0;

  return {
    businessName: input?.businessName || "Negocio",
    location: [input?.city, input?.state].filter(Boolean).join(", "),
    dateLong: formatDateEs(report.created_at),
    score,
    grade: localizeGrade(scores?.overall_grade) || "—",
    level: gradeLevel(scores?.overall_grade, score),
    scoreTier: scoreTierLabel(score),
    verdictHeadline: t(structured?.verdict_headline) || "Diagnóstico de presencia digital",
    verdictSubline: t(structured?.verdict_subline || structured?.verdict_context),
    bottomLine: t(structured?.bottom_line || structured?.closing_statement),
    summaryParagraphs,
    keyStats: (stats as any[]).slice(0, 6).map((s) => ({
      label: String(s.label),
      value: String(s.value),
      sentiment: s.sentiment ?? "neutral",
    })),
    insights: (structured?.three_insights ?? structured?.core_story ?? []).map(t),
    strength: strengthRaw
      ? {
          module: humanizeModuleKey(strengthRaw.module),
          headline: t(strengthRaw.headline || strengthRaw.metric),
          detail: t(strengthRaw.detail || strengthRaw.description),
        }
      : undefined,
    gap: gapRaw
      ? {
          module: humanizeModuleKey(gapRaw.module),
          headline: t(gapRaw.headline || gapRaw.metric),
          detail: t(gapRaw.detail || gapRaw.description),
        }
      : undefined,
    hiddenOpportunity: t(structured?.hidden_opportunity),
    pathForward: (structured?.path_forward ?? []).map((step) => ({
      priority: step.priority,
      action: t(step.action),
      outcome: t(step.outcome),
    })),
    competitiveNarrative: t(ai?.cross_module_synthesis?.competitive_narrative),
    causalChains: (ai?.cross_module_synthesis?.causal_chains ?? []).map((c) => ({
      chain: t(c.chain),
      impact: t(c.business_impact),
      fix: t(c.fix_sequence),
      modules: c.modules_involved.map(humanizeModuleKey),
    })),
    hiddenStrengths: (ai?.cross_module_synthesis?.hidden_strengths ?? []).map((s) => ({
      strength: t(s.strength),
      opportunity: t(s.leverage_opportunity),
    })),
    compoundingGaps: (ai?.cross_module_synthesis?.compounding_gaps ?? []).map((g) => ({
      description: t(g.description),
      impact: t(g.combined_impact),
    })),
    priorityActions: (ai?.priority_action_plan ?? []).map((a) => ({
      action: t(a.action),
      rationale: t(a.rationale),
      roi: t(a.expected_roi),
      timeframe: a.timeframe,
      unlocks: t(a.unlocks),
    })),
    recommendations,
    signals: (result.business_intelligence?.signals ?? []).map((s) => ({
      headline: s.headline,
      detail: s.detail,
      source: s.source,
      confidence: translateEnum(s.confidence),
    })),
    modules,
    coverage: coverageSummary.items.map((item) => ({
      label: item.label,
      detail: item.detail,
      status: coverageKind[item.coverage] ?? item.coverage,
    })),
    coverageConfidence:
      { Strong: "Cobertura sólida", Directional: "Cobertura orientativa", Limited: "Cobertura limitada" }[
        coverageSummary.confidence.label
      ] ?? "",
    caveats: filterClientFacingReportItems(ai?.data_quality_assessment?.caveats ?? []).map(t),
    showRevenueDollars: showDollars,
    hasAI: Boolean(ai),
    agentInsights: (result.agent_insights ?? []).map((insight) => ({
      title: insight.title,
      blocks: parseInsightContent(insight.content),
      sources: insight.sources ?? [],
    })),
  };
}

/** Colores (hex sin #) por nivel de calificación, coherentes con la app. */
export const LEVEL_HEX: Record<GradeLevel, string> = {
  excellent: "1E8E5A",
  good: "2E75B6",
  developing: "B7852A",
  needs_attention: "D25A1E",
  unknown: "6E6E73",
};

export const LEVEL_SOFT_HEX: Record<GradeLevel, string> = {
  excellent: "E3F4EA",
  good: "DCEBF8",
  developing: "F8EDD3",
  needs_attention: "FCE3D6",
  unknown: "EDEDF0",
};
