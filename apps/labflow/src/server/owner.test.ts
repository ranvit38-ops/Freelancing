import { afterEach, describe, expect, it } from 'vitest';
import { NotTheOwnerError, requireOwner } from './owner';
import type { SessionContext } from './auth';

const session = (userEmail: string): SessionContext => ({
  userId: 'u1',
  userName: 'Someone',
  userEmail,
  workspaceId: 'w1',
  workspaceName: 'A lab',
  workspaceSlug: 'a-lab',
  role: 'owner',
});

afterEach(() => {
  delete process.env.LABFLOW_OWNER_EMAIL;
});

describe('requireOwner', () => {
  it('lets the configured owner through', () => {
    process.env.LABFLOW_OWNER_EMAIL = 'me@example.com';
    expect(() => requireOwner(session('me@example.com'))).not.toThrow();
  });

  it('ignores case and surrounding space, as sign-in does', () => {
    process.env.LABFLOW_OWNER_EMAIL = '  Me@Example.com ';
    expect(() => requireOwner(session('me@example.com'))).not.toThrow();
  });

  it('refuses everyone else', () => {
    process.env.LABFLOW_OWNER_EMAIL = 'me@example.com';
    expect(() => requireOwner(session('someone@else.com'))).toThrow(NotTheOwnerError);
  });

  it('refuses a lookalike address', () => {
    process.env.LABFLOW_OWNER_EMAIL = 'me@example.com';
    expect(() => requireOwner(session('me@example.com.evil.net'))).toThrow(NotTheOwnerError);
    expect(() => requireOwner(session('xme@example.com'))).toThrow(NotTheOwnerError);
  });

  it('refuses everyone when no owner is configured, including an empty address', () => {
    expect(() => requireOwner(session('me@example.com'))).toThrow(NotTheOwnerError);
    expect(() => requireOwner(session(''))).toThrow(NotTheOwnerError);
  });

  it('refuses an empty address even when the owner variable is empty', () => {
    process.env.LABFLOW_OWNER_EMAIL = '';
    expect(() => requireOwner(session(''))).toThrow(NotTheOwnerError);
  });
});
