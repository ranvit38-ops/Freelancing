/**
 * A new experiment LabBot prepared, handed to the experiment form on the next
 * page. It lives in this tab only, is read once and then removed, and the
 * form fills only empty fields from it: the person still checks and saves.
 */

export type Prefill = {
  title: string;
  performedOn: string;
  objective: string;
  protocolVersionId: string;
  protocolNotes: string;
  conditions: { name: string; value: string; unit: string }[];
  dataLocation: string;
  notes: string;
  nextSteps: string;
};

const key = (projectId: string) => `labquill:labbot-prefill:${projectId}`;

export function stashPrefill(projectId: string, record: Prefill) {
  try {
    window.sessionStorage.setItem(key(projectId), JSON.stringify(record));
  } catch {
    // Storage refused (private mode): the form opens empty instead.
  }
}

export function takePrefill(projectId: string): Prefill | null {
  try {
    const raw = window.sessionStorage.getItem(key(projectId));
    if (!raw) return null;
    window.sessionStorage.removeItem(key(projectId));
    const record = JSON.parse(raw) as Prefill;
    return record && typeof record.title === 'string' && Array.isArray(record.conditions) ? record : null;
  } catch {
    return null;
  }
}
