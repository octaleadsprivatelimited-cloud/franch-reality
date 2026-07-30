import { env, whatsappConfigured } from "@/lib/env";

// Thin wrapper over the WhatsApp Business Cloud API (graph.facebook.com). Reads
// credentials from env at call time, so the rest of the app is "infra-ready" and
// goes live the moment the WHATSAPP_* secrets are set — no code change needed.

const GRAPH = "https://graph.facebook.com";

export class WhatsAppNotConfiguredError extends Error {
  constructor() {
    super("WhatsApp Cloud API credentials are not configured.");
    this.name = "WhatsAppNotConfiguredError";
  }
}

export function isWhatsAppConfigured(): boolean {
  return whatsappConfigured;
}

function base(): string {
  return `${GRAPH}/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}`;
}

async function sendMessage(payload: Record<string, unknown>): Promise<string> {
  if (!whatsappConfigured) throw new WhatsAppNotConfiguredError();
  const res = await fetch(`${base()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `WhatsApp send failed (HTTP ${res.status})`);
  }
  return json?.messages?.[0]?.id ?? "";
}

export function sendText(to: string, body: string): Promise<string> {
  return sendMessage({ to, type: "text", text: { preview_url: false, body } });
}

export function sendDocument(
  to: string,
  opts: { mediaId?: string; link?: string; filename?: string; caption?: string },
): Promise<string> {
  const document: Record<string, unknown> = {};
  if (opts.mediaId) document.id = opts.mediaId;
  else if (opts.link) document.link = opts.link;
  if (opts.filename) document.filename = opts.filename;
  if (opts.caption) document.caption = opts.caption;
  return sendMessage({ to, type: "document", document });
}

export function sendImage(
  to: string,
  opts: { mediaId?: string; link?: string; caption?: string },
): Promise<string> {
  const image: Record<string, unknown> = {};
  if (opts.mediaId) image.id = opts.mediaId;
  else if (opts.link) image.link = opts.link;
  if (opts.caption) image.caption = opts.caption;
  return sendMessage({ to, type: "image", image });
}

export interface TemplateComponent {
  type: string;
  sub_type?: string;
  index?: string;
  parameters?: unknown[];
}

export function sendTemplate(
  to: string,
  name: string,
  languageCode = "en",
  components?: TemplateComponent[],
): Promise<string> {
  return sendMessage({
    to,
    type: "template",
    template: { name, language: { code: languageCode }, ...(components ? { components } : {}) },
  });
}

/** Upload bytes to WhatsApp media and return the media id (used to attach our own
 *  generated portfolio PDFs / property images to a message). */
export async function uploadMedia(
  bytes: Uint8Array,
  mimeType: string,
  filename: string,
): Promise<string> {
  if (!whatsappConfigured) throw new WhatsAppNotConfiguredError();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  // Cast: Uint8Array is a valid BlobPart at runtime; the lib's strict ArrayBuffer
  // typing rejects it otherwise.
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: mimeType }), filename);
  const res = await fetch(`${base()}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `WhatsApp media upload failed (HTTP ${res.status})`);
  return json?.id ?? "";
}
