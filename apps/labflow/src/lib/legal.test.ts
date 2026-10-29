import { afterEach, describe, expect, it } from 'vitest';
import { legalIdentity } from './legal';

const keys = ['LABFLOW_LEGAL_NAME', 'LABFLOW_CONTACT_EMAIL', 'LABFLOW_GOVERNING_LAW'] as const;
afterEach(() => keys.forEach((k) => delete process.env[k]));

describe('legalIdentity', () => {
  it('names nobody and invents no address when nothing is set', () => {
    const id = legalIdentity();
    expect(id.configured).toBe(false);
    expect(id.contact).toBeNull();
    expect(id.law).toBeNull();
    expect(id.name).toMatch(/operator/);
  });

  it('uses what the deployment sets', () => {
    process.env.LABFLOW_LEGAL_NAME = 'Labquill LLC';
    process.env.LABFLOW_CONTACT_EMAIL = 'hello@labquill.example';
    process.env.LABFLOW_GOVERNING_LAW = 'Illinois';
    expect(legalIdentity()).toEqual({
      name: 'Labquill LLC',
      contact: 'hello@labquill.example',
      law: 'Illinois',
      configured: true,
    });
  });

  it('refuses a contact that is not an email address', () => {
    process.env.LABFLOW_LEGAL_NAME = 'Labquill LLC';
    process.env.LABFLOW_CONTACT_EMAIL = 'call us';
    expect(legalIdentity().contact).toBeNull();
    expect(legalIdentity().configured).toBe(false);
  });
});
