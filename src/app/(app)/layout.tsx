import { formatDistanceToNow } from "date-fns";
import { requireUser } from "@/lib/auth-helpers";
import { AppShell } from "@/components/shell/AppShell";
import { prisma } from "@/lib/prisma";
import { getTeleduceSyncStatus } from "@/lib/queries/sync-status";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [unreadNotifications, sync] = await Promise.all([
    user.role === "ADMIN"
      ? prisma.notification.count({ where: { isRead: false } })
      : Promise.resolve(0),
    getTeleduceSyncStatus(),
  ]);

  return (
    <AppShell
      user={{
        name: user.name ?? user.email ?? "User",
        email: user.email ?? "",
        role: user.role,
        cities: user.cities,
      }}
      syncStatus={{
        mode: sync.mode,
        // Preformatted server-side so the client pill renders a static string (no
        // time-based client render → no hydration mismatch).
        lastWebhookAgo: sync.lastWebhookAt
          ? formatDistanceToNow(sync.lastWebhookAt, { addSuffix: true })
          : null,
      }}
      unreadNotifications={unreadNotifications}
    >
      {children}
    </AppShell>
  );
}
