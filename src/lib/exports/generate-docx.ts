import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { Report, WhiteLabelConfig } from "@/lib/db/types";
import { BRAND_COLORS, formatMonthYearEs } from "@/lib/brand";
import { buildDocContent, LEVEL_HEX, LEVEL_SOFT_HEX, type DocContent } from "./doc-content";
import { fitImage, fitLogo, resolveDocBrand, type DocBrand } from "./doc-brand";
import type { DocImage } from "./doc-image";

/**
 * Informe Word con la plantilla de Cyber Valtorix:
 *   - Encabezado: escudo + "CYBER VALTORIX SAS. DE C.V." (Times New Roman)
 *   - Pie: banda tecnológica (pista de circuito) + correo · página · teléfono
 *   - Cuerpo Arial 11 · H1 NAVY 14 · H2 BLUE 12 · H3 TEAL 11
 *   - Portada con título NAVY, subtítulo GOLD y ficha de entrega
 *   - Cierre "Atentamente" con firma, nombre y cargo centrados
 */

const PAGE_W = 12240; // Carta
const CONTENT_W = 9360; // 1" márgenes
const HF_FONT = "Times New Roman";
const BODY_FONT = "Arial";
const TECH_FONT = "Consolas";

function image(img: DocImage, transformation: { width: number; height: number }): ImageRun {
  return new ImageRun({ type: img.type, data: img.data, transformation });
}

const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
const hair = { style: BorderStyle.SINGLE, size: 4, color: "D9DEE7" };
const hairBorders = { top: hair, bottom: hair, left: hair, right: hair };

function run(text: string, opts: Partial<{ size: number; bold: boolean; italics: boolean; color: string; font: string }> = {}) {
  return new TextRun({
    text,
    font: opts.font ?? BODY_FONT,
    size: opts.size ?? 22,
    bold: opts.bold,
    italics: opts.italics,
    color: opts.color ?? BRAND_COLORS.dgray,
  });
}

function makeHelpers(brand: DocBrand) {
  const h1 = (text: string) =>
    new Paragraph({
      spacing: { before: 360, after: 160 },
      keepNext: true,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: brand.accent, space: 4 } },
      children: [run(text, { size: 28, bold: true, color: brand.primary })],
    });
  const h2 = (text: string) =>
    new Paragraph({
      spacing: { before: 240, after: 100 },
      keepNext: true,
      children: [run(text, { size: 24, bold: true, color: brand.blue })],
    });
  const h3 = (text: string) =>
    new Paragraph({
      spacing: { before: 160, after: 60 },
      keepNext: true,
      children: [run(text, { size: 22, bold: true, color: brand.teal })],
    });
  const para = (text: string, opts: Parameters<typeof run>[1] = {}) =>
    new Paragraph({ spacing: { after: 120, line: 300 }, children: [run(text, opts)] });
  const bullet = (text: string, color?: string) =>
    new Paragraph({
      spacing: { after: 80, line: 290 },
      indent: { left: 360, hanging: 240 },
      children: [run("•  ", { bold: true, color: color ?? brand.blue }), run(text)],
    });
  const divider = () =>
    new Paragraph({
      spacing: { before: 200, after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: brand.primary, space: 1 } },
      children: [],
    });
  const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

  const headerCell = (text: string, width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: BRAND_COLORS.lnavy, color: "auto" },
      borders: hairBorders,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [run(text, { size: 18, bold: true, color: brand.primary })] })],
    });
  const cell = (text: string, width: number, opts: { fill?: string; bold?: boolean; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
      borders: hairBorders,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 70, bottom: 70, left: 120, right: 120 },
      children: [new Paragraph({ alignment: opts.align, children: [run(text, { size: 19, bold: opts.bold, color: opts.color })] })],
    });
  const table = (headers: string[], rows: string[][], widths: number[], rowFill?: (i: number) => string | undefined) =>
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({ tableHeader: true, children: headers.map((h, i) => headerCell(h, widths[i])) }),
        ...rows.map(
          (r, ri) =>
            new TableRow({
              cantSplit: true,
              children: r.map((c, ci) => cell(c, widths[ci], { fill: rowFill?.(ri), bold: ci === 0 })),
            }),
        ),
      ],
    });

  return { h1, h2, h3, para, bullet, divider, pageBreak, table, cell };
}

function buildHeader(brand: DocBrand): Header {
  const children: (TextRun | ImageRun)[] = [];
  if (brand.logo) {
    children.push(image(brand.logo, fitLogo(brand, 37, 160)));
  }
  children.push(new TextRun({ text: `\t${brand.company}`, font: HF_FONT, size: 22, bold: true, color: "000000" }));
  return new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
        spacing: { after: 120 },
        children,
      }),
    ],
  });
}

