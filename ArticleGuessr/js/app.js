(() => {
const K = { setup: 'articleguessr.setup.v1', prog: 'articleguessr.progress.v1' };
const POINTS = 100, N = 5;
const SAMPLE = [
  { categories: ['Calderas of Indonesia', 'VEI-6 volcanoes', 'Stratovolcanoes of Indonesia', 'Volcanic islands of Indonesia', 'Sunda Strait'], article: 'Krakatoa', aliases: 'Krakatau' },
  { categories: ['Neo-grotesque sans-serif typefaces', 'Swiss design', 'Linotype typefaces', 'Typefaces and fonts introduced in 1957'], article: 'Helvetica', aliases: '' },
  { categories: ['Western Roman emperors', '5th-century Roman emperors', 'Deposed monarchs', '460s births', 'Year of death unknown'], article: 'Romulus Augustulus', aliases: 'Romulus Augustus' },
  { categories: ['Cyclades', 'Calderas of Greece', 'Volcanoes of Greece', 'Islands of the South Aegean'], article: 'Santorini', aliases: 'Thera' },
  { categories: ['English-language films', 'Films based on short fiction', 'Films based on works by Stephen King', 'Best Picture Academy Award nominees', '1994 films', 'Prison films'], article: 'The Shawshank Redemption', aliases: '' }
];
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// Matching: ignore case, accents, punctuation, extra whitespace and a leading "the".
// Otherwise the guess must equal the title or a host-listed alias exactly: no partial or fuzzy credit.
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');
const accepted = r => [r.article, ...(r.aliases || '').split(',')].map(norm).filter(Boolean);
const isMatch = (guess, r) => { const g = norm(guess); return g !== '' && accepted(r).includes(g); };

const getSetup = () => { const s = read(K.setup, null); return Array.isArray(s) && s.length === N ? s.map(r => r.categories ? r : { ...r, categories: [r.category || ''] }) : SAMPLE; };
const sid = s => { let h = 0; for (const c of JSON.stringify(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return String(h); };
const fresh = s => ({ sid: sid(s), r: 0, stage: 'guess', rounds: [] });
const getProg = s => { const p = read(K.prog, null); return p && p.sid === sid(s) ? p : fresh(s); };
const total = p => p.rounds.reduce((t, x) => t + x.pts, 0);

const ticks = (p, cur) => `<div class="ticks" aria-hidden="true">${[...Array(N)].map((_, i) =>
  `<i class="${p.rounds[i] && (i < cur || p.stage === 'reveal') ? (p.rounds[i].ok ? 'ok' : 'miss') : i === cur ? 'now' : ''}"></i>`).join('')}</div>`;
const set = html => { app.innerHTML = html; app.focus({ preventScroll: true }); window.scrollTo(0, 0); };

function home() {
  const s = getSetup(), p = getProg(s);
  const started = p.r > 0 || p.stage !== 'guess';
  const label = p.r >= N ? 'Play again' : started ? `Resume round ${p.r + 1}` : 'Start today’s game';
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  set(`<p class="meta">${date}</p>
    <h1>Read the category.<br>Name the article.</h1>
    <p class="lede">Five rounds. Each one gives you a category and asks for the exact title of the Wikipedia-style article behind it. ${POINTS} points for every title you get right.</p>
    <a class="btn" href="#/play" id="go">${label}</a>
    <p class="note" style="margin-top:2rem">Progress and the host’s setup are saved in this browser only.</p>`);
  $('#go').onclick = () => { if (p.r >= N) { write(K.prog, fresh(s)); } };
}

function play() {
  const s = getSetup(); let p = getProg(s);
  if (p.r >= N) return results(s, p);
  const r = p.r, rd = s[r], cur = p.rounds[r];
  if (p.stage === 'reveal') return reveal(s, p);
  const locked = p.stage === 'locked';
  set(`${ticks(p, r)}<p class="meta">Round ${r + 1} of ${N}</p>
    <p class="meta">Categories this article belongs to</p>
    <ul class="cats">${rd.categories.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
    <form class="guess" novalidate>
      <label for="g">Which article is this?</label>
      <input id="g" autocomplete="off" spellcheck="false" ${locked ? 'readonly' : ''} value="${locked ? esc(cur.guess) : ''}">
      <p class="err" role="alert"></p>
      ${locked ? '<button class="btn" type="button" id="next">Next</button>' : '<button class="btn" type="submit">Submit guess</button>'}
    </form>`);
  const inp = $('#g');
  if (locked) { $('#next').onclick = () => { p.stage = 'reveal'; write(K.prog, p); play(); }; $('#next').focus(); return; }
  inp.focus();
  $('form').onsubmit = e => {
    e.preventDefault();
    const g = inp.value.trim();
    if (!g) { $('.err').textContent = 'Type the article title you think this category points to.'; inp.focus(); return; }
    const ok = isMatch(g, rd);
    p.rounds[r] = { guess: g, ok, pts: ok ? POINTS : 0 };
    p.stage = 'locked'; write(K.prog, p); play();
  };
}

function reveal(s, p) {
  const r = p.r, rd = s[r], x = p.rounds[r], last = r === N - 1;
  set(`${ticks(p, r)}<p class="meta">Round ${r + 1} of ${N}</p>
    <h1><span class="answer">${esc(rd.article)}</span></h1>
    <p class="verdict ${x.ok ? 'ok' : 'miss'}">${x.ok ? 'Correct.' : 'Not this time.'}</p>
    <p class="note">You guessed: ${esc(x.guess)}</p>
    <div class="pts"><div><b>+${x.pts}</b><span>this round</span></div><div><b>${total(p)}</b><span>running total</span></div></div>
    <button class="btn" id="n">${last ? 'See final results' : 'Next Article'}</button>`);
  $('#n').focus();
  $('#n').onclick = () => { p.r++; p.stage = 'guess'; write(K.prog, p); play(); };
}

function results(s, p) {
  const hits = p.rounds.filter(x => x.ok).length;
  set(`<p class="meta">Final results</p>
    <p class="score">${total(p)}<small> / ${N * POINTS}</small></p>
    <h2 style="margin-top:1rem">${hits} of ${N} articles named correctly</h2>
    <ol class="recap">${s.map((rd, i) => { const x = p.rounds[i]; return `<li><span class="c">${esc(rd.categories.join(' | '))}</span>
      <span class="a">${esc(rd.article)}</span><span class="p ${x.ok ? 'ok' : 'miss'}">${x.pts}</span>
      <span class="c">Your guess: ${esc(x.guess)}</span></li>`; }).join('')}</ol>
    <button class="btn" id="again">Play again</button><a class="btn quiet" href="#/host">Host setup</a>`);
  $('#again').onclick = () => { write(K.prog, fresh(s)); play(); };
}

function host() {
  const s = getSetup();
  set(`<h1>Host setup</h1>
    <p class="lede">Set the five rounds for today. Players see only the categories (one per line below) and must type the article. Copy them from the bottom of the Wikipedia page, and leave out any that repeat a word from the title. Aliases are optional, comma-separated titles that also earn points. Saving changes starts everyone’s game over in this browser.</p>
    <form id="hf" novalidate>${s.map((rd, i) => `<fieldset><legend>Round ${i + 1}</legend><div class="row">
      <div class="field full"><label for="c${i}">Categories shown to players (one per line, at least 3)</label><textarea id="c${i}" rows="5">${esc(rd.categories.join('\n'))}</textarea></div>
      <div class="field"><label for="a${i}">Correct article</label><input id="a${i}" value="${esc(rd.article)}"></div>
      <div class="field"><label for="l${i}">Also accept (aliases)</label><input id="l${i}" value="${esc(rd.aliases || '')}"></div>
    </div></fieldset>`).join('')}
      <p class="err" role="alert" id="msg"></p>
      <button class="btn" type="submit">Save setup</button>
      <button class="btn quiet" type="button" id="reset">Load sample rounds</button>
    </form>`);
  const msg = $('#msg');
  $('#hf').onsubmit = e => {
    e.preventDefault();
    const next = s.map((_, i) => ({ categories: $('#c' + i).value.split('\n').map(x => x.trim()).filter(Boolean), article: $('#a' + i).value.trim(), aliases: $('#l' + i).value.trim() }));
    const bad = next.findIndex(r => r.categories.length < 3 || !r.article);
    if (bad > -1) { msg.className = 'err'; msg.textContent = `Round ${bad + 1} needs an article and at least 3 categories.`; return; }
    const leaks = next.map((r, i) => { const w = norm(r.article).split(' ').filter(x => x.length > 3);
      return r.categories.some(c => norm(c).split(' ').some(x => w.includes(x))) ? i + 1 : 0; }).filter(Boolean);
    if (!write(K.setup, next)) { msg.textContent = 'This browser blocked saving. Check that storage is allowed for this site.'; return; }
    localStorage.removeItem(K.prog);
    msg.className = 'ok-msg'; msg.textContent = 'Saved. The next game uses these five rounds.' + (leaks.length ? ` Check round ${leaks.join(', ')}: a category repeats a word from the answer.` : '');
  };
  $('#reset').onclick = () => { write(K.setup, SAMPLE); localStorage.removeItem(K.prog); host(); };
}

const routes = { '': home, '/': home, '/play': play, '/host': host };
const go = () => (routes[location.hash.slice(1)] || home)();
addEventListener('hashchange', go);
go();
})();