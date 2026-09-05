import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "smarttalk" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // CM legacy auth: users que loguean via /api/auth/local NO tienen sesion
  // Supabase Auth — solo la cookie `cm_user_id`. Sin este fallback, cualquier
  // click en una ruta protegida (Bandeja/Ajustes/Dashboard) los redirige a
  // /login y parece que "se cerro la sesion".
  const cmUserId = request.cookies.get("cm_user_id")?.value ?? null;
  const isAuthenticated = Boolean(user) || Boolean(cmUserId);

  const p = request.nextUrl.pathname;
  if (
    !isAuthenticated &&
    !p.startsWith("/login") &&
    !p.startsWith("/st/login") &&
    !p.startsWith("/register") &&
    !p.startsWith("/invite") &&
    !p.startsWith("/api/webhook") &&
    !p.startsWith("/api/cron")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirectResponse = NextResponse.redirect(url);
    redirectResponse.headers.set("Cache-Control", "private, no-store, max-age=0");
    redirectResponse.headers.set("Vary", "Cookie");
    return redirectResponse;
  }

  return supabaseResponse;
}
