/**
 * Utilities for exporting Reports panel data to PDF and Excel.
 * PDF uses @react-pdf/renderer with the NSB brand palette;
 * Excel uses SheetJS (xlsx).
 */
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import * as XLSX from "xlsx";

const C = {
  primary: "#0A2540",
  gold: "#C9A24B",
  muted: "#6B7A8F",
  border: "#E5E9EF",
  soft: "#F5F7FA",
};

const styles = StyleSheet.create({
  cover: { padding: 56, height: "100%", backgroundColor: C.primary, color: "#FFFFFF" },
  brand: { fontSize: 12, letterSpacing: 4, color: C.gold, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 30, marginTop: 24, fontFamily: "Helvetica-Bold", lineHeight: 1.15 },
  subtitle: { fontSize: 13, marginTop: 12, color: "#B7C4D6" },
  rule: { marginTop: 24, height: 3, width: 60, backgroundColor: C.gold },
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 44, fontFamily: "Helvetica", fontSize: 10, color: "#1a2b40", lineHeight: 1.45 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.primary },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.primary, marginTop: 16, marginBottom: 4 },
  small: { fontSize: 8.5, color: C.muted },
  table: { marginTop: 6, borderTop: `1pt solid ${C.border}` },
  tr: { flexDirection: "row", borderBottom: `1pt solid ${C.border}`, paddingVertical: 5 },
  th: { fontFamily: "Helvetica-Bold", color: C.primary, fontSize: 9 },
  cell: { fontSize: 9.5, paddingRight: 6 },
  footer: {
    position: "absolute", left: 44, right: 44, bottom: 24,
    fontSize: 8, color: C.muted,
    flexDirection: "row", justifyContent: "space-between",
    borderTop: `1pt solid ${C.border}`, paddingTop: 6,
  },
  kpiRow: { flexDirection: "row", marginTop: 8, gap: 8 },
  kpi: { flex: 1, border: `1pt solid ${C.border}`, borderRadius: 4, padding: 10, backgroundColor: C.soft },
  kpiLabel: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 1 },
  kpiValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.primary, marginTop: 2 },
});

export interface ReportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  widths?: number[]; // relative flex weights
}

export interface ReportKpi {
  label: string;
  value: string;
}

export interface ReportSectionPdf {
  heading?: string;
  kpis?: ReportKpi[];
  tables?: ReportTable[];
  note?: string;
}

export interface ReportPdfInput {
  title: string;
  period: string;
  author?: string;
  workspace?: string;
  sections: ReportSectionPdf[];
}

function Table({ table }: { table: ReportTable }) {
  const widths = table.widths ?? table.columns.map(() => 1);
  const total = widths.reduce((a, b) => a + b, 0);
  return (
    <View style={styles.table}>
      <View style={styles.tr}>
        {table.columns.map((c, i) => (
          <Text key={i} style={[styles.cell, styles.th, { flex: widths[i] / total }]}>
            {c}
          </Text>
        ))}
      </View>
      {table.rows.length === 0 ? (
        <View style={styles.tr}>
          <Text style={[styles.cell, { flex: 1, color: C.muted }]}>Sem dados no período.</Text>
        </View>
      ) : (
        table.rows.map((r, i) => (
          <View key={i} style={styles.tr} wrap={false}>
            {r.map((cell, j) => (
              <Text key={j} style={[styles.cell, { flex: widths[j] / total }]}>
                {cell == null ? "—" : String(cell)}
              </Text>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

function ReportDoc({ input }: { input: ReportPdfInput }): ReactElement {
  return (
    <Document title={input.title}>
      <Page size="A4" style={styles.cover}>
        <Text style={styles.brand}>NSB · GROWTH BY METHOD</Text>
        <Text style={styles.title}>{input.title}</Text>
        <View style={styles.rule} />
        <Text style={styles.subtitle}>Período: {input.period}</Text>
        <View style={{ position: "absolute", left: 56, right: 56, bottom: 56 }}>
          <Text style={{ fontSize: 9, color: "#B7C4D6" }}>Workspace</Text>
          <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>{input.workspace ?? "—"}</Text>
          <Text style={{ fontSize: 9, color: "#B7C4D6", marginTop: 12 }}>Emitido por</Text>
          <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>{input.author ?? "NSB Flow"}</Text>
          <Text style={{ marginTop: 20, fontSize: 8, color: C.gold, letterSpacing: 2 }}>
            CONFIDENCIAL · DEAP METHOD™
          </Text>
        </View>
      </Page>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>{input.title}</Text>
        <Text style={styles.small}>Período: {input.period}</Text>

        {input.sections.map((s, si) => (
          <View key={si}>
            {s.heading && <Text style={styles.h2}>{s.heading}</Text>}
            {s.kpis && s.kpis.length > 0 && (
              <View style={styles.kpiRow}>
                {s.kpis.map((k, i) => (
                  <View key={i} style={styles.kpi}>
                    <Text style={styles.kpiLabel}>{k.label}</Text>
                    <Text style={styles.kpiValue}>{k.value}</Text>
                  </View>
                ))}
              </View>
            )}
            {s.tables?.map((t, i) => (
              <View key={i}>
                {t.title && <Text style={[styles.h2, { fontSize: 11 }]}>{t.title}</Text>}
                <Table table={t} />
              </View>
            ))}
            {s.note && <Text style={[styles.small, { marginTop: 6 }]}>{s.note}</Text>}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>NSB Flow · Relatórios · Confidencial</Text>
          <Text render={({ pageNumber, totalPages }) => `pág ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function generateReportsPdf(input: ReportPdfInput): Promise<Blob> {
  return pdf(<ReportDoc input={input} />).toBlob();
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

export interface XlsxSheet {
  name: string;
  columns: string[];
  rows: (string | number | null | undefined)[][];
}

export function downloadXlsx(sheets: XlsxSheet[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const data = [s.columns, ...s.rows.map((r) => r.map((c) => (c == null ? "" : c)))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = s.columns.map((c, i) => ({
      wch: Math.max(
        c.length,
        ...s.rows.map((r) => String(r[i] ?? "").length),
      ) + 2,
    }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
