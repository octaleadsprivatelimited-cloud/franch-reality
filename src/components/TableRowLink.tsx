"use client";

import { useRouter } from "next/navigation";

/**
 * A table row that navigates on click (a <tr> can't be wrapped in an <a>). Keyboard
 * accessible. Server-rendered cells are passed through as children.
 */
export function TableRowLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        // Ignore keys bubbling up from a nested button (Find matches / Message),
        // so a focused inner control doesn't also navigate the row.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      tabIndex={0}
      role="link"
      style={{ cursor: "pointer" }}
    >
      {children}
    </tr>
  );
}
