"use client";

import { useActionState } from "react";
import type { City } from "@prisma/client";
import type { FormState } from "@/app/(app)/settings/localities/actions";
import { CITIES, cityLabel } from "@/lib/domain";

export interface LocalityFormValues {
  name: string;
  city: City;
  latitude: number;
  longitude: number;
  approxCoords: boolean;
  teleduceAreaOfInterestValue: string | null;
}

export function LocalityForm({
  action,
  locality,
  isEdit = false,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Existing locality when editing. Omitted in create mode. */
  locality?: LocalityFormValues;
  isEdit?: boolean;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const err = (f: string) => state.fieldErrors?.[f];
  const label = submitLabel ?? (isEdit ? "Save changes" : "Add location");

  // Pre-fill coordinates only when they're EXACT. For an approximate location the
  // stored lat/long are just the city centroid, so we leave the inputs blank — that
  // way saving without touching them keeps it approximate, and typing real values
  // promotes it to exact.
  const latValue = locality && !locality.approxCoords ? String(locality.latitude) : "";
  const lngValue = locality && !locality.approxCoords ? String(locality.longitude) : "";

  return (
    <form action={formAction} className="card card-pad">
      {state.error && (
        <div className="alert-error" style={{ marginBottom: 20 }}>
          {state.error}
        </div>
      )}

      <div className="form-section">
        <div className="form-section-title">Location</div>
        <div className="form-grid">
          <div className="form-field">
            <label>
              Name<span className="req"> *</span>
            </label>
            <input name="name" defaultValue={locality?.name ?? ""} placeholder="e.g. Kokapet" required />
            {err("name") && <div className="field-error">{err("name")}</div>}
          </div>

          <div className="form-field">
            <label>
              City<span className="req"> *</span>
            </label>
            <select name="city" defaultValue={locality?.city ?? "HYDERABAD"}>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {cityLabel[c]}
                </option>
              ))}
            </select>
            {err("city") && <div className="field-error">{err("city")}</div>}
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Map coordinates (optional)</div>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 10px" }}>
          Used for radius-based lead ⇄ property matching. Leave both blank to use the city
          centre — the location is then marked “approximate”. Tip: right-click the spot in
          Google Maps and click the latitude/longitude to copy them.
        </p>
        {isEdit && locality?.approxCoords && (
          <p style={{ fontSize: 12, color: "var(--warn)", margin: "0 0 10px" }}>
            Currently using approximate city-centre coordinates — enter exact values to
            improve matching accuracy.
          </p>
        )}
        <div className="form-grid">
          <div className="form-field">
            <label>Latitude</label>
            <input
              name="latitude"
              type="text"
              inputMode="decimal"
              defaultValue={latValue}
              placeholder="e.g. 17.4106"
            />
            {err("latitude") && <div className="field-error">{err("latitude")}</div>}
          </div>
          <div className="form-field">
            <label>Longitude</label>
            <input
              name="longitude"
              type="text"
              inputMode="decimal"
              defaultValue={lngValue}
              placeholder="e.g. 78.3336"
            />
            {err("longitude") && <div className="field-error">{err("longitude")}</div>}
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Teleduce mapping (optional)</div>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 10px" }}>
          Only set this if the location matches an “Area of Interest” value in Corefactors
          Teleduce — it links synced leads to this location. Leave blank otherwise.
        </p>
        <div className="form-field">
          <label>Teleduce “Area of Interest” value</label>
          <input
            name="teleduceAreaOfInterestValue"
            defaultValue={locality?.teleduceAreaOfInterestValue ?? ""}
            placeholder="Exact Teleduce label"
          />
          {err("teleduceAreaOfInterestValue") && (
            <div className="field-error">{err("teleduceAreaOfInterestValue")}</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : label}
        </button>
      </div>
    </form>
  );
}

/** Delete button + inline error. Action is pre-bound to the locality id; it
 *  redirects to the list on success and returns an error string when blocked. */
export function DeleteLocalityButton({
  action,
}: {
  action: () => Promise<{ error?: string } | void>;
}) {
  const [state, formAction, pending] = useActionState<{ error?: string }, FormData>(
    async () => (await action()) ?? {},
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error && <div className="alert-error">{state.error}</div>}
      <button type="submit" className="btn-danger" disabled={pending}>
        {pending ? "Deleting…" : "Delete location"}
      </button>
    </form>
  );
}
