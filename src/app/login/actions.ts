"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

// Lightweight in-process login throttle. Best-effort (per server instance) — for a
// 10-user internal tool that is sufficient; a multi-instance deploy should back
// this with Redis/DB. Locks an email after too many recent failures.
const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60_000;
const attempts = new Map<string, { count: number; first: number }>();

function lockedFor(key: string): number {
  const rec = attempts.get(key);
  if (!rec) return 0;
  if (Date.now() - rec.first > WINDOW_MS) {
    attempts.delete(key);
    return 0;
  }
  if (rec.count >= MAX_FAILURES) {
    return Math.ceil((WINDOW_MS - (Date.now() - rec.first)) / 60_000);
  }
  return 0;
}

function recordFailure(key: string) {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/") || "/";

  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }

  const key = email.toLowerCase();
  const lockMins = lockedFor(key);
  if (lockMins > 0) {
    return { error: `Too many failed attempts. Try again in about ${lockMins} minute(s).` };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: callbackUrl });
  } catch (error) {
    // signIn throws a NEXT_REDIRECT on success — that must propagate.
    if (error instanceof AuthError) {
      recordFailure(key);
      return { error: "Invalid email or password." };
    }
    throw error;
  }
  attempts.delete(key); // (only reached if signIn didn't redirect)
  return {};
}
