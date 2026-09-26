import { describe, expect, it } from 'vitest';
import { joinedLabEmail, welcomeEmail } from './account-emails';

describe('confirmation emails', () => {
  it('points someone who joined a lab at Start here, by first name', () => {
    const email = welcomeEmail({ name: 'Ada Lovelace', labName: 'Kim Lab', joined: true, link: 'https://x/start' });
    expect(email.subject).toBe("You're in Kim Lab on Labvia");
    expect(email.text).toMatch(/^Hi Ada,/);
    expect(email.text).toContain('https://x/start');
  });

  it('confirms a new lab for someone who started one', () => {
    const email = welcomeEmail({ name: 'Ada', labName: 'Ada Lab', joined: false, link: 'https://x/dashboard' });
    expect(email.subject).toBe('Your Labvia account is ready');
    expect(email.text).toContain('a workspace for Ada Lab');
  });

  it('copes with a blank name', () => {
    expect(joinedLabEmail({ name: '  ', labName: 'L', link: 'u' }).text).toMatch(/^Hi there,/);
  });
});
