import { LegalPage, type LegalSection } from '@/components/legal-page';
import { legalIdentity } from '@/lib/legal';
import { TRIAL_DAYS } from '@/lib/plans';

export const metadata = { title: 'Terms' };
// The operator's name and contact are set on the host, not baked in at build.
export const dynamic = 'force-dynamic';

/*
 * SETUP REQUIRED: these terms were drafted to match what this code actually
 * does. Have a lawyer read them before Labquill takes money or signs with a
 * university, and keep them true whenever the product changes.
 */
export default function TermsPage() {
  const id = legalIdentity();
  const we = id.name;

  const sections: LegalSection[] = [
    {
      title: 'Who these terms are between',
      body: [
        `These terms are an agreement between you and ${we} ("we", "us"), which runs Labquill. By creating an account, joining a lab, or using Labquill, you agree to them. If you do not agree, do not use Labquill.`,
        'If you use Labquill for a lab, department or university, you confirm that you are allowed to agree to these terms for it. Some institutions have their own rules about which software their researchers may use; following them is up to you and your institution.',
      ],
    },
    {
      title: 'Who can use Labquill',
      body: [
        'You must be at least 13 years old. If you are under 18, a parent or guardian must agree to these terms for you.',
        'Keep your password to yourself and tell us straight away if you think someone else has used your account. You are responsible for what happens under your account.',
      ],
    },
    {
      title: 'Your research stays yours',
      body: [
        'Everything you put into Labquill, records, files, notes and messages, remains yours or your institution\'s. You give us permission to store it, process it, display it to the people in your lab, and pass it to the service providers named in the Privacy statement, only so that Labquill can do what you ask of it.',
        'We do not sell your content, show advertising, or use your content to train AI models.',
      ],
    },
    {
      title: 'What you must not put in Labquill',
      body: [
        'Labquill is not built or certified for regulated data. Do not upload:',
        [
          'Protected health information covered by HIPAA. We are not a HIPAA business associate and do not sign business associate agreements.',
          'Information that identifies research participants, such as names, contact details, medical record numbers or faces. De-identified or coded data is fine.',
          'Classified information, export-controlled information (ITAR or EAR), or Controlled Unclassified Information.',
          'Anything you do not have the right to share, or anything unlawful.',
        ],
        'If your institution, your IRB, or a funder or data agreement says data must stay in an approved system, keep it there and record in Labquill only where it lives.',
      ],
    },
    {
      title: 'Using Labquill fairly',
      body: [
        'Do not try to get into another lab\'s records or anyone else\'s account, probe or attack the service, overload it, scrape it, upload malware, use it to send unwanted email, or resell it without our written agreement.',
        'The AI features are provided by Anthropic. Do not use them for anything Anthropic\'s Usage Policy (anthropic.com/legal/aup) prohibits.',
        'You may not use Labquill if you are in a country under a United States embargo, or are on a United States government list of restricted parties, and you may not use it to export anything in breach of export-control law.',
      ],
    },
    {
      title: 'AI features can be wrong',
      body: [
        'LabBot and the other AI features generate text from your records. That text can be incomplete, out of date, or simply wrong, including quantities, concentrations, units, citations and safety steps. It is not scientific, medical, legal or safety advice.',
        'Check anything that matters against your records and the original sources before you rely on it. You decide what goes into your records and how your experiments are run; AI output never changes a record until someone accepts it.',
      ],
    },
    {
      title: 'AI allowance and your own Claude key',
      body: [
        'Each plan includes a number of AI requests a month, shown on the Pricing page. Every AI feature counts, and the count starts again on the first of each month.',
        'A lab owner or admin can instead add the lab\'s own Anthropic API key. Its requests then run on that key without the monthly limit, and Anthropic bills the lab directly under the lab\'s own agreement with Anthropic. You are responsible for that account, its charges and its use; we use the key only for your lab\'s requests, keep it encrypted, and delete it when you remove it or delete the lab.',
      ],
    },
    {
      title: 'Lab safety is not handled here',
      body: [
        'Labquill keeps records. Nothing in it, including protocols, inventory, reminders, checklists and AI suggestions, replaces your institution\'s safety training, safety data sheets, risk assessments, or approvals such as IRB, IACUC or biosafety review. Follow those first.',
      ],
    },
    {
      title: 'Keep your own copy of what matters',
      body: [
        'We work to keep your data safe and available, but no service is perfect. Do not make Labquill the only copy of raw data or anything you cannot afford to lose. Labquill is designed to record where your original data lives, not to replace it.',
      ],
    },
    {
      title: 'Paid plans',
      body: [
        [
          'Prices are shown on the Pricing page. Paid plans are billed in advance, monthly or yearly, through PayPal, plus any tax that applies. PayPal\'s own terms also apply to the payment.',
          'A paid plan renews automatically at the end of each period at the price then in effect, and you are charged for each renewal, until you cancel.',
          'You can cancel at any time in Labquill under Billing, then Cancel plan, or in your PayPal account under Automatic payments. Cancelling stops the next renewal; the plan stays active until the end of the period you have paid for. We email a confirmation when a plan starts and when it is cancelled.',
          'For yearly plans we email the lab\'s owners and admins a reminder about a month before each renewal, with the price and how to cancel.',
          'Payments are not refunded for partly used periods, except where the law requires it.',
          'We will email the lab\'s owners at least 30 days before a price change applies to their renewal.',
          `A person's first lab gets ${TRIAL_DAYS} days of the Lab plan free, without a card. When the trial ends the lab moves to the free plan. Nothing is charged unless you choose a plan.`,
          'If a paid plan ends, the lab becomes read-only. Nothing is deleted because a payment stopped.',
        ],
      ],
    },
    {
      title: 'Changes to Labquill',
      body: [
        'Labquill will change. We may add, change or remove features and plan limits. If a change takes away something a paying lab relies on, we will tell its owners in advance. If we ever shut Labquill down, we will email lab owners at least 30 days before and give them a way to get a copy of their data.',
      ],
    },
    {
      title: 'Ending your use',
      body: [
        'You can delete your account, or a lab you own, at any time from Settings. We may suspend or close an account that breaks these terms, puts other people or the service at risk, or that we are required by law to close. Where we reasonably can, we will tell you first and let you take a copy of your data.',
      ],
    },
    {
      title: 'No warranty',
      body: [
        'Labquill is provided "as is" and "as available". To the fullest extent the law allows, we make no warranties, express or implied, including that it will be uninterrupted or error-free, that it is fit for a particular purpose, or that AI output is accurate.',
      ],
    },
    {
      title: 'Limits on our liability',
      body: [
        'To the fullest extent the law allows, we are not liable for indirect, incidental, special, consequential or punitive damages, or for lost data, lost research results, lost grants or funding, or lost profits, even if we were told they were possible.',
        'To the fullest extent the law allows, our total liability for any claim about Labquill is limited to the greater of the amount you paid us in the 12 months before the claim arose and 100 US dollars.',
        'Some places do not allow these limits. Where they do not, they apply as far as the law there permits.',
      ],
    },
    {
      title: 'Claims about your content',
      body: [
        'If someone brings a claim against us because of content you put into Labquill in breach of these terms, or because of how you used Labquill in breach of them, you agree to cover our reasonable costs of dealing with it, as far as the law and your institution\'s rules allow.',
      ],
    },
    {
      title: 'Copyright complaints',
      body: [
        `If you believe something in Labquill infringes your copyright, send a notice to ${id.contact ?? 'the contact address below'} with: your contact details; the work you say is infringed; where it is in Labquill; a statement that you believe in good faith the use is not authorised; a statement, under penalty of perjury, that your notice is accurate and that you are the owner or authorised to act for them; and your physical or electronic signature.`,
        'We will remove or disable access to material that is the subject of a valid notice, tell the person who uploaded it, and close the accounts of people who repeatedly infringe. Someone whose material was removed by mistake may send a counter-notice to the same address.',
      ],
    },
    {
      title: 'Feedback',
      body: [
        'If you send us ideas or suggestions about Labquill, we may use them without owing you anything for them.',
      ],
    },
    {
      title: 'Accessibility',
      body: [
        'Labquill is built to be usable with a keyboard and a screen reader, and we test it for that. If any part of it is hard for you to use, tell us at the contact address below and we will fix it or find another way to get you what you need.',
      ],
    },
    {
      title: 'If something goes wrong between us',
      body: [
        'Tell us first, at the contact address below, and give us 30 days to put it right before starting any legal claim. Most problems are fixed far faster than that.',
      ],
    },
    {
      title: 'Changes to these terms',
      body: [
        'When we change these terms we will post the new version here with a new date. If a change is significant we will email account holders at least 14 days before it takes effect. Using Labquill after that means you accept the new terms.',
      ],
    },
    {
      title: 'The rest',
      body: [
        'These terms and the Privacy statement are the whole agreement between you and us about Labquill. If a court finds part of them unenforceable, the rest still applies. Not enforcing a term straight away does not mean we give it up. You may not transfer your rights under these terms without our agreement; we may transfer ours to whoever takes over running Labquill, and will tell you if we do.',
      ],
    },
    ...(id.law
      ? [
          {
            title: 'Law',
            body: [
              `These terms are governed by the laws of the State of ${id.law}, United States, without regard to its conflict-of-law rules.`,
            ],
          },
        ]
      : []),
  ];

  return (
    <LegalPage
      title="Terms"
      intro="The rules for using Labquill, written in plain words."
      sections={sections}
      identity={id}
    />
  );
}
