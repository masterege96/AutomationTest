// CSRF control for cookie-authenticated mutations (specs/3/threat-model.md section 5): the Origin header must be
// present, an http(s) origin, and its host must equal the request's Host header. Missing, "null" or different
// means refused. Behind a host that sets X-Forwarded-Host this has to change (decided when a host exists).

export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("host");
  if (!origin || !host || origin === "null") return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  // An Origin header is only scheme://host[:port]; anything more is not a real browser Origin.
  if (url.origin !== origin) return false;
  return url.host === host.toLowerCase();
}
