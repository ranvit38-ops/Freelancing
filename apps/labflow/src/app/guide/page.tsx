import Image from 'next/image';
import Link from 'next/link';
import { ButtonLink } from '@/components/ui';
import { getSession } from '@/server/auth';

export const metadata = {
  title: 'Tutorial',
  description: 'Every part of Labvia, page by page, with screenshots: for professors, students and new lab members.',
};

type Who = 'Everyone' | 'Professors and admins' | 'New members';

type Section = {
  id: string;
  who: Who;
  title: string;
  image: string;
  alt: string;
  width: number;
  height: number;
  steps: string[];
  /** Where to try it in your own lab, once signed in. */
  try?: { href: string; label: string };
};

/**
 * The whole product, page by page, from real screenshots of the demo lab.
 * Public, so a professor can read it before signing up and a student can be
 * sent straight to it. Screenshots come from e2e/guide-shots.mjs; rerun it
 * when the screens change so the pictures never describe an older app.
 */
const SECTIONS: Section[] = [
  {
    id: 'home',
    who: 'Everyone',
    title: 'Home',
    image: 'home',
    alt: 'Home, with the lab overview table above tasks, this week, chat and recent experiments',
    width: 1280,
    height: 800,
    steps: [
      'Your tasks, this week’s meetings and deadlines, the latest in the lab chat and recent experiments, on one screen.',
      'If you run the lab, “Your lab this week” sits on top: for each person, runs and notes this week, how many of their records need more detail, and when they last recorded anything. Anyone quiet for a week shows in amber.',
      'Click a name to see everything that person has put in. Click a number in “Records to fill in” to see exactly what is missing.',
    ],
    try: { href: '/dashboard', label: 'Open Home' },
  },
  {
    id: 'record',
    who: 'Everyone',
    title: 'Record an experiment',
    image: 'record',
    alt: 'The record an experiment form with basics, protocol, conditions, samples and original data',
    width: 1280,
    height: 800,
    steps: [
      'Press “Record an experiment” on Home. Only the name is required; fill in the rest as the run goes.',
      'Drop the instrument’s CSV or Excel file at the top and Labvia fills in the conditions and samples it can read.',
      'Under “Original data”, write exactly where the raw files live, for example “Plate reader PC, D:\\Data\\2026-10\\run12.xlsx”.',
      'Typing is kept on your device until you save. If the page closes, reopening it offers “Put it back”.',
    ],
    try: { href: '/experiments/new', label: 'Record one' },
  },
  {
    id: 'experiment',
    who: 'Everyone',
    title: 'The experiment page',
    image: 'experiment',
    alt: 'An experiment page with the record, notes and the completeness checklist',
    width: 1280,
    height: 800,
    steps: [
      'The record at the top: date, who ran it, the protocol version, objective, hypothesis and where the original data is.',
      'Notes are the running log of the run. Each one is stamped with who wrote it and the time, in your time zone. Add them as you go.',
      'Attach files and links under “Files and data”. Spreadsheets become datasets you can chart.',
      'Change the status (planned, in progress, completed, needs investigation) from the top right.',
    ],
  },
  {
    id: 'completeness',
    who: 'Everyone',
    title: 'The completeness checklist',
    image: 'completeness',
    alt: 'The record completeness checklist with documented, incomplete and missing items',
    width: 312,
    height: 1010,
    steps: [
      'Every experiment checks itself against eleven things a good record has: objective, hypothesis, protocol and version, conditions, samples, raw data, results, observations, conclusion and next steps.',
      'Red is missing, amber is too thin to be useful, green is written down. Each gap says what to add.',
      'It checks that information is written down. It never claims the work is correct.',
    ],
  },
  {
    id: 'run-again',
    who: 'Everyone',
    title: 'Run again',
    image: 'run-again',
    alt: 'A new experiment form pre-filled from an earlier run',
    width: 1280,
    height: 800,
    steps: [
      'On any experiment, press “Run again” to repeat it with one change.',
      'The objective, hypothesis, protocol, conditions and samples are copied, and the new run is linked to the old one.',
      'The date is today; deviations, data location and results start empty because they belong to this run alone.',
    ],
  },
  {
    id: 'record-check',
    who: 'Professors and admins',
    title: 'Record check',
    image: 'record-check',
    alt: 'Record check listing thin records grouped by researcher',
    width: 1280,
    height: 800,
    steps: [
      '“Record check”, linked from Home, lists every started run that is missing something, grouped by who ran it, thinnest first.',
      'Each line says exactly what to fill in, so the conversation with a student is specific: “EXP-003 needs the raw data location and a conclusion.”',
      'Catch thin records while the person who ran the experiment still remembers.',
    ],
    try: { href: '/experiments/record-check', label: 'Open Record check' },
  },
  {
    id: 'activity',
    who: 'Professors and admins',
    title: 'Activity log',
    image: 'activity',
    alt: 'The activity log listing who added, edited and deleted what, and when',
    width: 1280,
    height: 800,
    steps: [
      'Activity, in the sidebar, is the lab’s record of who created, edited or deleted what, and when: experiments with the fields that changed, notes, uploads, documents, protocols and role changes.',
      'Pick a person to see only their entries. “Download as spreadsheet” keeps a copy for your records.',
      'A deleted note keeps its text here. Private files and direct messages are never logged.',
    ],
    try: { href: '/activity', label: 'Open Activity' },
  },
  {
    id: 'people',
    who: 'Professors and admins',
    title: 'People and roles',
    image: 'people',
    alt: 'The People page with role menus, activity links and an explanation of roles',
    width: 1280,
    height: 800,
    steps: [
      'Create a join link and paste it in the lab group chat: everyone who opens it joins. Or invite people one by one by email.',
      'Choose anyone’s role from the menu beside their name. Members record and read; admins also invite, remove members and see the activity log; owners decide who is who.',
      'Removing someone keeps everything they recorded. The lab always keeps at least one owner.',
    ],
    try: { href: '/team', label: 'Open People' },
  },
  {
    id: 'start-here',
    who: 'New members',
    title: 'Start here',
    image: 'start-here',
    alt: 'Start here with a numbered reading path and who is who',
    width: 1280,
    height: 800,
    steps: [
      'New people land here after joining. It is a reading path through the lab’s own work, in the order that makes sense, ticked off as they go.',
      '“Who’s who” lists everyone with what they work on, and a button to message them.',
      'To put something at the top of the path, name a shared document “Welcome” or “Start”.',
    ],
    try: { href: '/start', label: 'Open Start here' },
  },
  {
    id: 'tasks',
    who: 'Everyone',
    title: 'Tasks',
    image: 'tasks',
    alt: 'The tasks board with an add a task form',
    width: 1280,
    height: 800,
    steps: [
      'Say what needs doing, who it is for (one person or the whole lab) and the deadline.',
      'It shows on their Home, it is emailed to them once email is set up for your lab, and the deadline appears on the calendar.',
      'Discuss the work on the task itself, then tick it off.',
    ],
    try: { href: '/tasks', label: 'Open Tasks' },
  },
  {
    id: 'chat',
    who: 'Everyone',
    title: 'Chat and direct messages',
    image: 'chat',
    alt: 'Lab chat with channels and direct messages',
    width: 1280,
    height: 800,
    steps: [
      '#lab is the whole lab; each project has its own channel. Enter sends, Shift + Enter starts a new line.',
      'Message one person, or a few, from the list on the left. An unread message shows a number on Chat.',
      'Drag files in or paste a screenshot to share it.',
    ],
    try: { href: '/chat', label: 'Open Chat' },
  },
  {
    id: 'calendar',
    who: 'Everyone',
    title: 'Calendar, and Google Calendar',
    image: 'calendar',
    alt: 'The lab calendar with events and a panel to add it to Google Calendar',
    width: 1280,
    height: 800,
    steps: [
      'Add group meetings and instrument bookings. Task deadlines show on the day they are due.',
      'Press “Get my calendar link”, then “Add to Google Calendar”. Lab events then appear in your own Google Calendar; Google checks for changes every few hours.',
    ],
    try: { href: '/calendar', label: 'Open Calendar' },
  },
  {
    id: 'files',
    who: 'Everyone',
    title: 'Files and documents',
    image: 'files',
    alt: 'The files page with lab files and an upload panel',
    width: 1280,
    height: 800,
    steps: [
      'Everything the lab has uploaded or written. Upload for the whole lab, for chosen people, or just for yourself.',
      '“New document” writes a document inside Labvia that the lab can read and edit.',
      'A spreadsheet here can be turned into an experiment in one step.',
    ],
    try: { href: '/files', label: 'Open Files' },
  },
  {
    id: 'compare',
    who: 'Everyone',
    title: 'Compare runs',
    image: 'compare',
    alt: 'A comparison table highlighting which fields differ between runs',
    width: 976,
    height: 800,
    steps: [
      'In a project, open Compare and pick two to six runs.',
      'The table highlights every field that differs: conditions, protocol version, samples, results. It answers “what did we change between run 12 and run 13?”.',
    ],
  },
  {
    id: 'phone',
    who: 'Everyone',
    title: 'At the bench, on a phone',
    image: 'phone',
    alt: 'An experiment page on a phone',
    width: 390,
    height: 844,
    steps: [
      'Everything works on a phone. Open the run, add a timed note, take a photo and attach it, without going back to a desk.',
    ],
  },
];

