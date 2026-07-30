import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listLocalitiesForAdmin } from "@/lib/queries/localities";
import { cityLabel } from "@/lib/domain";

export default async function LocalitiesPage() {
  await requireAdmin();
  const localities = await listLocalitiesForAdmin();
  const hyd = localities.filter((l) => l.city === "HYDERABAD").length;
  const chn = localities.length - hyd;

  return (
    <div className="space-y-5">
      <Link
        href="/settings"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          color: "var(--ink-soft)",
        }}
      >
        ← Back to settings
      </Link>

      <div className="page-header">
        <div>
          <h1>Locations</h1>
          <div className="subtitle">
            {localities.length} total · {hyd} Hyderabad · {chn} Chennai
          </div>
        </div>
        <div className="page-actions">
          <Link href="/settings/localities/new" className="btn-primary">
            + Add location
          </Link>
        </div>
      </div>

      {localities.length === 0 ? (
        <div className="card card-pad" style={{ textAlign: "center", color: "var(--ink-fade)", padding: 40 }}>
          No locations yet. Add the first one to make it available across inventory, leads and matching.
        </div>
      ) : (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="table-wrap">
            <table className="lead-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>City</th>
                  <th>Coordinates</th>
                  <th>Properties</th>
                  <th>Leads</th>
                  <th aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody>
                {localities.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/settings/localities/${l.id}`} style={{ fontWeight: 600 }}>
                        {l.name}
                      </Link>
                    </td>
                    <td>{cityLabel[l.city]}</td>
                    <td>
                      {l.approxCoords ? (
                        <span className="role-badge agent">Approx.</span>
                      ) : (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
                          {l.latitude.toFixed(4)}, {l.longitude.toFixed(4)}
                        </span>
                      )}
                    </td>
                    <td>{l._count.properties}</td>
                    <td>{l._count.interestedLeads}</td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/settings/localities/${l.id}`} className="btn btn-sm">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
