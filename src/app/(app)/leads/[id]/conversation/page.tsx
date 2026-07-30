import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Lock } from "lucide-react";
import { requireUser } from "@/lib/auth-helpers";
import { getLeadById } from "@/lib/queries/leads";
import { getMatchesForLead } from "@/lib/matching-service";
import {
  getActiveConversationForLead,
  getConversationDetail,
  logSearchSnapshot,
} from "@/lib/whatsapp/conversations";
import { whatsappConfigured } from "@/lib/env";
import {
  ConversationPanel,
  StartConversationButton,
  SharePropertyButton,
  type ChatMessage,
} from "@/components/whatsapp/ConversationUI";
import {
  cityLabel,
  formatBudgetRange,
  formatPrice,
  propertyTypeLabel,
  transactionTypeLabel,
} from "@/lib/domain";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const lead = await getLeadById(user, id);
  if (!lead) notFound();
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead";

  const active = await getActiveConversationForLead(id);
  const lockedByOther = !!active && active.agentId !== user.id && user.role !== "ADMIN";

  const Header = (
    <div className="page-header">
      <div>
        <div style={{ fontSize: 11, color: "var(--ink-fade)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
          <Link href={`/leads/${id}`}>← Back to lead</Link>
        </div>
        <h1 style={{ marginTop: 6 }}>Conversation · {name}</h1>
        <div className="subtitle">{lead.mobile ?? "No phone on file"} · {cityLabel[lead.city]}</div>
      </div>
    </div>
  );

  // ── Locked by another agent (agents only — admins can view) ──
  if (lockedByOther) {
    return (
      <div>
        {Header}
        <div className="card card-pad" style={{ textAlign: "center", maxWidth: 520, margin: "20px auto" }}>
          <Lock className="h-6 w-6" style={{ margin: "0 auto 10px", color: "var(--ink-fade)" }} />
          <h3 style={{ margin: "0 0 6px" }}>This client is in an active conversation</h3>
          <p style={{ color: "var(--ink-soft)", fontSize: 13, margin: 0 }}>
            Handled by <b>{active!.agentName}</b> ({active!.agentEmail}). Only one agent can converse with a
            client at a time. You&apos;ll be able to start once they end the conversation.
          </p>
        </div>
      </div>
    );
  }

  // ── No active conversation → start screen ──
  if (!active) {
    return (
      <div>
        {Header}
        <div className="card card-pad" style={{ textAlign: "center", maxWidth: 520, margin: "20px auto" }}>
          <h3 style={{ margin: "0 0 6px" }}>Start a WhatsApp conversation</h3>
          <p style={{ color: "var(--ink-soft)", fontSize: 13, margin: "0 0 14px" }}>
            You&apos;ll handle this client exclusively until you end the conversation. Everything you say and
            share is logged for admin oversight.
          </p>
          {lead.mobile ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <StartConversationButton leadId={id} />
            </div>
          ) : (
            <p style={{ color: "var(--bad)", fontSize: 13 }}>This lead has no phone number to message.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Active conversation (owner or admin) → workspace ──
  const isOwner = active.agentId === user.id;
  const detail = await getConversationDetail(user, active.conversationId);
  const matches = await getMatchesForLead(user, id);
  const sharedIds = new Set((detail?.sharedProperties ?? []).map((s) => s.propertyId));

  // Capture what the agent is looking at, for admin reconstruction (throttled).
  // Deferred via after() so this write never blocks the render / TTFB.
  if (matches && matches.total > 0 && isOwner) {
    const resultPropertyIds = matches.bands.flatMap((b) => b.rows.map((r) => r.property.id));
    const criteria = {
      budget: { min: lead.budgetMin ? Number(lead.budgetMin) : null, max: lead.budgetMax ? Number(lead.budgetMax) : null },
      bhk: lead.bhkPref,
      propertyTypes: lead.propertyTypePref,
      transaction: lead.transactionTypePref,
      preferredLocalities: lead.preferredLocalities.map((l) => l.name),
    };
    after(() =>
      logSearchSnapshot({
        conversationId: active.conversationId,
        leadId: id,
        agentId: user.id,
        criteria,
        resultPropertyIds,
      }),
    );
  }

  const messages: ChatMessage[] = (detail?.messages ?? []).map((m) => ({
    id: m.id,
    direction: m.direction,
    type: m.type,
    body: m.body,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
  }));

  const topMatches = matches ? matches.bands.flatMap((b) => b.rows).slice(0, 12) : [];

  return (
    <div>
      {Header}
      {user.role === "ADMIN" && active.agentId !== user.id && (
        <div className="chat-notice" style={{ margin: "0 0 12px" }}>
          Admin view — this conversation is handled by <b>{active.agentName}</b>.
        </div>
      )}
      <div className="conv-grid">
        <ConversationPanel
          conversationId={active.conversationId}
          leadId={id}
          messages={messages}
          whatsappLive={whatsappConfigured}
          readOnly={!isOwner}
        />

        <div className="conv-matches card">
          <div className="chat-head">
            <span style={{ fontWeight: 600, fontSize: 14 }}>Share properties</span>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              {formatBudgetRange(
                lead.budgetMin ? Number(lead.budgetMin) : null,
                lead.budgetMax ? Number(lead.budgetMax) : null,
                lead.transactionTypePref,
              )}
            </span>
          </div>
          <div className="conv-matches-body">
            {topMatches.length === 0 ? (
              <p style={{ color: "var(--ink-fade)", fontSize: 13, textAlign: "center", margin: "20px 0" }}>
                No matching properties for this lead&apos;s requirement.
              </p>
            ) : (
              topMatches.map((row) => {
                const p = row.property;
                return (
                  <div key={p.id} className="conv-match-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="file-no" style={{ fontSize: 11, color: "var(--ink-fade)", fontWeight: 600 }}>{p.fileNo}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {propertyTypeLabel[p.propertyType]}{p.bhk ? ` · ${p.bhk} BHK` : ""} · {p.locality.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--brand-dark)", fontWeight: 600 }}>
                        {formatPrice(Number(p.priceInr), p.transactionType)} · {transactionTypeLabel[p.transactionType]}
                      </div>
                    </div>
                    {sharedIds.has(p.id) ? (
                      <span className="btn btn-sm" style={{ opacity: 0.6, pointerEvents: "none" }}>Shared ✓</span>
                    ) : isOwner ? (
                      <SharePropertyButton conversationId={active.conversationId} leadId={id} propertyId={p.id} />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
