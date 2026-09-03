import Link from 'next/link';
import { ButtonLink } from '@/components/ui';
import { getSession } from '@/server/auth';

const steps = [
  {
    n: '01',
    title: 'Record the experiment',
    body: 'One screen for objective, protocol version, conditions, samples, files and notes. Capture takes seconds; the rest can be filled in later.',
  },
  {
    n: '02',
    title: 'Connect the data',
    body: 'Attach the measurement files to the run that produced them. Columns are detected, described and kept next to the record — not in a folder someone renamed.',
  },
  {
    n: '03',
    title: 'Understand the results',
    body: 'Compare runs side by side to see exactly which condition or protocol version changed. A completeness check tells you what is still undocumented.',
  },
  {
    n: '04',
    title: 'Generate the research update',
    body: 'Turn selected experiments into a structured update you edit and export — built from the record, with data, your conclusions and AI observations kept visibly apart.',
  },
];

const features = [
  {
    title: 'Experiment records',
    body: 'Objective, hypothesis, protocol version, conditions, samples, data, results and next steps in one structured record.',
  },
  {
    title: 'Connected research history',
    body: 'Every experiment sits in a project timeline, linked to the runs it repeats and the samples it consumed.',
  },
  {
    title: 'Experiment comparison',
    body: 'Select any set of runs and see, field by field, what actually differed — 25 °C → 25 °C → 30 °C, protocol v4 → v4 → v5.',
  },
  {
    title: 'Completeness checks',
    body: 'A mechanical checklist of what the record documents. Green means written down — never that a result is correct.',
  },
  {
    title: 'Evidence-linked AI',
    body: 'Answers cite the experiment records they came from, so every claim can be opened and checked.',
  },
  {
    title: 'Research updates',
    body: 'Draft a presentation from selected experiments, edit every word, and keep data, researcher conclusions and AI observations labelled.',
  },
];

export default async function LandingPage() {
  const session = await getSession();
  const primaryHref = session ? '/dashboard' : '/signup';
  const primaryLabel = session ? 'Open your lab' : 'Start a lab';

  return (
    <div className="bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="h-5 w-5 rounded-md bg-accent" />
            LabFlow
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="#how-it-works"
              className="hidden rounded-lg px-3 py-1.5 text-muted hover:bg-raised hover:text-fg sm:block"
            >
              How it works
            </Link>
            <Link
              href="#features"
              className="hidden rounded-lg px-3 py-1.5 text-muted hover:bg-raised hover:text-fg sm:block"
            >
              Features
            </Link>
            {session ? null : (
              <Link href="/login" className="rounded-lg px-3 py-1.5 text-muted hover:bg-raised hover:text-fg">
                Log in
              </Link>
            )}
            <ButtonLink href={primaryHref} size="sm" className="ml-1">
              {primaryLabel}
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 sm:pt-28">
          <div className="max-w-3xl animate-fade-up">
            <p className="mb-4 inline-flex items-center rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
              For university research labs
            </p>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Turn experiments into a living research record.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-7 text-muted">
              LabFlow connects experiments, protocols, samples, data, results and research updates
              in one place — with AI that helps researchers understand what happened and
              communicate it faster.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={primaryHref}>{primaryLabel}</ButtonLink>
              <ButtonLink href="#how-it-works" tone="secondary">
                See how it works
              </ButtonLink>
            </div>
          </div>
        </section>

        {/* The problem */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Research shouldn&rsquo;t require reconstructing your work from scattered files.
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted">
                  A single study lives across lab notebooks, spreadsheets, instrument exports,
                  shared drives and slide decks. Six months later, answering &ldquo;what did we
                  change between run 12 and run 13?&rdquo; means an afternoon of archaeology — and
                  the answer is often that nobody wrote it down.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {[
                  'Conditions recorded in one place, results in another',
                  'Protocol versions that only exist in someone’s memory',
                  'Data files named final_v3_REAL.xlsx',
                  'Slides rebuilt from scratch every group meeting',
                ].map((item) => (
                  <li
                    key={item}
                    className="rounded-lg border border-line bg-raised px-4 py-3 text-sm text-muted"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">How LabFlow works</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {steps.map((step) => (
              <li
                key={step.n}
                className="rounded-xl border border-line bg-surface p-5 shadow-card"
              >
                <div className="text-xs font-semibold tracking-wider text-accent">{step.n}</div>
                <h3 className="mt-2 font-medium tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="border-y border-line bg-surface scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-2xl font-semibold tracking-tight">Core features</h2>
            <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.title}>
                  <h3 className="font-medium tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                The researcher stays in control
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted">
                LabFlow structures your record and helps you read it. It does not decide what your
                results mean.
              </p>
            </div>
            <dl className="grid gap-5 sm:grid-cols-2">
              {[
                {
                  t: 'AI does not replace scientific judgement',
                  d: 'It summarises what is documented and asks questions. Interpretation is yours.',
                },
                {
                  t: 'Evidence-linked answers',
                  d: 'Every AI response lists the experiment records behind it. Click through and check.',
                },
                {
                  t: 'Transparent uncertainty',
                  d: 'Observations, inferences and suggestions are labelled separately — and missing information is named as missing.',
                },
                {
                  t: 'Your data is not training data',
                  d: 'Research records are never used to train models.',
                },
              ].map((item) => (
                <div key={item.t} className="rounded-lg border border-line bg-surface p-4">
                  <dt className="text-sm font-medium">{item.t}</dt>
                  <dd className="mt-1.5 text-sm leading-6 text-muted">{item.d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-6 py-16 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Start with one project and one experiment.
              </h2>
              <p className="mt-1.5 text-sm text-muted">
                Create a workspace for your lab. It takes about a minute.
              </p>
            </div>
            <ButtonLink href={primaryHref}>{primaryLabel}</ButtonLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>LabFlow — a research workflow system for labs.</span>
          <span className="text-subtle">Records stay yours. Nothing here is used to train models.</span>
        </div>
      </footer>
    </div>
  );
}
