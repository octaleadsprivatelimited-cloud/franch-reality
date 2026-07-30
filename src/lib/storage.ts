import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { env } from "./env";

// Provider-agnostic object storage. The active backend is chosen by
// STORAGE_PROVIDER (default "s3"):
//   - "s3"    → any S3-compatible store (MinIO in dev, Cloudflare R2 in prod).
//   - "azure" → Azure Blob Storage (used by the managed Azure deployment).
// All call sites (upload action, attachment serving, portfolio PDF) use the same
// putObject/getObjectBytes/deleteObject signatures, so swapping providers is a
// pure env change with no code changes elsewhere.

export interface StoredObject {
  bytes: Uint8Array;
  contentType?: string;
}

interface StorageProvider {
  put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject>;
  remove(key: string): Promise<void>;
}

// ── S3 / R2 / MinIO ──────────────────────────────────────────────────────────
function makeS3Provider(): StorageProvider {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY || !env.S3_BUCKET) {
    throw new Error(
      "STORAGE_PROVIDER=s3 but S3_ENDPOINT/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_BUCKET are not all set.",
    );
  }
  const s3 = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  const bucket = env.S3_BUCKET;
  return {
    async put(key, body, contentType) {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async get(key) {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!res.Body) throw new Error("Empty object body");
      const bytes = await res.Body.transformToByteArray();
      return { bytes, contentType: res.ContentType };
    },
    async remove(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

// ── Azure Blob Storage ───────────────────────────────────────────────────────
function makeAzureProvider(): StorageProvider {
  let svc: BlobServiceClient;
  if (env.AZURE_STORAGE_CONNECTION_STRING) {
    svc = BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING);
  } else if (env.AZURE_STORAGE_ACCOUNT && env.AZURE_STORAGE_KEY) {
    const cred = new StorageSharedKeyCredential(env.AZURE_STORAGE_ACCOUNT, env.AZURE_STORAGE_KEY);
    svc = new BlobServiceClient(
      `https://${env.AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`,
      cred,
    );
  } else {
    throw new Error(
      "STORAGE_PROVIDER=azure but neither AZURE_STORAGE_CONNECTION_STRING nor AZURE_STORAGE_ACCOUNT+AZURE_STORAGE_KEY are set.",
    );
  }
  const container = svc.getContainerClient(env.AZURE_STORAGE_CONTAINER);
  return {
    async put(key, body, contentType) {
      const blob = container.getBlockBlobClient(key);
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
      await blob.uploadData(buf, { blobHTTPHeaders: { blobContentType: contentType } });
    },
    async get(key) {
      const blob = container.getBlockBlobClient(key);
      const dl = await blob.download();
      const chunks: Buffer[] = [];
      const stream = dl.readableStreamBody;
      if (!stream) throw new Error("Empty blob body");
      for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
      }
      return { bytes: Buffer.concat(chunks), contentType: dl.contentType };
    },
    async remove(key) {
      await container.getBlockBlobClient(key).deleteIfExists();
    },
  };
}

let _provider: StorageProvider | null = null;
function provider(): StorageProvider {
  if (!_provider) {
    _provider = env.STORAGE_PROVIDER === "azure" ? makeAzureProvider() : makeS3Provider();
  }
  return _provider;
}

/**
 * Sniff the real MIME from leading magic bytes — never trust a client-supplied
 * Content-Type on upload (defends against an SVG/HTML smuggled as image/png).
 * Returns the detected type or null if it isn't an allowed image/PDF.
 */
export function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "image/png";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return "image/webp";
  // GIF ("GIF87a"/"GIF89a" both begin with the ASCII "GIF8"). The upload UI
  // (accept="image/*") and the validation message both advertise GIF, so detect
  // it here rather than rejecting it with a misleading "not allowed" error.
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return "image/gif";
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return "application/pdf";
  return null;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  return provider().put(key, body, contentType);
}

/** Download an object's bytes + content type (for the authenticated serving route). */
export async function getObjectBytes(key: string): Promise<StoredObject> {
  return provider().get(key);
}

export async function deleteObject(key: string): Promise<void> {
  return provider().remove(key);
}
