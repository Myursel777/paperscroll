// Where the Supabase project lives, and whether accounts are switched on.
//
// Both values are public by design: the anon key only grants what the
// row-level security policies in supabase/migrations allow. When either is
// missing the whole account system stays off and the site behaves exactly as
// it did before accounts existed.

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const accountsEnabled = supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

/** Pages that need a signed-in user. Others work for everyone. */
export function isProtectedPath(pathname: string): boolean {
  return pathname === "/saved" || pathname === "/onboarding" || pathname.startsWith("/account");
}
