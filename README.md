# ArticleGuessr

A daily game: each day is a set of rounds (five by default). Read an article's Wikipedia categories and type its title.

This repository contains the **player** side of the game only. The built-in game-hosting system (the passcode-locked
"host studio" that authored and published days) has been removed so you can build your own. This README explains how
hosting worked, what the player still expects, and how to implement a replacement.

> **"Game hosting" here means authoring and publishing the days that players play.** It does not mean web hosting.
> Deployment config in this repo (`firebase.json`, `.firebaserc`, `.github/workflows/`, `404.html`) is about serving the
> site and is unrelated to game hosting. It was left untouched.

## Files

| File | Role |
| --- | --- |
| `index.html` | The player page. Loads `days.js`, `demo.js`, `logic.js`, then `app.js`. |
| `app.js` | The player UI: routing, play loop, archive, results/share card, display settings, storage. |
| `logic.js` | Pure rules with no DOM: answer matching (`norm`, `isMatch`, `nearMiss`), date helpers, day validation (`normDay`), the progress hash (`sid`) and the demo schedule (`demoDays`). Unit-tested. |
| `styles.css` | Styles for the player page. No animations. |
| `days.js` | **The hosting seam.** Sets `window.ARTICLEGUESSR_DAYS`, the list of days players can play. Ships empty, so players see the built-in demo days. |
| `demo.js` | The built-in demo bank (`window.ARTICLEGUESSR_BANK`), used only while `days.js` is empty. See "Demo content". |
| `fonts/` | Self-hosted Fraunces, Bricolage Grotesque and JetBrains Mono (OFL licensed, see `fonts/LICENSES.md`). No third-party requests. |
| `tests/` | `node --test` unit tests for `logic.js` and the demo bank. |
| `sw.js`, `manifest.webmanifest`, `icon-*.png`, `logo-mark*.svg` | Make the player page installable and playable offline. |
| `firebase.json`, `.firebaserc`, `.github/workflows/`, `404.html` | Firebase Hosting deployment (not game hosting). |

## Adding dates (where to edit)

**Edit only `days.js`.** Each entry in its list is one date with its five rounds. The game shows exactly the rounds you
wrote for each date; a date unlocks for players on that calendar day, and future dates stay locked.

1. Open `days.js` and copy the TEMPLATE block from its header comment.
2. Paste it inside the `[ ... ]` list at the bottom of the file and remove the leading `//` from each pasted line.
3. Change `date` (format `YYYY-MM-DD`) and fill in the five rounds: `article`, `categories`, and optionally `aliases` and `summary`.
4. Save and refresh. No other file needs to change, and you don't need to touch `sw.js` (it always fetches `days.js` fresh when online).

```js
window.ARTICLEGUESSR_DAYS = [
  { date: "2026-10-15", title: "Volcanoes",
    rounds: [
      { article: "Krakatoa", aliases: "Krakatau", categories: ["Calderas of Indonesia", "VEI-6 volcanoes", "Sunda Strait", "Volcanic islands of Indonesia"], summary: "Volcanic island in Indonesia's Sunda Strait." },
      // ...rounds 2 to 5...
    ] },
  { date: "2026-10-16", /* next day */ },
];
```

Things that trip people up: keep the commas between rounds and between days, put quotes around all text, and use one
entry per date (if two share a date, the later one wins). A day with a bad date, an empty `article`, or a round with no
categories is skipped without any error message. Once players have played a date, don't change its rounds, or their
score for it resets. While the list is empty, players see the built-in demo days (see "Demo content").

## Run it locally

Serve the folder (the service worker needs `http://`, not `file://`). Pick one:

- **VS Code:** *Live Server* extension, right-click `index.html`, *Open with Live Server*.
- **Python:** `python3 -m http.server 8000`, then open <http://localhost:8000/>.
- **Node:** `npx serve .`

## Demo content

With `days.js` empty, `demoDays()` (in `logic.js`) cuts the bank in `demo.js` into one five-round game per date, with a
14-day archive. The bank is read as a ring, five entries per date, so everyone sees the same game on the same date and a
date's game never changes. Categories in the bank are written in Wikipedia's style but are illustrative; check them
against the real pages if accuracy matters to you.

