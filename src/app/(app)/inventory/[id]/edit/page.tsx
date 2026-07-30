import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { getPropertyById, getLocalitiesForUser } from "@/lib/queries/inventory";
import { fromInr } from "@/lib/domain";
import { PropertyForm, type PropertyFormValues } from "@/components/inventory/PropertyForm";
import { updatePropertyAction } from "../../actions";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const [p, localities] = await Promise.all([
    getPropertyById(user, id),
    getLocalitiesForUser(user),
  ]);
  if (!p) notFound();

  const initial: PropertyFormValues = {
    fileNo: p.fileNo,
    reraId: p.reraId,
    city: p.city,
    localityId: p.localityId,
    transactionType: p.transactionType,
    propertyType: p.propertyType,
    commercialOrResidential: p.commercialOrResidential,
    buildingClassification: p.buildingClassification,
    bhk: p.bhk,
    builtUpAreaSqft: p.builtUpAreaSqft,
    secondaryAreaSqft: p.secondaryAreaSqft,
    facing: p.facing,
    floor: p.floor,
    parkingCount: p.parkingCount,
    priceAmount: fromInr(Number(p.priceInr), p.priceUnit),
    priceUnit: p.priceUnit,
    maintenanceAmount: p.maintenanceAmount ? Number(p.maintenanceAmount) : null,
    ageYears: p.ageYears,
    furnishing: p.furnishing,
    featuresText: p.featuresText,
    additionalFeatures: p.additionalFeatures,
    availabilityStatus: p.availabilityStatus,
    builderDeveloperName: p.builderDeveloperName,
    description: p.description,
  };

  const action = updatePropertyAction.bind(null, id);

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-fade)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
            <Link href={`/inventory/${id}`}>← Back to property</Link>
          </div>
          <h1 style={{ marginTop: 6 }}>Edit property</h1>
        </div>
      </div>
      <PropertyForm action={action} localities={localities} initial={initial} submitLabel="Save changes" />
    </div>
  );
}
