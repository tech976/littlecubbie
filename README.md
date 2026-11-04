# Little Cubbie landing page

Kid-friendly landing page for Little Cubbie story toys: tap a cubbie on your phone and it tells a story.

## Edit
- Page markup: `src/index.template.html`
- Cubbie names, prices, Shopify variant IDs, catchphrases: `site/cubbies.js`
- Styles and interactions: `site/styles.css`, `site/app.js`

`site/index.html` is generated. After editing the template or cubbie data, run:

```sh
npm run build   # node tools/build.mjs
npm run serve   # preview at http://127.0.0.1:5180
```

## Deploy on Vercel
Import this repo. `vercel.json` already sets the build command and the `site` output folder.

## Source assets (not used by the live page)
- `AI video/` – the original AI hero video, Canva vs Codex art comparisons, and cubbie voice samples.
- `source-assets/` – full-size generated art (clay world, cubbie cutouts) that the site images were made from.

## Cubbie voices (story previews)
The page plays short previews cut from the original recordings, never the full stories.
- Originals go in `Audios/` (git-ignored, never deployed).
- Run `python tools/make-snippets.py` (needs ffmpeg and `pip install faster-whisper`) to rebuild
  `site/assets/audio/*.mp3` and `site/voices.js`. Cut points are in `SPEC` at the top of the script;
  story previews are capped at 26 seconds. Caption text comes from `site/cubbies.js`.
