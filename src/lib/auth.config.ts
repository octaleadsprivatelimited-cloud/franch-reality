import type { NextAuthConfig } from "next-auth";

// Edge/proxy-safe portion of the auth config: no Prisma, no bcrypt, no providers
// that pull in Node-only deps. Used by both the full server config and proxy.ts.
//
// Routes that do NOT require authentication:
const PUBLIC_PREFIXES = ["/login"];

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // 8-hour sessions (defense-in-depth; deactivation/role changes already take
  // effect immediately via the per-request DB re-validation in auth-helpers).
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      const isPublic = PUBLIC_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(p + "/"),
      );

      // Logged-in users hitting /login go to the dashboard.
      if (isLoggedIn && isPublic) {
        return Response.redirect(new URL("/", nextUrl));
      }

      // Unauthenticated users on a protected route are redirected to /login
      // (returning false triggers a redirect to the signIn page).
      if (!isLoggedIn && !isPublic) {
        const url = new URL("/login", nextUrl);
        if (pathname !== "/") url.searchParams.set("callbackUrl", pathname);
        return Response.redirect(url);
      }

      return true;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
