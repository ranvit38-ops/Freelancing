import { LegalPage, type LegalSection } from '@/components/legal-page';
import { legalIdentity } from '@/lib/legal';

export const metadata = { title: 'Privacy' };
// The operator's name and contact are set on the host, not baked in at build.
export const dynamic = 'force-dynamic';

/*
 * Every sentence here is a promise that someone can hold us to, so each one
 * was checked against the code. Change the code, change this page in the
 * same commit, and bump LEGAL_EFFECTIVE.
 */
export default function PrivacyPage() {
  const id = legalIdentity();

  const sections: LegalSection[] = [
    {
      title: 'Who is responsible',
      body: [`Labquill is run by ${id.name}, which decides how the information described here is used.`],
    },
    {
      title: 'What we store',
      body: [
        [
          'Your account: your name, email address, and a scrypt hash of your password. The password itself is never stored and cannot be recovered from the hash. If you sign in with Google, Google gives us your name and email address, and no password is stored at all.',
          'Your research: everything you and your lab put into Labquill. Projects, experiments, notes, protocols, samples, inventory, files, datasets, documents, tasks, calendar events, chat and direct messages, saved literature, and answers the AI features produced.',
          'An activity log of who created, changed or deleted what, and when. It keeps short excerpts of notebook notes, including the first 500 characters of a deleted note, so that a lab record cannot vanish without trace.',
          'Your sessions: a SHA-256 hash of your sign-in token, never the token itself, and when it expires. Signing out deletes it.',
          'Your billing state: plan, status, and the Stripe customer and subscription identifiers. Card numbers, billing addresses and tax IDs are collected and held by Stripe; card numbers never reach our servers.',
          'Answers you give to our feedback questions.',
          'Our hosting provider keeps basic request logs, such as IP addresses and the pages requested, for a limited time, to run and protect the service.',
        ],
      ],
    },
    {
      title: 'Who can see it',
      body: [
        'Inside Labquill, the members of your lab, according to their role. Files and documents marked private are visible only to their owner and the people they share them with, and direct messages only to the people in the conversation. Every query is written to be limited to your own lab, and automated tests check that one lab cannot read another lab\'s records.',
        'The person who runs Labquill has an owner view, to run the business. It lists each lab\'s name, plan and usage counts (members, experiments, AI requests, last activity), and each account\'s name, email address, lab, role and sign-in method. It shows no research content.',
        'The people who run the servers, and our hosting providers, could technically read the database. We look at a lab\'s content only to fix a problem its members have asked us to fix, to keep the service secure, or when the law requires it.',
      ],
    },
    {
      title: 'What leaves our servers',
      body: [
        'We use these service providers. Each receives only what it needs for its part:',
        [
          'Anthropic, for the AI features (LabBot, filling in a run from a description, analysis, catch-up briefings and document revisions). When you use one, the parts of your lab\'s records it needs are sent: for example the experiments, notes, protocols, tasks and messages you can see that relate to your question, people\'s names in them, file names, text taken from relevant uploaded files, and at most one relevant PDF in full. Anthropic processes this to produce the answer, under commercial terms that do not allow it to train models on what we send, and may keep it for a limited time for safety and abuse monitoring. If your lab adds its own Claude key, its requests go to Anthropic on the lab\'s own account instead, under the lab\'s own agreement with Anthropic; the key is stored encrypted and never shown again.',
          'Google, if you use it. Signing in with Google, importing files from Google Drive or linking a Google Sheet to a run (only the files you pick; the access token stays in your browser and is not stored, and a linked Sheet keeps only its Drive file id so it can be refreshed), and viewing Google Sheets, Docs or YouTube links your lab added, which load from Google and may set Google\'s own cookies under Google\'s privacy policy.',
          'Stripe, for payments. Card details go directly to Stripe.',
          'Our email provider, which receives the address and contents of each email we send: invitations, password resets, notices, and documents or answers you choose to email.',
          'The NIH PubMed service, which receives your literature search terms and nothing about your lab.',
          'Render, which runs our servers and stores uploaded files, and our database provider. Our servers are in the United States.',
        ],
        'Labquill\'s use of information received from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use requirements.',
        'We do not sell your information, share it for advertising, or use your research to train AI models.',
      ],
    },
    {
      title: 'Cookies and browser storage',
      body: [
        'A cookie holding your sign-in token (HttpOnly, SameSite=lax, and Secure on the live site), and one remembering which lab you last opened. Signing in with Google sets short-lived cookies that are deleted once sign-in finishes.',
        'Your browser also keeps, on your device only: your light or dark theme, whether the LabBot panel is open, unsent form drafts, your reading-path progress, and which version of the site the tab loaded.',
        'There is no advertising, no analytics and no tracking across other websites, so there is nothing for a browser\'s Do Not Track setting to turn off. Embedded Google content is the one exception noted above.',
      ],
    },
    {
      title: 'Keeping and deleting',
      body: [
        'We keep your information while your account and lab exist.',
        [
          'Deleting a project, run, sample, note, task, message or research update removes that record. Files uploaded to a project or run stay in the lab\'s Files until they are deleted there.',
          'Deleting a file removes the stored file.',
          'An owner can delete a whole lab, and anyone can delete their own account, from Settings. That removes the lab\'s records, its activity log and its stored files straight away.',
          'Our providers\' backups may keep copies for a limited time until they expire.',
          'Ending a paid plan never deletes anything. The lab becomes read-only, and every record, file and dataset stays readable.',
        ],
        'To get a copy of everything in a lab, the lab\'s owner can write to the contact address below and we will provide an export within 30 days.',
      ],
    },
    {
      title: 'Your choices',
      body: [
        'You can see and correct your information in Labquill, and delete it as described above. You can ask us what we hold about you, or to correct or delete it, at the address below. Depending on where you live you may have further rights, and we will honour them.',
      ],
    },
    {
      title: 'Research participants',
      body: [
        'Labquill is not built for information that identifies research participants or for health information covered by HIPAA, and the Terms ask labs not to upload it. If a lab records data about other people, it is responsible for having their consent and the approvals it needs.',
      ],
    },
    {
      title: 'Security',
      body: [
        'Connections are encrypted, passwords and sign-in tokens are stored only as hashes, sign-in and other sensitive actions are rate limited, and access is limited to each lab. No system is perfectly secure. If a breach affects your information, we will tell you without undue delay and as the law requires.',
      ],
    },
    {
      title: 'Children',
      body: [
        'Labquill is not for children under 13, and we do not knowingly collect their information. If we learn that we have, we will delete it.',
      ],
    },
    {
      title: 'Changes',
      body: [
        'When this statement changes we will post the new version here with a new date. If a change is significant we will email account holders before it takes effect.',
      ],
    },
  ];

  return (
    <LegalPage
      title="Privacy"
      intro="What Labquill stores, who can see it, and where it goes. If anything here is unclear, ask and we will rewrite it."
      sections={sections}
      identity={id}
    />
  );
}
