import { z } from "zod";

// In standalone scripts (seed, teleduce pull) run via tsx, .env is not auto-loaded the
// way Next.js loads it for the app runtime. Node 20.12+/22 can load it on demand.
if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    /* .env may be absent in some environments (e.g. CI with real env vars) */
  }
}

const boolish = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url().optional(),

  // Object storage — provider-selectable (S3/MinIO/R2 or Azure Blob).
  STORAGE_PROVIDER: z.enum(["s3", "azure"]).optional().default("s3"),

  // S3 / R2 / MinIO (required when STORAGE_PROVIDER=s3; validated in lib/storage.ts).
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_FORCE_PATH_STYLE: boolish,

  // Azure Blob (required when STORAGE_PROVIDER=azure; validated in lib/storage.ts).
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_ACCOUNT: z.string().optional(),
  AZURE_STORAGE_KEY: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().optional().default("attachments"),

  // Corefactors Teleduce. Blank API key => safe mock mode.
  TELEDUCE_API_BASE_URL: z.string().optional().default(""),
  TELEDUCE_API_KEY: z.string().optional().default(""),
  TELEDUCE_CITY_FILTER: z.string().optional().default("Hyderabad,Chennai"),
  // Shared secret for the inbound Corefactors lead webhook (real-time push).
  TELEDUCE_WEBHOOK_SECRET: z.string().optional().default(""),
  // Must be explicitly "true" to allow mock mode in production — otherwise a
  // creds-less prod deploy fails loudly instead of silently syncing fake leads.
  TELEDUCE_ALLOW_MOCK: boolish,

  CRON_SECRET: z.string().min(32, "CRON_SECRET must be at least 32 characters"),

  // WhatsApp Business Cloud API. Blank => the
  // messaging UI records intent but cannot send live (infra-ready, creds pending).
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(""),
  WHATSAPP_APP_SECRET: z.string().optional().default(""),
  WHATSAPP_VERIFY_TOKEN: z.string().optional().default(""),
  WHATSAPP_API_VERSION: z.string().optional().default("v21.0"),

});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment configuration. Check your .env (see .env.example):\n${issues}`,
  );
}

export const env = parsed.data;

/** True when no real Teleduce credentials are configured — sync runs in safe mock mode. */
export const teleduceMockMode = !env.TELEDUCE_API_KEY || !env.TELEDUCE_API_BASE_URL;

/** True when WhatsApp Cloud API credentials are present so messages can be sent live. */
export const whatsappConfigured = Boolean(
  env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN,
);
