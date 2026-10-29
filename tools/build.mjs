// Builds site/index.html from src/index.template.html and site/cubbies.js.
// Run: node tools/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { CUBBIES, STORE } = await import(pathToFileURL(join(root, "site/cubbies.js")));
const byId = Object.fromEntries(CUBBIES.map((c) => [c.id, c]));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const short = (n) => n.replace(/^(Lord|Bal) /, "");

// Toy-block headline: every word its own clay colour, every letter bounces.
const HEADLINE_WORDS = [
  [["Tap", "#ffb627", -3], ["a", "#ff8fb8", 3], ["toy.", "#5cc98a", -2]],
  [["Hear", "#6bb8ff", 2], ["a", "#ff8a65", -3], ["story.", "#b59bff", 2]],
];
let i = 0;
const headline = `<span class="bouncy" aria-hidden="true">${HEADLINE_WORDS.map((line) =>
  `<span class="line">${line.map(([w, c, tilt]) =>
    `<span class="word" style="--c:${c};--tilt:${tilt}deg">${[...w].map((ch) => `<span class="ch" style="--i:${i++}">${ch}</span>`).join("")}</span>`
  ).join(" ")}</span>`).join("")}</span>`;

const buddy = (id, { x, b = "8%", w, n = 0, say, clip = "hello", extra = "", eager = false }) => {
  const c = byId[id];
  const style = [`--x:${x}`, `--b:${b}`, w && `--w:${w}`, `--n:${n}`].filter(Boolean).join(";");
  return `<button class="buddy" type="button" data-say="${esc(say ?? c.say)}" data-voice="${id}:${clip}" style="${style}">
          <span class="visually-hidden">Say hi to ${esc(c.name)}</span>
          <img src="assets/img/${id}-300.webp" alt="" width="300" height="360"${eager ? "" : ' loading="lazy"'} draggable="false">${extra}
          <span class="bubble" aria-hidden="true"></span>
        </button>`;
};

const heroBuddies = [
  buddy("bheem", { x: "11%", b: "4%", n: 0, eager: true }),
  buddy("krishna", { x: "37%", b: "2%", n: 1, eager: true }),
  buddy("hanuman", { x: "63%", b: "3%", n: 2, eager: true }),
  buddy("birbal", { x: "89%", b: "4%", n: 3, eager: true }),
].join("\n        ");

const nightBuddies = CUBBIES.map((c, k) =>
  buddy(c.id, { x: `${10 + k * 13.33}%`, b: k % 2 ? "5%" : "9%", w: "clamp(58px, 9vw, 138px)", n: k, say: c.night, clip: "night", extra: k === 3 ? `<span class="zzz" aria-hidden="true">zzz</span>` : "" })
).join("\n        ");

const shelf = CUBBIES.map((c) =>
  `<li><button class="shelf__item" type="button" data-id="${c.id}" style="--world:${c.world}"><img src="assets/img/${c.id}-300.webp" alt="" width="300" height="360" draggable="false"><span>${esc(c.id === "bheem" ? c.name : short(c.name))}</span></button></li>`
).join("\n                ");

