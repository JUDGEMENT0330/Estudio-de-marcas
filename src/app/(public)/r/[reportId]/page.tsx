import { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import { localizeGrade, translateEnum } from "@/lib/reports/display-labels";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GradeBadge } from "@/components/reports/grade-badge";
import { ModuleCard } from "@/components/reports/module-card";
import { repairMojibakeValue } from "@/lib/text/repair";
import { sanitizeAuditResultContent } from "@/lib/reports/content-contract";
import {
  shouldShowRevenueDollars,
  visibleRevenueFindings,
} from "@/lib/reports/revenue-display";
import {
  MapPin, Star, Globe, Cpu, Users, BookOpen, Trophy, DollarSign,
  CheckCircle2, XCircle, Loader2, AlertCircle, ExternalLink,
  TrendingUp, BarChart3, Zap,
} from "lucide-react";
import type {
  Report, AuditResult, AuditInput, ScoutInput, ScoutResult,
  Recommendation, ReportScores,
} from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

function formatCurrency(n: number): string {
  return "$" + n.toLocaleString("es-SV", { maximumFractionDigits: 0 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-SV", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function fetchReport(reportId: string): Promise<Report | null> {
  try {
    const report = await db.getReportPublic(reportId);
    if (!report) return null;
    const repaired = repairMojibakeValue(report) as Report;
    return repaired.result && repaired.type === "audit"
      ? { ...repaired, result: sanitizeAuditResultContent(repaired.result as AuditResult) }
      : repaired;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ reportId: string }>;
}): Promise<Metadata> {
  const { reportId } = await params;
  const report = await fetchReport(reportId);

  if (!report) {
    return { title: `Reporte no encontrado | ${BRAND.appName}` };
  }

  if (report.type === "audit") {
    const input = report.input as AuditInput;
    const grade = report.scores?.overall_grade ?? "";
    const score = report.scores?.overall_score ?? 0;
    const title = `Auditoría digital de ${input.businessName}${grade ? ` — ${localizeGrade(grade)}` : ""} | ${BRAND.companyShort}`;
    const description = `Auditoría de salud digital de ${input.businessName}${input.city ? ` en ${input.city}` : ""}. Calificación general: ${score}/100.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "article",
        siteName: BRAND.appName,
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  }

  // Scout report
  const input = report.input as ScoutInput;
  const title = `Exploración de mercado: ${input.category} — ${input.city} | ${BRAND.companyShort}`;
  const description = `Reporte de inteligencia de mercado para negocios de ${input.category} en ${input.city}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article", siteName: BRAND.appName },
    twitter: { card: "summary_large_image", title, description },
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const report = await fetchReport(reportId);

  // ---- Not found ----
  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Reporte no encontrado</h1>
        <p className="mt-2 text-muted-foreground max-w-md">
          Es posible que el reporte haya expirado o que el enlace no sea válido.
        </p>
        <a
          href={APP_URL}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Ir a Estudio de Marcas <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    );
  }

  // ---- Expired ----
  if (report.expires_at && new Date(report.expires_at) < new Date()) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Reporte expirado</h1>
        <p className="mt-2 text-muted-foreground max-w-md">
          Este reporte expiró. Ejecuta una nueva auditoría para obtener resultados actualizados.
        </p>
        <a
          href={APP_URL}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Nueva auditoría <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    );
  }

  // ---- Processing ----
  if (report.status === "processing" || report.status === "queued") {
    return (
      <>
        {/* Auto-refresh every 5 seconds while processing */}
        <meta httpEquiv="refresh" content="5" />
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <h1 className="mt-6 text-2xl font-bold">Reporte en proceso</h1>
          <p className="mt-2 text-muted-foreground max-w-md">
            Estamos analizando los datos del negocio. Suele tardar unos minutos.
            Esta página se actualizará automáticamente.
          </p>
        </div>
      </>
    );
  }

  // ---- Failed ----
  if (report.status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <XCircle className="h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">No se pudo generar el reporte</h1>
        <p className="mt-2 text-muted-foreground max-w-md">
          Algo salió mal al generar este reporte.
          Intenta ejecutar una nueva auditoría.
        </p>
        <a
          href={APP_URL}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Try Again <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    );
  }

  // ---- Render based on type ----
  if (report.type === "scout") {
    return <ScoutReportView report={report} />;
  }

  return <AuditReportView report={report} />;
}

