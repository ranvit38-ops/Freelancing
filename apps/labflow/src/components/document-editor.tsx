'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatMarkdown } from './chat-markdown';
import { Button, Card, Textarea, cx } from './ui';

type Person = { id: string; name: string; you: boolean };
type Status = 'saved' | 'unsaved' | 'saving' | 'error';

const AUTOSAVE_MS = 1500;

/**
 * A lab document: write, preview, save automatically, and hand it on.
 *
 * Two people can open the same document. Each save says which version it was
 * made from, and the server refuses one made from an older version rather
 * than silently overwriting a colleague, so the editor says so and keeps the
 * text on screen.
 */
export function DocumentEditor({
  id,
  initialTitle,
  initialBody,
  initialUpdatedAt,
  updatedByName,
  isPrivate,
  people,
}: {
  id: string;
  initialTitle: string;
  initialBody: string;
  initialUpdatedAt: string | null;
  updatedByName: string | null;
  isPrivate: boolean;
  people: Person[];
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [status, setStatus] = useState<Status>('saved');
  const [message, setMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(initialUpdatedAt);
  const [lastEditor, setLastEditor] = useState(updatedByName);
  const [tab, setTab] = useState<'write' | 'preview'>(initialBody.trim() ? 'preview' : 'write');
  const base = useRef(initialUpdatedAt);
  const latest = useRef({ title, body });
  const timer = useRef<number | null>(null);
  const saving = useRef(false);
  latest.current = { title, body };

  const save = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    setStatus('saving');
    const sent = { ...latest.current };
    try {
      const response = await fetch(`/api/docs/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...sent, baseUpdatedAt: base.current }),
      });
      const data = (await response.json().catch(() => ({}))) as { updatedAt?: string; error?: string };
      if (!response.ok || !data.updatedAt) {
        setStatus('error');
        setMessage(data.error ?? 'Could not save. Your text is still here; try again.');
        return;
      }
      base.current = data.updatedAt;
      setSavedAt(data.updatedAt);
      setLastEditor('you');
      setMessage(null);
      const changedSince = sent.title !== latest.current.title || sent.body !== latest.current.body;
      setStatus(changedSince ? 'unsaved' : 'saved');
    } catch {
      setStatus('error');
      setMessage('The connection dropped. Your text is still here; it will save when you are back online.');
    } finally {
      saving.current = false;
    }
  }, [id]);

  // Save a moment after typing stops, and again if more came in meanwhile.
  useEffect(() => {
    if (status !== 'unsaved') return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), AUTOSAVE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [status, title, body, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (status === 'unsaved' || status === 'saving' || status === 'error') e.preventDefault();
    };
    const onOnline = () => {
      if (status === 'error') void save();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
      window.removeEventListener('online', onOnline);
    };
  }, [save, status]);

  const edit = (change: { title?: string; body?: string }) => {
    if (change.title !== undefined) setTitle(change.title);
    if (change.body !== undefined) setBody(change.body);
    setStatus('unsaved');
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_18rem] [&>*]:min-w-0" data-unsent={status === 'saved' ? undefined : ''}>
      <div className="space-y-3">
        <label htmlFor="doc-title" className="sr-only">
          Title
        </label>
        <input
          id="doc-title"
          value={title}
          onChange={(e) => edit({ title: e.target.value })}
          placeholder="Untitled document"
          className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-subtle"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg bg-raised p-0.5 text-sm" role="tablist">
            {(['write', 'preview'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cx(
                  'rounded-md px-3 py-1 capitalize',
                  tab === t ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-fg',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <SaveState status={status} savedAt={savedAt} lastEditor={lastEditor} onRetry={() => void save()} />
        </div>
        {message ? (
          <p role="alert" className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-sm text-danger">
            {message}
          </p>
        ) : null}
        {tab === 'write' ? (
          <>
            <label htmlFor="doc-body" className="sr-only">
              Document
            </label>
            <Textarea
              id="doc-body"
              value={body}
              onChange={(e) => edit({ body: e.target.value })}
              placeholder={'Start writing. # for a heading, - for a bullet, **bold**.'}
              className="!min-h-[60vh] text-[15px] leading-7"
            />
          </>
        ) : (
          <Card className="min-h-[60vh] px-6 py-5">
            {body.trim() ? (
              <ChatMarkdown text={body} />
            ) : (
              <p className="text-sm text-muted">Nothing written yet. Switch to Write to start.</p>
            )}
          </Card>
        )}
      </div>

      <aside className="space-y-4">
        <Card className="space-y-2 p-4 text-sm">
          <p className="font-medium">Who can see this</p>
          <p className="text-muted">
            {isPrivate ? 'Only the people it is shared with.' : 'Everyone in the lab. Anyone who can see it can edit it.'}{' '}
            <Link href="/files" className="underline underline-offset-2 hover:text-fg">
              Change in Files
            </Link>
          </p>
          <a
            href={`/api/docs/${id}/docx`}
            className="inline-flex rounded-lg border border-line px-3 py-1.5 font-medium hover:bg-raised"
          >
            Download as Word
          </a>
        </Card>
        <ReviseWithLabBot
          id={id}
          title={title}
          body={body}
          onAccept={(text) => {
            edit({ body: text });
            setTab('preview');
          }}
        />
        <EmailDocument id={id} people={people} beforeSend={save} unsaved={status !== 'saved'} />
      </aside>
    </div>
  );
}

function SaveState({
  status,
  savedAt,
  lastEditor,
  onRetry,
}: {
  status: Status;
  savedAt: string | null;
  lastEditor: string | null;
  onRetry: () => void;
}) {
  if (status === 'saving') return <span className="text-xs text-muted">Saving…</span>;
  if (status === 'unsaved') return <span className="text-xs text-muted">Unsaved changes</span>;
  if (status === 'error') {
    return (
      <button type="button" onClick={onRetry} className="text-xs font-medium text-danger underline underline-offset-2">
        Not saved. Try again
      </button>
    );
  }
  return (
    <span className="text-xs text-subtle">
      Saved{savedAt ? ` ${new Date(savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
      {lastEditor ? ` by ${lastEditor}` : ''}
    </span>
  );
}

/** Ask LabBot for a revision; it is shown as a proposal, never applied by itself. */
function ReviseWithLabBot({
  id,
  title,
  body,
  onAccept,
}: {
  id: string;
  title: string;
  body: string;
  onAccept: (text: string) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function run() {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    setProposal('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch(`/api/docs/${id}/revise`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ instruction, title, body }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'LabBot could not edit this. Try again.');
        setProposal(null);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setProposal(text);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('The connection dropped. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-2 p-4 text-sm">
      <p className="font-medium">Ask LabBot to edit</p>
      <label htmlFor="revise-instruction" className="sr-only">
        What to change
      </label>
      <Textarea
        id="revise-instruction"
        rows={3}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Tighten this up · Turn it into a step-by-step protocol · Add a safety section from our records"
        className="!min-h-0 text-sm"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => void run()} disabled={busy || !instruction.trim()}>
          {busy ? 'Writing…' : 'Suggest an edit'}
        </Button>
        {busy ? (
          <Button type="button" size="sm" tone="secondary" onClick={() => abort.current?.abort()}>
            Stop
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-danger">{error}</p> : null}
      {proposal !== null && !error ? (
        <div className="space-y-2">
          <p className="text-xs text-subtle">LabBot&rsquo;s suggestion. Nothing changes until you accept it.</p>
          <div id="revise-proposal" className="max-h-72 overflow-y-auto rounded-lg border border-line bg-raised px-3 py-2">
            {proposal ? <ChatMarkdown text={proposal} /> : <p className="text-muted">Reading your lab…</p>}
          </div>
          {!busy && proposal ? (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onAccept(proposal);
                  setProposal(null);
                  setInstruction('');
                }}
              >
                Accept
              </Button>
              <Button type="button" size="sm" tone="secondary" onClick={() => setProposal(null)}>
                Discard
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function EmailDocument({
  id,
  people,
  beforeSend,
  unsaved,
}: {
  id: string;
  people: Person[];
  beforeSend: () => Promise<void>;
  unsaved: boolean;
}) {
  const [to, setTo] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (to.length === 0 || busy) return;
    setBusy(true);
    setResult(null);
    try {
      if (unsaved) await beforeSend();
      const response = await fetch(`/api/docs/${id}/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, note }),
      });
      const data = (await response.json().catch(() => ({}))) as { sentTo?: string[]; error?: string };
      setResult(
        response.ok && data.sentTo
          ? { ok: true, text: `Sent to ${data.sentTo.join(', ')}, as a Word attachment.` }
          : { ok: false, text: data.error ?? 'Could not send. Try again.' },
      );
      if (response.ok) setTo([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-2 p-4 text-sm">
      <p className="font-medium">Email it</p>
      <fieldset className="max-h-40 space-y-1 overflow-y-auto">
        <legend className="sr-only">Send to</legend>
        {people.map((p) => (
          <label key={p.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={to.includes(p.id)}
              onChange={(e) => setTo((all) => (e.target.checked ? [...all, p.id] : all.filter((x) => x !== p.id)))}
            />
            {p.name}
            {p.you ? <span className="text-subtle">(you)</span> : null}
          </label>
        ))}
      </fieldset>
      <label htmlFor="email-note" className="sr-only">
        Note
      </label>
      <Textarea
        id="email-note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note (optional)"
        className="!min-h-0 text-sm"
      />
      <Button type="button" size="sm" tone="secondary" onClick={() => void send()} disabled={busy || to.length === 0}>
        {busy ? 'Sending…' : 'Send email'}
      </Button>
      {result ? <p className={result.ok ? 'text-ok' : 'text-danger'}>{result.text}</p> : null}
    </Card>
  );
}
