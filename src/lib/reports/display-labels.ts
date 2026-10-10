const MODULE_LABELS: Record<string, string> = {
  gbp_health: "Perfil de Google",
  review_sentiment: "Reseñas",
  website_performance: "Sitio web",
  tech_stack: "Tecnología",
  social_presence: "Redes sociales",
  citation_consistency: "Directorios",
  competitive_comparison: "Competencia",
  competitive_position: "Competencia",
  revenue_impact: "Impacto en el negocio",
};

/** Etiquetas de calificación: traduce reportes antiguos generados en inglés. */
const GRADE_LABELS_ES: Record<string, string> = {
  strong: "Fuerte",
  solid: "Sólido",
  developing: "En desarrollo",
  "needs attention": "Requiere atención",
  excellent: "Excelente",
  good: "Bueno",
};

export function localizeGrade(grade: string | undefined): string {
  if (!grade) return "";
  return GRADE_LABELS_ES[grade.trim().toLowerCase()] ?? grade;
}

/** Nivel de calificación normalizado (independiente del idioma). */
export type GradeLevel = "excellent" | "good" | "developing" | "needs_attention" | "unknown";

export function gradeLevel(grade: string | undefined, score?: number): GradeLevel {
  const g = (grade ?? "").toLowerCase();
  if (/^a$/.test(g) || /strong|excellent|leading|leader|fuerte|excelente|líder|lider/.test(g)) return "excellent";
  if (/^b$/.test(g) || /solid|good|well positioned|competitive|sólido|solido|bueno|competitiv/.test(g)) return "good";
  if (/^c$/.test(g) || /developing|emerging|growing|building|desarroll|emergente|crecimiento/.test(g)) return "developing";
  if (/^[df]$/.test(g) || /needs|attention|opportunity|lagging|atención|atencion|requiere|rezag|oportunidad/.test(g)) return "needs_attention";
  if (typeof score === "number") {
    if (score >= 80) return "excellent";
    if (score >= 60) return "good";
    if (score >= 40) return "developing";
    return "needs_attention";
  }
  return "unknown";
}

export function humanizeModuleKey(value: string | undefined): string {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  if (MODULE_LABELS[normalized]) return MODULE_LABELS[normalized];

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function humanizeModuleReferences(text: string | undefined): string {
  if (!text) return "";

  const withModuleLabels = Object.entries(MODULE_LABELS).reduce((current, [key, label]) => {
    return current.replace(new RegExp(`\\b${key}\\b`, "gi"), label);
  }, text);

  return withModuleLabels
    .replace(/\brevenue_basis\b/gi, "base de ingresos")
    .replace(/\bunverified_estimate\b/gi, "estimación no verificada")
    .replace(/\bverified_public\b/gi, "dato público verificado")
    .replace(/\buser_provided\b/gi, "dato del usuario");
}

export function cleanCategorySkillLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/^dynamic:/i, "").trim();
  const lower = clean.toLowerCase();

  if (lower.includes("dent")) return "Clínica dental";
  if (lower.includes("ice cream") || lower.includes("helad")) return "Heladería";
  if (lower.includes("restaurant") || lower.includes("cafe") || lower.includes("restaurante")) return "Restaurante";
  if (lower.includes("medical") || lower.includes("healthcare") || lower.includes("médic") || lower.includes("salud")) return "Clínica de salud";
  if (lower.includes("legal") || lower.includes("law") || lower.includes("abogad")) return "Firma de abogados";
  if (lower.includes("home service") || lower.includes("contractor") || lower.includes("hogar")) return "Servicios para el hogar";
  if (lower.includes("perfum") || lower.includes("fragrance")) return "Perfumería";

  if (clean.length > 34 || /^(independent|independiente)\b/i.test(clean)) return "Negocio local";
  return clean;
}

export function priorityPlanSubtitle(showRevenueDollars: boolean): string {
  if (showRevenueDollars) {
    return "Acciones secuenciadas por ROI (retorno de inversión) y orden de ejecución.";
  }

  return "Acciones secuenciadas por impacto esperado en el negocio y facilidad de ejecución.";
}
