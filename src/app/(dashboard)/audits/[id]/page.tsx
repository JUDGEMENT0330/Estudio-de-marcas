"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GradeBadge } from "@/components/reports/grade-badge";
import { ScoreRing } from "@/components/reports/score-ring";
import type { ExecutiveSummaryData, ReportScores } from "@/lib/db/types";
import { ModuleCard } from "@/components/reports/module-card";
import { IntelligenceCard } from "@/components/reports/intelligence-card";
import { AuditLoading } from "@/components/reports/audit-loading";
import { AIAnalysisCard } from "@/components/reports/ai-analysis-card";
import { StrategicIntelligenceCard } from "@/components/reports/strategic-intelligence-card";
import { BusinessContextCard } from "@/components/reports/business-context-card";
import { repairMojibakeText, repairMojibakeValue } from "@/lib/text/repair";
import { filterClientFacingReportItems } from "@/lib/reports/content-quality";
import { sanitizeAuditResultContent } from "@/lib/reports/content-contract";
import { buildAuditCoverageSummary } from "@/lib/reports/coverage";
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
} from "@/lib/reports/display-labels";
import {
  MapPin, Star, Globe, Cpu, Users, BookOpen, Trophy, DollarSign,
  Loader2, AlertCircle, ArrowLeft, Download, Share2, CheckCircle2, XCircle,
  FileText, Presentation, Sheet, ChevronDown, Zap, TrendingUp, AlertOctagon, Target, Sparkles,
  Activity, Settings
} from "lucide-react";
import Link from "next/link";
import type { Report, AuditResult, AuditInput, Recommendation } from "@/lib/db/types";

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("es-SV", { maximumFractionDigits: 0 });
}

/** Maps overall score to an interpretability tier label + color */
function getScoreTier(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "Nivel superior", color: "text-emerald-300" };
  if (score >= 70) return { label: "Competitivo", color: "text-sky-200" };
  if (score >= 55) return { label: "En riesgo", color: "text-amber-200" };
  return { label: "Crítico", color: "text-red-300" };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Expert Findings — surfaces per-module AI deep analysis                    */
/* ─────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────── */
/*  AI-first module content resolver                                          */
/*                                                                             */
/*  Priority:                                                                  */
/*    1. AI expert_findings + AI recommendations (from Phase 2 analysis)       */
/*    2. Raw module findings + recommendations (fallback, shows isEstimated)   */
/* ─────────────────────────────────────────────────────────────────────────── */

