import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { LocalityForm } from "@/components/settings/LocalityForm";
import { createLocalityAction } from "../actions";

export default async function NewLocalityPage() {
  await requireAdmin();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link
        href="/settings/localities"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          color: "var(--ink-soft)",
          marginBottom: 16,
        }}
      >
        ← Back to locations
      </Link>
      <div className="page-header">
        <div>
          <h1>Add location</h1>
          <div className="subtitle">Create a new locality for inventory, leads and matching.</div>
        </div>
      </div>
      <LocalityForm action={createLocalityAction} submitLabel="Add location" />
    </div>
  );
}
