/**
 * Business Intelligence — Intent Signals
 *
 * Synthesises "Important Facts Uncovered" from:
 *  1. OpenCorporates API (free tier — 50 req/day, no auth)
 *     → LLC filings, incorporation date, registered agent changes
 *  2. Existing audit module data
 *     → domain age, rapid review growth, tech maturity gaps, missing profiles
 *
 * Each signal has a type, headline, detail, source, confidence, and icon hint
 * so the UI can render it with maximum visual impact.
 */

import type {
  BusinessIntelligenceSignal,
  BusinessIntelligenceResult,
  GBPHealthResult,
  ReviewSentimentResult,
  WebsitePerformanceResult,
  TechStackResult,
  SocialPresenceResult,
  CitationConsistencyResult,
} from "@/lib/db/types";
import { getProviderSecret } from "@/lib/config/provider-config";

interface IntentSignalsParams {
  businessName: string;
  city?: string;
  state?: string;
  // Module outputs for synthesis
  gbpHealth?: GBPHealthResult;
  reviewSentiment?: ReviewSentimentResult;
  websitePerformance?: WebsitePerformanceResult;
  techStack?: TechStackResult;
  socialPresence?: SocialPresenceResult;
  citationConsistency?: CitationConsistencyResult;
}

// ---------------------------------------------------------------------------
// OpenCorporates API (free, no auth, 50 req/day)
// ---------------------------------------------------------------------------

interface OpenCorpCompany {
  name: string;
  company_number: string;
  jurisdiction_code: string;
  incorporation_date?: string;
  company_type?: string;
  current_status?: string;
  registered_address_in_full?: string;
  agent_name?: string;
  opencorporates_url?: string;
}

