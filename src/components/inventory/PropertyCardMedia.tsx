"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { DocPreviewModal, type PreviewDoc } from "./DocPreview";

export interface CardImage {
  id: string;
  url: string;
}

/**
 * Property-card media area: a mini carousel of ALL the property's photos (arrows +
 * dots) plus a document-preview button. Clicking the image navigates to the property;
 * the arrows / dots / doc button stop propagation so they don't trigger navigation.
 * Falls back to the gradient placeholder when the property has no photos.
 */
export function PropertyCardMedia({
  href,
  images,
  docs,
  badges,
}: {
  href: string;
  images: CardImage[];
  docs: PreviewDoc[];
  badges: React.ReactNode;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const [doc, setDoc] = useState<PreviewDoc | null>(null);
  const count = images.length;
  const active = count ? images[Math.min(idx, count - 1)] : null;

  function go(dir: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIdx((i) => (i + dir + count) % count);
  }

  return (
    <div
      className="prop-img"
      onClick={() => router.push(href)}
      style={active ? { backgroundImage: `url(${active.url})`, cursor: "pointer" } : { cursor: "pointer" }}
    >
      {badges}

      {count > 1 && (
        <>
          <button type="button" onClick={(e) => go(-1, e)} aria-label="Previous photo" style={arrowStyle("left")}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={(e) => go(1, e)} aria-label="Next photo" style={arrowStyle("right")}>
            <ChevronRight className="h-4 w-4" />
          </button>
          <span style={dotsWrap}>
            {images.map((img, i) => (
              <span key={img.id} style={dotStyle(i === idx)} />
            ))}
          </span>
        </>
      )}

      {docs.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDoc(docs[0]);
          }}
          title="Preview document"
          style={docButtonStyle}
        >
          <FileText className="h-3.5 w-3.5" />
          {docs.length === 1 ? "Brochure" : `${docs.length} docs`}
        </button>
      )}

      <DocPreviewModal doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}

function arrowStyle(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 6,
    zIndex: 2,
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.45)",
    color: "#fff",
  };
}

const dotsWrap: React.CSSProperties = {
  position: "absolute",
  bottom: 8,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 2,
  display: "flex",
  gap: 4,
};

function dotStyle(activeDot: boolean): React.CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: activeDot ? "#fff" : "rgba(255,255,255,0.5)",
  };
}

const docButtonStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 8,
  right: 8,
  zIndex: 2,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 8px",
  borderRadius: "var(--radius-sm)",
  border: "none",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(0,0,0,0.6)",
  color: "#fff",
};
