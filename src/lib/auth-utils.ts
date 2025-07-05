const ALLOWED_DOMAIN = 'avivacredito.com';
const ALLOWED_EMAILS = ['rolando.9834@gmail.com'];

export function isUserAllowed(email: string | null | undefined): boolean {
    if (!email) {
        return false;
    }
    const sanitizedEmail = email.toLowerCase().trim();
    const isAllowedDomain = sanitizedEmail.endsWith(`@${ALLOWED_DOMAIN}`);
    const isAllowedEmail = ALLOWED_EMAILS.includes(sanitizedEmail);

    return isAllowedDomain || isAllowedEmail;
}