const icon = {
  plus: `<svg class="pick__plus" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
  tick: `<svg class="pick__tick" viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10.5 4 4 8-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const gang = CUBBIES.map((c) => `
          <li class="pal" style="--world:${c.world}">
            <span class="pal__sticker" aria-hidden="true">${esc(c.sticker)}!</span>
            <button class="pal__window" type="button" data-say="${esc(c.say)}" data-voice="${c.id}:hello"><span class="visually-hidden">Say hi to ${esc(c.name)}</span>
              <img class="pal__img" src="assets/img/${c.id}-480.webp" srcset="assets/img/${c.id}-300.webp 300w, assets/img/${c.id}-480.webp 600w" sizes="(max-width: 560px) 46vw, 290px" alt="${esc(c.name)} cubbie toy" width="600" height="720" loading="lazy" draggable="false">
              <span class="bubble" aria-hidden="true"></span>
            </button>
            <div class="pal__body">
              <h3>${esc(c.name)}</h3>
              <p>${esc(c.values)}</p>
              <div class="pal__row">
                <span class="pal__price">₹${c.price}</span>
                <span class="pal__ctas">
                  <a class="pick" href="${STORE}/cart/add?id=${c.variant}&amp;quantity=1" data-add="${c.id}" aria-label="Add to cart: ${esc(c.name)}">Add to cart</a>
                  <a class="pick pick--buy" href="${STORE}/cart/${c.variant}:1" aria-label="Buy now: ${esc(c.name)}">Buy now</a>
                </span>
              </div>
              <a class="pal__details" href="${STORE}/products/${c.handle}">See <span class="visually-hidden">${esc(c.name)}'s </span>stories</a>
            </div>
          </li>`).join("");

const gangAll = `<div class="gang-all">
          <div class="gang-all__faces" aria-hidden="true">${CUBBIES.map((c) => `<img src="assets/img/${c.id}-300.webp" alt="" width="300" height="360" loading="lazy" style="--world:${c.world}">`).join("")}</div>
          <p class="gang-all__text"><strong>Bring home the whole gang.</strong> All 7 cubbies, 210+ stories, songs and games.</p>
          <span class="pal__price">₹${(CUBBIES.reduce((s, c) => s + c.price, 0)).toLocaleString("en-IN")}</span>
          <span class="gang-all__ctas">
            <a class="pick" data-add="all" href="${STORE}/cart/add?${CUBBIES.map((c) => `items%5B%5D%5Bid%5D=${c.variant}&amp;items%5B%5D%5Bquantity%5D=1`).join("&amp;")}">Add all 7 to cart</a>
            <a class="pick pick--buy" href="${STORE}/cart/${CUBBIES.map((c) => `${c.variant}:1`).join(",")}">Buy all 7</a>
          </span>
        </div>`;

// Product section: Ganesh by default; ?cubbie=<id> switches it in the browser.
const pdp = CUBBIES[0];
const photo = (c, n) => c.photoAlts[n - 1].replaceAll("{n}", c.name);
const pdpThumbs = [
  `<button class="pdp__thumb is-on" type="button" data-slide="0" aria-pressed="true"><img src="assets/img/${pdp.id}-300.webp" alt="${esc(pdp.name)} cubbie" width="300" height="360" style="background:${pdp.world}"></button>`,
  ...[1, 2, 3, 4].map((n) => `<button class="pdp__thumb" type="button" data-slide="${n}" aria-pressed="false"><img src="assets/img/pdp/${pdp.id}-${n}-t.webp" alt="${esc(photo(pdp, n))}" width="160" height="160" loading="lazy"></button>`),
].join("\n            ");
const pdpPicker = CUBBIES.map((c, k) => `<label class="face" style="--world:${c.world}" title="${esc(c.name)}">
                <input type="radio" name="cubbie" value="${c.id}"${k === 0 ? " checked" : ""}>
                <img src="assets/img/${c.id}-300.webp" alt="" width="300" height="360" loading="lazy">
                <span class="face__name">${esc(c.id === "bheem" ? c.name : short(c.name))}</span>
              </label>`).join("\n              ");

let html = readFileSync(join(root, "src/index.template.html"), "utf8");
const parts = {
  FONTS: readFileSync(join(root, "src/fonts.inline.html"), "utf8").trim(),
  HEADLINE: headline,
  HERO_BUDDIES: heroBuddies,
  NIGHT_BUDDIES: nightBuddies,
  SHELF: shelf,
  GANG: gang,
  GANG_ALL: gangAll,
  PDP_THUMBS: pdpThumbs,
  PDP_PICKER: pdpPicker,
};
const scalars = {
  PDP_ID: pdp.id, PDP_NAME: esc(pdp.name), PDP_SAY: esc(pdp.say), PDP_WORLD: pdp.world,
  PDP_VALUES: esc(pdp.values), PDP_PRICE: String(pdp.price), PDP_ABOUT: esc(pdp.about),
  PDP_CART: `${STORE}/cart/${pdp.variant}:1`,
  PDP_ADD: `${STORE}/cart/add?id=${pdp.variant}&amp;quantity=1`,
};
for (const [k, v] of Object.entries(scalars)) html = html.replaceAll(`{{${k}}}`, v);
for (const [k, v] of Object.entries(parts)) {
  if (!html.includes(`{{${k}}}`)) throw new Error(`Missing {{${k}}} in template`);
  html = html.replace(`{{${k}}}`, v);
}
// Version-stamp the stylesheet and script so browsers fetch fresh copies after each change.
import { createHash } from "node:crypto";
const stamp = (f) => createHash("sha1").update(readFileSync(join(root, "site", f))).digest("hex").slice(0, 8);
html = html.replace('href="styles.css"', `href="styles.css?v=${stamp("styles.css")}"`)
           .replace('src="app.js"', `src="app.js?v=${stamp("app.js") + stamp("cubbies.js") + stamp("voices.js")}"`);
writeFileSync(join(root, "site/index.html"), html);
console.log("Built site/index.html");
