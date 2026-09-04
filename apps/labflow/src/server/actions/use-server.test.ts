import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Next.js rejects a "use server" module that exports anything but an async
 * function — and it only says so at build time, after everything else passes.
 * This catches it in a second instead.
 */
describe('"use server" modules', () => {
  const dir = __dirname;
  const actionFiles = readdirSync(dir).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
  );

  it('has action files to check', () => {
    expect(actionFiles.length).toBeGreaterThan(0);
  });

  for (const name of actionFiles) {
    const source = readFileSync(join(dir, name), 'utf8');
    if (!/^['"]use server['"]/m.test(source)) continue;

    it(`${name} exports only async functions`, () => {
      const offenders = source
        .split('\n')
        .map((line, i) => ({ line: line.trim(), number: i + 1 }))
        .filter(({ line }) => /^export\s+(const|let|var|class|enum|function)\b/.test(line))
        // `export type` and `export async function` are both fine.
        .filter(({ line }) => !/^export\s+(async\s+function|type)\b/.test(line));

      expect(
        offenders.map((o) => `${name}:${o.number} ${o.line}`),
        'move non-function exports out of the "use server" module',
      ).toEqual([]);
    });
  }
});
