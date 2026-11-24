import { describe, expect, it } from 'vitest';
import { joinPathFromPaste } from './join-paste';

const CODE = 'Ab3_dE-fGh1jKlMnOpQrStUvWxYz0123456789abcde';

describe('joinPathFromPaste', () => {
  it('takes the whole link, with or without https and chat punctuation', () => {
    expect(joinPathFromPaste(`https://labquill.app/join?code=${CODE}`)).toBe(`/join?code=${CODE}`);
    expect(joinPathFromPaste(`labquill.app/join?code=${CODE}`)).toBe(`/join?code=${CODE}`);
    expect(joinPathFromPaste(` <https://labquill.app/join?code=${CODE}>. `)).toBe(`/join?code=${CODE}`);
  });

  it('takes an emailed invitation link', () => {
    expect(joinPathFromPaste(`http://localhost:3001/join?token=${CODE}`)).toBe(`/join?token=${CODE}`);
  });

  it('takes the code on its own', () => {
    expect(joinPathFromPaste(CODE)).toBe(`/join?code=${CODE}`);
  });

  it('refuses what cannot be a link or a code', () => {
    expect(joinPathFromPaste('')).toBeNull();
    expect(joinPathFromPaste('my PI said to join')).toBeNull();
    expect(joinPathFromPaste('https://labquill.app/dashboard')).toBeNull();
    expect(joinPathFromPaste('short')).toBeNull();
  });
});
