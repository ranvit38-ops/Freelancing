#!/usr/bin/env node
/**
 * One-command local setup.
 *
 *   npm run setup
 *
 * Finds a Postgres it can use (a running server, or Docker), writes .env.local
 * if it is missing, applies migrations, seeds the demo lab, and tells you what
 * to run next. Safe to re-run: nothing here overwrites an existing .env.local.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const DB_NAME = 'labflow';
const CONTAINER = 'labflow-postgres';
const say = (m) => console.log(m);
const step = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

function run(command, options = {}) {
  return execSync(command, { stdio: 'pipe', encoding: 'utf8', ...options }).trim();
}

function has(command) {
  try {
    run(`${command} --version`);
    return true;
  } catch {
    return false;
  }
}

function reachable(url) {
  try {
    execFileSync('node', ['-e', `
      const { Client } = require('pg');
      const c = new Client({ connectionString: ${JSON.stringify(url)} });
      c.connect().then(() => c.end()).then(() => process.exit(0)).catch(() => process.exit(1));
    `], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  step('1/4  Finding a database');

  const candidates = [
    process.env.DATABASE_URL,
    `postgres://postgres:postgres@localhost:5432/${DB_NAME}`,
    `postgres://postgres@localhost:5432/${DB_NAME}`,
    `postgres://localhost:5432/${DB_NAME}`,
  ].filter(Boolean);

  let url = candidates.find(reachable) ?? null;

  if (url) {
    say(`  Using the Postgres already running at ${url.replace(/:[^:@/]*@/, ':****@')}`);
  } else if (has('docker')) {
    say('  No Postgres reachable — starting one in Docker.');
    try {
      run(`docker start ${CONTAINER}`);
      say(`  Restarted the existing ${CONTAINER} container.`);
    } catch {
      run(
        `docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=postgres ` +
          `-e POSTGRES_DB=${DB_NAME} -p 5432:5432 postgres:16`,
      );
      say(`  Started a new ${CONTAINER} container on port 5432.`);
    }
    url = `postgres://postgres:postgres@localhost:5432/${DB_NAME}`;
    process.stdout.write('  Waiting for it to accept connections');
    for (let i = 0; i < 40; i++) {
      if (reachable(url)) break;
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log('');
    if (!reachable(url)) throw new Error('Postgres started but never became reachable.');
  } else {
    throw new Error(
      'No Postgres found and Docker is not installed.\n' +
        '  Install Docker Desktop, or start Postgres yourself and set DATABASE_URL.',
    );
  }

  step('2/4  Writing .env.local');
  if (existsSync('.env.local')) {
    say('  .env.local already exists — leaving it alone.');
    const current = readFileSync('.env.local', 'utf8');
    if (!current.includes('DATABASE_URL')) {
      say('  \x1b[33mIt has no DATABASE_URL. Add:\x1b[0m');
      say(`    DATABASE_URL="${url}"`);
    }
  } else {
    writeFileSync(
      '.env.local',
      [
        `DATABASE_URL="${url}"`,
        '',
        '# Explore the whole paid product locally without paying.',
        '# Ignored in production — this cannot ship as a backdoor.',
        'LABFLOW_DISABLE_PAYWALL="1"',
        '',
        '# Optional. Without a key, LabBot says it is not configured',
        '# rather than inventing an answer.',
        'ANTHROPIC_API_KEY=""',
        '',
      ].join('\n'),
    );
    say('  Created .env.local with the paywall disabled for local exploration.');
  }

  step('3/4  Applying migrations');
  execSync('npx tsx src/db/migrate.ts', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });

  step('4/4  Seeding the demo lab');
  const seed = await confirm(
    '  Replace ALL local LabFlow data with the demo lab? [Y/n] ',
  );
  if (seed) {
    execSync('npx tsx src/db/seed.ts', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
  } else {
    say('  Skipped. Sign up at /signup to make your own workspace.');
  }

  console.log(`
\x1b[1m\x1b[32mReady.\x1b[0m Start the app with:

    npm run dev

Then open \x1b[1mhttp://localhost:3001\x1b[0m in your browser.
${seed ? '\nLog in as  \x1b[1mdemo@labflow.test\x1b[0m  /  \x1b[1mdemo-password-1\x1b[0m\n' : ''}
The paywall is disabled locally, so every screen is reachable. To see what a
lapsed workspace looks like instead, set LABFLOW_DISABLE_PAYWALL="" in
.env.local and restart.
`);
}

function confirm(prompt) {
  // Non-interactive (CI, piped input): never destroy data by default. Pass
  // --seed to opt in explicitly.
  if (!process.stdin.isTTY) return Promise.resolve(process.argv.includes('--seed'));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(!/^n/i.test(answer.trim()));
    });
  });
}

main().catch((error) => {
  console.error(`\n\x1b[31mSetup failed:\x1b[0m ${error.message}`);
  process.exit(1);
});
