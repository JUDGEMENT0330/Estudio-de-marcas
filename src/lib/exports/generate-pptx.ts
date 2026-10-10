import PptxGenJS from "pptxgenjs";
import type { Report, WhiteLabelConfig } from "@/lib/db/types";
import { BRAND_COLORS } from "@/lib/brand";
import { buildDocContent, LEVEL_HEX, LEVEL_SOFT_HEX, type DocContent } from "./doc-content";
import { fitImage, fitLogo, resolveDocBrand, type DocBrand } from "./doc-brand";
import { imageDataUri, type DocImage } from "./doc-image";

/**
 * Presentación con estética tipo Keynote (fondos limpios, tipografía grande,
 * mucho aire) y la identidad Cyber Valtorix: encabezado con escudo y razón
 * social, pie tecnológico (banda de circuito + correo · número · teléfono),
 * paleta NAVY/GOLD/BLUE y cierre con firma, nombre y cargo centrados.
 */

const W = 10;
const H = 5.625;
const FONT = "Helvetica Neue";
const FALLBACK_FONT = "Arial";
const INK = "1D1D1F";
const SUB = "6E6E73";
const BG = "FFFFFF";
const SOFT = BRAND_COLORS.appleBg;

const png = (image: DocImage | null) => imageDataUri(image, "");

function truncate(text: string, max: number): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function chrome(pres: PptxGenJS, slide: PptxGenJS.Slide, brand: DocBrand, n: number, total: () => number) {
  const logo = png(brand.logo);
  if (logo) {
    const { width: w, height: h } = fitLogo(brand, 0.31, 1.6);
    slide.addImage({ data: logo, x: 0.4, y: 0.22 + (0.31 - h) / 2, w, h });
  }
  slide.addText(brand.company, {
    x: 4.6, y: 0.22, w: 5.0, h: 0.32, align: "right", fontFace: "Times New Roman",
    fontSize: 10, bold: true, color: "000000",
  });
  const band = png(brand.footerBand);
  if (band) slide.addImage({ data: band, x: 0.4, y: 5.02, w: 9.2, h: 9.2 * (brand.footerBand.height / brand.footerBand.width) });
  slide.addText(brand.email, { x: 0.4, y: 5.28, w: 3.6, h: 0.25, fontFace: "Consolas", fontSize: 8, color: brand.primary });
  slide.addText(
    [
      { text: "PÁG ", options: { color: brand.accent, bold: true } },
      { text: String(n).padStart(2, "0"), options: { color: brand.primary, bold: true } },
    ],
    { x: 4.2, y: 5.28, w: 1.6, h: 0.25, align: "center", fontFace: "Consolas", fontSize: 8, charSpacing: 1 },
  );
  slide.addText(brand.phone, {
    x: 6.0, y: 5.28, w: 3.6, h: 0.25, align: "right", fontFace: "Consolas", fontSize: 8, color: brand.primary,
  });
  void total;
}

function title(slide: PptxGenJS.Slide, brand: DocBrand, eyebrow: string, text: string) {
  slide.addText(eyebrow.toUpperCase(), {
    x: 0.6, y: 0.72, w: 8.8, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: brand.accent, charSpacing: 2,
  });
  slide.addText(text, {
    x: 0.6, y: 0.95, w: 8.8, h: 0.62, fontFace: FONT, fontSize: 26, bold: true, color: INK, valign: "top", fit: "shrink",
  });
}

function card(pres: PptxGenJS, slide: PptxGenJS.Slide, x: number, y: number, w: number, h: number, fill: string = SOFT) {
  slide.addShape(pres.ShapeType.roundRect, { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.12 });
}

