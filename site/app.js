import { CUBBIES, STORE } from "./cubbies.js";
import { VOICES } from "./voices.js";

const byId = Object.fromEntries(CUBBIES.map((c) => [c.id, c]));
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- Hero video: sound toggle + reduced motion ---------- */
const video = $("#hero-video");
const soundBtn = $("#sound-btn");
function syncReducedMotion() {
  if (reduceMotion.matches) { video.pause(); video.removeAttribute("autoplay"); }
}
syncReducedMotion();
reduceMotion.addEventListener("change", syncReducedMotion);
soundBtn.addEventListener("click", () => {
  const on = soundBtn.getAttribute("aria-pressed") !== "true";
  soundBtn.setAttribute("aria-pressed", String(on));
  video.muted = !on;
  if (on) { stopStory(); video.currentTime = 0; video.play().catch(() => {}); }
});

/* ---------- Story stage ---------- */
const phone = $("#phone");
const phoneImg = $("#phone-img");
const phoneTitle = $("#phone-title");
const caption = $("#phone-caption");
const burst = $("#burst");
const status = $("#stage-status");
const shelf = $("#shelf");
let current = null; // id of the cubbie on the phone
let playToken = 0;  // bumps on every play/stop so stale speech events are ignored
let wordTimer = 0;
let fallbackTimer = 0;
let voice = null;

const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
function pickVoice() {
  if (!synth) return;
  const voices = synth.getVoices();
  voice =
    voices.find((v) => /^en[-_]IN/i.test(v.lang)) ||
    voices.find((v) => /^en[-_]GB/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) || null;
}
if (synth) {
  pickVoice();
  if (synth.addEventListener) synth.addEventListener("voiceschanged", pickVoice);
  else synth.onvoiceschanged = pickVoice;
}

// Sparkles: built once, replayed by toggling a class.
for (let i = 0; i < 14; i++) {
  const s = document.createElement("i");
  s.style.setProperty("--a", `${(360 / 14) * i}deg`);
  s.style.setProperty("--d", `${90 + (i % 3) * 40}px`);
  s.style.animationDelay = `${(i % 4) * 30}ms`;
  burst.append(s);
}
function sparkle() {
  if (reduceMotion.matches) return;
  burst.classList.remove("go");
  void burst.offsetWidth; // restart the animation
  burst.classList.add("go");
}

function renderCaption(text) {
  caption.replaceChildren();
  const words = [];
  let index = 0;
  for (const part of text.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) { caption.append(part); index += part.length; continue; }
    const span = document.createElement("span");
    span.className = "w";
    span.textContent = part;
    span.dataset.start = index;
    caption.append(span);
    words.push(span);
    index += part.length;
  }
  return words;
}

function highlight(words, i) {
  words.forEach((w, n) => w.classList.toggle("is-on", n === i));
}

function clearTimers() {
  clearInterval(wordTimer);
  clearTimeout(fallbackTimer);
}

function finish() {
  clearTimers();
  phone.classList.remove("is-playing");
  if (current) phone.classList.add("is-done");
  caption.querySelectorAll(".is-on").forEach((w) => w.classList.remove("is-on"));
}

// Recorded cubbie voices (warm and natural); the browser voice is only a fallback.
const storyAudio = new Audio();
storyAudio.preload = "auto";
const helloAudio = new Audio();
let audioFrame = 0;

function stopAudio() {
  cancelAnimationFrame(audioFrame);
  storyAudio.pause();
  storyAudio.onended = storyAudio.onplaying = null;
}

function stopStory() {
  playToken++;
  if (synth) synth.cancel();
  stopAudio();
  finish();
}

