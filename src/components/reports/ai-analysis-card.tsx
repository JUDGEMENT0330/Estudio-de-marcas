"use client";

import {
  Brain, Link2, TrendingUp, AlertTriangle, Sparkles, Target,
  ChevronDown, Clock, Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { filterClientFacingReportItems } from "@/lib/reports/content-quality";
import { stripDollarClaims } from "@/lib/reports/revenue-display";
import {
  cleanCategorySkillLabel,
  humanizeModuleKey,
  humanizeModuleReferences,
  priorityPlanSubtitle,
  translateEnum,
} from "@/lib/reports/display-labels";
import type {
  AIAnalysisResult,
  EnhancedRecommendation,
  CrossModuleSynthesis,
  PriorityAction,
} from "@/lib/db/types";

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CausalChainItem({
  chain,
  showRevenueDollars,
}: {
  chain: CrossModuleSynthesis["causal_chains"][number];
  showRevenueDollars: boolean;
}) {
  const chainText = displayRevenueText(chain.chain, showRevenueDollars);
  const businessImpact = displayRevenueText(chain.business_impact, showRevenueDollars);
  const fixSequence = displayRevenueText(chain.fix_sequence, showRevenueDollars);

  return (
    <div className="rounded-2xl bg-secondary/60 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-700 flex-shrink-0 mt-0.5">
          <Link2 className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{chainText}</p>
          <p className="text-xs text-muted-foreground mt-1">{businessImpact}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {chain.modules_involved.map((m) => (
              <Badge key={m} variant="outline" className="text-xs">{humanizeModuleKey(m)}</Badge>
            ))}
          </div>
          <p className="text-xs text-primary font-medium mt-2">Secuencia de corrección: {fixSequence}</p>
        </div>
      </div>
    </div>
  );
}

function displayRevenueText(text: string | undefined, showRevenueDollars: boolean): string {
  if (!text) return "";
  const visible = showRevenueDollars ? text : stripDollarClaims(text);
  return humanizeModuleReferences(visible);
}

function PriorityActionItem({
  action,
  index,
  showRevenueDollars,
}: {
  action: PriorityAction;
  index: number;
  showRevenueDollars: boolean;
}) {
  const expectedRoi = displayRevenueText(action.expected_roi, showRevenueDollars);
  const rationale = displayRevenueText(action.rationale, showRevenueDollars);
  const unlocks = displayRevenueText(action.unlocks, showRevenueDollars);

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-black/[0.06] bg-card p-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold flex-shrink-0">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{action.action}</p>
        <p className="text-xs text-muted-foreground mt-1">{rationale}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="secondary" className="text-xs gap-1">
            <TrendingUp className="h-3 w-3" />
            {expectedRoi}
          </Badge>
          <Badge variant="outline" className="text-xs gap-1">
            <Clock className="h-3 w-3" />
            {action.timeframe}
          </Badge>
        </div>
        {unlocks && (
          <p className="text-xs text-green-700 mt-1.5">Desbloquea: {unlocks}</p>
        )}
      </div>
    </div>
  );
}

