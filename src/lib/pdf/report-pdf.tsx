/** @jsxRuntime classic */
/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment } from "./pdf-react";
import { Document, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { BRAND_COLORS, formatMonthYearEs } from "@/lib/brand";
import { LEVEL_HEX, LEVEL_SOFT_HEX, type DocContent } from "@/lib/exports/doc-content";
import { fitLogo, type DocBrand } from "@/lib/exports/doc-brand";

/**
 * Informe PDF con estética limpia tipo Apple (mucho aire, jerarquía por peso
 * y tamaño, superficies suaves con esquinas redondeadas) sobre la plantilla
 * de Cyber Valtorix: encabezado con escudo + razón social, pie con correo,
 * ícono y teléfono, portada y cierre con firmante.
 */

// Referencia explícita: evita que el compilador elimine el import usado solo por la pragma JSX.
void h;
void Fragment;

const hex = (value: string) => `#${value.replace(/^#/, "")}`;
const INK = "#1D1D1F";
const BODY = hex(BRAND_COLORS.dgray);
const SUB = "#6E6E73";
const SOFT = "#F5F5F7";
const LINE = "#E3E6EC";

/** Helvetica estándar (WinAnsi) no tiene flechas ni algunos símbolos. */
function safe(text: string): string {
  return text
    .replace(/[→⇒➜➔]/g, "›")
    .replace(/[←]/g, "‹")
    .replace(/[★⭐]/g, "*")
    .replace(/[✓✔]/g, "+")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
}

const png = (data: Buffer | null) => (data ? `data:image/png;base64,${data.toString("base64")}` : null);

function makeStyles(brand: DocBrand) {
  const navy = hex(brand.primary);
  const gold = hex(brand.accent);
  const blue = hex(brand.blue);
  const teal = hex(brand.teal);
  return {
    navy,
    gold,
    blue,
    teal,
    s: StyleSheet.create({
      page: { paddingTop: 78, paddingBottom: 70, paddingHorizontal: 54, fontFamily: "Helvetica", fontSize: 10.5, color: BODY, lineHeight: 1.45 },
      header: { position: "absolute", top: 26, left: 54, right: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
      headerLogo: { width: 28, height: 27 },
      headerText: { fontFamily: "Times-Bold", fontSize: 11, color: "#000000" },
      footer: { position: "absolute", bottom: 26, left: 54, right: 54, borderTopWidth: 0.75, borderTopColor: hex(BRAND_COLORS.footerLine), paddingTop: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
      footerText: { fontFamily: "Times-Roman", fontSize: 9, color: "#000000" },
      footerLink: { fontFamily: "Times-Roman", fontSize: 9, color: "#0563C1", textDecoration: "underline" },
      footerIcon: { width: 22, height: 14 },
      pageNum: { position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", fontSize: 7.5, color: SUB },

      eyebrow: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: gold, letterSpacing: 1.4, marginBottom: 4 },
      h1: { fontFamily: "Helvetica-Bold", fontSize: 20, color: navy, marginBottom: 10, letterSpacing: -0.3 , lineHeight: 1.15 },
      h2: { fontFamily: "Helvetica-Bold", fontSize: 13, color: blue, marginTop: 14, marginBottom: 6 , lineHeight: 1.15 },
      h3: { fontFamily: "Helvetica-Bold", fontSize: 11, color: teal, marginTop: 8, marginBottom: 3 },
      p: { marginBottom: 6 },
      lead: { fontFamily: "Helvetica-Bold", fontSize: 13, color: INK, marginBottom: 8, lineHeight: 1.35 },
      muted: { color: SUB, fontSize: 9 },

      bulletRow: { flexDirection: "row", marginBottom: 4, paddingRight: 6 },
      bulletDot: { width: 12, fontFamily: "Helvetica-Bold" },
      bulletText: { flex: 1 },

      card: { backgroundColor: SOFT, borderRadius: 10, padding: 12, marginBottom: 8 },
      row: { flexDirection: "row" },

      statRow: { flexDirection: "row", marginTop: 4, marginBottom: 10 },
      stat: { flex: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 6, marginRight: 6, alignItems: "center" },
      statValue: { fontFamily: "Helvetica-Bold", fontSize: 15, color: navy , lineHeight: 1.15 },
      statLabel: { fontSize: 7, color: SUB, marginTop: 2, textAlign: "center", letterSpacing: 0.4 },

      table: { borderWidth: 0.75, borderColor: LINE, borderRadius: 8, marginTop: 4, marginBottom: 10 },
      th: { flexDirection: "row", backgroundColor: hex(BRAND_COLORS.lnavy), borderTopLeftRadius: 8, borderTopRightRadius: 8 },
      thCell: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: navy, padding: 6 },
      tr: { flexDirection: "row", borderTopWidth: 0.75, borderTopColor: LINE },
      td: { fontSize: 9, padding: 6 },

      pill: { borderRadius: 9, paddingVertical: 2, paddingHorizontal: 7, fontSize: 8.5, fontFamily: "Helvetica-Bold", alignSelf: "flex-start" },
    }),
  };
}

type Styles = ReturnType<typeof makeStyles>;

function Chrome({ brand, st }: { brand: DocBrand; st: Styles }) {
  const logo = png(brand.logo);
  const icon = png(brand.footerIcon);
  return (
    <>
      <View style={st.s.header} fixed>
        {logo ? <Image src={logo} style={fitLogo(brand, 27, 140)} /> : <View />}
        <Text style={st.s.headerText}>{brand.company}</Text>
      </View>
      <View style={st.s.footer} fixed>
        <Link src={`mailto:${brand.email}`} style={st.s.footerLink}>{brand.email}</Link>
        {icon ? <Image src={icon} style={st.s.footerIcon} /> : <Text style={st.s.footerText}>·</Text>}
        <Text style={st.s.footerText}>{brand.phone}</Text>
      </View>
      <Text style={st.s.pageNum} fixed render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </>
  );
}

function Bullet({ children, color, st }: { children: string; color?: string; st: Styles }) {
  return (
    <View style={st.s.bulletRow} wrap={false}>
      <Text style={[st.s.bulletDot, { color: color ?? st.blue }]}>•</Text>
      <Text style={st.s.bulletText}>{children}</Text>
    </View>
  );
}

function Table({ headers, rows, widths, st, highlightFirst }: { headers: string[]; rows: string[][]; widths: number[]; st: Styles; highlightFirst?: boolean }) {
  return (
    <View style={st.s.table}>
      <View style={st.s.th} fixed={false}>
        {headers.map((label, i) => (
          <Text key={label} style={[st.s.thCell, { width: `${widths[i]}%` }]}>{label}</Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={[st.s.tr, highlightFirst && ri === 0 ? { backgroundColor: hex(BRAND_COLORS.lgold) } : {}]} wrap={false}>
          {r.map((cell, ci) => (
            <Text key={ci} style={[st.s.td, { width: `${widths[ci]}%` }, ci === 0 ? { fontFamily: "Helvetica-Bold", color: INK } : {}]}>{cell}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Cover({ c, brand, st }: { c: DocContent; brand: DocBrand; st: Styles }) {
  const logo = png(brand.logo);
  const color = hex(LEVEL_HEX[c.level]);
  return (
    <Page size="LETTER" style={[st.s.page, { paddingTop: 54 }]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={st.s.headerText}>{brand.company}</Text>
        <Text style={st.s.footerText}>{brand.email}  ·  {brand.phone}</Text>
      </View>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        {logo && <Image src={logo} style={{ ...fitLogo(brand, 117, 300), marginBottom: 30 }} />}
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 22, color: st.navy, letterSpacing: 0.5 , lineHeight: 1.15 }}>AUDITORÍA DE PRESENCIA DIGITAL</Text>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16, color: st.gold, marginTop: 6, letterSpacing: 2 , lineHeight: 1.15 }}>INFORME DETALLADO</Text>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 30, color: st.navy, marginTop: 30, textAlign: "center", letterSpacing: -0.6 , lineHeight: 1.15 }}>{c.businessName}</Text>
        <Text style={{ fontSize: 12, color: st.blue, marginTop: 8 }}>{[c.location, c.dateLong].filter(Boolean).join("  |  ")}</Text>
        <View style={{ marginTop: 26, alignItems: "center", backgroundColor: hex(LEVEL_SOFT_HEX[c.level]), borderRadius: 60, width: 120, height: 120, justifyContent: "center", borderWidth: 4, borderColor: color }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 38, color , lineHeight: 1.15 }}>{String(c.score)}</Text>
          <Text style={{ fontSize: 9, color: SUB }}>/ 100</Text>
        </View>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, color, marginTop: 10 }}>{c.grade}  ·  {c.scoreTier}</Text>
      </View>
      <View style={{ borderTopWidth: 1.5, borderTopColor: st.navy, paddingTop: 12 }}>
        {[
          ["Negocio analizado", c.businessName],
          ["Tipo de entregable", "Auditoría de presencia digital e inteligencia de marca"],
          ["Fecha", formatMonthYearEs(new Date())],
          ["Elaborado por", brand.company],
        ].map(([k, v]) => (
          <Text key={k} style={{ marginBottom: 3 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", color: st.navy }}>{k}: </Text>
            {v}
          </Text>
        ))}
      </View>
    </Page>
  );
}

function deepSafe<T>(value: T): T {
  if (typeof value === "string") return safe(value) as T;
  if (Array.isArray(value)) return value.map(deepSafe) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepSafe(v)])) as T;
  }
  return value;
}

