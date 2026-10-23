/**
 * Stand-ins for the services Labquill talks to, so the end-to-end test drives
 * the real code paths without real keys, real money or real inboxes.
 *
 *   node e2e/fakes.mjs            # model :4555, email :4556, Google token :4557
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
 * POST /__fail-next on the model port makes its next answer a 500, and
 * POST /__refuse-next makes it a refusal. An email to fail@labquill.test gets
 * a 422. Switches rather than magic words in a prompt, because a lab's
 * records are fed back into later prompts and a magic word would follow.
 */
import http from 'node:http';

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

serve(4557, (req, res, _json, raw) => {
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

console.log('fakes: model :4555, email :4556, Google token :4557');
