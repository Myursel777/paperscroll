import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { accountsEnabled, isProtectedPath, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

// Runs before every page request when accounts are on. Two jobs:
//   1. Refresh the session cookies, so a login stays valid across visits.
//   2. Send visitors who are not signed in away from account-only pages, and
//      signed-in visitors away from the login and sign-up pages.
// Without Supabase keys this does nothing and every page is public.
export async function middleware(request: NextRequest) {
  if (!accountsEnabled) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!user && isProtectedPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Pages only: not the API, static files, the worker, or generated metadata.
  matcher: ["/((?!api/|_next/|sw\\.js|manifest\\.webmanifest|icon\\.png|apple-icon\\.png|opengraph-image|sitemap\\.xml|robots\\.txt|icon-192\\.png|icon-512\\.png).*)"],
};
