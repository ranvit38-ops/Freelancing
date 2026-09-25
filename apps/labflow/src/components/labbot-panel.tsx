'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { Badge, Select, Textarea, cx } from './ui';
import { SubmitButton } from './submit-button';
import { askProjectAction, type AnswerState } from '@/server/actions/ai';

type ProjectOption = { id: string; name: string };

/**
 * A 'use server' module may export only async functions, so the empty state
 * lives here rather than beside the action. Two builds have already failed on
 * that rule.
 */
const emptyAnswerState: AnswerState = {};

const OPEN_KEY = 'labvia-labbot-open';
const PROJECT_KEY = 'labvia-labbot-project';

/**
 * LabBot, reachable from every page.
 *
 * A question about the work usually arrives while looking at the work, not
 * while sitting on an assistant page. The panel is a sibling of the page
 * rather than an overlay, so the record stays readable beside the answer, and
 * its open state survives navigation.
 */
export function LabBotPanel({
  projects,
  configured,
}: {
  projects: ProjectOption[];
  /** False when the server has no model key, so the panel says so before anyone types. */
  configured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [state, action] = useFormState(askProjectAction, emptyAnswerState);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(OPEN_KEY) === '1');
      const saved = window.localStorage.getItem(PROJECT_KEY);
      if (saved && projects.some((p) => p.id === saved)) setProjectId(saved);
      else setProjectId(projects[0]?.id ?? '');
    } catch {
      setProjectId(projects[0]?.id ?? '');
    }
  }, [projects]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      // Private browsing refuses to store. The panel still opens.
    }
  }

  function choose(id: string) {
    setProjectId(id);
    try {
      window.localStorage.setItem(PROJECT_KEY, id);
    } catch {
      // As above.
    }
  }

  // In Chat the bottom-right corner is the Send button, so the pill sits
  // above the message box there instead of on top of it.
  const inChat = usePathname()?.startsWith('/chat') ?? false;

  return (
    <>
      {/* Bottom right on every page and every screen size. It was a thin
          sideways tab on wide screens only, and people did not find it. */}
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
          Tailwind display utility beats the attribute's user-agent style, so
          `hidden` alone would leave the panel permanently open on wide
          screens. */}
      <aside
        id="labbot-panel"
        aria-hidden={!open}
        className={cx(
          'fixed inset-0 z-40 flex-col bg-surface sm:inset-auto sm:right-0 sm:top-0 sm:h-dvh sm:w-[26rem] sm:border-l sm:border-line sm:shadow-xl',
          open ? 'flex' : 'hidden',
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">LabBot</h2>
            <p className="text-xs text-muted">Answers from your records, with the evidence.</p>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-raised hover:text-fg"
          >
            Close
          </button>
        </div>

        {!configured ? (
          <p className="border-b border-line bg-warn/5 px-5 py-3 text-sm text-warn">
            LabBot is not switched on for this site yet. It needs an AI key added on the
            server. Everything else works without it.
          </p>
        ) : null}

        {projects.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            LabBot answers from a project&rsquo;s own records. Create a project first, then ask
            it anything about the work.
          </p>
        ) : (
        <form action={action} className="space-y-3 border-b border-line px-5 py-4">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="sr-only" htmlFor="labbot-project">
            Project
          </label>
          <Select
            id="labbot-project"
            value={projectId}
            onChange={(e) => choose(e.target.value)}
            className="h-9 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <label className="sr-only" htmlFor="labbot-question">
            Question
          </label>
          <Textarea
            id="labbot-question"
            name="question"
            rows={3}
            required
            placeholder="What should we try next? Why did EXP-004 differ from EXP-003?"
          />
          <SubmitButton size="sm" pendingLabel="Thinking…" disabled={!configured}>
            Ask
          </SubmitButton>
        </form>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
          {state.literatureNote ? (
            <p className="mb-3 text-xs text-warn">{state.literatureNote}</p>
          ) : null}

          {state.answer ? (
            <div className="space-y-4">
              <p className="text-sm leading-6">{state.answer.answer}</p>

              {state.answer.suggestions?.length ? (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
                    What to do next
                  </h3>
                  <ul className="space-y-1.5">
                    {state.answer.suggestions.map((step: string) => (
                      <li key={step} className="text-sm leading-6 text-muted">
                        {step}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {state.answer.whoToAsk?.length ? (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
                    Who to ask
                  </h3>
                  <ul className="space-y-1.5">
                    {state.answer.whoToAsk.map((who: string) => (
                      <li key={who} className="text-sm leading-6 text-muted">
                        {who}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {state.evidence?.length ? (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
                    Based on
                  </h3>
                  <ul className="space-y-1">
                    {state.evidence.map((e) => (
                      <li key={`${e.type}-${e.id}`} className="text-sm">
                        {e.type === 'experiment' ? (
                          <Link
                            href={`/experiments/${e.id}`}
                            className="underline underline-offset-2 hover:text-fg"
                          >
                            {e.label}
                          </Link>
                        ) : (
                          <span className="text-muted">{e.label}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {state.literature?.length ? (
                <section>
                  <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-subtle">
                    From PubMed
                  </h3>
                  <ul className="space-y-2">
                    {state.literature.map((a) => (
                      <li key={a.pmid} className="text-sm leading-6">
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {a.title}
                        </a>
                        <span className="ml-2 align-middle">
                          <Badge>PMID {a.pmid}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : !state.error ? (
            <p className="text-sm text-muted">
              Ask about anything in this project. Every answer names the records it came from, so you
              can open them and check.
            </p>
          ) : null}
        </div>
      </aside>
    </>
  );
}
