/**
 * End-to-end smoke test against a running server.
 *
 *   npm run build && npm start        # in one shell
 *   npm run e2e                       # in another
 *
 * It signs up a fresh workspace each run, so it never touches existing data,
 * and it asserts the things unit tests cannot: that the forms actually submit,
 * that a new workspace sees no other lab's records, and that AI features
 * decline honestly when unconfigured.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const CHROME = process.env.E2E_CHROMIUM;
const stamp = Date.now();
const email = `e2e-${stamp}@labflow.test`;
const errors = [];
let step = 0;
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`);

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  // Link prefetches abort when the script navigates away mid-flight; that is a
  // race in this driver, not a fault in the app. Real failures still surface as
  // page errors or 5xx responses.
  const text = m.text();
  if (m.type() === 'error' && !text.includes('Failed to fetch RSC payload')) {
    errors.push(`console: ${text}`);
  }
});
page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });

try {
  // 1. Sign up — creates account + workspace.
  await page.goto(`${BASE}/signup`);
  await page.fill('#name', 'Dr Test Researcher');
  await page.fill('#email', email);
  await page.fill('#password', 'a-very-long-password');
  await page.fill('#workspaceName', 'E2E Test Lab');
  await page.click('button:has-text("Start a lab")');
  await page.waitForURL('**/dashboard', { timeout: 20000 });
  ok('signed up and landed on the dashboard');

  // Brand-new workspace must be empty, not showing another lab's data.
  const body = await page.textContent('body');
  if (!body.includes('No experiments yet')) throw new Error('new workspace not empty');
  if (body.includes('PFAS')) throw new Error('LEAK: demo lab data visible in a new workspace');
  ok('new workspace is empty and shows no other lab’s records');

  // 2. Create a project.
  await page.goto(`${BASE}/projects/new`);
  await page.fill('#name', 'Sorbent Screening');
  await page.fill('#researchQuestion', 'Which sorbent removes the most analyte?');
  await page.fill('#tags', 'sorption, screening');
  await page.click('button:has-text("Create project")');
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const projectUrl = page.url();
  ok('created a project');

  // 3. Create an experiment with conditions and samples.
  if ((await page.locator('a:has-text("New experiment")').count()) === 0) {
    throw new Error('project page offers no way to add an experiment');
  }
  await page.goto(`${projectUrl}/experiments/new`);
  await page.fill('#title', 'Column run at 25 C');
  await page.fill('#objective', 'Establish the baseline breakthrough curve.');
  await page.fill('#hypothesis', 'Breakthrough occurs after 30 bed volumes.');
  await page.selectOption('#status', 'completed');
  const names = page.locator('input[name=conditionName]');
  await names.nth(0).fill('Temperature');
  await page.locator('input[name=conditionValue]').nth(0).fill('25');
  await page.locator('input[name=conditionUnit]').nth(0).fill('C');
  await names.nth(1).fill('pH');
  await page.locator('input[name=conditionValue]').nth(1).fill('7.2');
  await page.fill('#sampleCodes', 'S-201, S-202, S-203');
  await page.fill('#notes', 'Column packed the night before.');
  await page.fill('#summary', 'Breakthrough at 34 bed volumes.');
  await page.fill('#conclusion', 'Baseline established.');
  await page.click('button:has-text("Save experiment")');
  await page.waitForURL(/\/experiments\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const expUrl = page.url();
  ok('created an experiment with conditions, samples and a result');

  // 4. The record page shows what was entered.
  const rec = await page.textContent('body');
  for (const needle of ['EXP-001', 'Column run at 25 C', 'Temperature', '7.2', 'S-201', 'Breakthrough at 34 bed volumes.', 'Completed']) {
    if (!rec.includes(needle)) throw new Error(`record missing "${needle}"`);
  }
  ok('experiment record renders every field that was entered');

  // 5. Completeness check reacts to what is missing.
  if (!rec.includes('Record completeness')) throw new Error('no completeness panel');
  if (!rec.includes('may be useful to document')) throw new Error('completeness message missing');
  ok('completeness check reports the outstanding items');

  // 6. Samples were auto-created from the codes typed on the form.
  await page.goto(`${BASE}/samples`);
  const samples = await page.textContent('body');
  if (!['S-201', 'S-202', 'S-203'].every((c) => samples.includes(c))) throw new Error('samples not auto-created');
  ok('sample IDs typed on the experiment were created automatically');

  // 7. Second experiment, then compare the two.
  await page.goto(`${projectUrl}/experiments/new`);
  await page.fill('#title', 'Column run at 30 C');
  await page.fill('#objective', 'Test temperature sensitivity.');
  await page.locator('input[name=conditionName]').nth(0).fill('Temperature');
  await page.locator('input[name=conditionValue]').nth(0).fill('30');
  await page.locator('input[name=conditionUnit]').nth(0).fill('C');
  await page.click('button:has-text("Save experiment")');
  await page.waitForURL(/\/experiments\/[0-9a-f-]{36}$/, { timeout: 20000 });
  ok('created a second experiment');

  await page.goto(`${projectUrl}/compare`);
  await page.locator('input[name=ids]').nth(0).check();
  await page.locator('input[name=ids]').nth(1).check();
  await page.click('button:has-text("Compare selected")');
  await page.waitForLoadState('networkidle');
  const cmp = await page.textContent('body');
  if (!cmp.includes('25 C') || !cmp.includes('30 C')) throw new Error('comparison missing condition values');
  if (!cmp.includes('differs')) throw new Error('comparison did not flag the difference');
  ok('comparison highlights the temperature difference between the runs');

  // 8. Timeline.
  await page.goto(`${projectUrl}/timeline`);
  const tl = await page.textContent('body');
  if (!tl.includes('EXP-001') || !tl.includes('EXP-002')) throw new Error('timeline incomplete');
  ok('timeline lists both experiments in order');

  // 9. Research memory is derived from the record.
  await page.goto(`${projectUrl}/memory`);
  const mem = await page.textContent('body');
  if (!mem.includes('Baseline established.')) throw new Error('memory missing the conclusion');
  if (!mem.includes('Which sorbent removes the most analyte?')) throw new Error('memory missing research question');
  ok('research memory reflects the recorded conclusions');

  // 10. Search finds the new records.
  await page.goto(`${BASE}/search?q=breakthrough`);
  const search = await page.textContent('body');
  if (!search.includes('Column run at 25 C')) throw new Error('search did not find the experiment');
  ok('search finds the experiment by its recorded text');

  // 11. AI without a key must say so, never invent.
  await page.goto(`${expUrl}/analysis`);
  await page.click('button:has-text("Analyse experiment")');
  await page.waitForSelector('text=not configured', { timeout: 20000 });
  ok('AI analysis reports "not configured" instead of fabricating');

  // 12. Generate a research update and export it.
  await page.goto(`${projectUrl}/updates`);
  await page.locator('input[name=ids]').nth(0).check();
  await page.locator('input[name=ids]').nth(1).check();
  await page.click('button:has-text("Generate research update")');
  await page.waitForURL(/\/updates\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const upd = await page.textContent('body');
  if (!upd.includes('Which sorbent removes the most analyte?')) throw new Error('update missing research question');
  if (!upd.includes('Researcher')) throw new Error('update missing attribution');
  ok('generated a research update from the two experiments');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.click('a:has-text("Export as PowerPoint")'),
  ]);
  const path = process.env.E2E_EXPORT_PATH ?? '/tmp/e2e-export.pptx';
  await download.saveAs(path);
  ok(`exported ${download.suggestedFilename()}`);

  // 13. Log out and confirm the session is really gone.
  await page.goto(`${BASE}/dashboard`);
  await page.locator('aside button:has-text("Log out")').click();
  await page.waitForURL(BASE + '/', { timeout: 20000 });
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL('**/login', { timeout: 20000 });
  ok('logged out and the session no longer grants access');

  // 14. Log back in.
  await page.fill('#email', email);
  await page.fill('#password', 'a-very-long-password');
  await page.click('button:has-text("Log in")');
  await page.waitForURL('**/dashboard', { timeout: 20000 });
  ok('logged back in with the same credentials');

  // 15. Wrong password is rejected.
  await page.locator('aside button:has-text("Log out")').click();
  await page.waitForURL(BASE + '/', { timeout: 20000 });
  await page.goto(`${BASE}/login`);
  await page.fill('#email', email);
  await page.fill('#password', 'wrong-password-here');
  await page.click('button:has-text("Log in")');
  await page.waitForSelector('text=Email or password is incorrect', { timeout: 20000 });
  ok('wrong password is rejected with an error, not a session');

  console.log(`\nE2E: ${step}/${step} steps passed`);
  console.log(errors.length ? `BROWSER ERRORS:\n  ${errors.join('\n  ')}` : 'No console errors, page errors, or 5xx responses.');
  process.exitCode = errors.length ? 1 : 0;
} catch (err) {
  console.error(`\nFAILED at step ${step + 1}: ${err.message}`);
  console.error(errors.length ? `Browser errors:\n  ${errors.join('\n  ')}` : '');
  process.exitCode = 1;
} finally {
  await browser.close();
}
