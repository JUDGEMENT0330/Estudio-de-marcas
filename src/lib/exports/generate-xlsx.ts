import ExcelJS from "exceljs";
import type { Report, WhiteLabelConfig } from "@/lib/db/types";
import { BRAND_COLORS } from "@/lib/brand";
import { buildDocContent, LEVEL_HEX, LEVEL_SOFT_HEX } from "./doc-content";
import { resolveDocBrand } from "./doc-brand";

/**
 * Libro de Excel con la identidad Cyber Valtorix: logo en la hoja de
 * resumen, encabezado/pie de impresión con razón social, correo y teléfono,
 * encabezados de tabla NAVY sobre azul claro y filas destacadas en dorado.
 */

const FONT = "Arial";
const argb = (hex: string) => `FF${hex.replace(/^#/, "").toUpperCase()}`;
const thin = { style: "thin" as const, color: { argb: argb("D9DEE7") } };
const borders = { top: thin, bottom: thin, left: thin, right: thin };

export async function generateReportXLSX(report: Report, branding?: WhiteLabelConfig): Promise<Buffer> {
  const brand = await resolveDocBrand(branding);
  const c = buildDocContent(report);

  const wb = new ExcelJS.Workbook();
  wb.creator = brand.company;
  wb.company = brand.company;
  wb.title = `Auditoría digital — ${c.businessName}`;
  wb.created = new Date();

  const logoId = brand.logo ? wb.addImage({ buffer: brand.logo as unknown as ExcelJS.Buffer, extension: "png" }) : undefined;

  const setupSheet = (ws: ExcelJS.Worksheet) => {
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.8, bottom: 0.7, header: 0.3, footer: 0.3 } };
    ws.headerFooter = {
      oddHeader: `&R&"Times New Roman,Bold"&11${brand.company}`,
      oddFooter: `&L&"Times New Roman,Regular"&9${brand.email}&C&9Página &P de &N&R&"Times New Roman,Regular"&9${brand.phone}`,
    };
    ws.views = [{ showGridLines: false }];
  };

  const tableHeader = (ws: ExcelJS.Worksheet, rowNumber: number, values: string[]) => {
    const r = ws.getRow(rowNumber);
    values.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: argb(brand.primary) } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(BRAND_COLORS.lnavy) } };
      cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", wrapText: true };
      cell.border = borders;
    });
    r.height = 26;
  };

  const dataRow = (ws: ExcelJS.Worksheet, rowNumber: number, values: (string | number)[], fill?: string, boldFirst = true) => {
    const r = ws.getRow(rowNumber);
    values.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.font = { name: FONT, size: 10, color: { argb: argb(BRAND_COLORS.dgray) }, bold: boldFirst && i === 0 };
      cell.alignment = { vertical: "top", wrapText: true, horizontal: typeof v === "number" ? "center" : "left" };
      cell.border = borders;
      if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(fill) } };
    });
    return r;
  };

  const sheetTitle = (ws: ExcelJS.Worksheet, title: string, lastCol: string, startRow = 1) => {
    ws.mergeCells(`A${startRow}:${lastCol}${startRow}`);
    const t = ws.getCell(`A${startRow}`);
    t.value = title;
    t.font = { name: FONT, size: 16, bold: true, color: { argb: argb(brand.primary) } };
    t.alignment = { vertical: "middle" };
    ws.getRow(startRow).height = 30;
    ws.mergeCells(`A${startRow + 1}:${lastCol}${startRow + 1}`);
    const sub = ws.getCell(`A${startRow + 1}`);
    sub.value = `${c.businessName}${c.location ? ` · ${c.location}` : ""} · ${c.dateLong}`;
    sub.font = { name: FONT, size: 10, color: { argb: argb(brand.blue) } };
  };

  // ── Resumen ──────────────────────────────────────────────
  const resumen = wb.addWorksheet("Resumen", { properties: { tabColor: { argb: argb(brand.primary) } } });
  setupSheet(resumen);
  resumen.columns = [{ width: 4 }, { width: 28 }, { width: 70 }];
  if (logoId !== undefined) {
    resumen.addImage(logoId, { tl: { col: 1, row: 0.3 }, ext: { width: 56, height: 54 } });
  }
  resumen.getRow(1).height = 46;
  resumen.mergeCells("C1:C1");
  const brandCell = resumen.getCell("C1");
  brandCell.value = brand.company;
  brandCell.font = { name: "Times New Roman", size: 13, bold: true };
  brandCell.alignment = { horizontal: "right", vertical: "middle" };

  resumen.mergeCells("B3:C3");
  resumen.getCell("B3").value = "AUDITORÍA DE PRESENCIA DIGITAL";
  resumen.getCell("B3").font = { name: FONT, size: 18, bold: true, color: { argb: argb(brand.primary) } };
  resumen.mergeCells("B4:C4");
  resumen.getCell("B4").value = "INFORME DETALLADO";
  resumen.getCell("B4").font = { name: FONT, size: 13, bold: true, color: { argb: argb(brand.accent) } };

  const info: [string, string][] = [
    ["Negocio", c.businessName],
    ["Ubicación", c.location || "—"],
    ["Fecha de auditoría", c.dateLong],
    ["Calificación general", `${c.score}/100 · ${c.grade} · ${c.scoreTier}`],
    ["Veredicto", c.verdictHeadline],
    ["Contexto", c.verdictSubline || "—"],
    ["Oportunidad oculta", c.hiddenOpportunity || "—"],
    ["Conclusión", c.bottomLine || "—"],
    ["Cobertura", c.coverageConfidence || "—"],
    ["Elaborado por", brand.company],
    ["Contacto", `${brand.email} · ${brand.phone}`],
  ];
  info.forEach(([label, value], i) => {
    const r = resumen.getRow(6 + i);
    r.getCell(2).value = label;
    r.getCell(3).value = value;
    r.getCell(2).font = { name: FONT, size: 10, bold: true, color: { argb: argb(brand.primary) } };
    r.getCell(3).font = { name: FONT, size: 10, color: { argb: argb(BRAND_COLORS.dgray) }, bold: label === "Calificación general" };
    r.getCell(3).alignment = { wrapText: true, vertical: "top" };
    [2, 3].forEach((col) => (r.getCell(col).border = { bottom: thin }));
    if (label === "Calificación general") {
      r.getCell(3).font = { name: FONT, size: 12, bold: true, color: { argb: argb(LEVEL_HEX[c.level]) } };
    }
  });

  if (c.keyStats.length) {
    let r = 6 + info.length + 2;
    resumen.getCell(`B${r}`).value = "Métricas clave";
    resumen.getCell(`B${r}`).font = { name: FONT, size: 12, bold: true, color: { argb: argb(brand.blue) } };
    r++;
    for (const s of c.keyStats) {
      const row = resumen.getRow(r++);
      row.getCell(2).value = s.label;
      row.getCell(3).value = s.value;
      row.getCell(2).font = { name: FONT, size: 10 };
      row.getCell(3).font = {
        name: FONT, size: 10, bold: true,
        color: { argb: argb(s.sentiment === "positive" ? "1E8E5A" : s.sentiment === "negative" ? "C0392B" : brand.primary) },
      };
    }
  }

  // ── Calificaciones ───────────────────────────────────────
  const scores = wb.addWorksheet("Calificaciones", { properties: { tabColor: { argb: argb(brand.blue) } } });
  setupSheet(scores);
  scores.columns = [{ width: 32 }, { width: 18 }, { width: 10 }, { width: 60 }, { width: 60 }];
  sheetTitle(scores, "Tablero de calificaciones", "E");
  tableHeader(scores, 4, ["Área", "Calificación", "Puntaje", "Hallazgo principal", "Recomendación principal"]);
  c.modules.forEach((m, i) => {
    const r = dataRow(scores, 5 + i, [m.label, m.grade, m.score, m.findings[0] ?? "—", m.recommendations[0] ?? "—"]);
    r.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(LEVEL_SOFT_HEX[m.level]) } };
    r.getCell(2).font = { name: FONT, size: 10, bold: true, color: { argb: argb(LEVEL_HEX[m.level]) } };
    r.getCell(2).alignment = { horizontal: "center", vertical: "top" };
  });

  // ── Evidencia ────────────────────────────────────────────
  const evid = wb.addWorksheet("Evidencia", { properties: { tabColor: { argb: argb(brand.teal) } } });
  setupSheet(evid);
  evid.columns = [{ width: 30 }, { width: 16 }, { width: 90 }];
  sheetTitle(evid, "Evidencia detallada por área", "C");
  let er = 4;
  for (const m of c.modules) {
    evid.mergeCells(`A${er}:C${er}`);
    const h = evid.getCell(`A${er}`);
    h.value = `${m.label} — ${m.grade} (${m.score}/100)`;
    h.font = { name: FONT, size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(brand.primary) } };
    evid.getRow(er).height = 22;
    er++;
    for (const [label, value] of m.metrics) dataRow(evid, er++, [label, "Indicador", value]);
    for (const f of m.findings) dataRow(evid, er++, [m.label, "Hallazgo", f], undefined, false);
    for (const rec of m.recommendations) dataRow(evid, er++, [m.label, "Recomendación", rec], BRAND_COLORS.lgold, false);
    er++;
  }

  // ── Recomendaciones ──────────────────────────────────────
  const recs = wb.addWorksheet("Recomendaciones", { properties: { tabColor: { argb: argb(brand.accent) } } });
  setupSheet(recs);
  recs.columns = [{ width: 5 }, { width: 40 }, { width: 70 }, { width: 11 }, { width: 11 }, { width: 14 }, { width: 50 }];
  sheetTitle(recs, "Recomendaciones priorizadas", "G");
  tableHeader(recs, 4, ["#", "Recomendación", "Descripción", "Impacto", "Esfuerzo", "Plazo", "Resultado esperado"]);
  c.recommendations.forEach((r, i) => {
    dataRow(
      recs, 5 + i,
      [i + 1, r.title, r.description, r.impact, r.effort, r.timeframe ?? "—", r.outcome ?? "—"],
      r.impactRaw === "high" ? BRAND_COLORS.lgold : undefined,
      false,
    );
  });

  // ── Plan de acción ───────────────────────────────────────
  if (c.priorityActions.length || c.pathForward.length) {
    const plan = wb.addWorksheet("Plan de acción", { properties: { tabColor: { argb: argb("1E8E5A") } } });
    setupSheet(plan);
    plan.columns = [{ width: 5 }, { width: 50 }, { width: 70 }, { width: 18 }, { width: 50 }];
    sheetTitle(plan, "Plan de acción", "E");
    tableHeader(plan, 4, ["#", "Acción", "Justificación / resultado", "Plazo", "Desbloquea"]);
    const rows = c.priorityActions.length
      ? c.priorityActions.map((a, i) => [i + 1, a.action, a.rationale, a.timeframe, a.unlocks || "—"])
      : c.pathForward.map((p) => [p.priority, p.action, p.outcome, "—", "—"]);
    rows.forEach((row, i) => dataRow(plan, 5 + i, row as (string | number)[], i === 0 ? BRAND_COLORS.lgold : undefined, false));
  }

  // ── Cobertura ────────────────────────────────────────────
  const cov = wb.addWorksheet("Cobertura");
  setupSheet(cov);
  cov.columns = [{ width: 30 }, { width: 16 }, { width: 90 }];
  sheetTitle(cov, `Cobertura de la auditoría · ${c.coverageConfidence}`, "C");
  tableHeader(cov, 4, ["Área", "Estado", "Detalle"]);
  c.coverage.forEach((item, i) => dataRow(cov, 5 + i, [item.label, item.status, item.detail]));
  if (c.signals.length) {
    let r = 6 + c.coverage.length;
    cov.getCell(`A${r}`).value = "Hechos importantes descubiertos";
    cov.getCell(`A${r}`).font = { name: FONT, size: 12, bold: true, color: { argb: argb(brand.blue) } };
    r++;
    tableHeader(cov, r++, ["Señal", "Confianza", "Detalle y fuente"]);
    for (const s of c.signals) dataRow(cov, r++, [s.headline, s.confidence, `${s.detail} (Fuente: ${s.source})`]);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