function getModuleContent(
  moduleKey: string,
  rawFindings: string[],
  rawRecommendations: string[],
  rawScore: number,
  aiAnalysis?: AuditResult["ai_analysis"]
): {
  findings: string[];
  recommendations: string[];
  score: number;
  isEstimated: boolean;
} {
  const aiModule = aiAnalysis?.module_analyses?.[moduleKey];

  // Combine expert_findings + hidden_insights for a richer primary finding list
  const aiFindings = filterClientFacingReportItems([
    ...(aiModule?.expert_findings ?? []),
    ...(aiModule?.hidden_insights ?? []),
    ...(aiModule?.category_specific_observations ?? []),
  ]);

  const aiRecs = (aiModule?.recommendations ?? []).map(
    (r: { title?: string; description?: string }) => r.title || r.description || ""
  ).filter(Boolean);
  const clientFacingAiRecs = filterClientFacingReportItems(aiRecs);

  const hasAI = aiFindings.length > 0;

  return {
    findings: hasAI ? aiFindings : filterClientFacingReportItems(rawFindings),
    recommendations: hasAI && clientFacingAiRecs.length > 0 ? clientFacingAiRecs : filterClientFacingReportItems(rawRecommendations),
    score: aiModule?.score_override ?? rawScore,
    isEstimated: !hasAI,
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Module grades config                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

const moduleGradesMeta: { key: keyof ReportScores["module_grades"]; label: string; icon: typeof MapPin }[] = [
  { key: "gbp_health", label: "Google", icon: MapPin },
  { key: "review_sentiment", label: "Reseñas", icon: Star },
  { key: "website_performance", label: "Sitio web", icon: Globe },
  { key: "tech_stack", label: "Tecnología", icon: Cpu },
  { key: "social_presence", label: "Redes", icon: Users },
  { key: "citation_consistency", label: "Directorios", icon: BookOpen },
  { key: "competitive_position", label: "Competencia", icon: Trophy },
  { key: "revenue_impact", label: "Ingresos", icon: DollarSign },
];

/** Colores de calificación sobre el encabezado azul marino (texto claro sobre fondo translúcido). */
const gradeColorByLevel: Record<string, string> = {
  excellent: "bg-emerald-400/15 text-emerald-200 border-emerald-300/25",
  good: "bg-sky-400/15 text-sky-100 border-sky-300/25",
  developing: "bg-amber-400/15 text-amber-100 border-amber-300/25",
  needs_attention: "bg-orange-400/15 text-orange-100 border-orange-300/25",
  unknown: "bg-white/10 text-white/80 border-white/20",
};

const gradeColor = (grade: string) => gradeColorByLevel[gradeLevel(grade)];

// Removed boldNumbers helper as per user request to drop highlight splitting

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Executive Summary Section                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function ExecutiveSummarySection({ scores, result }: { scores: ReportScores; result: AuditResult }) {
  const summaryData = result.executive_summary;
  const isStructured = typeof summaryData === "object" && summaryData !== null && "verdict_tier" in summaryData;
  const s = isStructured ? (summaryData as ExecutiveSummaryData) : null;

  // Revenue impact for the callout
  const revMid = result.revenue_impact?.total_monthly_leakage?.mid;
  const revAnnual = result.revenue_impact?.annual_impact?.mid;
  const showRevenueDollars = shouldShowRevenueDollars(result.revenue_impact);

  return (
    <Card className="overflow-hidden border-0 shadow-raised">
      {/* ── Hero bar: Score ring + verdict + module grades ─────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#16294a] via-brand-navy to-[#24508a] px-6 py-9 text-white sm:px-8">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-blue/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-brand-gold/15 blur-3xl" />
        <div className="relative flex flex-col items-center gap-8 md:flex-row">
          {/* Score ring */}
          <div className="flex-shrink-0 text-center">
            <ScoreRing score={scores.overall_score} grade={scores.overall_grade} size={150} variant="dark" />
            {(() => {
              const tier = getScoreTier(scores.overall_score);
              return (
                <p className={`eyebrow mt-2 ${tier.color}`}>
                  {tier.label}
                </p>
              );
            })()}
          </div>

          <div className="flex-1 text-center md:text-left">
            <h2 className="mb-1.5 animate-fade-in-up text-[22px] font-semibold text-white sm:text-[26px]">
              {s?.verdict_headline || "Resumen ejecutivo y calificación general"}
            </h2>
            {s && (
              <p className="max-w-xl animate-fade-in-up text-[15px] leading-relaxed text-white/75 stagger-1">
                {s.verdict_subline || s.verdict_context || ""}
              </p>
            )}

            {/* ── Module grades strip ──────────────────────────────────── */}
            <div className="flex flex-wrap gap-2 mt-5 animate-fade-in-up stagger-2">
              {moduleGradesMeta.map(({ key, label, icon: Icon }) => {
                const grade = scores.module_grades[key];
                if (!grade) return null;
                const displayLabel = key === "revenue_impact" && !showRevenueDollars ? "Impacto" : label;
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${gradeColor(grade)}`}
                  >
                    <Icon className="h-3 w-3" />
                    <span>{displayLabel}</span>
                    <span className="font-semibold">{localizeGrade(grade)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Revenue impact callout (right side) ────────────────────── */}
          {showRevenueDollars && revMid && revMid > 0 && (
            <div className="flex-shrink-0 text-center bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-6 py-4 animate-fade-in-up stagger-3">
              <p className="eyebrow mb-1 text-white/60">Fuga estimada de ingresos</p>
              <p className="text-3xl font-bold text-amber-300 tracking-tight">
                {formatCurrency(revMid)}
                <span className="text-sm font-normal text-amber-300/70">/mes</span>
              </p>
              {revAnnual && (
                <p className="text-xs text-white/50 mt-1">~{formatCurrency(revAnnual)} al año</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Body: Structured summary OR legacy text ────────────────────── */}
      <CardContent className="py-6">
        {s ? (
          <div className="space-y-8">
            {/* ── Section 1: Key Metrics at a Glance ────────────────────── */}
            {(() => {
              const statsData = filterUnverifiedRevenueStats(s.key_stats || s.key_data_points || [], result.revenue_impact);
              if (!Array.isArray(statsData) || statsData.length === 0) return null;
              return (
                <div className="animate-fade-in-up stagger-1">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5" /> Métricas clave
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {statsData.map((dp: any, i: number) => (
                      <div
                        key={i}
                        className={`rounded-lg border px-3 py-2.5 text-center ${dp.sentiment === "positive"
                          ? "bg-emerald-50/60 border-emerald-200/60"
                          : dp.sentiment === "negative"
                            ? "bg-red-50/60 border-red-200/60"
                            : "bg-slate-50 border-slate-200/60"
                          }`}
                      >
                        <p className={`text-lg font-bold tracking-tight ${dp.sentiment === "positive" ? "text-emerald-700"
                          : dp.sentiment === "negative" ? "text-red-700"
                            : "text-slate-700"
                          }`}>
                          {repairMojibakeText(String(dp.value))}
                        </p>
                        <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wider mt-0.5">
                          {repairMojibakeText(String(dp.label))}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Section 2: What the Data Reveals ──────────────────────── */}
            {(() => {
              const insights = s.three_insights || s.core_story || [];
              if (!Array.isArray(insights) || insights.length === 0) return null;
              return (
                <div className="animate-fade-in-up stagger-2">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" /> Lo que revelan los datos
                  </h3>
                  <div className="space-y-2.5">
                    {insights.map((paragraph: string, i: number) => (
                      <div key={i} className="flex gap-3 items-start">
                        <div className="mt-1.5 h-2 w-2 rounded-full bg-slate-300 flex-shrink-0" />
                        <p className="text-sm text-slate-600 leading-relaxed">{repairMojibakeText(paragraph)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="border-t border-slate-100" />

            {/* ── Section 3: Strengths & Weaknesses ─────────────────────── */}
            {(() => {
              const strength = s.top_strength;
              const gap = s.critical_gap || s.critical_weakness;
              if (!strength && !gap) return null;
              return (
                <div className="animate-fade-in-up stagger-3">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5" /> Fortalezas y debilidades
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {strength && (
                      <div className="flex gap-4 p-4 rounded-xl bg-emerald-50/70 border border-emerald-200/60">
                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-emerald-100 flex items-center justify-center">
                          <TrendingUp className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Principal fortaleza</div>
                          <h4 className="font-semibold text-slate-900 mt-0.5">
                            {humanizeModuleKey(strength.module)}
                            {((strength as any).headline || (strength as any).metric) && (
                              <span className="ml-2 text-sm font-normal text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                                {repairMojibakeText((strength as any).headline || (strength as any).metric)}
                              </span>
                            )}
                          </h4>
                          <p className="text-sm text-slate-600 mt-1">{repairMojibakeText((strength as any).detail || (strength as any).description)}</p>
                        </div>
                      </div>
                    )}

                    {gap && (
                      <div className="flex gap-4 p-4 rounded-xl bg-rose-50/70 border border-rose-200/60">
                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-rose-100 flex items-center justify-center">
                          <AlertOctagon className="h-5 w-5 text-rose-600" />
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-rose-600 uppercase tracking-wider">Brecha crítica</div>
                          <h4 className="font-semibold text-slate-900 mt-0.5">
                            {humanizeModuleKey((gap as any).module)}
                            {((gap as any).headline || (gap as any).metric) && (
                              <span className="ml-2 text-sm font-normal text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">
                                {repairMojibakeText((gap as any).headline || (gap as any).metric)}
                              </span>
                            )}
                          </h4>
                          <p className="text-sm text-slate-600 mt-1">{repairMojibakeText((gap as any).detail || (gap as any).description)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Section 4: Hidden Opportunity & Path Forward ──────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 animate-fade-in-up stagger-4">
              {s.hidden_opportunity && (
                <div className="lg:col-span-2">
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-brand-gold" /> Oportunidad oculta
                  </h3>
                  <div className="text-sm text-slate-600 leading-relaxed bg-amber-50/60 border border-amber-200/50 p-4 rounded-xl">
                    <div className="flex gap-3 items-start">
                      <div className="mt-1.5 h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
                      <p>{repairMojibakeText(s.hidden_opportunity)}</p>
                    </div>
                  </div>
                </div>
              )}
              {Array.isArray(s.path_forward) && s.path_forward.length > 0 && (
                <div className={s.hidden_opportunity ? "lg:col-span-3" : "lg:col-span-5"}>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 text-brand-blue" /> Próximos pasos recomendados
                  </h3>
                  <div className="space-y-2.5">
                    {s.path_forward.map((step, i) => (
                      <div key={i} className="flex gap-3 items-start bg-slate-50/80 border border-slate-100 rounded-lg px-4 py-3">
                        <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {step.priority}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{repairMojibakeText(step.action)}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{repairMojibakeText(step.outcome)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Closing statement / Bottom line ────────────────────────── */}
            {(s.bottom_line || s.closing_statement) && (
              <div className="pt-4 border-t border-slate-100 animate-fade-in-up stagger-5">
                <p className="text-sm italic text-slate-400 text-center">
                  &ldquo;{repairMojibakeText(String(s.bottom_line || s.closing_statement || ""))}&rdquo;
                </p>
              </div>
            )}
          </div>
        ) : (
          /* ── Legacy path: plain text summary ──────────────────────── */
          <LegacySummaryText text={typeof summaryData === "string" ? summaryData : ""} />
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Legacy text summary (backward compat for old reports)                      */
/* ─────────────────────────────────────────────────────────────────────────── */

function LegacySummaryText({ text }: { text: string }) {
  if (!text) return null;

  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    paragraphs.push(sentences.slice(i, i + 3).join(" ").trim());
  }

  return (
    <div className="text-sm text-slate-700 max-w-3xl space-y-4">
      {paragraphs.map((p, i) => (
        <p key={i} className="leading-relaxed">{p}</p>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Main page component                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

type EvidenceModuleRow = NonNullable<AuditResult["evidence"]>["modules"][number];

const evidenceStatusMeta: Record<
  EvidenceModuleRow["status"],
  {
    label: string;
    className: string;
    icon: typeof CheckCircle2;
  }
> = {
  collected: {
    label: "Recopilado",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  unavailable: {
    label: "Requiere configuración",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    icon: AlertCircle,
  },
  skipped: {
    label: "Omitido",
    className: "border-slate-200 bg-slate-50 text-slate-600",
    icon: Activity,
  },
  failed: {
    label: "Falló",
    className: "border-red-200 bg-red-50 text-red-700",
    icon: XCircle,
  },
  not_implemented: {
    label: "No disponible",
    className: "border-zinc-200 bg-zinc-50 text-zinc-700",
    icon: AlertOctagon,
  },
};

function formatEvidenceReason(reason: string): string {
  const clean = repairMojibakeText(reason);

  if (/collected real data for this module/i.test(clean)) {
    return "Se recopilaron datos reales para esta área.";
  }
  if (/citation consistency is not implemented/i.test(clean)) {
    return "El escaneo de directorios aún no está disponible.";
  }

  return clean
    .replace(/\bthis module\b/gi, "this area")
    .replace(/\bmodule\b/gi, "area")
    .replace(/\bnot implemented\b/gi, "not available yet");
}

function formatEvidenceModuleReason(module: EvidenceModuleRow): string {
  if (module.status === "not_implemented" && module.key === "citation_consistency") {
    return "El escaneo de directorios aún no está disponible.";
  }

  if (module.status === "collected") {
    const collectedCopy: Partial<Record<EvidenceModuleRow["key"], string>> = {
      gbp_health: "Se revisaron los campos actuales del perfil de Google mediante Google Places.",
      review_sentiment: "Se revisaron métricas de reseñas y una muestra de temas visibles.",
      website_performance: "Se tomó una medición móvil de PageSpeed para la URL disponible.",
      tech_stack: "Se revisó el HTML de la página principal y señales tecnológicas visibles.",
      social_presence: "Se revisaron perfiles sociales enlazados desde el sitio y su actividad visible.",
      competitive_comparison: "Se revisó una muestra de competidores cercanos; la relevancia puede variar.",
      revenue_impact: "Se revisaron señales cualitativas de impacto a partir de las brechas digitales.",
      business_intelligence: "Se revisaron señales comerciales locales de las sondas configuradas.",
      business_enrichment: "Se revisaron datos públicos e investigación citada para el contexto del negocio.",
    };
    const copy = collectedCopy[module.key];
    if (copy) return copy;
  }

  return formatEvidenceReason(module.reason ?? "");
}

function getEvidenceSummary(result: AuditResult, key: keyof AuditResult, showRevenueDollars = true): string {
  switch (key) {
    case "gbp_health": {
      const data = result.gbp_health;
      if (!data) return "";
      return `${data.rating ? `Calificación ${data.rating}/5` : "Calificación no disponible"}, ${data.review_count ?? 0} reseñas, perfil ${data.completeness_pct}% completo.`;
    }
    case "review_sentiment": {
      const data = result.review_sentiment;
      if (!data) return "";
      return `Calificación ${data.google_rating ?? "N/D"}/5, ${data.owner_response_rate ?? 0}% de respuestas del propietario, ${data.review_velocity ?? 0} reseñas por mes.`;
    }
    case "website_performance": {
      const data = result.website_performance;
      if (!data) return "";
      const lcp = data.core_web_vitals.lcp ? `LCP ${(data.core_web_vitals.lcp / 1000).toFixed(1)} s` : "LCP no disponible";
      return `Rendimiento móvil ${data.performance_score}/100, ${lcp}, ${data.ssl_valid ? "SSL válido" : "sin SSL"}.`;
    }
    case "tech_stack": {
      const data = result.tech_stack;
      if (!data) return "";
      const analytics = data.analytics.length > 0 ? data.analytics.join(", ") : "sin analítica detectada";
      return `Madurez digital ${data.digital_maturity_score}/100; ${analytics}.`;
    }
    case "social_presence": {
      const data = result.social_presence;
      if (!data) return "";
      return `${data.platforms_found} perfiles encontrados, ${data.platforms_active} activos, ${data.total_following.toLocaleString("es-SV")} seguidores en total.`;
    }
    case "citation_consistency": {
      const data = result.citation_consistency;
      if (!data) return "";
      return `${data.total_found} directorios encontrados, ${data.total_correct} correctos, ${data.total_inconsistent} inconsistentes, ${data.total_missing} faltantes.`;
    }
    case "competitive_comparison": {
      const data = result.competitive_comparison;
      if (!data) return "";
      return `${data.competitors.length} competidores cercanos comparados; posición actual: ${translateEnum(data.target_position).toLowerCase()}.`;
    }
    case "revenue_impact": {
      const data = result.revenue_impact;
      if (!data) return "";
      if (showRevenueDollars) {
        return `${formatCurrency(data.total_monthly_leakage.mid)} de fuga mensual modelada en ${data.leaks.length} áreas.`;
      }
      const assessment = data.opportunity_assessment;
      return `Solo señales digitales; impacto ${translateEnum(assessment?.impact_level ?? "qualitative").toLowerCase()}, confianza ${translateEnum(assessment?.confidence ?? "directional").toLowerCase()}.`;
    }
    default:
      return "";
  }
}

const coverageKindMeta = {
  checked: {
    label: "Verificado",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  sampled: {
    label: "Muestreado",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  not_checked: {
    label: "No verificado",
    className: "border-zinc-200 bg-zinc-50 text-zinc-700",
  },
} as const;

const coverageConfidenceMeta = {
  high: "Confianza alta",
  medium: "Confianza media",
  low: "Confianza baja",
} as const;

function AuditCoverageSummaryCard({ result }: { result: AuditResult }) {
  const coverage = buildAuditCoverageSummary(result);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-brand-blue" />
              Cobertura de la auditoría
            </CardTitle>
            <CardDescription>{coverage.confidence.detail}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              {coverage.counts.checked} verificados
            </Badge>
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
              {coverage.counts.sampled} muestreados
            </Badge>
            <Badge variant="outline" className="border-zinc-200 bg-zinc-50 text-zinc-700">
              {coverage.counts.notChecked} sin verificar
            </Badge>
            <Badge variant="outline">{{ Strong: "Cobertura sólida", Directional: "Cobertura orientativa", Limited: "Cobertura limitada" }[coverage.confidence.label]}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-3">
          {coverage.notes.map((note) => (
            <div key={note} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {note}
            </div>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {coverage.items.map((item) => {
            const meta = coverageKindMeta[item.coverage];
            return (
              <div key={item.key} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-900">{item.label}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={meta.className}>
                      {meta.label}
                    </Badge>
                    <Badge variant="outline" className="text-slate-600">
                      {coverageConfidenceMeta[item.confidence]}
                    </Badge>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceSourcesPanel({ result }: { result: AuditResult }) {
  const evidence = result.evidence;
  if (!evidence || evidence.modules.length === 0) return null;

  const sourceCounts = [
    { label: "recopiladas", value: evidence.summary.collected, className: "text-emerald-700" },
    { label: "por configurar", value: evidence.summary.unavailable, className: "text-amber-700" },
    { label: "omitidas", value: evidence.summary.skipped, className: "text-slate-600" },
    { label: "fallidas", value: evidence.summary.failed, className: "text-red-700" },
    { label: "no disponibles", value: evidence.summary.not_implemented, className: "text-zinc-700" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Fuentes de datos
            </CardTitle>
            <CardDescription>
              Qué utilizó esta auditoría, qué omitió y qué no pudo recopilar.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {sourceCounts.map((item) => (
              <Badge key={item.label} variant="outline" className={`gap-1 ${item.className}`}>
                <span className="font-semibold">{item.value}</span>
                <span>{item.label}</span>
              </Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          {evidence.modules.map((module) => {
            const meta = evidenceStatusMeta[module.status];
            const StatusIcon = meta.icon;
            return (
              <div
                key={module.key}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{module.label}</p>
                    <Badge variant="outline" className={`gap-1 ${meta.className}`}>
                      <StatusIcon className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Fuente: {module.source}
                  </p>
                  {module.reason && (
                    <p className="mt-1 text-sm text-slate-600">{formatEvidenceModuleReason(module)}</p>
                  )}
                </div>
                {module.status === "unavailable" && module.settings_key && (
                  <Link href="/settings" className="shrink-0">
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4" />
                      Abrir configuración
                    </Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AuditReportPage() {
  const params = useParams();
  const reportId = String(params.id ?? "");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revenueScenario, setRevenueScenario] = useState<"low" | "mid" | "high">("mid");

  useEffect(() => {
    async function fetchReport() {
      try {
        const res = await fetch(`/api/report/${reportId}`);
        if (!res.ok) throw new Error(res.status === 404 ? "Reporte no encontrado" : "No se pudo cargar el reporte");
        const data = await res.json();
        const repaired = repairMojibakeValue(data) as Report;
        setReport(
          repaired.result && repaired.type === "audit"
            ? { ...repaired, result: sanitizeAuditResultContent(repaired.result as AuditResult) }
            : repaired
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    }
    if (reportId) {
      fetchReport();
    } else {
      setError("Reporte no encontrado");
      setLoading(false);
    }
  }, [reportId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Cargando reporte…</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="mt-4 text-muted-foreground">{error || "Reporte no encontrado"}</p>
        <Link href="/audits" className="mt-4">
          <Button variant="outline"><ArrowLeft className="h-4 w-4" />Volver a auditorías</Button>
        </Link>
      </div>
    );
  }

  if (report.status === "processing" || report.status === "queued") {
    const input = report.input as AuditInput;
    return (
        <AuditLoading
          reportId={report.id}
          businessName={input.businessName}
          city={input.city}
          onComplete={(updated) => setReport(repairMojibakeValue(updated))}
        />
      );
  }

  if (report.status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <XCircle className="h-8 w-8 text-destructive" />
        <p className="mt-4 text-lg font-medium">La auditoría falló</p>
        <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">Revisa las llaves en Configuración o vuelve a intentarlo. En Vercel, verifica que la función no haya excedido su duración máxima.</p>
        <Link href="/audits/new" className="mt-4"><Button>Reintentar</Button></Link>
      </div>
    );
  }

  const auditInput = report.input as AuditInput;
  const result = report.result as AuditResult | undefined;
  const scores = report.scores;

  // Revenue scenario toggle — Conservative / Moderate / Aggressive
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">No hay datos de resultado disponibles</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/audits" className="press mb-2 inline-flex items-center gap-1 text-[14px] text-primary hover:opacity-80">
            <ArrowLeft className="h-3.5 w-3.5" /> Auditorías
          </Link>
          <h1 className="mt-1 text-[32px] font-semibold sm:text-[38px]">{auditInput.businessName}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {[auditInput.city, auditInput.state].filter(Boolean).join(", ")}
            {(auditInput.city || auditInput.state) ? " · " : ""}Auditado el {new Date(report.created_at).toLocaleDateString("es-SV", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/report/${params.id}/pdf`, "_blank")}>
            <Download className="h-4 w-4" />PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/report/${params.id}/docx`, "_blank")}>
            <FileText className="h-4 w-4" />Word
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/report/${params.id}/pptx`, "_blank")}>
            <Presentation className="h-4 w-4" />PowerPoint
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/report/${params.id}/xlsx`, "_blank")}>
            <Sheet className="h-4 w-4" />Excel
          </Button>
        </div>
      </div>

      {/* ═══════════════ Overall Executive Summary & Score ═══════════════ */}
      {scores && <ExecutiveSummarySection scores={scores} result={result} />}

      <AuditCoverageSummaryCard result={result} />

      <BusinessContextCard enrichment={result.business_enrichment} />

      {/* Business Intelligence — "Important Facts Uncovered" */}
      {result.business_intelligence && result.business_intelligence.signal_count > 0 && (
        <IntelligenceCard
          data={result.business_intelligence}
        />
      )}

      {/* Strategic Intelligence */}
      {result.ai_analysis?.strategic_intelligence && (
        <StrategicIntelligenceCard
          data={result.ai_analysis.strategic_intelligence}
          showRevenueDollars={shouldShowRevenueDollars(result.revenue_impact)}
        />
      )}

      {/* AI Deep Analysis */}
      {result.ai_analysis && (
        <AIAnalysisCard
          analysis={result.ai_analysis}
          enhancedRecommendations={result.enhanced_recommendations}
          categorySkill={result.category_skill_used}
          showRevenueDollars={shouldShowRevenueDollars(result.revenue_impact)}
        />
      )}

      {/* Detailed Evidence */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-[22px] font-semibold">Evidencia detallada</h2>
          <p className="text-[15px] text-muted-foreground">
            Expande cada sección para ver el estado de la fuente, las métricas, los hallazgos y las recomendaciones detrás de esta auditoría.
          </p>
        </div>

        <EvidenceSourcesPanel result={result} />

        <div className="grid gap-4">
        {result.gbp_health && (() => {
          const m = getModuleContent("gbp_health", result.gbp_health.findings, result.gbp_health.recommendations, result.gbp_health.score, result.ai_analysis);
          return (
            <ModuleCard title="Salud del perfil de Google Business" icon={<MapPin className="h-5 w-5" />} grade={result.gbp_health.grade} score={m.score} findings={m.findings} recommendations={m.recommendations} isEstimated={m.isEstimated} defaultCollapsed summary={getEvidenceSummary(result, "gbp_health")}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Calificación</span><p className="font-semibold">{result.gbp_health.rating ? `${result.gbp_health.rating} / 5.0` : "N/D"}</p></div>
                <div><span className="text-muted-foreground">Reseñas</span><p className="font-semibold">{result.gbp_health.review_count ?? "N/D"}</p></div>
                <div><span className="text-muted-foreground">Fotos</span><p className="font-semibold">{result.gbp_health.photos_count}</p></div>
                <div><span className="text-muted-foreground">Completitud</span><p className="font-semibold">{result.gbp_health.completeness_pct}%</p></div>
              </div>
            </ModuleCard>
          );
        })()}

        {result.review_sentiment && (() => {
          const m = getModuleContent("review_sentiment", result.review_sentiment.findings, result.review_sentiment.recommendations, result.review_sentiment.score, result.ai_analysis);
          return (
            <ModuleCard title="Sentimiento de reseñas y reputación" icon={<Star className="h-5 w-5" />} grade={result.review_sentiment.grade} score={m.score} findings={m.findings} recommendations={m.recommendations} isEstimated={m.isEstimated} defaultCollapsed summary={getEvidenceSummary(result, "review_sentiment")}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Calificación Google</span><p className="font-semibold">{result.review_sentiment.google_rating ?? "N/D"}</p></div>
                <div><span className="text-muted-foreground">Tasa de respuesta</span><p className="font-semibold">{result.review_sentiment.owner_response_rate ?? 0}%</p></div>
                <div><span className="text-muted-foreground">Tendencia</span><p className="font-semibold">{translateEnum(result.review_sentiment.trend_direction)}</p></div>
                <div><span className="text-muted-foreground">Ritmo</span><p className="font-semibold">{result.review_sentiment.review_velocity ?? 0}/mes</p></div>
              </div>
              <div className="mt-2">
                <div className="flex h-3 rounded-full overflow-hidden">
                  <div className="bg-green-400" style={{ width: `${result.review_sentiment.sentiment_breakdown.positive}%` }} />
                  <div className="bg-yellow-400" style={{ width: `${result.review_sentiment.sentiment_breakdown.neutral}%` }} />
                  <div className="bg-red-400" style={{ width: `${result.review_sentiment.sentiment_breakdown.negative}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{result.review_sentiment.sentiment_breakdown.positive}% positivas</span>
                  <span>{result.review_sentiment.sentiment_breakdown.neutral}% neutrales</span>
                  <span>{result.review_sentiment.sentiment_breakdown.negative}% negativas</span>
                </div>
              </div>
            </ModuleCard>
          );
        })()}

        {result.website_performance && (() => {
          const m = getModuleContent("website_performance", result.website_performance.findings, result.website_performance.recommendations, result.website_performance.score, result.ai_analysis);
          return (
            <ModuleCard title="Rendimiento del sitio web" icon={<Globe className="h-5 w-5" />} grade={result.website_performance.grade} score={m.score} findings={m.findings} recommendations={m.recommendations} isEstimated={m.isEstimated} defaultCollapsed summary={getEvidenceSummary(result, "website_performance")}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Rendimiento</span><p className="font-semibold">{result.website_performance.performance_score}/100</p></div>
                <div><span className="text-muted-foreground">SEO</span><p className="font-semibold">{result.website_performance.seo_score}/100</p></div>
                <div><span className="text-muted-foreground">Accesibilidad</span><p className="font-semibold">{result.website_performance.accessibility_score}/100</p></div>
                <div><span className="text-muted-foreground">SSL</span><p className="font-semibold">{result.website_performance.ssl_valid ? "Válido" : "Ausente"}</p></div>
              </div>
              <div className="flex gap-4 mt-2">
                {result.website_performance.core_web_vitals.lcp !== undefined && (
                  <div className="flex items-center gap-1 text-xs">
                    {result.website_performance.core_web_vitals.lcp_pass ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                    LCP: {(result.website_performance.core_web_vitals.lcp / 1000).toFixed(1)} s
                  </div>
                )}
                {result.website_performance.core_web_vitals.cls !== undefined && (
                  <div className="flex items-center gap-1 text-xs">
                    {result.website_performance.core_web_vitals.cls_pass ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                    CLS: {result.website_performance.core_web_vitals.cls}
                  </div>
                )}
              </div>
            </ModuleCard>
          );
        })()}

        {result.tech_stack && (() => {
          const m = getModuleContent("tech_stack", result.tech_stack.findings, result.tech_stack.recommendations, result.tech_stack.score, result.ai_analysis);
          return (
            <ModuleCard title="Tecnología y madurez digital" icon={<Cpu className="h-5 w-5" />} grade={result.tech_stack.grade} score={m.score} findings={m.findings} recommendations={m.recommendations} isEstimated={m.isEstimated} defaultCollapsed summary={getEvidenceSummary(result, "tech_stack")}>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div><span className="text-muted-foreground">CMS</span><p className="font-semibold">{result.tech_stack.cms || "Desconocido"}</p></div>
                <div><span className="text-muted-foreground">Analítica</span><p className="font-semibold">{result.tech_stack.analytics.length > 0 ? result.tech_stack.analytics.join(", ") : "Ninguna"}</p></div>
                <div><span className="text-muted-foreground">Reservas</span><p className="font-semibold">{result.tech_stack.booking_system || "Ninguno"}</p></div>
                <div><span className="text-muted-foreground">Chat</span><p className="font-semibold">{result.tech_stack.chat_widget || "Ninguno"}</p></div>
                <div><span className="text-muted-foreground">Pagos</span><p className="font-semibold">{result.tech_stack.payment_processor || "Ninguno"}</p></div>
                <div><span className="text-muted-foreground">Madurez</span><p className="font-semibold">{result.tech_stack.digital_maturity_score}/100</p></div>
              </div>
            </ModuleCard>
          );
        })()}

        {result.social_presence && (() => {
          const m = getModuleContent("social_presence", result.social_presence.findings, result.social_presence.recommendations, result.social_presence.score, result.ai_analysis);
          return (
            <ModuleCard title="Presencia en redes sociales" icon={<Users className="h-5 w-5" />} grade={result.social_presence.grade} score={m.score} findings={m.findings} recommendations={m.recommendations} isEstimated={m.isEstimated} defaultCollapsed summary={getEvidenceSummary(result, "social_presence")}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Plataformas</span><p className="font-semibold">{result.social_presence.platforms_found}</p></div>
                <div><span className="text-muted-foreground">Activas</span><p className="font-semibold">{result.social_presence.platforms_active}</p></div>
                <div><span className="text-muted-foreground">Seguidores</span><p className="font-semibold">{result.social_presence.total_following.toLocaleString("es-SV")}</p></div>
                <div><span className="text-muted-foreground">Datos consistentes</span><p className="font-semibold">{result.social_presence.nap_consistent ? "Sí" : "No"}</p></div>
              </div>
              <div className="mt-3 space-y-1">
                {result.social_presence.platforms.map((p, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                    <span className="font-medium">{p.name}</span>
                    <div className="flex items-center gap-2">
                      {p.found ? <Badge variant="secondary" className="text-xs">Encontrado</Badge> : <Badge variant="outline" className="text-xs text-muted-foreground">No encontrado</Badge>}
                      {p.is_active && <Badge className="text-xs bg-green-100 text-green-800">Activo</Badge>}
                      {p.follower_count !== undefined && <span className="text-muted-foreground">{p.follower_count.toLocaleString("es-SV")} seguidores</span>}
                    </div>
                  </div>
                ))}
              </div>
            </ModuleCard>
          );
        })()}

        {result.citation_consistency && (() => {
          const m = getModuleContent("citation_consistency", result.citation_consistency.findings, result.citation_consistency.recommendations, result.citation_consistency.score, result.ai_analysis);
          // Always estimated for citations since data is synthetic
          const citationIsEstimated = result.citation_consistency.is_mock ?? m.isEstimated;
          return (
            <ModuleCard
              title="Consistencia en directorios"
              icon={<BookOpen className="h-5 w-5" />}
              grade={result.citation_consistency.grade}
              score={m.score}
              findings={m.findings}
              recommendations={m.recommendations}
              isEstimated={citationIsEstimated}
              defaultCollapsed
              summary={getEvidenceSummary(result, "citation_consistency")}
              collapsedNotice="Basado en datos estimados: requiere un escaneo de directorios en vivo para verificar nombre, dirección y teléfono."
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Encontrados</span><p className="font-semibold">{result.citation_consistency.total_found}</p></div>
                <div><span className="text-muted-foreground">Correctos</span><p className="font-semibold text-green-600">{result.citation_consistency.total_correct}</p></div>
                <div><span className="text-muted-foreground">Inconsistentes</span><p className="font-semibold text-yellow-600">{result.citation_consistency.total_inconsistent}</p></div>
                <div><span className="text-muted-foreground">Faltantes</span><p className="font-semibold text-red-600">{result.citation_consistency.total_missing}</p></div>
              </div>
              <div className="mt-3 space-y-1">
                {result.citation_consistency.directories.map((d, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                    <span className="font-medium">{d.name}</span>
                    <div className="flex items-center gap-2">
                      {d.status === "found_correct" && <Badge className="text-xs bg-green-100 text-green-800">Correcto</Badge>}
                      {d.status === "found_inconsistent" && <Badge className="text-xs bg-yellow-100 text-yellow-800">Inconsistente</Badge>}
                      {d.status === "not_found" && <Badge variant="outline" className="text-xs text-red-600">No encontrado</Badge>}
                      {d.status === "unchecked" && <Badge variant="outline" className="text-xs">Sin verificar</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </ModuleCard>
          );
        })()}

        {result.competitive_comparison && (() => {
          const m = getModuleContent("competitive_comparison", result.competitive_comparison.findings, result.competitive_comparison.recommendations, result.competitive_comparison.score, result.ai_analysis);
          return (
            <ModuleCard title="Análisis competitivo" icon={<Trophy className="h-5 w-5" />} grade={result.competitive_comparison.grade} score={m.score} findings={m.findings} recommendations={m.recommendations} isEstimated={m.isEstimated} defaultCollapsed summary={getEvidenceSummary(result, "competitive_comparison")}>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-muted-foreground">Posición:</span>
                <Badge className={
                  result.competitive_comparison.target_position === "leader" ? "bg-green-100 text-green-800" :
                    result.competitive_comparison.target_position === "challenger" ? "bg-yellow-100 text-yellow-800" :
                      "bg-red-100 text-red-800"
                }>
                  {translateEnum(repairMojibakeText(result.competitive_comparison.target_position))}
                </Badge>
                {result.competitive_comparison.agentic_reconciled && (
                  <span className="text-[11px] font-medium text-brand-teal">✓ Competidores verificados con IA</span>
                )}
              </div>
              <div className="space-y-1 mt-2">
                {result.competitive_comparison.competitors.map((c, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                    <span className="font-medium">{repairMojibakeText(c.name)}</span>
                    <div className="flex items-center gap-3">
                      {c.rating && <span>{c.rating}★</span>}
                      {c.review_count && <span className="text-muted-foreground">{c.review_count} reseñas</span>}
                      <Badge variant="outline" className="text-xs">{translateEnum(c.estimated_position)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ModuleCard>
          );
        })()}

        {result.revenue_impact && (() => {
          const m = getModuleContent("revenue_impact", result.revenue_impact.findings, result.revenue_impact.recommendations, result.revenue_impact.score, result.ai_analysis);
          const showRevenueDollars = shouldShowRevenueDollars(result.revenue_impact);
          const findings = showRevenueDollars ? m.findings : visibleRevenueFindings(m.findings, result.revenue_impact);
          const scenarioLabels = { low: "Conservador", mid: "Moderado", high: "Agresivo" } as const;
          const scenarioColors = { low: "text-emerald-600", mid: "text-amber-600", high: "text-red-600" } as const;
          const activeLeakage = result.revenue_impact.total_monthly_leakage[revenueScenario];
          const activeAnnual = result.revenue_impact.annual_impact[revenueScenario];
          return (
            <ModuleCard title={showRevenueDollars ? "Análisis de impacto en ingresos" : "Señales de impacto en el negocio"} icon={<DollarSign className="h-5 w-5" />} grade={result.revenue_impact.grade} score={m.score} findings={findings} recommendations={m.recommendations} isEstimated={!showRevenueDollars || m.isEstimated} defaultCollapsed summary={getEvidenceSummary(result, "revenue_impact", showRevenueDollars)}>
              {showRevenueDollars ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground font-medium">Escenario</span>
                    <div className="flex rounded-full bg-secondary p-0.5 text-xs">
                      {(["low", "mid", "high"] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setRevenueScenario(s)}
                          className={`press rounded-full px-3 py-1.5 font-medium ${revenueScenario === s
                              ? "bg-card text-foreground shadow-card"
                              : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                          {scenarioLabels[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-muted-foreground">Fuga mensual</span>
                      <p className={`font-semibold ${scenarioColors[revenueScenario]}`}>{formatCurrency(activeLeakage)}</p>
                      <p className="text-[10px] text-muted-foreground">Estimación: {scenarioLabels[revenueScenario].toLowerCase()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Impacto anual</span>
                      <p className={`font-semibold ${scenarioColors[revenueScenario]}`}>{formatCurrency(activeAnnual)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">ROI al corregir</span>
                      <p className="font-semibold text-green-600">{result.revenue_impact.roi_if_fixed}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 mb-3">
                  <p className="font-semibold">No se encontró una fuente verificada de ingresos</p>
                  <p className="mt-1 text-amber-800">
                    Los datos públicos muestran señales de impacto, pero los ingresos son privados o no verificados. Este reporte no presenta fugas en dólares como oportunidad.
                  </p>
                  {result.revenue_impact.opportunity_assessment && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-amber-700/80">Nivel de impacto</span>
                        <p className="font-semibold">{translateEnum(result.revenue_impact.opportunity_assessment.impact_level)}</p>
                      </div>
                      <div>
                        <span className="text-amber-700/80">Confianza</span>
                        <p className="font-semibold">{translateEnum(result.revenue_impact.opportunity_assessment.confidence)}</p>
                      </div>
                      <div>
                        <span className="text-amber-700/80">Base</span>
                        <p className="font-semibold">Solo señales digitales</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2 mt-2">
                {result.revenue_impact.leaks.map((leak, idx: number) => (
                  <div key={idx} className="p-2 rounded bg-secondary/30 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{leak.category}</span>
                        {leak.severity && (
                          <Badge variant={leak.severity === "critical" ? "destructive" : "secondary"} className="text-[10px]">
                            {translateEnum(leak.severity)}
                          </Badge>
                        )}
                      </div>
                      {showRevenueDollars ? (
                        <span className={`font-semibold ${scenarioColors[revenueScenario]}`}>
                          {formatCurrency(leak[`${revenueScenario}_estimate` as "low_estimate" | "mid_estimate" | "high_estimate"])}/mes
                        </span>
                      ) : (
                        <span className="font-semibold text-muted-foreground">
                          {leak.confidence ? `Confianza ${leak.confidence}/10` : "Señal"}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {leak.contributing_factors.map((f: string, fi: number) => (
                        <Badge key={fi} variant="outline" className="text-xs">
                          {humanizeModuleReferences(showRevenueDollars ? f : stripDollarClaims(f))}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ModuleCard>
          );
        })()}
        </div>
      </section>

      {/* Basic Recommendations (only shown when AI analysis is NOT available) */}
      {!result.ai_analysis && result.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recomendaciones priorizadas</CardTitle>
            <CardDescription>Ordenadas por impacto y esfuerzo: empieza por arriba.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {result.recommendations.slice(0, 10).map((rec: Recommendation, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{rec.title}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] font-medium text-slate-500">
                      <span className={`flex items-center gap-1 ${rec.impact === "high" ? "text-amber-600" : "text-emerald-600"}`}>
                        <Zap className="h-3 w-3" /> Impacto {translateEnum(rec.impact).toLowerCase()}
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Esfuerzo {translateEnum(rec.effort).toLowerCase()}
                      </span>
                      <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">{humanizeModuleKey(rec.module)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
