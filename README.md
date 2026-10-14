# ArticleGuessr

A daily game: each day is five rounds. Read an article's Wikipedia categories and type its title.

| File | What it is |
| --- | --- |
| `index.html` | The **player** page (this is what you share). |
| `host.html` | The **host studio**: passcode-locked, runs in your own browser. |
| `days.js` | The published days. The host studio generates this file. |
| `app.js`, `styles.css` | The app. |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Make the player page installable and playable offline. |

## Run it locally

You need to serve the folder (a plain double-click on the files works for basic play, but the offline/install
feature and the link between the player and host pages need a local server). Pick one:

- **VS Code:** install the *Live Server* extension, open this folder, right-click `index.html`, choose *Open with Live Server*.
- **Python:** in this folder run `python3 -m http.server 8000`, then open <http://localhost:8000/>.
- **Node:** in this folder run `npx serve .`, then open the address it prints.

Then open `/index.html` to play and `/host.html` for the host studio.

## Publish a day

1. Open `host.html`. The first time, create a passcode (it only protects the page on your computer).
2. Build the day's five rounds, then press **Publish this day**.
3. Press **Download days.js** and put it in this folder, replacing the old `days.js`.

Players get every published day in their archive. Days dated in the future stay locked until their date.
Tick *Hold back future days* if you don't want upcoming answers inside the file.

`days.js` contains the answers, so anyone who opens it can read them. This is a static site, not a secured one.

## Put it online (any static host)

Upload this folder as-is. You only need `host.html` on your own computer, so you can leave it out of what you upload.
If you use Firebase Hosting, set `public` to this folder and make sure `days.js` and `sw.js` are never cached for long:

```json
{
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**", "README.md", "host.html"],
    "headers": [
      { "source": "/days.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
    ]
  }
}
```

Each time you change a file, change the `CACHE` name at the top of `sw.js` so installed copies update.
