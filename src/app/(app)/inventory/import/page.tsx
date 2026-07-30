import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { ImportWizard } from "@/components/inventory/ImportWizard";

export default async function ImportPage() {
  await requireAdmin();
  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-fade)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
            <Link href="/inventory">← Back to inventory</Link>
          </div>
          <h1 style={{ marginTop: 6 }}>Bulk import properties</h1>
          <div className="subtitle">
            Validate every row, review a dry-run preview, then commit — nothing is written until you confirm.
          </div>
        </div>
      </div>
      <ImportWizard />
    </div>
  );
}
