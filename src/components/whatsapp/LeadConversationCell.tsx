"use client";

import { useRouter } from "next/navigation";
import { Lock, MessageCircle } from "lucide-react";

export interface ActiveConvCell {
  agentId: string;
  agentName: string;
  agentEmail: string;
}

// Leads-table cell. When the client is in an active conversation owned by ANOTHER
// agent, an agent sees a read-only lock ("handled by …") and CANNOT start a new
// one — it is UI-impossible. The owning agent (or an admin) gets an "Open chat"
// button; otherwise "Message" starts a fresh conversation.
export function LeadConversationCell({
  leadId,
  active,
  currentUserId,
  isAdmin,
}: {
  leadId: string;
  active: ActiveConvCell | null;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const lockedByOther = !!active && active.agentId !== currentUserId;

  if (lockedByOther && !isAdmin) {
    return (
      <span
        title={`Handled by ${active!.agentName} · ${active!.agentEmail}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          color: "var(--ink-fade)",
          whiteSpace: "nowrap",
        }}
      >
        <Lock className="h-3 w-3" /> {active!.agentName}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={(e) => {
        e.stopPropagation();
        router.push(`/leads/${leadId}/conversation`);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      title={active ? "Open the active conversation" : "Start a WhatsApp conversation"}
      aria-label={active ? "Open the active conversation" : "Start a WhatsApp conversation"}
      // Highlight when a conversation is already active so it stands out at a glance.
      style={active ? { color: "var(--brand)", borderColor: "var(--brand)" } : undefined}
    >
      <MessageCircle className="h-4 w-4" />
    </button>
  );
}
