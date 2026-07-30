"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface GalleryImage {
  id: string;
  url: string;
  alt: string;
}

/**
 * Property photo gallery: a large main "slide" plus a thumbnail strip of ALL images,
 * and a fullscreen lightbox slideshow (prev/next arrows, thumbnail clicks, ←/→/Esc
 * keyboard nav). Replaces the old fixed 1-hero-+-2-side layout that capped preview at
 * three images.
 */
export function PropertyGallery({
  images,
  overlay,
}: {
  images: GalleryImage[];
  /** Absolutely-positioned badges rendered over the main slide (status / transaction). */
  overlay?: React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const count = images.length;
  const go = useCallback(
    (dir: number) => setActive((a) => (a + dir + count) % count),
    [count],
  );

  // Keyboard navigation while the lightbox is open.
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(false);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, go]);

  if (count === 0) return null;
  const current = images[Math.min(active, count - 1)];

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Main slide */}
      <div
        style={{
          position: "relative",
          height: 320,
          borderRadius: "var(--radius)",
          overflow: "hidden",
          background: "#0e1420",
          cursor: "zoom-in",
        }}
        onClick={() => setLightbox(true)}
        title="Click to view full screen"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.alt}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        {overlay}
        {count > 1 && (
          <>
            <ArrowButton side="left" onClick={(e) => { e.stopPropagation(); go(-1); }} />
            <ArrowButton side="right" onClick={(e) => { e.stopPropagation(); go(1); }} />
            <span style={counterBadge}>
              {active + 1} / {count}
            </span>
          </>
        )}
      </div>

      {/* Thumbnail strip — every image */}
      {count > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, overflowX: "auto", paddingBottom: 4 }}>
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1}`}
              style={{
                flex: "0 0 auto",
                width: 72,
                height: 54,
                borderRadius: 6,
                overflow: "hidden",
                padding: 0,
                cursor: "pointer",
                background: "none",
                border: i === active ? "2px solid var(--brand)" : "2px solid transparent",
                opacity: i === active ? 1 : 0.65,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.alt}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen lightbox */}
      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Property photos"
          onClick={() => setLightbox(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(6, 10, 18, 0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <button type="button" aria-label="Close" onClick={() => setLightbox(false)} style={lightboxClose}>
            <X className="h-6 w-6" />
          </button>
          {count > 1 && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              style={{ ...lightboxNav, left: 16 }}
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.url}
            alt={current.alt}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "92vw", maxHeight: "86vh", objectFit: "contain", borderRadius: 8 }}
          />
          {count > 1 && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              style={{ ...lightboxNav, right: 16 }}
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          )}
          <span
            style={{
              position: "fixed",
              bottom: 20,
              left: "50%",
              transform: "translateX(-50%)",
              color: "#fff",
              fontSize: 13,
              background: "rgba(0,0,0,0.5)",
              padding: "4px 12px",
              borderRadius: 999,
            }}
          >
            {active + 1} / {count}
          </span>
        </div>
      )}
    </div>
  );
}

function ArrowButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: (e: React.MouseEvent) => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      onClick={onClick}
      style={{
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        [side]: 10,
        width: 36,
        height: 36,
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.45)",
        color: "#fff",
      }}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

const counterBadge: React.CSSProperties = {
  position: "absolute",
  bottom: 12,
  right: 12,
  fontSize: 12,
  fontWeight: 600,
  color: "#fff",
  background: "rgba(0,0,0,0.55)",
  padding: "3px 10px",
  borderRadius: 999,
};

const lightboxNav: React.CSSProperties = {
  position: "fixed",
  top: "50%",
  transform: "translateY(-50%)",
  width: 48,
  height: 48,
  borderRadius: "50%",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.12)",
  color: "#fff",
};

const lightboxClose: React.CSSProperties = {
  position: "fixed",
  top: 16,
  right: 16,
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: "none",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.12)",
  color: "#fff",
};
