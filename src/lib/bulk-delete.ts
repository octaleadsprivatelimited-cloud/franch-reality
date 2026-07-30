// Shared, dependency-free types for the admin bulk-delete / backup flow. Imported by
// both client (selection UI) and server (delete actions + export route), so it must
// stay free of any server-only / prisma imports.

/**
 * What the admin selected for delete/backup. Either an explicit id list, or "everything
 * matching the current filter" (minus a few de-selected ids) — the latter lets a single
 * click target all N rows (e.g. 10,000) without shipping every id to the server.
 */
export type DeleteSelection =
  | { mode: "ids"; ids: string[] }
  | {
      mode: "filter";
      params: Record<string, string | string[] | undefined>;
      excluded: string[];
      /** ISO snapshot of when the admin loaded the list — delete/backup bound to
       *  createdAt <= this so rows arriving AFTER (mid-op) are never touched, keeping
       *  the deleted set provably equal to what was shown and backed up. */
      before?: string;
    };

/** Hard safety cap on a single delete/export operation. */
export const MAX_BULK = 50000;