function playStory(id) {
  const c = byId[id];
  if (!c) return;
  const token = ++playToken;
  const live = () => token === playToken;
  if (!video.muted) { video.muted = true; soundBtn.setAttribute("aria-pressed", "false"); }
  if (synth) synth.cancel();
  clearTimers();
  current = id;

  shelf.querySelectorAll(".is-playing").forEach((b) => b.classList.remove("is-playing"));
  shelf.querySelector(`[data-id="${id}"]`)?.classList.add("is-playing");

  phone.style.setProperty("--world", c.world);
  phone.classList.remove("is-done");
  phone.classList.add("is-playing");
  phoneImg.src = `assets/img/${id}-480.webp`;
  phoneImg.alt = `${c.name} cubbie`;
  phoneTitle.textContent = c.title;
  const words = renderCaption(c.line);
  status.textContent = `${c.name} is telling a story: ${c.line}`;
  sparkle();

  // Start the recorded voice inside the user gesture so phones allow it.
  stopAudio();
  helloAudio.pause();
  const rec = VOICES[id]?.story;
  if (rec) {
    storyAudio.src = rec.src;
    storyAudio.currentTime = 0;
    const follow = () => {
      if (!live()) return;
      const t = storyAudio.currentTime;
      highlight(words, rec.words.findLastIndex((start) => start <= t + 0.04));
      if (!storyAudio.paused && !storyAudio.ended) audioFrame = requestAnimationFrame(follow);
    };
    storyAudio.onplaying = () => { cancelAnimationFrame(audioFrame); audioFrame = requestAnimationFrame(follow); };
    storyAudio.onended = () => { if (live()) finish(); };
    storyAudio.play().catch(() => { if (live()) speakWithBrowser(c, words, token, live); });
    return;
  }
  speakWithBrowser(c, words, token, live);
}

function speakWithBrowser(c, words, token, live) {
  let boundaryWorks = false;
  if (synth) {
    const u = new SpeechSynthesisUtterance(c.line);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = "en-IN"; }
    u.rate = 0.95;
    u.pitch = 1.2;
    u.onboundary = (e) => {
      if (!live() || (e.name && e.name !== "word")) return;
      boundaryWorks = true;
      clearTimers();
      const i = words.findLastIndex((w) => Number(w.dataset.start) <= e.charIndex);
      highlight(words, i);
    };
    u.onend = () => { if (live()) finish(); };
    u.onerror = (e) => {
      if (!live() || e.error === "interrupted" || e.error === "canceled") return;
      runTimer(words, token); // no voice available: still show the words
    };
    synth.resume(); // Chrome can get stuck in a paused state
    synth.speak(u);
  }
  // Fallback highlight when the browser gives no word timing (or has no voice).
  fallbackTimer = setTimeout(() => { if (live() && !boundaryWorks) runTimer(words, token); }, synth ? 900 : 0);
}

function runTimer(words, token) {
  clearInterval(wordTimer);
  let i = 0;
  highlight(words, i);
  wordTimer = setInterval(() => {
    if (token !== playToken) return clearInterval(wordTimer);
    i++;
    if (i >= words.length) { clearInterval(wordTimer); if (!synth?.speaking) finish(); return; }
    highlight(words, i);
  }, 330);
}

$("#replay").addEventListener("click", () => current && playStory(current));
$("#stop").addEventListener("click", stopStory);

/* ---------- Drag a cubbie onto the phone ---------- */
const motionOK = () => !reduceMotion.matches;
const GRAB_LIFT = 1.12;

function makeGhost(img, rect) {
  const ghost = img.cloneNode();
  ghost.removeAttribute("srcset");
  ghost.className = "drag-ghost";
  ghost.style.width = `${rect.width}px`;
  document.body.append(ghost);
  return ghost;
}

// Where the toy lands: the character spot near the top of the phone screen.
function landingRect(w, h) {
  const to = phone.getBoundingClientRect();
  const lw = to.width * 0.5;
  const lh = lw * (h / w);
  return { left: to.left + (to.width - lw) / 2, top: to.top + to.height * 0.1, width: lw, height: lh };
}

function flyGhost(ghost, from, to, { arc = false, fade = true, duration = 600 } = {}) {
  if (!motionOK()) { ghost.remove(); return Promise.resolve(); }
  const s = to.width / from.width;
  const frames = [{ transform: `translate(${from.left}px, ${from.top}px) scale(${from.scale ?? 1}) rotate(${from.rotate ?? 0}deg)` }];
  if (arc) frames.push({ transform: `translate(${(from.left + to.left) / 2}px, ${Math.min(from.top, to.top) - 100}px) scale(${(1 + s) / 2 + 0.1}) rotate(-10deg)`, offset: 0.5 });
  frames.push({ transform: `translate(${to.left}px, ${to.top}px) scale(${s}) rotate(0deg)`, opacity: fade ? 0 : 1 });
  ghost.style.transformOrigin = "0 0";
  return ghost.animate(frames, { duration, easing: "cubic-bezier(.3,.7,.3,1)" }).finished.then(() => ghost.remove(), () => ghost.remove());
}

