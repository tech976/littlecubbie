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
