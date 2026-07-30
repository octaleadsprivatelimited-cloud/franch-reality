"use client";

import { useActionState, useState } from "react";
import { Save } from "lucide-react";
import type { City } from "@prisma/client";
import type { FormState } from "@/app/(app)/inventory/actions";
import {
  CITIES,
  PROPERTY_TYPES,
  BUILDING_CLASSIFICATIONS,
  TRANSACTION_TYPES,
  AVAILABILITY_STATUSES,
  FURNISHINGS,
  BHK_OPTIONS,
  cityLabel,
  propertyTypeLabel,
  buildingClassificationLabel,
  transactionTypeLabel,
  availabilityLabel,
  furnishingLabel,
} from "@/lib/domain";

interface LocalityOption {
  id: number;
  name: string;
  city: City;
}

type TransactionType = "SALE" | "RENT";
type PriceUnit = "LAKH" | "CRORE" | "PER_MONTH";

export type PropertyFormValues = Partial<{
  fileNo: string;
  reraId: string | null;
  city: City;
  localityId: number;
  transactionType: TransactionType;
  propertyType: "APARTMENT" | "VILLA" | "PLOT" | "COMMERCIAL";
  commercialOrResidential: "RESIDENTIAL" | "COMMERCIAL";
  buildingClassification: "GATED_COMMUNITY" | "STAND_ALONE" | "COMMERCIAL" | null;
  bhk: number | null;
  builtUpAreaSqft: number | null;
  secondaryAreaSqft: number | null;
  facing: string | null;
  floor: string | null;
  parkingCount: number | null;
  priceAmount: number;
  priceUnit: PriceUnit;
  maintenanceAmount: number | null;
  ageYears: number | null;
  furnishing: "UNFURNISHED" | "SEMI_FURNISHED" | "FURNISHED" | null;
  featuresText: string | null;
  additionalFeatures: string[];
  availabilityStatus: "AVAILABLE" | "BOOKED" | "SOLD" | "RENTED";
  builderDeveloperName: string | null;
  description: string | null;
}>;

