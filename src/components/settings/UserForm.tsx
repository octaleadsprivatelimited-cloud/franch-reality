"use client";

import { useActionState, useState } from "react";
import type { City, Role } from "@prisma/client";
import type { FormState } from "@/app/(app)/settings/actions";
import { CITIES, cityLabel } from "@/lib/domain";

interface AreaOption {
  id: number;
  name: string;
  city: City;
}

export interface UserFormValues {
  email: string;
  fullName: string;
  role: Role;
  cities: City[];
  isActive: boolean;
  /** Locality ids the agent is bound to (empty = whole city). */
  areaIds: number[];
}

export function UserForm({
  action,
  user,
  localities = [],
  isEdit = false,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Existing user when editing. Omitted in create mode. */
  user?: UserFormValues;
  /** Localities the admin can assign as operating areas. */
  localities?: AreaOption[];
  isEdit?: boolean;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [role, setRole] = useState<Role>(user?.role ?? "AGENT");
  const [areaQuery, setAreaQuery] = useState("");

  const err = (f: string) => state.fieldErrors?.[f];
  const label = submitLabel ?? (isEdit ? "Save changes" : "Create user");

  return (
    <form action={formAction} className="card card-pad">
      {state.error && (
        <div className="alert-error" style={{ marginBottom: 20 }}>
          {state.error}
        </div>
      )}

      <div className="form-section">
        <div className="form-section-title">Account</div>
        <div className="form-grid">
          <div className="form-field">
            <label>
              Email{!isEdit && <span className="req"> *</span>}
            </label>
            {isEdit ? (
              // Email is immutable after creation — shown disabled for reference.
              <input
                defaultValue={user?.email ?? ""}
                disabled
                style={{ background: "var(--bg-soft)", color: "var(--ink-fade)" }}
              />
            ) : (
              <input
                name="email"
                type="email"
                placeholder="name@example.com"
                autoComplete="off"
                required
              />
            )}
            {err("email") && <div className="field-error">{err("email")}</div>}
          </div>

          <div className="form-field">
            <label>
              Full name<span className="req"> *</span>
            </label>
            <input
              name="fullName"
              defaultValue={user?.fullName ?? ""}
              placeholder="Priya Sharma"
              required
            />
            {err("fullName") && <div className="field-error">{err("fullName")}</div>}
          </div>

          <div className="form-field">
            <label>
              Role<span className="req"> *</span>
            </label>
            <select
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="ADMIN">Admin</option>
              <option value="AGENT">Agent</option>
            </select>
            {err("role") && <div className="field-error">{err("role")}</div>}
          </div>

          {!isEdit && (
            <div className="form-field">
              <label>
                Temporary password<span className="req"> *</span>
              </label>
              <input
                name="password"
                type="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                required
              />
              {err("password") && (
                <div className="field-error">{err("password")}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">City access</div>
        <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 10px" }}>
          Admins typically cover both cities. Agents need at least one.
        </p>
        <div className="filter-group" style={{ marginBottom: 0 }}>
          {CITIES.map((c) => (
            <label key={c}>
              <input
                type="checkbox"
                name="cities"
                value={c}
                defaultChecked={user?.cities.includes(c) ?? false}
              />
              {cityLabel[c]}
            </label>
          ))}
        </div>
        {err("cities") && (
          <div className="field-error" style={{ marginTop: 4 }}>
            {err("cities")}
          </div>
        )}
      </div>

      {localities.length > 0 && (
        <div className="form-section">
          <div className="form-section-title">Operating areas (optional)</div>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0 0 10px" }}>
            Restrict an agent to specific areas within their city. Leave empty to cover the whole city.
          </p>
          <input
            type="search"
            value={areaQuery}
            onChange={(e) => setAreaQuery(e.target.value)}
            placeholder="Filter areas…"
            aria-label="Filter operating areas"
            style={{ marginBottom: 10 }}
          />
          <div className="area-picker" role="group" aria-label="Operating areas">
            {CITIES.map((c) => {
              const q = areaQuery.trim().toLowerCase();
              const locs = localities.filter((l) => l.city === c);
              if (locs.length === 0) return null;
              // Filter by CSS only (never unmount) so a checked-but-hidden area is
              // still submitted with the form.
              const anyVisible = !q || locs.some((l) => l.name.toLowerCase().includes(q));
              return (
                <div key={c} style={{ marginBottom: 10, display: anyVisible ? undefined : "none" }}>
                  <div className="area-picker-city">{cityLabel[c]}</div>
                  <div className="filter-group" style={{ marginBottom: 0 }}>
                    {locs.map((l) => {
                      const shown = !q || l.name.toLowerCase().includes(q);
                      return (
                        <label key={l.id} style={{ display: shown ? undefined : "none" }}>
                          <input
                            type="checkbox"
                            name="areas"
                            value={l.id}
                            defaultChecked={user?.areaIds?.includes(l.id) ?? false}
                          />
                          {l.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isEdit && (
        <div className="form-section">
          <div className="form-section-title">Status</div>
          <div className="filter-group" style={{ marginBottom: 0 }}>
            <label>
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={user?.isActive ?? true}
              />
              Active (can sign in)
            </label>
          </div>
          {err("isActive") && (
            <div className="field-error" style={{ marginTop: 4 }}>
              {err("isActive")}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : label}
        </button>
      </div>
    </form>
  );
}

/** Standalone reset-password form (action is pre-bound to the user id). */
export function ResetPasswordForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.ok && (
        <div
          className="empty-banner"
          style={{ background: "var(--good-tint)", borderColor: "#b8ddc2", color: "var(--good)" }}
        >
          Password updated.
        </div>
      )}
      {state.error && <div className="alert-error">{state.error}</div>}
      <div className="form-field">
        <label>
          New password<span className="req"> *</span>
        </label>
        <input
          name="password"
          type="password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
        />
        {state.fieldErrors?.password && (
          <div className="field-error">{state.fieldErrors.password}</div>
        )}
      </div>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Updating…" : "Reset password"}
      </button>
    </form>
  );
}

/** Deactivate button + inline error. Action is pre-bound to the user id. */
export function DeactivateButton({
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
        {pending ? "Deactivating…" : "Deactivate user"}
      </button>
    </form>
  );
}
