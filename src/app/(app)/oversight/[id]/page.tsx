import Link from "next/link";
import { notFound } from "next/navigation";
import { Search, Share2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth-helpers";
import { getConversationDetail } from "@/lib/whatsapp/conversations";
import { cityLabel } from "@/lib/domain";

function fmt(d: Date): string {
  return new Date(d).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function OversightDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = await requireAdmin();
  const c = await getConversationDetail(admin, id);
  if (!c) notFound();

  const client = [c.lead.firstName, c.lead.lastName].filter(Boolean).join(" ") || "Unnamed lead";

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-fade)", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
            <Link href="/oversight">← Back to oversight</Link>
          </div>
          <h1 style={{ marginTop: 6 }}>{client}</h1>
          <div className="subtitle">
            {c.customerPhone} · {cityLabel[c.lead.city]} · handled by <b>{c.agent.fullName}</b> ({c.agent.email}) ·{" "}
            <span className={`pill ${c.status === "ACTIVE" ? "live" : "mock"}`}>
              {c.status === "ACTIVE" ? "Active" : "Ended"}
            </span>
          </div>
        </div>
      </div>

      <div className="conv-grid">
        {/* Left: the full message thread (read-only) */}
        <div className="chat-panel card">
          <div className="chat-head">
            <span style={{ fontWeight: 600, fontSize: 14 }}>Conversation transcript</span>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{c.messages.length} messages</span>
          </div>
          <div className="chat-thread">
            {c.messages.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--ink-fade)", fontSize: 12.5, margin: "20px 0" }}>
                No messages exchanged.
              </p>
            ) : (
              c.messages.map((m) => (
                <div key={m.id} className={`chat-bubble ${m.direction === "OUTBOUND" ? "out" : "in"}`}>
                  <div className="chat-body">{m.body ?? `[${m.type.toLowerCase()}]`}</div>
                  <div className="chat-meta">
                    {m.direction === "OUTBOUND" ? "Agent" : "Client"} · {fmt(m.createdAt)}
                    {m.direction === "OUTBOUND" && ` · ${m.status.toLowerCase()}`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: what the agent searched, and what they shared */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card card-pad">
            <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Search className="h-4 w-4" style={{ color: "var(--brand)" }} /> Searches ({c.searchActivities.length})
            </div>
            {c.searchActivities.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--ink-fade)", margin: 0 }}>No searches recorded.</p>
            ) : (
              c.searchActivities.map((s) => {
                const crit = s.criteriaJson as Record<string, unknown> | null;
                const localities = Array.isArray(crit?.preferredLocalities)
                  ? (crit!.preferredLocalities as string[]).join(", ")
                  : "—";
                return (
                  <div key={s.id} className="list-item" style={{ display: "block" }}>
                    <div style={{ fontSize: 12.5 }}>
                      <b>Areas:</b> {localities || "Whole city"}
                    </div>
                    <div className="meta" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                      {s.resultPropertyIds.length} results · {fmt(s.createdAt)}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="card card-pad">
            <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Share2 className="h-4 w-4" style={{ color: "var(--brand)" }} /> Shared with client ({c.sharedProperties.length})
            </div>
            {c.sharedProperties.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--ink-fade)", margin: 0 }}>Nothing shared yet.</p>
            ) : (
              c.sharedProperties.map((sp) => {
                const snap = sp.snapshotJson as Record<string, unknown>;
                return (
                  <div key={sp.id} className="list-item" style={{ display: "block" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {String(snap.fileNo ?? sp.property.fileNo)} · {sp.property.locality.name}
                    </div>
                    <div className="meta" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                      {fmt(sp.sharedAt)}
                      {sp.includedPdf ? " · PDF" : ""}
                      {sp.includedText ? " · summary" : ""}
                    </div>
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
