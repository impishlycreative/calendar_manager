// Run: node --test tests/calendar-integration-smoke.test.cjs
// Mock-only tests: NEVER use a live Google Calendar or Apps Script credentials.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const source = readFileSync(join(__dirname, '../google_app_scripts/CalendarManager.gs'), 'utf8');
const testStart = source.indexOf('function testCalendarManagerReadOnly()');
assert.ok(testStart !== -1, 'Read-only smoke test must be present');
const sourceTests = source.slice(testStart);
const compile = new Function(
  'Logger', 'getCalendarManager_', 'Utilities',
  sourceTests + '\nreturn { testCalendarManagerReadOnly, testCalendarManagerReadWrite };'
);

function createFake(overrides = {}) {
  let event = null;
  let removeCalls = 0;
  let addCalls = 0;
  const logs = [];
  const mockCalendar = {
    calendarId: 'test-calendar',
    timezone: 'America/Toronto',
    daysAhead: 21,
    archiveDays: 365,
    _getAccessToken_() { return 'test-token'; },
    add(value) {
      addCalls++;
      event = { ...value, id: 'generated-test-event', state: 'Upcoming' };
      return { ...event };
    },
    read(id) { return event?.id === id ? { ...event } : null; },
    update(id, value) {
      if (event?.id !== id) throw new Error('Event not found');
      event = { ...event, ...value };
      return { ...event };
    },
    list() { return event ? [{ ...event }] : []; },
    toJSON() { return JSON.stringify(event ? [event] : []); },
    remove(id) {
      removeCalls++;
      if (event?.id !== id) return false;
      event = null;
      return true;
    },
    ...overrides
  };
  const funcs = compile(
    { log(message) { logs.push(String(message)); } },
    () => mockCalendar,
    { formatDate(date) { return date.toISOString().slice(0, 10); } }
  );
  return {
    funcs,
    logs,
    get addCalls() { return addCalls; },
    get removeCalls() { return removeCalls; },
    get event() { return event; }
  };
}

test('read-only smoke test performs no write, update, or delete', () => {
  const fake = createFake();
  assert.equal(fake.funcs.testCalendarManagerReadOnly(), true);
  assert.equal(fake.addCalls, 0);
  assert.equal(fake.removeCalls, 0);
  assert.equal(fake.event, null);
});

test('write test creates and removes its own temporary draft', () => {
  const fake = createFake();
  assert.equal(fake.funcs.testCalendarManagerReadWrite(), true);
  assert.equal(fake.addCalls, 1);
  assert.equal(fake.removeCalls, 1);
  assert.equal(fake.event, null);
});

test('temporary draft is deleted when a read assertion throws', () => {
  const fake = createFake({ read() { throw new Error('Simulated read failure'); } });
  assert.throws(() => fake.funcs.testCalendarManagerReadWrite(), /Simulated read failure/);
  assert.equal(fake.removeCalls, 1);
  assert.equal(fake.event, null);
});

test('a failed deletion fails the overall write test', () => {
  const fake = createFake({ remove() { return false; } });
  assert.throws(() => fake.funcs.testCalendarManagerReadWrite(), /Temporary test event was not deleted/);
  assert.ok(fake.logs.some(message => message.includes('CLEANUP FAILED')));
});

test('original failure survives a secondary cleanup failure', () => {
  const fake = createFake({
    read() { throw new Error('Original read error'); },
    remove() { throw new Error('Cleanup error'); }
  });
  assert.throws(() => fake.funcs.testCalendarManagerReadWrite(), /Original read error/);
  assert.ok(fake.logs.some(message => message.includes('CLEANUP FAILED')));
});

test('all smoke tests use the shared calendar initialization helper', () => {
  const testSource = source.slice(testStart);
  assert.match(testSource, /getCalendarManager_\(\)/);
  assert.doesNotMatch(testSource, /new ResManagerLib\.ResourceManager/);
});
