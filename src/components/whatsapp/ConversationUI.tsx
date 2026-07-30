"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, MessageCircle, PhoneOff, Share2, Check, CheckCheck, Clock, AlertCircle } from "lucide-react";
import {
  sendMessageAction,
  endConversationAction,
  startConversationAction,
  sharePropertyAction,
} from "@/app/(app)/leads/[id]/conversation/actions";

export interface ChatMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: string;
  body: string | null;
  status: string;
  createdAt: string;
  sentByName?: string | null;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "READ") return <CheckCheck className="h-3 w-3" style={{ color: "var(--info)" }} />;
  if (status === "DELIVERED") return <CheckCheck className="h-3 w-3" />;
  if (status === "SENT") return <Check className="h-3 w-3" />;
  if (status === "FAILED") return <AlertCircle className="h-3 w-3" style={{ color: "var(--bad)" }} />;
  if (status === "QUEUED") return <Clock className="h-3 w-3" />;
  return null;
}

export function ConversationPanel({
  conversationId,
  leadId,
  messages,
  whatsappLive,
  readOnly = false,
}: {
  conversationId: string;
  leadId: string;
  messages: ChatMessage[];
  whatsappLive: boolean;
  /** Admin oversight view — show the thread but no compose / end controls. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>(messages);
  const endRef = useRef<HTMLDivElement>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { messages: ChatMessage[] };
        setMsgs(data.messages);
      }
    } catch {
      /* transient — the next poll retries */
    }
  }, [conversationId]);

  // Poll for inbound replies + delivery/read status while the chat is open (not in
  // the read-only admin view) so new messages appear without a manual refresh.
  useEffect(() => {
    if (readOnly) return;
    const interval = setInterval(refetch, 8000);
    return () => clearInterval(interval);
  }, [readOnly, refetch]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  function send() {
    const sent = text;
    const body = sent.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      const r = await sendMessageAction(conversationId, leadId, body);
      if (r.ok) {
        // Only clear if the agent didn't keep typing while the send was in flight.
        setText((cur) => (cur === sent ? "" : cur));
        refetch(); // show the sent message immediately (no full re-render / re-match)
      } else setError(r.error ?? "Failed to send.");
    });
  }

  function end() {
    setError(null);
    start(async () => {
      const r = await endConversationAction(conversationId, leadId);
      if (r.ok) router.refresh();
      else setError(r.error ?? "Failed to end.");
    });
  }

  return (
    <div className="chat-panel card">
      <div className="chat-head">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 14 }}>
          <MessageCircle className="h-4 w-4" style={{ color: "var(--brand)" }} /> Conversation
        </span>
        {!readOnly && (
          <button type="button" className="btn btn-sm" disabled={pending} onClick={end}>
            <PhoneOff className="h-3.5 w-3.5" /> End
          </button>
        )}
      </div>

      {!readOnly && !whatsappLive && (
        <div className="chat-notice">
          WhatsApp isn&apos;t connected yet — messages are <b>recorded</b> and will send once credentials are added.
        </div>
      )}

      <div className="chat-thread">
        {msgs.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--ink-fade)", fontSize: 12.5, margin: "20px 0" }}>
            No messages yet. Say hello to start the conversation.
          </p>
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.direction === "OUTBOUND" ? "out" : "in"}`}>
              <div className="chat-body">{m.body ?? `[${m.type.toLowerCase()}]`}</div>
              <div className="chat-meta">
                {new Date(m.createdAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                {m.direction === "OUTBOUND" && <StatusIcon status={m.status} />}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error && <p style={{ color: "var(--bad)", fontSize: 12, margin: "0 12px" }}>{error}</p>}

      {!readOnly && (
        <div className="chat-compose">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Type a message…"
            aria-label="Type a message"
          />
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !text.trim()}
            onClick={send}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function StartConversationButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await startConversationAction(leadId);
            if (r.ok) router.refresh();
            else setError(r.error ?? "Could not start.");
          });
        }}
      >
        <MessageCircle className="h-4 w-4" /> {pending ? "Starting…" : "Start conversation"}
      </button>
      {error && <p style={{ color: "var(--bad)", fontSize: 12, marginTop: 8 }}>{error}</p>}
    </div>
  );
}

export function SharePropertyButton({
  conversationId,
  leadId,
  propertyId,
}: {
  conversationId: string;
  leadId: string;
  propertyId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Single source of truth: the server's sharedIds drives whether this renders as
  // a Share button or the "Shared ✓" badge (see the conversation page). On success
  // we just refresh and let the server re-render — no local "done" state to drift.
  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={pending}
      onClick={() => {
        setError(null);
        start(async () => {
          const r = await sharePropertyAction(conversationId, leadId, propertyId);
          if (r.ok) router.refresh();
          else setError(r.error ?? "Failed.");
        });
      }}
      title={error ?? "Share this property with the client"}
    >
      <Share2 className="h-3.5 w-3.5" /> {pending ? "Sharing…" : "Share"}
    </button>
  );
}
