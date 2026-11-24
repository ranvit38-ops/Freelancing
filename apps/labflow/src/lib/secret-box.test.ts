import { afterEach, describe, expect, it } from 'vitest';
import { open, seal } from './secret-box';

afterEach(() => {
  delete process.env.LABFLOW_ENCRYPTION_KEY;
});

describe('secret box', () => {
  it('round-trips, and never stores the secret in the clear', () => {
    process.env.LABFLOW_ENCRYPTION_KEY = 'test-encryption-key';
    const sealed = seal('sk-ant-api03-example');
    expect(sealed).not.toContain('sk-ant');
    expect(open(sealed)).toBe('sk-ant-api03-example');
    expect(seal('same')).not.toBe(seal('same'));
  });

  it('reads nothing with a different key, a damaged value, or no key at all', () => {
    process.env.LABFLOW_ENCRYPTION_KEY = 'one';
    const sealed = seal('secret');
    process.env.LABFLOW_ENCRYPTION_KEY = 'two';
    expect(open(sealed)).toBeNull();
    process.env.LABFLOW_ENCRYPTION_KEY = 'one';
    expect(open(sealed.slice(0, -4) + 'AAAA')).toBeNull();
    delete process.env.LABFLOW_ENCRYPTION_KEY;
    expect(open(sealed)).toBeNull();
    expect(() => seal('x')).toThrow(/LABFLOW_ENCRYPTION_KEY/);
  });
});