export function PropertyForm({
  action,
  localities,
  initial = {},
  submitLabel = "Save property",
  enableMediaUpload = false,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  localities: LocalityOption[];
  initial?: PropertyFormValues;
  submitLabel?: string;
  /** Show a photos/brochures file input (create flow — handled by createPropertyAction). */
  enableMediaUpload?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  // Guard the multi-file "media" input against exceeding the Server Action body
  // limit (25 MB). bodySizeLimit is a TOTAL request cap, so several files each
  // within their per-file limit can still overflow it and fail opaquely — catch
  // that here with a clear message instead.
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [city, setCity] = useState<City>(initial.city ?? "HYDERABAD");
  const [transaction, setTransaction] = useState<TransactionType>(
    initial.transactionType ?? "SALE",
  );
  // Price unit is derived from the transaction type so it can never disagree
  // (RENT ⇒ ₹/month; SALE ⇒ Lakh/Crore). Server validation enforces this too.
  const [unit, setUnit] = useState<PriceUnit>(
    initial.priceUnit ?? (initial.transactionType === "RENT" ? "PER_MONTH" : "LAKH"),
  );

  function onTransactionChange(v: TransactionType) {
    setTransaction(v);
    setUnit(v === "RENT" ? "PER_MONTH" : unit === "PER_MONTH" ? "LAKH" : unit);
  }

  const err = (f: string) => state.fieldErrors?.[f];
  const cityLocalities = localities.filter((l) => l.city === city);

  return (
    <form action={formAction}>
      {state.error && <p className="alert-error" style={{ marginBottom: 16 }}>{state.error}</p>}

      <div className="card card-pad">
        <Section title="Identification & location">
          <Field label="File number" required error={err("fileNo")}>
            <input name="fileNo" defaultValue={initial.fileNo ?? ""} placeholder="FRHBAN001" required />
          </Field>
          <Field label="RERA certificate ID (optional)" error={err("reraId")}>
            <input name="reraId" defaultValue={initial.reraId ?? ""} placeholder="e.g. P02400001234" />
          </Field>
          <Field label="City" required error={err("city")}>
            <select name="city" value={city} onChange={(e) => setCity(e.target.value as City)}>
              {CITIES.map((c) => (
                <option key={c} value={c}>{cityLabel[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Locality" required error={err("localityId")}>
            <select name="localityId" defaultValue={initial.localityId ?? ""} required>
              <option value="">Select locality…</option>
              {cityLocalities.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Type & configuration">
          <Field label="Transaction" required error={err("transactionType")}>
            <select
              name="transactionType"
              value={transaction}
              onChange={(e) => onTransactionChange(e.target.value as TransactionType)}
            >
              {TRANSACTION_TYPES.map((t) => (
                <option key={t} value={t}>{transactionTypeLabel[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Property type" required error={err("propertyType")}>
            <select name="propertyType" defaultValue={initial.propertyType ?? "APARTMENT"}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>{propertyTypeLabel[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Usage" error={err("commercialOrResidential")}>
            <select name="commercialOrResidential" defaultValue={initial.commercialOrResidential ?? "RESIDENTIAL"}>
              <option value="RESIDENTIAL">Residential</option>
              <option value="COMMERCIAL">Commercial</option>
            </select>
          </Field>
          <Field label="Building classification" error={err("buildingClassification")}>
            <select name="buildingClassification" defaultValue={initial.buildingClassification ?? ""}>
              <option value="">—</option>
              {BUILDING_CLASSIFICATIONS.map((b) => (
                <option key={b} value={b}>{buildingClassificationLabel[b]}</option>
              ))}
            </select>
          </Field>
          <Field label="BHK (blank for plot/commercial)" error={err("bhk")}>
            <select name="bhk" defaultValue={initial.bhk ?? ""}>
              <option value="">—</option>
              {BHK_OPTIONS.map((b) => (
                <option key={b} value={b}>{b} BHK</option>
              ))}
            </select>
          </Field>
          <Field label="Built-up area (sq.ft)" error={err("builtUpAreaSqft")}>
            <input name="builtUpAreaSqft" type="number" defaultValue={initial.builtUpAreaSqft ?? ""} />
          </Field>
          <Field label="Secondary / carpet area (sq.ft)" error={err("secondaryAreaSqft")}>
            <input name="secondaryAreaSqft" type="number" defaultValue={initial.secondaryAreaSqft ?? ""} />
          </Field>
          <Field label="Facing" error={err("facing")}>
            <input name="facing" defaultValue={initial.facing ?? ""} placeholder="East" />
          </Field>
          <Field label="Floor" error={err("floor")}>
            <input name="floor" defaultValue={initial.floor ?? ""} placeholder="5" />
          </Field>
          <Field label="Parking count" error={err("parkingCount")}>
            <input name="parkingCount" type="number" defaultValue={initial.parkingCount ?? ""} />
          </Field>
          <Field label="Furnishing" error={err("furnishing")}>
            <select name="furnishing" defaultValue={initial.furnishing ?? ""}>
              <option value="">—</option>
              {FURNISHINGS.map((f) => (
                <option key={f} value={f}>{furnishingLabel[f]}</option>
              ))}
            </select>
          </Field>
          <Field label="Age (years)" error={err("ageYears")}>
            <input name="ageYears" type="number" defaultValue={initial.ageYears ?? ""} />
          </Field>
        </Section>

        <Section title="Pricing & status">
          <Field label={transaction === "RENT" ? "Monthly rent (₹)" : "Price amount"} required error={err("priceAmount")}>
            <input name="priceAmount" type="number" step="0.01" defaultValue={initial.priceAmount ?? ""} required />
          </Field>
          <Field label="Price unit" required error={err("priceUnit")}>
            <select name="priceUnit" value={unit} onChange={(e) => setUnit(e.target.value as PriceUnit)}>
              {transaction === "RENT" ? (
                <option value="PER_MONTH">₹ / month</option>
              ) : (
                <>
                  <option value="LAKH">₹ Lakh</option>
                  <option value="CRORE">₹ Crore</option>
                </>
              )}
            </select>
          </Field>
          <Field label="Maintenance (₹/mo)" error={err("maintenanceAmount")}>
            <input name="maintenanceAmount" type="number" defaultValue={initial.maintenanceAmount ?? ""} />
          </Field>
          <Field label="Availability" required error={err("availabilityStatus")}>
            <select name="availabilityStatus" defaultValue={initial.availabilityStatus ?? "AVAILABLE"}>
              {AVAILABILITY_STATUSES.map((s) => (
                <option key={s} value={s}>{availabilityLabel[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="Builder / developer" error={err("builderDeveloperName")}>
            <input name="builderDeveloperName" defaultValue={initial.builderDeveloperName ?? ""} />
          </Field>
        </Section>

        <Section title="Details" full>
          <Field label="Features (comma-separated)" error={err("additionalFeatures")} full>
            <input
              name="additionalFeatures"
              defaultValue={(initial.additionalFeatures ?? []).join(", ")}
              placeholder="Power backup, Lift, Clubhouse"
            />
          </Field>
          <Field label="Description" error={err("description")} full>
            <textarea name="description" defaultValue={initial.description ?? ""} rows={3} />
          </Field>
          {enableMediaUpload && (
            <Field label="Photos & brochures (optional)" full>
              <input
                name="media"
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  const total = files.reduce((n, f) => n + f.size, 0);
                  const LIMIT = 24 * 1024 * 1024; // keep under the 25 MB request-body cap
                  setMediaError(
                    total > LIMIT
                      ? `Selected files total ${(total / 1024 / 1024).toFixed(1)} MB — over the 24 MB per-upload limit. Add fewer now and upload the rest after saving.`
                      : null,
                  );
                }}
              />
              <p style={{ fontSize: 11, color: "var(--ink-fade)", marginTop: 4 }}>
                Add images (≤5 MB each) and PDF brochures (≤20 MB) now — or upload more after saving.
              </p>
              {mediaError && <p className="field-error" style={{ marginTop: 4 }}>{mediaError}</p>}
            </Field>
          )}
        </Section>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button type="submit" className="btn-primary" disabled={pending || !!mediaError}>
            <Save className="h-4 w-4" />
            {pending ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
  full,
}: {
  title: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className="form-section">
      <div className="form-section-title">{title}</div>
      <div className={`form-grid${full ? " full" : ""}`}>{children}</div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
  full,
  required,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  full?: boolean;
  required?: boolean;
}) {
  return (
    <div className="form-field" style={full ? { gridColumn: "1 / -1" } : undefined}>
      <label>
        {label} {required && <span className="req">*</span>}
      </label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
