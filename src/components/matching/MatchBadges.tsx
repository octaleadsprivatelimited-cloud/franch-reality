import type { LucideIcon } from "lucide-react";
import {
  Star,
  Send,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  CloudOff,
  AlertTriangle,
} from "lucide-react";
import type { MatchStatus, WritebackStatus } from "@prisma/client";
import { matchStatusLabel } from "@/lib/domain";

// Status tints sourced from the ported terracotta design-system CSS vars
// (globals.css) so these match the rest of the warm palette.
const statusStyle: Record<MatchStatus, React.CSSProperties> = {
  SHORTLISTED: { background: "var(--warn-tint)", color: "var(--warn)" },
  SHARED: { background: "var(--info-tint)", color: "var(--info)" },
  CLOSED_WON: { background: "var(--good-tint)", color: "var(--good)" },
  CLOSED_LOST: { background: "var(--bad-tint)", color: "var(--bad)" },
  CLOSED_NEUTRAL: { background: "var(--bg-soft)", color: "var(--ink-soft)" },
};

const statusIcon: Record<MatchStatus, LucideIcon> = {
  SHORTLISTED: Star,
  SHARED: Send,
  CLOSED_WON: CheckCircle2,
  CLOSED_LOST: XCircle,
  CLOSED_NEUTRAL: MinusCircle,
};

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const Icon = statusIcon[status];
  return (
    <span className="badge" style={statusStyle[status]}>
      <Icon className="h-3 w-3" />
      {matchStatusLabel[status]}
    </span>
  );
}

const wbStyle: Record<WritebackStatus, React.CSSProperties> = {
  NOT_REQUIRED: { background: "var(--bg-soft)", color: "var(--ink-fade)" },
  PENDING: { background: "var(--warn-tint)", color: "var(--warn)" },
  SUCCESS: { background: "var(--good-tint)", color: "var(--good)" },
  FAILED: { background: "var(--bad-tint)", color: "var(--bad)" },
};

const wbLabel: Record<WritebackStatus, string> = {
  NOT_REQUIRED: "Internal only",
  PENDING: "Teleduce: queued",
  SUCCESS: "Teleduce: synced",
  FAILED: "Teleduce: failed",
};

const wbIcon: Record<WritebackStatus, LucideIcon> = {
  NOT_REQUIRED: CloudOff,
  PENDING: Clock,
  SUCCESS: CheckCircle2,
  FAILED: AlertTriangle,
};

export function WritebackBadge({ status }: { status: WritebackStatus }) {
  const Icon = wbIcon[status];
  return (
    <span className="badge" style={wbStyle[status]} title={wbLabel[status]}>
      <Icon className="h-3 w-3" />
      {wbLabel[status]}
    </span>
  );
}
