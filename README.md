# ArticleGuessr

A daily game: each day is five rounds. Read an article's Wikipedia categories and type its title.

- `index.html` is the **player** page. `host.html` is the **host studio** (passcode-locked, local to your browser).
- Run both from any static server (for example VS Code Live Server). Nothing needs a backend.

## Publishing a day

1. Open `host.html`, build the day's five rounds, press **Publish this day**.
2. Press **Download days.js**.
3. Put that file next to `index.html`, replacing the old `days.js`.

Players open the page and get every published day in their archive. Days dated in the future stay locked
until their date. Tick *Hold back future days* in the studio if you don't want upcoming answers in the file.

`days.js` contains the answers, so anyone who opens it can read them. This is a static site, not a secured one.

If you change any file, bump `CACHE` in `sw.js` so installed copies update.
