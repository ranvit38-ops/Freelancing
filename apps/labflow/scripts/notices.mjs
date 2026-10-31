// Writes public/third-party-notices.txt: every package Labquill ships, its
// licence, and the licence text, which MIT, BSD, ISC and Apache all require to
// travel with copies of the code. The browser bundle strips licence comments,
// so this file is where those notices live. Runs before every build.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dirs = execSync('npm ls --omit=dev --all --parseable', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  .split('\n')
  .filter((d) => d && d !== root.replace(/\/$/, '') && d.includes('node_modules'));

const seen = new Map();
for (const dir of dirs) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  const licence = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'see package';
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f));
  const text = file && existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8').trim() : '';
  seen.set(id, { id, licence, text });
}

const entries = [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
const out = [
  'Labquill is built on open-source software. Each package below is used under its own licence, reproduced here.',
  `${entries.length} packages.`,
  '',
  ...entries.flatMap((e) => ['='.repeat(72), `${e.id}  (${e.licence})`, '', e.text || `Licensed under ${e.licence}.`, '']),
].join('\n');
writeFileSync(join(root, 'public', 'third-party-notices.txt'), out);
console.log(`third-party-notices.txt: ${entries.length} packages`);
