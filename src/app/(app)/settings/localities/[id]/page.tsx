import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getLocalityForAdmin } from "@/lib/queries/localities";
import { cityLabel } from "@/lib/domain";
import {
  LocalityForm,
  DeleteLocalityButton,
  type LocalityFormValues,
} from "@/components/settings/LocalityForm";
import { updateLocalityAction, deleteLocalityAction } from "../actions";

export default async function EditLocalityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const localityId = Number(id);
  if (!Number.isInteger(localityId)) notFound();

  const locality = await getLocalityForAdmin(localityId);
  if (!locality) notFound();

  const initial: LocalityFormValues = {
    name: locality.name,
    city: locality.city,
    latitude: locality.latitude,
    longitude: locality.longitude,
    approxCoords: locality.approxCoords,
    teleduceAreaOfInterestValue: locality.teleduceAreaOfInterestValue,
  };

  const updateAction = updateLocalityAction.bind(null, localityId);
  const deleteAction = deleteLocalityAction.bind(null, localityId);

  const { properties, interestedLeads, assignedAgents } = locality._count;
  const inUse = properties + interestedLeads + assignedAgents;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }} className="space-y-5">
      <Link
        href="/settings/localities"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          color: "var(--ink-soft)",
        }}
      >
        ← Back to locations
      </Link>
      <div className="page-header">
        <div>
          <h1>Edit location</h1>
          <div className="subtitle">
            {locality.name}, {cityLabel[locality.city]}
          </div>
        </div>
      </div>

      <LocalityForm action={updateAction} locality={initial} isEdit submitLabel="Save changes" />

      <div className="card card-pad space-y-3" style={{ borderColor: "#efc4c4" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15 }}>Delete location</h3>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "2px 0 0" }}>
            {inUse > 0
              ? `Linked to ${properties} propert${properties === 1 ? "y" : "ies"} and ${interestedLeads} lead${interestedLeads === 1 ? "" : "s"} — reassign those before it can be deleted.`
              : "This location isn't linked to any properties or leads and can be safely removed."}
          </p>
        </div>
        <DeleteLocalityButton action={deleteAction} />
      </div>
    </div>
  );
}
