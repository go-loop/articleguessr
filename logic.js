/*
 * ArticleGuessr: pure game logic.
 * No DOM access here, so the same file runs in the browser (window.AGLogic)
 * and in Node for tests (`node --test tests/`).
 */
(function (root) {
  'use strict';

  // ---------- answer matching ----------
  // A guess is correct when its normalised form equals the normalised title, the title without its
  // trailing "(disambiguation)", or any alias. There is no fuzzy credit.
  const FOLD = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ł': 'l', 'þ': 'th', 'ı': 'i' };

  const norm = s => String(s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')       // accents: é -> e
    .toLowerCase()
    .replace(/[ßæœøđðłþı]/g, c => FOLD[c])                   // letters that don't decompose: ł -> l
    .replace(/[’‘ʼʻ'`´.]/g, '')                              // Schindler's == Schindlers, St. == St, D.C. == DC
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')                       // any other punctuation is a space
    .replace(/\s+/g, ' ').trim()
    .replace(/^(the|a|an) /, '');                             // leading article

  const withoutQualifier = title => title.replace(/\s*\([^)]*\)\s*$/, ''); // "Casablanca (film)" -> "Casablanca"

  const answersOf = round => [...new Set(
    [round.article, withoutQualifier(round.article), ...String(round.aliases || '').split(',')]
      .map(norm).filter(Boolean)
  )];

  const isMatch = (guess, round) => {
    const g = norm(guess);
    return g !== '' && answersOf(round).includes(g);
  };

  // Levenshtein distance, used only to explain a miss after the answer is already revealed.
  const distance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return row[b.length];
  };

  // Plain-text feedback on a wrong guess ('' when the guess was nowhere close). Scoring stays exact.
  const nearMiss = (guess, round) => {
    const g = norm(guess), forms = answersOf(round);
    if (!g || !forms.length) return '';
    const dist = Math.min(...forms.map(f => distance(g, f)));
    const closest = forms.find(f => distance(g, f) === dist);
    if (dist <= 2 && closest.length >= 5) return `So close: ${dist === 1 ? 'one letter' : 'two letters'} off. Near misses don’t score.`;
    const shared = [...new Set(g.split(' ').filter(w => w.length > 2 && forms.some(f => f.split(' ').includes(w))))];
    return shared.length ? `You had part of it right: ${shared.map(w => `“${w}”`).join(', ')}.` : '';
  };

  // ---------- dates (all "today" logic uses the player's local calendar) ----------
  const pad2 = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const shiftKey = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const validKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && keyOf(parseKey(k)) === k;
  const dayNumber = k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };

  // ---------- days ----------
  const lite = r => ({
    article: String(r.article || ''),
    aliases: String(r.aliases || ''),
    categories: (r.categories || []).map(String),
    summary: String(r.summary || '')
  });

  // Coerce one entry from days.js. Returns null (silently) for a bad date, no rounds, an empty article or no categories.
  const normDay = (x, maxRounds = 10) => {
    try {
      const rounds = (x.rounds || []).slice(0, maxRounds).map(lite);
      return validKey(x.date) && rounds.length && rounds.every(r => r.article.trim() && r.categories.length)
        ? { date: x.date, title: String(x.title || ''), rounds } : null;
    } catch { return null; }
  };

  // Progress is keyed by content, not by date or title. Do not change this hash: it would reset everyone's saved games.
  const sid = rounds => {
    let h = 0;
    for (const c of JSON.stringify(rounds)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return String(h);
  };

  // With no days.js, every date still gets its own game, cut from a fixed bank so everyone sees the same one.
  // The bank is read as an endless ring, perDay entries per date, so a date's game never changes.
  const DEMO_WINDOW = 14;
  const demoDays = (today, bank, perDay) => {
    const count = Math.min(DEMO_WINDOW, Math.floor(bank.length / perDay));
    return Array.from({ length: count }, (_, back) => {
      const date = shiftKey(today, -back), start = dayNumber(date) * perDay;
      return {
        date, title: '', demo: true,
        rounds: Array.from({ length: perDay }, (_, i) => lite(bank[(((start + i) % bank.length) + bank.length) % bank.length]))
      };
    });
  };

  const api = { norm, answersOf, isMatch, nearMiss, keyOf, parseKey, shiftKey, validKey, dayNumber, lite, normDay, sid, demoDays, DEMO_WINDOW };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AGLogic = api;
})(typeof self !== 'undefined' ? self : this);