function EnhancedRecItem({
  rec,
  index,
  showRevenueDollars,
}: {
  rec: EnhancedRecommendation;
  index: number;
  showRevenueDollars: boolean;
}) {
  const description = displayRevenueText(rec.description, showRevenueDollars);
  const expectedOutcome = displayRevenueText(rec.expected_outcome, showRevenueDollars);

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-secondary/60 p-3.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
        {index + 1}
      </span>
      <div className="flex-1">
        <p className="text-sm font-medium">{rec.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge
            variant={rec.impact === "high" ? "destructive" : rec.impact === "medium" ? "secondary" : "outline"}
            className="text-xs"
          >
            Impacto {translateEnum(rec.impact).toLowerCase()}
          </Badge>
          <Badge variant="outline" className="text-xs">Esfuerzo {translateEnum(rec.effort).toLowerCase()}</Badge>
          <Badge variant="secondary" className="text-xs gap-1">
            <Clock className="h-3 w-3" />
            {rec.timeframe}
          </Badge>
        </div>
        {expectedOutcome && (
          <p className="text-xs text-green-700 mt-1.5">Resultado esperado: {expectedOutcome}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main card                                                          */
/* ------------------------------------------------------------------ */

interface AIAnalysisCardProps {
  analysis: AIAnalysisResult;
  enhancedRecommendations?: EnhancedRecommendation[];
  categorySkill?: string;
  showRevenueDollars?: boolean;
}

export function AIAnalysisCard({
  analysis,
  enhancedRecommendations,
  categorySkill,
  showRevenueDollars = true,
}: AIAnalysisCardProps) {
  const categoryLabel = cleanCategorySkillLabel(categorySkill);
  const synthesis = analysis.cross_module_synthesis ?? {
    causal_chains: [],
    hidden_strengths: [],
    compounding_gaps: [],
    competitive_narrative: "",
  };
  const actions = analysis.priority_action_plan ?? [];
  const quality = analysis.data_quality_assessment;
  const caveats = filterClientFacingReportItems(quality?.caveats ?? []);

  return (
    <div className="space-y-6">
      {/* ── Header badge ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Badge className="bg-primary/10 text-primary border-primary/20 gap-1.5">
          <Brain className="h-3.5 w-3.5" />
          Diagnóstico estratégico
        </Badge>
        {categoryLabel && (
          <Badge variant="outline" className="text-xs gap-1">
            <Sparkles className="h-3 w-3" />
            Contexto: {categoryLabel}
          </Badge>
        )}
        {quality && (
          <Badge variant="outline" className="text-xs">
            Confianza: {Math.round(quality.overall_confidence * 100)}%
          </Badge>
        )}
      </div>

      {/* ── Causal chains ──────────────────────────────────────────── */}
      {synthesis.causal_chains.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-red-600" />
              Cadenas causales
            </CardTitle>
            <CardDescription>
              Problemas que se acumulan entre áreas. Corregir la causa raíz puede desbloquear mejoras en cascada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {synthesis.causal_chains.map((chain, i) => (
              <CausalChainItem key={i} chain={chain} showRevenueDollars={showRevenueDollars} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Hidden strengths ───────────────────────────────────────── */}
      {synthesis.hidden_strengths.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-green-600" />
              Fortalezas ocultas
            </CardTitle>
            <CardDescription>
              Ventajas que el negocio tiene y que quizá no está aprovechando.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {synthesis.hidden_strengths.map((s, i) => (
                <div key={i} className="rounded-2xl bg-emerald-50/70 p-4">
                  <p className="text-sm font-medium text-green-900">{displayRevenueText(s.strength, showRevenueDollars)}</p>
                  <p className="text-xs text-green-700 mt-1">Oportunidad: {displayRevenueText(s.leverage_opportunity, showRevenueDollars)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Compounding gaps ───────────────────────────────────────── */}
      {synthesis.compounding_gaps.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Brechas que se potencian
            </CardTitle>
            <CardDescription>
              Debilidades que amplifican mutuamente su efecto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {synthesis.compounding_gaps.map((gap, i) => (
                <div key={i} className="rounded-2xl bg-amber-50/70 p-4">
                  <p className="text-sm font-medium text-amber-900">{displayRevenueText(gap.description, showRevenueDollars)}</p>
                  <p className="text-xs text-amber-700 mt-1">Impacto combinado: {displayRevenueText(gap.combined_impact, showRevenueDollars)}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {gap.involved_modules.map((m) => (
                      <Badge key={m} variant="outline" className="text-xs">{humanizeModuleKey(m)}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Competitive narrative ──────────────────────────────────── */}
      {synthesis.competitive_narrative && (
        <Card className="border-0 bg-gradient-to-br from-brand-sky/60 to-white">
          <CardContent className="py-5">
            <p className="text-sm italic text-foreground leading-relaxed">
              &ldquo;{displayRevenueText(synthesis.competitive_narrative, showRevenueDollars)}&rdquo;
            </p>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Brain className="h-3 w-3" /> Evaluación competitiva
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Priority action plan ───────────────────────────────────── */}
      {actions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Plan de acción prioritario
            </CardTitle>
            <CardDescription>
              {priorityPlanSubtitle(showRevenueDollars)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {actions.map((action, i) => (
              <PriorityActionItem key={i} action={action} index={i} showRevenueDollars={showRevenueDollars} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Enhanced recommendations ───────────────────────────────── */}
      {enhancedRecommendations && enhancedRecommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximos movimientos recomendados</CardTitle>
            <CardDescription>Priorizados por impacto, esfuerzo y resultado esperado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {enhancedRecommendations.map((rec, i) => (
              <EnhancedRecItem key={i} rec={rec} index={i} showRevenueDollars={showRevenueDollars} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Data quality note ──────────────────────────────────────── */}
      {quality && caveats.length > 0 && (
        <div className="rounded-2xl bg-secondary/70 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Notas sobre la calidad de los datos</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {caveats.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-muted-foreground/60 mt-0.5">·</span>
                {humanizeModuleReferences(c)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
