/**
 * Every pipeline, end to end, through the real interface.
 *
 *   npm run e2e:fakes &                 # stand-in model, email and Google
 *   NEXT_PUBLIC_APP_URL=http://127.0.0.1:3001 npm run build
 *   NEXT_PUBLIC_APP_URL=http://127.0.0.1:3001 LABFLOW_PILOT_MODE=1 \
 *   ANTHROPIC_API_KEY=sk-ant-fake ANTHROPIC_BASE_URL=http://127.0.0.1:4555 \
 *   RESEND_API_KEY=re_fake RESEND_BASE_URL=http://127.0.0.1:4556 \
 *   EMAIL_FROM="Labquill <hello@labquill.test>" LABFLOW_OWNER_EMAIL=owner@labquill.test \
 *   GOOGLE_CLIENT_ID=fake GOOGLE_CLIENT_SECRET=fake GOOGLE_OAUTH_TOKEN_URL=http://127.0.0.1:4557/token \
 *   npx next start -p 3001 &
 *   npm run e2e
 *
 * CI runs exactly this (.github/workflows/labflow.yml). NEXT_PUBLIC_APP_URL is
 * baked in at build time and must be the address the browser uses, or sign-in
 * redirects land on another host and lose their cookies.
 *
 * It signs up fresh labs each run, so it never touches existing data. Steps
 * fail softly: one broken pipeline is reported and the rest still run, so a
 * single run shows everything that is wrong. Any 5xx, page error or console
 * error during a step fails that step. Delete owner@labquill.test between
 * runs against the same database, or the owner steps meet last run's account.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3001';
const MODEL = process.env.E2E_FAKE_MODEL ?? 'http://127.0.0.1:4555';
const MAIL = process.env.E2E_FAKE_MAIL ?? 'http://127.0.0.1:4556';
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? 'owner@labquill.test';
const stamp = Date.now();
const results = [];
let current = '';
let stepErrors = [];

const browser = await chromium.launch(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {});

// ── harness ───────────────────────────────────────────────────────────────

async function person(label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  // Nothing outside the app is loaded, so a run means the same thing with or
  // without internet. An embedded Google Sheet is the app's job to show; what
  // Google's own page then does inside the frame is not this test's business.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
  const page = await context.newPage();
  page.on('pageerror', (e) => stepErrors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    const text = m.text();
    // Only the app's own messages: an embedded third-party frame logs its own.
    const from = m.location()?.url ?? '';
    if (from && !from.startsWith(BASE)) return;
    // Prefetches abort when the driver navigates mid-flight: a race in the
    // driver, not the app. Real failures still show as 5xx or page errors.
    // A 404 the test asked for is asserted on its own, not as a console error.
    // ERR_TUNNEL_CONNECTION_FAILED: a sandbox without internet refusing an
    // outside resource (a Google logo), not the app failing.
    if (m.type() === 'error' && !/Failed to fetch RSC payload|ERR_ABORTED|net::ERR_FAILED|ERR_TUNNEL_CONNECTION_FAILED|status of 404/.test(text)) {
      stepErrors.push(`[${label}] console: ${text.slice(0, 300)}`);
    }
  });
  page.on('response', (r) => {
    if (r.status() >= 500) stepErrors.push(`[${label}] HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return { context, page, label };
}

async function step(name, fn) {
  current = name;
  stepErrors = [];
  const started = Date.now();
  try {
    await fn();
    if (stepErrors.length) throw new Error(stepErrors.join('\n      '));
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = (error?.message ?? String(error)).split('\n').slice(0, 8).join('\n      ');
    results.push({ name, ok: false, message });
    console.log(`  ✗ ${name}\n      ${message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** What a person can read. Not textContent: that includes Next's inline page data, which echoes the URL. */
async function bodyText(page) {
  return page.locator('body').innerText();
}

const NOT_FOUND = 'This page isn’t here';

/** Waits for visible text; hidden copies (closed menus, select options) do not count. */
async function expectText(page, text, timeout = 10_000) {
  await page.getByText(text, { exact: false }).and(page.locator(':visible')).first().waitFor({ timeout });
}

/**
 * Fetches from inside the page, so the browser's own cookies go with it. The
 * session cookie is Secure, which a Node-side client will not send over the
 * plain http the test server uses.
 */
async function browserFetch(page, path, init) {
  return page.evaluate(
    async ({ path, init }) => {
      const r = await fetch(path, init);
      const buf = new Uint8Array(await r.arrayBuffer());
      return { status: r.status, type: r.headers.get('content-type'), head: String.fromCharCode(...buf.slice(0, 16)), size: buf.length, disposition: r.headers.get('content-disposition') };
    },
    { path, init },
  );
}

async function fakeLog(base) {
  const r = await fetch(`${base}/__log`);
  return r.json();
}

async function clearFake(base) {
  await fetch(`${base}/__log`, { method: 'DELETE' });
}

async function lastEmailTo(to) {
  const log = await fakeLog(MAIL);
  return log.filter((e) => (e.body.to ?? []).includes(to)).at(-1)?.body ?? null;
}

async function waitForEmail(to, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const email = await lastEmailTo(to);
    if (email) return email;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email reached ${to}`);
}

function linkIn(text, pathPart) {
  const match = (text ?? '').match(new RegExp(`https?://[^\\s)>"]*${pathPart}[^\\s)>"]*`));
  assert(match, `no ${pathPart} link in the email`);
  return match[0].replace(/^https?:\/\/[^/]+/, BASE);
}

async function signUp(page, { name, email, password = 'a-very-long-password', lab }) {
  await page.goto(`${BASE}/signup`);
  await page.fill('#name', name);
  await page.fill('#email', email);
  await page.fill('#password', password);
  if (lab !== undefined && (await page.locator('#workspaceName').count())) await page.fill('#workspaceName', lab);
  await page.check('#agreeTerms');
  await page.click('button[type=submit]');
}