function buildFooter(brand: DocBrand): Footer {
  const muted = "6E7B8F";
  // 624 px = ancho útil de la página (6.5" a 96 ppp).
  const band = fitImage(brand.footerBand, 40, 624);
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [image(brand.footerBand, band)],
      }),
      new Paragraph({
        tabStops: [
          { type: TabStopType.CENTER, position: CONTENT_W / 2 },
          { type: TabStopType.RIGHT, position: CONTENT_W },
        ],
        children: [
          new ExternalHyperlink({
            link: `mailto:${brand.email}`,
            children: [new TextRun({ text: brand.email, font: TECH_FONT, size: 16, color: brand.primary })],
          }),
          new TextRun({ text: "\t", font: TECH_FONT }),
          new TextRun({ text: "PÁG ", font: TECH_FONT, size: 15, bold: true, color: brand.accent, characterSpacing: 30 }),
          new TextRun({ children: [PageNumber.CURRENT], font: TECH_FONT, size: 16, bold: true, color: brand.primary }),
          new TextRun({ text: " / ", font: TECH_FONT, size: 16, color: muted }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: TECH_FONT, size: 16, color: muted }),
          new TextRun({ text: `\t${brand.phone}`, font: TECH_FONT, size: 16, color: brand.primary }),
        ],
      }),
    ],
  });
}

function coverPage(c: DocContent, brand: DocBrand, H: ReturnType<typeof makeHelpers>): (Paragraph | Table)[] {
  const metaRow = (label: string, value: string) =>
    new Paragraph({
      spacing: { after: 80 },
      children: [run(`${label}: `, { bold: true, color: brand.primary }), run(value)],
    });
  const levelColor = LEVEL_HEX[c.level];
  const out: (Paragraph | Table)[] = [
    new Paragraph({ spacing: { before: 1400 }, children: [] }),
  ];
  if (brand.logo) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
        children: [image(brand.logo, fitLogo(brand, 146, 360))],
      }),
    );
  }
  out.push(
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [run("AUDITORÍA DE PRESENCIA DIGITAL", { size: 44, bold: true, color: brand.primary })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 360 }, children: [run("INFORME DETALLADO", { size: 36, bold: true, color: brand.accent })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(c.businessName, { size: 48, bold: true, color: brand.primary })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [run([c.location, c.dateLong].filter(Boolean).join("  |  "), { size: 24, color: brand.blue })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      children: [
        run(`Calificación general ${c.score}/100`, { size: 24, bold: true, color: levelColor }),
        run(`  ·  ${c.grade}  ·  ${c.scoreTier}`, { size: 24, color: BRAND_COLORS.dgray }),
      ],
    }),
    H.divider(),
    metaRow("Negocio analizado", c.businessName),
    metaRow("Tipo de entregable", "Auditoría de presencia digital e inteligencia de marca"),
    metaRow("Fecha", formatMonthYearEs(new Date())),
    metaRow("Elaborado por", `${brand.company}`),
    H.pageBreak(),
  );
  return out;
}

