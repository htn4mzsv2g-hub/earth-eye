#!/usr/bin/env node
/**
 * Earth Eye sign-in QA (headless Chrome, emulated iPhone 390×844).
 *
 *   QA_LOGIN_USER=... QA_LOGIN_PASS=... node scripts/qa-login.mjs \
 *     --url http://127.0.0.1:8080 [--out screenshots/login] [--chrome /path]
 *
 * Credentials come from the environment only and are typed into the form;
 * they are never printed, and no screenshot shows them: the wrong-credentials
 * step uses a made-up username and password, the Show/Hide toggle is only
 * exercised with that made-up password, and nothing is captured while the
 * real credentials are in the form.
 *
 * Steps: / → Sign In tab; Create Account tab → submit → "Private beta is
 * currently closed."; wrong credentials → "Invalid credentials."; Show/Hide
 * toggle; real credentials → app with LOG OUT (MORE menu on phones); Terms
 * and Privacy pages; LOG OUT → back to the sign-in page, API locked again.
 * Checks: no WWW-Authenticate, no CSP violations or script errors on the
 * account pages, 16px+ inputs, 44px+ touch targets, no horizontal overflow.
 * Writes PNGs + login-report.json; exits 1 on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('url', 'http://127.0.0.1:8080').replace(/\/$/, '');
const OUT = arg('out', 'screenshots/login');
const CHROME = arg(
  'chrome',
  process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
);
const APP_WAIT_MS = Number(arg('app-wait', '10000'));
const USER = process.env.QA_LOGIN_USER || '';
const PASS = process.env.QA_LOGIN_PASS || '';
if (!USER || !PASS) {
  console.error('QA_LOGIN_USER and QA_LOGIN_PASS must be set');
  process.exit(2);
}
const WRONG_USER = 'not-a-user@example.com';
const WRONG_PASS = 'not-the-password-123';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = {
  base: BASE,
  startedAt: new Date().toISOString(),
  steps: {},
  failures: [],
};
const fail = (msg) => report.failures.push(msg);
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: [
    '--no-sandbox',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
try {
  const page = await browser.newPage();
  await page.setUserAgent(IPHONE_UA);
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const problems = [];
  let accountPages = true;
  page.on('console', (msg) => {
    const text = msg.text();
    const url = msg.location()?.url || '';
    // Expected: the closed-registration POST answers 403.
    if (/status of 403/.test(text) && /\/signup/.test(url)) return;
    if (
      accountPages &&
      (msg.type() === 'error' || /Content Security Policy/i.test(text))
    )
      problems.push(`console ${msg.type()}: ${text.slice(0, 200)} @ ${url}`);
  });
  page.on(
    'pageerror',
    (error) => accountPages && problems.push(`pageerror: ${error.message}`),
  );
  page.on('response', (res) => {
    if (res.headers()['www-authenticate'])
      fail(`WWW-Authenticate on ${res.url()}`);
  });

  const inspect = () =>
    page.evaluate(() => {
      const box = (el) => el && el.getBoundingClientRect();
      const visible = (el) =>
        el && !el.hidden && getComputedStyle(el).display !== 'none';
      const targets = [
        ...document.querySelectorAll('button, a, input:not([type=hidden])'),
      ]
        .filter(visible)
        .map((el) => ({
          what: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className ? `.${String(el.className).split(' ')[0]}` : ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}"`,
          h: Math.round(box(el).height),
          w: Math.round(box(el).width),
        }));
      const fonts = [
        ...document.querySelectorAll('input:not([type=hidden])'),
      ].map((el) => parseFloat(getComputedStyle(el).fontSize));
      const toggle = document.querySelector('[data-pw-toggle]');
      return {
        path: location.pathname + location.search,
        title: document.title,
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        minInputFont: fonts.length ? Math.min(...fonts) : null,
        smallTargets: targets.filter((t) => t.h < 44 || t.w < 44),
        activeTab:
          document
            .querySelector('.tab[aria-current=page]')
            ?.textContent.trim() || null,
        userLabel:
          document.querySelector('label[for=username]')?.textContent.trim() ||
          null,
        toggle: toggle && {
          visible: visible(toggle),
          pressed: toggle.getAttribute('aria-pressed'),
          label: toggle.getAttribute('aria-label'),
        },
        wordmark: Boolean(document.querySelector('.wordmark, .wordmark-text')),
        error: document.querySelector('.msg-error')?.textContent.trim() || '',
        notice: document.querySelector('.msg-notice')?.textContent.trim() || '',
        lede: document.querySelector('.lede')?.textContent.trim() || '',
      };
    });
  const checkLayout = (name, s) => {
    if (s.overflowX) fail(`${name}: horizontal overflow`);
    if (s.minInputFont !== null && s.minInputFont < 16)
      fail(`${name}: input font ${s.minInputFont}px < 16px`);
    if (s.smallTargets.length)
      fail(`${name}: touch targets < 44px: ${JSON.stringify(s.smallTargets)}`);
    if (!s.wordmark) fail(`${name}: wordmark missing`);
  };
  const submit = (selector = 'form.card button[type=submit]') =>
    Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click(selector),
    ]);

  // 1. Unauthenticated / → Sign In tab.
  const first = await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  const signin = await inspect();
  report.steps.signin = { status: first.status(), ...signin };
  if (!signin.path.startsWith('/login'))
    fail(`expected /login, got ${signin.path}`);
  if (signin.activeTab !== 'Sign In') fail('Sign In tab not active');
  if (signin.userLabel !== 'Email or username')
    fail(`username label "${signin.userLabel}"`);
  if (!signin.toggle?.visible || signin.toggle.pressed !== 'false')
    fail('Show/Hide toggle missing or wrong initial state');
  checkLayout('signin', signin);
  await page.screenshot({ path: path.join(OUT, '01-sign-in.png') });

  // 2. Create Account tab → submit → closed.
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('a.tab[href^="/signup"]'),
  ]);
  await page.type('#name', 'Test Person');
  await page.type('#email', 'test.person@example.com');
  await page.type('#new-password', 'made-up-password-1');
  await submit();
  const signup = await inspect();
  report.steps.signupClosed = signup;
  if (signup.activeTab !== 'Create Account')
    fail('Create Account tab not active');
  if (signup.error !== 'Private beta is currently closed.')
    fail(`signup message "${signup.error}"`);
  checkLayout('signup', signup);
  await page.screenshot({
    path: path.join(OUT, '02-create-account-closed.png'),
  });

  // 3. Wrong credentials (made-up username and password) + Show/Hide toggle.
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('a.tab[href^="/login"]'),
  ]);
  await page.type('#username', WRONG_USER);
  await page.type('#password', WRONG_PASS);
  await page.click('[data-pw-toggle="password"]');
  const shown = await page.$eval('#password', (el) => ({
    type: el.type,
    pressed: document
      .querySelector('[data-pw-toggle="password"]')
      .getAttribute('aria-pressed'),
    label: document
      .querySelector('[data-pw-toggle="password"]')
      .getAttribute('aria-label'),
  }));
  await page.click('[data-pw-toggle="password"]');
  const hidden = await page.$eval('#password', (el) => el.type);
  report.steps.toggle = { shown, hiddenAgain: hidden };
  if (
    shown.type !== 'text' ||
    shown.pressed !== 'true' ||
    shown.label !== 'Hide password' ||
    hidden !== 'password'
  )
    fail(`Show/Hide toggle misbehaves: ${JSON.stringify(report.steps.toggle)}`);
  await submit();
  const wrong = await inspect();
  report.steps.wrongCredentials = wrong;
  if (wrong.error !== 'Invalid credentials.')
    fail(`wrong-credentials message "${wrong.error}"`);
  checkLayout('wrong', wrong);
  await page.screenshot({ path: path.join(OUT, '03-invalid-credentials.png') });

  // 4. Terms and Privacy.
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('footer a[href="/terms"]'),
  ]);
  const terms = await inspect();
  report.steps.terms = terms;
  if (terms.lede !== 'Terms of Service: coming soon. Not yet published.')
    fail(`terms text "${terms.lede}"`);
  checkLayout('terms', terms);
  await page.screenshot({ path: path.join(OUT, '04-terms.png') });
  await page.goto(`${BASE}/privacy`, { waitUntil: 'networkidle0' });
  const privacy = await inspect();
  report.steps.privacy = { lede: privacy.lede, path: privacy.path };
  if (privacy.lede !== 'Privacy Policy: coming soon. Not yet published.')
    fail(`privacy text "${privacy.lede}"`);

  // 5. Real credentials (no screenshot while they are in the form).
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.type('#username', USER);
  await page.type('#password', PASS);
  report.problemsOnAccountPages = [...problems];
  if (problems.length)
    fail(`account page console/CSP problems: ${problems.join(' | ')}`);
  accountPages = false;
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('form.card button[type=submit]'),
  ]);
  await sleep(APP_WAIT_MS);
  const cookies = await page.cookies();
  const session = cookies.find((c) => c.name === 'ee_session');
  report.steps.signedIn = {
    path: await page.evaluate(() => location.pathname),
    title: await page.title(),
    cookie: session
      ? {
          httpOnly: session.httpOnly,
          secure: session.secure,
          sameSite: session.sameSite,
          path: session.path,
        }
      : null,
    apiStatus: await page.evaluate(
      async () => (await fetch('/api/cctv/sources')).status,
    ),
  };
  if (!session) fail('no ee_session cookie after sign-in');
  if (report.steps.signedIn.path.startsWith('/login'))
    fail('still on /login after correct credentials');
  if (report.steps.signedIn.apiStatus !== 200)
    fail(`/api/cctv/sources → ${report.steps.signedIn.apiStatus}`);
  await page.screenshot({ path: path.join(OUT, '05-signed-in.png') });
  // Phones: LOG OUT lives in the MORE menu.
  await page
    .waitForSelector('[data-ee-logout]', { timeout: 10_000 })
    .catch(() => null);
  const more = await page.$('[data-ee-more]');
  if (more) {
    await more.click();
    await sleep(600);
  }
  const logout = await page.evaluate(() => {
    const b = document.querySelector('[data-ee-logout]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return {
      text: b.textContent.trim(),
      visible:
        r.width > 0 &&
        r.height > 0 &&
        getComputedStyle(b).visibility !== 'hidden' &&
        r.bottom <= window.innerHeight &&
        r.top >= 0,
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });
  report.steps.logoutButton = logout;
  if (!logout?.visible)
    fail(`LOG OUT button not visible: ${JSON.stringify(logout)}`);
  else if (logout.h < 44 || logout.w < 44) fail('LOG OUT touch target < 44px');
  await page.screenshot({
    path: path.join(OUT, '06-signed-in-logout-button.png'),
  });

  // 6. LOG OUT → sign-in page; API locked again.
  if (logout?.visible) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('[data-ee-logout]'),
    ]);
    const after = await inspect();
    // The sign-in page's CSP blocks fetch(); check the API from a second tab.
    const probe = await browser.newPage();
    const api = (
      await probe.goto(`${BASE}/api/cctv/sources`, { waitUntil: 'load' })
    ).status();
    await probe.close();
    report.steps.loggedOut = { path: after.path, notice: after.notice, api };
    if (!after.path.startsWith('/login')) fail(`after logout at ${after.path}`);
    if (after.notice !== 'You have been signed out.')
      fail(`logout notice "${after.notice}"`);
    if (api !== 401) fail(`API after logout → ${api}`);
    await page.screenshot({ path: path.join(OUT, '07-signed-out.png') });
  }
} finally {
  await browser.close();
}
report.finishedAt = new Date().toISOString();
fs.writeFileSync(
  path.join(OUT, 'login-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    { failures: report.failures, steps: Object.keys(report.steps) },
    null,
    2,
  ),
);
process.exit(report.failures.length ? 1 : 0);