async function searchOpenCorporates(
  businessName: string,
  state?: string
): Promise<OpenCorpCompany | null> {
  try {
    const jurisdiction = state
      ? `us_${state.toLowerCase()}`
      : undefined;

    const params = new URLSearchParams({ q: businessName });
    if (jurisdiction) params.set("jurisdiction_code", jurisdiction);
    params.set("per_page", "5");

    const res = await fetch(
      `https://api.opencorporates.com/v0.4/companies/search?${params}`,
      { signal: AbortSignal.timeout(6000) }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const companies = data?.results?.companies;
    if (!companies?.length) return null;

    // Find best match — prefer exact-ish name match
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const target = normalise(businessName);

    const match =
      companies.find(
        (c: any) => normalise(c.company?.name || "") === target
      ) || companies[0];

    const co = match.company;
    if (!co) return null;

    return {
      name: co.name,
      company_number: co.company_number,
      jurisdiction_code: co.jurisdiction_code,
      incorporation_date: co.incorporation_date || undefined,
      company_type: co.company_type || undefined,
      current_status: co.current_status || undefined,
      registered_address_in_full: co.registered_address_in_full || undefined,
      agent_name: co.agent_name || undefined,
      opencorporates_url: co.opencorporates_url || undefined,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Signal generators
// ---------------------------------------------------------------------------

function signalsFromOpenCorporates(co: OpenCorpCompany): BusinessIntelligenceSignal[] {
  const signals: BusinessIntelligenceSignal[] = [];

  // Recent incorporation (< 2 years)
  if (co.incorporation_date) {
    const incDate = new Date(co.incorporation_date);
    const ageMonths = (Date.now() - incDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

    if (ageMonths <= 24) {
      signals.push({
        type: "recent_incorporation",
        headline: `Constituida recientemente (${incDate.toLocaleDateString("es-SV", { month: "short", year: "numeric" })})`,
        detail: `${co.name} se registró como ${co.company_type || "entidad comercial"} en ${co.jurisdiction_code.replace("us_", "").toUpperCase()} hace solo ${Math.round(ageMonths)} meses. Los negocios nuevos suelen invertir fuerte en presencia digital en sus primeros 2 años.`,
        source: "OpenCorporates",
        confidence: "high",
        date: co.incorporation_date,
        icon_hint: "file-text",
      });
    }

    // Business filing found (always informative)
    signals.push({
      type: "business_filing",
      headline: `${co.company_type || "Negocio"} registrado en ${co.jurisdiction_code.replace("us_", "").toUpperCase()}`,
      detail: `Registro oficial encontrado: ${co.name} (${co.company_number}), estado: ${co.current_status || "activo"}. Constituida el ${incDate.toLocaleDateString("es-SV", { month: "long", day: "numeric", year: "numeric" })}.`,
      source: "OpenCorporates",
      confidence: "high",
      date: co.incorporation_date,
      icon_hint: "building",
    });
  }

  return signals;
}

function signalsFromModuleData(params: IntentSignalsParams): BusinessIntelligenceSignal[] {
  const signals: BusinessIntelligenceSignal[] = [];

  // Domain age signal
  if (params.techStack?.domain_age_years !== undefined) {
    if (params.techStack.domain_age_years < 1) {
      signals.push({
        type: "domain_age",
        headline: "Dominio registrado este mismo año",
        detail: `El dominio del sitio tiene menos de 1 año: suele indicar un negocio nuevo, un cambio de marca o una expansión. Son los negocios que más necesitan SEO y marketing digital.`,
        source: "Domain WHOIS",
        confidence: "high",
        icon_hint: "calendar",
      });
    } else if (params.techStack.domain_age_years > 10) {
      signals.push({
        type: "domain_age",
        headline: `Presencia en línea consolidada (dominio de ${params.techStack.domain_age_years}+ años)`,
        detail: `El dominio está registrado desde hace más de ${params.techStack.domain_age_years} años: un negocio consolidado con valor de marca.`,
        source: "Domain WHOIS",
        confidence: "high",
        icon_hint: "building",
      });
    }
  }

  // Rapid review growth
  if (params.reviewSentiment?.review_velocity && params.reviewSentiment.review_velocity >= 8) {
    signals.push({
      type: "rapid_growth",
      headline: `Alto ritmo de reseñas: ${params.reviewSentiment.review_velocity} por mes`,
      detail: `Este negocio recibe ${params.reviewSentiment.review_velocity} reseñas nuevas en Google por mes, muy por encima del promedio local (2-4/mes). Sugiere crecimiento rápido de clientes o una gestión activa de reseñas.`,
      source: "Google Reviews",
      confidence: "high",
      icon_hint: "trending-up",
    });
  }

  // Improving trend
  if (params.reviewSentiment?.trend_direction === "improving" && params.reviewSentiment?.google_rating && params.reviewSentiment.google_rating >= 4.0) {
    signals.push({
      type: "rapid_growth",
      headline: "La reputación va en ascenso",
      detail: `El sentimiento de las reseñas mejora, con ${params.reviewSentiment.google_rating} estrellas en Google. Los negocios en ascenso suelen invertir en marketing para aprovechar el impulso.`,
      source: "Sentiment Analysis",
      confidence: "medium",
      icon_hint: "trending-up",
    });
  }

  // No website — massive opportunity signal
  if (params.gbpHealth && !params.gbpHealth.website) {
    signals.push({
      type: "expansion_signal",
      headline: "El perfil de Google Business no tiene sitio web enlazado",
      detail: `El negocio aparece en Google pero sin sitio web: pierde más del 70% de los prospectos potenciales en línea. Es la señal más clara de que necesita servicios digitales de inmediato.`,
      source: "Google Business Profile",
      confidence: "high",
      icon_hint: "zap",
    });
  }

  // Low digital maturity with good ratings
  if (
    params.techStack &&
    params.techStack.digital_maturity_score < 40 &&
    params.gbpHealth?.rating &&
    params.gbpHealth.rating >= 4.0
  ) {
    signals.push({
      type: "expansion_signal",
      headline: "Buena reputación, infraestructura digital débil",
      detail: `Con ${params.gbpHealth.rating} estrellas pero solo ${params.techStack.digital_maturity_score}/100 de madurez digital, el negocio tiene clientes leales pero no convierte bien el tráfico en línea. Gran oportunidad para servicios digitales.`,
      source: "Tech Stack + GBP Analysis",
      confidence: "high",
      icon_hint: "zap",
    });
  }

  // Missing from major directories - only emitted when real citation data exists.
  if (params.citationConsistency && params.citationConsistency.total_missing >= 5) {
    signals.push({
      type: "new_location",
      headline: `Ausente en ${params.citationConsistency.total_missing} directorios principales`,
      detail: `El negocio no aparece en ${params.citationConsistency.total_missing} de 12 directorios principales. Suele indicar una sede nueva, una mudanza reciente o falta de gestión de directorios.`,
      source: "Citation Scan",
      confidence: "medium",
      icon_hint: "map-pin",
    });
  }

  // No social media at all
  if (params.socialPresence && params.socialPresence.platforms_found === 0) {
    signals.push({
      type: "expansion_signal",
      headline: "Sin presencia en redes sociales",
      detail: `No se encontraron perfiles en redes sociales. Hoy es muy poco común e indica un negocio que aún no adopta el marketing digital: alta oportunidad para construir su presencia completa.`,
      source: "Social Scan",
      confidence: "high",
      icon_hint: "users",
    });
  } else if (params.socialPresence && params.socialPresence.platforms_active === 0 && params.socialPresence.platforms_found > 0) {
    signals.push({
      type: "expansion_signal",
      headline: "Cuentas sociales creadas pero inactivas",
      detail: `Se encontraron ${params.socialPresence.platforms_found} perfiles sociales, pero ninguno publica activamente. El negocio creó las cuentas y las abandonó: podría estar listo para reactivarlas con el aliado correcto.`,
      source: "Social Scan",
      confidence: "medium",
      icon_hint: "users",
    });
  }

  // High review count + low website score
  if (
    params.gbpHealth?.review_count &&
    params.gbpHealth.review_count >= 50 &&
    params.websitePerformance &&
    params.websitePerformance.performance_score < 50
  ) {
    signals.push({
      type: "expansion_signal",
      headline: "Negocio popular con un sitio web de bajo rendimiento",
      detail: `${params.gbpHealth.review_count} reseñas en Google muestran fuerte demanda, pero el sitio obtiene solo ${params.websitePerformance.performance_score}/100 en rendimiento. Los clientes los encuentran a pesar del sitio, no gracias a él.`,
      source: "PageSpeed + GBP Analysis",
      confidence: "high",
      icon_hint: "zap",
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Free public data probes (no API keys — just HTTP requests)
// ---------------------------------------------------------------------------

/** Check Wayback Machine for site history — completely free, no auth */
async function probeWaybackMachine(url: string): Promise<BusinessIntelligenceSignal[]> {
  const signals: BusinessIntelligenceSignal[] = [];
  try {
    const domain = new URL(url).hostname;
    const res = await fetch(
      `https://archive.org/wayback/available?url=${domain}&timestamp=20100101`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return signals;
    const data = await res.json();
    const snapshot = data?.archived_snapshots?.closest;

    if (snapshot?.timestamp) {
      const ts = snapshot.timestamp; // format: YYYYMMDDhhmmss
      const year = parseInt(ts.slice(0, 4));
      const currentYear = new Date().getFullYear();
      const age = currentYear - year;

      if (age >= 10) {
        signals.push({
          type: "domain_age",
          headline: `Sitio archivado desde ${year} (${age}+ años en línea)`,
          detail: `Wayback Machine tiene capturas de este sitio desde ${year}. Una presencia web de ${age} años indica un negocio consolidado con valor de marca a largo plazo.`,
          source: "Wayback Machine",
          confidence: "high",
          date: `${year}-01-01`,
          icon_hint: "building",
        });
      } else if (age <= 1) {
        signals.push({
          type: "domain_age",
          headline: "El sitio web apareció en línea recientemente",
          detail: `La primera captura en Wayback Machine es de ${year}. Es un sitio nuevo o reconstruido: el negocio podría estar creciendo o renovando su marca.`,
          source: "Wayback Machine",
          confidence: "medium",
          date: `${year}-01-01`,
          icon_hint: "calendar",
        });
      }
    } else {
      // No Wayback snapshots at all
      signals.push({
        type: "domain_age",
        headline: "Sin historial en archivos web",
        detail: "Wayback Machine no tiene capturas de este sitio. Suele significar que es muy nuevo o que bloquea el archivado: señales de un negocio al inicio de su camino digital.",
        source: "Wayback Machine",
        confidence: "medium",
        icon_hint: "calendar",
      });
    }
  } catch {
    // Timeout or network error — skip silently
  }
  return signals;
}

/** Check DNS MX records — reveals email provider (free, no auth) */
async function probeMXRecords(domain: string): Promise<BusinessIntelligenceSignal[]> {
  const signals: BusinessIntelligenceSignal[] = [];
  try {
    // Use public DNS-over-HTTPS (Google)
    const res = await fetch(
      `https://dns.google/resolve?name=${domain}&type=MX`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return signals;
    const data = await res.json();
    const answers = data?.Answer || [];

    const mxHosts = answers
      .filter((a: any) => a.type === 15) // MX records
      .map((a: any) => (a.data || "").toLowerCase());

    const mxString = mxHosts.join(" ");

    if (mxString.includes("google") || mxString.includes("gmail")) {
      if (mxString.includes("aspmx") || mxString.includes("googlemail")) {
        signals.push({
          type: "expansion_signal",
          headline: "Usa Google Workspace para su correo corporativo",
          detail: `El correo corporativo funciona con Google Workspace: hay cierta inversión digital, aunque muchos negocios con Workspace aún carecen de infraestructura de marketing.`,
          source: "DNS MX Records",
          confidence: "medium",
          icon_hint: "briefcase",
        });
      }
    } else if (mxString.includes("outlook") || mxString.includes("microsoft")) {
      signals.push({
        type: "expansion_signal",
        headline: "Usa Microsoft 365 para su correo corporativo",
        detail: `El correo corporativo funciona con Microsoft 365: operación establecida. Puede indicar que invierte en herramientas pero poco en presencia web.`,
        source: "DNS MX Records",
        confidence: "medium",
        icon_hint: "briefcase",
      });
    } else if (mxHosts.length === 0) {
      signals.push({
        type: "expansion_signal",
        headline: "Sin correo corporativo en el dominio",
        detail: `No hay registros MX en el dominio. Probablemente usan un correo gratuito (Gmail, Yahoo) para el negocio: señal clara de que necesitan apoyo en infraestructura digital.`,
        source: "DNS MX Records",
        confidence: "high",
        icon_hint: "zap",
      });
    }
  } catch {
    // DNS lookup failed — skip
  }
  return signals;
}

/** Check robots.txt and sitemap.xml — reveals SEO awareness (free, no auth) */
async function probeSEOBasics(url: string): Promise<BusinessIntelligenceSignal[]> {
  const signals: BusinessIntelligenceSignal[] = [];
  const origin = new URL(url).origin;

  const [robotsRes, sitemapRes] = await Promise.allSettled([
    fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(4000) }),
    fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(4000) }),
  ]);

  const hasRobots = robotsRes.status === "fulfilled" && robotsRes.value.ok;
  const hasSitemap = sitemapRes.status === "fulfilled" && sitemapRes.value.ok;

  if (!hasRobots && !hasSitemap) {
    signals.push({
      type: "expansion_signal",
      headline: "Sin robots.txt ni sitemap.xml: faltan bases de SEO",
      detail: `El sitio no tiene robots.txt ni sitemap.xml, requisitos básicos para que los buscadores descubran e indexen el contenido. Su ausencia sugiere que no se ha trabajado el SEO.`,
      source: "Website Probe",
      confidence: "high",
      icon_hint: "zap",
    });
  } else if (hasSitemap && hasRobots) {
    signals.push({
      type: "expansion_signal",
      headline: "Las bases de SEO están presentes",
      detail: `Existen robots.txt y sitemap.xml: hay al menos conciencia básica de SEO, aunque la calidad de estos archivos varía mucho.`,
      source: "Website Probe",
      confidence: "medium",
      icon_hint: "trending-up",
    });
  }

  return signals;
}

/** Check SSL certificate and security headers (free, no auth) */
async function probeSecurityPosture(url: string): Promise<BusinessIntelligenceSignal[]> {
  const signals: BusinessIntelligenceSignal[] = [];
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });

    const headers = res.headers;
    const hasHSTS = !!headers.get("strict-transport-security");
    const hasCSP = !!headers.get("content-security-policy");
    const hasXFrame = !!headers.get("x-frame-options");
    const securityScore = [hasHSTS, hasCSP, hasXFrame].filter(Boolean).length;

    if (securityScore === 0) {
      signals.push({
        type: "expansion_signal",
        headline: "El sitio no tiene encabezados de seguridad",
        detail: `Al sitio le faltan los encabezados de seguridad estándar (HSTS, CSP, X-Frame-Options): mínima inversión en seguridad y posible vulnerabilidad. Clara oportunidad de desarrollo web.`,
        source: "Security Headers",
        confidence: "high",
        icon_hint: "zap",
      });
    }

    // Check if site redirects HTTP → HTTPS properly
    if (url.startsWith("http://")) {
      const finalUrl = res.url;
      if (!finalUrl.startsWith("https://")) {
        signals.push({
          type: "expansion_signal",
          headline: "El sitio no usa HTTPS",
          detail: `El sitio no redirige a HTTPS. Google penaliza estos sitios en sus resultados y los navegadores muestran la advertencia "No seguro", lo que ahuyenta clientes.`,
          source: "SSL Check",
          confidence: "high",
          icon_hint: "zap",
        });
      }
    }
  } catch {
    // Fetch failed — site might be down or blocking HEAD requests
  }
  return signals;
}

// ---------------------------------------------------------------------------
// CrUX API — Chrome User Experience Report (uses GOOGLE_PLACES_API_KEY)
// Real-world Core Web Vitals from actual Chrome users. Far more credible
// than synthetic Lighthouse scores. Cost: $0 (quota: 150 req/day).
// ---------------------------------------------------------------------------

interface CrUXMetric {
  percentiles: { p75: number };
  histogram: { start: number; end?: number; density: number }[];
}

async function probeCrUX(url: string): Promise<BusinessIntelligenceSignal[]> {
  const signals: BusinessIntelligenceSignal[] = [];
  const apiKey = await getProviderSecret("google_places_api_key");
  if (!apiKey) return signals;

  try {
    const origin = new URL(url).origin;
    const res = await fetch(
      `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin }),
        signal: AbortSignal.timeout(6000),
      }
    );

    if (!res.ok) {
      // 404 = site has no CrUX data (too little traffic)
      if (res.status === 404) {
        signals.push({
          type: "expansion_signal",
          headline: "Sin datos de rendimiento de usuarios reales (tráfico muy bajo)",
          detail: `Chrome UX Report de Google no tiene datos de este sitio: recibe muy pocas visitas para generar métricas. Señal clara de tráfico web mínimo y necesidad de marketing digital.`,
          source: "Chrome UX Report",
          confidence: "high",
          icon_hint: "zap",
        });
      }
      return signals;
    }

    const data = await res.json();
    const metrics = data?.record?.metrics;
    if (!metrics) return signals;

    // LCP (Largest Contentful Paint) — p75
    const lcp = (metrics.largest_contentful_paint as CrUXMetric | undefined)
      ?.percentiles?.p75;
    // INP (Interaction to Next Paint) — p75
    const inp = (
      metrics.interaction_to_next_paint as CrUXMetric | undefined
    )?.percentiles?.p75;
    // CLS (Cumulative Layout Shift) — p75
    const cls = (
      metrics.cumulative_layout_shift as CrUXMetric | undefined
    )?.percentiles?.p75;

    // Count how many Core Web Vitals fail Google's thresholds
    let failures = 0;
    const failDetails: string[] = [];

    if (lcp !== undefined) {
      const lcpSec = (lcp / 1000).toFixed(1);
      if (lcp > 4000) {
        failures++;
        failDetails.push(`LCP ${lcpSec}s (poor — threshold 2.5s)`);
      } else if (lcp > 2500) {
        failDetails.push(`LCP ${lcpSec}s (needs improvement)`);
      }
    }
    if (inp !== undefined) {
      if (inp > 500) {
        failures++;
        failDetails.push(`INP ${inp}ms (poor — threshold 200ms)`);
      } else if (inp > 200) {
        failDetails.push(`INP ${inp}ms (needs improvement)`);
      }
    }
    if (cls !== undefined) {
      if (cls > 0.25) {
        failures++;
        failDetails.push(`CLS ${cls.toFixed(2)} (poor — threshold 0.1)`);
      } else if (cls > 0.1) {
        failDetails.push(`CLS ${cls.toFixed(2)} (needs improvement)`);
      }
    }

    if (failures >= 2) {
      signals.push({
        type: "expansion_signal",
        headline: `Falla ${failures} Core Web Vitals (datos de usuarios reales)`,
        detail: `Usuarios reales de Chrome experimentan: ${failDetails.join(", ")}. Son métricas de campo, no de laboratorio: es lo que viven los clientes, y Google las usa para posicionar.`,
        source: "Chrome UX Report",
        confidence: "high",
        icon_hint: "zap",
      });
    } else if (failures === 0 && failDetails.length === 0 && lcp !== undefined) {
      signals.push({
        type: "expansion_signal",
        headline: "Aprueba todos los Core Web Vitals (datos de usuarios reales)",
        detail: `Las métricas reales de Chrome muestran todos los Core Web Vitals en rango "bueno": el negocio ha invertido en rendimiento web y podría ser más sofisticado digitalmente que el promedio.`,
        source: "Chrome UX Report",
        confidence: "high",
        icon_hint: "trending-up",
      });
    }
  } catch {
    // Timeout or network error — skip
  }
  return signals;
}

// ---------------------------------------------------------------------------
// crt.sh — Certificate Transparency Logs (free, no auth)
// Reveals every SSL cert issued for a domain → exposes subdomains,
// which tells us what the business is building (app.*, shop.*, staging.*)
// ---------------------------------------------------------------------------

async function probeCertTransparency(
  domain: string
): Promise<BusinessIntelligenceSignal[]> {
  const signals: BusinessIntelligenceSignal[] = [];
  try {
    const res = await fetch(
      `https://crt.sh/?q=%25.${domain}&output=json`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (!res.ok) return signals;

    const certs: { common_name: string; name_value: string; not_before: string }[] =
      await res.json();

    if (!Array.isArray(certs) || certs.length === 0) {
      signals.push({
        type: "expansion_signal",
        headline: "No se encontraron certificados SSL para el dominio",
        detail: `No hay certificados emitidos para este dominio en los registros públicos de transparencia. Podría usar un certificado compartido o tener una infraestructura HTTPS mínima.`,
        source: "Certificate Transparency (crt.sh)",
        confidence: "medium",
        icon_hint: "zap",
      });
      return signals;
    }

    // Extract unique subdomains
    const subdomains = new Set<string>();
    for (const cert of certs) {
      const names = (cert.name_value || "").split("\n");
      for (const name of names) {
        const clean = name.trim().replace(/^\*\./, "").toLowerCase();
        if (clean && clean !== domain && clean.endsWith(domain)) {
          subdomains.add(clean);
        }
      }
    }

    // Interesting subdomain patterns
    const interesting: string[] = [];
    const patterns: Record<string, string> = {
      app: "web application",
      shop: "e-commerce store",
      store: "e-commerce store",
      staging: "development environment",
      dev: "development environment",
      api: "API backend",
      admin: "admin panel",
      portal: "customer portal",
      mail: "email server",
      blog: "content marketing",
      booking: "booking system",
      pay: "payment system",
    };

    Array.from(subdomains).forEach((sub) => {
      const prefix = sub.replace(`.${domain}`, "").split(".").pop() || "";
      if (patterns[prefix]) {
        interesting.push(`${prefix}.${domain} (${patterns[prefix]})`);
      }
    });

    if (subdomains.size >= 5) {
      signals.push({
        type: "expansion_signal",
        headline: `${subdomains.size} subdominios detectados: infraestructura digital compleja`,
        detail: `Los registros de certificados revelan ${subdomains.size} subdominios${interesting.length > 0 ? `, entre ellos: ${interesting.slice(0, 4).join(", ")}` : ""}. Sugiere una inversión importante en infraestructura digital.`,
        source: "Certificate Transparency (crt.sh)",
        confidence: "high",
        icon_hint: "building",
      });
    } else if (subdomains.size === 0) {
      signals.push({
        type: "expansion_signal",
        headline: "Un solo dominio, sin subdominios",
        detail: `Solo el dominio principal tiene certificados SSL; no hay subdominios como app.*, shop.* o blog.*. Es una presencia web simple sin servicios digitales adicionales.`,
        source: "Certificate Transparency (crt.sh)",
        confidence: "medium",
        icon_hint: "briefcase",
      });
    }

    // Check if they recently issued a new cert (signal of active management)
    const recentCerts = certs.filter((c) => {
      const issued = new Date(c.not_before);
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return issued > threeMonthsAgo;
    });

    if (recentCerts.length >= 3) {
      signals.push({
        type: "expansion_signal",
        headline: `${recentCerts.length} certificados SSL nuevos en los últimos 3 meses`,
        detail: `La emisión activa de certificados sugiere desarrollo o cambios de infraestructura en curso: el negocio invierte activamente en su presencia web.`,
        source: "Certificate Transparency (crt.sh)",
        confidence: "medium",
        icon_hint: "trending-up",
      });
    }
  } catch {
    // Timeout or parse error — crt.sh can be slow
  }
  return signals;
}

// ---------------------------------------------------------------------------
// US Census Bureau — Demographic context (free, no auth, no key)
// Median household income + population for the business's ZIP code.
// Gives the agent context: a dentist in a $120k median income ZIP is a
// different sell than one in a $35k ZIP.
// ---------------------------------------------------------------------------

interface CensusData {
  median_household_income?: number;
  total_population?: number;
  zip: string;
}

function extractZipFromAddress(address: string): string | null {
  // Match 5-digit ZIP (with optional +4)
  const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

async function probeCensus(address: string): Promise<BusinessIntelligenceSignal[]> {
  const signals: BusinessIntelligenceSignal[] = [];
  const zip = extractZipFromAddress(address);
  if (!zip) return signals;

  try {
    // ACS 5-Year data: B19013_001E = median household income, B01003_001E = total population
    const res = await fetch(
      `https://api.census.gov/data/2022/acs/acs5?get=B19013_001E,B01003_001E&for=zip%20code%20tabulation%20area:${zip}`,
      { signal: AbortSignal.timeout(6000) }
    );

    if (!res.ok) return signals;

    const data = await res.json();
    // Response format: [["B19013_001E","B01003_001E","zip..."], ["65000","32000","78701"]]
    if (!Array.isArray(data) || data.length < 2) return signals;

    const values = data[1];
    const income = parseInt(values[0]);
    const population = parseInt(values[1]);

    if (isNaN(income) || income < 0) return signals;

    const censusInfo: CensusData = {
      median_household_income: income,
      total_population: isNaN(population) ? undefined : population,
      zip,
    };

    // High-income area (> $85k median)
    if (censusInfo.median_household_income && censusInfo.median_household_income >= 85000) {
      signals.push({
        type: "expansion_signal",
        headline: `Located in high-income area ($${(censusInfo.median_household_income / 1000).toFixed(0)}k median income)`,
        detail: `ZIP ${zip} has a median household income of $${censusInfo.median_household_income.toLocaleString()}${censusInfo.total_population ? ` and a population of ${censusInfo.total_population.toLocaleString()}` : ""}. High-income areas mean customers with more spending power — digital marketing ROI is typically higher here.`,
        source: "US Census Bureau (ACS 5-Year)",
        confidence: "high",
        icon_hint: "map-pin",
      });
    }
    // Low-income area (< $40k median)
    else if (censusInfo.median_household_income && censusInfo.median_household_income < 40000) {
      signals.push({
        type: "expansion_signal",
        headline: `Located in value-conscious area ($${(censusInfo.median_household_income / 1000).toFixed(0)}k median income)`,
        detail: `ZIP ${zip} has a median household income of $${censusInfo.median_household_income.toLocaleString()}${censusInfo.total_population ? ` and a population of ${censusInfo.total_population.toLocaleString()}` : ""}. In lower-income areas, businesses benefit most from high-visibility, cost-effective digital strategies.`,
        source: "US Census Bureau (ACS 5-Year)",
        confidence: "high",
        icon_hint: "map-pin",
      });
    }
    // Mid-range — still useful context
    else if (censusInfo.median_household_income) {
      signals.push({
        type: "expansion_signal",
        headline: `Service area demographics: $${(censusInfo.median_household_income / 1000).toFixed(0)}k median income`,
        detail: `ZIP ${zip} has a median household income of $${censusInfo.median_household_income.toLocaleString()}${censusInfo.total_population ? ` serving a population of ${censusInfo.total_population.toLocaleString()}` : ""}. This provides context for pricing strategy and digital marketing spend expectations.`,
        source: "US Census Bureau (ACS 5-Year)",
        confidence: "medium",
        icon_hint: "map-pin",
      });
    }
  } catch {
    // Census API timeout or error — skip
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Lightweight scout intel (parallel probes, no module data needed)
// ---------------------------------------------------------------------------

export interface QuickIntelParams {
  businessName: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  rating?: number;
  reviewCount?: number;
}

/**
 * Fast intelligence gathering for scout mode.
 * Runs all free probes in parallel — no module data required.
 * Designed to run per-business during scout without being expensive.
 */
export async function gatherQuickIntel(
  params: QuickIntelParams
): Promise<BusinessIntelligenceResult> {
  const allSignals: BusinessIntelligenceSignal[] = [];

  // Run all probes in parallel — they're all free HTTP requests
  const probes: Promise<BusinessIntelligenceSignal[]>[] = [];

  // OpenCorporates (free, no auth, 50 req/day)
  probes.push(
    searchOpenCorporates(params.businessName, params.state).then(
      (co) => (co ? signalsFromOpenCorporates(co) : [])
    )
  );

  // Website-dependent probes
  if (params.website) {
    probes.push(probeWaybackMachine(params.website));
    probes.push(probeSEOBasics(params.website));
    probes.push(probeSecurityPosture(params.website));
    probes.push(probeCrUX(params.website));

    try {
      const domain = new URL(params.website).hostname;
      probes.push(probeMXRecords(domain));
      probes.push(probeCertTransparency(domain));
    } catch {
      // Invalid URL — skip domain-based probes
    }
  } else {
    // No website is itself a strong signal
    allSignals.push({
      type: "expansion_signal",
      headline: "No se detectó sitio web",
      detail: `El negocio parece no tener sitio web y pierde más del 70% de los prospectos potenciales en línea: la señal más fuerte de que necesita servicios digitales.`,
      source: "Business Profile",
      confidence: "high",
      icon_hint: "zap",
    });
  }

  // Census demographics (address-based — works with or without website)
  if (params.address) {
    probes.push(probeCensus(params.address));
  }

  // Review-based signals (no API needed — derived from Places data)
  if (params.rating !== undefined && params.reviewCount !== undefined) {
    if (params.rating < 3.5) {
      allSignals.push({
        type: "rapid_growth",
        headline: `Calificación baja en Google: ${params.rating} estrellas`,
        detail: `Una calificación de ${params.rating} estrellas reduce la visibilidad en Google Maps y empuja a los clientes hacia la competencia. Urge gestionar la reputación.`,
        source: "Google Reviews",
        confidence: "high",
        icon_hint: "trending-up",
      });
    }
    if (params.reviewCount < 10) {
      allSignals.push({
        type: "rapid_growth",
        headline: `Solo ${params.reviewCount} reseñas en Google`,
        detail: `Con apenas ${params.reviewCount} reseñas, al negocio le falta la prueba social que esperan los consumidores. Generar reseñas es una victoria rápida.`,
        source: "Google Reviews",
        confidence: "high",
        icon_hint: "trending-up",
      });
    }
    if (params.rating >= 4.5 && params.reviewCount >= 50) {
      allSignals.push({
        type: "rapid_growth",
        headline: `Buena reputación: ${params.rating}★ con ${params.reviewCount} reseñas`,
        detail: `El negocio tiene excelente prueba social pero quizá no la aprovecha digitalmente. Gran reputación + sitio débil = la oportunidad de mayor retorno.`,
        source: "Google Reviews",
        confidence: "medium",
        icon_hint: "trending-up",
      });
    }
  }

  // Wait for all probes
  const probeResults = await Promise.allSettled(probes);
  for (const result of probeResults) {
    if (result.status === "fulfilled") {
      allSignals.push(...result.value);
    }
  }

  // Sort and deduplicate
  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  allSignals.sort((a, b) => (confidenceOrder[a.confidence] ?? 1) - (confidenceOrder[b.confidence] ?? 1));

  const seen = new Set<string>();
  const dedupedSignals: BusinessIntelligenceSignal[] = [];
  for (const sig of allSignals) {
    if (!seen.has(sig.type)) {
      seen.add(sig.type);
      dedupedSignals.push(sig);
    }
  }

  return {
    signals: dedupedSignals,
    signal_count: dedupedSignals.length,
    top_signal: dedupedSignals[0]?.headline,
  };
}

// ---------------------------------------------------------------------------
// Full audit intelligence (existing — uses module data)
// ---------------------------------------------------------------------------

export async function gatherBusinessIntelligence(
  params: IntentSignalsParams
): Promise<BusinessIntelligenceResult> {
  const allSignals: BusinessIntelligenceSignal[] = [];

  // 1. Run all probes in parallel (OpenCorporates + free web probes)
  const probes: Promise<BusinessIntelligenceSignal[]>[] = [];

  probes.push(
    searchOpenCorporates(params.businessName, params.state).then(
      (co) => (co ? signalsFromOpenCorporates(co) : [])
    )
  );

  // Website-dependent probes (if we know the website from GBP)
  const website = params.gbpHealth?.website;
  if (website) {
    probes.push(probeCrUX(website));
    try {
      const domain = new URL(website).hostname;
      probes.push(probeCertTransparency(domain));
    } catch {
      // Invalid URL
    }
  }

  // Census demographics (if we have an address)
  const address = params.gbpHealth?.address;
  if (address) {
    probes.push(probeCensus(address));
  }

  const probeResults = await Promise.allSettled(probes);
  for (const result of probeResults) {
    if (result.status === "fulfilled") {
      allSignals.push(...result.value);
    }
  }

  // 2. Synthesize signals from existing module data
  allSignals.push(...signalsFromModuleData(params));

  // Sort: high confidence first, then by type importance
  const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  allSignals.sort((a, b) => (confidenceOrder[a.confidence] ?? 1) - (confidenceOrder[b.confidence] ?? 1));

  // Deduplicate by type (keep first = highest confidence)
  const seen = new Set<string>();
  const dedupedSignals: BusinessIntelligenceSignal[] = [];
  for (const sig of allSignals) {
    const key = sig.type;
    if (!seen.has(key)) {
      seen.add(key);
      dedupedSignals.push(sig);
    }
  }

  return {
    signals: dedupedSignals,
    signal_count: dedupedSignals.length,
    top_signal: dedupedSignals[0]?.headline,
  };
}
