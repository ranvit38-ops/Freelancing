import Link from 'next/link';
import { ButtonLink } from '@/components/ui';
import { WhyNotFree } from '@/components/why-not-free';
import { getSession } from '@/server/auth';

const steps = [
  {
    n: '01',
    title: 'Record the experiment',
    body: 'Describe the run in your own words and the record fills itself in for you to check. Or type it: purpose, protocol version, conditions, files and notes on one screen.',
  },
  {
    n: '02',
    title: 'Connect the data',
    body: 'Attach the measurement files to the run that produced them. Columns are detected, described and kept next to the record, not in a folder someone renamed.',
  },
  {
    n: '03',
    title: 'Understand the results',
    body: 'Compare runs side by side to see exactly which condition or protocol version changed. A completeness check tells you what is still undocumented.',
  },
  {
    n: '04',
    title: 'Generate the research update',
    body: 'Turn selected experiments into a structured update you edit and export. It is built from the record, with data, your conclusions and AI observations kept visibly apart.',
  },
];

/** Illustrative rows for the hero preview. Labelled as an example on the page. */
const previewRows = [
  { name: 'Maya Chen', runs: 4, notes: 7, thin: 0, last: 'Today' },
  { name: 'Diego Alvarez', runs: 2, notes: 1, thin: 2, last: 'Yesterday' },
  { name: 'Priya Nair', runs: 3, notes: 5, thin: 0, last: 'Tue' },
  { name: 'Tom Okafor', runs: 0, notes: 0, thin: 1, last: '12 days ago', quiet: true },
];

export default async function LandingPage(props: { searchParams?: Promise<{ account?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await getSession();
  const primaryHref = session ? '/dashboard' : '/signup';
  const primaryLabel = session ? 'Open your lab' : 'Start a lab';

  return (
    <div className="bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="h-5 w-5 rounded-md bg-accent" />
            Labquill
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="#how-it-works"
              className="hidden rounded-lg px-3 py-1.5 text-muted hover:bg-raised hover:text-fg sm:block"
            >
              How it works
            </Link>
            <Link
              href="#why"
              className="hidden rounded-lg px-3 py-1.5 text-muted hover:bg-raised hover:text-fg sm:block"
            >
              Why not Drive
            </Link>
            <Link href="/guide" className="hidden rounded-lg px-3 py-1.5 text-muted hover:bg-raised hover:text-fg sm:block">
              Tutorial
            </Link>
            <Link href="/pricing" className="rounded-lg px-3 py-1.5 text-muted hover:bg-raised hover:text-fg">
              Pricing
            </Link>
            {session ? null : (
              <Link href="/login" className="whitespace-nowrap rounded-lg px-3 py-1.5 text-muted hover:bg-raised hover:text-fg">
                Log in
              </Link>
            )}
            <ButtonLink href={primaryHref} size="sm" className="ml-1 whitespace-nowrap">
              {primaryLabel}
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        {searchParams?.account === 'deleted' ? (
          <p role="status" className="mx-auto mt-4 max-w-3xl rounded-lg border border-line bg-raised px-4 py-2 text-center text-sm text-muted">
            Your account has been deleted. Thank you for trying Labquill.
          </p>
        ) : null}
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-16 sm:pt-24 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Know what your lab recorded, and what it left out.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-7 text-muted">
              Students record each run in one place, in their own words if they like: protocol version, conditions,
              where the raw data lives, what happened at the bench. You see whose records are thin and who has gone
              quiet, without opening a single file.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={primaryHref}>{primaryLabel}</ButtonLink>
              <ButtonLink href="/guide" tone="secondary">
                See the tutorial
              </ButtonLink>
            </div>
          </div>
          <figure>
            <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
              <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
                <span className="text-sm font-medium">Your lab this week</span>
                <span className="text-xs text-muted">3 records need more detail</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-subtle">
                    <th scope="col" className="px-4 py-2 font-medium">Person</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Runs</th>
                    <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Notes</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">To fill in</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Last recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => (
                    <tr key={r.name} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">{r.name}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.runs}</td>
                      <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">{r.notes}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${r.thin ? 'font-medium text-warn' : 'text-muted'}`}>{r.thin}</td>
                      <td className={`px-4 py-2.5 text-right ${r.quiet ? 'font-medium text-warn' : 'text-muted'}`}>{r.last}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <figcaption className="mt-3 text-xs text-subtle">
              The table on Home for whoever runs the lab. Example data.
            </figcaption>
          </figure>
        </section>

        {/* The problem */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  What changed between run 12 and run 13?
                </h2>
                <p className="mt-4 text-sm leading-6 text-muted">
                  A single study lives across lab notebooks, spreadsheets, instrument exports,
                  shared drives and slide decks. Six months later that question costs an afternoon,
                  and the answer is often that nobody wrote it down.
                </p>
              </div>
              <ul className="divide-y divide-line border-y border-line">
                {[
                  'Conditions recorded in one place, results in another',
                  'Protocol versions that only exist in someone’s memory',
                  'Data files named final_v3_REAL.xlsx',
                  'Slides rebuilt from scratch every group meeting',
                ].map((item) => (
                  <li key={item} className="py-3 text-sm text-muted">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">How Labquill works</h2>
          <ol className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <li key={step.n} className="border-t border-line pt-4">
                <div className="text-xs font-semibold tabular-nums text-subtle">{step.n}</div>
                <h3 className="mt-2 font-medium tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Why pay */}
        <section id="why" className="scroll-mt-16 border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <WhyNotFree />
          </div>
        </section>

        {/* Trust */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                What the AI does, and what it doesn&rsquo;t
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted">
                Labquill structures your record and helps you read it. It does not decide what your
                results mean.
              </p>
            </div>
            <dl className="grid gap-5 sm:grid-cols-2">
              {[
                {
                  t: 'It does not interpret your results',
                  d: 'It summarises what is documented and asks questions. Interpretation is yours.',
                },
                {
                  t: 'It shows where every answer came from',
                  d: 'Answers list the records they drew on. Click through and check.',
                },
                {
                  t: 'It says what is missing',
                  d: 'Observations, inferences and suggestions are labelled separately, and missing information is named as missing.',
                },
                {
                  t: 'It does not train on your records',
                  d: 'We never use your records to train models, and our AI provider\'s terms do not allow it either.',
                },
              ].map((item) => (
                <div key={item.t}>
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
          <span>Labquill. A research workflow system for labs.</span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-subtle">
            <Link href="/terms" className="underline underline-offset-2 hover:text-fg">
              Terms
            </Link>
            <Link href="/privacy" className="underline underline-offset-2 hover:text-fg">
              Privacy
            </Link>
            <Link href="/pricing" className="underline underline-offset-2 hover:text-fg">
              Pricing
            </Link>
            <a href="/third-party-notices.txt" className="underline underline-offset-2 hover:text-fg">
              Open-source licences
            </a>
            <span>Records stay yours. Nothing here is used to train models.</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
