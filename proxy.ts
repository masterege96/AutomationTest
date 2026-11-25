// Request interceptor (Next 16 renamed middleware.ts to proxy.ts). Two jobs only (specs/3/threat-model.md 6, 3.3):
// 1. a fresh nonce and exactly one Content-Security-Policy per request, on the forwarded request (Next stamps the
//    nonce on its scripts) and on the response;
// 2. Supabase session refresh (getClaims()).
// It does NOT authorize anything: every page and API checks getUser() itself.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptionsFor } from "@/lib/client/cookie-options";
import { buildCsp, generateNonce } from "@/lib/server/csp";

// Route handlers never answer proxy prefetches, but Next answers a request carrying `x-middleware-prefetch`
// itself with 200 "{}" before any handler runs (next/dist/server/base-server.js, "middleware prefetch ... bail
// early"). Dropping it for /api/* lets the request reach its handler and that handler's getUser() (AC21/T1).
// `rsc` is NOT handled here: Next marks the request as RSC (request meta, base-server handleRSCRequest) from the
// original header, so removing it in the proxy doesn't stop the 307 to `?_rsc` (docs 02-guides/cdn-caching.md).
const API_STRIPPED_HEADERS = ["x-middleware-prefetch"];

export async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    isDev: process.env.NODE_ENV === "development",
  });

  // Rebuilt from request.headers each time so cookies refreshed below reach the page/handler. set() (never
  // append) overwrites any client-sent x-nonce / Content-Security-Policy, so a client can't choose the nonce.
  const isApi = request.nextUrl.pathname === "/api" || request.nextUrl.pathname.startsWith("/api/");
  const forward = () => {
    const requestHeaders = new Headers(request.headers);
    // Pages keep the header (proxy prefetch of pages is Next's normal behavior).
    if (isApi) for (const h of API_STRIPPED_HEADERS) requestHeaders.delete(h);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    return NextResponse.next({ request: { headers: requestHeaders } });
  };

  let response = forward();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookieOptions: cookieOptionsFor(request.nextUrl.hostname),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = forward();
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
        },
      },
    });
    try {
      // Refreshes an expired access token. Not an authorization check (threat model 3.3).
      await supabase.auth.getClaims();
    } catch {
      // Unreadable or forged cookies: leave them; the page/API's getUser() answers 401 / sign-in.
    }
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
