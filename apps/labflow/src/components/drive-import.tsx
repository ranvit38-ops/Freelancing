'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { useAudience } from './audience-picker';
import { Button } from './ui';

/* Only the handful of Google browser APIs this uses. */
type TokenResponse = { access_token?: string; error?: string };
export type PickerDoc = { id: string; name: string; mimeType: string };
type PickerData = { action: string; docs?: PickerDoc[] };
export type GoogleApis = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
      }) => { requestAccessToken: () => void };
    };
  };
  picker: {
    Action: { PICKED: string; CANCEL: string };
    Feature: { MULTISELECT_ENABLED: string; SUPPORT_DRIVES: string };
    ViewId: { DOCS: string; SPREADSHEETS: string };
    DocsView: new (viewId?: string) => { setIncludeFolders: (v: boolean) => unknown };
    PickerBuilder: new () => PickerBuilder;
  };
};
type PickerBuilder = {
  addView: (view: unknown) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (id: string) => PickerBuilder;
  enableFeature: (feature: string) => PickerBuilder;
  setCallback: (cb: (data: PickerData) => void) => PickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
};
declare global {
  interface Window {
    google?: GoogleApis;
    gapi?: { load: (name: string, cb: () => void) => void };
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(el);
  });
}

export async function loadGoogle(): Promise<GoogleApis> {
  if (!window.google?.accounts) await loadScript('https://accounts.google.com/gsi/client');
  if (!window.gapi) await loadScript('https://apis.google.com/js/api.js');
  if (!window.google?.picker) await new Promise<void>((resolve) => window.gapi!.load('picker', () => resolve()));
  return window.google!;
}

/**
 * Pick files in Google Drive and copy them into the lab.
 *
 * Asks Google only for access to the files the person picks (the drive.file
 * scope), never to their whole Drive, and the token stays in this tab.
 */
export function DriveImport({
  clientId,
  apiKey,
  appId,
  audience,
}: {
  clientId: string | null;
  apiKey: string | null;
  appId: string | null;
  /** The same "who is it for" choice as the upload beside it. */
  audience: ReturnType<typeof useAudience>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  if (!clientId || !apiKey || !appId) {
    return (
      <p className="text-xs text-subtle">
        Importing from Google Drive is not switched on for this site yet. Until it is, paste a Drive link on an
        experiment, or download and drop the file here.
      </p>
    );
  }

  async function start() {
    setNote(null);
    if (audience.value === 'people' && audience.chosen.length === 0) {
      setNote({ ok: false, text: 'Pick at least one person to share with.' });
      return;
    }
    setBusy(true);
    let google: GoogleApis;
    try {
      google = await loadGoogle();
    } catch {
      setBusy(false);
      setNote({ ok: false, text: 'Google could not be reached. Check your connection or ad blocker and try again.' });
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId!,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (token) => {
        if (!token.access_token) {
          setBusy(false);
          setNote({ ok: false, text: 'Google did not give access. Try again.' });
          return;
        }
        const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
        view.setIncludeFolders(false);
        new google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(token.access_token)
          .setDeveloperKey(apiKey!)
          .setAppId(appId!)
          .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
          .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
          .setCallback((data) => {
            if (data.action === google.picker.Action.CANCEL) setBusy(false);
            if (data.action !== google.picker.Action.PICKED || !data.docs?.length) return;
            void copyIn(token.access_token!, data.docs);
          })
          .build()
          .setVisible(true);
      },
      error_callback: () => {
        setBusy(false);
        setNote({ ok: false, text: 'The Google sign-in window was closed or blocked.' });
      },
    });
    client.requestAccessToken();
  }

  async function copyIn(accessToken: string, docs: PickerDoc[]) {
    setNote({ ok: true, text: `Copying ${docs.length} file${docs.length === 1 ? '' : 's'} from Google Drive…` });
    const response = await fetch('/api/drive/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accessToken,
        files: docs.map((d) => ({ id: d.id, name: d.name, mimeType: d.mimeType })),
        audience: audience.value,
        shareWith: audience.chosen,
      }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as
      | { results?: { name: string; fileId?: string; error?: string }[]; error?: string }
      | null;
    setBusy(false);
    if (!response?.ok || !data?.results) {
      setNote({ ok: false, text: data?.error ?? 'The import failed. Try again.' });
      return;
    }
    const done = data.results.filter((r) => r.fileId).map((r) => r.name);
    const failed = data.results.filter((r) => r.error);
    setNote({
      ok: failed.length === 0,
      text: [
        done.length ? `Imported ${done.join(', ')}.` : '',
        ...failed.map((r) => `${r.name}: ${r.error}`),
      ]
        .filter(Boolean)
        .join(' '),
    });
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" tone="secondary" onClick={() => void start()} disabled={busy}>
        {busy ? 'Waiting for Google Drive…' : 'Import from Google Drive'}
      </Button>
      {note ? <p className={note.ok ? 'text-xs text-muted' : 'text-xs text-danger'}>{note.text}</p> : null}
    </div>
  );
}
