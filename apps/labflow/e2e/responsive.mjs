/**
 * Checks every page at phone, tablet and laptop width against a running server.
 *
 *   npm run dev                       # in one shell
 *   npm run e2e:responsive            # in another
 *
 * It exists because sideways scrolling is invisible to the person who built
 * the page. You develop at 1400 pixels, everything looks right, and a lab
 * member opens the invitation on a phone to a page that slides under their
 * thumb. Three real instances of it have been found by running this, each a
 * child that refused to shrink below its own content.
 *
 * Signs up a fresh workspace each run, so it never touches existing data.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const CHROME = process.env.E2E_CHROMIUM;
const WIDTHS = [1366, 768, 390];
const stamp = Date.now();

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1366, height: 950 } });

const problems = [];
const consoleErrors = new Set();
page.on('pageerror', (e) => consoleErrors.add(String(e).slice(0, 140)));
page.on('response', (r) => {
  if (r.status() >= 500) consoleErrors.add(`${r.status()} ${r.url()}`);
});

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });
await page.fill('input[name="name"]', 'Responsive Check');
await page.fill('input[name="workspaceName"]', `Responsive Lab ${stamp}`);
await page.fill('input[name="email"]', `responsive-${stamp}@labflow.test`);
await page.fill('input[name="password"]', 'correct-horse-battery-1');
await page.getByRole('button', { name: 'Start a lab' }).click();
await page.waitForURL(/dashboard/, { timeout: 40000 });

// The seeded example gives the detail pages something real to lay out. An
// empty page cannot overflow, so checking one proves nothing.
const projectHrefs = await page
  .goto(`${BASE}/projects`, { waitUntil: 'networkidle' })
  .then(() =>
    page.locator('a[href^="/projects/"]').evaluateAll((links) =>
      links.map((l) => l.getAttribute('href')),
    ),
  );
const project = projectHrefs.find((h) => h.split('/')[2] !== 'new');
const experimentHrefs = await page
  .goto(BASE + project, { waitUntil: 'networkidle' })
  .then(() =>
    page.locator('a[href^="/experiments/"]').evaluateAll((links) =>
      links.map((l) => l.getAttribute('href')),
    ),
  );
const experiment = experimentHrefs.find((h) => h.split('/')[2] !== 'new');

const routes = [
  '/', '/pricing', '/privacy',
  '/dashboard', '/team', '/projects', '/experiments', '/actions', '/files',
  '/samples', '/inventory', '/protocols', '/updates', '/search', '/settings', '/billing',
  project,
  `${project}/compare`,
  `${project}/memory`,
  `${project}/literature`,
  `${project}/discussion`,
  `${project}/timeline`,
  `${project}/samples`,
  `${project}/updates`,
  `${project}/assistant`,
  experiment,
];

for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: 950 });
  for (const route of routes) {
    const response = await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch(() => null);
    const status = response?.status() ?? 0;
    if (status >= 400) {
      problems.push(`${width}px ${route} returned HTTP ${status}`);
      continue;
    }
    // A table or code block may scroll inside its own container; the document
    // itself may never be wider than the window.
    const spill = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (spill > 2) problems.push(`${width}px ${route} scrolls sideways by ${spill}px`);

    const text = await page.innerText('body').catch(() => '');
    if (/Application error|Unhandled Runtime|could not be found/i.test(text)) {
      problems.push(`${width}px ${route} rendered an error page`);
    }
  }
}

await browser.close();

console.log(`Swept ${routes.length} routes at ${WIDTHS.join(', ')} pixels.`);
if (consoleErrors.size > 0) {
  for (const e of consoleErrors) problems.push(`console: ${e}`);
}
if (problems.length > 0) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('No sideways scrolling, no error pages, no console errors.');
