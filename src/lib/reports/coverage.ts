import type { AuditResult, EvidenceModuleKey, EvidenceStatus } from "@/lib/db/types";

export type CoverageKind = "checked" | "sampled" | "not_checked";
export type CoverageConfidence = "high" | "medium" | "low";

export interface AuditCoverageItem {
  key: EvidenceModuleKey;
  label: string;
  coverage: CoverageKind;
  confidence: CoverageConfidence;
  detail: string;
}

export interface AuditCoverageSummary {
  counts: Record<"checked" | "sampled" | "notChecked", number>;
  confidence: {
    label: "Strong" | "Directional" | "Limited";
    detail: string;
  };
  items: AuditCoverageItem[];
  notes: string[];
}

const AREA_LABELS: Partial<Record<EvidenceModuleKey, string>> = {
  gbp_health: "Perfil de Google",
  review_sentiment: "Reseñas",
  website_performance: "Sitio web",
  tech_stack: "Tecnología",
  social_presence: "Redes sociales",
  citation_consistency: "Directorios",
  competitive_comparison: "Competencia",
  revenue_impact: "Impacto en el negocio",
  business_intelligence: "Señales comerciales",
  business_enrichment: "Contexto del negocio",
};

function evidenceStatus(result: AuditResult, key: EvidenceModuleKey): EvidenceStatus | undefined {
  return result.evidence?.modules.find((module) => module.key === key)?.status;
}

function hasCollected(result: AuditResult, key: EvidenceModuleKey): boolean {
  return evidenceStatus(result, key) === "collected";
}

function notCheckedItem(key: EvidenceModuleKey, detail: string): AuditCoverageItem {
  return {
    key,
    label: AREA_LABELS[key] ?? key,
    coverage: "not_checked",
    confidence: "low",
    detail,
  };
}

function statusToNotCheckedDetail(status: EvidenceStatus | undefined): string {
  if (status === "unavailable") return "Requiere configuración antes de poder revisar esta área.";
  if (status === "failed") return "Se intentó, pero la recopilación falló en esta auditoría.";
  if (status === "skipped") return "Omitido porque la fuente requerida no estaba disponible.";
  if (status === "not_implemented") return "Aún no disponible en la app.";
  return "No hubo datos de origen disponibles para esta auditoría.";
}

