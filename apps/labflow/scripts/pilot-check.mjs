/**
 * Tells you whether your deployed pilot actually works.
 *
 *   npm run pilot:check https://your-service.onrender.com
 *
 * Deploying has a lot of small settings and every one of them fails quietly.
 * The site loads, everything looks fine, and you find out a week later that the
 * public address was wrong so nobody could sign in with Google, or that pilot
 * mode never turned on so the first professor you invited hit a paywall.
 *
 * This looks at the real site from the outside, the same way a visitor would,
 * and says in plain words what is working and what is not. It sends no
 * passwords, reads no secrets, and changes nothing.
 *
 * What it cannot see: anything behind a login. Whether the AI key works, and
 * whether uploads land on the disk, need an account, so those are checked by
 * hand and this says so rather than guessing.
 */

const base = (process.argv[2] ?? process.env.PILOT_URL ?? '').trim().replace(/\/$/, '');

if (!base) {
  console.error('\nTell me the address of your site:\n');
  console.error('  npm run pilot:check https://your-service.onrender.com\n');
  process.exit(2);
}
if (!/^https?:\/\//.test(base)) {
  console.error(`\n"${base}" is missing the https:// at the front.\n`);
  process.exit(2);
}

let broken = 0;
let unknown = 0;

const ok = (m) => console.log(`  WORKS    ${m}`);
const no = (m, fix) => {
  broken += 1;
  console.log(`  BROKEN   ${m}`);
  if (fix) console.log(`           ${fix}`);
};
const off = (m, fix) => {
  console.log(`  OFF      ${m}`);
  if (fix) console.log(`           ${fix}`);
};
const note = (m) => console.log(`           ${m}`);
const ask = (m) => {
  unknown += 1;
  console.log(`  BY HAND  ${m}`);
};

/** Never follows redirects: where a page sends you is half of what we check. */
async function get(path) {
  try {
    const res = await fetch(base + path, { redirect: 'manual' });
    const location = res.headers.get('location');
    // A body is only worth reading when the page actually rendered one.
    const body = res.status < 300 ? await res.text() : '';
    return { status: res.status, location, body };
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
}

console.log(`\nChecking ${base}\n`);

// ── Is it even up? ─────────────────────────────────────────────────────────
const home = await get('/');
if (home.error) {
  no(`Nothing answered at ${base}.`, `Check the address, and check Render says "Live". Error: ${home.error}`);
  console.log('\nNothing else can be checked until the site answers.\n');
  process.exit(1);
}
if (home.status >= 500) {
  no(`The site answered with an error (${home.status}).`, 'Open the Logs tab in Render. The last few lines say why.');
  console.log('\nNothing else can be checked until the site starts properly.\n');
  process.exit(1);
}
ok('The site is up and answering.');

// ── Is the public address right? ───────────────────────────────────────────
//
// This is the setting people get wrong most, and it is invisible from the
// outside until someone tries to sign in. The Google route builds its redirect
// from NEXT_PUBLIC_APP_URL, so whatever comes back names the value that is
// actually set on the server.
const google = await get('/api/auth/google');
let appUrl = null;

if (google.error) {
  no('Could not reach the sign-in route.', google.error);
} else if (google.location?.includes('accounts.google.com')) {
  const redirect = new URL(google.location).searchParams.get('redirect_uri') ?? '';
  appUrl = redirect.replace('/api/auth/google/callback', '');
  ok('Google sign-in is switched on.');

  if (appUrl === base) {
    ok(`The public address is set correctly to ${base}.`);
    // Only offered once the address is right. Handing over this line while
    // the address is wrong would have you paste the wrong thing into Google,
    // and then two settings are broken instead of one.
    console.log('');
    console.log('  Paste this into Google Cloud, under Authorised redirect URIs:');
    console.log(`    ${appUrl}/api/auth/google/callback`);
    console.log('');
  } else if (/0\.0\.0\.0|localhost|127\.0\.0\.1/.test(appUrl)) {
    no(
      `The public address is set to ${appUrl}, which is this server talking about itself.`,
      `Set NEXT_PUBLIC_APP_URL to ${base} in Render's Environment tab, then redeploy.`,
    );
    note('Fix that first. Run this again and it will give you the line to paste into Google.');
  } else {
    no(
      `The public address is set to ${appUrl}, but you are visiting ${base}.`,
      `Those have to match. Set NEXT_PUBLIC_APP_URL to ${base} in Render, then redeploy.`,
    );
    note('Fix that first. Run this again and it will give you the line to paste into Google.');
  }
} else if (google.location?.includes('google_unconfigured')) {
  off(
    'Google sign-in is not set up, so the button is hidden.',
    'Optional. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Render when you want it.',
  );
  ask('The public address could not be checked without Google sign-in. Sign in and see if the pages look right.');
} else {
  no(`The sign-in route did something unexpected (${google.status}).`, `It pointed at: ${google.location ?? 'nowhere'}`);
}

// ── Is the pilot actually free? ────────────────────────────────────────────
const pricing = await get('/pricing');
if (pricing.error || pricing.status >= 400) {
  no('The pricing page did not load.', pricing.error ?? `It answered ${pricing.status}.`);
} else if (pricing.body.includes('This is a free pilot')) {
  ok('Pilot mode is on. The pricing page tells visitors nothing is charged.');
} else {
  no(
    'Pilot mode is OFF. A lab you invite will be shown prices and asked to pay.',
    'Set LABFLOW_PILOT_MODE to 1 in Render\'s Environment tab, then redeploy.',
  );
}

const signup = await get('/signup');
if (signup.status < 400 && signup.body.includes('free pilot')) {
  ok('The signup page says the pilot is free, so nobody worries about a card.');
} else if (signup.status < 400) {
  no('The signup page does not mention the pilot.', 'Same fix: LABFLOW_PILOT_MODE set to 1, then redeploy.');
}

const login = await get('/login');
if (login.status < 400 && login.body.includes('Continue with Google')) {
  ok('The Google button is showing on the login page.');
}

// ── What only you can check ────────────────────────────────────────────────
console.log('');
ask('Sign in and ask LabBot a question. If it answers, the AI key works.');
ask('Drag a file into a lab channel, then redeploy, then check the file is still there. That proves the disk.');
ask('Open a private window, invite a second account, and chat between them. That is what a lab will do first.');

// ── The verdict ────────────────────────────────────────────────────────────
console.log('');
if (broken === 0) {
  console.log(`Nothing is broken. ${unknown} things need you to sign in and look.\n`);
  process.exit(0);
}
console.log(`${broken} thing${broken === 1 ? '' : 's'} to fix above, then run this again.\n`);
process.exit(1);
