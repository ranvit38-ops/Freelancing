/**
 * Stand-ins for the services Labquill talks to, so the end-to-end test drives
 * the real code paths without real keys, real money or real inboxes.
 *
 *   node e2e/fakes.mjs            # model :4555, email :4556, Google :4557, PayPal :4558
 *
 * Start the app pointed at them:
 *   ANTHROPIC_API_KEY=sk-ant-fake ANTHROPIC_BASE_URL=http://127.0.0.1:4555
 *   RESEND_API_KEY=re_fake EMAIL_FROM="Labquill <hello@labquill.test>" RESEND_BASE_URL=http://127.0.0.1:4556
 *   GOOGLE_CLIENT_ID=fake GOOGLE_CLIENT_SECRET=fake GOOGLE_OAUTH_TOKEN_URL=http://127.0.0.1:4557/token
 *
 * Google's token endpoint answers any code with a verified identity token
 * for the address in the code itself: code=someone@example.com signs in as
 * them. Only a stand-in could do that, which is the point of one.
 *
 * Every request is kept in memory; GET /__log on either port returns them, and
 * DELETE /__log clears them, so the test can assert on what was sent.
 *
 * A key starting sk-ant-bad gets a 401, as a revoked key would, and
 * GET /v1/models answers, for checking a lab's own key.
 *
 * POST /__fail-next on the model port makes its next answer a 500, and
 * POST /__refuse-next makes it a refusal. An email to fail@labquill.test gets
 * a 422. Switches rather than magic words in a prompt, because a lab's
 * records are fed back into later prompts and a magic word would follow.
 */
import http from 'node:http';
import JSZip from 'jszip';

let next = null;

function serve(port, handle) {
  const log = [];
  http
    .createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (req.url === '/__fail-next' || req.url === '/__refuse-next') {
          next = req.url === '/__fail-next' ? 'fail' : 'refuse';
          res.writeHead(204);
          return res.end();
        }
        if (req.url === '/__log') {
          if (req.method === 'DELETE') log.length = 0;
          res.writeHead(200, { 'content-type': 'application/json' });
          return res.end(JSON.stringify(log));
        }
        let json = {};
        try {
          json = JSON.parse(body || '{}');
        } catch {}
        log.push({ url: req.url, headers: req.headers, body: json, raw: body });
        handle(req, res, json, body);
      });
    })
    .listen(port, '127.0.0.1');
}

/** The smallest value that satisfies a JSON Schema, with recognisable text. */
function fromSchema(schema, key = 'value') {
  if (schema.enum) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  if (schema.anyOf) return fromSchema(schema.anyOf[0], key);
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  if (type === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(schema.properties ?? {})) out[k] = fromSchema(v, k);
    return out;
  }
  if (type === 'array') return [fromSchema(schema.items ?? { type: 'string' }, key)];
  if (type === 'integer' || type === 'number') return 1;
  if (type === 'boolean') return false;
  if (schema.format === 'date' || /On$|date/i.test(key)) return '2026-10-16';
  return `Fake ${key}`;
}

/** Answers every JSON shape the app parses without a schema. */
const LOOSE_JSON = {
  summary: 'Fake summary of the run.',
  answer: 'Fake answer drawn from the lab records.',
  observations: ['Fake observation'],
  possibleIssues: ['Fake issue'],
  missingInformation: ['Fake missing detail'],
  comparison: 'Fake comparison',
  suggestedQuestions: ['Fake question?'],
  uncertainties: ['Fake uncertainty'],
  usedExperiments: [],
  literature: [],
  usedPmids: [],
  suggestions: ['Fake suggestion'],
  whoToAsk: [],
  whereToLook: [],
};

serve(4555, (req, res, sent) => {
  // A lab's own key: anything starting sk-ant-bad is refused, as Anthropic
  // refuses a revoked key; any other key works.
  if (String(req.headers['x-api-key'] ?? '').startsWith('sk-ant-bad')) {
    res.writeHead(401, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
  }
  if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ data: [{ id: 'claude-fake', type: 'model' }], has_more: false }));
  }
  const prompt = JSON.stringify(sent.messages ?? []);
  const mode = next;
  next = null;
  if (mode === 'fail') {
    res.writeHead(500, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'fake outage' } }));
  }
  const refuse = mode === 'refuse';
  const schema = sent.output_config?.format?.schema;
  const text = refuse
    ? ''
    : schema
      ? JSON.stringify(fromSchema(schema))
      : /briefing/i.test(prompt)
        ? 'Fake briefing: the lab is studying things.'
        : sent.stream
          ? 'Fake LabBot answer about the lab.'
          : JSON.stringify(LOOSE_JSON);
  const stop = refuse ? 'refusal' : 'end_turn';
  const model = sent.model;
  if (!sent.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(
      JSON.stringify({
        id: 'msg_fake',
        type: 'message',
        role: 'assistant',
        model,
        stop_reason: stop,
        content: text ? [{ type: 'text', text }] : [],
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    );
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  send('message_start', {
    message: { id: 'msg_fake', type: 'message', role: 'assistant', model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } },
  });
  send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  for (const word of (text || ' ').split(/(?<= )/)) send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: word } });
  send('content_block_stop', { index: 0 });
  send('message_delta', { delta: { stop_reason: stop }, usage: { output_tokens: 10 } });
  send('message_stop', {});
  res.end();
});

serve(4556, (req, res, sent) => {
  const to = (sent.to ?? [])[0] ?? '';
  if (to === 'fail@labquill.test') {
    res.writeHead(422, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ name: 'validation_error', message: 'fake rejection' }));
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: `fake-email-${Date.now()}` }));
});

