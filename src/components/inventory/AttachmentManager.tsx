"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Upload, FileText, ImageIcon, Trash2, Paperclip, ChevronDown } from "lucide-react";
import {
  uploadAttachmentAction,
  deleteAttachmentAction,
  type FormState,
} from "@/app/(app)/inventory/actions";
import { attachmentUrl } from "@/lib/domain";
import { DocPreviewModal, type PreviewDoc } from "./DocPreview";

export interface AttachmentItem {
  id: string;
  kind: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

export function AttachmentManager({
  propertyId,
  attachments,
  canManage,
}: {
  propertyId: string;
  attachments: AttachmentItem[];
  canManage: boolean;
}) {
  const action = uploadAttachmentAction.bind(null, propertyId);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ name: string; size: number }[]>([]);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<PreviewDoc | null>(null);

  // Keep the whole batch under the 25 MB Server Action body cap (several files each
  // within their per-file limit can still overflow it and fail opaquely).
  const BATCH_LIMIT = 24 * 1024 * 1024;

  // Reset the picker after a successful upload so the next batch starts clean.
  useEffect(() => {
    if (state.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPicked([]);
      setSizeError(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [state]);

  function openPicker() {
    if (fileRef.current) {
      // Clear the value FIRST so re-selecting the same file (or clicking again
      // after cancelling) still fires onChange and opens the dialog every time.
      fileRef.current.value = "";
      fileRef.current.click();
    }
  }

  function onFilesChosen(files: FileList | null) {
    const list = Array.from(files ?? []);
    setPicked(list.map((f) => ({ name: f.name, size: f.size })));
    const total = list.reduce((n, f) => n + f.size, 0);
    setSizeError(
      total > BATCH_LIMIT
        ? `Selected files total ${(total / 1024 / 1024).toFixed(1)} MB — over the 24 MB per-upload limit. Upload fewer at a time.`
        : null,
    );
  }

  const totalMb = picked.reduce((n, f) => n + f.size, 0) / 1024 / 1024;
  const summary =
    picked.length === 0
      ? "No files selected — images or PDF brochures (bulk upload supported)"
      : picked.length === 1
        ? `${picked[0].name} (${totalMb.toFixed(1)} MB)`
        : `${picked.length} files selected (${totalMb.toFixed(1)} MB)`;

  return (
    <div>
      {/* Collapsible header — expand/collapse the whole attachments panel. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontSize: 15,
          fontWeight: 600,
          color: "var(--ink)",
        }}
      >
        <ChevronDown
          className="h-4 w-4"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}
        />
        Attachments
        <span style={{ color: "var(--ink-fade)", fontWeight: 500 }}>({attachments.length})</span>
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
          {attachments.length > 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 10,
              }}
            >
              {attachments.map((a) => (
                <AttachmentRow key={a.id} a={a} canManage={canManage} onPreview={setPreviewDoc} />
              ))}
            </div>
          )}

          {canManage && (
        <form action={formAction} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            ref={fileRef}
            name="file"
            type="file"
            accept="image/*,application/pdf"
            multiple
            style={{ display: "none" }}
            onChange={(e) => onFilesChosen(e.target.files)}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button type="button" className="btn" onClick={openPicker}>
              <Paperclip className="h-4 w-4" /> Choose files
            </button>
            <span
              style={{
                flex: 1,
                minWidth: 140,
                fontSize: 13,
                color: picked.length ? "var(--ink)" : "var(--ink-fade)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {summary}
            </span>
            <select
              name="kind"
              defaultValue="BROCHURE"
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: "var(--rule)" }}
              title="Applies to non-image files (PDFs). Images are always saved as photos."
            >
              <option value="BROCHURE">Brochure</option>
              <option value="FLOORPLAN">Floor plan</option>
              <option value="OTHER">Other</option>
            </select>
            <button type="submit" className="btn-primary" disabled={pending || picked.length === 0 || !!sizeError}>
              <Upload className="h-4 w-4" />
              {pending ? "Uploading…" : picked.length > 1 ? `Upload ${picked.length}` : "Upload"}
            </button>
          </div>
          {sizeError && <p className="field-error" style={{ margin: 0 }}>{sizeError}</p>}
          {/* A partial-failure message comes back with ok:true (some uploaded), so tint
              it as a warning rather than a hard error. */}
          {state.error && (
            <p
              className="field-error"
              style={{ margin: 0, color: state.ok ? "var(--warn)" : undefined }}
            >
              {state.error}
            </p>
          )}
            </form>
          )}

          {attachments.length === 0 && !canManage && (
            <p style={{ fontSize: 13, color: "var(--ink-fade)" }}>No attachments.</p>
          )}
        </div>
      )}

      <DocPreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}

function AttachmentRow({
  a,
  canManage,
  onPreview,
}: {
  a: AttachmentItem;
  canManage: boolean;
  onPreview: (doc: PreviewDoc) => void;
}) {
  const isImage = a.mimeType.startsWith("image/");
  const isPdf = a.mimeType === "application/pdf";
  const [pending, start] = useTransition();
  const [removed, setRemoved] = useState(false);
  if (removed) return null;

  const inner = (
    <>
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachmentUrl(a.id)}
          alt={a.originalFilename}
          style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
        />
      ) : (
        <span className="kpi-icon" style={{ position: "static", width: 44, height: 44 }}>
          {a.kind === "IMAGE" ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </span>
      )}
      <span style={{ minWidth: 0, textAlign: "left" }}>
        <span
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {a.originalFilename}
        </span>
        <span style={{ fontSize: 11, color: "var(--ink-fade)" }}>
          {a.kind.toLowerCase()} · {(a.sizeBytes / 1024).toFixed(0)} KB{isPdf ? " · click to preview" : ""}
        </span>
      </span>
    </>
  );

  const openerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
  };

  return (
    <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: 10 }}>
      {isPdf ? (
        <button
          type="button"
          onClick={() => onPreview({ id: a.id, name: a.originalFilename })}
          style={openerStyle}
        >
          {inner}
        </button>
      ) : (
        <a
          href={attachmentUrl(a.id)}
          target="_blank"
          rel="noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}
        >
          {inner}
        </a>
      )}
      {canManage && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          title="Remove attachment"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteAttachmentAction(a.id);
              if (!res?.error) setRemoved(true);
            })
          }
        >
          <Trash2 className="h-4 w-4" style={{ color: "var(--bad)" }} />
        </button>
      )}
    </div>
  );
}
