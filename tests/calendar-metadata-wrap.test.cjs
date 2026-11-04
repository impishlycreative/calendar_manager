// Run: node --test tests/calendar-metadata-wrap.test.cjs
// Pure, mock-only tests: no calendar connection or Apps Script credentials.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '../google_app_scripts/CalendarManager.gs'), 'utf8');
const CalendarManager = new Function(source + '\nreturn CalendarManager;')();
const calendar = Object.create(CalendarManager.prototype);
const block = json => '[KCW_METADATA]\n' + json + '\n[/KCW_METADATA]';

test('a reflowed imageAlt from the Lis Angus event is restored', () => {
  const json = '{ "type": "Meeting", "status": "Published", "imageAlt": "Lis Angus\nauthor", "featured": true }';
  const result = calendar._parseMetadata_(block(json));
  assert.equal(result.imageAlt, 'Lis Angus author');
  assert.equal(result.featured, true);
  assert.equal(result.status, 'Published');
});

test('the older test-event description line break is repaired', () => {
  const json = '{ "imageAlt": "This is an image\r\ndescription", "status": "Draft" }';
  assert.equal(calendar._parseMetadata_(block(json)).imageAlt, 'This is an image description');
});

test('normal formatting and escaped newlines remain valid', () => {
  const text = '{\n  "imageAlt": "One\\nTwo",\n  "featured": true\n}';
  assert.equal(calendar._parseMetadata_(block(text)).imageAlt, 'One\nTwo');
});

test('writer produces properly escaped metadata for multiline inputs', () => {
  const description = calendar._buildCalendarDescription_({
    description: 'Human description',
    type: 'Meeting',
    status: 'Draft',
    imageAlt: 'First\nSecond'
  });
  assert.ok(description.includes('"imageAlt": "First\\nSecond"'));
  assert.equal(calendar._parseMetadata_(description).imageAlt, 'First\nSecond');
});

test('malformed metadata is still rejected rather than generally sanitized', () => {
  assert.throws(
    () => calendar._parseMetadata_(block('{"imageAlt": "bad\nvalue", "featured": tru}')),
    /metadata contains invalid JSON/
  );
  assert.throws(
    () => calendar._parseMetadata_(block('{"imageAlt": "bad\tvalue"}')),
    /metadata contains invalid JSON/
  );
  assert.throws(
    () => calendar._parseMetadata_(block('{"imageAlt": "no closing quote}')),
    /metadata contains invalid JSON/
  );
});
