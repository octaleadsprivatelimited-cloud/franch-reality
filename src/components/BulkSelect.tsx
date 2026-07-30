"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useTransition,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { Trash2, Download, AlertTriangle, Loader2, Check } from "lucide-react";
import { type DeleteSelection, MAX_BULK } from "@/lib/bulk-delete";
import { MAX_BULK_PORTFOLIOS } from "@/lib/portfolio-export";

type Entity = "leads" | "properties";
type DeleteResult = { ok?: boolean; error?: string; deleted?: number };

interface Ctx {
  entity: Entity;
  pageIds: string[];
  total: number;
  filterParams: Record<string, string | string[] | undefined>;
  allMatching: boolean;
  selectedCount: number;
  pageAllSelected: boolean;
  canDelete: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  togglePage: () => void;
  selectAllMatching: () => void;
  clear: () => void;
  buildSelection: () => DeleteSelection;
  deleteAction: (s: DeleteSelection) => Promise<DeleteResult>;
}

const BulkCtx = createContext<Ctx | null>(null);
function useBulk() {
  const c = useContext(BulkCtx);
  if (!c) throw new Error("Bulk components must be inside <BulkSelectProvider>");
  return c;
}

export function BulkSelectProvider({
  entity,
  pageIds,
  total,
  filterParams,
  deleteAction,
  canDelete = false,
  children,
}: {
  entity: Entity;
  pageIds: string[];
  total: number;
  filterParams: Record<string, string | string[] | undefined>;
  deleteAction: (s: DeleteSelection) => Promise<DeleteResult>;
  canDelete?: boolean;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  // Snapshot of when this list was loaded — delete/backup are bounded to createdAt <=
  // this so rows arriving mid-operation are never swept into an irreversible delete.
  const [before] = useState(() => new Date().toISOString());

  // The selection is meaningful only for the CURRENT filter. Filters navigate via soft
  // client-side push (the provider is not remounted), so a changed filter would silently
  // re-target "select all matching" at a different, possibly larger set — clear on change.
  // page/view/sort are NOT filters, so ignore them (keeps cross-page selection intact).
  const filterKey = useMemo(() => {
    const rel = Object.entries(filterParams)
      .filter(([k]) => k !== "page" && k !== "view" && k !== "sort")
      .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return JSON.stringify(rel);
  }, [filterParams]);
  useEffect(() => {
    const reset = window.setTimeout(() => {
      setSelected(new Set());
      setExcluded(new Set());
      setAllMatching(false);
    }, 0);
    return () => window.clearTimeout(reset);
  }, [filterKey]);

  const ctx = useMemo<Ctx>(() => {
    const isSelected = (id: string) => (allMatching ? !excluded.has(id) : selected.has(id));
    const selectedCount = allMatching ? Math.max(0, total - excluded.size) : selected.size;
    const pageAllSelected = pageIds.length > 0 && pageIds.every(isSelected);

    const toggle = (id: string) => {
      if (allMatching) {
        setExcluded((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }
    };

    const togglePage = () => {
      if (allMatching) {
        // In "all matching" mode the header toggles whether THIS page is excluded.
        setExcluded((prev) => {
          const next = new Set(prev);
          if (pageAllSelected) pageIds.forEach((id) => next.add(id));
          else pageIds.forEach((id) => next.delete(id));
          return next;
        });
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          if (pageAllSelected) pageIds.forEach((id) => next.delete(id));
          else pageIds.forEach((id) => next.add(id));
          return next;
        });
      }
    };

    const selectAllMatching = () => {
      setAllMatching(true);
      setExcluded(new Set());
      setSelected(new Set());
    };
    const clear = () => {
      setAllMatching(false);
      setExcluded(new Set());
      setSelected(new Set());
    };
    const buildSelection = (): DeleteSelection =>
      allMatching
        ? { mode: "filter", params: filterParams, excluded: [...excluded], before }
        : { mode: "ids", ids: [...selected] };

    return {
      entity, pageIds, total, filterParams, allMatching, selectedCount, pageAllSelected, canDelete,
      isSelected, toggle, togglePage, selectAllMatching, clear, buildSelection, deleteAction,
    };
  }, [entity, pageIds, total, filterParams, deleteAction, canDelete, selected, excluded, allMatching, before]);

  return (
    <BulkCtx.Provider value={ctx}>
      {children}
      <BulkBar />
    </BulkCtx.Provider>
  );
}

/** Header select-all-on-page checkbox. */
export function BulkSelectAll() {
  const { pageAllSelected, togglePage, pageIds } = useBulk();
  if (pageIds.length === 0) return null;
  return (
    <input
      type="checkbox"
      checked={pageAllSelected}
      onChange={togglePage}
      aria-label="Select all on this page"
      style={{ cursor: "pointer" }}
    />
  );
}

/** Per-row selection CELL. The whole <td> (not just the input) stops propagation, so a
 *  near-miss click in the cell padding never navigates the row. Render it directly as a
 *  table cell (no wrapping <td>). */
export function BulkRowCheckbox({ id, className }: { id: string; className?: string }) {
  const { isSelected, toggle } = useBulk();
  return (
    <td className={className} onClick={(e) => e.stopPropagation()} style={{ width: 32 }}>
      <input
        type="checkbox"
        checked={isSelected(id)}
        onChange={() => toggle(id)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label="Select row"
        style={{ cursor: "pointer" }}
      />
    </td>
  );
}

const NOUN: Record<Entity, string> = { leads: "lead", properties: "property" };
function noun(entity: Entity, n: number) {
  if (entity === "properties") return n === 1 ? "property" : "properties";
  return n === 1 ? "lead" : "leads";
}

function responseFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
}

function BulkBar() {
  const b = useBulk();
  const [confirm, setConfirm] = useState(false);
  const [portfolioState, setPortfolioState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [portfolioMessage, setPortfolioMessage] = useState("");
  if (b.selectedCount === 0) return null;

  const canSelectAll = !b.allMatching && b.pageAllSelected && b.total > b.selectedCount;
  const portfolioOverCap = b.selectedCount > MAX_BULK_PORTFOLIOS;

  async function downloadPortfolios() {
    setPortfolioState("loading");
    setPortfolioMessage(
      `Preparing ${b.selectedCount.toLocaleString("en-IN")} portfolio${b.selectedCount === 1 ? "" : "s"} with all listing images…`,
    );
    try {
      const response = await fetch("/api/export/property-portfolios", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b.buildSelection()),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "The portfolios could not be prepared.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = responseFilename(response, "Property-Portfolios.zip");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setPortfolioState("success");
      setPortfolioMessage("Portfolio download started.");
      window.setTimeout(() => {
        setPortfolioState("idle");
        setPortfolioMessage("");
      }, 3_000);
    } catch (error) {
      setPortfolioState("error");
      setPortfolioMessage(
        error instanceof Error && error.message
          ? error.message
          : "The portfolios could not be prepared. Please try again.",
      );
    }
  }

  return (
    <>
      <div
        style={{
          position: "sticky",
          bottom: 12,
          zIndex: 50,
          margin: "16px auto 0",
          maxWidth: 900,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 14px",
          borderRadius: "var(--radius)",
          background: "var(--ink)",
          color: "#fff",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <span style={{ fontWeight: 600 }}>
          {b.selectedCount.toLocaleString("en-IN")} {noun(b.entity, b.selectedCount)} selected
        </span>
        {canSelectAll && (
          <button
            type="button"
            onClick={b.selectAllMatching}
            style={{ background: "none", border: "none", color: "#9ecbff", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}
          >
            Select all {b.total.toLocaleString("en-IN")} matching
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm" onClick={b.clear}>
          Clear
        </button>
        {b.entity === "properties" && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={downloadPortfolios}
            disabled={portfolioState === "loading" || portfolioOverCap}
            title={
              portfolioOverCap
                ? `Select ${MAX_BULK_PORTFOLIOS} or fewer properties`
                : "Download one complete PDF per selected property in a ZIP file"
            }
          >
            {portfolioState === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : portfolioState === "success" ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {portfolioState === "loading" ? "Preparing portfolios…" : "Download portfolios"}
          </button>
        )}
        {b.canDelete && (
          <button type="button" className="btn-danger btn-sm" onClick={() => setConfirm(true)}>
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        )}
        {b.entity === "properties" && (portfolioMessage || portfolioOverCap) && (
          <span
            role="status"
            aria-live="polite"
            style={{
              flexBasis: "100%",
              fontSize: 11,
              color: portfolioState === "error" || portfolioOverCap ? "#ffd2d2" : "#d7e4f5",
            }}
          >
            {portfolioOverCap
              ? `Select ${MAX_BULK_PORTFOLIOS} or fewer properties per portfolio download.`
              : portfolioMessage}
          </span>
        )}
      </div>
      {confirm && b.canDelete && <ConfirmModal onClose={() => setConfirm(false)} />}
    </>
  );
}

function ConfirmModal({ onClose }: { onClose: () => void }) {
  const b = useBulk();
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  if (typeof document === "undefined") return null;

  async function downloadBackup() {
    setError(null);
    setDownloading(true);
    try {
      const res = await fetch(`/api/export/${b.entity}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b.buildSelection()),
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${b.entity}-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't generate the backup — please try again.");
    } finally {
      setDownloading(false);
    }
  }

  function doDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await b.deleteAction(b.buildSelection());
        if (res?.error) setError(res.error);
        else {
          b.clear();
          onClose();
        }
      } catch {
        setError("The delete failed — some or none of the records may have been removed. Please try again.");
      }
    });
  }

  const count = b.selectedCount;
  const overCap = count > MAX_BULK;
  const label = `${count.toLocaleString("en-IN")} ${noun(b.entity, count)}`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm permanent deletion"
      onClick={() => !pending && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(6,10,18,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card card-pad"
        style={{ maxWidth: 480, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "inline-flex",
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "var(--bad-tint, #fdecec)",
              color: "var(--bad)",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h3 style={{ margin: 0, fontSize: 16 }}>Permanently delete {label}?</h3>
        </div>

        <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>
          This will permanently delete the selected data and <b>cannot be undone</b>. We recommend
          downloading a backup first — you can then delete safely.
        </p>

        {overCap && (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--warn)" }}>
            That&apos;s more than the {MAX_BULK.toLocaleString("en-IN")} maximum per operation — narrow
            the filter to {MAX_BULK.toLocaleString("en-IN")} or fewer, then delete.
          </p>
        )}

        {error && <p className="alert-error" style={{ margin: 0 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" className="btn btn-sm" onClick={onClose} disabled={pending} autoFocus>
            Cancel
          </button>
          <button type="button" className="btn btn-sm" onClick={downloadBackup} disabled={downloading || pending}>
            <Download className="h-4 w-4" /> {downloading ? "Preparing…" : "Download backup"}
          </button>
          <button type="button" className="btn-danger btn-sm" onClick={doDelete} disabled={pending || overCap}>
            <Trash2 className="h-4 w-4" /> {pending ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { NOUN };
