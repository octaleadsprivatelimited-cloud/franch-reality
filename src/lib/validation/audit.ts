import { z } from "zod";

// Filters for the admin audit-log viewer. Audit is global (admins see all),
// so there is no city scope here — only entity/action/user/date filters.
export const auditFilterSchema = z.object({
  entityType: z.string().trim().optional(),
  // Case-insensitive "contains" search against the action string.
  action: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  // ISO date strings (YYYY-MM-DD) from the <input type="date"> controls.
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type AuditFilter = z.infer<typeof auditFilterSchema>;
