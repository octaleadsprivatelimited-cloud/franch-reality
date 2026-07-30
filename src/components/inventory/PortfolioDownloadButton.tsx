"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Download, Loader2 } from "lucide-react";

type State = "idle" | "loading" | "success" | "error";

function responseFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return fallback;
    }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? fallback;
}

export function PortfolioDownloadButton({ propertyId }: { propertyId: string }) {
  const [state, setState] = useState<State>("idle");
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  async function downloadPortfolio() {
    setState("loading");
    try {
      const response = await fetch(`/inventory/${propertyId}/portfolio`, {
        credentials: "same-origin",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Could not generate the portfolio.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = responseFilename(response, "Property-Portfolio.pdf");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setState("success");
      resetTimer.current = window.setTimeout(() => setState("idle"), 2_500);
    } catch {
      setState("error");
    }
  }

  const loading = state === "loading";
  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        className="btn"
        onClick={downloadPortfolio}
        disabled={loading}
        title="Download the property portfolio with all uploaded images and supporting-document details"
        aria-describedby={`portfolio-download-status-${propertyId}`}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : state === "success" ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : state === "error" ? (
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {loading
          ? "Preparing PDF…"
          : state === "success"
            ? "Download started"
            : state === "error"
              ? "Try download again"
              : "Portfolio PDF"}
      </button>
      <span
        id={`portfolio-download-status-${propertyId}`}
        role="status"
        aria-live="polite"
        style={{
          minHeight: 14,
          fontSize: 10.5,
          color: state === "error" ? "var(--bad)" : "var(--ink-fade)",
        }}
      >
        {loading
          ? "Including every listing image"
          : state === "error"
            ? "The PDF could not be prepared."
            : ""}
      </span>
    </div>
  );
}
