import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { getLocalitiesForUser } from "@/lib/queries/inventory";
import { PropertyForm } from "@/components/inventory/PropertyForm";
import { createPropertyAction } from "../actions";

export default async function NewPropertyPage() {
  const user = await requireUser();
  const localities = await getLocalitiesForUser(user);

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-fade)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
            <Link href="/inventory">← Back to inventory</Link>
          </div>
          <h1 style={{ marginTop: 6 }}>Add property</h1>
        </div>
      </div>
      <PropertyForm action={createPropertyAction} localities={localities} submitLabel="Create property" enableMediaUpload />
    </div>
  );
}