export default function ReportPDF({ content, brand }: { content: DocContent; brand: DocBrand }) {
  const c = deepSafe(content);
  const st = makeStyles(brand);
  const signature = png(brand.signature);

  return (
    <Document title={`Auditoría digital — ${c.businessName}`} author={brand.company} creator={brand.company} producer={brand.company} language="es">
      <Cover c={c} brand={brand} st={st} />

      {/* Resumen ejecutivo */}
      <Page size="LETTER" style={st.s.page}>
        <Chrome brand={brand} st={st} />
        <Text style={st.s.eyebrow}>1 · RESUMEN EJECUTIVO</Text>
        <Text style={st.s.h1}>{c.verdictHeadline}</Text>
        {c.summaryParagraphs.slice(0, 1).map((p, i) => (
          <Text key={i} style={st.s.lead}>{p}</Text>
        ))}
        {c.keyStats.length > 0 && (
          <View style={st.s.statRow}>
            {c.keyStats.map((s, i) => (
              <View
                key={i}
                style={[
                  st.s.stat,
                  { backgroundColor: s.sentiment === "positive" ? "#E3F4EA" : s.sentiment === "negative" ? "#FCE6E4" : SOFT },
                  i === c.keyStats.length - 1 ? { marginRight: 0 } : {},
                ]}
              >
                <Text style={[st.s.statValue, { color: s.sentiment === "positive" ? "#1E8E5A" : s.sentiment === "negative" ? "#C0392B" : st.navy }]}>{s.value}</Text>
                <Text style={st.s.statLabel}>{s.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        )}
        {c.summaryParagraphs.slice(1).map((p, i) => (
          <Bullet key={i} st={st}>{p}</Bullet>
        ))}

        {(c.strength || c.gap) && (
          <View style={[st.s.row, { marginTop: 10 }]}>
            {c.strength && (
              <View style={[st.s.card, { flex: 1, marginRight: c.gap ? 8 : 0, backgroundColor: "#E3F4EA" }]} wrap={false}>
                <Text style={[st.s.eyebrow, { color: "#1E8E5A" }]}>PRINCIPAL FORTALEZA</Text>
                <Text style={{ fontFamily: "Helvetica-Bold", color: INK, marginBottom: 3 }}>{c.strength.module}{c.strength.headline ? ` — ${c.strength.headline}` : ""}</Text>
                <Text style={{ fontSize: 9.5 }}>{c.strength.detail}</Text>
              </View>
            )}
            {c.gap && (
              <View style={[st.s.card, { flex: 1, backgroundColor: "#FCE6E4" }]} wrap={false}>
                <Text style={[st.s.eyebrow, { color: "#C0392B" }]}>BRECHA CRÍTICA</Text>
                <Text style={{ fontFamily: "Helvetica-Bold", color: INK, marginBottom: 3 }}>{c.gap.module}{c.gap.headline ? ` — ${c.gap.headline}` : ""}</Text>
                <Text style={{ fontSize: 9.5 }}>{c.gap.detail}</Text>
              </View>
            )}
          </View>
        )}

        {c.hiddenOpportunity ? (
          <View style={[st.s.card, { backgroundColor: hex(BRAND_COLORS.lgold) }]} wrap={false}>
            <Text style={[st.s.eyebrow, { color: st.gold }]}>OPORTUNIDAD OCULTA</Text>
            <Text>{c.hiddenOpportunity}</Text>
          </View>
        ) : null}

        {c.pathForward.length > 0 && (
          <>
            <Text style={st.s.h2}>Próximos pasos recomendados</Text>
            <Table st={st} headers={["#", "Acción", "Resultado esperado"]} widths={[7, 48, 45]} rows={c.pathForward.map((p) => [String(p.priority), p.action, p.outcome])} highlightFirst />
          </>
        )}
        {c.bottomLine ? <Text style={{ fontFamily: "Helvetica-Oblique", color: SUB, textAlign: "center", marginTop: 8 }}>“{c.bottomLine}”</Text> : null}
      </Page>

      {/* Tablero */}
      <Page size="LETTER" style={st.s.page}>
        <Chrome brand={brand} st={st} />
        <Text style={st.s.eyebrow}>2 · TABLERO</Text>
        <Text style={st.s.h1}>Calificación por área</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          {c.modules.map((m) => (
            <View key={m.key} style={[st.s.card, { width: "48.8%", backgroundColor: hex(LEVEL_SOFT_HEX[m.level]) }]} wrap={false}>
              <Text style={{ fontFamily: "Helvetica-Bold", color: INK, fontSize: 10 }}>{m.label}</Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 4 }}>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 24, color: hex(LEVEL_HEX[m.level]) , lineHeight: 1.15 }}>{String(m.score)}</Text>
                <Text style={{ fontSize: 9, color: SUB, marginLeft: 4, marginBottom: 4 }}>/100 · {m.grade}</Text>
              </View>
              {m.findings[0] ? <Text style={{ fontSize: 8.5, color: BODY, marginTop: 3 }}>{m.findings[0]}</Text> : null}
            </View>
          ))}
        </View>
        {c.coverage.length > 0 && (
          <>
            <Text style={st.s.h2}>Cobertura de la auditoría · {c.coverageConfidence}</Text>
            <Table st={st} headers={["Área", "Estado", "Detalle"]} widths={[24, 16, 60]} rows={c.coverage.map((i) => [i.label, i.status, i.detail])} />
          </>
        )}
      </Page>

      {/* Diagnóstico estratégico */}
      {c.hasAI && (c.causalChains.length > 0 || c.priorityActions.length > 0 || c.hiddenStrengths.length > 0 || Boolean(c.competitiveNarrative)) && (
        <Page size="LETTER" style={st.s.page}>
          <Chrome brand={brand} st={st} />
          <Text style={st.s.eyebrow}>3 · DIAGNÓSTICO ESTRATÉGICO</Text>
          <Text style={st.s.h1}>Lo que conecta los hallazgos</Text>
          {c.competitiveNarrative ? (
            <View style={[st.s.card, { backgroundColor: hex(BRAND_COLORS.lnavy) }]} wrap={false}>
              <Text style={[st.s.eyebrow, { color: st.navy }]}>EVALUACIÓN COMPETITIVA</Text>
              <Text style={{ fontFamily: "Helvetica-Oblique", color: INK }}>{c.competitiveNarrative}</Text>
            </View>
          ) : null}
          {c.causalChains.length > 0 && <Text style={st.s.h2}>Cadenas causales</Text>}
          {c.causalChains.map((ch, i) => (
            <View key={i} style={st.s.card} wrap={false}>
              <Text style={{ fontFamily: "Helvetica-Bold", color: INK, marginBottom: 3 }}>{ch.chain}</Text>
              <Text style={{ fontSize: 9.5, marginBottom: 3 }}>{ch.impact}</Text>
              <Text style={{ fontSize: 9, color: st.teal, fontFamily: "Helvetica-Bold" }}>Secuencia de corrección: {ch.fix}</Text>
            </View>
          ))}
          {c.hiddenStrengths.length > 0 && <Text style={st.s.h2}>Fortalezas ocultas</Text>}
          {c.hiddenStrengths.map((item, i) => (
            <Bullet key={i} st={st} color="#1E8E5A">{`${item.strength} — Oportunidad: ${item.opportunity}`}</Bullet>
          ))}
          {c.compoundingGaps.length > 0 && <Text style={st.s.h2}>Brechas que se potencian</Text>}
          {c.compoundingGaps.map((g, i) => (
            <Bullet key={i} st={st} color="#C0392B">{`${g.description} — ${g.impact}`}</Bullet>
          ))}
          {c.priorityActions.length > 0 && (
            <>
              <Text style={st.s.h2}>Plan de acción prioritario</Text>
              <Table
                st={st}
                headers={["#", "Acción", "Justificación", "Plazo"]}
                widths={[6, 34, 44, 16]}
                rows={c.priorityActions.map((a, i) => [String(i + 1), a.action, [a.rationale, a.unlocks ? `Desbloquea: ${a.unlocks}` : ""].filter(Boolean).join(" "), a.timeframe])}
                highlightFirst
              />
            </>
          )}
        </Page>
      )}

      {/* Evidencia por área */}
      <Page size="LETTER" style={st.s.page}>
        <Chrome brand={brand} st={st} />
        <Text style={st.s.eyebrow}>4 · EVIDENCIA</Text>
        <Text style={st.s.h1}>Evidencia detallada por área</Text>
        {c.signals.length > 0 && (
          <>
            <Text style={st.s.h2}>Hechos importantes descubiertos</Text>
            {c.signals.map((s, i) => (
              <View key={i} style={st.s.card} wrap={false}>
                <Text style={{ fontFamily: "Helvetica-Bold", color: INK }}>{s.headline}</Text>
                <Text style={{ fontSize: 9.5, marginTop: 2 }}>{s.detail}</Text>
                <Text style={[st.s.muted, { marginTop: 3 }]}>Fuente: {s.source} · Confianza: {s.confidence}</Text>
              </View>
            ))}
          </>
        )}
        {c.modules.map((m) => (
          <View key={m.key} style={{ marginBottom: 6 }}>
            <View wrap={false}>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, marginBottom: 6 }}>
                <Text style={[st.s.h2, { marginTop: 0, marginBottom: 0, flex: 1 }]}>{m.label}</Text>
                <Text style={[st.s.pill, { backgroundColor: hex(LEVEL_SOFT_HEX[m.level]), color: hex(LEVEL_HEX[m.level]) }]}>{m.grade} · {m.score}/100</Text>
              </View>
              {m.metrics.length > 0 && (
                <View style={{ flexDirection: "row", marginBottom: 6 }}>
                  {m.metrics.map(([label, value], i) => (
                    <View key={i} style={[st.s.card, { flex: 1, marginRight: i === m.metrics.length - 1 ? 0 : 6, marginBottom: 0, padding: 8 }]}>
                      <Text style={{ fontSize: 7.5, color: SUB }}>{label}</Text>
                      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, color: st.navy, marginTop: 2 }}>{value}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            {m.findings.length > 0 && <Text style={st.s.h3}>Hallazgos clave</Text>}
            {m.findings.map((f, i) => (
              <Bullet key={i} st={st}>{f}</Bullet>
            ))}
            {m.recommendations.length > 0 && <Text style={st.s.h3}>Recomendaciones</Text>}
            {m.recommendations.map((r, i) => (
              <Bullet key={i} st={st} color={st.gold}>{r}</Bullet>
            ))}
          </View>
        ))}
      </Page>

      {/* Recomendaciones y cierre */}
      <Page size="LETTER" style={st.s.page}>
        <Chrome brand={brand} st={st} />
        <Text style={st.s.eyebrow}>5 · RECOMENDACIONES</Text>
        <Text style={st.s.h1}>Recomendaciones priorizadas</Text>
        {c.recommendations.length > 0 ? (
          <Table
            st={st}
            headers={["#", "Recomendación", "Impacto", "Esfuerzo", "Plazo"]}
            widths={[6, 58, 12, 12, 12]}
            rows={c.recommendations.map((r, i) => [String(i + 1), `${r.title}${r.description ? `\n${r.description}` : ""}`, r.impact, r.effort, r.timeframe ?? "—"])}
            highlightFirst
          />
        ) : (
          <Text style={st.s.muted}>No hay recomendaciones adicionales para este reporte.</Text>
        )}

        {c.caveats.length > 0 && (
          <>
            <Text style={st.s.h2}>Notas sobre la calidad de los datos</Text>
            {c.caveats.map((n, i) => (
              <Bullet key={i} st={st} color={SUB}>{n}</Bullet>
            ))}
          </>
        )}

        <View style={{ marginTop: 26, borderTopWidth: 1.5, borderTopColor: st.navy, paddingTop: 12 }} wrap={false}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 6 }}>Atentamente:</Text>
          {signature ? <Image src={signature} style={{ width: 170, height: 82, marginBottom: 4 }} /> : <View style={{ height: 36 }} />}
          <Text style={{ fontFamily: "Helvetica-Bold", color: st.navy }}>{brand.signer}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", color: st.navy }}>{brand.signerRole}</Text>
          <Text style={{ color: st.navy }}>{brand.company}</Text>
          <Text style={{ color: st.navy }}>{brand.phone.replace(/\s+/, "-")}</Text>
        </View>
      </Page>
    </Document>
  );
}