When editing `demo.js`, keep at least 70 entries (14 days of 5) and **keep the count off a multiple of 5**, otherwise a
date's whole game repeats every `length / 5` days. `node --test` checks this, plus: every entry has at least 4 distinct
categories and a summary, no category contains the answer, and no alias collides with another article's title.

## Tests

```
node --test
```

Needs only Node 20 or newer, no install step. It covers answer matching, date handling, day validation, the progress
hash (asserted identical to the original algorithm, so saved games survive updates) and the demo bank.

## How hosting used to work

The old system was entirely client-side and static. There was no server.

```
host.html + app.js (host mode)          your file system / static host            index.html + app.js (player mode)
┌────────────────────────────┐  download  ┌──────────────┐   <script src>   ┌──────────────────────────────┐
│ passcode gate              │ ─────────► │   days.js    │ ───────────────► │ window.ARTICLEGUESSR_DAYS    │
│ draft editor (5 rounds/day)│            │ (answers in  │                  │ -> normDay() validation      │
│ publish list (localStorage)│            │  plain text) │                  │ -> allDays() -> home/play/   │
└────────────────────────────┘            └──────────────┘                  │    archive                   │
                                                                            └──────────────────────────────┘
```

The old host studio (a second page, `host.html`, running the same `app.js` in a "host" mode) did four jobs:

1. **Gate.** A passcode, stored as a SHA-256 hash in `localStorage`. It only deterred casual snooping; it was not security.
2. **Author.** Edit drafts, one day at a time: a date, an optional day name, and five rounds. Each round has a
   correct article title, comma-separated aliases, a list of categories (one per line) and an optional short summary.
3. **Validate.** A round was blocked from publishing unless it had a title and 4 to 19 categories. It warned when a
   category repeated a longer word (over 3 letters) from the title, since that gives the answer away. Only one day per date.
4. **Publish.** Saved the day to a "published" list, then generated `days.js` from that list for you to drop next to
   `index.html`. An optional "hold back future days" switch left unreleased days out of the file so nobody could read
   the answers early. It could also load an existing `days.js` back into the editor.

For testing, publishing also wrote the day into the host browser's own `localStorage`, which the player page merged in.
That path is gone: the player now reads days **only** from `days.js`.

The previous implementation is preserved in git history. At commit `08397bf` (the last commit before the removal), look
at `host.html` and the "Host studio" section of `app.js`:

```
git show 08397bf:host.html
git show 08397bf:app.js
```

## What the player still does (the contract your hosting must meet)

All of this lives in `app.js`. Look these names up there.

**Data shape.** `window.ARTICLEGUESSR_DAYS` must be an array of days:

```js
window.ARTICLEGUESSR_DAYS = [
  {
    date: "2026-10-14",          // YYYY-MM-DD, the player's local calendar date
    title: "Volcanoes and typefaces",   // optional, shown on the home screen
    rounds: [                     // 1 to 10 rounds (5 is the design default)
      {
        article: "Krakatoa",      // required; also used for the "Read on Wikipedia" link
        aliases: "Krakatau",      // optional; comma-separated extra accepted answers
        categories: ["Calderas of Indonesia", "VEI-6 volcanoes", "Sunda Strait", "Volcanic islands of Indonesia"],
        summary: "Volcanic island in Indonesia's Sunda Strait."   // optional; shown with the answer
      }
      // ...
    ]
  }
];
```

**Loading and validation.** `fileDays()` (in `app.js`) reads the global; `normDay()` (in `logic.js`) coerces each day and
**silently drops** any day with an invalid date, no rounds, a round with an empty `article`, or a round with no
categories. `MAX_ROUNDS` (10) caps rounds per day. `allDays()` is the single place the rest of the app gets its days
from, sorted newest first, and falls back to `demoDays()` when the list is empty.

**Which day is active.** `activeDay()` picks the day chosen in the archive, otherwise today's day, otherwise the latest
past day. An archive pick is stored under `articleguessr.current.v1` together with the date it was made and only lasts
for that calendar day, so the app always opens on the new day's game the next morning. `isOpen()` treats a day as playable once its date is today or
earlier in the player's local time, so future-dated days show as locked.

