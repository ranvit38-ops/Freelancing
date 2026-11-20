'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChatMarkdown } from './chat-markdown';
import { Button, Textarea, cx } from './ui';
import { FillResult } from './labbot-fill';
import { planAction, type PlanState } from '@/server/actions/assistant';
import { MAX_PHOTOS, PhotoError, shrinkPhoto, type Photo } from '@/lib/labbot-photos';
import { useDictation } from './use-dictation';

const OPEN_KEY = 'labvia-labbot-open';
const MODE_KEY = 'labquill-labbot-mode';

/** Opens LabBot from anywhere on the page, e.g. the dashboard's "Tell LabBot". */
export const OPEN_LABBOT_EVENT = 'labquill:open-labbot';
export type OpenLabBotDetail = { mode?: 'ask' | 'fill' };

type Turn = { question: string; answer: string; error?: string; done: boolean };
/** A "fill in for me" request and what LabBot prepared for it. */
type Fill = { request: string; photos: string[]; state?: PlanState };

/** The asker's own date: the server's clock is UTC. */
function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * LabBot, reachable from every page, as a chat.
 *
 * It reads the whole lab the asker can see (experiments, files, chat, tasks,
 * calendar) and the answer streams in word by word. Earlier turns go with each
 * question, so "and the second run?" works. The conversation lives in this
 * panel, which sits in the layout, so it survives moving between pages.
 */
