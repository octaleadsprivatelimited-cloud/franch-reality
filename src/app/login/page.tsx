"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { loginAction, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );

  return (
    <div className="login-screen">
      <div className="login-box">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/franch-logo.png" alt="Franch Realty" className="login-logo" />
        <h1 className="sr-only">Franch Realty</h1>
        <p className="subtitle">Inventory &amp; client-matching platform</p>

        <form action={formAction}>
          <PullCallback />

          <div className="form-field" style={{ marginBottom: 14 }}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="you@example.com"
            />
          </div>

          <div className="form-field" style={{ marginBottom: 14 }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </div>

          {state.error && (
            <p className="alert-error" style={{ marginBottom: 14 }}>
              {state.error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: 11 }}
            disabled={pending}
          >
            <LogIn className="h-4 w-4" />
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="login-footnote">Internal use only · © Franch Realty</p>
      </div>
    </div>
  );
}

// Reads callbackUrl from the URL and forwards it as a hidden field.
function PullCallback() {
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const cb = params?.get("callbackUrl") ?? "/";
  return <input type="hidden" name="callbackUrl" value={cb} />;
}
