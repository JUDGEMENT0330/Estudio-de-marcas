/**
 * Module 3: Website Performance & Technical Grade
 * Tool: run_pagespeed_audit
 */

import type { WebsitePerformanceResult } from "@/lib/db/types";
import { getProviderSecret } from "@/lib/config/provider-config";
import { unavailable, type UnavailableResult } from "./unavailable";

interface PageSpeedParams {
  url: string;
}

function scoreToGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export async function runPageSpeedAudit(
  params: PageSpeedParams
): Promise<{ analysis: WebsitePerformanceResult; rawLighthouse?: any } | UnavailableResult> {
  const apiKey = await getProviderSecret("google_pagespeed_api_key");

  if (!apiKey) {
    return unavailable(
      "pagespeed",
      "missing_api_key",
      "Configura GOOGLE_PAGESPEED_API_KEY para obtener datos reales de PageSpeed Insights."
    );
  }

  try {
    const url = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    url.searchParams.set("url", params.url);
    url.searchParams.set("strategy", "mobile");
    url.searchParams.set("key", apiKey);
    for (const category of ["performance", "accessibility", "seo", "best-practices"]) {
      url.searchParams.append("category", category);
    }

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return unavailable("pagespeed", "blocked", "Se alcanzó el límite de solicitudes de PageSpeed Insights.");
      }
      throw new Error(`PageSpeed API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const lighthouseResult = data.lighthouseResult;
    if (!lighthouseResult) {
      throw new Error("No Lighthouse result in PageSpeed response");
    }

    const categories = lighthouseResult.categories || {};
    const audits = lighthouseResult.audits || {};

    const performanceScore = Math.round((categories.performance?.score || 0) * 100);
    const accessibilityScore = Math.round((categories.accessibility?.score || 0) * 100);
    const seoScore = Math.round((categories.seo?.score || 0) * 100);
    const bestPracticesScore = Math.round((categories["best-practices"]?.score || 0) * 100);

    const lcp = audits["largest-contentful-paint"]?.numericValue;
    const cls = audits["cumulative-layout-shift"]?.numericValue;
    const inp = audits["interaction-to-next-paint"]?.numericValue || audits["total-blocking-time"]?.numericValue;

    const lcpPass = lcp ? lcp <= 2500 : false;
    const clsPass = cls ? cls <= 0.1 : false;
    const inpPass = inp ? inp <= 200 : false;
    const sslValid = params.url.startsWith("https://") || audits["is-on-https"]?.score === 1;
    const totalByteWeight = audits["total-byte-weight"]?.numericValue;
    const pageWeightMb = totalByteWeight
      ? Math.round((totalByteWeight / 1024 / 1024) * 100) / 100
      : undefined;
    const hasSchemaMarkup = audits["structured-data"]?.score === 1 || false;
    const viewportScore = audits["viewport"]?.score;
    const fontSizeScore = audits["font-size"]?.score;
    const mobileFriendly = viewportScore === 1 && (fontSizeScore === undefined || fontSizeScore === 1);

    const compositeScore = Math.round(
      performanceScore * 0.35 +
        accessibilityScore * 0.2 +
        seoScore * 0.25 +
        bestPracticesScore * 0.2
    );

    const findings: string[] = [];
    const recommendations: string[] = [];

    if (performanceScore < 50) {
      findings.push(`Rendimiento de ${performanceScore}/100: críticamente bajo`);
      recommendations.push("Atender con urgencia los problemas de rendimiento: los sitios lentos pierden visitantes móviles");
    } else if (performanceScore < 90) {
      findings.push(`Rendimiento de ${performanceScore}/100: con margen de mejora`);
    }

    if (!lcpPass && lcp) {
      findings.push(`Largest Contentful Paint (${(lcp / 1000).toFixed(1)} s) supera el umbral de 2.5 s`);
      recommendations.push("Optimizar el elemento de contenido más grande, comprimir imágenes y diferir recursos no críticos");
    }
    if (!clsPass && cls) {
      findings.push(`Cumulative Layout Shift (${cls.toFixed(3)}) supera el umbral de 0.1`);
      recommendations.push("Definir ancho y alto explícitos en imágenes y anuncios para evitar saltos de diseño");
    }
    if (!sslValid) {
      findings.push("El sitio web no se sirve por HTTPS");
      recommendations.push("Instalar un certificado SSL de inmediato");
    }
    if (pageWeightMb && pageWeightMb > 3) {
      findings.push(`Peso de página de ${pageWeightMb} MB es excesivo (meta: menos de 2 MB)`);
      recommendations.push("Comprimir imágenes, activar compresión de texto y eliminar código sin uso");
    }
    if (accessibilityScore < 70) {
      findings.push(`Accesibilidad de ${accessibilityScore}/100: requiere atención`);
      recommendations.push("Mejorar la accesibilidad con texto alternativo, jerarquía de encabezados y contraste de color");
    }
    if (seoScore < 80) {
      findings.push(`SEO de ${seoScore}/100: por debajo de las buenas prácticas`);
      recommendations.push("Agregar meta descripciones, una estructura de encabezados limpia y datos estructurados");
    }

    const analysis: WebsitePerformanceResult = {
      grade: scoreToGrade(compositeScore),
      score: compositeScore,
      url: params.url,
      performance_score: performanceScore,
      accessibility_score: accessibilityScore,
      seo_score: seoScore,
      best_practices_score: bestPracticesScore,
      core_web_vitals: {
        lcp: lcp ? Math.round(lcp) : undefined,
        inp: inp ? Math.round(inp) : undefined,
        cls: cls ? Math.round(cls * 1000) / 1000 : undefined,
        lcp_pass: lcpPass,
        inp_pass: inpPass,
        cls_pass: clsPass,
      },
      mobile_friendly: mobileFriendly,
      ssl_valid: sslValid,
      page_weight_mb: pageWeightMb,
      has_schema_markup: hasSchemaMarkup,
      has_clear_cta: true,
      findings,
      recommendations,
    };

    const rawLighthouse = {
      categories,
      audits: Object.fromEntries(
        Object.entries(audits)
          .filter(([, v]: [string, any]) => v && v.score !== null && v.score !== undefined)
          .slice(0, 25)
      ),
    };

    return { analysis, rawLighthouse };
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.message?.includes("timeout")) {
      return unavailable("pagespeed", "failed", "La solicitud a PageSpeed Insights excedió el tiempo de espera.");
    }
    return unavailable("pagespeed", "failed", `La auditoría de PageSpeed falló: ${err.message}`);
  }
}