**Answer checking.** `isMatch()` (in `logic.js`) compares the guess to the `article`, to the `article` without a trailing
"(qualifier)" (so `Casablanca (film)` also accepts `Casablanca`), and to each alias, after `norm()`. `norm()` ignores
case, accents (including letters like `ł`, `ø`, `ß`), apostrophes and periods (`Schindler's List` = `Schindlers List`,
`D.C.` = `DC`), other punctuation, extra spaces, `&` vs `and`, and a leading "the", "a" or "an". There is no fuzzy
credit. `nearMiss()` only explains a miss after the answer is revealed and never changes the score.

**Progress is keyed by content.** `dayId()` / `sid()` (the hash lives in `logic.js`) hash a day's rounds (not its title or date). Progress, best
scores and play history are stored per hash. **If you edit a published day's rounds, players lose their progress and
history for it**, because it now looks like a different game. Changing only `title` or `date` is safe. A game counts as
finished once a run of it has been recorded, and replaying it never takes that away (streak and best score are kept).

**Offline cache.** `sw.js` fetches `days.js` network-first (so new days show up as soon as a player is online) and
serves everything else cache-first. If your hosting serves days from a different URL, add it to the network-first
branch in `sw.js`, or players will be stuck on stale days. `sw.js` pre-caches the files listed in `SHELL`: add any file
you add to the app, because if one listed file is missing the whole install fails. Bump `CACHE` whenever you change files.

## Implement your own hosting

Pick the smallest option that fits, then grow.

### Option A: keep it static (simplest)

This is what "Adding dates" above already gives you: edit `days.js` by hand. To go further and generate it:

Author days however you like (a JSON file, a spreadsheet export, a small web form) and generate `days.js`. For example,
keep `days.json` as an array of days in the shape above and add `scripts/build-days.js`:

```js
const fs = require('fs');
const days = JSON.parse(fs.readFileSync('days.json', 'utf8'));
fs.writeFileSync('days.js', `window.ARTICLEGUESSR_DAYS = ${JSON.stringify(days, null, 1)};\n`);
```

Run it before each deploy. Your admin UI, if you build one, can be a separate page that only needs to emit that JSON.
Nothing in `app.js` has to change.

### Option B: load days from an API

`app.js` reads the global each time it renders, but it starts rendering the moment it loads. So fetch first, then load it.
In `index.html`, replace the `days.js` and `app.js` script tags (keep `demo.js` and `logic.js`, which `app.js` needs)
with:

```html
<script src="demo.js"></script>
<script src="logic.js"></script>
<script>
fetch('/api/days')
  .then(r => r.json())
  .then(days => { window.ARTICLEGUESSR_DAYS = days; })
  .catch(() => { window.ARTICLEGUESSR_DAYS = []; })   // falls back to demo days; consider a real error state
  .finally(() => { const s = document.createElement('script'); s.src = 'app.js'; document.body.appendChild(s); });
</script>
```

Then update `sw.js` so the API URL is network-first like `days.js` (the check is the regex on `/days\.js`).
Remember the offline cache: decide what players should see with no connection.

### Whatever you choose, decide these

- **Answers are public.** Every round's `article` and `aliases` are sent to the browser, and `play()` / `isMatch()`
  grade locally. Static hosting cannot hide them. To keep unreleased days secret, only emit days dated today or earlier
  (the old "hold back future days" behaviour), regenerate daily, and accept that today's answers are readable. For real
  secrecy you must move grading to a server: change the submit handler in `play()` (and the reveal that follows it) so the
  answer is only returned after a guess.
- **Real authentication.** The old passcode was client-side only. If more than one person can publish, or the admin
  page is on the public site, put it behind actual auth (and keep it out of the public deploy folder).
- **Validation.** Re-implement the old rules in your authoring step: title required, 4 to 19 categories, one day per
  date, and flag categories that repeat a long word from the title (use the same normalisation as `norm()`).
  `normDay()` will drop bad days without telling anyone, so validate before publishing.
- **Timezones.** "Today" is each player's local date, so a day unlocks at local midnight for each player.
- **Editing live days.** Avoid changing the rounds of a day players have already played (see progress keying above).

## Deploying

Upload the folder to any static host. The Firebase files in this repo are one example and are independent of game
hosting. `firebase.json` keeps `tests/` and Markdown files out of the deploy. If you serve `days.js` with long cache headers, set it to `no-cache`, and keep `sw.js` uncached too, so new
days reach players promptly.
