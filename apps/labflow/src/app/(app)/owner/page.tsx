import { notFound } from 'next/navigation';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/display';
import { PLANS, isPlanId } from '@/lib/plans';
import { requireSession } from '@/server/authz';
import { NotTheOwnerError, ownerPilotFeedback, ownerSignups, ownerSummary } from '@/server/admin';
import { PILOT_PLAN, WOULD_PAY_LABEL, isWouldPay, pilotMode } from '@/lib/pilot';

export const metadata = { title: 'Owner' };
export const dynamic = 'force-dynamic';

const statusTone: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  active: 'ok',
  trialing: 'neutral',
  past_due: 'warn',
  canceled: 'danger',
  none: 'neutral',
};

function money(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

export default async function OwnerPage() {
  const session = await requireSession();

  let summary;
  let signups;
  let feedback;
  try {
    [summary, signups, feedback] = await Promise.all([
      ownerSummary(session),
      ownerSignups(session),
      ownerPilotFeedback(session),
    ]);
  } catch (error) {
    // Anyone who is not the owner is told this page does not exist, rather
    // than that it exists and they cannot see it.
    if (error instanceof NotTheOwnerError) notFound();
    throw error;
  }

  const { totals, workspaces } = summary;
  const stats = [
    { label: 'Monthly revenue', value: money(totals.monthlyRevenue), note: 'From active and past-due plans' },
    { label: 'Workspaces', value: String(totals.workspaces), note: `${totals.newWorkspacesThisMonth} in the last 30 days` },
    { label: 'People', value: String(totals.users), note: `${totals.newUsersThisMonth} in the last 30 days` },
    { label: 'Paying', value: String(totals.active), note: `${totals.trialing} trialing, ${totals.free} free` },
    { label: 'Needs attention', value: String(totals.pastDue + totals.canceled), note: `${totals.pastDue} past due, ${totals.canceled} cancelled` },
    { label: 'Linked to Stripe', value: String(totals.stripeLinked), note: totals.stripeLinked === 0 ? 'No Stripe customer yet' : 'Workspaces with a customer id' },
  ];

  return (
    <>
      <PageHeader
        title="Owner"
        description="Every workspace on this deployment, who signed up, and what they pay. Only the address in LABFLOW_OWNER_EMAIL can open this page."
      />

      {/* The one setting that can give the product away by accident, so it is
          stated at the top of the page rather than left to be remembered. */}
      {pilotMode() ? (
        <p className="mb-6 rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-sm text-warn">
          Pilot mode is on. Every workspace on this deployment has the{' '}
          {PLANS[PILOT_PLAN].name} plan free, nothing can be charged, and the monthly revenue
          below will stay at zero. Remove LABFLOW_PILOT_MODE when the pilot ends.
        </p>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-subtle">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{s.value}</p>
            <p className="mt-1 text-xs text-muted">{s.note}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader
          title="Workspaces"
          description="Newest first. Revenue is what each workspace's plan comes to per month."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-5 py-2.5 font-medium">Workspace</th>
                <th className="px-5 py-2.5 font-medium">Plan</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 text-right font-medium">Monthly</th>
                <th className="px-5 py-2.5 text-right font-medium">People</th>
                <th className="px-5 py-2.5 text-right font-medium">Runs</th>
                <th className="px-5 py-2.5 text-right font-medium">LabBot</th>
                <th className="px-5 py-2.5 font-medium">Last active</th>
                <th className="px-5 py-2.5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {workspaces.map((w) => {
                const plan = w.plan && isPlanId(w.plan) ? PLANS[w.plan] : null;
                const status = w.status ?? 'none';
                return (
                  <tr key={w.id}>
                    <td className="px-5 py-2.5">
                      <span className="block truncate font-medium">{w.name}</span>
                      {w.stripeCustomerId ? (
                        <span className="block truncate font-mono text-xs text-subtle">
                          {w.stripeCustomerId}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-2.5">{plan?.name ?? 'Free'}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={statusTone[status] ?? 'neutral'}>
                        {status === 'none' ? 'free' : status.replace('_', ' ')}
                      </Badge>
                      {status === 'trialing' && w.trialEndsAt ? (
                        <span className="ml-2 text-xs text-subtle">
                          until {formatDate(w.trialEndsAt)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {plan && (status === 'active' || status === 'past_due')
                        ? money(plan.monthly)
                        : ''}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{w.members}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{w.experimentCount}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{w.aiThisMonth}</td>
                    <td className="px-5 py-2.5 text-xs text-muted">
                      {w.lastActiveAt ? formatDate(w.lastActiveAt) : 'never'}
                    </td>
                    <td className="px-5 py-2.5 text-xs text-muted">{formatDate(w.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Signups"
          description="Every account, newest first, with how they signed in and when they were last here."
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
              <tr>
                <th className="px-5 py-2.5 font-medium">Person</th>
                <th className="px-5 py-2.5 font-medium">Workspace</th>
                <th className="px-5 py-2.5 font-medium">Role</th>
                <th className="px-5 py-2.5 font-medium">Signed up with</th>
                <th className="px-5 py-2.5 font-medium">Last sign-in</th>
                <th className="px-5 py-2.5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {signups.map((u) => (
                <tr key={`${u.id}-${u.workspaceId ?? 'none'}`}>
                  <td className="px-5 py-2.5">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-subtle">{u.email}</span>
                  </td>
                  <td className="px-5 py-2.5 text-muted">{u.workspaceName ?? 'No workspace'}</td>
                  <td className="px-5 py-2.5 text-muted">{u.role ?? ''}</td>
                  <td className="px-5 py-2.5">
                    <Badge tone="neutral">{u.viaGoogle ? 'Google' : 'Email'}</Badge>
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted">
                    {u.lastSignInAt ? formatDate(u.lastSignInAt) : 'never'}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {feedback.length > 0 ? (
        <Card className="mt-6">
          <CardHeader
            title="Would they pay?"
            description="What pilot labs said, newest first. Read each answer beside that workspace's row above: an opinion from a lab that barely used it is not evidence."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Person</th>
                  <th className="px-5 py-2.5 font-medium">Workspace</th>
                  <th className="px-5 py-2.5 font-medium">Answer</th>
                  <th className="px-5 py-2.5 text-right font-medium">Worth / mo</th>
                  <th className="px-5 py-2.5 font-medium">What stops them</th>
                  <th className="px-5 py-2.5 font-medium">Who decides</th>
                  <th className="px-5 py-2.5 font-medium">Answered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {feedback.map((f) => (
                  <tr key={f.id}>
                    <td className="px-5 py-2.5">
                      <span className="block truncate font-medium">{f.personName}</span>
                      <span className="block truncate text-xs text-subtle">{f.personEmail}</span>
                    </td>
                    <td className="px-5 py-2.5 text-muted">{f.workspaceName}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={payTone(f.wouldPay)}>
                        {isWouldPay(f.wouldPay) ? WOULD_PAY_LABEL[f.wouldPay] : f.wouldPay}
                      </Badge>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted">
                      {f.monthlyValue === null ? 'not said' : money(f.monthlyValue)}
                    </td>
                    <td className="max-w-sm px-5 py-2.5 text-muted">{f.blocker ?? ''}</td>
                    <td className="px-5 py-2.5 text-muted">{f.decisionMaker ?? ''}</td>
                    <td className="px-5 py-2.5 text-xs text-muted">{formatDate(f.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}

function payTone(answer: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (answer === 'yes') return 'ok';
  if (answer === 'no') return 'danger';
  return 'warn';
}
