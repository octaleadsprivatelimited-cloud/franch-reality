-- The leads list now sorts by createdAt DESC (newest-pulled first) with the default
-- WHERE isArchivedInTeleduce = false, and the new "pulled in the last 30 min / 1 hour /
-- 24 hours" filter ranges over createdAt. Without this index that is a seq scan + top-N
-- sort on every /leads and /matching load. Additive and non-breaking: the app is correct
-- (just slower) if this has not been applied yet.
CREATE INDEX IF NOT EXISTS "leads_isArchivedInTeleduce_createdAt_idx"
  ON "leads" ("isArchivedInTeleduce", "createdAt");
