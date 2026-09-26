/** Email is the login identity, so it must normalise identically everywhere. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** URL-safe workspace slug derived from its name, with a uniqueness suffix. */
export function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'workspace'
  );
}

/** Sample codes are compared and displayed uppercase (S-104, not s-104). */
export function normaliseSampleCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '-');
}
