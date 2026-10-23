/*
 * ArticleGuessr: the player app.
 * Screens: home, play (clues -> answer -> reveal), results, archive.
 * Pure rules (matching, dates, demo schedule) live in logic.js; game content comes from days.js (or demo.js).
 */
(() => {
'use strict';

const { isMatch, nearMiss, keyOf, parseKey, shiftKey, lite, normDay, sid, demoDays } = window.AGLogic;

// ---------- constants ----------
// Storage keys and shapes are unchanged from earlier versions, so saved games survive updates.
const KEYS = {
  prog: 'articleguessr.progress.v1', cur: 'articleguessr.current.v1', runs: 'articleguessr.runs.v1',
  prefs: 'articleguessr.prefs.v1', theme: 'articleguessr.theme.v1'
};
const POINTS = 100;      // per correct round
const ROUNDS = 5;        // rounds per demo day
const MAX_ROUNDS = 10;   // ceiling when reading days.js
const MIN_ACTION_DELAY = 350; // ms: ignore a "Next" press this soon after a reveal (double-taps)

// ---------- small helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const remove = k => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } };
const pad = n => String(n).padStart(2, '0');
const longDay = (k, year) => parseKey(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
const shortDay = k => parseKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const monthName = ym => parseKey(`${ym}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const todayKey = () => keyOf(new Date());
const wikiUrl = title => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.trim().replace(/ /g, '_'))}`;
const kindOf = x => (x ? (x.skipped ? 'skip' : x.ok ? 'ok' : 'miss') : '');
const isCoarse = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

// ---------- days ----------
const fileDays = () => (Array.isArray(window.ARTICLEGUESSR_DAYS) ? window.ARTICLEGUESSR_DAYS : [])
  .map(d => normDay(d, MAX_ROUNDS)).filter(Boolean);

const allDays = () => {
  const byDate = new Map();
  fileDays().forEach(d => byDate.set(d.date, d)); // one game per date: a later entry replaces an earlier one
  const list = byDate.size ? [...byDate.values()] : demoDays(todayKey(), window.ARTICLEGUESSR_BANK || [], ROUNDS);
  return list.sort((a, b) => b.date.localeCompare(a.date));
};
const isOpen = d => d.date <= todayKey(); // future days stay locked until their date

// Picking a day in the archive pins it for the rest of that calendar day only; tomorrow the app opens on tomorrow's game.
const getPin = () => { const p = read(KEYS.cur, null); return p && typeof p === 'object' && p.on === todayKey() ? p.date : null; };
const setPin = date => write(KEYS.cur, { date, on: todayKey() });
const clearPin = () => remove(KEYS.cur);

const activeDay = () => {
  const list = allDays(), t = todayKey(), pin = getPin(), by = k => list.find(d => d.date === k);
  return (pin && pin <= t && by(pin)) || by(t) || list.find(d => d.date <= t) || list[list.length - 1];
};

// ---------- progress ----------
// Progress and finished runs are stored per game (keyed by content), so switching days never loses your place.
const dayId = d => sid(d.rounds.map(lite));
const fresh = rounds => ({ sid: sid(rounds), r: 0, rounds: [] });
const progMap = () => {
  const m = read(KEYS.prog, {});
  if (m && m.sid !== undefined && Array.isArray(m.rounds)) return { [m.sid]: m }; // very old single-game format
  return m && typeof m === 'object' ? m : {};
};
const getProg = rounds => { const id = sid(rounds), p = progMap()[id]; return p && p.sid === id && Array.isArray(p.rounds) ? p : fresh(rounds); };
const saveProg = p => { const m = progMap(); m[p.sid] = p; write(KEYS.prog, m); };
const getRuns = id => { const r = read(KEYS.runs, {})[id]; return Array.isArray(r) ? r : []; };
const addRun = (id, run) => { const m = read(KEYS.runs, {}); m[id] = [...getRuns(id), run].slice(-20); write(KEYS.runs, m); };
const bestOf = id => { const r = getRuns(id); return r.length ? Math.max(...r.map(x => x.score)) : null; };
const total = p => p.rounds.reduce((t, x) => t + (x ? x.pts : 0), 0);
const SKIPPED = { guess: '', ok: false, pts: 0, skipped: true };

// "finished" = this game has been completed at least once. Replaying it later never takes that away.
const dayInfo = d => {
  const id = dayId(d), p = progMap()[id], n = d.rounds.length, runs = getRuns(id), r = p ? p.r : 0;
  const complete = !!p && r >= n, answered = p ? p.rounds.filter(Boolean).length : 0;
  // "mid" counts an answered-but-not-yet-advanced round too, so leaving on a reveal screen still reads as "in progress".
  return { id, n, r, answered, complete, mid: answered > 0 && !complete, finished: complete || runs.length > 0, locked: !isOpen(d), best: bestOf(id), plays: runs.length };
};

const stats = () => {
  const days = allDays().filter(isOpen), by = new Map(days.map(d => [d.date, d]));
  const done = d => !!d && dayInfo(d).finished;
  let k = todayKey(), streak = 0;
  if (!done(by.get(k))) k = shiftKey(k, -1);
  while (done(by.get(k))) { streak++; k = shiftKey(k, -1); }
  return { played: days.filter(done).length, total: days.length, streak, best: Math.max(0, ...days.map(d => dayInfo(d).best || 0)) };
};

// ---------- countdown and day rollover ----------
let timer = null;
let shownDay = todayKey();
const route = () => location.hash.slice(1);

// If the tab stays open past midnight, quietly move home/archive onto the new day. A round in progress is never yanked away.
const checkNewDay = () => {
  const t = todayKey();
  if (t === shownDay) return;
  shownDay = t;
  const r = route();
  if (r === '' || r === '/') home(); else if (r === '/archive') archive();
};

const startCountdown = () => {
  const el = $('#cd');
  if (!el) return;
  const now = new Date(), target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const tick = () => {
    const left = Math.max(0, Math.floor((target - Date.now()) / 1000));
    if (left === 0) {
      clearInterval(timer);
      if (el.parentElement) el.parentElement.innerHTML = '<a href="#/">A new game is ready</a>';
      checkNewDay();
      return;
    }
    el.textContent = [Math.floor(left / 3600), Math.floor(left % 3600 / 60), left % 60].map(pad).join(':');
  };
  tick();
  timer = setInterval(tick, 1000);
};

// ---------- rendering helpers ----------
const set = (html, cls = 'stage') => {
  clearInterval(timer);
  app.className = cls;
  app.innerHTML = html;
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
};

const ticks = (p, n) => `<div class="ticks" role="img" aria-label="Round ${Math.min(p.r + 1, n)} of ${n}">${
  Array.from({ length: n }, (_, i) => `<i class="${kindOf(p.rounds[i]) || (i === p.r ? 'now' : '')}"></i>`).join('')}</div>`;

// Progress rail: round number, running score, and one segment per round.
const rail = (rounds, p) => {
  const n = rounds.length;
  const seg = (rd, i) => {
    const x = p.rounds[i], k = kindOf(x) || (i === p.r ? 'now' : '');
    const what = x ? (x.skipped ? 'skipped' : x.ok ? 'correct' : 'incorrect') : i === p.r ? 'in play' : 'to come';
    const name = x ? esc(rd.article) : i === p.r ? 'In play' : '—';
    const pts = x ? (x.skipped ? 'skip' : x.pts ? `+${x.pts}` : '0') : '';
    return `<li class="${k}" aria-label="Round ${i + 1}: ${what}"><span>${pad(i + 1)}</span><b>${name}</b><em>${pts}</em></li>`;
  };
  return `<header class="rr"><div class="rtop"><p class="rnd"><b>${pad(Math.min(p.r + 1, n))}</b><span>of ${pad(n)}</span></p>
    <p class="sc"><b>${total(p)}</b><span>points</span></p></div>
    <ol class="rsegs" style="--n:${n}">${rounds.map(seg).join('')}</ol></header>`;
};

// The clues: one category per line, never split across lines of other categories.
const clues = (rd, headingTag) => {
  const n = rd.categories.length;
  return `<section class="clues"><div class="clue-head"><${headingTag}>Which article has these categories?</${headingTag}><span>${n} ${n === 1 ? 'category' : 'categories'}</span></div>
    <div class="catbox"><ul class="cats" role="list">${rd.categories.map(c => `<li>${esc(c.trim())}</li>`).join('')}</ul></div></section>`;
};

// Make the categories as large as will fit without scrolling; scroll (with a cue) only when even the smallest size won't fit.
let fitObserver = null;
const fitCats = () => {
  const box = $('.catbox'), list = $('.cats');
  if (fitObserver) fitObserver.disconnect();
  if (!box || !list) return;
  const many = list.children.length > 8, probe = document.createRange();
  const fit = () => {
    const cols = many && box.clientWidth >= 560 ? 2 : 1;
    list.dataset.cols = cols;
    list.style.setProperty('--cols', cols);
    // A size fits when nothing overflows the box vertically AND no single word is wider than its line
    // (otherwise the browser would chop it mid-word). The width probe turns word-breaking off briefly.
    const fits = fs => {
      list.style.setProperty('--fs', `${fs}rem`);
      if (box.scrollHeight > box.clientHeight + 1) return false;
      list.classList.add('measure');
      const tooWide = [...list.children].some(li => { // fractional widths: scrollWidth rounds, but the browser breaks a word for any overflow
        probe.selectNodeContents(li);
        return probe.getBoundingClientRect().width > li.getBoundingClientRect().width + 0.02;
      });
      list.classList.remove('measure');
      return !tooWide;
    };
    let lo = 0.875, hi = 3.25; // floor of 14px: bold text that small is still legible, and a hidden clue is worse
    if (!fits(hi)) {
      for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
      list.style.setProperty('--fs', `${(lo * 0.985).toFixed(3)}rem`); // a hair of slack for font/rounding differences
    }
    box.classList.toggle('more', box.scrollHeight > box.clientHeight + 1);
  };
  fit();
  if (window.ResizeObserver) { fitObserver = new ResizeObserver(fit); fitObserver.observe(box); }
  if (document.fonts) document.fonts.ready.then(fit);
};

const emptyState = () => set('<section class="hl"><div class="hmain"><h1>No games yet.</h1><p class="lede">There is nothing to play right now. Check back soon.</p></div></section>', 'hero');

// ---------- home ----------
function home() {
  const g = activeDay();
  if (!g) return emptyState();
  const rounds = g.rounds.map(lite), n = rounds.length, p = getProg(rounds), x = dayInfo(g);
  const t = todayKey(), isToday = g.date === t, st = stats(), dt = parseKey(g.date), max = n * POINTS;

  const label = x.locked ? `Opens ${shortDay(g.date)}`
    : x.complete ? 'See results'
    : x.mid ? `Resume round ${p.r + 1} of ${n}`
    : x.finished ? 'Play again'
    : isToday ? 'Start today’s game' : `Play ${shortDay(g.date)}`;
  const status = x.locked ? `Opens ${longDay(g.date)}.`
    : x.complete ? `Completed: ${total(p)} of ${max}${x.best !== null && x.best > total(p) ? `, your best is ${x.best}` : ''}.`
    : x.mid ? `In progress: round ${p.r + 1} of ${n}, ${total(p)} points.`
    : x.finished ? `Completed before. Your best is ${x.best} of ${max}.`
    : 'Not started yet.';
  const streakNote = st.streak > 1 && !x.complete ? ` ${st.streak}-day streak, keep it going.` : '';

  set(`<section class="hl"><p class="dateline"><b>${dt.getDate()}</b><span>${esc(dt.toLocaleDateString(undefined, { weekday: 'long' }))}<br>${esc(dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</span></p>
    <div class="hmain"><h1>Read the categories.<br><strong>Name the article.</strong></h1>
    <p class="lede">${g.title ? `<b>${esc(g.title)}.</b> ` : ''}A daily guessing game built on Wikipedia’s category tags. Each round hides one article, and its categories are your only clues.</p>
    <div class="cta">${x.locked ? `<p class="btn off big" aria-disabled="true">${esc(label)}</p>` : `<a class="btn big" href="#/play" id="go">${esc(label)}</a>`}
      <button class="as-link" id="how2" type="button">How to play</button>
      ${x.complete && !x.locked ? '<button class="as-link" id="redo" type="button">Play again</button>' : ''}</div></div></section>
    <aside class="panel ticket">
      <div><p class="meta">${isToday ? 'Today' : 'From the archive'}${g.demo ? ', demo' : ''}</p>${ticks(p, n)}<p class="note" id="st">${esc(status + streakNote)}</p>
        ${isToday && x.complete ? '<p class="cdwn">Next game in <b id="cd">00:00:00</b></p>' : ''}</div>
      <dl class="facts"><div><dt>Day streak</dt><dd>${st.streak}</dd></div><div><dt>Days played</dt><dd>${st.played}<small>/${st.total}</small></dd></div><div><dt>Best score</dt><dd>${st.best || '–'}</dd></div></dl>
      <div>${!isToday ? '<button class="btn quiet" id="bt" type="button">Back to today</button>' : ''}<p class="note">Your progress stays in this browser.</p></div></aside>`, 'hero');
  document.title = 'ArticleGuessr: a daily game of Wikipedia categories';

  const redo = $('#redo');
  if (redo) redo.onclick = () => { saveProg(fresh(rounds)); location.hash = '#/play'; };
  const bt = $('#bt');
  if (bt) bt.onclick = () => { clearPin(); home(); };
  $('#how2').onclick = openHow;
  startCountdown();
}

// ---------- play ----------
function play() {
  const g = activeDay();
  if (!g) return emptyState();
  const rounds = g.rounds.map(lite), n = rounds.length, p = getProg(rounds);
  if (p.r >= n) return results(g, rounds, p);
  if (p.rounds[p.r]) return reveal(g, rounds, p); // an answered round can never show the form again

  const rd = rounds[p.r];
  set(`<div class="game">${rail(rounds, p)}${clues(rd, 'h1')}
    <form class="acol" novalidate>
      <div class="agroup">
        <label for="g">Your answer</label>
        <div class="titlebar"><input id="g" placeholder="Type the article title" autocomplete="off" autocapitalize="none" autocorrect="off" enterkeyhint="go" maxlength="140" spellcheck="false" aria-describedby="rule err"></div>
        <p class="err" id="err" role="alert"></p>
        <div class="acts"><button class="btn big" type="submit">Submit</button><button class="btn quiet big" type="button" id="skip">Skip</button></div>
        <p class="rule" id="rule">One guess per round. Capitals, accents and punctuation don’t matter.</p>
      </div>
    </form></div>`, 'stage gm');
  fitCats();
  document.title = `Round ${p.r + 1} of ${n} · ArticleGuessr`;

  const inp = $('#g'), err = $('#err'), skip = $('#skip');
  if (!isCoarse()) inp.focus(); // don't pop the keyboard over the clues on phones

  const finish = x => {
    if (p.rounds[p.r]) return; // one answer per round
    if (navigator.vibrate) navigator.vibrate(x.ok ? 12 : x.skipped ? 0 : [8, 40, 8]);
    p.rounds[p.r] = x;
    saveProg(p);
    play();
  };

  $('form').onsubmit = e => {
    e.preventDefault();
    const guess = inp.value.trim();
    if (!guess) { err.textContent = 'Type a title to submit, or press Skip.'; inp.focus(); return; }
    const ok = isMatch(guess, rd);
    finish({ guess, ok, pts: ok ? POINTS : 0 });
  };

  // Skipping throws the round away, so it takes two presses. Typing, or tapping elsewhere, cancels it.
  let armed = null;
  const disarm = () => { clearTimeout(armed); armed = null; skip.textContent = 'Skip'; skip.classList.remove('armed'); err.textContent = ''; };
  skip.onclick = () => {
    if (armed) { clearTimeout(armed); return finish({ ...SKIPPED }); }
    skip.textContent = 'Confirm skip';
    skip.classList.add('armed');
    err.textContent = 'Press Skip again to give up this round.';
    armed = setTimeout(disarm, 4000);
  };
  skip.onblur = () => { if (armed) disarm(); };
  inp.addEventListener('input', () => { if (armed) disarm(); else err.textContent = ''; });
}

function reveal(g, rounds, p) {
  const i = p.r, n = rounds.length, rd = rounds[i], x = p.rounds[i], last = i === n - 1, kind = kindOf(x);
  const near = !x.ok && !x.skipped ? nearMiss(x.guess, rd) : '';
  const badge = x.skipped ? '– Skipped' : x.ok ? '✓ Correct' : '✕ Incorrect';
  const detail = x.skipped ? 'No guess submitted' : x.ok ? `+${x.pts} points` : `You guessed ${esc(x.guess)}`;

  set(`<div class="game">${rail(rounds, p)}${clues(rd, 'h2')}
    <section class="acol ans">
      <div class="rl" id="rl"><span class="badge ${kind}">${badge}</span><span>${detail}</span></div>
      ${near ? `<p class="near" role="status">${esc(near)}</p>` : ''}
      <h1 class="titlebar answer">${esc(rd.article)}</h1>
      <div class="body">${rd.summary ? `<p class="desc">${esc(rd.summary)}</p>` : ''}
        <p class="wl"><a href="${wikiUrl(rd.article)}" target="_blank" rel="noopener">Read “${esc(rd.article)}” on Wikipedia <span class="sr">(opens in a new tab)</span></a></p></div>
      <div class="acts"><button class="btn big" id="n" aria-describedby="rl">${last ? 'See results' : `Next round: ${i + 2} of ${n}`}</button></div>
    </section></div>`, 'stage gm');
  fitCats();
  document.title = `${rd.article} · Round ${i + 1} of ${n} · ArticleGuessr`;

  const next = $('#n'), shownAt = performance.now();
  next.focus({ preventScroll: true });
  next.addEventListener('keydown', e => { if (e.repeat) e.preventDefault(); }); // holding Enter must not skip ahead
  next.onclick = () => {
    if (p.r !== i || performance.now() - shownAt < MIN_ACTION_DELAY) return; // a double-tap on Submit lands here too
    p.r++;
    saveProg(p);
    play();
  };
}

// ---------- results ----------
async function resultCard(rounds, p, day, hits) {
  const n = rounds.length, W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext && c.getContext('2d');
  if (!x) return null;
  const serif = '"Fraunces", Georgia, "Times New Roman", serif', mono = '"JetBrains Mono", "Courier New", monospace';
  const fg = '#E7EBE5', acc = '#F4D03F', dim = 'rgba(231,235,229,.66)';
  try { await Promise.all([document.fonts.load('200 120px Fraunces'), document.fonts.load('800 60px Fraunces'), document.fonts.load('400 30px "JetBrains Mono"')]); } catch { /* fall back to system fonts */ }
  x.fillStyle = '#16201C'; x.fillRect(0, 0, W, H);
  const img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'logo-mark-light.svg'; });
  if (img) x.drawImage(img, 80, 80, 96, 96);
  x.fillStyle = fg; x.font = `200 56px ${serif}`; x.fillText('Article', 200, 142);
  const w1 = x.measureText('Article').width;
  x.font = `800 56px ${serif}`; x.fillText('Guessr', 200 + w1, 142);
  x.font = `400 36px ${mono}`; x.fillStyle = dim; x.fillText(longDay(day.date, true), 80, 330);
  const score = String(total(p));
  x.fillStyle = acc; x.font = `200 430px ${serif}`; x.fillText(score, 66, 770);
  const sw = x.measureText(score).width;
  x.fillStyle = dim; x.font = `200 120px ${serif}`; x.fillText(`/ ${n * POINTS}`, 66 + sw + 24, 770);
  const gap = 24, size = Math.min(150, (W - 160 - gap * (n - 1)) / n);
  rounds.forEach((_, i) => {
    const r = p.rounds[i], px = 80 + i * (size + gap), py = 890;
    x.lineWidth = 6; x.strokeStyle = fg;
    if (r && r.ok) { x.fillStyle = acc; x.fillRect(px, py, size, size); }
    else if (!r || r.skipped) {
      x.save(); x.beginPath(); x.rect(px, py, size, size); x.clip();
      x.strokeStyle = dim; x.lineWidth = 4;
      for (let k = -size; k < size * 2; k += 22) { x.beginPath(); x.moveTo(px + k, py + size); x.lineTo(px + k + size, py); x.stroke(); }
      x.restore();
      x.strokeStyle = dim; x.lineWidth = 4; x.strokeRect(px, py, size, size);
    } else x.strokeRect(px + 3, py + 3, size - 6, size - 6);
  });
  x.fillStyle = fg; x.font = `800 68px ${serif}`; x.fillText(`${hits} of ${n} correct`, 80, 1146);
  x.fillStyle = dim; x.font = `400 34px ${mono}`; x.fillText('Read the categories. Name the article.', 80, 1262);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

function results(g, rounds, p) {
  const n = rounds.length, max = n * POINTS;
  const hits = p.rounds.filter(x => x && x.ok).length, skips = p.rounds.filter(x => x && x.skipped).length;
  if (!p.recorded) { addRun(p.sid, { at: Date.now(), score: total(p), max, hits }); p.recorded = true; saveProg(p); }
  const best = bestOf(p.sid) || 0;
  const marks = rounds.map((_, i) => { const x = p.rounds[i]; return !x || x.skipped ? '▨' : x.ok ? '■' : '□'; }).join(' ');

  const row = (rd, i) => {
    const x = p.rounds[i] || SKIPPED;
    return `<li class="row ${kindOf(x)}"><span class="rn">${pad(i + 1)}</span>
      <div class="rt"><a href="${wikiUrl(rd.article)}" target="_blank" rel="noopener">${esc(rd.article)}<span class="sr"> (opens Wikipedia in a new tab)</span></a>
      <p>${x.skipped ? '– Skipped' : `${x.ok ? '✓' : '✕'} ${esc(x.guess)}`}</p></div><em>${x.pts ? `+${x.pts}` : '0'}</em></li>`;
  };

  set(`<section class="board"><div class="bh"><b>Round by round</b><span>${hits} correct</span></div><ol class="rows">${rounds.map(row).join('')}</ol></section>
    <section class="panel"><div><h1 class="meta">Final score, ${esc(longDay(g.date))}</h1><p class="score">${total(p)}<small> / ${max}</small></p>
      <h2>${hits} of ${n} correct</h2>${g.date === todayKey() ? '<p class="cdwn">Next game in <b id="cd">00:00:00</b></p>' : ''}
      <p class="note">${n - skips} answered, ${skips} skipped</p><p class="note">Best on this game: ${best} of ${max}</p></div>
      <p class="marks" aria-hidden="true">${marks}</p>
      <div class="acts"><button class="btn" id="share" type="button">Share</button><button class="btn quiet" id="again" type="button">Play again</button><a class="btn quiet" href="#/archive">Archive</a></div></section>`);
  document.title = `${total(p)} of ${max} · ArticleGuessr`;
  startCountdown();

  $('#again').onclick = () => { saveProg(fresh(rounds)); play(); };
  $('#share').onclick = async e => {
    const b = e.currentTarget, label = b.textContent;
    const url = /^https?:/.test(location.protocol) ? location.href.split('#')[0].replace(/index\.html$/, '') : '';
    const text = [`ArticleGuessr · ${longDay(g.date)}`, `${total(p)}/${max}`, marks, url].filter(Boolean).join('\n');
    const flash = msg => { b.textContent = msg; setTimeout(() => { b.textContent = label; }, 2000); };
    if (navigator.canShare && navigator.share) {
      b.textContent = 'Preparing…';
      const blob = await resultCard(rounds, p, g, hits), file = blob && new File([blob], `articleguessr-${g.date}.png`, { type: 'image/png' });
      try {
        if (file && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text }); else await navigator.share({ text });
        return flash(label);
      } catch (err) { if (err && err.name === 'AbortError') return flash(label); } // anything else: fall back to copying
    }
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => flash('Copied to clipboard'), () => flash('Copy failed'));
  };
}

// ---------- archive ----------
function archive() {
  const t = todayKey(), list = allDays();
  if (!list.length) return emptyState();
  const by = Object.fromEntries(list.map(d => [d.date, d])), months = [...new Set(list.map(d => d.date.slice(0, 7)))].sort();
  let sel = activeDay().date, mi = months.indexOf(sel.slice(0, 7));
  if (mi < 0) mi = months.length - 1;

  const state = x => x.locked ? 'locked' : x.mid ? 'mid' : x.finished ? 'done' : 'open';
  const status = (d, x) => x.locked ? `opens ${shortDay(d.date)}` : x.mid ? `in progress, round ${x.r + 1} of ${x.n}` : x.finished ? 'completed' : 'not played';
  const btn = (act, d, text, quiet) => `<button class="btn${quiet ? ' quiet' : ''} sm" data-act="${act}" data-date="${d.date}">${text}</button>`;
  const acts = (d, x) => x.locked ? ''
    : x.mid ? btn('play', d, 'Resume')
    : x.complete ? btn('results', d, 'Results', true) + btn('replay', d, 'Replay')
    : btn('play', d, x.finished ? 'Play again' : 'Play');

  const row = d => {
    const x = dayInfo(d);
    return `<li class="arow cur"><div class="at"><b>${esc(longDay(d.date, true))}</b>${d.date === t ? '<i class="tag">Today</i>' : ''}<span>${d.title ? `${esc(d.title)}, ` : ''}${x.n} rounds, ${status(d, x)}</span></div>
      <div class="asc"><em>${x.best === null ? '–' : x.best}</em><small>${x.best === null ? (x.locked ? 'locked' : 'not played yet') : `best of ${x.n * POINTS}, ${x.plays} ${x.plays === 1 ? 'play' : 'plays'}`}</small></div><div class="aa">${acts(d, x)}</div></li>`;
  };

  const mini = d => {
    const p = progMap()[dayId(d)];
    if (!p || !p.rounds.length) return '';
    return `<ol class="mini">${p.rounds.map((x, i) => `<li><span>${pad(i + 1)}</span><a href="${wikiUrl(d.rounds[i].article)}" target="_blank" rel="noopener">${esc(d.rounds[i].article)}<span class="sr"> (opens Wikipedia in a new tab)</span></a><i>${x.skipped ? '– skipped' : `${x.ok ? '✓' : '✕'} ${esc(x.guess)}`}</i><em>${x.pts ? `+${x.pts}` : '0'}</em></li>`).join('')}</ol>`;
  };

  const calendar = () => {
    const ym = months[mi], [y, mo] = ym.split('-').map(Number), lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7, days = new Date(y, mo, 0).getDate();
    const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}-${pad(i + 1)}`)];
    const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));
    const cell = k => {
      if (!k) return '<i></i>';
      const d = by[k];
      if (!d) return `<span class="cd none"><em>${+k.slice(8)}</em></span>`;
      const x = dayInfo(d), small = x.locked ? 'soon' : x.mid ? `${x.answered}/${x.n}` : x.finished ? x.best : 'play';
      // The visible text ("10", "play") comes first in the accessible name, then a hidden full description.
      return `<button type="button" class="cd ${state(x)}${k === sel ? ' sel' : ''}${k === t ? ' today' : ''}" data-date="${k}" aria-pressed="${k === sel}"><em>${+k.slice(8)}</em><small>${esc(small)}</small><span class="sr">, ${esc(longDay(k))}: ${esc(status(d, x))}${x.best !== null ? `, best ${x.best}` : ''}</span></button>`;
    };
    return `<div class="calh"><button class="btn quiet sm" id="pm" type="button" aria-label="Previous month" ${mi <= 0 ? 'disabled' : ''}>‹</button><b>${esc(monthName(ym))}</b><button class="btn quiet sm" id="nm" type="button" aria-label="Next month" ${mi >= months.length - 1 ? 'disabled' : ''}>›</button></div>
      <div class="cal">${weekdays.map(w => `<b class="cw">${esc(w)}</b>`).join('')}${cells.map(cell).join('')}</div>`;
  };

  const html = () => {
    const st = stats(), d = by[sel];
    return `<div class="stu"><header class="sth"><div><p class="meta">Archive</p><h1>Every day so far</h1><p class="note">Each day is a game of ${list[0].rounds.length} rounds. Pick a date to play it, resume it, or play it again.</p></div>
      <dl class="strip"><div><dt>day streak</dt><dd>${st.streak}</dd></div><div><dt>days played</dt><dd>${st.played}<small>/${st.total}</small></dd></div><div><dt>best score</dt><dd>${st.best || '–'}</dd></div></dl></header>
      <div class="archgrid"><section class="calbox">${calendar()}</section><section class="selbox"><p class="meta">Selected day</p><ol class="arch one">${d ? row(d) : ''}</ol>${d ? mini(d) : ''}</section></div></div>`;
  };

  const bind = focus => {
    app.querySelectorAll('.cd[data-date]').forEach(b => { b.onclick = () => { sel = b.dataset.date; paint(sel); }; });
    const pm = $('#pm'), nm = $('#nm');
    if (pm) pm.onclick = () => { mi--; paint(); };
    if (nm) nm.onclick = () => { mi++; paint(); };
    app.querySelectorAll('[data-act]').forEach(b => {
      b.onclick = () => {
        const d = by[b.dataset.date];
        setPin(d.date);
        if (b.dataset.act === 'replay') saveProg(fresh(d.rounds.map(lite)));
        location.hash = '#/play';
      };
    });
    if (focus) { const f = app.querySelector(`.cd[data-date="${focus}"]`); if (f) f.focus(); }
  };
  const paint = focus => { app.innerHTML = html(); bind(focus); };
  set('', 'page studio');
  paint();
  document.title = 'Archive · ArticleGuessr';
}

// ---------- theme, display settings and "How to play" ----------
const applyTheme = t => {
  document.documentElement.dataset.theme = t;
  const b = $('#theme');
  if (b) { b.textContent = t === 'dark' ? 'Use light theme' : 'Use dark theme'; b.setAttribute('aria-pressed', String(t === 'dark')); }
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.removeAttribute('media'); m.setAttribute('content', t === 'dark' ? '#0F1512' : '#E7EBE5'); });
};
const prefs = () => ({ size: 'm', ...read(KEYS.prefs, {}) });
const applyPrefs = () => {
  const p = prefs();
  document.documentElement.dataset.size = p.size;
  document.querySelectorAll('#dpanel [data-size]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === p.size)));
};
const setPref = (k, v) => { write(KEYS.prefs, { ...prefs(), [k]: v }); applyPrefs(); };

const HOW = `<h2>How to play</h2>
  <ol class="hw"><li><b>Read the categories.</b> Each round lists Wikipedia categories that one hidden article belongs to.</li>
  <li><b>Type the article’s title</b> in the black bar and press Enter. You get one guess. Capital letters, accents and punctuation don’t matter.</li>
  <li><b>See the answer at once,</b> with a short description. A correct title scores ${POINTS} points.</li>
  <li><b>One new game a day.</b> Come back tomorrow, or play earlier days from the archive.</li></ol>
  <div class="hwx"><p class="meta">Example</p><p class="hwc">Calderas of Indonesia | VEI-6 volcanoes | Sunda Strait</p><p class="hwa">Krakatoa</p></div>
  <button class="btn" id="hwok" type="button">Got it</button>`;

const openHow = () => {
  let dlg = $('#how');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'how';
    dlg.setAttribute('aria-label', 'How to play');
    dlg.innerHTML = HOW;
    document.body.appendChild(dlg);
    $('#hwok', dlg).onclick = () => { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); };
  }
  const panel = $('#dpanel');
  if (panel) { panel.hidden = true; const d = $('#disp'); if (d) d.setAttribute('aria-expanded', 'false'); }
  if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
};

// ---------- start-up ----------
try { localStorage.setItem('ag.t', '1'); localStorage.removeItem('ag.t'); }
catch { document.body.insertAdjacentHTML('beforeend', '<p class="toast" role="status">Your browser is blocking storage, so progress and games can’t be saved.</p>'); }

applyTheme(read(KEYS.theme, window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#theme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; write(KEYS.theme, t); applyTheme(t); };

{
  const btn = $('#disp'), panel = $('#dpanel');
  const toggle = open => { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.onclick = e => { e.stopPropagation(); toggle(panel.hidden); };
  document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) toggle(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); btn.focus(); } });
  panel.querySelectorAll('[data-size]').forEach(b => { b.onclick = () => setPref('size', b.dataset.size); });
  $('#howbtn').onclick = openHow;
  applyPrefs();
}

const routes = { '': home, '/': home, '/play': play, '/archive': archive };
const render = () => (routes[route()] || home)();

if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {}); // installable + offline
addEventListener('hashchange', render);
addEventListener('pageshow', checkNewDay);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkNewDay(); });
setInterval(checkNewDay, 60000);
render();
})();
