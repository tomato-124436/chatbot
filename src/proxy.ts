import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const isAuthed = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!isAuthed && pathname.startsWith("/chat")) {
    return redirectWithSession(request, supabaseResponse, "/");
  }

  if (isAuthed && pathname === "/") {
    return redirectWithSession(request, supabaseResponse, "/chat");
  }

  return supabaseResponse;
}

function redirectWithSession(request: NextRequest, supabaseResponse: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const redirect = NextResponse.redirect(url);
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  redirect.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  redirect.headers.set("Expires", "0");
  redirect.headers.set("Pragma", "no-cache");
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