function coverSlide(pres: PptxGenJS, c: DocContent, brand: DocBrand) {
  const s = pres.addSlide();
  s.background = { color: brand.primary };
  s.addShape(pres.ShapeType.ellipse, { x: 6.6, y: -1.6, w: 5, h: 5, fill: { color: BRAND_COLORS.blue, transparency: 70 }, line: { color: BRAND_COLORS.blue, transparency: 100 } });
  s.addShape(pres.ShapeType.ellipse, { x: -1.5, y: 3.6, w: 4, h: 4, fill: { color: brand.accent, transparency: 85 }, line: { color: brand.accent, transparency: 100 } });
  const logo = png(brand.logo);
  if (logo) {
    const { width: w, height: h } = fitLogo(brand, 0.73, 2.4);
    s.addImage({ data: logo, x: 0.7, y: 0.6 + (0.73 - h) / 2, w, h });
  }
  s.addText(brand.company, { x: 0.7 + fitLogo(brand, 0.73, 2.4).width + 0.2, y: 0.72, w: 6, h: 0.45, fontFace: FONT, fontSize: 12, bold: true, color: "FFFFFF", charSpacing: 2 });
  s.addText("AUDITORÍA DE PRESENCIA DIGITAL", { x: 0.7, y: 1.85, w: 8.6, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: brand.accent, charSpacing: 3 });
  s.addText(c.businessName, { x: 0.7, y: 2.2, w: 8.6, h: 1.1, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF", fit: "shrink", valign: "top" });
  s.addText([c.location, c.dateLong].filter(Boolean).join("   ·   "), { x: 0.7, y: 3.35, w: 8.6, h: 0.4, fontFace: FONT, fontSize: 15, color: "D5E8F0" });
  s.addText(`${c.score}/100  ·  ${c.grade}`, { x: 0.7, y: 3.9, w: 8.6, h: 0.45, fontFace: FONT, fontSize: 18, bold: true, color: "FFFFFF" });
  s.addText(`${brand.email}   ·   ${brand.phone}`, { x: 0.7, y: 4.95, w: 8.6, h: 0.3, fontFace: FONT, fontSize: 10, color: "B8C7DD" });
}

export async function generateReportPPTX(report: Report, branding?: WhiteLabelConfig): Promise<Buffer> {
  const brand = await resolveDocBrand(branding);
  const c = buildDocContent(report);

  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.author = brand.company;
  pres.company = brand.company;
  pres.title = `Auditoría digital — ${c.businessName}`;
  pres.theme = { headFontFace: FONT, bodyFontFace: FALLBACK_FONT };

  let n = 1;
  const total = () => n;
  coverSlide(pres, c, brand);

  // ── Resumen ejecutivo ────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: BG };
    chrome(pres, s, brand, ++n, total);
    title(s, brand, "Resumen ejecutivo", c.verdictHeadline);
    // Anillo de puntaje
    const color = LEVEL_HEX[c.level];
    s.addShape(pres.ShapeType.ellipse, { x: 0.75, y: 1.95, w: 2.3, h: 2.3, fill: { color: LEVEL_SOFT_HEX[c.level] }, line: { color, width: 6 } });
    s.addText(String(c.score), { x: 0.75, y: 2.45, w: 2.3, h: 0.9, align: "center", fontFace: FONT, fontSize: 54, bold: true, color });
    s.addText("/ 100", { x: 0.75, y: 3.3, w: 2.3, h: 0.3, align: "center", fontFace: FONT, fontSize: 12, color: SUB });
    s.addText(`${c.grade} · ${c.scoreTier}`, { x: 0.5, y: 4.35, w: 2.8, h: 0.35, align: "center", fontFace: FONT, fontSize: 12, bold: true, color });
    const paras = [c.verdictSubline, ...c.insights].filter(Boolean).slice(0, 4);
    s.addText(
      paras.map((p, i) => ({
        text: truncate(p, 230),
        options: { bullet: i > 0 ? { code: "25CF" } : false, breakLine: true, paraSpaceAfter: 8, bold: i === 0, color: i === 0 ? INK : "3A3A3C" },
      })),
      { x: 3.5, y: 1.85, w: 6.0, h: 3.0, fontFace: FALLBACK_FONT, fontSize: 13, valign: "top", fit: "shrink" },
    );
  }

  // ── Métricas y fortalezas ────────────────────────────────
  if (c.keyStats.length || c.strength || c.gap) {
    const s = pres.addSlide();
    s.background = { color: BG };
    chrome(pres, s, brand, ++n, total);
    title(s, brand, "Lo que revelan los datos", "Métricas clave");
    const stats = c.keyStats.slice(0, 6);
    if (stats.length) {
      const gap = 0.15;
      const w = (8.8 - gap * (stats.length - 1)) / stats.length;
      stats.forEach((st, i) => {
        const x = 0.6 + i * (w + gap);
        const fill = st.sentiment === "positive" ? "E3F4EA" : st.sentiment === "negative" ? "FCE6E4" : SOFT;
        const ink = st.sentiment === "positive" ? "1E8E5A" : st.sentiment === "negative" ? "C0392B" : brand.primary;
        card(pres, s, x, 1.75, w, 1.05, fill);
        s.addText(st.value, { x, y: 1.83, w, h: 0.55, align: "center", fontFace: FONT, fontSize: 22, bold: true, color: ink, fit: "shrink" });
        s.addText(st.label.toUpperCase(), { x: x + 0.05, y: 2.35, w: w - 0.1, h: 0.35, align: "center", fontFace: FONT, fontSize: 8, color: SUB, fit: "shrink" });
      });
    }
    const boxes = [
      c.strength && { t: "Principal fortaleza", m: c.strength, fill: "E3F4EA", ink: "1E8E5A" },
      c.gap && { t: "Brecha crítica", m: c.gap, fill: "FCE6E4", ink: "C0392B" },
    ].filter(Boolean) as { t: string; m: { module: string; headline: string; detail: string }; fill: string; ink: string }[];
    boxes.forEach((b, i) => {
      const x = 0.6 + i * 4.5;
      card(pres, s, x, 3.0, 4.3, 1.95, b.fill);
      s.addText(b.t.toUpperCase(), { x: x + 0.25, y: 3.12, w: 3.8, h: 0.25, fontFace: FONT, fontSize: 9, bold: true, color: b.ink, charSpacing: 1 });
      s.addText(`${b.m.module}${b.m.headline ? ` — ${b.m.headline}` : ""}`, { x: x + 0.25, y: 3.38, w: 3.8, h: 0.55, fontFace: FONT, fontSize: 13, bold: true, color: INK, fit: "shrink", valign: "top" });
      s.addText(truncate(b.m.detail, 200), { x: x + 0.25, y: 3.95, w: 3.8, h: 0.9, fontFace: FALLBACK_FONT, fontSize: 10.5, color: "3A3A3C", fit: "shrink", valign: "top" });
    });
  }

  // ── Tablero de calificaciones ────────────────────────────
  if (c.modules.length) {
    const s = pres.addSlide();
    s.background = { color: BG };
    chrome(pres, s, brand, ++n, total);
    title(s, brand, "Tablero", "Calificación por área");
    const cols = 4;
    const gap = 0.16;
    const w = (8.8 - gap * (cols - 1)) / cols;
    const h = 1.42;
    c.modules.slice(0, 8).forEach((m, i) => {
      const x = 0.6 + (i % cols) * (w + gap);
      const y = 1.78 + Math.floor(i / cols) * (h + gap);
      card(pres, s, x, y, w, h, LEVEL_SOFT_HEX[m.level]);
      s.addText(m.label, { x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.45, fontFace: FONT, fontSize: 10, bold: true, color: INK, fit: "shrink", valign: "top" });
      s.addText(String(m.score), { x: x + 0.15, y: y + 0.52, w: w - 0.3, h: 0.5, fontFace: FONT, fontSize: 26, bold: true, color: LEVEL_HEX[m.level] });
      s.addText(m.grade, { x: x + 0.15, y: y + 1.0, w: w - 0.3, h: 0.3, fontFace: FONT, fontSize: 10, color: LEVEL_HEX[m.level] });
    });
  }

  // ── Una diapositiva por área ─────────────────────────────
  for (const m of c.modules) {
    const s = pres.addSlide();
    s.background = { color: BG };
    chrome(pres, s, brand, ++n, total);
    title(s, brand, `${m.grade} · ${m.score}/100`, m.label);
    // métricas
    m.metrics.slice(0, 4).forEach(([label, value], i) => {
      const y = 1.78 + i * 0.78;
      card(pres, s, 0.6, y, 2.8, 0.66);
      s.addText(label, { x: 0.75, y: y + 0.05, w: 2.5, h: 0.25, fontFace: FONT, fontSize: 9, color: SUB });
      s.addText(value, { x: 0.75, y: y + 0.28, w: 2.5, h: 0.33, fontFace: FONT, fontSize: 14, bold: true, color: brand.primary, fit: "shrink" });
    });
    const items = [
      ...m.findings.slice(0, 3).map((f) => ({ text: truncate(f, 170), options: { bullet: { code: "25CF" }, color: "3A3A3C", breakLine: true, paraSpaceAfter: 6 } })),
    ];
    if (m.findings.length) {
      s.addText("Hallazgos clave", { x: 3.7, y: 1.72, w: 5.8, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: brand.blue });
      s.addText(items, { x: 3.7, y: 2.0, w: 5.8, h: 1.55, fontFace: FALLBACK_FONT, fontSize: 11, valign: "top", fit: "shrink" });
    }
    if (m.recommendations.length) {
      s.addText("Recomendaciones", { x: 3.7, y: 3.55, w: 5.8, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: brand.accent });
      s.addText(
        m.recommendations.slice(0, 3).map((r) => ({ text: truncate(r, 150), options: { bullet: { code: "2192" }, color: "3A3A3C", breakLine: true, paraSpaceAfter: 4 } })),
        { x: 3.7, y: 3.83, w: 5.8, h: 1.2, fontFace: FALLBACK_FONT, fontSize: 11, valign: "top", fit: "shrink" },
      );
    }
  }

  // ── Plan de acción ───────────────────────────────────────
  const plan = c.pathForward.length
    ? c.pathForward.map((p) => [String(p.priority), p.action, p.outcome])
    : c.priorityActions.map((a, i) => [String(i + 1), a.action, a.unlocks || a.rationale]);
  if (plan.length) {
    const s = pres.addSlide();
    s.background = { color: BG };
    chrome(pres, s, brand, ++n, total);
    title(s, brand, "Próximos pasos", "Plan de acción");
    plan.slice(0, 5).forEach(([num, action, outcome], i) => {
      const y = 1.75 + i * 0.66;
      card(pres, s, 0.6, y, 8.8, 0.58, i === 0 ? BRAND_COLORS.lgold : SOFT);
      s.addShape(pres.ShapeType.ellipse, { x: 0.75, y: y + 0.11, w: 0.36, h: 0.36, fill: { color: brand.primary }, line: { color: brand.primary, width: 0 } });
      s.addText(num, { x: 0.75, y: y + 0.11, w: 0.36, h: 0.36, align: "center", fontFace: FONT, fontSize: 11, bold: true, color: "FFFFFF" });
      s.addText(truncate(action, 110), { x: 1.25, y: y + 0.02, w: 4.4, h: 0.54, fontFace: FONT, fontSize: 11.5, bold: true, color: INK, fit: "shrink", valign: "middle" });
      s.addText(truncate(outcome, 140), { x: 5.75, y: y + 0.02, w: 3.55, h: 0.54, fontFace: FALLBACK_FONT, fontSize: 10, color: "3A3A3C", fit: "shrink", valign: "middle" });
    });
  }

  // ── Recomendaciones ──────────────────────────────────────
  if (c.recommendations.length) {
    const s = pres.addSlide();
    s.background = { color: BG };
    chrome(pres, s, brand, ++n, total);
    title(s, brand, "Prioridades", "Recomendaciones");
    const head = (t: string) => ({ text: t, options: { bold: true, color: brand.primary, fill: { color: BRAND_COLORS.lnavy } } });
    const rows: PptxGenJS.TableRow[] = [
      [head("#"), head("Recomendación"), head("Impacto"), head("Esfuerzo"), head("Plazo")],
      ...c.recommendations.slice(0, 6).map((r, i) => [
        { text: String(i + 1) },
        { text: truncate(r.title, 90), options: { bold: true } },
        { text: r.impact },
        { text: r.effort },
        { text: r.timeframe ?? "—" },
      ]),
    ];
    s.addTable(rows, {
      x: 0.6, y: 1.75, w: 8.8, colW: [0.4, 5.0, 1.1, 1.1, 1.2],
      fontFace: FALLBACK_FONT, fontSize: 10, color: "3A3A3C",
      border: { type: "solid", pt: 0.5, color: "D9DEE7" }, valign: "middle", rowH: 0.42,
      autoPage: false,
    });
  }

  // ── Análisis complementario (agente IA aprobado) ─────────
  for (const insight of c.agentInsights) {
    const s = pres.addSlide();
    s.background = { color: BG };
    chrome(pres, s, brand, ++n, total);
    title(s, brand, "Análisis complementario · IA", insight.title);
    const lines = insight.blocks.slice(0, 12).map((block) => ({
      text: truncate(block.text, 220),
      options: {
        bullet: block.kind === "li" ? { indent: 14 } : undefined,
        bold: block.kind === "h",
        color: block.kind === "h" ? brand.blue : "3A3A3C",
        fontSize: block.kind === "h" ? 13 : 11.5,
        breakLine: true,
        paraSpaceAfter: 5,
      },
    }));
    s.addText(lines, { x: 0.6, y: 1.7, w: 8.8, h: 3.2, fontFace: FALLBACK_FONT, valign: "top", fit: "shrink" });
  }

  // ── Cierre ───────────────────────────────────────────────
  {
    const s = pres.addSlide();
    s.background = { color: brand.primary };
    const signature = png(brand.signature);
    // Con firma, todo sube un poco para dejar espacio al bloque firmante centrado.
    const top = signature ? -0.35 : 0;
    const logo = png(brand.logo);
    if (logo) {
      const { width: w, height: h } = fitLogo(brand, signature ? 0.85 : 1.07, 3.5);
      s.addImage({ data: logo, x: 5 - w / 2, y: 0.8 + top + ((signature ? 0.85 : 1.07) - h) / 2, w, h });
    }
    s.addText("Gracias", { x: 0.5, y: 2.05 + top - (signature ? 0.2 : 0), w: 9, h: 0.8, align: "center", fontFace: FONT, fontSize: signature ? 34 : 40, bold: true, color: "FFFFFF" });
    if (c.bottomLine) {
      s.addText(`“${truncate(c.bottomLine, 200)}”`, { x: 1.2, y: 2.85 + top - (signature ? 0.25 : 0), w: 7.6, h: signature ? 0.6 : 0.75, align: "center", fontFace: FONT, fontSize: signature ? 12 : 14, italic: true, color: "D5E8F0", fit: "shrink" });
    }
    if (signature) {
      // Placa blanca para que la firma y el sello se lean sobre el fondo oscuro.
      const size = fitImage(brand.signature, 0.66, 2.2);
      s.addShape(pres.ShapeType.roundRect, { x: 5 - (size.width + 0.4) / 2, y: 2.95, w: size.width + 0.4, h: 0.78, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 }, rectRadius: 0.08 });
      s.addImage({ data: signature, x: 5 - size.width / 2, y: 3.01 + (0.66 - size.height) / 2, w: size.width, h: size.height });
    }
    const y0 = signature ? 3.85 : 3.75;
    s.addText(brand.signer, { x: 0.5, y: y0, w: 9, h: 0.3, align: "center", fontFace: FONT, fontSize: 13, bold: true, color: brand.accent });
    s.addText(brand.signerRole, { x: 0.5, y: y0 + 0.3, w: 9, h: 0.26, align: "center", fontFace: FONT, fontSize: 11, bold: true, color: "FFFFFF", charSpacing: 2 });
    s.addText(`${brand.company}   ·   ${brand.email}   ·   ${brand.phone}`, { x: 0.5, y: y0 + 0.6, w: 9, h: 0.26, align: "center", fontFace: FONT, fontSize: 10, color: "B8C7DD" });
  }

  const data = await pres.write({ outputType: "nodebuffer" });
  return Buffer.from(data as ArrayBuffer);
}