// Tap: fly the toy from its shelf spot onto the phone.
function flyTo(img) {
  if (!motionOK()) return;
  const r = img.getBoundingClientRect();
  const ghost = makeGhost(img, r);
  flyGhost(ghost, { left: r.left, top: r.top, width: r.width }, landingRect(r.width, r.height), { arc: true });
}

let drag = null;
let lastDragEnd = 0;

// The drop counts if the toy itself overlaps the phone, not just the pointer.
function isOverPhone(ghostRect, x, y) {
  const p = phone.getBoundingClientRect();
  const pad = 60; // generous: small hands aren't precise
  if (x > p.left - pad && x < p.right + pad && y > p.top - pad && y < p.bottom + pad) return true;
  if (!ghostRect) return false;
  // Ignore the transparent margins of the cutout.
  const g = {
    left: ghostRect.left + ghostRect.width * 0.18, right: ghostRect.right - ghostRect.width * 0.18,
    top: ghostRect.top + ghostRect.height * 0.08, bottom: ghostRect.bottom - ghostRect.height * 0.05,
  };
  const ox = Math.max(0, Math.min(g.right, p.right) - Math.max(g.left, p.left));
  const oy = Math.max(0, Math.min(g.bottom, p.bottom) - Math.max(g.top, p.top));
  return ox * oy >= (g.right - g.left) * (g.bottom - g.top) * 0.1;
}

function positionGhost() {
  const { ghost, offX, offY, x, y, w, h } = drag;
  const left = x - offX;
  const top = y - offY;
  ghost.style.transformOrigin = `${offX}px ${offY}px`;
  ghost.style.transform = `translate(${left}px, ${top}px) scale(${GRAB_LIFT}) rotate(-6deg)`;
  drag.rect = { left, top, right: left + w, bottom: top + h, width: w, height: h };
  const over = isOverPhone(drag.rect, x, y);
  if (over !== drag.over) {
    drag.over = over;
    phone.classList.toggle("is-over", over);
  }
}

// Scroll the page while dragging near the top or bottom edge (touch can't scroll mid-drag).
function autoScroll() {
  if (!drag?.ghost) return;
  const edge = 80;
  const top = 76; // under the sticky header
  const p = phone.getBoundingClientRect();
  let dy = 0;
  // Only scroll toward the phone when part of it is hidden.
  if (drag.y < top + edge && p.top < top) dy = -Math.ceil((top + edge - drag.y) / 5);
  else if (drag.y > innerHeight - edge && p.bottom > innerHeight) dy = Math.ceil((drag.y - (innerHeight - edge)) / 5);
  if (dy) { scrollBy(0, dy); positionGhost(); }
  drag.raf = requestAnimationFrame(autoScroll);
}

function startDrag() {
  const img = drag.btn.querySelector("img");
  const r = img.getBoundingClientRect();
  drag.w = r.width;
  drag.h = r.height;
  drag.offX = Math.min(Math.max(drag.x0 - r.left, 0), r.width);
  drag.offY = Math.min(Math.max(drag.y0 - r.top, 0), r.height);
  drag.ghost = makeGhost(img, r);
  drag.btn.classList.add("is-lifted");
  document.documentElement.classList.add("is-dragging");
  drag.raf = requestAnimationFrame(autoScroll);
}

function endDrag(dropped) {
  if (!drag) return;
  const { btn, id, ghost, rect, raf, pointerId, offX = 0, offY = 0 } = drag;
  const over = dropped && drag.over;
  drag = null;
  cancelAnimationFrame(raf);
  phone.classList.remove("is-over");
  btn.classList.remove("is-lifted");
  document.documentElement.classList.remove("is-dragging");
  if (btn.hasPointerCapture?.(pointerId)) btn.releasePointerCapture(pointerId);
  if (!ghost) return; // a plain tap: the click handler plays it
  lastDragEnd = performance.now();
  // Same on-screen spot as during the drag, re-expressed with a top-left transform origin.
  const lift = GRAB_LIFT - 1;
  const from = { left: rect.left - offX * lift, top: rect.top - offY * lift, width: rect.width, scale: GRAB_LIFT, rotate: -6 };
  ghost.style.transformOrigin = "0 0";
  if (over) {
    playStory(id); // inside the gesture so speech is allowed
    flyGhost(ghost, from, landingRect(rect.width, rect.height), { duration: 380 });
  } else {
    const r = btn.querySelector("img").getBoundingClientRect();
    flyGhost(ghost, from, { left: r.left, top: r.top, width: r.width }, { fade: false, duration: 320 });
  }
}

