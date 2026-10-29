import Link from 'next/link';
import { LEGAL_EFFECTIVE, type LegalIdentity } from '@/lib/legal';

export type LegalSection = { title: string; body: (string | string[])[] };

/**
 * The Terms and the Privacy statement share one shape: plain paragraphs, the
 * odd list, the date they took effect, and who to write to.
 */
export function LegalPage({
  title,
  intro,
  sections,
  identity,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
  identity: LegalIdentity;
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8" data-legal-configured={identity.configured ? 'yes' : 'no'}>
      <Link href="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Labquill
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">Effective {LEGAL_EFFECTIVE}. {intro}</p>

      <div className="mt-10 space-y-9">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="text-sm font-semibold tracking-tight">{s.title}</h2>
            <div className="mt-2 space-y-3">
              {s.body.map((part, i) =>
                typeof part === 'string' ? (
                  <p key={i} className="text-sm leading-6 text-muted">
                    {part}
                  </p>
                ) : (
                  <ul key={i} className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted">
                    {part.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </div>
          </section>
        ))}

        <section>
          <h2 className="text-sm font-semibold tracking-tight">Contact</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {identity.contact ? (
              <>
                Write to{' '}
                <a href={`mailto:${identity.contact}`} className="font-medium text-fg underline underline-offset-2">
                  {identity.contact}
                </a>
                . A person reads it.
              </>
            ) : (
              'No contact address has been set up for this site yet. Until one is, ask whoever invited you to Labquill.'
            )}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            See also the{' '}
            <Link href={title === 'Terms' ? '/privacy' : '/terms'} className="underline underline-offset-2 hover:text-fg">
              {title === 'Terms' ? 'Privacy statement' : 'Terms'}
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
