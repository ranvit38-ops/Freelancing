import { describe, expect, it } from 'vitest';
import { taskAssignedEmail, joinedLabEmail, welcomeEmail } from './account-emails';

describe('confirmation emails', () => {
  it('points someone who joined a lab at Start here, by first name', () => {
    const email = welcomeEmail({ name: 'Ada Lovelace', labName: 'Kim Lab', joined: true, link: 'https://x/start' });
    expect(email.subject).toBe("You're in Kim Lab on Labquill");
    expect(email.text).toMatch(/^Hi Ada,/);
    expect(email.text).toContain('https://x/start');
  });

  it('confirms a new lab for someone who started one', () => {
    const email = welcomeEmail({ name: 'Ada', labName: 'Ada Lab', joined: false, link: 'https://x/dashboard' });
    expect(email.subject).toBe('Your Labquill account is ready');
    expect(email.text).toContain('a lab called Ada Lab');
  });

  it('copes with a blank name', () => {
    expect(joinedLabEmail({ name: '  ', labName: 'L', link: 'u' }).text).toMatch(/^Hi there,/);
  });
});

describe('task assigned email', () => {
  it('says who gave what, by when, with the link', () => {
    const email = taskAssignedEmail({
      name: 'Pranta Das',
      from: 'Dr Lee',
      title: 'Record day-4 plate readings',
      dueOn: '2026-10-16',
      labName: 'Lee Lab',
      link: 'https://example.test/tasks',
    });
    expect(email.subject).toBe('Dr Lee gave you a task: Record day-4 plate readings');
    expect(email.text).toBe(
      'Hi Pranta,\n\nDr Lee gave you a task in Lee Lab:\n\n  Record day-4 plate readings\n  Due 2026-10-16\n\nOpen it here:\nhttps://example.test/tasks',
    );
  });

  it('leaves out the due line when there is no date', () => {
    const email = taskAssignedEmail({ name: '', from: 'Dr Lee', title: 'Order resin', dueOn: null, labName: 'Lee Lab', link: 'l' });
    expect(email.text).toBe('Hi there,\n\nDr Lee gave you a task in Lee Lab:\n\n  Order resin\n\nOpen it here:\nl');
  });
});
