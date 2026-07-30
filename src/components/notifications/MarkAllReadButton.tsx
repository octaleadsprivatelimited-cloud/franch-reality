"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";

export function MarkAllReadButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button className="btn btn-sm" onClick={handleClick} disabled={loading}>
      <CheckCheck size={14} style={{ marginRight: 4 }} />
      {loading ? "Marking…" : "Mark all read"}
    </button>
  );
}
