import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth-helpers";
import { searchPropertySuggestions } from "@/lib/queries/inventory";

// Typeahead suggestions for the inventory search box. Lives under /api (outside the
// Auth.js proxy matcher), so it authenticates itself and scopes results to the
// signed-in user's cities via searchPropertySuggestions.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ suggestions: [] }, { status: 401 });

  // Clamp the query length (mirrors the list path's 120-char cap) so a keystroke-
  // driven endpoint can't be forced to process a multi-MB string per request.
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 120);
  const suggestions = await searchPropertySuggestions(user, q, 8);
  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
