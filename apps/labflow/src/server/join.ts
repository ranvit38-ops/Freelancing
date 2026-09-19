import { PLANS } from '@/lib/plans';
import { workspacePlanById } from './paywall';
import {
  findWorkspaceByJoinCode,
  isMember,
  joinWorkspaceByCode,
  seatUsageByWorkspace,
} from './queries';

/**
 * Joining a lab from a shared link.
 *
 * Three places need this and must agree: the landing page when someone is
 * already signed in, signup when the link brought them to a new account, and
 * login when they had an account already. Splitting the rule across those
 * three is how one of them ends up skipping the seat check.
 */

export type JoinOutcome =
  | { status: 'joined'; workspaceName: string }
  | { status: 'already' }
  | { status: 'invalid' }
  | { status: 'full'; workspaceName: string; seats: number };

export async function joinByCode(code: string, userId: string): Promise<JoinOutcome> {
  const workspace = await findWorkspaceByJoinCode(code);
  if (!workspace) return { status: 'invalid' };

  // Already in the lab: a second click on the same link must not read as an
  // error, and must not consume a seat it is not taking.
  if (await isMember(workspace.id, userId)) return { status: 'already' };

  const [{ plan }, usage] = await Promise.all([
    workspacePlanById(workspace.id),
    seatUsageByWorkspace(workspace.id),
  ]);
  const seats = PLANS[plan].seats;

  // Without this, one link pasted in a group chat takes a five seat lab to
  // thirty. Refusing here is what makes the link safe to share.
  if (usage.members + usage.pending >= seats) {
    return { status: 'full', workspaceName: workspace.name, seats };
  }

  await joinWorkspaceByCode(workspace.id, userId);
  return { status: 'joined', workspaceName: workspace.name };
}

/**
 * Whether a link would be turned away, asked before an account exists.
 *
 * Sign-up through Google creates the account and the membership in one pass.
 * Finding out afterwards that the lab is full leaves a new account with no
 * workspace, which nothing on the sign-in screen can repair, so the question
 * has to be answerable in advance.
 */
export async function joinWouldBeRefused(workspaceId: string): Promise<boolean> {
  const [{ plan }, usage] = await Promise.all([
    workspacePlanById(workspaceId),
    seatUsageByWorkspace(workspaceId),
  ]);
  return usage.members + usage.pending >= PLANS[plan].seats;
}

/** What to tell someone the link did not work for. */
export function joinRefusalMessage(outcome: JoinOutcome): string | null {
  if (outcome.status === 'invalid') {
    return 'That join link is not valid. It may have been switched off. Ask the lab for a new one.';
  }
  if (outcome.status === 'full') {
    return `${outcome.workspaceName} has used all ${outcome.seats} of its seats, so the link cannot add anyone else. Ask whoever runs the lab.`;
  }
  return null;
}