// ===========================================================================
// AUDIT REPORT VIEW
// ===========================================================================

function AuditReportView({ report }: { report: Report }) {
  const input = report.input as AuditInput;
  const result = report.result as AuditResult | undefined;
  const scores = report.scores;

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Sin datos disponibles</h1>
        <p className="mt-2 text-muted-foreground">
          Este reporte aún no contiene resultados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ---- Header ---- */}
      <header className="text-center space-y-4 pb-6 border-b border-border">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Reporte de salud digital
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          {input.businessName}
        </h1>
        <p className="text-muted-foreground">
          {input.city && `${input.city}, `}
          {input.state || ""}
          {(input.city || input.state) && " \u00B7 "}
          {formatDate(report.created_at)}
        </p>
        {scores && (
          <div className="flex justify-center pt-2">
            <GradeBadge grade={scores.overall_grade} score={scores.overall_score} size="lg" />
          </div>
        )}
      </header>

      {/* ---- Executive Summary ---- */}
      <section>
        <Card className="bg-gradient-to-br from-primary/5 via-transparent to-primary/5 border-primary/20">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <BarChart3 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-semibold text-lg mb-2">Resumen ejecutivo</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {typeof result.executive_summary === "string"
                    ? result.executive_summary
                    : result.executive_summary?.verdict_context || ""}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ---- Module Scorecard Row ---- */}
      {scores && <ModuleScorecardRow scores={scores} />}

      {/* ---- Module Sections ---- */}
      <section className="space-y-6">
        <h2 className="text-xl font-bold tracking-tight">Análisis detallado</h2>

        {result.gbp_health && (
          <ModuleCard
            title="Salud del perfil de Google Business"
            icon={<MapPin className="h-5 w-5" />}
            grade={result.gbp_health.grade}
            score={result.gbp_health.score}
            findings={result.gbp_health.findings}
            recommendations={result.gbp_health.recommendations}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <MetricCell label="Calificación" value={result.gbp_health.rating ? `${result.gbp_health.rating} / 5.0` : "N/D"} />
              <MetricCell label="Reseñas" value={result.gbp_health.review_count ?? "N/D"} />
              <MetricCell label="Fotos" value={result.gbp_health.photos_count} />
              <MetricCell label="Completitud" value={`${result.gbp_health.completeness_pct}%`} />
            </div>
          </ModuleCard>
        )}

        {result.review_sentiment && (
          <ModuleCard
            title="Sentimiento de reseñas y reputación"
            icon={<Star className="h-5 w-5" />}
            grade={result.review_sentiment.grade}
            score={result.review_sentiment.score}
            findings={result.review_sentiment.findings}
            recommendations={result.review_sentiment.recommendations}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <MetricCell label="Calificación Google" value={result.review_sentiment.google_rating ?? "N/D"} />
              <MetricCell label="Tasa de respuesta" value={`${result.review_sentiment.owner_response_rate ?? 0}%`} />
              <MetricCell label="Tendencia" value={translateEnum(result.review_sentiment.trend_direction)} />
              <MetricCell label="Ritmo" value={`${result.review_sentiment.review_velocity ?? 0}/mes`} />
            </div>
            <div className="mt-3">
              <div className="flex h-3 rounded-full overflow-hidden">
                <div className="bg-green-400" style={{ width: `${result.review_sentiment.sentiment_breakdown.positive}%` }} />
                <div className="bg-yellow-400" style={{ width: `${result.review_sentiment.sentiment_breakdown.neutral}%` }} />
                <div className="bg-red-400" style={{ width: `${result.review_sentiment.sentiment_breakdown.negative}%` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{result.review_sentiment.sentiment_breakdown.positive}% Positive</span>
                <span>{result.review_sentiment.sentiment_breakdown.neutral}% Neutral</span>
                <span>{result.review_sentiment.sentiment_breakdown.negative}% Negative</span>
              </div>
            </div>
          </ModuleCard>
        )}

        {result.website_performance && (
          <ModuleCard
            title="Rendimiento del sitio web"
            icon={<Globe className="h-5 w-5" />}
            grade={result.website_performance.grade}
            score={result.website_performance.score}
            findings={result.website_performance.findings}
            recommendations={result.website_performance.recommendations}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <MetricCell label="Rendimiento" value={`${result.website_performance.performance_score}/100`} />
              <MetricCell label="SEO" value={`${result.website_performance.seo_score}/100`} />
              <MetricCell label="Accesibilidad" value={`${result.website_performance.accessibility_score}/100`} />
              <MetricCell label="SSL" value={result.website_performance.ssl_valid ? "Válido" : "Ausente"} />
            </div>
            <div className="flex gap-4 mt-3">
              {result.website_performance.core_web_vitals.lcp !== undefined && (
                <div className="flex items-center gap-1 text-xs">
                  {result.website_performance.core_web_vitals.lcp_pass
                    ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                    : <XCircle className="h-3 w-3 text-red-500" />}
                  LCP: {(result.website_performance.core_web_vitals.lcp / 1000).toFixed(1)}s
                </div>
              )}
              {result.website_performance.core_web_vitals.cls !== undefined && (
                <div className="flex items-center gap-1 text-xs">
                  {result.website_performance.core_web_vitals.cls_pass
                    ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                    : <XCircle className="h-3 w-3 text-red-500" />}
                  CLS: {result.website_performance.core_web_vitals.cls}
                </div>
              )}
              {result.website_performance.core_web_vitals.inp !== undefined && (
                <div className="flex items-center gap-1 text-xs">
                  {result.website_performance.core_web_vitals.inp_pass
                    ? <CheckCircle2 className="h-3 w-3 text-green-500" />
                    : <XCircle className="h-3 w-3 text-red-500" />}
                  INP: {result.website_performance.core_web_vitals.inp}ms
                </div>
              )}
            </div>
          </ModuleCard>
        )}

        {result.tech_stack && (
          <ModuleCard
            title="Tecnología y madurez digital"
            icon={<Cpu className="h-5 w-5" />}
            grade={result.tech_stack.grade}
            score={result.tech_stack.score}
            findings={result.tech_stack.findings}
            recommendations={result.tech_stack.recommendations}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <MetricCell label="CMS" value={result.tech_stack.cms || "Desconocido"} />
              <MetricCell label="Analítica" value={result.tech_stack.analytics.length > 0 ? result.tech_stack.analytics.join(", ") : "Ninguna"} />
              <MetricCell label="Reservas" value={result.tech_stack.booking_system || "Ninguno"} />
              <MetricCell label="Chat" value={result.tech_stack.chat_widget || "Ninguno"} />
              <MetricCell label="Pagos" value={result.tech_stack.payment_processor || "Ninguno"} />
              <MetricCell label="Madurez" value={`${result.tech_stack.digital_maturity_score}/100`} />
            </div>
          </ModuleCard>
        )}

        {result.social_presence && (
          <ModuleCard
            title="Presencia en redes sociales"
            icon={<Users className="h-5 w-5" />}
            grade={result.social_presence.grade}
            score={result.social_presence.score}
            findings={result.social_presence.findings}
            recommendations={result.social_presence.recommendations}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <MetricCell label="Plataformas" value={result.social_presence.platforms_found} />
              <MetricCell label="Activas" value={result.social_presence.platforms_active} />
              <MetricCell label="Seguidores" value={result.social_presence.total_following.toLocaleString("es-SV")} />
              <MetricCell label="Datos consistentes" value={result.social_presence.nap_consistent ? "Sí" : "No"} />
            </div>
            <div className="mt-3 space-y-1">
              {result.social_presence.platforms.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                  <span className="font-medium">{p.name}</span>
                  <div className="flex items-center gap-2">
                    {p.found
                      ? <Badge variant="secondary" className="text-xs">Encontrado</Badge>
                      : <Badge variant="outline" className="text-xs text-muted-foreground">No encontrado</Badge>}
                    {p.is_active && <Badge className="text-xs bg-green-100 text-green-800">Activo</Badge>}
                    {p.follower_count !== undefined && (
                      <span className="text-muted-foreground">{p.follower_count.toLocaleString()} followers</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ModuleCard>
        )}

        {result.citation_consistency && (
          <ModuleCard
            title="Consistencia en directorios"
            icon={<BookOpen className="h-5 w-5" />}
            grade={result.citation_consistency.grade}
            score={result.citation_consistency.score}
            findings={result.citation_consistency.findings}
            recommendations={result.citation_consistency.recommendations}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <MetricCell label="Encontrados" value={result.citation_consistency.total_found} />
              <MetricCell label="Correctos" value={result.citation_consistency.total_correct} className="text-green-600" />
              <MetricCell label="Inconsistentes" value={result.citation_consistency.total_inconsistent} className="text-yellow-600" />
              <MetricCell label="Faltantes" value={result.citation_consistency.total_missing} className="text-red-600" />
            </div>
            <div className="mt-3 space-y-1">
              {result.citation_consistency.directories.map((d, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
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
        )}

        {result.competitive_comparison && (
          <ModuleCard
            title="Análisis competitivo"
            icon={<Trophy className="h-5 w-5" />}
            grade={result.competitive_comparison.grade}
            score={result.competitive_comparison.score}
            findings={result.competitive_comparison.findings}
            recommendations={result.competitive_comparison.recommendations}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm text-muted-foreground">Posición:</span>
              <Badge className={
                result.competitive_comparison.target_position === "leader"
                  ? "bg-green-100 text-green-800"
                  : result.competitive_comparison.target_position === "challenger"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"
              }>
                {result.competitive_comparison.target_position.charAt(0).toUpperCase() + result.competitive_comparison.target_position.slice(1)}
              </Badge>
            </div>
            {result.competitive_comparison.strengths.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-semibold text-green-700 mb-1">Fortalezas</p>
                <div className="flex flex-wrap gap-1">
                  {result.competitive_comparison.strengths.map((s, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
            {result.competitive_comparison.weaknesses.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-red-700 mb-1">Debilidades</p>
                <div className="flex flex-wrap gap-1">
                  {result.competitive_comparison.weaknesses.map((w, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{w}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1 mt-2">
              {result.competitive_comparison.competitors.map((c, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
                  <span className="font-medium">{c.name}</span>
                  <div className="flex items-center gap-3">
                    {c.rating && <span>{c.rating} &#9733;</span>}
                    {c.review_count && <span className="text-muted-foreground">{c.review_count} reseñas</span>}
                    <Badge variant="outline" className="text-xs">{translateEnum(c.estimated_position)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </ModuleCard>
        )}

        {result.revenue_impact && (() => {
          const showRevenueDollars = shouldShowRevenueDollars(result.revenue_impact);
          return (
          <ModuleCard
            title={showRevenueDollars ? "Análisis de impacto en ingresos" : "Señales de impacto en el negocio"}
            icon={<DollarSign className="h-5 w-5" />}
            grade={result.revenue_impact.grade}
            score={result.revenue_impact.score}
            findings={showRevenueDollars ? result.revenue_impact.findings : visibleRevenueFindings(result.revenue_impact.findings, result.revenue_impact)}
            recommendations={result.revenue_impact.recommendations}
          >
            {showRevenueDollars ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-3">
                <div>
                  <span className="text-muted-foreground">Fuga mensual (est.)</span>
                  <p className="font-semibold text-red-600">{formatCurrency(result.revenue_impact.total_monthly_leakage.mid)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Impacto anual</span>
                  <p className="font-semibold text-red-600">{formatCurrency(result.revenue_impact.annual_impact.mid)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">ROI al corregir</span>
                  <p className="font-semibold text-green-600">{result.revenue_impact.roi_if_fixed}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 mb-3">
                <p className="font-semibold">No se encontró una fuente verificada de ingresos</p>
                <p className="mt-1 text-amber-800">
                  Los datos públicos muestran señales de impacto, pero los ingresos son privados o no verificados. Este reporte no presenta fugas en dólares como oportunidad.
                </p>
              </div>
            )}
            <div className="space-y-2 mt-2">
              {result.revenue_impact.leaks.map((leak, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-secondary/30 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{leak.category}</span>
                    {showRevenueDollars ? (
                      <span className="text-red-600 font-semibold">{formatCurrency(leak.mid_estimate)}/mes</span>
                    ) : (
                      <span className="text-muted-foreground font-semibold">{leak.confidence ? `${leak.confidence}/10 confidence` : "Signal"}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {leak.contributing_factors.map((f, fi) => (
                      <Badge key={fi} variant="outline" className="text-xs">{f}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ModuleCard>
          );
        })()}
      </section>

      {/* ---- Prioritized Recommendations ---- */}
      {result.recommendations.length > 0 && (
        <section>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">Recomendaciones priorizadas</CardTitle>
                  <CardDescription>Ordenadas por impacto y esfuerzo: empieza por arriba para lograr victorias rápidas.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {result.recommendations.slice(0, 10).map((rec: Recommendation, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{rec.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge
                          variant={rec.impact === "high" ? "destructive" : rec.impact === "medium" ? "warning" : "secondary"}
                          className="text-xs"
                        >
                          Impacto {translateEnum(rec.impact).toLowerCase()}
                        </Badge>
                        <Badge variant="outline" className="text-xs">Esfuerzo {translateEnum(rec.effort).toLowerCase()}</Badge>
                        <Badge variant="secondary" className="text-xs">{rec.module}</Badge>
                        {rec.estimated_revenue_impact && (
                          <Badge variant="success" className="text-xs">
                            {rec.estimated_revenue_impact}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ---- Footer / CTA ---- */}
      <ReportFooter />
    </div>
  );
}

// ===========================================================================
// SCOUT REPORT VIEW
// ===========================================================================

function ScoutReportView({ report }: { report: Report }) {
  const input = report.input as ScoutInput;
  const result = report.result as ScoutResult | undefined;

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold">Sin datos disponibles</h1>
        <p className="mt-2 text-muted-foreground">
          Este reporte de exploración aún no contiene resultados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ---- Header ---- */}
      <header className="text-center space-y-4 pb-6 border-b border-border">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Reporte de exploración de mercado
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          {input.category} in {input.city}
        </h1>
        <p className="text-muted-foreground">
          {formatDate(report.created_at)} &middot; {result.total_scanned} businesses scanned
        </p>
      </header>

      {/* ---- Market Summary ---- */}
      <section>
        <Card className="bg-gradient-to-br from-primary/5 via-transparent to-primary/5 border-primary/20">
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="font-semibold text-lg mb-2">Resumen del mercado</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {result.market_summary}
                </p>
                <div className="mt-3">
                  <span className="text-xs text-muted-foreground">Madurez digital promedio:</span>{" "}
                  <span className="text-sm font-semibold">{result.avg_digital_maturity}/100</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ---- Ranked Business List ---- */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Negocios clasificados</h2>
        {result.businesses.map((biz, idx) => (
          <Card key={idx} className="overflow-hidden">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start gap-4">
                {/* Rank badge */}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold flex-shrink-0">
                  {biz.rank}
                </span>
                <div className="flex-1 min-w-0 space-y-3">
                  {/* Business info */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{biz.business_name}</h3>
                      {biz.address && (
                        <p className="text-xs text-muted-foreground">{biz.address}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      {biz.google_rating && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                          {biz.google_rating}
                        </span>
                      )}
                      {biz.review_count !== undefined && (
                        <span className="text-muted-foreground">{biz.review_count} reviews</span>
                      )}
                    </div>
                  </div>

                  {/* Priority & pain */}
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge
                      variant={biz.priority_score >= 70 ? "destructive" : biz.priority_score >= 40 ? "warning" : "secondary"}
                      className="text-xs"
                    >
                      Priority: {biz.priority_score}/100
                    </Badge>
                    {biz.estimated_revenue_leak && (
                      <Badge variant="outline" className="text-xs text-red-600">
                        Est. leak: {biz.estimated_revenue_leak}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{biz.top_pain_hypothesis}</p>

                  {/* Mini audit grades */}
                  {biz.mini_audit && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1 border-t border-border/50">
                      {biz.mini_audit.gbp_health && (
                        <span><MapPin className="inline h-3 w-3 mr-0.5 text-muted-foreground" />GBP: <strong>{biz.mini_audit.gbp_health.grade}</strong></span>
                      )}
                      {biz.mini_audit.review_sentiment && (
                        <span><Star className="inline h-3 w-3 mr-0.5 text-muted-foreground" />Reviews: <strong>{biz.mini_audit.review_sentiment.grade}</strong></span>
                      )}
                      {biz.mini_audit.website_performance && (
                        <span><Globe className="inline h-3 w-3 mr-0.5 text-muted-foreground" />Web: <strong>{biz.mini_audit.website_performance.grade}</strong></span>
                      )}
                      {biz.mini_audit.tech_stack && (
                        <span><Cpu className="inline h-3 w-3 mr-0.5 text-muted-foreground" />Tech: <strong>{biz.mini_audit.tech_stack.grade}</strong></span>
                      )}
                      {biz.mini_audit.social_presence && (
                        <span><Users className="inline h-3 w-3 mr-0.5 text-muted-foreground" />Social: <strong>{biz.mini_audit.social_presence.grade}</strong></span>
                      )}
                      {biz.mini_audit.citation_consistency && (
                        <span><BookOpen className="inline h-3 w-3 mr-0.5 text-muted-foreground" />Citations: <strong>{biz.mini_audit.citation_consistency.grade}</strong></span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* ---- CTA for full audits ---- */}
      <section className="text-center py-8">
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="py-8">
            <h2 className="text-xl font-bold mb-2">¿Quieres profundizar?</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-lg mx-auto">
              Ejecuta una auditoría completa de 8 módulos sobre cualquiera de estos negocios para obtener
              hallazgos detallados, análisis de impacto y recomendaciones priorizadas.
            </p>
            <a
              href={APP_URL}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Ejecutar auditorías <ExternalLink className="h-4 w-4" />
            </a>
          </CardContent>
        </Card>
      </section>

      {/* ---- Footer ---- */}
      <ReportFooter />
    </div>
  );
}

// ===========================================================================
// SHARED COMPONENTS
// ===========================================================================

function ModuleScorecardRow({ scores }: { scores: ReportScores }) {
  const modules: { key: keyof ReportScores["module_grades"]; label: string; icon: React.ReactNode }[] = [
    { key: "gbp_health", label: "Google", icon: <MapPin className="h-3.5 w-3.5" /> },
    { key: "review_sentiment", label: "Reseñas", icon: <Star className="h-3.5 w-3.5" /> },
    { key: "website_performance", label: "Sitio web", icon: <Globe className="h-3.5 w-3.5" /> },
    { key: "tech_stack", label: "Tecnología", icon: <Cpu className="h-3.5 w-3.5" /> },
    { key: "social_presence", label: "Redes", icon: <Users className="h-3.5 w-3.5" /> },
    { key: "citation_consistency", label: "Directorios", icon: <BookOpen className="h-3.5 w-3.5" /> },
    { key: "competitive_position", label: "Competencia", icon: <Trophy className="h-3.5 w-3.5" /> },
    { key: "revenue_impact", label: "Ingresos", icon: <DollarSign className="h-3.5 w-3.5" /> },
  ];

  const gradeColorMap: Record<string, string> = {
    A: "bg-green-100 text-green-800 border-green-200",
    B: "bg-blue-100 text-blue-800 border-blue-200",
    C: "bg-yellow-100 text-yellow-800 border-yellow-200",
    D: "bg-orange-100 text-orange-800 border-orange-200",
    F: "bg-red-100 text-red-800 border-red-200",
  };

  const available = modules.filter((m) => scores.module_grades[m.key]);

  return (
    <section>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {available.map((m) => {
          const grade = scores.module_grades[m.key]!;
          return (
            <div
              key={m.key}
              className="flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center"
            >
              <div className="text-muted-foreground">{m.icon}</div>
              <div
                className={`flex min-h-8 items-center justify-center rounded-full border px-2 text-[11px] font-semibold ${gradeColorMap[grade] || gradeColorMap.F}`}
              >
                {localizeGrade(grade)}
              </div>
              <span className="text-[10px] text-muted-foreground leading-tight">{m.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MetricCell({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className={`font-semibold ${className || ""}`}>{value}</p>
    </div>
  );
}

function ReportFooter() {
  return (
    <footer className="pt-8 pb-4 border-t border-border text-center space-y-3">
      <p className="text-xs text-muted-foreground">
        Elaborado por{" "}
        <a
          href={BRAND.website}
          className="font-semibold text-foreground hover:text-primary transition-colors"
        >
          {BRAND.company}
        </a>
        {" · "}{BRAND.email} · {BRAND.phone}
      </p>
      <a
        href={BRAND.website}
        className="press inline-flex items-center gap-2 rounded-full border border-primary/30 px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary/5"
      >
        Conoce Cyber Valtorix <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <p className="text-[10px] text-muted-foreground mt-4">
        Reporte generado automáticamente. Los resultados son estimaciones basadas en datos públicos.
      </p>
    </footer>
  );
}
