'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChatMarkdown } from './chat-markdown';
import { Button, Textarea, cx } from './ui';

const OPEN_KEY = 'labvia-labbot-open';

type Turn = { question: string; answer: string; error?: string; done: boolean };

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
}: {
  /** False when the server has no model key, so the panel says so before anyone types. */
  configured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [waited, setWaited] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(OPEN_KEY) === '1');
    } catch {
      // Private browsing refuses storage. The panel still works.
    }
  }, []);

  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);

  // Keep the newest words in view as they arrive.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

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
    try {
      window.localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      // As above.
    }
  }

  function update(index: number, change: Partial<Turn>) {
    setTurns((all) => all.map((t, i) => (i === index ? { ...t, ...change } : t)));
  }

  async function ask(event?: React.FormEvent) {
    event?.preventDefault();
    const question = draft.trim();
    if (!question || busy || !configured) return;
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
        hidden={open}
        className={cx(
          'fixed right-5 z-30 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg shadow-lg transition-opacity hover:opacity-90',
          inChat ? 'bottom-36' : 'bottom-5',
        )}
      >
        <span aria-hidden className="h-2 w-2 rounded-full bg-accent-fg/80" />
        Ask LabBot
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
            {turns.length > 0 && !busy ? (
              <button
                type="button"
                onClick={() => setTurns([])}
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

        {!configured ? (
          <p className="border-b border-line bg-warn/5 px-5 py-3 text-sm text-warn">
            LabBot is not switched on for this site yet. It needs an AI key added on the server.
            Everything else works without it.
          </p>
        ) : null}

        <div ref={scroller} id="labbot-messages" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {turns.length === 0 ? (
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
            Question
          </label>
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
              placeholder={turns.length > 0 ? 'Ask a follow-up…' : 'Ask LabBot anything about your lab…'}
              className="!min-h-[2.75rem] flex-1 resize-none text-sm"
              disabled={!configured}
            />
            {busy ? (
              <Button type="button" size="sm" tone="secondary" onClick={() => abort.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button type="submit" size="sm" disabled={!configured || draft.trim().length === 0}>
                Send
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-subtle">
            Enter to send, Shift+Enter for a new line. Only uses what you can see yourself.
          </p>
        </form>
      </aside>
    </>
  );
}
