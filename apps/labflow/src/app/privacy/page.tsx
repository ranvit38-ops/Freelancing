import Link from 'next/link';

export const metadata = { title: 'Privacy' };

const sections = [
  {
    title: 'What we store',
    body: [
      'Your account: name, email address, and a scrypt hash of your password. The password itself is never stored and cannot be recovered from the hash. If you sign in with Google we store the address Google gives us and no password at all.',
      'Your research: everything you put into a workspace. Projects, experiments, protocols, samples, inventory, files, datasets, discussion messages and saved literature.',
      'Your sessions: a SHA-256 hash of the cookie token, never the token itself, alongside its expiry. Signing out deletes the row.',
      'Your billing state: plan, status, seat count and the Stripe customer and subscription identifiers. Card numbers never reach our servers. Stripe collects and holds them.',
    ],
  },
  {
    title: 'Who can see it',
    body: [
      'Only members of your workspace. Every query in this application is filtered by workspace, and there is no query that fetches a record by id without also checking which workspace it belongs to.',
      'The account owner can see a list of workspaces, plan states and account addresses in order to run the business. They cannot read your experiments, files, datasets or messages, because that capability is not built.',
    ],
  },
  {
    title: 'What leaves our servers',
    body: [
      'When you ask LabBot a question, a focused slice of your records is sent to Anthropic to generate the answer: the experiments relevant to your question, descriptive statistics of attached data, and any papers you saved. Raw uploaded files are never sent. If no model key is configured, LabBot says so rather than answering.',
      'When you search literature, your search terms go to the NIH PubMed E-utilities API. Nothing about your workspace is included.',
      'When you pay, card details go directly to Stripe from your browser.',
      'When we send an email, the address and message go to our email provider.',
      'Nothing else leaves. Your records are not sold, shared with other customers, or used to train any model.',
    ],
  },
  {
    title: 'Where it lives',
    body: [
      'In a PostgreSQL database and a file store controlled by whoever operates this deployment. If you run it yourself, that is you, and nothing reaches us at all.',
    ],
  },
  {
    title: 'Deleting things',
    body: [
      'Deleting a project, experiment, sample, file, note or research update removes it and everything derived from it immediately. A sample still recorded against an experiment is refused rather than silently unlinked, so remove it from that run first.',
      'Ending a paid plan never deletes anything. The workspace becomes read-only: every record, file and dataset stays exactly where it is and stays readable. We will not hold your research hostage over a lapsed invoice.',
      'To delete an entire workspace, or to get a copy of everything in it, write to the address below.',
    ],
  },
  {
    title: 'Cookies',
    body: [
      'One cookie, holding your session token. It is HttpOnly, SameSite=lax, and Secure in production. There is no advertising, no analytics and no third-party tracking on this site.',
      'Your theme choice, and whether the LabBot panel is open, are kept in your browser and never sent to us.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path
            d="M10 3 5 8l5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Labvia
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">
        Written to be read, not to be defensible. If anything here is unclear, ask and we will
        rewrite it.
      </p>

      <div className="mt-10 space-y-9">
        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="text-sm font-semibold tracking-tight">{s.title}</h2>
            <div className="mt-2 space-y-3">
              {s.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-6 text-muted">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}

        <section>
          <h2 className="text-sm font-semibold tracking-tight">Asking us something</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {/* SETUP REQUIRED: replace with the address you want privacy mail sent to. */}
            Contact the operator of this deployment. If that is not you, your workspace owner knows
            who it is.
          </p>
        </section>
      </div>
    </div>
  );
}
