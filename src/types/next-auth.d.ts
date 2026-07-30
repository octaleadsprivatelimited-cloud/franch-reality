import type { City, Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      cities: City[];
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    cities: City[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    cities: City[];
  }
}
