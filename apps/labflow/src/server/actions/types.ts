/** Shape every form action returns, so useFormState handling is identical. */
export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: true;
  message?: string;
};

export const noState: ActionState = {};

/** Flattens a Zod error into the per-field map the forms render. */
export function fieldErrorsFrom(issues: { path: (string | number)[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_');
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

/**
 * FormData → plain object for Zod.
 *
 * Next.js adds its own "$ACTION_*" entries to every server-action submission.
 * Our schemas are `.strict()`, so those must be dropped here or every form
 * fails validation with an error that belongs to no field.
 *
 * Repeatable inputs (the condition rows) collapse to arrays; `arrayKeys` names
 * the fields that must stay arrays even when only one row was submitted.
 */
export function formObject(
  formData: FormData,
  arrayKeys: readonly string[] = [],
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, raw] of formData.entries()) {
    if (typeof raw !== 'string' || key.startsWith('$')) continue;
    const existing = out[key];
    if (existing === undefined) out[key] = arrayKeys.includes(key) ? [raw] : raw;
    else if (Array.isArray(existing)) existing.push(raw);
    else out[key] = [existing, raw];
  }
  return out;
}
