"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, Download, Paperclip } from "lucide-react";
import {
  previewImportAction,
  commitImportAction,
  type PreviewState,
  type CommitState,
} from "@/app/(app)/inventory/import/actions";

export function ImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewState>({});
  const [commit, setCommit] = useState<CommitState>({});
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    if (fileRef.current) {
      fileRef.current.value = ""; // reset so re-clicking after cancel always reopens
      fileRef.current.click();
    }
  }

  function doPreview() {
    if (!file) return;
    setCommit({});
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => setPreview(await previewImportAction({}, fd)));
  }

  function doCommit() {
    if (!preview.batchId) return;
    const fd = new FormData();
    fd.append("batchId", preview.batchId);
    startTransition(async () => setCommit(await commitImportAction({}, fd)));
  }

  function downloadErrorCsv() {
    const rows = preview.preview?.invalidRows ?? [];
    const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      "Row,File No,Problems,Warnings",
      ...rows.map((r) =>
        [r.rowNumber, esc(r.raw["FILE NO"] ?? r.raw["File No"] ?? ""), esc(r.errors.join("; ")), esc(r.warnings.join("; "))].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const p = preview.preview;
  const warnCount = p?.validRows.reduce((n, r) => n + r.warnings.length, 0) ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <label className="label" style={{ margin: 0 }}>Inventory spreadsheet (.xlsx)</label>
          {/* Route handler that streams an .xlsx — a real download needs a plain <a download>, not client nav. */}
          <a href="/inventory/import/template" className="btn btn-sm" download>
            <Download className="h-4 w-4" /> Download template
          </a>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>
          Use the template above, or your existing sheet — columns are matched by name
          (FILE NO, LOCATION, TRANSACTION, PROPERTY TYPE, BHK, AMOUNT, PRICE UNIT…). Rows are
          matched to existing properties by FILE NO (re-import updates in place). For a SALE,
          always give a unit (Lakh/Crore) so amounts aren&apos;t misread.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: "none" }}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview({});
            setCommit({});
          }}
        />
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn" onClick={openPicker}>
            <Paperclip className="h-4 w-4" /> Choose .xlsx file
          </button>
          <span
            style={{
              flex: 1,
              minWidth: 140,
              fontSize: 13,
              color: file ? "var(--ink)" : "var(--ink-fade)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {file?.name ?? "No file selected"}
          </span>
          <button type="button" onClick={doPreview} disabled={!file || pending} className="btn-primary">
            <FileSpreadsheet className="h-4 w-4" />
            {pending && !p ? "Reading…" : "Dry-run preview"}
          </button>
        </div>
        {preview.error && <p className="alert-error" style={{ marginTop: 12 }}>{preview.error}</p>}
      </div>

      {p && (
        <div className="card card-pad">
          <div className="kpi-grid" style={{ marginBottom: 16 }}>
            <Stat label="Total rows" value={p.totalRows} />
            <Stat label="Valid" value={p.validRows.length} tone="good" />
            <Stat label="Needs attention" value={p.invalidRows.length} tone="bad" />
            <Stat label="Warnings" value={warnCount} tone="warn" />
          </div>

          {p.invalidRows.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "var(--bad)", margin: 0 }}>
                  <AlertTriangle className="h-4 w-4" /> Rows that will be skipped ({p.invalidRows.length})
                </h3>
                <button onClick={downloadErrorCsv} className="btn btn-sm">
                  <Download className="h-4 w-4" /> Error report (CSV)
                </button>
              </div>
              <div style={{ maxHeight: 240, overflow: "auto", borderRadius: 8, border: "1px solid var(--rule)" }}>
                <table className="lead-table" style={{ border: "none" }}>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>File no</th>
                      <th>Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.invalidRows.map((r) => (
                      <tr key={r.rowNumber}>
                        <td style={{ color: "var(--ink-fade)" }}>{r.rowNumber}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                          {r.raw["FILE NO"] || r.raw["File No"] || "—"}
                        </td>
                        <td style={{ color: "var(--bad)" }}>{r.errors.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {p.validRows.length > 0 && !commit.result && (
            <button onClick={doCommit} disabled={pending} className="btn-primary">
              <Upload className="h-4 w-4" />
              {pending ? "Importing…" : `Import ${p.validRows.length} valid row(s)`}
            </button>
          )}

          {commit.error && <p className="alert-error" style={{ marginTop: 12 }}>{commit.error}</p>}
          {commit.result && (
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderRadius: 8,
                background: "var(--good-tint)",
                color: "var(--good)",
                padding: "10px 14px",
                fontSize: 13,
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              Imported: {commit.result.created} created, {commit.result.updated} updated,{" "}
              {commit.result.skipped} skipped.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  const color =
    tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : tone === "bad" ? "var(--bad)" : "var(--ink)";
  return (
    <div className="kpi">
      <div className="kpi-value" style={{ color }}>{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}
