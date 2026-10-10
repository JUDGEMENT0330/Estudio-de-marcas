"use client";

import {
  Gauge, TrendingDown, TrendingUp, AlertTriangle, ArrowUpRight,
  Timer, Target, BarChart3, Layers,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { stripDollarClaims } from "@/lib/reports/revenue-display";
import { humanizeModuleKey, humanizeModuleReferences } from "@/lib/reports/display-labels";
import type { StrategicIntelligence, DigitalMaturityTier } from "@/lib/db/types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MATURITY_CONFIG: Record<DigitalMaturityTier, { label: string; color: string; bg: string }> = {
  foundational: { label: "Básica", color: "text-red-700", bg: "bg-red-100" },
  developing:   { label: "En desarrollo", color: "text-orange-700", bg: "bg-orange-100" },
  competent:    { label: "Competente", color: "text-brand-navy", bg: "bg-brand-sky" },
  advanced:     { label: "Avanzada", color: "text-green-700", bg: "bg-green-100" },
  leading:      { label: "Líder", color: "text-emerald-700", bg: "bg-emerald-100" },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  major:    "bg-orange-100 text-orange-800 border-orange-200",
  moderate: "bg-yellow-100 text-yellow-800 border-yellow-200",
  minor:    "bg-slate-100 text-slate-600 border-slate-200",
};

function formatCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString("es-SV")}`;
}

/* ------------------------------------------------------------------ */
/*  Section 1: Digital Posture Overview                                */
/* ------------------------------------------------------------------ */

function DigitalPostureSection({
  tier,
  rationale,
  momentum,
  momentumLabel,
}: {
  tier: DigitalMaturityTier;
  rationale?: string;
  momentum: number;
  momentumLabel: string;
}) {
  const config = MATURITY_CONFIG[tier];
  // Momentum gauge: position from 0% (=-100) to 100% (=+100)
  const gaugePercent = Math.max(0, Math.min(100, (momentum + 100) / 2));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Digital Maturity */}
      <div className="rounded-2xl bg-secondary/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Madurez digital</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${config.bg} ${config.color}`}>
            {config.label}
          </span>
        </div>
        {rationale && (
          <p className="text-xs text-muted-foreground">{rationale}</p>
        )}
      </div>

      {/* Sentiment Momentum */}
      <div className="rounded-2xl bg-secondary/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          {momentum >= 0
            ? <TrendingUp className="h-4 w-4 text-green-600" />
            : <TrendingDown className="h-4 w-4 text-red-600" />
          }
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tendencia del sentimiento</span>
        </div>
        {/* Gauge bar */}
        <div className="relative h-3 rounded-full bg-gradient-to-r from-red-400 via-gray-300 to-green-400 mb-2">
          <div
            className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 border-white bg-gray-800 shadow-md"
            style={{ left: `calc(${gaugePercent}% - 10px)` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>-100</span>
          <span>0</span>
          <span>+100</span>
        </div>
        <p className="text-xs text-muted-foreground">{momentumLabel}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 2: Contextual Anchors                                      */
/* ------------------------------------------------------------------ */

function ContextualAnchorsSection({
  anchors,
}: {
  anchors: StrategicIntelligence["contextual_anchors"];
}) {
  if (!anchors || anchors.length === 0) return null;

  return (
    <div>
      <div className="mb-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          Cómo se compara este negocio
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">Basado en criterio experto de la categoría, no en estadísticas comparativas</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {anchors.map((a, i) => (
          <div key={i} className="rounded-2xl bg-secondary/60 p-3.5">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {humanizeModuleKey(a.module)}
            </span>
            <p className="text-xs text-muted-foreground mt-1">{a.anchor}</p>
            <p className="text-sm font-medium mt-1.5">{a.business_position}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 3: Cost of Inaction                                        */
/* ------------------------------------------------------------------ */

function CostOfInactionSection({
  projection,
  showRevenueDollars,
}: {
  projection: StrategicIntelligence["do_nothing_projection"];
  showRevenueDollars: boolean;
}) {
  if (!projection) return null;

  const narrative = humanizeModuleReferences(
    showRevenueDollars ? projection.narrative : stripDollarClaims(projection.narrative || "")
  );

  return (
    <div className="rounded-2xl bg-red-50/80 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-red-600" />
        <h4 className="text-sm font-medium text-red-800">
          {showRevenueDollars ? "Lo que cuesta no actuar" : "Lo que se arriesga al no actuar"}
        </h4>
      </div>
      {showRevenueDollars ? (
        <div className="grid grid-cols-3 gap-4 mb-3">
          {[
            { label: "3 meses", value: projection.month_3_cumulative },
            { label: "6 meses", value: projection.month_6_cumulative },
            { label: "12 meses", value: projection.month_12_cumulative },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <p className="text-lg font-bold text-red-700">{formatCurrency(item.value)}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-red-700/80 mb-3">
          Los ingresos no se verificaron con datos públicos ni del usuario, por lo que esta sección es cualitativa.
        </p>
      )}
      {narrative && (
        <p className="text-xs text-red-700/80 italic">{narrative}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 4: Competitive Gap Matrix                                  */
/* ------------------------------------------------------------------ */

function CompetitiveGapSection({
  matrix,
}: {
  matrix: StrategicIntelligence["competitive_gap_matrix"];
}) {
  if (!matrix || matrix.length === 0) return null;

  // Collect all unique dimension names across all competitors
  const allDimensions = Array.from(
    new Set(matrix.flatMap((row) => Object.keys(row.dimensions)))
  );

  if (allDimensions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Brechas frente a la competencia</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Competidor</th>
              {allDimensions.map((dim) => (
                <th key={dim} className="text-center py-2 px-2 font-medium text-muted-foreground capitalize">
                  {humanizeModuleKey(dim)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="py-2 pr-3 font-medium">{row.competitor_name}</td>
                {allDimensions.map((dim) => {
                  const cell = row.dimensions[dim];
                  if (!cell) return <td key={dim} className="text-center py-2 px-2 text-muted-foreground">—</td>;
                  return (
                    <td key={dim} className="text-center py-2 px-2">
                      <div className={`inline-flex flex-col items-center rounded px-2 py-1 border ${SEVERITY_COLORS[cell.gap_severity] || SEVERITY_COLORS.minor}`}>
                        <span className="font-medium">{cell.gap}</span>
                        <span className="text-[10px] opacity-70">{cell.target_value} vs {cell.competitor_value}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section 5: Upside Projections                                      */
/* ------------------------------------------------------------------ */

function UpsideSection({
  projections,
  showRevenueDollars,
}: {
  projections: StrategicIntelligence["upside_projections"];
  showRevenueDollars: boolean;
}) {
  if (!projections || projections.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <ArrowUpRight className="h-4 w-4 text-green-600" />
        <h4 className="text-sm font-medium">Lo que se desbloquea al corregir</h4>
      </div>
      <div className="space-y-3">
        {projections.map((p, i) => (
          <div key={i} className="rounded-2xl bg-emerald-50/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{p.action}</p>
                <p className="text-sm font-semibold text-green-700 mt-1">
                  {humanizeModuleReferences(showRevenueDollars ? p.revenue_upside : stripDollarClaims(p.revenue_upside))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {humanizeModuleReferences(showRevenueDollars ? p.secondary_benefits : stripDollarClaims(p.secondary_benefits))}
                </p>
              </div>
              <Badge variant="outline" className="flex-shrink-0 text-xs gap-1">
                <Timer className="h-3 w-3" />
                ~{p.estimated_weeks} semanas
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function StrategicIntelligenceCard({
  data,
  showRevenueDollars = true,
}: {
  data: StrategicIntelligence;
  showRevenueDollars?: boolean;
}) {
  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-brand-blue" />
          Inteligencia estratégica
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Section 1: Digital Posture */}
        {data.digital_maturity_tier && (
          <DigitalPostureSection
            tier={data.digital_maturity_tier}
            rationale={data.digital_maturity_rationale}
            momentum={data.sentiment_momentum ?? 0}
            momentumLabel={data.sentiment_momentum_label ?? ""}
          />
        )}

        {/* Section 2: Contextual Anchors */}
        <ContextualAnchorsSection anchors={data.contextual_anchors} />

        {/* Section 3: Cost of Inaction */}
        <CostOfInactionSection projection={data.do_nothing_projection} showRevenueDollars={showRevenueDollars} />

        {/* Section 4: Competitive Gap Matrix */}
        <CompetitiveGapSection matrix={data.competitive_gap_matrix} />

        {/* Section 5: Upside Projections */}
        <UpsideSection projections={data.upside_projections} showRevenueDollars={showRevenueDollars} />
      </CardContent>
    </Card>
  );
}
