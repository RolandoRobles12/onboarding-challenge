const ALLOWED_DOMAINS = ['avivacredito.com'];
const ALLOWED_EMAILS = ['rolando.9834@gmail.com'];

export function isUserAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (ALLOWED_EMAILS.includes(lower)) return true;
  const domain = lower.split('@')[1];
  return ALLOWED_DOMAINS.includes(domain);
}
