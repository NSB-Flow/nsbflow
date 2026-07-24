import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
  pdfWidth?: number;
};

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv<T>(rows: T[], cols: ExportColumn<T>[]): string {
  const lines = [cols.map((c) => c.header).join(",")];
  for (const r of rows) {
    lines.push(cols.map((c) => csvEscape(c.value(r))).join(","));
  }
  return lines.join("\n");
}

export function downloadBlob(content: BlobPart, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv<T>(rows: T[], cols: ExportColumn<T>[], filename: string) {
  // BOM para abrir corretamente em Excel PT-BR
  downloadBlob("\uFEFF" + buildCsv(rows, cols), "text/csv;charset=utf-8", filename);
}

export type PdfMeta = { label: string; value: string }[];

export function downloadAuditPdf<T>(opts: {
  rows: T[];
  cols: ExportColumn<T>[];
  filename: string;
  title: string;
  subtitle?: string;
  meta?: PdfMeta;
}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Cabeçalho NSB Flow
  doc.setFillColor(11, 26, 51); // navy
  doc.rect(0, 0, pageWidth, 60, "F");
  doc.setTextColor(212, 175, 55); // gold
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("NSB Flow", 40, 28);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(opts.title, 40, 46);

  // Metadados
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  let y = 80;
  if (opts.subtitle) {
    doc.text(opts.subtitle, 40, y);
    y += 14;
  }
  const genLine = `Gerado em ${new Date().toLocaleString("pt-BR")} — ${opts.rows.length} registro(s)`;
  doc.text(genLine, 40, y);
  y += 14;
  if (opts.meta && opts.meta.length) {
    for (const m of opts.meta) {
      doc.text(`${m.label}: ${m.value}`, 40, y);
      y += 12;
    }
  }

  autoTable(doc, {
    startY: y + 6,
    head: [opts.cols.map((c) => c.header)],
    body: opts.rows.map((r) => opts.cols.map((c) => {
      const v = c.value(r);
      return v == null ? "" : String(v);
    })),
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [11, 26, 51], textColor: [212, 175, 55], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 247, 250] },
    columnStyles: Object.fromEntries(
      opts.cols
        .map((c, i) => (c.pdfWidth ? [i, { cellWidth: c.pdfWidth }] : null))
        .filter(Boolean) as [number, { cellWidth: number }][],
    ),
    margin: { left: 30, right: 30 },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      const current = doc.getCurrentPageInfo().pageNumber;
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Página ${current} de ${pageCount}`, pageWidth - 80, h - 20);
      doc.text("NSB Flow — Auditoria confidencial", 40, h - 20);
    },
  });

  doc.save(opts.filename);
}
