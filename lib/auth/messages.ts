// Turns Supabase auth errors into sentences a reader can act on. Anything
// unrecognised falls through unchanged so real problems stay visible.
export function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials")) return "Wrong email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email first. Check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already exists")) return "There is already an account with this email. Try logging in.";
  if (m.includes("password should be at least") || m.includes("weak_password")) return "Please choose a password of at least 8 characters.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Could not reach the sign-in service. Check your connection and try again.";
  return message || "Something went wrong. Please try again.";
}

/** Only allow redirects inside the site, never to another origin. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