export function buildAuditCoverageSummary(result: AuditResult): AuditCoverageSummary {
  const items: AuditCoverageItem[] = [];

  if (result.gbp_health && hasCollected(result, "gbp_health")) {
    items.push({
      key: "gbp_health",
      label: "Perfil de Google",
      coverage: "checked",
      confidence: result.gbp_health.review_count != null ? "high" : "medium",
      detail: "Se revisaron los campos actuales del perfil de Google: calificación, reseñas, fotos, horarios y sitio web enlazado.",
    });
  } else {
    items.push(notCheckedItem("gbp_health", statusToNotCheckedDetail(evidenceStatus(result, "gbp_health"))));
  }

  if (result.review_sentiment && hasCollected(result, "review_sentiment")) {
    items.push({
      key: "review_sentiment",
      label: "Reseñas",
      coverage: "sampled",
      confidence: result.review_sentiment.google_review_count && result.review_sentiment.google_review_count >= 50 ? "medium" : "low",
      detail: "Se revisó calificación, volumen de reseñas, respuestas del propietario, ritmo y una muestra de temas.",
    });
  } else {
    items.push(notCheckedItem("review_sentiment", statusToNotCheckedDetail(evidenceStatus(result, "review_sentiment"))));
  }

  if (result.website_performance && hasCollected(result, "website_performance")) {
    items.push({
      key: "website_performance",
      label: "Sitio web",
      coverage: "sampled",
      confidence: "medium",
      detail: "Se tomó una instantánea móvil (snapshot) de PageSpeed y Core Web Vitals para la URL disponible.",
    });
  } else {
    items.push(notCheckedItem("website_performance", statusToNotCheckedDetail(evidenceStatus(result, "website_performance"))));
  }

  if (result.tech_stack && hasCollected(result, "tech_stack")) {
    items.push({
      key: "tech_stack",
      label: "Tecnología",
      coverage: "sampled",
      confidence: "medium",
      detail: "Se revisó el HTML de la página principal y señales tecnológicas visibles; no es un inventario del backend.",
    });
  } else if (result.tech_stack) {
    items.push(notCheckedItem("tech_stack", statusToNotCheckedDetail(evidenceStatus(result, "tech_stack"))));
  }

  if (result.social_presence && hasCollected(result, "social_presence")) {
    items.push({
      key: "social_presence",
      label: "Redes sociales",
      coverage: "sampled",
      confidence: result.social_presence.platforms_found > 0 ? "medium" : "low",
      detail: "Se revisaron perfiles sociales enlazados y su actividad visible, no todo el historial de publicaciones.",
    });
  } else if (result.social_presence) {
    items.push(notCheckedItem("social_presence", statusToNotCheckedDetail(evidenceStatus(result, "social_presence"))));
  }

  const citationStatus = evidenceStatus(result, "citation_consistency");
  if (result.citation_consistency && hasCollected(result, "citation_consistency") && !result.citation_consistency.is_mock) {
    items.push({
      key: "citation_consistency",
      label: "Directorios",
      coverage: "sampled",
      confidence: "medium",
      detail: "Se revisaron los directorios disponibles de la fuente configurada.",
    });
  } else {
    items.push(notCheckedItem("citation_consistency", statusToNotCheckedDetail(citationStatus)));
  }

  if (result.competitive_comparison && hasCollected(result, "competitive_comparison")) {
    items.push({
      key: "competitive_comparison",
      label: "Competencia",
      coverage: "sampled",
      confidence: result.competitive_comparison.agentic_reconciled ? "medium" : "low",
      detail: result.competitive_comparison.agentic_reconciled
        ? "Se revisó una lista corta de competidores de la misma categoría reunida durante la investigación."
        : "Se revisó una muestra (sample) de competidores cercanos; la relevancia puede variar.",
    });
  } else if (result.competitive_comparison) {
    items.push(notCheckedItem("competitive_comparison", statusToNotCheckedDetail(evidenceStatus(result, "competitive_comparison"))));
  }

  if (result.revenue_impact && hasCollected(result, "revenue_impact")) {
    items.push({
      key: "revenue_impact",
      label: "Impacto en el negocio",
      coverage: "sampled",
      confidence: result.revenue_impact.show_revenue_dollars ? "medium" : "low",
      detail: result.revenue_impact.show_revenue_dollars
        ? "Se contrastaron las estimaciones de impacto con la base de ingresos verificada."
        : "Solo se revisaron señales cualitativas de impacto porque los ingresos no se verificaron.",
    });
  }

  if (result.business_enrichment && hasCollected(result, "business_enrichment")) {
    const citedResearchCount = result.business_enrichment.research_findings.length;
    items.push({
      key: "business_enrichment",
      label: "Contexto del negocio",
      coverage: citedResearchCount > 0 ? "sampled" : "checked",
      confidence: result.business_enrichment.facts.length > 0 ? "medium" : "low",
      detail: citedResearchCount > 0
        ? "Se revisaron datos públicos y una muestra de investigación citada para el contexto de negocio y mercado."
        : "Se revisaron datos públicos verificables para el contexto de negocio y mercado.",
    });
  } else if (evidenceStatus(result, "business_enrichment")) {
    items.push(notCheckedItem("business_enrichment", statusToNotCheckedDetail(evidenceStatus(result, "business_enrichment"))));
  }

  const counts = {
    checked: items.filter((item) => item.coverage === "checked").length,
    sampled: items.filter((item) => item.coverage === "sampled").length,
    notChecked: items.filter((item) => item.coverage === "not_checked").length,
  };

  const confidence =
    counts.notChecked >= 3
      ? {
          label: "Limited" as const,
          detail: "Varias fuentes no estuvieron disponibles: usa esto como punto de partida para investigar más.",
        }
      : counts.sampled > counts.checked
        ? {
            label: "Directional" as const,
            detail: "Hay datos suficientes para priorizar acciones, pero varias áreas son instantáneas o muestras.",
          }
        : {
            label: "Strong" as const,
            detail: "La mayoría de las fuentes disponibles se revisaron directamente en esta auditoría.",
          };

  const notes = [
    "Los resultados de sitio web y competencia son instantáneas de un momento dado.",
    "Los hallazgos de reseñas y redes usan muestras de señales visibles, no el historial completo.",
    counts.notChecked > 0
      ? "Revisa las áreas sin verificar para ver qué requiere configuración."
      : "No se reportaron vacíos para las fuentes configuradas.",
  ];

  return { counts, confidence, items, notes };
}
