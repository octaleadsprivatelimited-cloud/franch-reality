import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { getLocalitiesForUser } from "@/lib/queries/inventory";
import { UserForm } from "@/components/settings/UserForm";
import { createUserAction } from "../../actions";

export default async function NewUserPage() {
  const admin = await requireAdmin();
  const localities = await getLocalitiesForUser(admin);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link
        href="/settings"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          color: "var(--ink-soft)",
          marginBottom: 16,
        }}
      >
        ← Back to settings
      </Link>
      <div className="page-header">
        <div>
          <h1>Add user</h1>
          <div className="subtitle">Create a new internal account.</div>
        </div>
      </div>
      <UserForm action={createUserAction} localities={localities} submitLabel="Create user" />
    </div>
  );
}
