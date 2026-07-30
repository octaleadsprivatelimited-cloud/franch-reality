import { env, teleduceMockMode } from "@/lib/env";
import type { TeleduceClient } from "./types";
import { MockTeleduceClient } from "./mock-client";
import { CorefactorsClient } from "./corefactors-client";

export type { TeleduceClient, TeleduceLead } from "./types";

/**
 * Resolve the Teleduce client. With no real credentials configured we fall back
 * to a safe in-process mock (so the whole pull/writeback pipeline is runnable and
 * demoable in dev) — the instant the client provides a live API key + base URL,
 * the same code talks to real Corefactors with no other change.
 */
export function getTeleduceClient(): TeleduceClient {
  if (teleduceMockMode) {
    // Guard: never silently sync the fake mock dataset against a PRODUCTION
    // database. A creds-less prod deploy must fail loudly (set TELEDUCE_ALLOW_MOCK
    // only for a deliberate demo). Dev/test fall through to the mock.
    if (process.env.NODE_ENV === "production" && !env.TELEDUCE_ALLOW_MOCK) {
      throw new Error(
        "Teleduce is in MOCK mode in production. Set TELEDUCE_API_BASE_URL + TELEDUCE_API_KEY for live sync, or TELEDUCE_ALLOW_MOCK=true to intentionally run on mock data.",
      );
    }
    return new MockTeleduceClient();
  }
  return new CorefactorsClient({
    baseUrl: env.TELEDUCE_API_BASE_URL,
    apiKey: env.TELEDUCE_API_KEY,
    cityFilter: env.TELEDUCE_CITY_FILTER,
  });
}
