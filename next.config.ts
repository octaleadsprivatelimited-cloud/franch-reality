import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the Docker / Azure Container Apps image.
  output: "standalone",
  // Node-only SDKs that must stay external (not bundled) in the server build.
  serverExternalPackages: ["@azure/storage-blob", "sharp"],
  experimental: {
    serverActions: {
      // Every upload path (property media, brochures/floor plans, and the bulk
      // inventory .xlsx import) is a Server Action receiving the file in FormData.
      // Server Actions cap the request body at 1 MB by default, which silently
      // rejected any real photo (2–5 MB), PDF brochure (≤20 MB), or bulk sheet
      // (≤10 MB) BEFORE the handler ran. Raise it above the app's own per-file
      // limits (5 MB image / 20 MB doc / 10 MB xlsx). Kept at 25 MB (not higher)
      // because the upload path is fully buffered in memory on a 0.5 vCPU / 1 GiB
      // replica; the routes are auth-gated (internal tool), so DoS risk is low.
      bodySizeLimit: "25mb",
    },
    // CRITICAL companion to bodySizeLimit: this app has a proxy (src/proxy.ts, the
    // Next-16 rename of middleware, running Auth.js on the /inventory* routes). When
    // a proxy runs, Next buffers the request body up to proxyClientMaxBodySize
    // (default 10 MB) and SILENTLY TRUNCATES anything larger — the Server Action
    // then gets a corrupt multipart body and fails opaquely. Without raising this,
    // 10–20 MB brochures break even with bodySizeLimit above. Set ABOVE bodySizeLimit
    // so an oversize upload hits the Server Action's clean 413 instead of silent
    // truncation.
    proxyClientMaxBodySize: "30mb",
  },
  async headers() {
    const appCsp = [
      "default-src 'self'",
      // Next.js inlines a small runtime bootstrap; styles use inline styles.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://maps.googleapis.com",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        // Safe transport/sniffing headers for EVERY response (these don't block framing).
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Clickjacking / frame guards on every page EXCEPT the authenticated attachment
        // route (/api/attachments/*). Those responses are access-controlled files, not
        // clickjackable UI, and their PDFs must be embeddable in the in-app preview iframe
        // (same-origin) — a global X-Frame-Options: DENY / frame-ancestors 'none' here
        // blanked the preview in every browser. The route sets its own per-response
        // frame-ancestors (self for inline PDFs, none otherwise).
        source: "/((?!api/attachments/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: appCsp },
        ],
      },
    ];
  },
};

export default nextConfig;