export async function generateReportDOCX(report: Report, branding?: WhiteLabelConfig): Promise<Buffer> {
  const brand = await resolveDocBrand(branding);
  const c = buildDocContent(report);
  const H = makeHelpers(brand);
  const body: (Paragraph | Table)[] = [];

  body.push(...coverPage(c, brand, H));

  // 1. Resumen ejecutivo
  body.push(H.h1("1. Resumen ejecutivo"));
  body.push(H.para(c.verdictHeadline, { size: 26, bold: true, color: brand.primary }));
  for (const p of c.summaryParagraphs) body.push(H.para(p));

  if (c.keyStats.length) {
    body.push(H.h2("Métricas clave"));
    const w = Math.floor(CONTENT_W / c.keyStats.length);
    body.push(
      new Table({
        width: { size: CONTENT_W, type: WidthType.DXA },
        columnWidths: c.keyStats.map(() => w),
        layout: TableLayoutType.FIXED,
        borders: noBorders,
        rows: [
          new TableRow({
            children: c.keyStats.map(
              (s) =>
                new TableCell({
                  width: { size: w, type: WidthType.DXA },
                  shading: {
                    type: ShadingType.CLEAR,
                    color: "auto",
                    fill: s.sentiment === "positive" ? "E3F4EA" : s.sentiment === "negative" ? "FCE6E4" : "F2F2F5",
                  },
                  borders: { top: { style: BorderStyle.SINGLE, size: 12, color: "FFFFFF" }, bottom: { style: BorderStyle.SINGLE, size: 12, color: "FFFFFF" }, left: { style: BorderStyle.SINGLE, size: 12, color: "FFFFFF" }, right: { style: BorderStyle.SINGLE, size: 12, color: "FFFFFF" } },
                  margins: { top: 120, bottom: 120, left: 80, right: 80 },
                  children: [
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [run(s.value, { size: 30, bold: true, color: brand.primary })] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [run(s.label.toUpperCase(), { size: 15, color: "6E6E73" })] }),
                  ],
                }),
            ),
          }),
        ],
      }),
    );
  }

  if (c.strength || c.gap) {
    body.push(H.h2("Fortalezas y debilidades"));
    if (c.strength) {
      body.push(H.h3(`Principal fortaleza — ${c.strength.module}`));
      if (c.strength.headline) body.push(H.para(c.strength.headline, { bold: true }));
      if (c.strength.detail) body.push(H.para(c.strength.detail));
    }
    if (c.gap) {
      body.push(H.h3(`Brecha crítica — ${c.gap.module}`));
      if (c.gap.headline) body.push(H.para(c.gap.headline, { bold: true }));
      if (c.gap.detail) body.push(H.para(c.gap.detail));
    }
  }

  if (c.hiddenOpportunity) {
    body.push(H.h2("Oportunidad oculta"));
    body.push(H.para(c.hiddenOpportunity, { italics: true, color: brand.teal }));
  }

  if (c.pathForward.length) {
    body.push(H.h2("Próximos pasos recomendados"));
    body.push(
      H.table(
        ["#", "Acción", "Resultado esperado"],
        c.pathForward.map((s) => [String(s.priority), s.action, s.outcome]),
        [600, 4560, 4200],
        (i) => (i === 0 ? BRAND_COLORS.lgold : undefined),
      ),
    );
  }
  if (c.bottomLine) {
    body.push(new Paragraph({ spacing: { before: 240, after: 120 }, alignment: AlignmentType.CENTER, children: [run(`“${c.bottomLine}”`, { italics: true, color: "6E6E73" })] }));
  }

  // 2. Tablero de calificaciones
  body.push(H.pageBreak(), H.h1("2. Tablero de calificaciones"));
  body.push(
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [4200, 2160, 1500, 1500],
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({ tableHeader: true, children: ["Área", "Calificación", "Puntaje", "Fuente"].map((h, i) => new TableCell({
          width: { size: [4200, 2160, 1500, 1500][i], type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: BRAND_COLORS.lnavy, color: "auto" },
          borders: hairBorders,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [run(h, { size: 18, bold: true, color: brand.primary })] })],
        })) }),
        ...c.modules.map((m) =>
          new TableRow({
            cantSplit: true,
            children: [
              H.cell(m.label, 4200, { bold: true }),
              H.cell(m.grade, 2160, { fill: LEVEL_SOFT_HEX[m.level], color: LEVEL_HEX[m.level], bold: true }),
              H.cell(`${m.score}/100`, 1500, { align: AlignmentType.CENTER }),
              H.cell(m.aiBacked ? "Análisis IA" : "Datos", 1500, { align: AlignmentType.CENTER, color: "6E6E73" }),
            ],
          }),
        ),
      ],
    }),
  );
  if (c.coverage.length) {
    body.push(H.h2(`Cobertura de la auditoría · ${c.coverageConfidence}`));
    body.push(H.table(["Área", "Estado", "Detalle"], c.coverage.map((i) => [i.label, i.status, i.detail]), [2300, 1500, 5560]));
  }

  // 3. Diagnóstico estratégico
  if (c.hasAI && (c.causalChains.length || c.hiddenStrengths.length || c.priorityActions.length || c.competitiveNarrative)) {
    body.push(H.pageBreak(), H.h1("3. Diagnóstico estratégico"));
    if (c.competitiveNarrative) {
      body.push(H.h2("Evaluación competitiva"));
      body.push(H.para(c.competitiveNarrative, { italics: true }));
    }
    if (c.causalChains.length) {
      body.push(H.h2("Cadenas causales"));
      for (const chain of c.causalChains) {
        body.push(H.h3(chain.chain));
        body.push(H.para(chain.impact));
        body.push(H.para(`Secuencia de corrección: ${chain.fix}`, { size: 20, color: brand.teal, bold: true }));
      }
    }
    if (c.hiddenStrengths.length) {
      body.push(H.h2("Fortalezas ocultas"));
      for (const s of c.hiddenStrengths) {
        body.push(H.bullet(`${s.strength} — Oportunidad: ${s.opportunity}`, BRAND_COLORS.green));
      }
    }
    if (c.compoundingGaps.length) {
      body.push(H.h2("Brechas que se potencian"));
      for (const g of c.compoundingGaps) body.push(H.bullet(`${g.description} — ${g.impact}`, BRAND_COLORS.red));
    }
    if (c.priorityActions.length) {
      body.push(H.h2("Plan de acción prioritario"));
      body.push(
        H.table(
          ["#", "Acción", "Justificación", "Plazo"],
          c.priorityActions.map((a, i) => [String(i + 1), a.action, [a.rationale, a.unlocks ? `Desbloquea: ${a.unlocks}` : ""].filter(Boolean).join(" "), a.timeframe]),
          [500, 3000, 4360, 1500],
        ),
      );
    }
  }

  // 4. Inteligencia comercial
  if (c.signals.length) {
    body.push(H.h1("4. Hechos importantes descubiertos"));
    for (const s of c.signals) {
      body.push(H.h3(s.headline));
      body.push(H.para(s.detail));
      body.push(H.para(`Fuente: ${s.source} · Confianza: ${s.confidence}`, { size: 18, color: "6E6E73" }));
    }
  }

  // 5. Evidencia por área
  body.push(H.pageBreak(), H.h1("5. Evidencia detallada por área"));
  for (const m of c.modules) {
    body.push(H.h2(`${m.label} — ${m.grade} (${m.score}/100)`));
    if (m.metrics.length) {
      body.push(H.table(["Indicador", "Valor"], m.metrics, [4680, 4680]));
    }
    if (m.findings.length) {
      body.push(H.h3("Hallazgos clave"));
      for (const f of m.findings) body.push(H.bullet(f));
    }
    if (m.recommendations.length) {
      body.push(H.h3("Recomendaciones"));
      for (const r of m.recommendations) body.push(H.bullet(r, brand.accent));
    }
  }

  // 6. Recomendaciones
  if (c.recommendations.length) {
    body.push(H.pageBreak(), H.h1("6. Recomendaciones priorizadas"));
    body.push(
      H.table(
        ["#", "Recomendación", "Impacto", "Esfuerzo", "Plazo"],
        c.recommendations.map((r, i) => [String(i + 1), `${r.title}${r.description ? ` — ${r.description}` : ""}`, r.impact, r.effort, r.timeframe ?? "—"]),
        [500, 5260, 1200, 1200, 1200],
        (i) => (c.recommendations[i]?.impactRaw === "high" ? BRAND_COLORS.lgold : undefined),
      ),
    );
  }

  if (c.caveats.length) {
    body.push(H.h2("Notas sobre la calidad de los datos"));
    for (const n of c.caveats) body.push(H.bullet(n, "8A8A8E"));
  }

  // Anexo: aportes del agente IA aprobados por el usuario
  if (c.agentInsights.length) {
    body.push(H.pageBreak(), H.h1("7. Análisis complementario"));
    body.push(
      H.para("Aportes elaborados con asistencia de inteligencia artificial a partir de los datos de esta auditoría y de fuentes públicas citadas; revisados y aprobados antes de incluirse.", { size: 19, italics: true, color: "6E6E73" }),
    );
    for (const insight of c.agentInsights) {
      body.push(H.h2(insight.title));
      for (const block of insight.blocks) {
        if (block.kind === "h") body.push(H.h3(block.text));
        else if (block.kind === "li") body.push(H.bullet(block.text));
        else body.push(H.para(block.text));
      }
      if (insight.sources.length) {
        body.push(H.para("Fuentes consultadas:", { size: 18, bold: true, color: "6E6E73" }));
        for (const src of insight.sources) body.push(H.bullet(src, "8A8A8E"));
      }
    }
  }

  // Cierre: firma, nombre y cargo centrados
  const centered = (children: (TextRun | ImageRun)[], after = 0) =>
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, keepLines: true, spacing: { after }, children });
  body.push(H.divider());
  body.push(centered([run("Atentamente,", { bold: true })], 120));
  if (brand.signature) {
    body.push(centered([image(brand.signature, fitImage(brand.signature, 115, 260))]));
  } else {
    body.push(new Paragraph({ keepNext: true, spacing: { before: 700 }, children: [] }));
  }
  body.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      indent: { left: 2600, right: 2600 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: brand.primary, space: 4 } },
      children: [run(brand.signer, { bold: true, color: brand.primary })],
    }),
    centered([run(brand.signerRole, { bold: true, color: brand.accent })]),
    centered([run(brand.company, { color: brand.primary })]),
    centered([run(`${brand.email}  ·  ${brand.phone}`, { size: 19, color: "6E6E73" })]),
  );

  const doc = new Document({
    creator: brand.company,
    title: `Auditoría digital — ${c.businessName}`,
    description: "Auditoría de presencia digital e inteligencia de marca",
    styles: {
      default: { document: { run: { font: BODY_FONT, size: 22, color: BRAND_COLORS.dgray } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1300, left: 1440, header: 600, footer: 500 },
          },
        },
        headers: { default: buildHeader(brand) },
        footers: { default: buildFooter(brand) },
        children: body,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
