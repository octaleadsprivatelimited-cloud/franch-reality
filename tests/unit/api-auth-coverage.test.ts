import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Defense-in-depth: the proxy/middleware matcher deliberately excludes /api, so
// each route handler must enforce its OWN authentication. This test fails the build
// if a new API route ships without a session-auth guard and isn't consciously
// whitelisted as a public / self-authenticating endpoint.
const API_DIR = join(process.cwd(), "src", "app", "api");

// Endpoints that are intentionally public or carry their own secret/handshake auth.
// Adding one here is a deliberate, reviewable decision.
const PUBLIC_OR_SELF_AUTH = new Set([
  "auth/[...nextauth]/route.ts", // NextAuth handler
  "health/route.ts", // liveness/readiness probe
  "teleduce/webhook/route.ts", // own TELEDUCE_WEBHOOK_SECRET
  "whatsapp/webhook/route.ts", // own X-Hub-Signature-256 / verify token
  "sync/teleduce/pull/route.ts", // own CRON_SECRET
  "whatsapp/process-outbox/route.ts", // own CRON_SECRET
]);

// A call proving the handler authenticates the signed-in user.
const GUARD_RE = /\b(currentUser|requireUser|requireAdmin)\s*\(/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

describe("API route auth coverage", () => {
  const routes = walk(API_DIR);

  test("there is at least one API route to check", () => {
    assert.ok(routes.length > 0, "no route.ts files found under src/app/api");
  });

  for (const file of routes) {
    const rel = file.slice(API_DIR.length + 1).replaceAll("\\", "/");
    test(`${rel} enforces auth or is whitelisted`, () => {
      const src = readFileSync(file, "utf8");
      const guarded = GUARD_RE.test(src);
      const whitelisted = PUBLIC_OR_SELF_AUTH.has(rel);
      assert.ok(
        guarded || whitelisted,
        `${rel} calls no session-auth guard (currentUser/requireUser/requireAdmin) and is not ` +
          `whitelisted. If it is intentionally public/self-authenticating, add it to ` +
          `PUBLIC_OR_SELF_AUTH with a reason.`,
      );
    });
  }
});
