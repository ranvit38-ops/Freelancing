import { EmailCheck } from '@/components/email-check';
import { DangerZone, MemberControls } from '@/components/membership-controls';
import { listMyWorkspaces } from '@/server/auth';
import { InviteForm } from '@/components/invite-form';
import { logoutAction } from '@/server/actions/auth';
import { ThemeToggle } from '@/components/theme-toggle';
import { CreateWorkspaceForm } from '@/components/workspace-switcher';
import { Badge, Button, Card, CardHeader, DefinitionList, PageHeader } from '@/components/ui';
import { LabAiKeyForm } from '@/components/lab-ai-key';
import { PLANS } from '@/lib/plans';
import { workspacePlan } from '@/server/paywall';
import { formatDate } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { revokeInviteAction } from '@/server/actions/invites';
import { labAiKeyStatus, listInvites, listWorkspaceMembers, usageCounts } from '@/server/queries';
import { mailSetupProblem, senderAddress, usingResendTestSender } from '@/server/mailer';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession();
  const [members, invites, myWorkspaces, aiKey, usage, plan] = await Promise.all([
    listWorkspaceMembers(session),
    listInvites(session),
    listMyWorkspaces(),
    labAiKeyStatus(session),
    usageCounts(session),
    workspacePlan(session),
  ]);
  const canInvite = session.role !== 'member';

  return (
    <>
      <PageHeader
        title="Settings"
        description="The lab, its people, appearance and integrations."
      />
      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold tracking-tight">Appearance</h2>
          <p className="mb-4 text-sm text-muted">
            Kept in this browser and never sent to us. System follows your operating system.
          </p>
          <ThemeToggle />
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold tracking-tight">Your account</h2>
          <p className="mb-4 text-sm text-muted">
            Signed in as {session.userEmail}. Signing out deletes this session on the server, not
            only the cookie in your browser.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <form action={logoutAction}>
              <Button type="submit" tone="secondary" size="sm">
                Sign out
              </Button>
            </form>
            <form action={logoutAction}>
              <Button type="submit" tone="secondary" size="sm">
                Sign in as another account
              </Button>
            </form>
            <a
              href="/privacy"
              className="rounded-lg px-3 py-1.5 text-sm text-muted underline underline-offset-2 hover:text-fg"
            >
              Privacy statement
            </a>
            <a
              href="/terms"
              className="rounded-lg px-3 py-1.5 text-sm text-muted underline underline-offset-2 hover:text-fg"
            >
              Terms
            </a>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold tracking-tight">Lab</h2>
          <DefinitionList
            items={[
              { term: 'Name', value: session.workspaceName },
              { term: 'Your role', value: <Badge>{session.role}</Badge> },
              { term: 'Signed in as', value: session.userEmail },
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="People" description={`${members.length} in this lab`} />
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted">{m.email}</span>
                </span>
                <Badge>{m.role}</Badge>
                <span className="hidden text-xs text-subtle sm:block">{formatDate(m.joinedAt)}</span>
                {m.id !== session.userId && (session.role === 'owner' || (session.role === 'admin' && m.role === 'member')) ? (
                  <MemberControls
                    userId={m.id}
                    role={m.role}
                    name={m.name ?? m.email}
                    canChangeRole={session.role === 'owner'}
                    canRemove
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {invites.length > 0 ? (
            <div className="border-t border-line px-5 py-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">
                Pending invitations
              </h3>
              <ul className="mt-2 space-y-2">
                {invites.map((invite) => (
                  <li key={invite.id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{invite.email}</span>
                    <Badge>{invite.role}</Badge>
                    {canInvite ? (
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <Button type="submit" tone="ghost" size="sm" className="px-1 text-xs">
                          Revoke
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <InviteForm canInvite={canInvite} />

        <CreateWorkspaceForm />

        <EmailCheck
          problem={mailSetupProblem()}
          testSender={usingResendTestSender()}
          from={senderAddress(process.env.EMAIL_FROM ?? '')}
          you={session.userEmail}
        />

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold tracking-tight">AI</h2>
          <p className="text-sm text-muted">
            LabBot and the other AI features send the parts of your records a request needs to Anthropic&rsquo;s
            Claude, never the whole database. Research records are never used to train models.
          </p>
          <p className="mt-3 text-sm" data-ai-usage>
            {aiKey?.readable ? (
              <>
                Using this lab&rsquo;s own Claude key ending <span className="font-mono">{aiKey.hint}</span>: no monthly
                limit, billed to the lab by Anthropic. {usage.aiThisMonth.toLocaleString('en-US')} requests on the
                plan&rsquo;s allowance this month.
              </>
            ) : process.env.ANTHROPIC_API_KEY ? (
              <>
                {usage.aiThisMonth.toLocaleString('en-US')} of {plan.limits.aiPerMonth.toLocaleString('en-US')} AI
                requests used this month on the {PLANS[plan.plan].name} plan. Every AI feature counts; the count
                starts again on the 1st.
              </>
            ) : (
              <span className="text-warn">
                AI is not switched on for this site, so Labquill says so rather than generating anything. A lab owner
                can add the lab&rsquo;s own Claude key below.
              </span>
            )}
          </p>
          {canInvite ? (
            <div className="mt-5 max-w-xl border-t border-line pt-5">
              <h3 className="text-sm font-medium">Use your lab&rsquo;s own Claude key</h3>
              <p className="mt-1 text-sm text-muted">
                With a key from your lab&rsquo;s Anthropic account, every AI request in this lab runs on it, without the
                plan&rsquo;s monthly limit, and Anthropic bills your lab directly. It is checked with Anthropic before
                it is saved, stored encrypted, and never shown again.
              </p>
              <div className="mt-4">
                <LabAiKeyForm hint={aiKey?.hint ?? null} readable={aiKey?.readable ?? false} />
              </div>
            </div>
          ) : null}
        </Card>
        <DangerZone
          isOwner={session.role === 'owner'}
          labName={session.workspaceName}
          email={session.userEmail}
          hasOtherLabs={myWorkspaces.length > 1}
        />
      </div>
    </>
  );
}
