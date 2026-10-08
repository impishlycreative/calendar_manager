const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const source = fs.readFileSync('google_app_scripts/EventShares.gs', 'utf8');

function response(code, body = {}) {
  return {
    getResponseCode: () => code,
    getContentText: () => JSON.stringify(body)
  };
}

function backend(props = {}, existing = response(404)) {
  const calls = [];
  const ctx = {
    console: { error() {} },
    requireObject_: value => assert(value && typeof value === 'object'),
    getScriptProperty_: key => props[key] || '',
    getCalendarManager_: () => ({ getUpcomingEvents: () => [] }),
    WebAppError: class extends Error {
      constructor(code, message) { super(message); this.code = code; }
    },
    Utilities: {
      Charset: { UTF_8: 'utf8' },
      DigestAlgorithm: { SHA_1: 'sha1' },
      newBlob: value => ({ getBytes: () => Array.from(Buffer.from(String(value), 'utf8')) }),
      computeDigest: (algorithm, bytes) => Array.from(crypto.createHash(algorithm).update(Buffer.from(bytes)).digest()),
      base64Encode: value => Buffer.from(String(value), 'utf8').toString('base64')
    },
    UrlFetchApp: {
      fetch(url, options = {}) {
        calls.push({ url, options });
        if ((options.method || 'get').toLowerCase() === 'put') {
          return response(existing.getResponseCode() === 200 ? 200 : 201, {});
        }
        return existing;
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { ctx, calls };
}

const props = {
  IMAGE_GITHUB_TOKEN: 'test-only',
  SHARE_PUBLIC_SITE_URL: 'https://www.kemptvillecreativewriters.com/'
};
const event = {
  id: 'abc123@google.com',
  status: 'Published',
  eventTitle: 'Writers & Friends <Night>',
  title: 'Fallback title',
  description: 'Bring a <strong>story</strong><br>&amp; meet other writers.',
  image: 'images/event_123.png',
  imageAlt: 'Writers around a table'
};

test('uses the stable Google Calendar event id as the filename', () => {
  const { ctx } = backend(props);
  assert.equal(ctx.eventShareFilename_(event.id), 'abc123@google.com.html');
  assert.throws(() => ctx.eventShareFilename_('../bad'), error => error.code === 'INVALID_REQUEST');
});

test('published event creates complete stable Open Graph landing HTML', () => {
  const { ctx, calls } = backend(props);
  const result = ctx.syncEventShareArtifact_(event);
  assert.equal(result.ok, true);
  assert.equal(result.state, 'created');
  assert.match(result.url, /abc123%40google\.com\.html\?v=3$/);
  assert.equal(calls.length, 2);
  const payload = JSON.parse(calls[1].options.payload);
  const html = Buffer.from(payload.content, 'base64').toString('utf8');
  assert.match(html, /property="og:type" content="website"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /Writers &amp; Friends &lt;Night&gt;/);
  assert.match(html, /Bring a story &amp; meet other writers\./);
  assert.doesNotMatch(html, /<strong>story<\/strong>/);
  assert.match(html, /name="description" content="Bring a story &amp; meet other writers\."/);
  assert.match(html, /property="og:url" content="https:\/\/www\.kemptvillecreativewriters\.com\/share\/events\/abc123%40google\.com\.html\?v=3"/);
  assert.match(html, /property="og:image" content="https:\/\/www\.kemptvillecreativewriters\.com\/images\/event_123\.png"/);
  assert.match(html, /property="og:image:alt" content="Writers around a table"/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.kemptvillecreativewriters\.com\/share\/events\/abc123%40google\.com\.html\?v=3"/);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.doesNotMatch(html, /window\.location/);
  assert.doesNotMatch(html, /name="robots"/);
  assert.match(html, /href="\.\.\/\.\.\/schedule\.html#abc123%40google\.com"/);
});

test('published event without its own image uses the site fallback image', () => {
  const { ctx, calls } = backend(props);
  ctx.syncEventShareArtifact_({ ...event, image: '', imageAlt: '' });
  const html = Buffer.from(JSON.parse(calls[1].options.payload).content, 'base64').toString('utf8');
  assert.match(html, /property="og:image" content="https:\/\/www\.kemptvillecreativewriters\.com\/images\/schedule-hero-optimized\.png"/);
  assert.match(html, /property="og:image:alt" content="Kemptville Creative Writers"/);
});

test('existing share file is updated with its current sha', () => {
  const existing = response(200, { type: 'file', sha: 'old-sha' });
  const { ctx, calls } = backend(props, existing);
  const result = ctx.syncEventShareArtifact_(event);
  assert.equal(result.state, 'updated');
  const payload = JSON.parse(calls[1].options.payload);
  assert.equal(payload.sha, 'old-sha');
});

test('a draft does not create a new share file', () => {
  const { ctx, calls } = backend(props);
  const result = ctx.syncEventShareArtifact_({ ...event, status: 'Draft' });
  assert.equal(result.state, 'not-required');
  assert.equal(calls.length, 1);
});

test('an existing share file is retained and retired when event becomes draft', () => {
  const existing = response(200, { type: 'file', sha: 'old-sha' });
  const { ctx, calls } = backend(props, existing);
  const result = ctx.syncEventShareArtifact_({ ...event, status: 'Draft' });
  assert.equal(result.state, 'updated');
  const html = Buffer.from(JSON.parse(calls[1].options.payload).content, 'base64').toString('utf8');
  assert.match(html, /no longer available/);
  assert.match(html, /property="og:url"/);
  assert.match(html, /property="og:image" content="https:\/\/www\.kemptvillecreativewriters\.com\/images\/schedule-hero-optimized\.png"/);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.doesNotMatch(html, /window\.location/);
  assert.doesNotMatch(html, /name="robots"/);
});

test('publishing failure is returned as a partial failure rather than thrown by the safe wrapper', () => {
  const bad = response(403, {});
  const { ctx } = backend(props, bad);
  const result = ctx.trySyncEventShareArtifact_(event);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SHARE_PUBLISH_FAILED');
});