const FIRST_WEEK = [
  'Sign up and name your lab. You are its owner.',
  'People → “Create a join link”, and paste it in your lab group chat.',
  'Make your postdoc or senior student an admin from the menu beside their name.',
  'Ask everyone to record their next experiment here, with where the raw data lives.',
  'Every Monday, look at “Your lab this week” on Home, and open Record check.',
];

export default async function GuidePage() {
  const session = await getSession();
  const primaryHref = session ? '/dashboard' : '/signup';

  return (
    <div className="bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="h-5 w-5 rounded-md bg-accent" />
            Labvia
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/pricing" className="rounded-lg px-3 py-1.5 text-muted hover:bg-raised hover:text-fg">
              Pricing
            </Link>
            <ButtonLink href={primaryHref} size="sm" className="ml-1">
              {session ? 'Open your lab' : 'Start a lab'}
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">Tutorial</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Labvia, page by page</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Every part of the app, with screenshots from a demo lab. Each section says who it is for. About ten
          minutes to read; the first box is the two-minute version.
        </p>

        <section aria-labelledby="first-week" className="mt-8 rounded-xl border border-accent/25 bg-accent/5 p-5">
          <h2 id="first-week" className="text-sm font-semibold">Running a lab? Your first week</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
            {FIRST_WEEK.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <nav aria-label="Contents" className="mt-8">
          <h2 className="text-sm font-semibold">Contents</h2>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted underline-offset-2 hover:text-fg hover:underline">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-16">
          {SECTIONS.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-20">
              <p className="text-xs font-medium uppercase tracking-wider text-subtle">
                {i + 1} · {s.who}
              </p>
              <h2 id={`${s.id}-title`} className="mt-1 text-xl font-semibold tracking-tight">
                {s.title}
              </h2>
              <div
                className={
                  s.width < 500
                    ? 'mt-4 grid items-start gap-6 sm:grid-cols-[minmax(0,320px)_1fr]'
                    : 'mt-4 space-y-4'
                }
              >
                <Image
                  src={`/guide/${s.image}.jpg`}
                  alt={s.alt}
                  width={s.width}
                  height={s.height}
                  unoptimized
                  loading={i < 2 ? 'eager' : 'lazy'}
                  className="h-auto w-full max-w-full rounded-xl border border-line shadow-card"
                />
                <div>
                  <ul className="space-y-2 text-sm leading-6">
                    {s.steps.map((step) => (
                      <li key={step} className="flex gap-2.5">
                        <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                  {s.try && session ? (
                    <Link
                      href={s.try.href}
                      className="mt-3 inline-block text-sm font-medium text-accent underline-offset-2 hover:underline"
                    >
                      {s.try.label} in your lab →
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>
          ))}
        </div>

        <section className="mt-16 rounded-xl border border-line bg-surface p-6">
          <h2 className="text-lg font-semibold tracking-tight">Ready to try it with your lab?</h2>
          <p className="mt-1.5 text-sm text-muted">It takes about a minute to start, and your first week is above.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href={primaryHref}>{session ? 'Open your lab' : 'Start a lab'}</ButtonLink>
            <ButtonLink href="/pricing#why" tone="secondary">
              Why not a shared Drive folder?
            </ButtonLink>
          </div>
        </section>
      </main>
    </div>
  );
}
