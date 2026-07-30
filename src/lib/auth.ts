import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { City, Role } from "@prisma/client";
import { prisma } from "./prisma";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// A valid bcrypt hash used ONLY to equalize timing for unknown/inactive accounts,
// so login response time can't be used to enumerate which emails are real.
const DUMMY_HASH = bcrypt.hashSync("franch-realty-timing-equalizer", 12);

// Brute-force / credential-stuffing lockout (DB-backed so it holds across replicas).
const LOCK_WINDOW_MS = 15 * 60_000; // 15 minutes
const MAX_EMAIL_FAILS = 8; // per account
const MAX_IP_FAILS = 30; // per source IP (broad stuffing)

function clientIp(request?: Request): string | null {
  if (!request) return null;
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

async function recordAttempt(email: string, ipAddress: string | null, success: boolean): Promise<void> {
  try {
    await prisma.loginAttempt.create({ data: { email, ipAddress, success } });
  } catch {
    /* never block sign-in on a logging failure */
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const { password } = parsed.data;
        const ip = clientIp(request as Request | undefined);

        // Lockout: too many recent failures for this account OR this source IP.
        const since = new Date(Date.now() - LOCK_WINDOW_MS);
        const [emailFails, ipFails] = await Promise.all([
          prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
          ip
            ? prisma.loginAttempt.count({ where: { ipAddress: ip, success: false, createdAt: { gte: since } } })
            : Promise.resolve(0),
        ]);
        if (emailFails >= MAX_EMAIL_FAILS || ipFails >= MAX_IP_FAILS) {
          await recordAttempt(email, ip, false); // keep the window sliding while abuse continues
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        // Always run a bcrypt compare (dummy hash for missing/inactive users) so
        // timing doesn't reveal whether an email maps to a real account.
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        const success = !!user && user.isActive && ok;
        await recordAttempt(email, ip, success);
        if (!success || !user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role,
          cities: user.cities,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: Role }).role;
        token.cities = (user as { cities: City[] }).cities;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.cities = token.cities as City[];
      }
      return session;
    },
  },
});
