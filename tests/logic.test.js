// Run with: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../logic.js');

// Load the demo bank the same way a browser would.
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../demo.js'), 'utf8'), sandbox);
const BANK = sandbox.window.ARTICLEGUESSR_BANK;

const r = (article, aliases = '') => ({ article, aliases, categories: ['x'] });

test('norm: case, accents, punctuation, spacing and leading articles', () => {
  assert.equal(L.norm('  The  Shawshank   Redemption! '), 'shawshank redemption');
  assert.equal(L.norm('Café'), 'cafe');
  assert.equal(L.norm('A Clockwork Orange'), 'clockwork orange');
  assert.equal(L.norm('Rock & Roll'), 'rock and roll');
});

test('norm: apostrophes and periods vanish instead of splitting words', () => {
  assert.equal(L.norm("Schindler's List"), L.norm('Schindlers List'));
  assert.equal(L.norm('Schindler’s List'), L.norm('Schindlers List'));
  assert.equal(L.norm('Washington, D.C.'), L.norm('Washington DC'));
  assert.equal(L.norm('St. Louis'), L.norm('St Louis'));
  assert.equal(L.norm('Hawaiʻi'), L.norm('Hawaii'));
});

test('norm: letters that do not decompose are folded', () => {
  assert.equal(L.norm('Skłodowska'), 'sklodowska');
  assert.equal(L.norm('Jørn Utzon'), 'jorn utzon');
  assert.equal(L.norm('Straße'), 'strasse');
  assert.equal(L.norm('Æthelred'), 'aethelred');
});

test('isMatch: exact title, alias, and title without its (qualifier)', () => {
  const film = r('Casablanca (film)', 'Rick’s Café');
  assert.ok(L.isMatch('Casablanca', film));
  assert.ok(L.isMatch('casablanca (film)', film));
  assert.ok(L.isMatch('Ricks Cafe', film));
  assert.ok(L.isMatch('Casablanca film', film));   // punctuation never matters, so the bare words work too
  assert.ok(!L.isMatch('Casablanca movie', film));
  assert.ok(!L.isMatch('Sklodowska', r('Marie Curie', 'Marie Skłodowska-Curie, Maria Skłodowska')));   // a surname alone isn't listed
  assert.ok(L.isMatch('Maria Sklodowska', r('Marie Curie', 'Marie Skłodowska-Curie, Maria Skłodowska')));
});

test('isMatch: no fuzzy or partial credit, and blanks never match', () => {
  const k = r('Krakatoa', 'Krakatau');
  assert.ok(!L.isMatch('Krakatoo', k));
  assert.ok(!L.isMatch('Kraka', k));
  assert.ok(!L.isMatch('', k));
  assert.ok(!L.isMatch('   ', k));
  assert.ok(!L.isMatch('the', r('The Beatles')));   // a leading article alone is not an answer
});

test('nearMiss: explains a miss but never changes scoring', () => {
  const k = r('Krakatoa');
  assert.match(L.nearMiss('Krakatoo', k), /one letter/);
  assert.match(L.nearMiss('Krakatooa', k), /one letter/);
  assert.equal(L.nearMiss('Mount Etna', k), '');
  assert.match(L.nearMiss('Mount Everest', r('Mount Fuji')), /mount/);
  assert.equal(L.nearMiss('', k), '');
});

test('dates: keys round-trip and shift across month/year/DST boundaries', () => {
  assert.equal(L.shiftKey('2026-03-01', -1), '2026-02-28');
  assert.equal(L.shiftKey('2026-01-01', -1), '2025-12-31');
  assert.equal(L.shiftKey('2026-03-28', 2), '2026-03-30');
  assert.equal(L.shiftKey('2026-10-24', 1), '2026-10-25');
  assert.ok(L.validKey('2026-02-28'));
  assert.ok(!L.validKey('2026-02-30'));
  assert.ok(!L.validKey('26-2-3'));
  assert.equal(L.dayNumber('2026-01-02') - L.dayNumber('2026-01-01'), 1);
});

