import type { NextConfig } from "next";

// Security headers: values from specs/2b/threat-model.md section A (security). Copy changes from there only.
// The Content-Security-Policy is not set here: the per-request nonce CSP is set by proxy.ts
// (specs/3/threat-model.md section 6). Exactly one CSP header per response.

const nextConfig: NextConfig = {
  // Off: a nonce CSP needs every page rendered per request; Cache Components / PPR serve a build-time
  // static shell whose scripts can't carry the nonce (specs/3/threat-model.md 6.5). partialPrefetching
  // requires cacheComponents, so it is removed too.
  cacheComponents: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