shelf.addEventListener("pointerdown", (e) => {
  const btn = e.target.closest(".shelf__item");
  if (!btn || drag || !e.isPrimary || e.button !== 0) return;
  drag = { btn, id: btn.dataset.id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, ghost: null, over: false };
  btn.setPointerCapture(e.pointerId);
});

shelf.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
    startDrag();
  }
  positionGhost();
});

shelf.addEventListener("pointerup", (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(true); });
shelf.addEventListener("pointercancel", (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(false); });
shelf.addEventListener("lostpointercapture", (e) => { if (drag && e.pointerId === drag.pointerId) endDrag(false); });
addEventListener("keydown", (e) => { if (e.key === "Escape" && drag?.ghost) endDrag(false); });
addEventListener("blur", () => drag && endDrag(false));

shelf.addEventListener("click", (e) => {
  const btn = e.target.closest(".shelf__item");
  if (!btn) return;
  // Browsers can send a click after a drag (especially on touch); the drop already played it.
  if (performance.now() - lastDragEnd < 500) return;
  flyTo(btn.querySelector("img"));
  playStory(btn.dataset.id);
  // On small screens make sure the phone is visible.
  const r = phone.getBoundingClientRect();
  if (r.top < 70 || r.bottom > innerHeight) phone.scrollIntoView({ behavior: motionOK() ? "smooth" : "auto", block: "center" });
});

// Stop talking when the stage scrolls away or the tab is hidden.
new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) stopStory(); }).observe($("#try"));
document.addEventListener("visibilitychange", () => { if (document.hidden) { stopStory(); helloAudio.pause(); } });

/* ---------- Collection ---------- */
const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;
try { localStorage.removeItem("lc-shelf"); } catch {} // the old shelf tray is retired

/* ---------- The sky: morning to bedtime as you scroll ---------- */
const root = document.documentElement;
const skySections = document.querySelectorAll("[data-sky]:not(html)");
const skyObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) root.dataset.sky = entry.target.dataset.sky;
  }
}, { rootMargin: "-45% 0px -45% 0px" });
skySections.forEach((s) => skyObserver.observe(s));

/* ---------- Little sounds (only after a tap) ---------- */
let audio = null;
function pop(pitch = 1) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(420 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(880 * pitch, t + 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  } catch {}
}

/* ---------- Tap a cubbie: it hops and says hello ---------- */
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-say]");
  if (!el) return;
  const bubble = el.querySelector(".bubble");
  if (bubble) bubble.textContent = el.dataset.say;
  el.classList.remove("hop");
  void el.offsetWidth;
  el.classList.add("hop", "talking");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("talking"), 1800);
  status.textContent = el.dataset.say;
  // Say it out loud in the cubbie voice (a little pop if the clip can't play).
  const [cid, clip] = (el.dataset.voice || "").split(":");
  const rec = VOICES[cid]?.[clip];
  if (rec) {
    helloAudio.pause();
    helloAudio.src = rec.src;
    helloAudio.currentTime = 0;
    helloAudio.play().catch(() => pop(0.9 + Math.random() * 0.4));
  } else {
    pop(0.9 + Math.random() * 0.4);
  }
});

/* ---------- Headline letters bounce when touched ---------- */
document.querySelector(".bouncy")?.addEventListener("pointerover", (e) => {
  const ch = e.target.closest(".ch");
  if (!ch || ch.classList.contains("boing")) return;
  ch.classList.add("boing");
  ch.addEventListener("animationend", () => ch.classList.remove("boing"), { once: true });
});

