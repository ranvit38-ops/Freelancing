/**
 * Screenshots for the public tutorial at /guide, taken from the seeded demo lab.
 *
 *   npm run db:seed && npm run build && npm start   # in one shell
 *   node e2e/guide-shots.mjs                        # in another
 *
 * Writes public/guide/*.jpg. It records a few real actions first (a note, a
 * result, a role change) so the activity log and the lab overview show what
 * they look like in use. Run it against the demo database only.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const CHROME = process.env.E2E_CHROMIUM;
const OUT = new URL('../public/guide/', import.meta.url).pathname;
const PASSWORD = 'demo-password-1';

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

async function login(email, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: viewport.width < 500 });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await page.waitForURL(/dashboard|start/);
  return page;
}

async function shot(page, name, path, { scrollTo, element, prepare } = {}) {
  if (path) await page.goto(`${BASE}${path}`);
  await page.waitForLoadState('networkidle');
  if (prepare) await prepare(page);
  // The floating assistant button covers content in a still image.
  await page.addStyleTag({ content: '[data-labbot-launcher]{display:none!important}' }).catch(() => {});
  if (scrollTo) await page.getByText(scrollTo, { exact: true }).first().scrollIntoViewIfNeeded();
  const target = element ? element(page) : page;
  await target.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 72 });
  console.log(`  ✓ ${name}`);
}

const prof = await login('demo@labflow.test');
const student = await login('j.okafor@labflow.test');

// A little real use, so the log and the overview have something to show.
// A run with a real record and a few gaps: the best illustration of both.
await prof.goto(`${BASE}/experiments`);
const experiment = await prof
  .getByRole('link', { name: /Recovery troubleshooting/ })
  .first()
  .getAttribute('href');
await student.goto(`${BASE}${experiment}`);
await student.getByLabel('Add a note').fill('Re-ran the blank: background is back under 0.05.');
await student.getByRole('button', { name: 'Add note' }).click();
await student.waitForFunction(() => document.querySelector('#note-body')?.value === '');

await shot(prof, 'home', '/dashboard');
await shot(prof, 'record', '/experiments/new', {
  // Show the quickest way in: describing the run in your own words.
  prepare: async (page) => {
    await page
      .getByLabel('What you did')
      .fill('Ran the tensiometer on soil extract batch 3 at 25 °C, ring flamed between readings. Noisy after sample 6, probably a bubble. Raw files on the lab PC under D:\\Tensiometer\\2026-10.');
    await page.evaluate(() => window.scrollTo(0, 0));
  },
});
await shot(prof, 'experiment', experiment);
await shot(prof, 'completeness', null, {
  element: (page) =>
    page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Record completeness' }) }).last(),
});
await shot(prof, 'run-again', `/experiments/new?from=${experiment.split('/').pop()}`);
await shot(prof, 'record-check', '/experiments/record-check');
await shot(prof, 'activity', '/activity');
await shot(prof, 'people', '/team');
await shot(student, 'start-here', '/start');
await shot(prof, 'tasks', '/tasks');
await shot(prof, 'chat', '/chat');
await shot(prof, 'calendar', '/calendar');
await shot(prof, 'files', '/files');

await prof.goto(`${BASE}/projects`);
const project = await prof.getByRole('link', { name: /PFAS Removal Study/ }).first().getAttribute('href');
await prof.goto(`${BASE}${project}`);
const runs = await prof.evaluate(() =>
  [...document.querySelectorAll('main a')]
    .map((a) => a.getAttribute('href'))
    .filter((h) => h && /^\/experiments\/[0-9a-f-]{36}$/.test(h))
    .map((h) => h.split('/').pop()),
);
await prof.goto(`${BASE}${project}/compare?ids=${[...new Set(runs)].slice(0, 3).join(',')}`);
await shot(prof, 'compare', null, {
  element: (page) => page.locator('div.rounded-xl', { has: page.getByRole('heading', { name: 'Differences' }) }).first(),
});

const phone = await login('j.okafor@labflow.test', { width: 390, height: 844 });
await shot(phone, 'phone', experiment);

await browser.close();
