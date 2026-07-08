import { Document, Page, Text, View, StyleSheet, pdf, Font } from "@react-pdf/renderer";
import type { ReactElement } from "react";

// Cores NSB
const C = {
  primary: "#0A2540",
  accent: "#2563EB",
  gold: "#C9A24B",
  muted: "#6B7A8F",
  border: "#E5E9EF",
  bg: "#FFFFFF",
  soft: "#F5F7FA",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: "#1a2b40",
    lineHeight: 1.5,
  },
  cover: {
    padding: 56,
    height: "100%",
    backgroundColor: C.primary,
    color: "#FFFFFF",
  },
  coverBrand: { fontSize: 12, letterSpacing: 4, color: C.gold, fontFamily: "Helvetica-Bold" },
  coverTitle: {
    fontSize: 34,
    marginTop: 24,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.15,
  },
  coverSubtitle: { fontSize: 14, marginTop: 12, color: "#B7C4D6" },
  coverRule: { marginTop: 28, height: 3, width: 60, backgroundColor: C.gold },
  coverMeta: { position: "absolute", left: 56, right: 56, bottom: 56, fontSize: 10 },
  coverMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  coverMetaLabel: { color: C.gold, textTransform: "uppercase", letterSpacing: 1, fontSize: 8 },
  coverMetaValue: { fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.primary, marginTop: 6 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.primary, marginTop: 14, marginBottom: 6 },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.primary, marginTop: 8, marginBottom: 3 },
  small: { fontSize: 9, color: C.muted },
  card: {
    border: `1pt solid ${C.border}`,
    borderRadius: 6,
    padding: 12,
    marginTop: 8,
    backgroundColor: C.bg,
  },
  cardAccent: {
    borderLeft: `3pt solid ${C.accent}`,
    backgroundColor: C.soft,
    borderRadius: 4,
    padding: 12,
    marginTop: 8,
  },
  bullet: { flexDirection: "row", marginTop: 3 },
  bulletDot: { width: 10, color: C.accent, fontFamily: "Helvetica-Bold" },
  bulletText: { flex: 1 },
  tocRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
    fontSize: 11,
  },
  tocLine: { flex: 1, borderBottom: `1pt dotted ${C.border}`, marginHorizontal: 6, alignSelf: "flex-end", height: 8 },
  kv: { flexDirection: "row", marginTop: 2 },
  kvKey: { color: C.muted, width: 120, fontSize: 9.5 },
  kvVal: { flex: 1 },
  footer: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 28,
    fontSize: 8.5,
    color: C.muted,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `1pt solid ${C.border}`,
    paddingTop: 8,
  },
  header: {
    position: "absolute",
    left: 48,
    right: 48,
    top: 24,
    fontSize: 8.5,
    color: C.muted,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  scoreRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  scoreBarBg: { height: 5, backgroundColor: C.border, borderRadius: 3, marginTop: 2 },
  scoreBarFill: { height: 5, backgroundColor: C.accent, borderRadius: 3 },
});

type Json = unknown;

export interface PdfMeta {
  reportType: string;      // "DEAP Briefing" | "DEAP Meeting Intelligence"
  companyName?: string | null;
  cnpj?: string | null;
  clientName?: string | null;
  author?: string | null;
  date?: string;           // ISO / friendly
}

function humanize(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function shortStr(v: Json): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}
function coerceArray(v: Json): Json[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") return Object.values(v as Record<string, Json>);
  if (v == null) return [];
  return [v];
}

function Value({ value }: { value: Json }) {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return <Text>{String(value)}</Text>;
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === "string" || typeof v === "number")) {
      return (
        <View>
          {value.map((v, i) => (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{String(v)}</Text>
            </View>
          ))}
        </View>
      );
    }
    return (
      <View>
        {value.map((v, i) => (
          <View key={i} style={styles.cardAccent} wrap={false}>
            <Value value={v} />
          </View>
        ))}
      </View>
    );
  }
  if (typeof value === "object") {
    return (
      <View>
        {Object.entries(value as Record<string, Json>).map(([k, v]) => (
          <View key={k} style={styles.kv}>
            <Text style={styles.kvKey}>{humanize(k)}</Text>
            <View style={styles.kvVal}>
              <Value value={v} />
            </View>
          </View>
        ))}
      </View>
    );
  }
  return null;
}

function SectionBlock({ section, index }: { section: Json; index: number }) {
  if (typeof section === "string") {
    return (
      <View style={styles.card} wrap={false}>
        <Text>{section}</Text>
      </View>
    );
  }
  if (!section || typeof section !== "object") return null;
  const s = section as Record<string, Json>;
  const title = (s.title ?? s.titulo ?? s.name ?? `Seção ${index + 1}`) as string;
  const content = s.content ?? s.conteudo ?? s.items ?? s.body ?? s;
  return (
    <View style={styles.card}>
      <Text style={styles.h3}>{title}</Text>
      <Value value={content} />
    </View>
  );
}

