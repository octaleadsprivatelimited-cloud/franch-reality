import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  corefactorsOwnerIndexFromAgents,
  normalizeCorefactorsOwner,
  resolveCorefactorsOwnerAgentId,
} from "../../src/lib/leads/corefactors-owner";

describe("Corefactors owner reconciliation", () => {
  const index = corefactorsOwnerIndexFromAgents([
    {
      id: "hyd",
      email: "hyderabad.agent@example.com",
      fullName: "Hyderabad Demo Agent",
      cities: ["HYDERABAD", "CHENNAI"],
    },
    {
      id: "chennai",
      email: "chennai.agent@example.com",
      fullName: "Chennai Demo Agent",
      cities: ["CHENNAI"],
    },
  ]);

  test("normalizes email/name values and known unassigned markers", () => {
    assert.equal(
      normalizeCorefactorsOwner("  Hyderabad.Agent@Example.com "),
      "hyderabad.agent@example.com",
    );
    assert.equal(normalizeCorefactorsOwner("Hyderabad   Demo Agent"), "hyderabad demo agent");
    assert.equal(normalizeCorefactorsOwner("Unassigned"), null);
    assert.equal(normalizeCorefactorsOwner("  "), null);
  });

  test("matches an upstream owner by email or full name", () => {
    assert.equal(
      resolveCorefactorsOwnerAgentId(
        "HYDERABAD.AGENT@EXAMPLE.COM",
        "HYDERABAD",
        index,
      ),
      "hyd",
    );
    assert.equal(
      resolveCorefactorsOwnerAgentId("Chennai Demo Agent", "CHENNAI", index),
      "chennai",
    );
  });

  test("does not link an owner to an agent who cannot access the lead city", () => {
    assert.equal(
      resolveCorefactorsOwnerAgentId(
        "chennai.agent@example.com",
        "HYDERABAD",
        index,
      ),
      null,
    );
  });

  test("leaves missing and ambiguous owner identities unresolved", () => {
    const ambiguous = corefactorsOwnerIndexFromAgents([
      {
        id: "a",
        email: "a@example.com",
        fullName: "Shared Owner",
        cities: ["HYDERABAD"],
      },
      {
        id: "b",
        email: "b@example.com",
        fullName: "Shared Owner",
        cities: ["HYDERABAD"],
      },
    ]);
    assert.equal(resolveCorefactorsOwnerAgentId("missing@example.com", "HYDERABAD", index), null);
    assert.equal(resolveCorefactorsOwnerAgentId("Shared Owner", "HYDERABAD", ambiguous), null);
  });
});
