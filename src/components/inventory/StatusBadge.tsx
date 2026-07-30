import type { AvailabilityStatus } from "@prisma/client";
import { availabilityLabel } from "@/lib/domain";

const styles: Record<AvailabilityStatus, { bg: string; fg: string }> = {
  AVAILABLE: { bg: "var(--good-tint)", fg: "var(--good)" },
  BOOKED: { bg: "var(--warn-tint)", fg: "var(--warn)" },
  SOLD: { bg: "var(--bg-soft)", fg: "var(--ink-soft)" },
  RENTED: { bg: "var(--info-tint)", fg: "var(--info)" },
};

export function StatusBadge({ status }: { status: AvailabilityStatus }) {
  const s = styles[status];
  return (
    <span className="badge" style={{ background: s.bg, color: s.fg }}>
      {availabilityLabel[status]}
    </span>
  );
}