async function logIn(page, email, password = 'a-very-long-password') {
  await page.goto(`${BASE}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/(dashboard|start)/, { timeout: 20_000 });
}

const idFrom = (url) => url.match(/([0-9a-f-]{36})(?:[/?#]|$)/)?.[1];

// ── the people ────────────────────────────────────────────────────────────

const pi = await person('PI');
const student = await person('student');
const invitee = await person('invitee');
const outsider = await person('outsider');
const attacker = await person('attacker');

const piEmail = `pi-${stamp}@labquill.test`;
const studentEmail = `student-${stamp}@labquill.test`;
const inviteeEmail = `invitee-${stamp}@labquill.test`;
const outsiderEmail = `outsider-${stamp}@labquill.test`;
const ids = {};

console.log(`\nLabquill pipelines against ${BASE}\n`);
const fakesUp = await fetch(`${MODEL}/__log`).then(() => true, () => false);
if (!fakesUp) console.log('  (fakes not running: AI and email steps will fail. Start node e2e/fakes.mjs)\n');

// ── 1. public pages ───────────────────────────────────────────────────────

console.log('Public pages');
for (const path of ['/', '/pricing', '/privacy', '/terms', '/guide', '/login', '/signup', '/forgot-password']) {
  await step(`${path} renders`, async () => {
    const r = await pi.page.goto(BASE + path);
    assert(r.status() === 200, `status ${r.status()}`);
    assert((await bodyText(pi.page)).includes('Labquill'), 'brand name missing');
  });
}
await step('sign-up links the Terms and Privacy, and they say what the code does', async () => {
  await pi.page.goto(`${BASE}/signup`);
  for (const href of ['/terms', '/privacy']) {
    assert(await pi.page.locator(`a[href="${href}"]`).count(), `sign-up has no link to ${href}`);
  }
  await pi.page.goto(`${BASE}/terms`);
  const terms = await bodyText(pi.page);
  assert(terms.includes('renews automatically') && terms.includes('HIPAA'), 'terms miss renewal or regulated data');
  // Nothing named on this server, so the page must say so rather than invent one.
  assert(terms.includes('No contact address has been set up'), 'terms invented a contact');
  await pi.page.goto(`${BASE}/privacy`);
  const privacy = await bodyText(pi.page);
  assert(privacy.includes('Anthropic') && privacy.includes('PDF'), 'privacy does not say what the AI is sent');
  assert(!/never sent/i.test(privacy), 'privacy still promises files are never sent');
});
await step('tab icon is served and robots.txt keeps crawlers out of lab records', async () => {
  const html = await fetch(BASE + '/').then((r) => r.text());
  const icon = html.match(/<link rel="icon" href="([^"]+)"/)?.[1];
  assert(icon, 'no icon link on the home page');
  const r = await fetch(BASE + icon);
  assert(r.status === 200 && r.headers.get('content-type') === 'image/svg+xml', `icon ${r.status}`);
  const robots = await fetch(BASE + '/robots.txt').then((x) => x.text());
  assert(/Disallow: \/\n/.test(robots) && robots.includes('Allow: /pricing'), robots);
});
await step('the unused image optimizer is switched off (open Next 14 advisories)', async () => {
  const r = await fetch(`${BASE}/_next/image?url=%2Fguide%2Fcompare.jpg&w=64&q=75`);
  assert(r.status === 404, `optimizer answered ${r.status}`);
});
await step('security headers: no framing by other sites, no referrer leaks, no sniffing', async () => {
  for (const path of ['/', '/login', '/dashboard', '/api/version']) {
    const r = await fetch(BASE + path, { redirect: 'manual' });
    const h = Object.fromEntries(r.headers);
    assert(h['x-frame-options'] === 'SAMEORIGIN', `${path}: x-frame-options ${h['x-frame-options']}`);
    assert(/frame-ancestors 'self'/.test(h['content-security-policy'] ?? ''), `${path}: no frame-ancestors`);
    assert(h['x-content-type-options'] === 'nosniff', `${path}: no nosniff`);
    assert(h['referrer-policy'] === 'strict-origin-when-cross-origin', `${path}: referrer-policy ${h['referrer-policy']}`);
    assert(!h['x-powered-by'], `${path}: still says x-powered-by`);
  }
});
await step('signed-out visitor is sent to log in', async () => {
  await pi.page.goto(`${BASE}/dashboard`);
  assert(pi.page.url().includes('/login'), `ended at ${pi.page.url()}`);
});
await step('unknown address shows a 404 page, not a crash', async () => {
  const r = await pi.page.goto(`${BASE}/no-such-page-${stamp}`);
  assert(r.status() === 404, `status ${r.status()}`);
});

// ── 2. sign up, log in, reset password ─────────────────────────────────────

console.log('\nAccounts');
await step('sign-up refuses a short password', async () => {
  await signUp(pi.page, { name: 'Dr Pat Investigator', email: piEmail, password: 'short', lab: 'Pipeline Lab' });
  // minLength stops the browser submitting; the page must not move on.
  await pi.page.waitForTimeout(500);
  assert(pi.page.url().includes('/signup'), 'short password was accepted');
});
await step('sign-up refuses an account that did not agree to the Terms, even past the browser', async () => {
  await pi.page.goto(`${BASE}/signup`);
  await pi.page.fill('#name', 'Dr Pat Investigator');
  await pi.page.fill('#email', `noagree-${stamp}@labquill.test`);
  await pi.page.fill('#password', 'a-very-long-password');
  await pi.page.fill('#workspaceName', 'No Agreement Lab');
  // Strip the browser's own check, as a script would, to reach the server.
  await pi.page.evaluate(() => document.getElementById('agreeTerms')?.removeAttribute('required'));
  await pi.page.click('button[type=submit]');
  await expectText(pi.page, 'Tick the box to agree');
  assert(pi.page.url().includes('/signup'), 'an account was made without agreement');
});
await step('sign-up refuses a disposable address', async () => {
  await signUp(pi.page, { name: 'Dr Pat Investigator', email: `x${stamp}@mailinator.com`, lab: 'Pipeline Lab' });
  await expectText(pi.page, 'permanent address');
});
await step('sign-up creates the lab and lands on the dashboard', async () => {
  await clearFake(MAIL);
  await signUp(pi.page, { name: 'Dr Pat Investigator', email: piEmail, lab: 'Pipeline Lab' });
  await pi.page.waitForURL('**/dashboard', { timeout: 20_000 });
  const text = await bodyText(pi.page);
  assert(text.includes('Pipeline Lab'), 'lab name not shown');
  // New labs get an example project; the demo lab's own records must not show.
  assert(!text.includes('Demo Environmental') && !text.includes('Baseline GAC column'), 'LEAK: another lab’s records are visible');
});
await step('welcome email is sent on sign-up', async () => {
  const email = await waitForEmail(piEmail);
  assert(/welcome|labquill/i.test(email.subject), `subject: ${email.subject}`);
});
await step('the same address cannot sign up twice', async () => {
  await outsider.page.goto(BASE);
  await signUp(outsider.page, { name: 'Copy', email: piEmail, lab: 'Copy Lab' });
  await expectText(outsider.page, 'already exists');
});
await step('log out, wrong password refused, right password accepted', async () => {
  await pi.page.goto(`${BASE}/settings`);
  await pi.page.getByRole('button', { name: /^(Log out|Sign out)$/ }).first().click();
  await pi.page.waitForURL(/\/(login|$)/, { timeout: 10_000 });
  await pi.page.goto(`${BASE}/dashboard`);
  assert(pi.page.url().includes('/login'), 'still signed in after logging out');
  await pi.page.fill('#email', piEmail);
  await pi.page.fill('#password', 'not-the-password-at-all');
  await pi.page.click('button[type=submit]');
  await expectText(pi.page, 'ncorrect');
  await logIn(pi.page, piEmail);
});
await step('forgot password emails a working reset link', async () => {
  await clearFake(MAIL);
  await outsider.page.goto(`${BASE}/forgot-password`);
  await outsider.page.fill('#email', piEmail);
  await outsider.page.click('button[type=submit]');
  await expectText(outsider.page, 'email');
  const email = await waitForEmail(piEmail);
  const link = linkIn(email.text, '/reset-password');
  await outsider.page.goto(link);
  await outsider.page.fill('#password', 'a-brand-new-password');
  await outsider.page.click('button[type=submit]');
  await expectText(outsider.page, 'Password updated');
  // The old password must stop working and the new one must work.
  const check = await person('reset-check');
  await check.page.goto(`${BASE}/login`);
  await check.page.fill('#email', piEmail);
  await check.page.fill('#password', 'a-very-long-password');
  await check.page.click('button[type=submit]');
  await expectText(check.page, 'ncorrect');
  await logIn(check.page, piEmail, 'a-brand-new-password');
  await check.context.close();
  // The link is single use.
  await outsider.page.context().clearCookies();
  await outsider.page.goto(link);
  await outsider.page.fill('#password', 'yet-another-password-1');
  await outsider.page.click('button[type=submit]');
  await expectText(outsider.page, /expired|invalid|used|no longer/i);
});
await step('the PI is still signed in after resetting from another browser, or is sent to log in', async () => {
  await pi.page.goto(`${BASE}/dashboard`);
  if (pi.page.url().includes('/login')) await logIn(pi.page, piEmail, 'a-brand-new-password');
});
await step('forgot password says the same thing for unknown and known addresses (no account probing)', async () => {
  const said = [];
  for (const address of [`nobody-${stamp}@labquill.test`, piEmail]) {
    await outsider.page.goto(`${BASE}/forgot-password`);
    await outsider.page.fill('#email', address);
    await outsider.page.click('button[type=submit]');
    await expectText(outsider.page, 'If an account exists');
    said.push((await outsider.page.locator('[role=status], form p').allTextContents()).join(' '));
  }
  assert(said[0] === said[1], `different replies:\n${said.join('\n')}`);
});

// ── 2b. Google sign-in ─────────────────────────────────────────────────────

/**
 * Runs Google sign-in against the stand-in: the redirect to Google is caught,
 * and the callback is called with a code the fake turns into that address.
 */
async function googleSignIn(page, email, { forgeState = false } = {}) {
  await page.route('https://accounts.google.com/**', (r) => r.fulfill({ status: 200, body: 'google' }));
  const toGoogle = page.waitForRequest(/accounts\.google\.com/);
  await page.goto(`${BASE}/api/auth/google`);
  const state = forgeState ? 'forged-state' : new URL((await toGoogle).url()).searchParams.get('state');
  await page.goto(`${BASE}/api/auth/google/callback?code=${encodeURIComponent(email)}&state=${state}`);
}

console.log('\nGoogle sign-in');
const probe = await person('probe');
const googleUp = await probe.page.goto(`${BASE}/login`).then(() => probe.page.getByText('Continue with Google').count());
await probe.context.close();
if (!googleUp) console.log('  (Google sign-in not configured on the server: skipped)');
else {
  const victimEmail = `victim-${stamp}@labquill.test`;
  await step('a new person signs in with Google and gets a lab of their own', async () => {
    const g = await person('google');
    await googleSignIn(g.page, `newgoogle-${stamp}@labquill.test`);
    await g.page.waitForURL('**/dashboard', { timeout: 20_000 });
    await expectText(g.page, `newgoogle-${stamp}`);
    await g.context.close();
  });
  await step('a forged sign-in state is refused', async () => {
    const g = await person('forged');
    await googleSignIn(g.page, `newgoogle-${stamp}@labquill.test`, { forgeState: true });
    assert(g.page.url().includes('/login?error=google_state'), `ended at ${g.page.url()}`);
    await g.context.close();
  });
  await step('someone who registered another person’s address loses access when the real owner signs in with Google', async () => {
    const squatter = await person('squatter');
    await signUp(squatter.page, { name: 'Squatter', email: victimEmail, password: 'squatter-password-1', lab: 'Squatter Lab' });
    await squatter.page.waitForURL('**/dashboard', { timeout: 20_000 });
    const victim = await person('victim');
    await googleSignIn(victim.page, victimEmail);
    await victim.page.waitForURL('**/dashboard', { timeout: 20_000 });
    // The squatter's session ended and their password no longer works.
    await squatter.page.goto(`${BASE}/dashboard`);
    assert(squatter.page.url().includes('/login'), 'SECURITY: the squatter is still signed in');
    await squatter.page.fill('#email', victimEmail);
    await squatter.page.fill('#password', 'squatter-password-1');
    await squatter.page.click('button[type=submit]');
    await expectText(squatter.page, 'ncorrect');
    await squatter.context.close();
    await victim.context.close();
  });
}

// ── 3. lab records: projects, protocols, experiments ──────────────────────

const csv = Buffer.from('time_min,absorbance\n0,0.01\n5,0.12\n10,0.25\n15,0.31\n20,0.44\n');
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const file = (name, mimeType, buffer) => ({ name, mimeType, buffer });

console.log('\nProjects, protocols, experiments');
const P = pi.page;
await step('create a project', async () => {
  await P.goto(`${BASE}/projects/new`);
  await P.fill('#name', 'Tensiometer Surface Study');
  await P.fill('#researchQuestion', 'Does the soil extract lower surface tension?');
  await P.fill('#tags', 'surface tension, soil');
  await P.getByRole('button', { name: 'Create project' }).click();
  await P.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  ids.project = idFrom(P.url());
  await expectText(P, 'Tensiometer Surface Study');
});
await step('edit the project', async () => {
  await P.goto(`${BASE}/projects/${ids.project}/edit`);
  await P.fill('#description', 'Field samples from three sites.');
  await P.getByRole('button', { name: 'Save changes' }).click();
  await P.waitForURL(new RegExp(`/projects/${ids.project}$`), { timeout: 20_000 });
  await expectText(P, 'Field samples from three sites.');
});
await step('upload into a project folder', async () => {
  await P.goto(`${BASE}/projects/${ids.project}`);
  await P.fill('#project-folder', 'Raw data');
  await P.locator('input[aria-label="Choose files to upload"]').setInputFiles(file('site-a.csv', 'text/csv', csv));
  await expectText(P, 'Added to');
  await P.reload();
  await expectText(P, 'site-a.csv');
  await expectText(P, 'Raw data');
});
await step('create a protocol with its Word/PDF file', async () => {
  await P.goto(`${BASE}/protocols/new`);
  await P.fill('#name', 'Du Noüy Ring Tensiometry');
  await P.fill('#description', 'Ring method for surface tension');
  await P.selectOption('#projectId', ids.project);
  await P.setInputFiles('#protocolFile', file('ring-method.pdf', 'application/pdf', pdf));
  await P.fill('#body', '1. Flame the ring.\n2. Zero the balance.\n3. Read three times.');
  await P.getByRole('button', { name: 'Create protocol' }).click();
  await P.waitForURL(/\/protocols\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  ids.protocol = idFrom(P.url());
  await expectText(P, 'Open ring-method.pdf');
});
await step('the protocol file downloads', async () => {
  const href = await P.getByRole('link', { name: 'Open ring-method.pdf' }).getAttribute('href');
  const r = await browserFetch(P, href);
  assert(r.status === 200, `status ${r.status}`);
  assert(r.head.startsWith('%PDF'), 'not the uploaded PDF');
});
await step('add a photo to the protocol folder', async () => {
  await P.locator('input[aria-label="Choose files to upload"]').setInputFiles(file('ring-setup.png', 'image/png', png));
  await expectText(P, 'Added to');
  await P.reload();
  await expectText(P, 'ring-setup.png');
});
await step('save a new protocol version', async () => {
  await P.fill('#changeNote', 'Read five times, not three');
  await P.fill('#body', '1. Flame the ring.\n2. Zero the balance.\n3. Read five times.');
  await P.getByRole('button', { name: 'Save new version' }).click();
  await expectText(P, 'Saved as v2');
  await expectText(P, 'Read five times, not three');
  // The next version starts from this one, not from an empty box.
  assert((await P.inputValue('#body')).includes('Read five times'), 'the method box did not start from the current version');
  // The protocol's Word/PDF carries over unless a new one is chosen.
  assert((await P.getByRole('link', { name: 'Open ring-method.pdf' }).count()) >= 1, 'the protocol file was dropped from the new version');
});
await step('upload a revised protocol file straight into a new version', async () => {
  await P.fill('#changeNote', 'Revised SOP from the department');
  await P.setInputFiles('#protocolFile', file('ring-method-rev2.pdf', 'application/pdf', pdf));
  await P.getByRole('button', { name: 'Save new version' }).click();
  await expectText(P, 'Saved as v3');
  await expectText(P, 'Open ring-method-rev2.pdf');
  // The dropdown now offers the new file as the current one.
  const chosen = await P.locator('#fileId option:checked').textContent();
  assert(chosen.includes('ring-method-rev2.pdf'), `current file shown as ${chosen}`);
});
await step('record an experiment with conditions and a protocol', async () => {
  await P.goto(`${BASE}/projects/${ids.project}/experiments/new`);
  await P.fill('#title', 'Extract batch 1 at 25 C');
  await P.fill('#performedOn', '2026-10-20');
  await P.selectOption('#status', 'completed');
  await P.fill('#objective', 'Baseline surface tension of batch 1.');
  await P.selectOption('#protocolVersionId', { index: 1 });
  await P.locator('input[name=conditionName]').nth(0).fill('Temperature');
  await P.locator('input[name=conditionValue]').nth(0).fill('25');
  await P.locator('input[name=conditionUnit]').nth(0).fill('°C');
  await P.fill('#dataLocation', 'Lab PC D:\\Tensiometer\\2026-10-20');
  await P.fill('#notes', 'Ring flamed between readings.');
  await P.getByRole('button', { name: 'Save experiment' }).click();
  await P.waitForURL(/\/experiments\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  ids.experiment = idFrom(P.url());
  // The URL changes before the record has streamed in; wait for it.
  for (const want of ['Extract batch 1 at 25 C', 'Temperature', 'Du Noüy Ring Tensiometry', 'D:\\Tensiometer']) {
    await expectText(P, want);
  }
});
await step('upload a CSV to the experiment and get a dataset', async () => {
  await P.setInputFiles(`#upload-${ids.experiment}`, file('run1.csv', 'text/csv', csv));
  const link = P.locator('a[href^="/datasets/"]').first();
  for (let i = 0; i < 10 && !(await link.count()); i++) {
    await P.waitForTimeout(1000);
    await P.reload();
  }
  ids.dataset = idFrom(await link.getAttribute('href'));
  await P.goto(`${BASE}/datasets/${ids.dataset}`);
  await expectText(P, 'absorbance');
});
await step('upload an image and a PDF to the experiment', async () => {
  await P.goto(`${BASE}/experiments/${ids.experiment}`);
  await P.setInputFiles(`#upload-${ids.experiment}`, [file('cuvette.png', 'image/png', png), file('notes.pdf', 'application/pdf', pdf)]);
  await expectText(P, 'notes.pdf', 20_000);
  await P.reload();
  await expectText(P, 'cuvette.png');
});
await step('refuse an executable upload', async () => {
  await P.setInputFiles(`#upload-${ids.experiment}`, file('virus.exe', 'application/x-msdownload', Buffer.from('MZ')));
  await expectText(P, 'virus.exe');
  await P.waitForTimeout(1500);
  // The refusal itself (415) is the expected outcome, not a console fault.
  stepErrors = stepErrors.filter((e) => !e.includes('status of 415'));
  await P.reload();
  assert(!(await P.locator('main a', { hasText: 'virus.exe' }).count()), 'an .exe was accepted');
});
await step('attach a link, add a note, change status, post a message', async () => {
  await P.fill('#link-url', 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit');
  await P.fill('#link-label', 'Raw readings sheet');
  await P.getByRole('button', { name: 'Attach link' }).click();
  await expectText(P, 'Raw readings sheet');
  await P.fill('#note-body', 'Reading 4 looked low, bubble on the ring.');
  await P.getByRole('button', { name: 'Add note' }).click();
  await expectText(P, 'bubble on the ring');
  await P.selectOption('#status-change', 'needs_investigation');
  await P.getByRole('button', { name: 'Update' }).click();
  await expectText(P, 'Needs investigation');
  await P.fill('#new-message', 'Can someone repeat this tomorrow?');
  await P.getByRole('button', { name: 'Post message' }).click();
  await expectText(P, 'repeat this tomorrow');
});
await step('edit the experiment', async () => {
  await P.goto(`${BASE}/experiments/${ids.experiment}/edit`);
  await P.fill('#nextSteps', 'Repeat with batch 2.');
  await P.getByRole('button', { name: /Save/ }).last().click();
  await P.waitForURL(new RegExp(`/experiments/${ids.experiment}$`), { timeout: 20_000 });
  await expectText(P, 'Repeat with batch 2.');
  assert((await bodyText(P)).includes('Raw readings sheet'), 'editing dropped the attached link');
});
await step('run it again (a repeat)', async () => {
  const again = P.getByRole('link', { name: /Run (it )?again|Repeat/i }).first();
  await again.click();
  await P.waitForURL(/experiments\/new/, { timeout: 15_000 });
  assert((await P.inputValue('#title')).length > 0, 'repeat did not prefill the title');
  await P.fill('#title', 'Extract batch 1 at 25 C, repeat');
  await P.getByRole('button', { name: 'Save experiment' }).click();
  await P.waitForURL(/\/experiments\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  ids.repeat = idFrom(P.url());
  await expectText(P, 'Temperature');
});
await step('AI fills the experiment form from a description', async () => {
  await clearFake(MODEL);
  await P.goto(`${BASE}/projects/${ids.project}/experiments/new`);
  await P.locator('form textarea').first().fill('Ran batch 3 at 25 C today with the ring method, data on the lab PC.');
  await P.getByRole('button', { name: 'Fill in the form' }).click();
  await P.waitForFunction(() => document.querySelector('#title')?.value?.length > 0, null, { timeout: 20_000 });
  const sent = (await fakeLog(MODEL)).at(-1);
  assert(sent?.body?.output_config?.format?.type === 'json_schema', 'fill did not use structured output');
  assert(sent.headers['x-api-key'] === 'sk-ant-fake', 'API key not sent');
});
await step('AI analysis of an experiment', async () => {
  await P.goto(`${BASE}/experiments/${ids.experiment}/analysis`);
  await P.getByRole('button', { name: 'Analyse with LabBot' }).click();
  await expectText(P, 'Fake summary', 30_000);
});
await step('AI analysis reports a model outage honestly', async () => {
  await fetch(`${MODEL}/__fail-next`, { method: 'POST' });
  await P.goto(`${BASE}/experiments/${ids.experiment}/analysis`);
  await P.getByRole('button', { name: 'Analyse with LabBot' }).click();
  await expectText(P, 'No analysis was generated', 30_000);
});
await step('AI analysis reports a refusal honestly', async () => {
  await fetch(`${MODEL}/__refuse-next`, { method: 'POST' });
  await P.reload();
  await P.getByRole('button', { name: 'Analyse with LabBot' }).click();
  await expectText(P, 'declined', 30_000);
});
await step('a Google Sheet becomes the run\'s data, and Refresh brings in what changed', async () => {
  const sheet = { id: 'fakeSheetId123456', name: 'Plate readings', mimeType: 'application/vnd.google-apps.spreadsheet' };
  const linked = await P.evaluate(
    async (body) => (await fetch('/api/drive/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(),
    { accessToken: 'fake-token', experimentId: ids.experiment, sheet },
  );
  assert(linked.fileId && linked.datasetId, `link: ${JSON.stringify(linked)}`);
  await P.goto(`${BASE}/datasets/${linked.datasetId}`);
  const before = await bodyText(P);
  await P.goto(`${BASE}/experiments/${ids.experiment}`);
  await expectText(P, 'Plate readings.xlsx');
  await expectText(P, 'Refresh from Google Sheets');
  const refreshed = await P.evaluate(
    async (body) => (await fetch('/api/drive/sheets/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(),
    { accessToken: 'fake-token', fileId: linked.fileId },
  );
  assert(refreshed.datasets === 1, `refresh: ${JSON.stringify(refreshed)}`);
  await P.goto(`${BASE}/datasets/${linked.datasetId}`);
  const after = await bodyText(P);
  assert(before !== after, 'the dataset did not change after refreshing');
  // Someone Google will not let read the Sheet is told why, not given a stale copy.
  const denied = await P.evaluate(
    async (body) => {
      const r = await fetch('/api/drive/sheets/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return { status: r.status, ...(await r.json()) };
    },
    { accessToken: 'denied', fileId: linked.fileId },
  );
  assert(denied.status === 502 && /link it yourself/.test(denied.error), JSON.stringify(denied));
  // Only Sheets can be linked as data.
  const wrong = await P.evaluate(
    async (body) => (await fetch('/api/drive/sheets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(),
    { accessToken: 'fake-token', experimentId: ids.experiment, sheet: { ...sheet, mimeType: 'application/pdf' } },
  );
  assert(/Pick a Google Sheet/.test(wrong.error ?? ''), JSON.stringify(wrong));
  // The refusal and the wrong file type above were asked for.
  stepErrors = stepErrors.filter((e) => !/sheets\/refresh|status of 502|status of 400/.test(e));
});
await step('ask the project assistant', async () => {
  await P.goto(`${BASE}/projects/${ids.project}/assistant`);
  await P.fill('#question', 'What have we learned about batch 1?');
  await P.getByRole('button', { name: 'Ask', exact: true }).click();
  await expectText(P, 'Fake answer', 30_000);
});
await step('project subpages render', async () => {
  for (const sub of ['', '/timeline', '/memory', '/samples', '/updates', '/literature', '/discussion']) {
    const r = await P.goto(`${BASE}/projects/${ids.project}${sub}`);
    assert(!r || r.status() === 200, `${sub || '/'} status ${r?.status()}`);
  }
  const r = await P.goto(`${BASE}/projects/${ids.project}/compare?ids=${ids.experiment},${ids.repeat}`);
  assert(!r || r.status() === 200, `compare status ${r?.status()}`);
  await expectText(P, 'Differences');
});


// ── 4. daily work: samples, inventory, tasks, calendar, chat, files, docs ──

console.log('\nDaily work');
await step('create a sample and see it on the project', async () => {
  await P.goto(`${BASE}/samples/new`);
  await P.fill('#code', 'SITE-A-01');
  await P.fill('#description', 'Topsoil extract, site A');
  await P.selectOption('#projectId', ids.project);
  await P.getByRole('button', { name: 'Create sample' }).click();
  await P.waitForURL(/\/samples\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  ids.sample = idFrom(P.url());
  await P.goto(`${BASE}/projects/${ids.project}/samples`);
  await expectText(P, 'SITE-A-01');
});
await step('add an inventory item', async () => {
  await P.goto(`${BASE}/inventory/new`);
  await P.fill('#name', 'Platinum ring, 6 cm');
  await P.fill('#supplier', 'Krüss');
  await P.fill('#unit', 'ring');
  await P.fill('#reorderAt', '1');
  await P.getByRole('button', { name: 'Add item' }).click();
  await P.waitForURL(/\/inventory\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  ids.item = idFrom(P.url());
  await expectText(P, 'Platinum ring, 6 cm');
});
await step('add a task for the whole lab, then tick it off', async () => {
  await P.goto(`${BASE}/tasks`);
  await P.fill('#task-title', 'Calibrate the tensiometer');
  await P.selectOption('#task-assignee', '__everyone__');
  await P.fill('#task-due', '2026-12-01');
  await P.selectOption('#task-project', ids.project);
  await P.getByRole('button', { name: 'Add task' }).click();
  await expectText(P, 'Calibrate the tensiometer');
  await P.getByRole('checkbox', { name: 'Mark "Calibrate the tensiometer" done' }).first().click();
  await P.getByRole('checkbox', { name: 'Reopen "Calibrate the tensiometer"' }).first().waitFor({ timeout: 10_000 });
  await P.waitForTimeout(1000);
  await P.reload();
  await expectText(P, 'Done · 1');
  const link = P.locator('a[href^="/tasks/"]', { hasText: 'Calibrate the tensiometer' }).first();
  ids.task = idFrom(await link.getAttribute('href'));
  const r = await P.goto(`${BASE}/tasks/${ids.task}`);
  assert(r.status() === 200, `task page status ${r.status()}`);
});
await step('add a calendar event and subscribe to the calendar feed', async () => {
  await P.goto(`${BASE}/calendar?d=2026-11-05`);
  await P.fill('#ev-title', 'Ring calibration meeting');
  await P.fill('#ev-date', '2026-11-05');
  await P.fill('#ev-time', '14:00');
  await P.getByRole('button', { name: 'Add', exact: true }).click();
  await expectText(P, 'Ring calibration meeting');
  await P.getByRole('button', { name: 'Get my calendar link' }).click();
  const feed = P.locator('[aria-label="Your private calendar address"]');
  await feed.waitFor({ timeout: 10_000 });
  const url = (await feed.inputValue().catch(() => null)) ?? (await feed.textContent());
  const path = url.replace(/^webcals?:\/\/[^/]+|^https?:\/\/[^/]+/, '');
  const ics = await fetch(BASE + path);
  assert(ics.status === 200, `feed status ${ics.status}`);
  const text = await ics.text();
  assert(text.includes('BEGIN:VCALENDAR') && text.includes('Ring calibration meeting'), 'feed has no event');
  assert(text.includes('Calibrate the tensiometer'), 'feed has no task deadline');
  ids.feed = path;
});
await step('a made-up calendar feed address is refused', async () => {
  const r = await fetch(`${BASE}/api/calendar/not-a-real-token`);
  assert(r.status === 404, `status ${r.status}`);
});
await step('post in #lab chat and attach a file', async () => {
  await P.goto(`${BASE}/chat`);
  await P.fill('#chat-box', 'Tensiometer is free after 3pm');
  await P.getByRole('button', { name: 'Send' }).click();
  await expectText(P, 'Tensiometer is free after 3pm');
  await P.locator('[aria-label="Choose files to attach"]').setInputFiles(file('plot.png', 'image/png', png));
  await expectText(P, 'plot.png', 15_000);
  await P.getByRole('button', { name: 'Send' }).click().catch(() => {});
  await P.reload();
  await expectText(P, 'Tensiometer is free after 3pm');
});
await step('upload to Files, then file it under the project', async () => {
  await P.goto(`${BASE}/files`);
  await P.locator('input[aria-label="Choose files to upload"]').setInputFiles(file('lab-safety.txt', 'text/plain', Buffer.from('Wear goggles.')));
  await expectText(P, 'Shared with the lab');
  await P.reload();
  const row = P.locator('li', { hasText: 'lab-safety.txt' }).first();
  await row.getByRole('button', { name: 'File under…' }).click();
  await row.locator('select[name=target]').selectOption(`project:${ids.project}`);
  await row.locator('input[name=folder]').fill('Metadata');
  await row.getByRole('button', { name: 'File it' }).click();
  await P.waitForTimeout(1500);
  await P.goto(`${BASE}/projects/${ids.project}`);
  await expectText(P, 'lab-safety.txt');
});
await step('write a document, export it as Word, email it', async () => {
  await clearFake(MAIL);
  await P.goto(`${BASE}/files`);
  await P.getByRole('button', { name: 'New document' }).click();
  await P.waitForURL(/\/docs\/[0-9a-f-]{36}/, { timeout: 15_000 });
  ids.doc = idFrom(P.url());
  const saved = P.waitForResponse((r) => r.url().includes(`/api/docs/${ids.doc}`) && r.request().method() !== 'GET', { timeout: 15_000 });
  await P.fill('#doc-title', 'Tensiometer SOP draft');
  await P.fill('#doc-body', '# Steps\n\n1. Flame the ring\n2. Zero the balance');
  assert((await saved).ok(), 'autosave failed');
  await P.waitForTimeout(2500);
  await P.reload();
  assert((await P.inputValue('#doc-title')) === 'Tensiometer SOP draft', 'title did not save');
  const docx = await browserFetch(P, `/api/docs/${ids.doc}/docx`);
  assert(docx.status === 200, `docx status ${docx.status}`);
  assert(docx.head.startsWith('PK'), 'export is not a Word file');
  await P.locator('fieldset input[type=checkbox]').first().check();
  await P.getByRole('button', { name: /^(Send|Email)/ }).last().click();
  await expectText(P, 'as a Word attachment', 15_000);
  const sent = await waitForEmail(piEmail);
  assert((sent.attachments ?? []).length === 1, 'no attachment on the email');
});
await step('AI suggests an edit to a document', async () => {
  await P.fill('#revise-instruction', 'Add a safety step');
  await P.getByRole('button', { name: 'Suggest an edit' }).click();
  await P.getByRole('button', { name: 'Accept' }).waitFor({ timeout: 30_000 });
  await P.getByRole('button', { name: 'Accept' }).click();
  await expectText(P, 'Saved', 15_000);
});
await step('generate a research update and export slides', async () => {
  await P.goto(`${BASE}/projects/${ids.project}/updates`);
  await P.locator('input[name=ids]').first().check();
  await P.getByRole('button', { name: 'Generate research update' }).click();
  await P.waitForURL(/\/updates\/[0-9a-f-]{36}/, { timeout: 30_000 });
  ids.update = idFrom(P.url());
  const pptx = await browserFetch(P, `/api/updates/${ids.update}/pptx`);
  assert(pptx.status === 200, `pptx status ${pptx.status}`);
  assert(pptx.head.startsWith('PK'), 'not a PowerPoint file');
});
await step('search finds records, files and messages', async () => {
  for (const q of ['Tensiometer', 'SITE-A-01', 'bubble']) {
    await P.goto(`${BASE}/search?q=${encodeURIComponent(q)}`);
    const text = await bodyText(P);
    assert(!/No results|Nothing found/i.test(text), `no results for ${q}`);
  }
});
await step('activity log shows what happened', async () => {
  await P.goto(`${BASE}/activity`);
  const text = await bodyText(P);
  for (const want of ['Tensiometer Surface Study', 'Extract batch 1 at 25 C']) assert(text.includes(want), `activity missing ${want}`);
});
await step('record check, overview and start-here pages', async () => {
  for (const path of ['/experiments/record-check', '/actions', '/dashboard', '/experiments', '/protocols', '/samples', '/inventory', '/updates', '/team', '/settings', '/billing', '/start']) {
    const r = await P.goto(BASE + path);
    assert(r.status() === 200, `${path} status ${r.status()}`);
  }
});
await step('catch-up briefing on Start here (AI)', async () => {
  await P.goto(`${BASE}/start`);
  await P.getByRole('button', { name: 'Catch me up' }).click();
  await expectText(P, 'Fake briefing', 30_000);
});
await step('LabBot panel answers a question (streaming)', async () => {
  await P.goto(`${BASE}/dashboard`);
  await P.getByRole('button', { name: 'Ask LabBot' }).click();
  await P.fill('#labbot-question', 'Where is the raw data for batch 1?');
  await P.locator('#labbot-panel').getByRole('button', { name: 'Send' }).click();
  await expectText(P, 'Fake LabBot answer', 30_000);
});

await step('every AI feature counts toward the month, and Settings says how much is used', async () => {
  await P.goto(`${BASE}/settings`);
  const line = await P.locator('[data-ai-usage]').innerText();
  const used = Number(/([\d,]+) of ([\d,]+) AI requests/.exec(line)?.[1]?.replace(/,/g, '') ?? -1);
  // Analysis three times, the assistant, catch-up, filling a run and LabBot all ran above.
  assert(used >= 6, `usage line: ${line}`);
});
await step("a lab's own Claude key: a bad one is refused, a good one is used and can be removed", async () => {
  await P.goto(`${BASE}/settings`);
  await P.fill('#lab-ai-key', 'sk-ant-bad-' + 'x'.repeat(40));
  await P.getByRole('button', { name: 'Check and save' }).click();
  await expectText(P, 'Anthropic rejected that key');
  const own = 'sk-ant-api03-pipeline-' + 'y'.repeat(30) + 'Q7z9';
  await P.fill('#lab-ai-key', own);
  await P.getByRole('button', { name: 'Check and save' }).click();
  await expectText(P, 'key ending Q7z9');
  await P.reload();
  assert(!(await P.content()).includes(own), 'the saved key is shown back on the page');
  await expectText(P, 'own Claude key ending');
  await clearFake(MODEL);
  await P.goto(`${BASE}/dashboard`);
  // The panel remembers it was open; only open it when it is not.
  if (!(await P.locator('#labbot-question').isVisible())) await P.getByRole('button', { name: 'Ask LabBot' }).click();
  await P.fill('#labbot-question', 'What did batch 1 show?');
  await P.locator('#labbot-panel').getByRole('button', { name: 'Send' }).click();
  await expectText(P, 'Fake LabBot answer', 30_000);
  const sent = (await fakeLog(MODEL)).filter((r) => r.url === '/v1/messages');
  assert(sent.length > 0 && sent.every((r) => r.headers['x-api-key'] === own), 'LabBot did not use the lab key');
  await P.goto(`${BASE}/settings`);
  await P.getByRole('button', { name: /Remove the key ending Q7z9/ }).click();
  await expectText(P, 'Removed.');
});


// ── 5. the team: join link, email invite, roles ───────────────────────────

console.log('\nTeam');
const S = student.page;
await step('PI creates a join link; a student signs up through it and lands in the lab', async () => {
  await P.goto(`${BASE}/team`);
  await P.getByRole('button', { name: 'Create a join link' }).click();
  const box = P.locator('[aria-label="Join link"]');
  await box.waitFor({ timeout: 10_000 });
  const url = (await box.inputValue().catch(() => null)) ?? (await box.textContent());
  ids.joinPath = url.replace(/^https?:\/\/[^/]+/, '');
  await S.goto(BASE + ids.joinPath);
  await expectText(S, 'Join Pipeline Lab');
  await S.fill('#name', 'Sam Student');
  await S.fill('#email', studentEmail);
  await S.fill('#password', 'a-very-long-password');
  await S.check('#agreeTerms');
  await S.click('button[type=submit]');
  await S.waitForURL(/\/start/, { timeout: 20_000 });
  await expectText(S, 'Pipeline Lab');
});
await step('the student sees the lab’s records', async () => {
  await S.goto(`${BASE}/experiments/${ids.experiment}`);
  await expectText(S, 'Extract batch 1 at 25 C');
  await S.goto(`${BASE}/protocols/${ids.protocol}`);
  await expectText(S, 'Du Noüy Ring Tensiometry');
});
await step('the student records an experiment of their own', async () => {
  await S.goto(`${BASE}/projects/${ids.project}/experiments/new`);
  await S.fill('#title', 'Batch 2, student run');
  await S.getByRole('button', { name: 'Save experiment' }).click();
  await S.waitForURL(/\/experiments\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  ids.studentExperiment = idFrom(S.url());
});
await step('a member cannot open owner-only pages or change roles', async () => {
  await S.goto(`${BASE}/owner`);
  const owner = await bodyText(S);
  assert(owner.includes(NOT_FOUND) && !owner.includes('Every workspace'), 'a member opened the owner dashboard');
  await S.goto(`${BASE}/team`);
  assert(!(await S.locator('select[name=role]').count()), 'a member sees role controls');
});
await step('invite by email; the invitee signs up from the emailed link', async () => {
  await clearFake(MAIL);
  await P.goto(`${BASE}/team`);
  await P.fill('#invite-email', inviteeEmail);
  await P.selectOption('#invite-role', 'member');
  await P.getByRole('button', { name: 'Send invite' }).click();
  const email = await waitForEmail(inviteeEmail);
  const link = linkIn(email.text, '/join');
  const I = invitee.page;
  await I.goto(link);
  await expectText(I, 'Pipeline Lab');
  await I.fill('#name', 'Ivy Invitee');
  if (await I.locator('#email').isEditable()) await I.fill('#email', inviteeEmail);
  await I.fill('#password', 'a-very-long-password');
  await I.check('#agreeTerms');
  await I.click('button[type=submit]');
  await I.waitForURL(/\/start/, { timeout: 20_000 });
});
await step('an invite link cannot be reused by someone else', async () => {
  const invite = (await fakeLog(MAIL)).map((e) => e.body).find((b) => (b.to ?? []).includes(inviteeEmail) && /\/join/.test(b.text ?? ''));
  assert(invite, 'invite email not found');
  const link = linkIn(invite.text, '/join');
  const x = await person('reuse');
  await x.page.goto(link);
  const text = await bodyText(x.page);
  assert(/expired|used|no longer|not valid|invalid/i.test(text) || !text.includes('Join Pipeline Lab'), 'a used invite still offers to join');
  await x.context.close();
});
await step('PI promotes the student to admin, then removes the invitee', async () => {
  await P.goto(`${BASE}/team`);
  const studentRow = P.locator('li, tr', { hasText: studentEmail }).first();
  await studentRow.locator('select[name=role]').selectOption('admin');
  await P.waitForTimeout(1500);
  await P.reload();
  assert((await P.locator('li, tr', { hasText: studentEmail }).first().locator('select[name=role]').inputValue()) === 'admin', 'role did not change');
  const inviteeRow = P.locator('li, tr', { hasText: inviteeEmail }).first();
  P.once('dialog', (d) => d.accept());
  await inviteeRow.getByRole('button', { name: 'Remove' }).click();
  await P.waitForTimeout(1500);
  await P.reload();
  assert(!(await bodyText(P)).includes(inviteeEmail), 'removed member still listed');
});
await step('the removed member loses access immediately', async () => {
  const I = invitee.page;
  await I.goto(`${BASE}/experiments/${ids.experiment}`);
  const text = await bodyText(I);
  assert(!text.includes('Extract batch 1 at 25 C'), 'LEAK: removed member can still read the lab’s records');
});

// ── 5b. error paths and deletions ─────────────────────────────────────────

console.log('\nErrors and deletions');
await step('an invite the email provider rejects says so instead of pretending', async () => {
  await P.goto(`${BASE}/team`);
  await P.fill('#invite-email', 'fail@labquill.test');
  await P.getByRole('button', { name: 'Send invite' }).click();
  await P.waitForTimeout(2500);
  const text = await bodyText(P);
  assert(/not sent|could not|refused|Resend|failed|link/i.test(text), 'no honest message when the invite email fails');
});
await step('a file over the size limit is refused with the limit named', async () => {
  await P.goto(`${BASE}/experiments/${ids.experiment}`);
  const big = Buffer.alloc(26 * 1024 * 1024, 65);
  await P.setInputFiles(`#upload-${ids.experiment}`, file('huge.csv', 'text/csv', big));
  await expectText(P, 'MB', 30_000);
  await P.reload();
  assert(!(await P.locator('main a', { hasText: 'huge.csv' }).count()), 'an oversized file was accepted');
  // The browser logs the expected 413 whenever it gets round to it; on a slow
  // machine that is after the message shows, so filter last.
  stepErrors = stepErrors.filter((e) => !/status of 413/.test(e));
});
await step('the student’s chat message reaches the PI', async () => {
  await S.goto(`${BASE}/chat`);
  await S.fill('#chat-box', 'Batch 2 is in the fridge');
  await S.getByRole('button', { name: 'Send' }).click();
  await expectText(S, 'Batch 2 is in the fridge');
  await P.goto(`${BASE}/chat`);
  await expectText(P, 'Batch 2 is in the fridge', 15_000);
});
await step('a sample still used by an experiment cannot be deleted silently', async () => {
  await P.goto(`${BASE}/samples/${ids.sample}`);
  P.once('dialog', (d) => d.accept());
  await P.getByRole('button', { name: 'Delete sample' }).click();
  await P.waitForTimeout(1500);
  // Either it is gone (nothing used it) or the page says why it stays.
  const text = await bodyText(P);
  assert(P.url().endsWith('/samples') || /in use|used by/i.test(text), `unexpected state at ${P.url()}`);
});
await step('delete an experiment', async () => {
  await P.goto(`${BASE}/experiments/${ids.studentExperiment ?? ids.repeat}`);
  P.once('dialog', (d) => d.accept());
  await P.getByRole('button', { name: 'Delete experiment' }).click();
  await P.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await P.goto(`${BASE}/experiments/${ids.studentExperiment ?? ids.repeat}`);
  await expectText(P, NOT_FOUND);
});

// ── 6. another lab must see nothing of this one ───────────────────────────

console.log('\nIsolation between labs');
const O = outsider.page;
await step('an outsider signs up with their own lab', async () => {
  await signUp(O, { name: 'Olive Outsider', email: outsiderEmail, lab: 'Other Lab' });
  await O.waitForURL('**/dashboard', { timeout: 20_000 });
});
await step('every page of the first lab is a 404 for the outsider', async () => {
  const leaks = [];
  const paths = [
    `/projects/${ids.project}`, `/projects/${ids.project}/edit`, `/projects/${ids.project}/timeline`,
    `/projects/${ids.project}/memory`, `/projects/${ids.project}/assistant`, `/projects/${ids.project}/updates`,
    `/projects/${ids.project}/samples`, `/projects/${ids.project}/compare?ids=${ids.experiment},${ids.repeat}`,
    `/experiments/${ids.experiment}`, `/experiments/${ids.experiment}/edit`, `/experiments/${ids.experiment}/analysis`,
    `/protocols/${ids.protocol}`, `/samples/${ids.sample}`, `/inventory/${ids.item}`, `/tasks/${ids.task}`,
    `/datasets/${ids.dataset}`, `/docs/${ids.doc}`, `/updates/${ids.update}`,
    `/projects/${ids.project}/experiments/new`,
  ];
  for (const path of paths) {
    if (path.includes('undefined')) continue;
    const r = await O.goto(BASE + path);
    const text = await bodyText(O);
    // The status can be 200 when the not-found page streams after the shell;
    // what matters is that nothing of the other lab is shown.
    const notFound = r.status() === 404 || text.includes('This page isn’t here');
    if (!notFound || /Tensiometer|Extract batch|SITE-A-01|Platinum ring/.test(text)) leaks.push(`${path} → ${r.status()}`);
  }
  assert(!leaks.length, `LEAKS:\n${leaks.join('\n')}`);
});
await step('the first lab’s files and APIs refuse the outsider', async () => {
  const leaks = [];
  const fileIds = await P.locator('a[href^="/api/files/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  await P.goto(`${BASE}/experiments/${ids.experiment}`);
  const more = await P.locator('a[href^="/api/files/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const probes = [
    ...new Set([...fileIds, ...more]).values(),
    `/api/docs/${ids.doc}`, `/api/docs/${ids.doc}/docx`, `/api/updates/${ids.update}/pptx`,
    `/api/experiments/${ids.experiment}/files`,
  ];
  for (const path of probes) {
    const r = await browserFetch(O, path);
    if (r.status < 400) leaks.push(`${path} → ${r.status}`);
  }
  const posts = [
    [`/api/docs/${ids.doc}`, 'PUT', { title: 'pwned', body: 'pwned' }],
    [`/api/docs/${ids.doc}/email`, 'POST', { to: [], note: '' }],
    [`/api/docs/${ids.doc}/revise`, 'POST', { instruction: 'x', body: 'x' }],
  ];
  for (const [path, method, body] of posts) {
    const r = await browserFetch(O, path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status < 400) leaks.push(`${method} ${path} → ${r.status}`);
  }
  assert(!leaks.length, `LEAKS:\n${leaks.join('\n')}`);
  // Refusals are the expected outcome here, not console faults.
  stepErrors = stepErrors.filter((e) => !/status of 4\d\d/.test(e));
  await P.goto(`${BASE}/docs/${ids.doc}`);
  assert((await P.inputValue('#doc-title')) !== 'pwned', 'LEAK: outsider overwrote the document');
});
await step('the outsider’s search and lists show nothing of the first lab', async () => {
  for (const path of ['/search?q=Tensiometer', '/experiments', '/protocols', '/files', '/samples', '/inventory', '/tasks', '/calendar?d=2026-11-05', '/chat', '/activity', '/updates']) {
    await O.goto(BASE + path);
    const text = (await bodyText(O)).replace(/Nothing matches “[^”]*”/, '');
    assert(!/Tensiometer|Extract batch|SITE-A-01|Platinum ring|Ring calibration|lab-safety/.test(text), `LEAK on ${path}`);
  }
});
await step('signed-out requests to the APIs are refused', async () => {
  for (const [path, method] of [['/api/files/00000000-0000-0000-0000-000000000000', 'GET'], ['/api/team/files', 'POST'], ['/api/chat', 'GET'], ['/api/labbot', 'POST'], ['/api/experiments/draft', 'POST'], ['/api/activity', 'GET'], [`/api/docs/${ids.doc}`, 'GET'], ['/api/docs', 'POST'], ['/api/drive/import', 'POST'], ['/api/labbot/email', 'POST']]) {
    const r = await fetch(BASE + path, { method, redirect: 'manual' });
    assert(r.status >= 300 && r.status !== 500, `${method} ${path} → ${r.status}`);
  }
});

// ── 7. the owner account ──────────────────────────────────────────────────

console.log('\nOwner account');
const A = attacker.page;
await step('registering the owner’s address with a password does not open the owner dashboard', async () => {
  await signUp(A, { name: 'Not The Owner', email: OWNER_EMAIL, lab: 'Squat Lab' });
  await A.waitForURL('**/dashboard', { timeout: 20_000 });
  await A.goto(`${BASE}/owner`);
  const text = await bodyText(A);
  assert(text.includes(NOT_FOUND) && !text.includes('Every workspace'), 'SECURITY: an unverified sign-up with the owner’s address opened the owner dashboard');
  await A.goto(`${BASE}/dashboard`);
  assert(!(await A.getByRole('link', { name: 'Owner' }).count()), 'the impostor is shown an Owner link');
});
await step('the real owner proves the inbox and then gets the owner dashboard', async () => {
  await clearFake(MAIL);
  await A.context().clearCookies();
  await A.goto(`${BASE}/forgot-password`);
  await A.fill('#email', OWNER_EMAIL);
  await A.click('button[type=submit]');
  await expectText(A, 'If an account exists');
  let email = null;
  for (let i = 0; i < 40 && !email; i++) {
    email = (await fakeLog(MAIL)).map((e) => e.body).filter((b) => (b.to ?? []).includes(OWNER_EMAIL) && /reset/i.test(b.subject)).at(-1) ?? null;
    if (!email) await A.waitForTimeout(250);
  }
  assert(email, 'no reset email reached the owner');
  await A.goto(linkIn(email.text, '/reset-password'));
  await A.fill('#password', 'the-owner-real-password');
  await A.click('button[type=submit]');
  await expectText(A, 'Password updated');
  await logIn(A, OWNER_EMAIL, 'the-owner-real-password');
  await A.goto(`${BASE}/owner`);
  const text = await bodyText(A);
  assert(!text.includes(NOT_FOUND), 'the verified owner cannot open the owner dashboard');
  assert(text.includes('Pipeline Lab') && text.includes('Other Lab'), 'owner dashboard does not list the labs');
  assert(!/Extract batch|Tensiometer Surface Study/.test(text), 'owner dashboard shows research content');
});

// ── 8. settings, a second lab, billing ────────────────────────────────────

console.log('\nSettings and billing');
await step('create a second lab and switch between labs', async () => {
  await P.goto(`${BASE}/settings`);
  await P.fill('#ws-name', 'Second Lab');
  await P.getByRole('button', { name: 'Create lab' }).click();
  await P.waitForURL('**/dashboard', { timeout: 20_000 });
  await expectText(P, 'Second Lab');
  // A link to a record in the PI's other lab must lead there, not to a
  // "this belongs to a lab you are not in" page: they are in it.
  await P.goto(`${BASE}/experiments/${ids.experiment}`);
  const text = await bodyText(P);
  assert(!text.includes(NOT_FOUND), 'a record in the PI’s other lab says it is not in a lab of theirs');
  if (text.includes('This is in Pipeline Lab')) {
    await P.getByRole('button', { name: 'Switch to Pipeline Lab' }).click();
    await P.waitForURL(new RegExp(`/experiments/${ids.experiment}$`), { timeout: 15_000 });
  }
  await expectText(P, 'Extract batch 1 at 25 C');
});
await step('a brand-new lab can record its first experiment (quick project form)', async () => {
  await P.goto(`${BASE}/experiments/new`);
  const quick = P.locator('form', { has: P.locator('input[name=then]') });
  if (await quick.count()) {
    await quick.locator('input[name=name]').fill('First study');
    await quick.locator('button[type=submit]').click();
    await P.waitForURL(/experiments\/new\?project=/, { timeout: 20_000 });
  }
  await P.fill('#title', 'First run in the second lab');
  await P.getByRole('button', { name: 'Save experiment' }).click();
  await P.waitForURL(/\/experiments\/[0-9a-f-]{36}$/, { timeout: 20_000 });
});
await step('pilot billing page takes feedback', async () => {
  await P.goto(`${BASE}/billing`);
  if (await P.locator('#would-pay').count()) {
    await P.selectOption('#would-pay', 'maybe');
    await P.fill('#monthly-value', '30');
    await P.fill('#blocker', 'Needs department sign-off');
    await P.getByRole('button', { name: 'Send' }).first().click();
    await expectText(P, /thank|got it|received/i);
  }
});
await step('PayPal webhook refuses unsigned events', async () => {
  const r = await fetch(`${BASE}/api/paypal/webhook`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  // 400 with PayPal configured; 503 "not configured" without it. Never 2xx.
  assert(r.status === 400 || r.status === 503, `status ${r.status}`);
});
await step('delete the second lab (typed confirmation)', async () => {
  await P.goto(`${BASE}/dashboard`);
  const switcher = P.locator('form', { has: P.locator('select[name=workspaceId]') }).and(P.locator(':visible')).first();
  await switcher.locator('select').selectOption({ label: 'Second Lab' });
  // Already on /dashboard, so the URL cannot tell the switch has happened;
  // wait for the action's response, then for the page to name the new lab.
  await Promise.all([
    P.waitForResponse((r) => r.request().method() === 'POST', { timeout: 15_000 }),
    switcher.getByRole('button', { name: 'Switch workspace' }).click(),
  ]);
  await P.waitForFunction(
    () => [...document.querySelectorAll('select[name=workspaceId]')].some((s) => s.selectedOptions[0]?.textContent === 'Second Lab'),
    null,
    { timeout: 15_000 },
  );
  await P.goto(`${BASE}/settings`);
  await P.fill('#confirm-lab', 'Second Lab');
  await P.getByRole('button', { name: 'Delete this lab' }).click();
  await P.waitForURL('**/dashboard', { timeout: 20_000 });
  assert(!(await bodyText(P)).includes('Second Lab'), 'deleted lab still shown');
});
await step('a member deletes their own account; the lab and its records stay', async () => {
  const x = await person('leaver');
  const email = `leaver-${stamp}@labquill.test`;
  await x.page.goto(BASE + ids.joinPath);
  await x.page.fill('#name', 'Lee Leaver');
  await x.page.fill('#email', email);
  await x.page.fill('#password', 'a-very-long-password');
  await x.page.check('#agreeTerms');
  await x.page.click('button[type=submit]');
  await x.page.waitForURL(/\/start/, { timeout: 20_000 });
  await x.page.goto(`${BASE}/settings`);
  await x.page.fill('#confirm-account', email);
  await x.page.getByRole('button', { name: 'Delete my account' }).click();
  await x.page.waitForURL(/account=deleted|\/$/, { timeout: 20_000 });
  await x.context.close();
  await P.goto(`${BASE}/experiments/${ids.experiment}`);
  await expectText(P, 'Extract batch 1 at 25 C');
});


// ── 9. every page, for each role, on a laptop and a phone ─────────────────

console.log('\nEvery page');
const everyPage = () => [
  '/dashboard', '/start', '/projects', '/projects/new', '/experiments', '/experiments/new', '/experiments/record-check',
  '/protocols', '/protocols/new', '/samples', '/samples/new', '/inventory', '/inventory/new', '/files', '/tasks',
  '/calendar', '/chat', '/updates', '/team', '/settings', '/activity', '/actions', '/search?q=batch', '/billing', '/guide',
  `/projects/${ids.project}`, `/projects/${ids.project}/edit`, `/projects/${ids.project}/timeline`, `/projects/${ids.project}/memory`,
  `/projects/${ids.project}/samples`, `/projects/${ids.project}/updates`, `/projects/${ids.project}/assistant`,
  `/projects/${ids.project}/experiments/new`, `/experiments/${ids.experiment}`, `/experiments/${ids.experiment}/edit`,
  `/experiments/${ids.experiment}/analysis`, `/protocols/${ids.protocol}`, `/inventory/${ids.item}`, `/tasks/${ids.task}`,
  `/datasets/${ids.dataset}`, `/docs/${ids.doc}`, `/updates/${ids.update}`,
].filter((p) => !p.includes('undefined'));

for (const [who, page] of [['PI', P], ['admin (the student)', S]]) {
  await step(`every page opens cleanly for the ${who}`, async () => {
    const broken = [];
    for (const path of everyPage()) {
      const r = await page.goto(BASE + path);
      const text = await bodyText(page);
      if ((r && r.status() >= 400) || text.includes(NOT_FOUND) || /Something went wrong|Application error/i.test(text)) {
        broken.push(`${path} → ${r?.status()}`);
      }
    }
    assert(!broken.length, broken.join('\n'));
  });
}
await step('every page passes an automated accessibility check (WCAG 2.1 AA), light and dark', async () => {
  // Universities buy to WCAG 2.1 AA, and an inaccessible site is a legal
  // risk as well as a lost user. axe catches what a machine can: contrast,
  // labels, names, structure. Embedded third-party frames are not ours to fix.
  const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
  const signedOut = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await signedOut.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
  const visitor = await signedOut.newPage();
  const found = [];
  for (const scheme of ['light', 'dark']) {
    for (const [page, paths] of [
      [visitor, ['/', '/pricing', '/terms', '/privacy', '/guide', '/signup', '/login', '/forgot-password']],
      [P, everyPage()],
    ]) {
      // Reduced motion: a fade-in caught half-way reads as low contrast, which
      // is the animation's timing, not the colours.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      for (const path of paths) {
        await page.goto(BASE + path);
        await page.addScriptTag({ content: axe });
        const violations = await page.evaluate(async () =>
          (await window.axe.run(document, { iframes: false, runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })).violations.map(
            (v) => `${v.id} x${v.nodes.length} (${v.nodes[0]?.target.join(' ')})`,
          ),
        );
        for (const v of violations) found.push(`${scheme} ${path}: ${v}`);
      }
    }
  }
  await signedOut.close();
  await P.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
  assert(!found.length, found.slice(0, 12).join('\n'));
});
await step('every page fits a phone screen without sideways scrolling', async () => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
  await phone.addCookies(await S.context().cookies());
  const page = await phone.newPage();
  page.on('pageerror', (e) => stepErrors.push(`[phone] pageerror: ${e.message}`));
  const wide = [];
  for (const path of everyPage()) {
    await page.goto(BASE + path);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 2) wide.push(`${path} (${over}px too wide)`);
  }
  await phone.close();
  assert(!wide.length, wide.join('\n'));
});

// @@SECTIONS@@

// ── summary ───────────────────────────────────────────────────────────────

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  ✗ ${f.name}`);
process.exit(failed.length ? 1 : 0);
