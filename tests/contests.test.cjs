// Run with: node --test tests/contests.test.cjs
// Isolated metadata tests. Live Google Calendar/API authentication is tested at deployment.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../google_app_scripts/CalendarManager.gs'), 'utf8');
const context = {
  console,
  Date,
  Utilities: {
    formatDate(date, zone, format) {
      assert.equal(format, 'yyyy-MM-dd');
      assert.equal(zone, 'UTC');
      return date.toISOString().slice(0, 10);
    }
  }
};
vm.createContext(context);
vm.runInContext(source + '\nthis.CalendarManagerUnderTest = CalendarManager;', context);
const manager = Object.create(context.CalendarManagerUnderTest.prototype);
manager.timezone = 'America/Toronto';
manager.allowedStatuses = ['Draft', 'Published'];
manager.allowedStates = ['Upcoming', 'Archived'];

const valid = {
  type: 'Contest',
  title: 'A Canadian Short Story Competition',
  description: 'Write an original story.',
  date: '2026-01-01',
  allDay: true,
  status: 'Published',
  contestEligibility: 'Canadian residents age 18+',
  contestOpenDate: '2026-01-01',
  contestDeadline: '2026-12-31',
  contestUrl: 'https://example.org/contest',
  contestTermsUrl: 'https://example.org/contest/rules',
  contestForm: 'Short Stories',
  contestGenres: 'Fantasy, Horror',
  contestEntryFee: 'Free'
};

test('long-running contest uses an exclusive calendar end after its deadline', () => {
  const event = manager._validateInputEvent_(valid);
  const google = manager._buildGoogleCalendarEvent_(event);
  assert.equal(google.start.date, '2026-01-01');
  assert.equal(google.end.date, '2027-01-01');
});

test('contest metadata survives description serialization', () => {
  const event = manager._validateInputEvent_(valid);
  const google = manager._buildGoogleCalendarEvent_(event);
  const metadata = manager._parseMetadata_(google.description);
  assert.equal(metadata.contestDeadline, '2026-12-31');
  assert.equal(metadata.contestEligibility, valid.contestEligibility);
  assert.equal(metadata.contestGenres, valid.contestGenres);
  assert.equal(metadata.contestTermsUrl, valid.contestTermsUrl);
  assert.equal(metadata.status, 'Published');
});

test('publishing a contest requires five public listing fields', () => {
  for (const field of ['title', 'description', 'contestEligibility', 'contestDeadline', 'contestUrl']) {
    assert.throws(() => manager._validateInputEvent_({ ...valid, [field]: '' }));
  }
});

test('draft contests may remain incomplete', () => {
  const incomplete = manager._validateInputEvent_({
    ...valid, status: 'Draft', contestEligibility: '', contestDeadline: '', contestUrl: ''
  });
  assert.equal(incomplete.status, 'Draft');
});

test('a contest cannot close before it opens', () => {
  assert.throws(() => manager._validateInputEvent_({
    ...valid, contestOpenDate: '2026-12-31', contestDeadline: '2026-01-01'
  }), /deadline cannot precede/);
});

test('ordinary meetings retain their existing input semantics', () => {
  const meeting = manager._validateInputEvent_({
    type: 'Meeting', title: 'KCW meeting', date: '2026-11-09',
    startTime: '18:00', endTime: '20:00', timezone: 'America/Toronto',
    allDay: false, description: 'Writing time', status: 'Published'
  });
  assert.equal(meeting.type, 'Meeting');
  assert.equal(meeting.allDay, false);
});
