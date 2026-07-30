"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, ExternalLink } from "lucide-react";
import { attachmentUrl } from "@/lib/domain";

export interface PreviewDoc {
  id: string;
  name: string;
}

/**
 * Fullscreen PDF preview modal — renders the (authenticated) document inline via an
 * iframe against `/api/attachments/[id]?preview=1`, with a download fallback. Controlled
 * by the parent: pass `doc` to open, `onClose` to dismiss (backdrop click / Esc / ✕).
 */
export function DocPreviewModal({
  doc,
  onClose,
}: {
  doc: PreviewDoc | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!doc) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doc, onClose]);

  if (!doc || typeof document === "undefined") return null;
  const url = attachmentUrl(doc.id);

  // Portal to <body> so an ancestor with `overflow: hidden` + a `transform` (e.g. the
  // hovered `.prop-card`) can't become the containing block and clip this fixed overlay.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={doc.name}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(6, 10, 18, 0.9)",
        display: "flex",
        flexDirection: "column",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          width: "100%",
          maxWidth: 1000,
          margin: "0 auto",
          minHeight: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff", padding: "2px 2px 10px" }}>
          <span
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {doc.name}
          </span>
          <a
            href={`${url}?preview=1`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-4 w-4" /> Open in new tab
          </a>
          <a href={url} className="btn btn-sm" onClick={(e) => e.stopPropagation()}>
            <Download className="h-4 w-4" /> Download
          </a>
          <button type="button" onClick={onClose} className="btn btn-sm" aria-label="Close preview">
            <X className="h-4 w-4" />
          </button>
        </div>
        <iframe
          src={`${url}?preview=1`}
          title={doc.name}
          style={{ flex: 1, width: "100%", border: "none", borderRadius: 8, background: "#fff", minHeight: 0 }}
        />
      </div>
    </div>,
    document.body,
  );
}