test('sid: matches the original hash, so saved progress survives the rewrite', () => {
  const original = s => { let h = 0; for (const c of JSON.stringify(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return String(h); };
  const rounds = BANK.slice(0, 5).map(L.lite);
  assert.equal(L.sid(rounds), original(rounds));
});

test('normDay: accepts good days, rejects bad ones', () => {
  const good = { date: '2026-05-01', title: 'T', rounds: [{ article: 'A', categories: ['c'] }] };
  assert.equal(L.normDay(good).rounds.length, 1);
  assert.equal(L.normDay({ ...good, date: '2026-13-01' }), null);
  assert.equal(L.normDay({ ...good, rounds: [] }), null);
  assert.equal(L.normDay({ ...good, rounds: [{ article: ' ', categories: ['c'] }] }), null);
  assert.equal(L.normDay({ ...good, rounds: [{ article: 'A', categories: [] }] }), null);
  assert.equal(L.normDay(null), null);
  assert.equal(L.normDay(good, 1).rounds.length, 1);
});

test('demoDays: one stable five-round game per date, 14-day window', () => {
  const days = L.demoDays('2026-10-23', BANK, 5);
  assert.equal(days.length, 14);
  assert.equal(days[0].date, '2026-10-23');
  assert.equal(days[13].date, '2026-10-10');
  assert.ok(days.every(d => d.demo && d.rounds.length === 5));
  assert.deepEqual(L.demoDays('2026-10-23', BANK, 5), days);                       // deterministic
  const again = L.demoDays('2026-10-24', BANK, 5).find(d => d.date === '2026-10-20');
  assert.deepEqual(again, days.find(d => d.date === '2026-10-20'));                  // a date's game never changes
});

test('demoDays: no article repeats inside the archive window, and a date’s game stays unique for weeks', () => {
  const days = L.demoDays('2026-10-23', BANK, 5);
  const titles = days.flatMap(d => d.rounds.map(x => x.article));
  assert.equal(new Set(titles).size, titles.length);
  // The schedule is a ring over the bank, so with gcd(5, length) = 1 the same game returns only after
  // `length` days. A bank whose length is a multiple of 5 would repeat after length/5 days instead.
  const span = BANK.length - 1, ids = new Set();
  let day = '2026-01-01';
  for (let i = 0; i < span; i++, day = L.shiftKey(day, 1)) ids.add(L.sid(L.demoDays(day, BANK, 5)[0].rounds));
  assert.equal(ids.size, span, 'two dates inside one cycle share an identical game');
});

test('demo bank: every entry is complete and fair', () => {
  assert.ok(BANK.length >= 70, 'need at least 70 entries for a 14-day window');
  assert.notEqual(BANK.length % 5, 0, 'bank length must not be a multiple of 5');
  const seen = new Set();
  for (const e of BANK) {
    const id = L.norm(e.article);
    assert.ok(e.article.trim(), 'article is empty');
    assert.ok(!seen.has(id), `duplicate article: ${e.article}`);
    seen.add(id);
    assert.ok(e.categories.length >= 4, `${e.article}: needs at least 4 categories`);
    assert.equal(new Set(e.categories.map(L.norm)).size, e.categories.length, `${e.article}: duplicate category`);
    assert.ok(e.summary.length > 20, `${e.article}: missing summary`);
    const title = L.norm(e.article.replace(/\s*\([^)]*\)\s*$/, ''));
    for (const c of e.categories) assert.ok(!L.norm(c).includes(title), `${e.article}: category "${c}" gives the answer away`);
  }
  // An alias must never collide with a different article's title.
  for (const e of BANK) for (const a of e.aliases.split(',').map(L.norm).filter(Boolean)) {
    const owner = BANK.find(o => L.norm(o.article) === a || L.norm(o.article.replace(/\s*\([^)]*\)\s*$/, '')) === a);
    assert.ok(!owner || owner === e, `alias "${a}" of ${e.article} is also the title of ${owner && owner.article}`);
  }
});
