(() => {
const K = { prog: 'articleguessr.progress.v1', cur: 'articleguessr.current.v1', runs: 'articleguessr.runs.v1', prefs: 'articleguessr.prefs.v1', seen: 'articleguessr.seen.v1' };
const POINTS = 100, ROUNDS = 5; // a daily game is five rounds
const mk = (article, aliases, cats, summary = '') => ({ article, aliases, categories: cats.split('|'), summary });
// A game has one round per entry here (5). Days come from days.js; these are the built-in fallback.
// Sample categories are illustrative: replace them with the real ones from each Wikipedia page.
const SAMPLE = [
  mk('Krakatoa', 'Krakatau', 'Calderas of Indonesia|VEI-6 volcanoes|Stratovolcanoes of Indonesia|Volcanic islands of Indonesia|Sunda Strait', 'Volcanic island in Indonesia’s Sunda Strait. Its 1883 eruption was among the deadliest and loudest in recorded history, setting off tsunamis that killed tens of thousands of people.'),
  mk('Helvetica', '', 'Neo-grotesque sans-serif typefaces|Swiss design|Linotype typefaces|Typefaces and fonts introduced in 1957', 'Neo-grotesque sans-serif typeface designed in Switzerland in 1957 by Max Miedinger and Eduard Hoffmann, now one of the most widely used fonts in signage and branding.'),
  mk('Romulus Augustulus', 'Romulus Augustus', 'Western Roman emperors|5th-century Roman emperors|Deposed monarchs|460s births|Year of death unknown', 'Last emperor of the Western Roman Empire, a teenager deposed by the Germanic general Odoacer in 476, the date traditionally given for the empire’s fall.'),
  mk('Santorini', 'Thera', 'Cyclades|Calderas of Greece|Volcanoes of Greece|Islands of the South Aegean', 'Volcanic island in the Aegean Sea whose caldera formed in a huge Bronze Age eruption that buried the Minoan town of Akrotiri.'),
  mk('The Shawshank Redemption', '', 'English-language films|Films based on short fiction|Films based on works by Stephen King|Best Picture Academy Award nominees|1994 films|Prison films', '1994 prison drama directed by Frank Darabont, based on a Stephen King novella, about banker Andy Dufresne’s friendship with fellow inmate Red.')
];

// Built-in demo days (shown until a player joins a real game): today and the two days before.
const DEMO_B = [
  mk('Mona Lisa', 'La Gioconda', '1500s paintings|Paintings by Leonardo da Vinci|Portraits of women|Paintings in the Louvre|Collection of Francis I of France', 'Portrait painted by Leonardo da Vinci in the early 16th century, widely considered the most famous painting in the world and held in the Louvre.'),
  mk('Tardigrade', 'Water bear', 'Ecdysozoa|Extremophiles|Animals described in 1773|Cambrian first appearances', 'Microscopic eight-legged animals that can survive extreme heat, cold, radiation and even the vacuum of space.'),
  mk('Rosetta Stone', '', 'Egyptian hieroglyphs|Ptolemaic Kingdom|Individual objects in the British Museum|Multilingual texts|Egyptian inscriptions', 'Slab inscribed with a decree in three scripts in 196 BC; it let scholars decipher Egyptian hieroglyphs in the 1820s.'),
  mk('Stonehenge', '', 'Archaeological sites in Wiltshire|Stone circles in England|Megalithic monuments in England|World Heritage Sites in England|Tourist attractions in Wiltshire', 'Prehistoric ring of standing stones on Salisbury Plain in England, built in stages starting around 3000 BC.'),
  mk('Chernobyl disaster', 'Chernobyl', '1986 in Ukraine|Nuclear accidents and incidents in the Soviet Union|Radioactive contamination|Man-made disasters', 'April 1986 explosion at the Chernobyl nuclear plant in the Soviet Union, the worst nuclear power accident in history.')
];
const DEMO_C = [
  mk('Machu Picchu', '', 'Inca sites|World Heritage Sites in Peru|Archaeological sites in Cusco Region|New 7 Wonders of the World', '15th-century Inca citadel high in the Peruvian Andes, abandoned after the Spanish conquest and made known to the wider world in 1911.'),
  mk('Marie Curie', 'Marie Skłodowska-Curie, Maria Skłodowska', '1867 births|1934 deaths|Nobel laureates in Physics|Nobel laureates in Chemistry|Polish emigrants to France', 'Physicist and chemist who pioneered research on radioactivity and won Nobel Prizes in both Physics and Chemistry.'),
  mk('Pangaea', 'Pangea', 'Supercontinents|Paleozoic paleogeography|Mesozoic paleogeography|Plate tectonics|Historical geology', 'Supercontinent that existed about 300 million years ago, before breaking apart into today’s continents.'),
  mk('Moby-Dick', 'Moby Dick', '1851 American novels|American adventure novels|Novels set on ships|Whaling in literature|Maritime fiction', 'Herman Melville’s 1851 novel about Captain Ahab’s obsessive hunt for a giant white whale.'),
  mk('Casablanca (film)', 'Casablanca', '1942 films|Best Picture Academy Award winners|Films set in Morocco|American romantic drama films|Warner Bros. films', '1942 romantic drama starring Humphrey Bogart and Ingrid Bergman, set in Morocco during the Second World War.')
];
let N = ROUNDS; // rounds in the active game (set by getSetup)
const MAX_ROUNDS = 10; // ceiling on rounds per day when reading days.js
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const THEME = 'articleguessr.theme.v1';
const applyTheme = t => { document.documentElement.dataset.theme = t; const b = $('#theme');
  if (b) { b.textContent = t === 'dark' ? 'Use light theme' : 'Use dark theme'; b.setAttribute('aria-pressed', String(t === 'dark')); } };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// Matching: ignore case, accents, punctuation, extra whitespace and a leading "the".
// Otherwise the guess must equal the title or a host-listed alias exactly: no partial or fuzzy credit.
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');
const isMatch = (guess, r) => { const g = norm(guess); return g !== '' && [r.article, ...(r.aliases || '').split(',')].map(norm).includes(g); };


// Feedback on a miss: how close was the guess? (Scoring stays exact.)
const lev = (a, b) => { const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n]; };
const nearMiss = (guess, r) => { const g = norm(guess); if (!g) return '';
  const forms = [r.article, ...(r.aliases || '').split(',')].map(norm).filter(Boolean); if (!forms.length) return '';
  const dist = Math.min(...forms.map(f => lev(g, f))), near = forms.find(f => lev(g, f) === dist);
  if (dist <= 2 && near.length >= 5) return `So close: ${dist === 1 ? 'one letter' : 'two letters'} off. Near misses don’t score.`;
  const shared = [...new Set(g.split(' ').filter(w => w.length > 2 && forms.some(f => f.split(' ').includes(w))))];
  return shared.length ? `You had part of it right: ${shared.map(w => `“${esc(w)}”`).join(', ')}.` : ''; };

// ---------- days: every day is one five-round game ----------
const lite = r => ({ article: String(r.article || ''), aliases: String(r.aliases || ''), categories: (r.categories || []).map(String), summary: String(r.summary || '') });
const keyOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => keyOf(new Date());
const shift = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
const validKey = k => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && keyOf(parseKey(k)) === k;
const longDay = (k, year) => parseKey(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
const shortDay = k => parseKey(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const monthName = ym => parseKey(ym + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const demoDays = () => [SAMPLE, DEMO_B, DEMO_C].map((rounds, i) => ({ date: shift(todayKey(), -i), title: '', rounds: rounds.map(lite), demo: true }));
const normDay = x => { try { const rounds = (x.rounds || []).slice(0, MAX_ROUNDS).map(lite);
  return validKey(x.date) && rounds.length && rounds.every(r => r.article.trim() && r.categories.length) ? { date: x.date, title: String(x.title || ''), rounds } : null; } catch { return null; } };
// Players get every day from days.js (window.ARTICLEGUESSR_DAYS). With none, the built-in demo days are shown.
const fileDays = () => (Array.isArray(window.ARTICLEGUESSR_DAYS) ? window.ARTICLEGUESSR_DAYS : []).map(normDay).filter(Boolean);
const allDays = () => { const by = new Map(); fileDays().forEach(d => by.set(d.date, d)); // one game per date: a later entry replaces an earlier one
  return (by.size ? [...by.values()] : demoDays()).sort((a, b) => b.date.localeCompare(a.date)); };
const isOpen = d => d.date <= todayKey(); // future days stay locked until their date
const activeDay = () => { const list = allDays(), t = todayKey(), pick = read(K.cur, null), by = k => list.find(d => d.date === k);
  return (pick && pick <= t && by(pick)) || by(t) || list.find(d => d.date <= t) || list[list.length - 1]; };
const getSetup = () => { const g = activeDay(); N = g.rounds.length; return g.rounds.map(lite); };
const sid = s => { let h = 0; for (const c of JSON.stringify(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return String(h); };
const dayId = d => sid(d.rounds.map(lite));
const fresh = s => ({ sid: sid(s), r: 0, rounds: [] });
// Progress and finished plays are kept per game, so switching days never loses your place.
const progMap = () => { const m = read(K.prog, {}); return m && m.sid !== undefined && Array.isArray(m.rounds) ? { [m.sid]: m } : (m && typeof m === 'object' ? m : {}); };
const getProg = s => { const p = progMap()[sid(s)]; return p && p.sid === sid(s) && Array.isArray(p.rounds) ? p : fresh(s); };
const saveProg = p => { const m = progMap(); m[p.sid] = p; write(K.prog, m); };
const getRuns = id => { const r = read(K.runs, {})[id]; return Array.isArray(r) ? r : []; };
const addRun = (id, run) => { const m = read(K.runs, {}); m[id] = [...getRuns(id), run].slice(-20); write(K.runs, m); };
const bestOf = id => { const r = getRuns(id); return r.length ? Math.max(...r.map(x => x.score)) : null; };
const dayInfo = d => { const id = dayId(d), p = progMap()[id], n = d.rounds.length;
  return { id, n, r: p ? p.r : 0, done: !!p && p.r >= n, mid: !!p && p.r > 0 && p.r < n, locked: !isOpen(d), best: bestOf(id), plays: getRuns(id).length }; };
const stats = () => { const days = allDays().filter(isOpen), by = new Map(days.map(d => [d.date, d])), done = d => d && dayInfo(d).done;
  let k = todayKey(), streak = 0; if (!done(by.get(k))) k = shift(k, -1);
  while (done(by.get(k))) { streak++; k = shift(k, -1); }
  return { played: days.filter(done).length, total: days.length, streak, best: Math.max(0, ...days.map(d => dayInfo(d).best || 0)) }; };
// "Next game in hh:mm:ss", counting down to local midnight.
let timer = null;
const untilMidnight = () => { const n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1), t = Math.max(0, Math.floor((m - n) / 1000));
  return [Math.floor(t / 3600), Math.floor(t % 3600 / 60), t % 60].map(v => String(v).padStart(2, '0')).join(':'); };
const startCountdown = () => { const el = $('#cd'); if (!el) return; const tick = () => { el.textContent = untilMidnight(); }; tick(); timer = setInterval(tick, 1000); };
const total = p => p.rounds.reduce((t, x) => t + (x ? x.pts : 0), 0);
const skipped = { guess: '', ok: false, pts: 0, skipped: true };

const ticks = p => `<div class="ticks" role="img" aria-label="Round ${Math.min(p.r + 1, N)} of ${N}">${[...Array(N)].map((_, i) => {
  const x = p.rounds[i]; return `<i class="${x ? (x.skipped ? 'skip' : x.ok ? 'ok' : 'miss') : i === p.r ? 'now' : ''}"></i>`; }).join('')}</div>`;
const set = (html, cls = 'stage') => { clearInterval(timer); app.className = cls; app.innerHTML = html; app.focus({ preventScroll: true }); window.scrollTo(0, 0); };
const pad = n => String(n).padStart(2, '0');
const chips = list => list.map(c => `<span class="cat" role="listitem"><span>${esc(c)}</span></span>`).join('&nbsp;<span class="sep" aria-hidden="true">|</span> ');
const fitCats = root => { const flow = $('.flow', root), foot = $('.foot', root); if (!flow || !foot) return;
  const fit = () => { let fs = 3.5; flow.style.setProperty('--fs', fs + 'rem');
    while (fs > 0.8 && foot.scrollHeight > foot.clientHeight + 1) { fs -= 0.05; flow.style.setProperty('--fs', fs.toFixed(2) + 'rem'); }
    foot.classList.toggle('more', foot.scrollHeight > foot.clientHeight + 1); };
  fit(); if (window.ResizeObserver) new ResizeObserver(fit).observe(foot); if (document.fonts) document.fonts.ready.then(fit); };
// Progress rail: the five rounds as a row of segments, with the round number and running score.
const rail5 = (s, p) => `<header class="rr"><div class="rtop"><p class="rnd"><b>${pad(Math.min(p.r + 1, N))}</b><span>/ ${pad(N)}</span></p><p class="sc"><b>${total(p)}</b><span>points</span></p></div>
  <ol class="rsegs" style="--n:${N}">${s.map((rd, i) => { const x = p.rounds[i], k = x ? (x.skipped ? 'skip' : x.ok ? 'ok' : 'miss') : i === p.r ? 'now' : '', what = x ? (x.skipped ? 'skipped' : x.ok ? 'correct' : 'incorrect') : i === p.r ? 'in play' : 'to come';
    return `<li class="${k}" aria-label="Round ${i + 1}: ${what}"><span>${pad(i + 1)}</span><b>${x ? esc(rd.article) : i === p.r ? 'In play' : '—'}</b><em>${x ? (x.skipped ? 'skip' : x.pts ? '+' + x.pts : '0') : ''}</em></li>`; }).join('')}</ol></header>`;
const cluesBox = (rd, pop) => { const n = rd.categories.length;
  return `<section class="clues"><div class="bh"><b>Which article has these categories?</b><span>${n} categories</span></div><div class="foot"><p class="meta"><span>Categories</span><span>${n}</span></p>
    <div class="wall flow${pop ? ' pop' : ''}${n > 9 ? ' many' : ''}" role="list">${chips(rd.categories)}</div></div></section>`; };
const board = (title, note, body, cls = '') => `<section class="board ${cls}"><div class="bh"><b>${title}</b><span>${note}</span></div>${body}</section>`;
const head = p => `<header class="ph"><div class="rnd"><b>${pad(Math.min(p.r + 1, N))}</b><span>/ ${pad(N)}</span></div><p class="sc"><b>${total(p)}</b><span>points</span></p></header>${ticks(p)}`;
const ledger = (s, p) => `<ol class="ledger">${s.map((rd, i) => { const x = p.rounds[i];
  return `<li class="${x ? (x.skipped ? 'skip' : x.ok ? 'ok' : 'miss') : i === p.r ? 'now' : ''}"><span>${pad(i + 1)}</span><b>${x ? esc(rd.article) : i === p.r ? 'In play' : '—'}</b><em>${x ? (x.skipped ? 'skip' : x.pts ? '+' + x.pts : '0') : ''}</em></li>`; }).join('')}</ol>`;


function home() {
  const s = getSetup(), p = getProg(s), g = activeDay(), t = todayKey(), isToday = g.date === t, locked = !isOpen(g), st = stats();
  const dt = parseKey(g.date), done = p.r >= N, best = bestOf(p.sid);
  const label = locked ? `Opens ${shortDay(g.date)}` : done ? 'Play again' : p.r > 0 ? `Resume round ${p.r + 1} of ${N}` : isToday ? 'Start today’s game' : `Play ${shortDay(g.date)}`;
  const status = locked ? `Opens ${longDay(g.date)}.` : done ? `Completed: ${total(p)} of ${N * POINTS}${best !== null && best > total(p) ? `, your best is ${best}` : ''}.` : p.r > 0 ? `In progress: round ${p.r + 1} of ${N}, ${total(p)} points.` : 'Not started yet.';
  set(`<section class="hl"><p class="dateline"><b>${dt.getDate()}</b><span>${esc(dt.toLocaleDateString(undefined, { weekday: 'long' }))}<br>${esc(dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</span></p>
    <div class="hmain"><h1>Read the categories.<br><strong>Name the article.</strong></h1>
    <p class="lede">${g.title ? `<b>${esc(g.title)}.</b> ` : ''}A daily guessing game built on Wikipedia’s category tags. Each round hides one article, and its categories are your only clues.</p>
    <div class="cta">${locked ? `<p class="btn off big" aria-disabled="true">${esc(label)}</p>` : `<a class="btn big" href="#/play" id="go">${label}</a>`}<button class="cta2 as-link" id="how2" type="button">How to play</button></div></div></section>
    <aside class="panel ticket">
    <div><p class="meta">${isToday ? 'Today' : 'From the archive'}${g.demo ? ', demo' : ''}</p>${ticks(p)}<p class="note" id="st">${esc(status)}${st.streak > 1 && !done ? esc(` ${st.streak}-day streak, keep it going.`) : ''}</p>${isToday && done ? '<p class="cdwn">Next game in <b id="cd">00:00:00</b></p>' : ''}</div>
    <dl class="facts"><div><dt>Day streak</dt><dd>${st.streak}</dd></div><div><dt>Days played</dt><dd>${st.played}<small>/${st.total}</small></dd></div><div><dt>Best score</dt><dd>${st.best || '–'}</dd></div></dl>
    <div>${!isToday ? '<button class="btn quiet" id="bt" type="button">Back to today</button>' : ''}<p class="note">Your progress stays in this browser.</p></div></aside>`, 'hero');
  document.title = 'ArticleGuessr: a daily game of Wikipedia categories';
  const go = $('#go'); if (go) go.onclick = () => { if (p.r >= N) saveProg(fresh(s)); };
  const bt = $('#bt'); if (bt) bt.onclick = () => { localStorage.removeItem(K.cur); home(); };
  const h2 = $('#how2'); if (h2) h2.onclick = openHow;
  startCountdown();
}

function play() {
  const s = getSetup(), p = getProg(s);
  if (p.r >= N) return results(s, p);
  if (p.rounds[p.r]) return reveal(s, p); // answered rounds can never show the form again
  const rd = s[p.r], n = rd.categories.length;
  set(`<div class="game">${rail5(s, p)}${cluesBox(rd, true)}
    <form class="acol" novalidate>
      <div class="agroup">
      <label for="g"><span>Article title</span><span>hidden</span></label>
      <div class="titlebar"><input id="g" placeholder="Type the article title" autocomplete="off" autocapitalize="none" enterkeyhint="go" maxlength="140" spellcheck="false"></div>
      <div class="acts"><button class="btn big" type="submit">Submit</button><button class="btn quiet big" type="button" id="skip">Skip</button></div>
      <p class="err" role="alert"></p></div>
    </form></div>`, 'stage gm');
  fitCats(document);
  document.title = `Round ${p.r + 1} of ${N} · ArticleGuessr`;
  const inp = $('#g'); if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) inp.focus(); // don't pop the keyboard over the clues on phones
  const finish = x => { if (p.rounds[p.r]) return; if (navigator.vibrate) navigator.vibrate(x.ok ? 12 : x.skipped ? 0 : [8, 40, 8]); p.rounds[p.r] = x; saveProg(p); play(); }; // guarded: one answer per round
  $('form').onsubmit = e => {
    e.preventDefault();
    const g = inp.value.trim();
    if (!g) { $('.err').textContent = 'Type a title to submit, or press Skip.'; inp.focus(); return; }
    const ok = isMatch(g, rd);
    finish({ guess: g, ok, pts: ok ? POINTS : 0 });
  };
  $('#skip').onclick = () => finish({ ...skipped });
}

function reveal(s, p) {
  const near = p.rounds[p.r] && !p.rounds[p.r].ok && !p.rounds[p.r].skipped ? nearMiss(p.rounds[p.r].guess, s[p.r]) : '';
  const wiki = `<p class="wl"><a href="https://en.wikipedia.org/wiki/${encodeURIComponent(s[p.r].article.trim().replace(/ /g, '_'))}" target="_blank" rel="noopener">Read “${esc(s[p.r].article)}” on Wikipedia <span class="sr">(opens in a new tab)</span></a></p>`;
  const i = p.r, rd = s[i], x = p.rounds[i], last = i === N - 1, kind = x.skipped ? 'skip' : x.ok ? 'ok' : 'miss';
  const desc = rd.summary ? `<p class="desc">${esc(rd.summary)}</p>` : '';
  set(`<div class="game">${rail5(s, p)}${cluesBox(rd, false)}
    <section class="acol ans">
      <div class="rl" id="rl"><span class="badge ${kind}">${x.skipped ? '– Skipped' : x.ok ? '✓ Correct' : '✕ Incorrect'}</span><span>${x.skipped ? 'No guess submitted' : x.ok ? `+${x.pts} points` : `You guessed ${esc(x.guess)}`}</span></div>
      ${near ? `<p class="near" role="status">${near}</p>` : ''}
      <h1 class="titlebar"><span class="answer">${[...rd.article].map((ch, k) => `<span class="ch" style="--i:${k}">${esc(ch)}</span>`).join('')}</span></h1>
      <div class="body">${desc}${wiki}</div>
      <div class="acts"><button class="btn big" id="n" aria-describedby="rl">${last ? 'See results' : `Next category: ${i + 2} of ${N}`}</button></div>
    </section></div>`, 'stage gm');
  fitCats(document);
  document.title = `${rd.article} · Round ${i + 1} of ${N} · ArticleGuessr`;
  $('#n').focus({ preventScroll: true });
  $('#n').onclick = () => { if (p.r !== i) return; p.r++; saveProg(p); play(); };
}

async function resultCard(s, p, day, hits) {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext && c.getContext('2d'); if (!x) return null;
  const serif = 'Fraunces, Georgia, serif', mono = '"JetBrains Mono", "Courier New", monospace', fg = '#E7EBE5', acc = '#F4D03F', dim = 'rgba(231,235,229,.66)';
  try { await Promise.all([document.fonts.load('200 120px Fraunces'), document.fonts.load('800 60px Fraunces'), document.fonts.load('400 30px "JetBrains Mono"')]); } catch { /* fall back to system fonts */ }
  x.fillStyle = '#16201C'; x.fillRect(0, 0, W, H);
  const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = 'logo-mark-light.svg'; });
  if (img) x.drawImage(img, 80, 80, 96, 96);
  x.fillStyle = fg; x.font = `200 56px ${serif}`; x.fillText('Article', 200, 142); const w1 = x.measureText('Article').width; x.font = `800 56px ${serif}`; x.fillText('Guessr', 200 + w1, 142);
  x.font = `400 36px ${mono}`; x.fillStyle = dim; x.fillText(longDay(day.date, true), 80, 330);
  const score = String(total(p)); x.fillStyle = acc; x.font = `200 430px ${serif}`; x.fillText(score, 66, 770); const sw = x.measureText(score).width;
  x.fillStyle = dim; x.font = `200 120px ${serif}`; x.fillText(`/ ${N * POINTS}`, 66 + sw + 24, 770);
  const gap = 24, size = Math.min(150, (W - 160 - gap * (N - 1)) / N);
  s.forEach((_, i) => { const r = p.rounds[i], px = 80 + i * (size + gap), py = 890; x.lineWidth = 6; x.strokeStyle = fg;
    if (r && r.ok) { x.fillStyle = acc; x.fillRect(px, py, size, size); }
    else if (!r || r.skipped) { x.save(); x.beginPath(); x.rect(px, py, size, size); x.clip(); x.strokeStyle = dim; x.lineWidth = 4; for (let k = -size; k < size * 2; k += 22) { x.beginPath(); x.moveTo(px + k, py + size); x.lineTo(px + k + size, py); x.stroke(); } x.restore(); x.strokeStyle = dim; x.lineWidth = 4; x.strokeRect(px, py, size, size); }
    else x.strokeRect(px + 3, py + 3, size - 6, size - 6); });
  x.fillStyle = fg; x.font = `800 68px ${serif}`; x.fillText(`${hits} of ${N} correct`, 80, 1146);
  x.fillStyle = dim; x.font = `400 34px ${mono}`; x.fillText('Read the categories. Name the article.', 80, 1262);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

function results(s, p) {
  const hits = p.rounds.filter(x => x && x.ok).length, skips = p.rounds.filter(x => x && x.skipped).length;
  if (!p.recorded) { addRun(p.sid, { at: Date.now(), score: total(p), max: N * POINTS, hits }); p.recorded = true; saveProg(p); }
  const runs = getRuns(p.sid), bestRun = runs.length ? Math.max(...runs.map(r => r.score)) : 0, gday = activeDay();
  const marks = s.map((_, i) => { const x = p.rounds[i]; return !x || x.skipped ? '▨' : x.ok ? '■' : '□'; }).join(' ');
  set(`${board('Round by round', `${hits} correct`, `<ul class="wall tiles">${s.map((rd, i) => { const x = p.rounds[i] || skipped;
    return `<li class="chip tile ${x.skipped ? 'skip' : x.ok ? 'ok' : 'miss'}" title="${esc(rd.categories.join(' | '))}"><small>${pad(i + 1)}</small><b>${esc(rd.article)}</b><span>${x.skipped ? '– Skipped' : `${x.ok ? '✓' : '✕'} ${esc(x.guess)}`}</span><em>${x.pts ? '+' + x.pts : '0'}</em></li>`; }).join('')}</ul>`)}
    <section class="panel"><div><p class="meta">Final score, ${esc(longDay(gday.date))}</p><p class="score">${total(p)}<small> / ${N * POINTS}</small></p>
    <h2>${hits} of ${N} correct</h2>${gday.date === todayKey() ? '<p class="cdwn">Next game in <b id="cd">00:00:00</b></p>' : ''}<p class="note" id="st">${N - skips} answered, ${skips} skipped</p><p class="note">Best on this game: ${bestRun} of ${N * POINTS}</p></div>
    <p class="marks" aria-hidden="true">${marks}</p>
    <div class="acts"><button class="btn" id="again">Play again</button><button class="btn quiet" id="share" type="button">Share</button><a class="btn quiet" href="#/archive">Archive</a></div></section>`);
  document.title = `${total(p)} of ${N * POINTS} · ArticleGuessr`;
  startCountdown();
  $('#again').onclick = () => { saveProg(fresh(s)); play(); };
  $('#share').onclick = async e => { const b = e.target, label = b.textContent, text = `ArticleGuessr, ${longDay(gday.date)}\n${total(p)}/${N * POINTS}\n${marks}`;
    const done = msg => { b.textContent = msg; setTimeout(() => { b.textContent = label; }, 2000); };
    if (navigator.canShare && navigator.share) { b.textContent = 'Preparing…'; const blob = await resultCard(s, p, gday, hits), file = blob && new File([blob], `articleguessr-${gday.date}.png`, { type: 'image/png' });
      try { if (file && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text }); else await navigator.share({ text }); return done(label); }
      catch (err) { if (err && err.name === 'AbortError') return done(label); } } // anything else: fall back to copying
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => done('Copied to clipboard'), () => done('Copy failed')); };
}


function archive() {
  const t = todayKey(), list = allDays(), by = Object.fromEntries(list.map(d => [d.date, d])), months = [...new Set(list.map(d => d.date.slice(0, 7)))].sort();
  let sel = activeDay().date, mi = months.indexOf(sel.slice(0, 7)); if (mi < 0) mi = months.length - 1;
  const state = x => x.locked ? 'locked' : x.done ? 'done' : x.mid ? 'mid' : 'open';
  const status = (d, x) => x.locked ? `opens ${shortDay(d.date)}` : x.done ? 'completed' : x.mid ? `in progress, round ${x.r + 1} of ${x.n}` : 'not played';
  const acts = (d, x) => x.locked ? '' : `${x.done ? `<button class="btn quiet sm" data-act="results" data-date="${d.date}">Results</button><button class="btn sm" data-act="replay" data-date="${d.date}">Replay</button>` : `<button class="btn sm" data-act="play" data-date="${d.date}">${x.mid ? 'Resume' : 'Play'}</button>`}`;
  const row = d => { const x = dayInfo(d);
    return `<li class="arow${d.date === sel ? ' cur' : ''}"><div class="at"><b>${esc(longDay(d.date, true))}</b>${d.date === t ? '<i class="tag">Today</i>' : ''}<span>${d.title ? esc(d.title) + ', ' : ''}${x.n} rounds, ${status(d, x)}</span></div>
      <div class="asc"><em>${x.best === null ? '–' : x.best}</em><small>${x.best === null ? (x.locked ? 'locked' : 'not played yet') : `best of ${x.n * POINTS}, ${x.plays} ${x.plays === 1 ? 'play' : 'plays'}`}</small></div><div class="aa">${acts(d, x)}</div></li>`; };
  const mini = d => { const p = progMap()[dayId(d)]; if (!p || !p.rounds.length) return '';
    return `<ol class="mini">${p.rounds.map((x, i) => `<li><span>${pad(i + 1)}</span><b>${esc(d.rounds[i].article)}</b><i>${x.skipped ? '– skipped' : `${x.ok ? '✓' : '✕'} ${esc(x.guess)}`}</i><em>${x.pts ? '+' + x.pts : '0'}</em></li>`).join('')}</ol>`; };
  const cal = () => { const ym = months[mi], [y, mo] = ym.split('-').map(Number), lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7, n = new Date(y, mo, 0).getDate();
    const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)];
    const wk = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));
    return `<div class="calh"><button class="btn quiet sm" id="pm" type="button" aria-label="Previous month" ${mi <= 0 ? 'disabled' : ''}>‹</button><b>${esc(monthName(ym))}</b><button class="btn quiet sm" id="nm" type="button" aria-label="Next month" ${mi >= months.length - 1 ? 'disabled' : ''}>›</button></div>
      <div class="cal">${wk.map(w => `<b class="cw">${esc(w)}</b>`).join('')}${cells.map(k => { if (!k) return '<i></i>'; const d = by[k]; if (!d) return `<span class="cd none"><em>${+k.slice(8)}</em></span>`;
        const x = dayInfo(d), sm = x.locked ? 'soon' : x.done ? x.best : x.mid ? `${x.r}/${x.n}` : 'play';
        return `<button type="button" class="cd ${state(x)}${k === sel ? ' sel' : ''}${k === t ? ' today' : ''}" data-date="${k}" aria-pressed="${k === sel}" aria-label="${esc(longDay(k))}: ${esc(status(d, x))}${x.best !== null ? `, best ${x.best}` : ''}"><em>${+k.slice(8)}</em><small>${esc(sm)}</small></button>`; }).join('')}</div>`; };
  const html = () => { const st = stats(), d = by[sel];
    return `<div class="stu"><header class="sth"><div><p class="meta">Archive</p><h1>Every day so far</h1><p class="note">Each day is a five-round game. Pick a date to play it, resume it, or play it again.</p></div>
      <dl class="strip"><div><dt>day streak</dt><dd>${st.streak}</dd></div><div><dt>days played</dt><dd>${st.played}<small>/${st.total}</small></dd></div><div><dt>best score</dt><dd>${st.best || '–'}</dd></div></dl></header>
      <div class="archgrid"><section class="calbox">${cal()}</section><section class="selbox"><p class="meta">Selected day</p><ol class="arch one">${d ? row(d) : ''}</ol>${d ? mini(d) : ''}</section></div></div>`; };
  const bind = focus => { 
    app.querySelectorAll('.cd[data-date]').forEach(b => { b.onclick = () => { sel = b.dataset.date; paint(sel); }; });
    const pm = $('#pm'), nm = $('#nm'); if (pm) pm.onclick = () => { mi--; paint(); }; if (nm) nm.onclick = () => { mi++; paint(); };
    app.querySelectorAll('[data-act]').forEach(b => { b.onclick = () => { const d = by[b.dataset.date], act = b.dataset.act, id = dayId(d);
      write(K.cur, d.date); if (act === 'replay') saveProg(fresh(d.rounds.map(lite))); location.hash = '#/play'; }; });
    if (focus) { const f = app.querySelector(`.cd[data-date="${focus}"]`); if (f) f.focus(); } };
  const paint = focus => { app.innerHTML = html(); bind(focus); };
  set('', 'page studio'); paint();
}
try { localStorage.setItem('ag.t', '1'); localStorage.removeItem('ag.t'); } catch { document.body.insertAdjacentHTML('beforeend', '<p class="toast" role="status">Your browser is blocking storage, so progress and games can’t be saved.</p>'); }
applyTheme(read(THEME, window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#theme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; write(THEME, t); applyTheme(t); };

// ---------- display settings (text size, contrast, motion) and "How to play" ----------
const prefs = () => ({ size: 'm', ...read(K.prefs, {}) });
const applyPrefs = () => { const p = prefs(); document.documentElement.dataset.size = p.size;
  document.querySelectorAll('#dpanel [data-size]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.size === p.size))); };
const setPref = (k, v) => { write(K.prefs, { ...prefs(), [k]: v }); applyPrefs(); };
const HOW = `<h2>How to play</h2>
  <ol class="hw"><li><b>Read the categories.</b> Each round lists Wikipedia categories that one hidden article belongs to.</li>
  <li><b>Type the article’s title</b> in the black bar and press Enter. Capital letters and punctuation don’t matter.</li>
  <li><b>See the answer at once,</b> with a short description. A correct title scores ${POINTS} points.</li>
  <li><b>Five rounds a day.</b> Come back tomorrow for a new game, or play earlier days from the archive.</li></ol>
  <div class="hwx"><p class="meta">Example</p><p class="hwc">Calderas of Indonesia | VEI-6 volcanoes | Sunda Strait</p><p class="hwa">Krakatoa</p></div>
  <button class="btn" id="hwok" type="button">Got it</button>`;
const openHow = () => { let dlg = $('#how'); write(K.seen, 1);
  if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'how'; dlg.setAttribute('aria-label', 'How to play'); dlg.innerHTML = HOW; document.body.appendChild(dlg);
    $('#hwok', dlg).onclick = () => { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }; }
  const dp = $('#dpanel'); if (dp) { dp.hidden = true; const d = $('#disp'); if (d) d.setAttribute('aria-expanded', 'false'); }
  if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', ''); };
{ const btn = $('#disp'), panel = $('#dpanel');
  if (btn && panel) {
    const toggle = open => { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    btn.onclick = e => { e.stopPropagation(); toggle(panel.hidden); };
    document.addEventListener('click', e => { if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) toggle(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { toggle(false); btn.focus(); } });
    panel.querySelectorAll('[data-size]').forEach(b => { b.onclick = () => setPref('size', b.dataset.size); });
    $('#howbtn').onclick = openHow; }
  applyPrefs(); }

const routes = { '': home, '/': home, '/play': play, '/archive': archive };
const go = () => (routes[location.hash.slice(1)] || home)();
if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {}); // installable + offline
addEventListener('hashchange', go);
go();
})();