export function LabBotPanel({
  configured,
  people,
}: {
  /** False when the server has no model key, so the panel says so before anyone types. */
  configured: boolean;
  /** Lab members, for emailing an answer. */
  people: { id: string; name: string; you: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  // Ask answers questions; Fill turns what someone says into records to save.
  const [mode, setMode] = useState<'ask' | 'fill'>('ask');
  const [fills, setFills] = useState<Fill[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoError, setPhotoError] = useState('');
  const [draft, setDraft] = useState('');
  const dictation = useDictation(setDraft);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(OPEN_KEY) === '1');
      // Restored after hydration, as the open state is: the server cannot know it.
      if (window.localStorage.getItem(MODE_KEY) === 'fill') setMode('fill');
    } catch {
      // Private browsing refuses storage. The panel still works.
    }
    function openFromPage(event: Event) {
      const wanted = (event as CustomEvent<OpenLabBotDetail>).detail?.mode;
      if (wanted) chooseMode(wanted);
      setOpen(true);
      remember(OPEN_KEY, '1');
      // Focus once the panel is showing; the open effect may already have run.
      window.setTimeout(() => box.current?.focus(), 0);
    }
    window.addEventListener(OPEN_LABBOT_EVENT, openFromPage);
    return () => window.removeEventListener(OPEN_LABBOT_EVENT, openFromPage);
    // chooseMode only sets state and storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function remember(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // As above.
    }
  }

  function chooseMode(next: 'ask' | 'fill') {
    setMode(next);
    remember(MODE_KEY, next);
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError('');
    const room = MAX_PHOTOS - photos.length;
    const chosen = [...files].slice(0, Math.max(0, room));
    if (files.length > room) setPhotoError(`Up to ${MAX_PHOTOS} photos at a time.`);
    for (const file of chosen) {
      try {
        const photo = await shrinkPhoto(file);
        setPhotos((all) => (all.length < MAX_PHOTOS ? [...all, photo] : all));
      } catch (error) {
        setPhotoError(error instanceof PhotoError ? error.message : `${file.name} could not be read.`);
      }
    }
    box.current?.focus();
  }

  useEffect(() => {
    if (open) box.current?.focus();
    // On a wide screen the page makes room for the panel (globals.css), so it
    // never sits over a button someone needs. It stays open across pages, and
    // covering half of every page it followed you to hid "Send invite" and
    // "Create a join link" behind it.
    document.documentElement.toggleAttribute('data-labbot-open', open);
    return () => document.documentElement.removeAttribute('data-labbot-open');
  }, [open]);

  // Keep the newest words in view as they arrive.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, fills]);

  // A counter until the first word, so a slow start never looks like a hang.
  const waiting = busy && turns.at(-1)?.answer === '';
  useEffect(() => {
    if (!waiting) {
      setWaited(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => setWaited(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [waiting]);

  function toggle() {
    const next = !open;
    setOpen(next);
    remember(OPEN_KEY, next ? '1' : '0');
    if (!next) dictation.stop();
  }

  function update(index: number, change: Partial<Turn>) {
    setTurns((all) => all.map((t, i) => (i === index ? { ...t, ...change } : t)));
  }

  async function fill() {
    const request = draft.trim();
    const sending = photos;
    if ((!request && !sending.length) || busy || !configured) return;
    dictation.stop();
    const index = fills.length;
    setFills((all) => [...all, { request, photos: sending.map((p) => p.preview) }]);
    setDraft('');
    setPhotos([]);
    setPhotoError('');
    setBusy(true);
    let state: PlanState;
    try {
      state = await planAction({
        text: request,
        today: localToday(),
        images: sending.map(({ mediaType, data }) => ({ mediaType, data })),
      });
    } catch {
      state = { error: 'Could not reach the server. Check the connection and try again.' };
    }
    setFills((all) => all.map((f, i) => (i === index ? { ...f, state } : f)));
    setBusy(false);
    box.current?.focus();
  }

  async function ask(event?: React.FormEvent) {
    event?.preventDefault();
    if (mode === 'fill') return fill();
    const question = draft.trim();
    if (!question || busy || !configured) return;
    dictation.stop();
    const history = turns.filter((t) => t.done && !t.error).map(({ question, answer }) => ({ question, answer }));
    const index = turns.length;
    setTurns((all) => [...all, { question, answer: '', done: false }]);
    setDraft('');
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;

    try {
      const response = await fetch('/api/labbot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, history }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        update(index, { error: body?.error ?? 'LabBot could not answer. Try again.', done: true });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        update(index, { answer });
      }
      update(index, { answer, done: true });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        update(index, { done: true });
      } else {
        update(index, { error: 'The connection dropped before LabBot finished. Try again.', done: true });
      }
    } finally {
      setBusy(false);
      abort.current = null;
      box.current?.focus();
    }
  }

  // In Chat the bottom-right corner is the Send button, so the pill sits
  // above the message box there instead of on top of it.
  const inChat = usePathname()?.startsWith('/chat') ?? false;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="labbot-panel"
        data-labbot-launcher
        hidden={open}
        className={cx(
          'fixed right-5 z-30 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-lg transition-colors hover:bg-accent-hover',
          // Over a phone's chat it sits on the messages, so it takes less room there.
          inChat ? 'bottom-36 max-sm:right-3 max-sm:px-3 max-sm:py-1.5 max-sm:text-xs' : 'bottom-5',
        )}
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-accent-fg/80" />
        <span>
          <span className={inChat ? 'max-sm:sr-only' : undefined}>Ask </span>LabBot
        </span>
      </button>

      {/* Display is controlled by classes, not the hidden attribute: a
          Tailwind display utility beats the attribute's user-agent style. */}
      <aside
        id="labbot-panel"
        aria-hidden={!open}
        className={cx(
          'fixed inset-0 z-40 flex-col bg-surface sm:inset-auto sm:right-0 sm:top-0 sm:h-dvh sm:w-[28rem] sm:border-l sm:border-line sm:shadow-xl',
          open ? 'flex' : 'hidden',
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">LabBot</h2>
            <p className="text-xs text-muted">Knows your lab&rsquo;s experiments, files, chat, tasks and calendar.</p>
          </div>
          <div className="flex items-center gap-1">
            {(mode === 'ask' ? turns.length : fills.length) > 0 && !busy ? (
              <button
                type="button"
                onClick={() => (mode === 'ask' ? setTurns([]) : setFills([]))}
                className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-raised hover:text-fg"
              >
                New chat
              </button>
            ) : null}
            <button
              type="button"
              onClick={toggle}
              className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-raised hover:text-fg"
            >
              Close
            </button>
          </div>
        </div>

        <div role="group" aria-label="What LabBot does" className="flex gap-1 border-b border-line px-4 py-2">
          {(
            [
              ['ask', 'Ask'],
              ['fill', 'Fill in for me'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                chooseMode(value);
                box.current?.focus();
              }}
              className={cx(
                'rounded-lg px-3 py-1.5 text-sm',
                mode === value ? 'bg-accent-soft font-medium text-fg' : 'text-muted hover:bg-raised hover:text-fg',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {!configured ? (
          <p className="border-b border-line bg-warn/5 px-5 py-3 text-sm text-warn">
            LabBot is not switched on for this site yet. It needs an AI key added on the server.
            Everything else works without it.
          </p>
        ) : null}

        <div ref={scroller} id="labbot-messages" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {mode === 'fill' ? (
            fills.length === 0 ? (
              <div className="space-y-3 text-sm text-muted">
                <p>
                  Say what you did or what needs doing, the way you would tell a labmate, or attach a photo of
                  your notebook page. LabBot prepares the records; you check each one and save it.
                </p>
                <ul className="space-y-1.5">
                  {[
                    'Ran the tensiometer on batch 3 this morning at 30 °C, readings noisy after sample 6. Raw files on the lab PC.',
                    'Add to EXP-002: the ring was dirty, redo samples 6 to 9.',
                    'Register samples S-201 to S-210, soil from site B.',
                    'Tasks: order pipette tips, book the TEM for Friday.',
                  ].map((example) => (
                    <li key={example}>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(example);
                          box.current?.focus();
                        }}
                        className="text-left underline decoration-line underline-offset-2 hover:text-fg"
                      >
                        {example}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              fills.map((f, i) => (
                <div key={i} className="space-y-3">
                  <div className="ml-10 space-y-2 rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-sm">
                    {f.photos.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {f.photos.map((src, j) => (
                          // eslint-disable-next-line @next/next/no-img-element -- a local preview, not a served image
                          <img key={j} src={src} alt={`Photo ${j + 1} sent to LabBot`} className="h-16 w-16 rounded-md object-cover" />
                        ))}
                      </div>
                    ) : null}
                    {f.request ? <p className="whitespace-pre-wrap">{f.request}</p> : null}
                  </div>
                  {!f.state ? (
                    <p role="status" className="text-sm text-muted">
                      {f.photos.length ? 'Reading your notes…' : 'Preparing…'}
                    </p>
                  ) : f.state.error ? (
                    <p className="text-sm text-danger">{f.state.error}</p>
                  ) : (
                    <FillResult state={f.state} />
                  )}
                </div>
              ))
            )
          ) : turns.length === 0 ? (
            <div className="space-y-3 text-sm text-muted">
              <p>Ask anything about your lab. For example:</p>
              <ul className="space-y-1.5">
                {[
                  'What did we find in the last run?',
                  'What does the gel protocol say about loading volume?',
                  'What is due this week, and who has it?',
                  'What did Ana say in chat about the column?',
                ].map((example) => (
                  <li key={example}>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(example);
                        box.current?.focus();
                      }}
                      className="text-left underline decoration-line underline-offset-2 hover:text-fg"
                    >
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            turns.map((turn, i) => (
              <div key={i} className="space-y-3">
                <div className="ml-10 whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent-soft px-3.5 py-2 text-sm">
                  {turn.question}
                </div>
                {turn.answer ? <ChatMarkdown text={turn.answer} /> : null}
                {turn.done && turn.answer && !turn.error ? (
                  <AnswerActions question={turn.question} answer={turn.answer} people={people} />
                ) : null}
                {!turn.done && !turn.answer ? (
                  <p role="status" className="text-sm text-muted">
                    Reading your lab… {waited > 0 ? `${waited}s` : ''}
                  </p>
                ) : null}
                {turn.error ? <p className="text-sm text-danger">{turn.error}</p> : null}
              </div>
            ))
          )}
        </div>

        <form onSubmit={ask} className="border-t border-line px-4 py-3">
          <label className="sr-only" htmlFor="labbot-question">
            {mode === 'fill' ? 'What to record' : 'Question'}
          </label>
          {mode === 'fill' && photos.length ? (
            <ul aria-label="Photos to send" className="mb-2 flex flex-wrap gap-2">
              {photos.map((photo, i) => (
                <li key={photo.preview} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a served image */}
                  <img src={photo.preview} alt={photo.name} className="h-14 w-14 rounded-md border border-line object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((all) => all.filter((_, j) => j !== i))}
                    aria-label={`Remove ${photo.name}`}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-line bg-surface text-xs leading-none text-muted hover:text-fg"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-end gap-2">
            <Textarea
              ref={box}
              id="labbot-question"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void ask();
                }
              }}
              placeholder={
                mode === 'fill'
                  ? 'Tell LabBot what you did or what needs doing…'
                  : turns.length > 0
                    ? 'Ask a follow-up…'
                    : 'Ask LabBot anything about your lab…'
              }
              className="!min-h-[2.75rem] flex-1 resize-none text-sm"
              disabled={!configured}
            />
            {busy && mode === 'ask' ? (
              <Button type="button" size="sm" tone="secondary" onClick={() => abort.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                disabled={!configured || busy || (draft.trim().length === 0 && !(mode === 'fill' && photos.length))}
              >
                {mode === 'fill' ? 'Prepare' : 'Send'}
              </Button>
            )}
          </div>
          {/* Typing is what puts people off recording at all, so the two ways
              round it sit right under the box. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {dictation.supported ? (
              <button
                type="button"
                onClick={() => (dictation.listening ? dictation.stop() : dictation.start(draft))}
                aria-pressed={dictation.listening}
                disabled={!configured}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium disabled:opacity-50',
                  dictation.listening
                    ? 'border-danger/40 bg-danger/10 text-danger'
                    : 'border-line text-muted hover:bg-raised hover:text-fg',
                )}
              >
                <MicIcon />
                {dictation.listening ? 'Stop listening' : 'Speak'}
              </button>
            ) : null}
            {mode === 'fill' ? (
              <>
                <button
                  type="button"
                  onClick={() => picker.current?.click()}
                  disabled={!configured || busy || photos.length >= MAX_PHOTOS}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted hover:bg-raised hover:text-fg disabled:opacity-50"
                >
                  <CameraIcon />
                  Photo of notes
                </button>
                <input
                  ref={picker}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  aria-label="Photo of notes"
                  data-labbot-photo
                  onChange={(e) => {
                    void addPhotos(e.currentTarget.files);
                    e.currentTarget.value = '';
                  }}
                />
              </>
            ) : null}
          </div>
          {dictation.listening ? (
            <p role="status" className="mt-1.5 text-[11px] text-muted">
              Listening… Your browser turns speech into text, using its own speech service. Press Stop listening when done.
            </p>
          ) : null}
          {dictation.error || photoError ? (
            <p role="alert" className="mt-1.5 text-[11px] text-danger">
              {dictation.error || photoError}
            </p>
          ) : null}
          <p className="mt-1.5 text-[11px] text-subtle">
            Enter to send, Shift+Enter for a new line. Only uses what you can see yourself. LabBot can be
            wrong: check amounts, units and safety steps against the record before relying on them.
          </p>
        </form>
      </aside>
    </>
  );
}

/**
 * What to do with an answer worth keeping: make it a document (private to
 * you at first, since it may draw on your own direct messages), or email it.
 */
function AnswerActions({
  question,
  answer,
  people,
}: {
  question: string;
  answer: string;
  people: { id: string; name: string; you: boolean }[];
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'email' | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [to, setTo] = useState<string[]>([]);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveDoc() {
    setBusy('save');
    setNote(null);
    const title = question.replace(/\s+/g, ' ').trim().slice(0, 80) || 'LabBot answer';
    const response = await fetch('/api/docs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, body: answer, private: true }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { href?: string; error?: string } | null;
    if (response?.ok && data?.href) setSaved(data.href);
    else setNote({ ok: false, text: data?.error ?? 'Could not save. Try again.' });
    setBusy(null);
  }

  async function send() {
    if (to.length === 0) return;
    setBusy('email');
    setNote(null);
    const response = await fetch('/api/labbot/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to, question, answer }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { sentTo?: string[]; error?: string } | null;
    if (response?.ok && data?.sentTo) {
      setNote({ ok: true, text: `Emailed to ${data.sentTo.join(', ')}.` });
      setEmailing(false);
      setTo([]);
    } else setNote({ ok: false, text: data?.error ?? 'Could not send. Try again.' });
    setBusy(null);
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap gap-2">
        {saved ? (
          <a href={saved} className="rounded-lg border border-ok/30 bg-ok/5 px-2.5 py-1 font-medium text-ok">
            Saved. Open document
          </a>
        ) : (
          <button
            type="button"
            onClick={() => void saveDoc()}
            disabled={busy !== null}
            className="rounded-lg border border-line px-2.5 py-1 font-medium text-muted hover:bg-raised hover:text-fg"
          >
            {busy === 'save' ? 'Saving…' : 'Save as document'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setEmailing((v) => !v)}
          className="rounded-lg border border-line px-2.5 py-1 font-medium text-muted hover:bg-raised hover:text-fg"
        >
          Email
        </button>
      </div>
      {emailing ? (
        <div className="space-y-1.5 rounded-lg border border-line p-2.5">
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
          <Button type="button" size="sm" tone="secondary" disabled={busy !== null || to.length === 0} onClick={() => void send()}>
            {busy === 'email' ? 'Sending…' : 'Send email'}
          </Button>
        </div>
      ) : null}
      {note ? <p className={note.ok ? 'text-ok' : 'text-danger'}>{note.text}</p> : null}
    </div>
  );
}

function MicIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="7" y="2.5" width="6" height="10" rx="3" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 6.5h3l1.5-2h5L14 6.5h3v9H3z" strokeLinejoin="round" />
      <circle cx="10" cy="11" r="2.75" />
    </svg>
  );
}
