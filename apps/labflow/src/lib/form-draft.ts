/**
 * Unsaved experiment text, kept on this device while it is being typed.
 *
 * A phone that locks, a tab closed by mistake or a dropped connection would
 * otherwise throw away a half-written record, and losing one long entry is
 * enough to send someone back to paper. This is a safety net only: it lives
 * in this browser, is never sent anywhere, and is cleared on save.
 */

export type ConditionRow = { name: string; value: string; unit: string };

export type FormDraft = {
  savedAt: number;
  fields: Record<string, string>;
  conditions: ConditionRow[];
};

/** Identity and file fields: restoring them would be wrong, not just useless. */
const SKIP = new Set(['projectId', 'experimentId', 'existingFileId', 'files']);
const CONDITION = new Set(['conditionName', 'conditionValue', 'conditionUnit']);

export function draftFromFormData(data: FormData, savedAt: number): FormDraft | null {
  const fields: Record<string, string> = {};
  for (const [name, value] of data.entries()) {
    if (SKIP.has(name) || CONDITION.has(name) || name.startsWith('$ACTION') || typeof value !== 'string') continue;
    fields[name] = value;
  }
  const names = data.getAll('conditionName').map(String);
  const values = data.getAll('conditionValue').map(String);
  const units = data.getAll('conditionUnit').map(String);
  const conditions = names.map((name, i) => ({ name, value: values[i] ?? '', unit: units[i] ?? '' }));

  const typed =
    Object.entries(fields).some(([name, v]) => name !== 'status' && name !== 'performedOn' && v.trim() !== '') ||
    conditions.some((c) => c.name.trim() || c.value.trim());
  return typed ? { savedAt, fields, conditions } : null;
}

export function readDraft(key: string): FormDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as FormDraft;
    return draft && typeof draft.savedAt === 'number' && draft.fields ? draft : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, draft: FormDraft | null) {
  try {
    if (draft) window.localStorage.setItem(key, JSON.stringify(draft));
    else window.localStorage.removeItem(key);
  } catch {
    // Private mode or a full quota: the form still works, it just has no net.
  }
}
