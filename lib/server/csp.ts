// Nonce-based Content-Security-Policy (specs/3/threat-model.md section 6). Pure functions, no Next imports,
// so qa-test can unit-test them. proxy.ts is the only caller at runtime.

// Next extracts the nonce from script-src with /^'nonce-([A-Za-z0-9+/_-]+={0,2})'$/; we only ever produce
// standard base64 of 16 bytes (6.2), so anything else is a programming error and fails closed.
const NONCE_PATTERN = /^[A-Za-z0-9+/]{22}==$/;

/** 16 bytes from the Web Crypto CSPRNG, standard base64 (24 chars). New value on every call. */
export function generateNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
}

/** Origin (scheme://host:port) of the Supabase URL; "" if unset, unparsable, or not http/https (2b logic). */
export function supabaseOrigin(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : "";
  } catch {
    return "";
  }
}

export type CspOptions = {
  nonce: string;
  supabaseUrl: string | undefined;
  isDev: boolean;
};

/** The exact header value from threat model 6.3 (production, or development with 'unsafe-eval'). */
export function buildCsp({ nonce, supabaseUrl, isDev }: CspOptions): string {
  if (!NONCE_PATTERN.test(nonce)) throw new Error("buildCsp: invalid nonce");
  const sb = supabaseOrigin(supabaseUrl);
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${sb ? ` ${sb}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
