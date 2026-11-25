// UX-only checks that mirror the server's rules (the API and the DB enforce them; role rule 3).

export const MAX_EMAIL_LENGTH = 254;

export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

// Title rule (AC16/AC17): trimmed with JS trim(), then 1 to 200 Unicode code points.
export function normalizeTitle(value: string): string | null {
  const title = value.trim();
  const length = [...title].length;
  return length >= 1 && length <= 200 ? title : null;
}
