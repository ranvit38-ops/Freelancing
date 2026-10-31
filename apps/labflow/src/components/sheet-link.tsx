'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { loadGoogle, type GoogleApis } from './drive-import';
import { Button } from './ui';

export type DriveConfig = { clientId: string | null; apiKey: string | null; appId: string | null };

const SCOPE = 'https://www.googleapis.com/auth/drive.file';

/** A Drive access token from the person's own Google account, for this tab only. */
async function driveToken(clientId: string): Promise<{ google: GoogleApis; token: string }> {
  const google = await loadGoogle().catch(() => {
    throw new Error('Google could not be reached. Check your connection or ad blocker and try again.');
  });
  const token = await new Promise<string>((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error('Google did not give access. Try again.'))),
        error_callback: () => reject(new Error('The Google sign-in window was closed or blocked.')),
      })
      .requestAccessToken();
  });
  return { google, token };
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  const data = ((await response?.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  return { ok: Boolean(response?.ok), data };
}

/**
 * Use a Google Sheet as this run's data. Google asks only for access to the
 * Sheet picked, never the whole Drive; the copy is charted, compared and read
 * by LabBot like any upload, and can be refreshed when the Sheet changes.
 */
export function SheetLink({ experimentId, drive }: { experimentId: string; drive: DriveConfig }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const { clientId, apiKey, appId } = drive;
  if (!clientId || !apiKey || !appId) {
    return (
      <p className="text-xs text-subtle">
        Linking Google Sheets is not switched on for this site yet. Until it is, paste the Sheet&rsquo;s link below to
        edit it here, or download it as .xlsx and drop it above.
      </p>
    );
  }

  async function start() {
    setNote(null);
    setBusy(true);
    try {
      const { google, token } = await driveToken(clientId!);
      const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS);
      view.setIncludeFolders(false);
      new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey!)
        .setAppId(appId!)
        .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
        .setCallback(async (data) => {
          if (data.action === google.picker.Action.CANCEL) setBusy(false);
          const sheet = data.action === google.picker.Action.PICKED ? data.docs?.[0] : undefined;
          if (!sheet) return;
          setNote({ ok: true, text: `Reading ${sheet.name}…` });
          const { ok, data: result } = await post('/api/drive/sheets', { accessToken: token, experimentId, sheet });
          setBusy(false);
          setNote(
            ok
              ? { ok: true, text: String(result.notice ?? `Linked ${sheet.name}. Its numbers are now this run's data.`) }
              : { ok: false, text: String(result.error ?? 'Linking the Sheet failed. Try again.') },
          );
          router.refresh();
        })
        .build()
        .setVisible(true);
    } catch (error) {
      setBusy(false);
      setNote({ ok: false, text: (error as Error).message });
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" tone="secondary" onClick={() => void start()} disabled={busy}>
        {busy ? 'Waiting for Google…' : "Use a Google Sheet as this run's data"}
      </Button>
      {note ? <p className={note.ok ? 'text-xs text-muted' : 'text-xs text-danger'}>{note.text}</p> : null}
    </div>
  );
}

/** Copy a linked Sheet again, so the run's data matches what the lab has since typed into it. */
export function SheetRefresh({ fileId, clientId, syncedAt }: { fileId: string; clientId: string | null; syncedAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (!clientId) return null;

  async function refresh() {
    setNote(null);
    setBusy(true);
    try {
      const { token } = await driveToken(clientId!);
      const { ok, data } = await post('/api/drive/sheets/refresh', { accessToken: token, fileId });
      setNote(
        ok
          ? { ok: true, text: String(data.notice ?? 'Refreshed from Google Sheets.') }
          : { ok: false, text: String(data.error ?? 'The refresh failed. Try again.') },
      );
      router.refresh();
    } catch (error) {
      setNote({ ok: false, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-subtle">
      <span>
        From Google Sheets{syncedAt ? `, copied ${new Date(syncedAt).toLocaleString()}` : ''}.
      </span>
      <button type="button" onClick={() => void refresh()} disabled={busy} className="underline underline-offset-2 hover:text-fg">
        {busy ? 'Refreshing…' : 'Refresh from Google Sheets'}
      </button>
      {note ? <span className={note.ok ? 'text-ok' : 'text-danger'}>{note.text}</span> : null}
    </div>
  );
}
