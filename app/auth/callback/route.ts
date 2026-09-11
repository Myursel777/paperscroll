import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/messages";
import { getSupabaseServer } from "@/lib/supabase/server";

// Where the links in Supabase's emails land. Supabase redirects here with a
// one-time `code`; exchanging it signs the user in (the session lands in the
// cookies) and we send them on: to onboarding after sign-up, to the reset
// form after a recovery email, or wherever `next` says.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const supabase = getSupabaseServer();
  if (!supabase) return NextResponse.redirect(`${origin}/`);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.warn("auth callback: code exchange failed:", error.message);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
