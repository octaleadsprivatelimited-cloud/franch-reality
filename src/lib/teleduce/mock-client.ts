import type { TeleduceClient, TeleduceLead } from "./types";
import { MOCK_TELEDUCE_LEADS } from "./mock-data";

// In-process stand-in for Corefactors used whenever no live credentials are
// configured. Returns the shared deterministic dataset and simulates writeback.
export class MockTeleduceClient implements TeleduceClient {
  readonly mode = "mock" as const;
  readonly canWriteback = true; // no real CRM, so we simulate the push

  async listLeads(opts?: { updatedSince?: Date }): Promise<TeleduceLead[]> {
    let leads = MOCK_TELEDUCE_LEADS;
    if (opts?.updatedSince) {
      const since = opts.updatedSince.getTime();
      leads = leads.filter((l) => Date.parse(l.updatedAt) >= since);
    }
    // Defensive copies so callers can't mutate the shared dataset.
    return leads.map((l) => ({ ...l }));
  }

  async updateLeadStage(
    teleduceLeadId: string,
    stageId: number,
    stageDisplay: string,
  ): Promise<void> {
    // No live CRM to push to — record the simulated write so the flow is visible
    // in logs. Real pushes happen via CorefactorsClient once creds are configured.
    console.log(
      `[teleduce mock] writeback lead ${teleduceLeadId} → stage ${stageId} (${stageDisplay})`,
    );
  }
}
