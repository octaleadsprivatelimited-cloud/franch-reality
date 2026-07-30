import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

// Next.js 16 renamed `middleware` to `proxy`. We export the Auth.js handler as `proxy`.
// The `authorized` callback in auth.config performs the login/redirect gating.
// NOTE (Next 16): a matcher that excludes a path also skips Server Functions on it,
// so every server action and route handler ALSO enforces auth server-side.
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    // Run on everything except API routes, Next internals, and static files.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.).*)",
  ],
};