/**
 * A Google Sheet exported as .xlsx, whose numbers change on every export, so
 * a refresh can be told apart from a stale copy. Export number n has
 * concentration values n, 2n, 3n.
 */
let exports = 0;
async function sheetXlsx() {
  exports += 1;
  const n = exports;
  const cell = (ref, v) => (typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`);
  const rows = [
    ['sample', 'concentration'],
    ['A', n],
    ['B', 2 * n],
    ['C', 3 * n],
  ]
    .map((r, i) => `<row r="${i + 1}">${cell(`A${i + 1}`, r[0])}${cell(`B${i + 1}`, r[1])}</row>`)
    .join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

serve(4557, async (req, res, _json, raw) => {
  // Google Drive: an access token of "denied" is refused, as Drive refuses a
  // Sheet that was never picked through Labquill; any other token works.
  if (req.url.startsWith('/drive/v3/files/')) {
    if (req.headers.authorization === 'Bearer denied') {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: 404, message: 'File not found' } }));
    }
    const body = await sheetXlsx();
    res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-length': body.length });
    return res.end(body);
  }
  const code = new URLSearchParams(raw).get('code') ?? '';
  if (!code.includes('@')) {
    res.writeHead(400, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'invalid_grant' }));
  }
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const idToken = `${part({ alg: 'none' })}.${part({ email: code, name: code.split('@')[0], email_verified: true })}.`;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id_token: idToken }));
});

/**
 * PayPal on :4558: sign-in, subscriptions, plan changes, cancelling, and
 * webhook verification. Approving a subscription goes through this server, as
 * it does through paypal.com: the approve link activates it, then sends the
 * browser on to the app's return URL. A webhook signature of
 * "fake-good-signature" verifies; anything else does not. Plan ids ending in
 * Y are yearly. Products, plans and webhooks can also be created, for
 * `npm run paypal:setup`.
 */
const subs = new Map();
let paypalSeq = 0;
const plans = new Map();
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};
const days = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
serve(4558, (req, res, body) => {
  const url = new URL(req.url, 'http://127.0.0.1:4558');
  const path = url.pathname;
  if (path === '/v1/oauth2/token') return json(res, 200, { access_token: 'fake-paypal-token', expires_in: 3600 });
  if (path === '/v1/catalogs/products') return json(res, 201, { id: 'PROD-FAKE' });
  if (path === '/v1/billing/plans' && req.method === 'POST') {
    const id = `P-FAKE${++paypalSeq}${body.billing_cycles?.[0]?.frequency?.interval_unit === 'YEAR' ? 'Y' : 'M'}`;
    plans.set(id, { id, status: 'ACTIVE', ...body });
    return json(res, 201, plans.get(id));
  }
  if (path.startsWith('/v1/billing/plans/')) {
    const plan = plans.get(path.split('/').pop());
    return plan ? json(res, 200, plan) : json(res, 404, { message: 'not found' });
  }
  if (path === '/v1/notifications/webhooks') return json(res, 201, { id: 'WH-FAKE' });
  if (path === '/v1/notifications/verify-webhook-signature') {
    return json(res, 200, { verification_status: body.transmission_sig === 'fake-good-signature' ? 'SUCCESS' : 'FAILURE' });
  }
  if (path === '/v1/billing/subscriptions' && req.method === 'POST') {
    const id = `I-FAKE${String(++paypalSeq).padStart(8, '0')}`;
    subs.set(id, { id, status: 'APPROVAL_PENDING', plan_id: body.plan_id, custom_id: body.custom_id, subscriber: body.subscriber, returnUrl: body.application_context.return_url });
    return json(res, 201, { id, status: 'APPROVAL_PENDING', links: [{ rel: 'approve', href: `http://127.0.0.1:4558/approve/${id}` }] });
  }
  const m = /^\/v1\/billing\/subscriptions\/(I-[A-Z0-9]+)(\/(cancel|revise))?$/.exec(path);
  if (m) {
    const sub = subs.get(m[1]);
    if (!sub) return json(res, 404, { name: 'RESOURCE_NOT_FOUND', message: 'not found' });
    if (m[3] === 'cancel') {
      sub.status = 'CANCELLED';
      delete sub.next;
      return json(res, 204);
    }
    if (m[3] === 'revise') {
      sub.pendingPlan = body.plan_id;
      sub.returnUrl = body.application_context.return_url;
      return json(res, 200, { plan_id: body.plan_id, links: [{ rel: 'approve', href: `http://127.0.0.1:4558/approve/${sub.id}` }] });
    }
    const { returnUrl, pendingPlan, next, ...shown } = sub;
    return json(res, 200, { ...shown, billing_info: next ? { next_billing_time: next } : {} });
  }
  // The subscriber approves "on PayPal", then goes back to the app.
  const approve = /^\/approve\/(I-[A-Z0-9]+)$/.exec(path);
  if (approve && subs.has(approve[1])) {
    const sub = subs.get(approve[1]);
    if (sub.pendingPlan) sub.plan_id = sub.pendingPlan;
    delete sub.pendingPlan;
    sub.status = 'ACTIVE';
    sub.next = days(sub.plan_id.endsWith('Y') ? 365 : 30);
    res.writeHead(302, { location: `${sub.returnUrl}?subscription_id=${sub.id}&ba_token=BA-FAKE&token=EC-FAKE` });
    return res.end();
  }
  json(res, 404, { message: `fake PayPal has no ${req.method} ${path}` });
});

console.log('fakes: model :4555, email :4556, Google token and Drive :4557, PayPal :4558');