function ScoresBlock({ scores }: { scores: Json }) {
  const entries: Array<[string, number, number]> = [];
  const arr = Array.isArray(scores) ? scores : Object.entries(scores as Record<string, Json>);
  if (Array.isArray(scores)) {
    scores.forEach((s, i) => {
      if (typeof s === "object" && s) {
        const o = s as Record<string, Json>;
        entries.push([
          (o.label ?? o.name ?? `Indicador ${i + 1}`) as string,
          Number(o.value ?? o.score ?? 0),
          o.max != null ? Number(o.max) : 100,
        ]);
      }
    });
  } else if (scores && typeof scores === "object") {
    Object.entries(scores as Record<string, Json>).forEach(([k, v]) => {
      if (typeof v === "number") entries.push([humanize(k), v, 100]);
      else if (typeof v === "object" && v) {
        const o = v as Record<string, Json>;
        entries.push([
          humanize(k),
          Number(o.value ?? o.score ?? 0),
          o.max != null ? Number(o.max) : 100,
        ]);
      }
    });
  }
  if (entries.length === 0) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.h3}>Indicadores</Text>
      {entries.map(([label, value, max]) => (
        <View key={label} style={{ marginTop: 5 }}>
          <View style={styles.scoreRow}>
            <Text>{label}</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {value}
              <Text style={styles.small}>/{max}</Text>
            </Text>
          </View>
          <View style={styles.scoreBarBg}>
            <View
              style={[
                styles.scoreBarFill,
                { width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function buildToc(data: Json): string[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, Json>;
  const items: string[] = [];
  if (d.summary ?? d.resumo) items.push("Resumo Executivo");
  if (d.scores ?? d.pontuacoes) items.push("Indicadores");
  const sections = (d.sections ?? d.secoes) as Json[] | undefined;
  if (Array.isArray(sections)) {
    sections.forEach((s, i) => {
      if (typeof s === "object" && s) {
        const t = (s as Record<string, Json>).title ?? (s as Record<string, Json>).titulo;
        items.push(typeof t === "string" ? t : `Seção ${i + 1}`);
      }
    });
  }
  if (d.recommendations ?? d.recomendacoes) items.push("Recomendações");
  return items;
}

function ReportDoc({ meta, data }: { meta: PdfMeta; data: Json }): ReactElement {
  const d = (data && typeof data === "object" ? (data as Record<string, Json>) : {}) as Record<
    string,
    Json
  >;
  const toc = buildToc(data);
  const date = meta.date ?? new Date().toLocaleDateString("pt-BR");
  const sections = (d.sections ?? d.secoes ?? []) as Json[];

  return (
    <Document title={`${meta.reportType} — ${meta.companyName ?? "NSB Flow"}`}>
      {/* Capa */}
      <Page size="A4" style={styles.cover}>
        <Text style={styles.coverBrand}>NSB · GROWTH BY METHOD</Text>
        <Text style={styles.coverTitle}>{meta.reportType}</Text>
        <View style={styles.coverRule} />
        <Text style={styles.coverSubtitle}>{meta.companyName ?? "—"}</Text>
        <View style={styles.coverMeta}>
          <View style={styles.coverMetaRow}>
            <Text style={styles.coverMetaLabel}>CNPJ</Text>
            <Text style={styles.coverMetaValue}>{meta.cnpj ?? "—"}</Text>
          </View>
          <View style={styles.coverMetaRow}>
            <Text style={styles.coverMetaLabel}>Cliente</Text>
            <Text style={styles.coverMetaValue}>{meta.clientName ?? "—"}</Text>
          </View>
          <View style={styles.coverMetaRow}>
            <Text style={styles.coverMetaLabel}>Autor</Text>
            <Text style={styles.coverMetaValue}>{meta.author ?? "NSB Flow"}</Text>
          </View>
          <View style={styles.coverMetaRow}>
            <Text style={styles.coverMetaLabel}>Data</Text>
            <Text style={styles.coverMetaValue}>{date}</Text>
          </View>
          <Text style={{ marginTop: 20, fontSize: 8, color: C.gold, letterSpacing: 2 }}>
            CONFIDENCIAL · DEAP METHOD™
          </Text>
        </View>
      </Page>

      {/* Conteúdo */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <Text>NSB Flow · {meta.reportType}</Text>
          <Text>{meta.companyName ?? ""}</Text>
        </View>

        {toc.length > 0 && (
          <View>
            <Text style={styles.h1}>Índice</Text>
            {toc.map((t, i) => (
              <View key={i} style={styles.tocRow}>
                <Text>{t}</Text>
                <View style={styles.tocLine} />
                <Text style={styles.small}>{i + 1}</Text>
              </View>
            ))}
          </View>
        )}

        {(d.summary ?? d.resumo) != null && (
          <View>
            <Text style={styles.h2}>Resumo Executivo</Text>
            <View style={styles.cardAccent}>
              <Value value={d.summary ?? d.resumo} />
            </View>
          </View>
        )}

        {(d.scores ?? d.pontuacoes) != null && (
          <View>
            <Text style={styles.h2}>Indicadores</Text>
            <ScoresBlock scores={d.scores ?? d.pontuacoes} />
          </View>
        )}

        {Array.isArray(sections) && sections.length > 0 && (
          <View>
            <Text style={styles.h2}>Detalhamento</Text>
            {sections.map((s, i) => (
              <SectionBlock key={i} section={s} index={i} />
            ))}
          </View>
        )}

        {(d.recommendations ?? d.recomendacoes) != null && (
          <View>
            <Text style={styles.h2}>Recomendações</Text>
            <View style={styles.card}>
              {coerceArray(d.recommendations ?? d.recomendacoes).map((it, i) => (
                <View key={i} style={styles.bullet}>
                  <Text style={[styles.bulletDot, { color: C.gold }]}>{i + 1}.</Text>
                  <View style={styles.bulletText}>
                    <Value value={it} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>NSB Flow · DEAP Method™ · Confidencial</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${date} · pág ${pageNumber}/${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export async function generateReportPdf(meta: PdfMeta, data: Json): Promise<Blob> {
  const blob = await pdf(<ReportDoc meta={meta} data={data} />).toBlob();
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