/* ---------- Marigold petals when a cubbie joins the shelf ---------- */
function petals(from) {
  if (!motionOK()) return;
  const r = from.getBoundingClientRect();
  const colors = ["#ffb627", "#ff6a22", "#ff8fb8", "#5cc98a"];
  for (let k = 0; k < 14; k++) {
    const p = document.createElement("i");
    p.className = "petal";
    p.style.background = colors[k % colors.length];
    document.body.append(p);
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const a = (Math.PI * 2 * k) / 14 + Math.random() * 0.4;
    const d = 50 + Math.random() * 70;
    p.animate([
      { transform: `translate(${x}px, ${y}px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${x + Math.cos(a) * d}px, ${y + Math.sin(a) * d - 30}px) rotate(${200 + Math.random() * 300}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${x + Math.cos(a) * d * 1.2}px, ${y + Math.sin(a) * d + 40}px) rotate(540deg)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 300, easing: "cubic-bezier(.2,.8,.4,1)" }).finished.then(() => p.remove());
  }
}

/* ---------- Product section (where ad visitors land) ---------- */
const pdp = {
  main: $("#pdp-main"), img: $("#pdp-img"), label: $("#pdp-main-label"), stage: $("#pdp-stage"),
  thumbs: [...document.querySelectorAll(".pdp__thumb")], name: $("#pdp-name"), values: $("#pdp-values"),
  price: $("#pdp-price"), about: $("#pdp-about"), aboutName: $("#pdp-about-name"),
  buy: $("#pdp-buy"), cart: $("#pdp-cart"), qty: $("#pdp-qty"),
};
let pdpId = CUBBIES[0].id;
let pdpSlide = 0;
let pdpQty = 1;
const photoAlt = (c, n) => c.photoAlts[n - 1].replaceAll("{n}", c.name);

function pdpSyncBuy() {
  const c = byId[pdpId];
  pdp.qty.textContent = pdpQty;
  pdp.buy.href = `${STORE}/cart/${c.variant}:${pdpQty}`;
  pdp.cart.href = `${STORE}/cart/add?id=${c.variant}&quantity=${pdpQty}`;
}

function showSlide(n) {
  const c = byId[pdpId];
  pdpSlide = n;
  const cutout = n === 0;
  pdp.main.classList.toggle("is-cutout", cutout);
  if (cutout) {
    pdp.img.src = `assets/img/${c.id}-480.webp`;
    pdp.img.alt = `${c.name} cubbie toy`;
    pdp.main.dataset.say = c.say;
    pdp.main.dataset.voice = `${c.id}:hello`;
    pdp.label.textContent = `Say hi to ${c.name}`;
  } else {
    pdp.img.src = `assets/img/pdp/${c.id}-${n}.webp`;
    pdp.img.alt = photoAlt(c, n);
    delete pdp.main.dataset.say;
    delete pdp.main.dataset.voice;
    pdp.main.classList.remove("talking");
    pdp.label.textContent = "Next photo";
  }
  pdp.thumbs.forEach((t) => t.setAttribute("aria-pressed", String(Number(t.dataset.slide) === n)));
  pdp.main.classList.remove("swap");
  void pdp.main.offsetWidth;
  pdp.main.classList.add("swap");
}

function selectCubbie(id, { speak = false, updateUrl = true } = {}) {
  const c = byId[id];
  if (!c) return;
  pdpId = id;
  pdp.stage.style.setProperty("--world", c.world);
  pdp.name.textContent = c.name;
  pdp.aboutName.textContent = c.name;
  pdp.values.textContent = c.values;
  pdp.price.textContent = rupees(c.price);
  pdp.about.textContent = c.about;
  pdp.thumbs.forEach((t) => {
    const n = Number(t.dataset.slide);
    const img = t.querySelector("img");
    img.src = n === 0 ? `assets/img/${c.id}-300.webp` : `assets/img/pdp/${c.id}-${n}-t.webp`;
    img.alt = n === 0 ? `${c.name} cubbie` : photoAlt(c, n);
    if (n === 0) img.style.background = c.world;
  });
  const radio = document.querySelector(`.pdp__pick input[value="${id}"]`);
  if (radio) radio.checked = true;
  showSlide(0);
  pdpSyncBuy();
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set("cubbie", id);
    history.replaceState(null, "", url);
  }
  if (speak) pdp.main.click(); // says hello in the cubbie voice
}

pdp.thumbs.forEach((t) => t.addEventListener("click", () => showSlide(Number(t.dataset.slide))));
pdp.main.addEventListener("click", () => { if (!pdp.main.classList.contains("is-cutout")) showSlide((pdpSlide + 1) % 5); });
document.querySelector(".pdp__pick").addEventListener("change", (e) => selectCubbie(e.target.value, { speak: true }));
document.querySelectorAll(".qty__btn").forEach((b) => b.addEventListener("click", () => {
  pdpQty = Math.min(10, Math.max(1, pdpQty + Number(b.dataset.step)));
  pdpSyncBuy();
}));

// Ads can open the page on a specific cubbie: ?cubbie=hanuman (id, product handle or name)
{
  const want = (new URLSearchParams(location.search).get("cubbie") || "").toLowerCase().replace(/[^a-z]/g, "");
  const match = want && CUBBIES.find((c) => [c.id, c.handle, c.name].some((v) => v.toLowerCase().replace(/[^a-z]/g, "") === want));
  if (match) selectCubbie(match.id, { updateUrl: false });
  else pdpSyncBuy();
}

/* ---------- Cart bar: slides up when something is added ---------- */
const CART_KEY = "lc-cart";
const cart = new Map(); // id -> quantity
try { for (const [id, q] of JSON.parse(localStorage.getItem(CART_KEY) || "[]")) if (byId[id] && q > 0) cart.set(id, q); } catch {}
const tray = $("#tray");

function renderCart({ bump = false } = {}) {
  const items = CUBBIES.filter((c) => cart.has(c.id));
  tray.hidden = items.length === 0;
  document.body.classList.toggle("has-cart", items.length > 0);
  if (!items.length) return;
  const count = items.reduce((n, c) => n + cart.get(c.id), 0);
  const total = items.reduce((n, c) => n + c.price * cart.get(c.id), 0);
  $("#tray-faces").replaceChildren(...items.map((c) => {
    const img = new Image(38, 38);
    img.src = `assets/img/${c.id}-300.webp`;
    img.alt = "";
    img.style.setProperty("--world", c.world);
    return img;
  }));
  $("#tray-count").textContent = `${count} ${count === 1 ? "cubbie" : "cubbies"} in your cart`;
  $("#tray-sub").textContent = items.length === CUBBIES.length
    ? `The whole gang is coming home! ${rupees(total)}`
    : `${rupees(total)} so far. Collect all ${CUBBIES.length}!`;
  const meter = $("#tray-meter");
  meter.style.setProperty("--p", items.length / CUBBIES.length);
  meter.setAttribute("aria-valuenow", items.length);
  $("#tray-checkout").href = `${STORE}/cart/${items.map((c) => `${c.variant}:${cart.get(c.id)}`).join(",")}`;
  if (bump && motionOK()) {
    tray.classList.remove("bump");
    void tray.offsetWidth;
    tray.classList.add("bump");
  }
}

function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify([...cart])); } catch {}
}

function addToCart(ids, qty, button) {
  for (const id of ids) cart.set(id, (cart.get(id) || 0) + qty);
  saveCart();
  const wasHidden = tray.hidden;
  renderCart({ bump: !wasHidden });
  petals(button);
  pop(1.3);
  const names = ids.length === CUBBIES.length ? "All 7 cubbies" : ids.map((id) => byId[id].name).join(", ");
  $("#cart-status").textContent = `${names} added to your cart.`;
  // Brief "Added!" on the button itself
  const label = button.textContent;
  if (!button.dataset.label) button.dataset.label = label;
  button.textContent = "Added!";
  button.classList.add("is-added");
  clearTimeout(button._t);
  button._t = setTimeout(() => { button.textContent = button.dataset.label; button.classList.remove("is-added"); }, 1300);
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-add]");
  if (!a) return;
  e.preventDefault(); // stay on the page; the cart bar handles checkout
  const what = a.dataset.add;
  if (what === "pdp") addToCart([pdpId], pdpQty, a);
  else if (what === "all") addToCart(CUBBIES.map((c) => c.id), 1, a);
  else addToCart([what], 1, a);
});

$("#tray-close").addEventListener("click", () => {
  cart.clear();
  saveCart();
  renderCart();
  $("#cart-status").textContent = "Your cart is empty.";
});

renderCart();
