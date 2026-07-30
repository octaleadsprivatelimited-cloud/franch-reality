// Normalised shape of a lead as it comes out of Teleduce/Corefactors, before it
// is mapped onto our Lead model. Field names mirror the CRM custom fields; raw
// labels are kept as-is and mapped
// downstream in sync.ts so the mapping rules live in exactly one place.
export interface TeleduceLead {
  teleduceLeadId: string;
  firstName: string;
  lastName: string | null;
  mobile: string | null;
  email: string | null;
  /** "Budget" currency field — absolute INR (the lead's stated ceiling). */
  budget: number | null;
  /** Raw "City" text field. */
  city: string | null;
  /** Raw "Area of Interest" multi-option labels (mapped to localities). */
  areaOfInterest: string[];
  /** Raw "Property Type" (Villa / Apartment / Plot / Office / Retail / RnR). */
  propertyType: string | null;
  /** Raw "Bedrooms" multi-option labels (e.g. "3 BHK", "6 BHK and more"). */
  bedrooms: string[];
  /** Raw "Lead Types" (e.g. "Residential Sale", "Commercial Rental"). */
  leadType: string | null;
  leadSource: string | null;
  leadOwner: string | null;
  stageId: number | null;
  stageDisplay: string | null;
  /** ISO timestamp of the lead's last update in Teleduce (sync watermark). */
  updatedAt: string;
  /** Full upstream payload, persisted to Lead.rawPayload for audit/replay. */
  raw?: unknown;
}

export interface TeleduceClient {
  readonly mode: "live" | "mock";
  /**
   * Whether this client can push pipeline-stage changes back to the CRM. False
   * for the live Corefactors adapter until a stage-update API is provided — the
   * writeback layer then records intent as a clean PENDING instead of retrying a
   * call that cannot succeed. The mock simulates writeback, so it is true.
   */
  readonly canWriteback: boolean;
  /**
   * Return all leads in scope. The client paginates internally. `updatedSince`
   * is an optional efficiency hint; the pull still reconciles the full set for
   * soft-archive detection.
   */
  listLeads(opts?: { updatedSince?: Date }): Promise<TeleduceLead[]>;
  /** Push a pipeline-stage change for a lead (writeback). Throws on failure. */
  updateLeadStage(teleduceLeadId: string, stageId: number, stageDisplay: string): Promise<void>;
}
