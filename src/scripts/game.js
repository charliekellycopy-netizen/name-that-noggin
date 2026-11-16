import { CELEBS } from "../data/celebs.js";
import PHOTOS from "../data/photos.json"; // per person, a list of photos with their Commons credit
import { SUMMIT, climbFor, clampAlt, zoneAt, mountWorld, climbTo, resetClimb } from "./ascent.js";

const ROUND_LENGTH = 10;
const DIFFICULTY_MIX = { 1: 4, 2: 4, 3: 2 }; // easy first, toughest last

const RANKS = [
  [10, "Grand Master of the Dome"],
  [8, "Fellow of the Royal Chrome Society"],
  [5, "Esteemed Scholar of the Scalp"],
  [3, "Apprentice of the Pate"],
  [0, "Hair Today, Gone Tomorrow"],
];

// The house speaks in a certain register.
const PRAISE = ["Splendid.", "Impeccably observed.", "Quite right.", "A connoisseur’s eye.", "Most distinguished."];
const REGRET = ["Regrettably, no.", "Alas, no.", "A most unfortunate misjudgement.", "The committee is unmoved."];
const pick = a => a[Math.random() * a.length | 0];

function roman(n) {
  if (n === 0) return "Nil";
  const map = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
// Larger numbers (the collection size) keep the full table.
function romanBig(n) {
  const map = [[50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

// ---- Placeholder heads ------------------------------------------------
const SKIN = {
  1: ["#F1CDB3", "#D9A988", "#FFF1E6"],
  2: ["#DDAB82", "#BB875F", "#F8DCC4"],
  3: ["#BC8256", "#97633C", "#E6B993"],
  4: ["#8E5A36", "#6C4226", "#C08A63"],
  5: ["#6A3F25", "#4E2C18", "#A0704F"],
};
const CROP_VIEW = [22, 20, 156, 117]; // just the dome
const FULL_VIEW = [-60, 0, 320, 240]; // whole head
const CUT_CROP = 102, CUT_FULL = 260; // fade line: eyebrows → off the bottom

function headSVG(c, uid) {
  const [base, shade, hi] = SKIN[c.skin];
  const L = c.look || {};
  const rx = 62 * (L.w || 1), ry = 95 * (L.h || 1), cx = 100, cy = 125;
  const brow = "#2B211C";
  return `
<svg viewBox="${CROP_VIEW.join(" ")}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A bald head">
  <defs>
    <clipPath id="${uid}-head"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>
    <linearGradient id="${uid}-fade" x1="0" y1="0" x2="0" y2="300" gradientUnits="userSpaceOnUse" data-fade>
      <stop offset="0" stop-color="#fff"/><stop offset="${CUT_CROP / 300}" stop-color="#fff"/>
      <stop offset="${(CUT_CROP + 8) / 300}" stop-color="#000"/>
    </linearGradient>
    <mask id="${uid}-mask" maskUnits="userSpaceOnUse" x="-100" y="-50" width="400" height="400">
      <rect x="-100" y="-50" width="400" height="400" fill="url(#${uid}-fade)"/>
    </mask>
  </defs>
  <g mask="url(#${uid}-mask)">
    <rect x="${cx - 26}" y="${cy + 60}" width="52" height="80" fill="${shade}"/>
    <ellipse cx="${cx - rx + 2}" cy="${cy + 12}" rx="10" ry="17" fill="${shade}"/>
    <ellipse cx="${cx + rx - 2}" cy="${cy + 12}" rx="10" ry="17" fill="${shade}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${base}"/>
    <g clip-path="url(#${uid}-head)">
      <ellipse cx="${cx + rx * 0.55}" cy="${cy + 10}" rx="${rx * 0.7}" ry="${ry}" fill="${shade}" opacity=".35"/>
      ${L.stubble ? `<rect x="0" y="0" width="200" height="${cy - 20}" fill="${brow}" opacity=".12"/>` : ""}
      ${L.beard ? `<rect x="0" y="${cy + 45}" width="200" height="100" fill="${brow}" opacity=".28"/>` : ""}
      ${L.fringe ? `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${L.fringe}" stroke-width="16"
          clip-path="url(#${uid}-band)"/>` : ""}
    </g>
    ${L.fringe ? `<clipPath id="${uid}-band"><rect x="0" y="${cy - 30}" width="200" height="55"/></clipPath>` : ""}
    <ellipse cx="${cx - rx * 0.32}" cy="${cy - ry * 0.68}" rx="${rx * 0.3}" ry="${ry * 0.09}" fill="${hi}" opacity=".7" transform="rotate(-18 ${cx - rx * 0.32} ${cy - ry * 0.68})"/>
    <path d="M${cx - 38} ${cy - 6} q14 -8 28 -2 M${cx + 10} ${cy - 8} q14 -6 28 2" stroke="${brow}" stroke-width="5" stroke-linecap="round" fill="none"/>
    <circle cx="${cx - 24}" cy="${cy + 8}" r="4.5" fill="${brow}"/>
    <circle cx="${cx + 24}" cy="${cy + 8}" r="4.5" fill="${brow}"/>
    <path d="M${cx} ${cy + 12} q-7 18 0 22" stroke="${shade}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M${cx - 18} ${cy + 52} q18 10 36 0" stroke="${shade}" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;
}

// Photos come from tools/crop_heads.swift: img/<id>/<n>/crop.jpg (dome) and full.jpg (reveal),
// where <n> indexes that person's list in photos.json. Each question shows one of them.
// Anyone without a photo (or if it fails to load) falls back to the drawn placeholder.
const PHOTO_DIR = import.meta.env.BASE_URL.replace(/\/$/, "") + "/img";

function photoFor(c, v) {
  if (c.cropImage) return { crop: c.cropImage, full: c.fullImage || c.cropImage };
  if (PHOTOS[c.id]?.[v]) return { crop: `${PHOTO_DIR}/${c.id}/${v}/crop.jpg`, full: `${PHOTO_DIR}/${c.id}/${v}/full.jpg` };
  return null;
}

// Pick a photo of this person, avoiding the one this viewer saw last time where possible.
function pickVariant(c) {
  const n = PHOTOS[c.id]?.length || 0;
  if (n < 2) return 0;
  let last = {};
  try { last = JSON.parse(localStorage.getItem("ntn-last-photo")) || {}; } catch {}
  const choices = [...Array(n).keys()].filter(v => v !== last[c.id]);
  const v = choices[Math.random() * choices.length | 0];
  last[c.id] = v;
  try { localStorage.setItem("ntn-last-photo", JSON.stringify(last)); } catch {}
  return v;
}

function stageHTML(c, uid, v) {
  const p = photoFor(c, v);
  if (!p) return headSVG(c, uid);
  return `<img class="q" src="${p.crop}" alt="The top of a famous bald head" data-fallback="${uid}">` +
         `<img class="r" src="${p.full}" alt="${esc(c.name)}">`;
}

function useFallback(img) {
  const stage = img.closest(".stage");
  const c = state && state.round[state.i].answer;
  if (!stage || !c) return;
  stage.querySelectorAll("img").forEach(el => el.remove());
  stage.insertAdjacentHTML("afterbegin", headSVG(c, img.dataset.fallback));
}

const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

function creditHTML(c, v) {
  const p = PHOTOS[c.id]?.[v];
  if (!p) return "";
  const author = p.author.length > 48 ? p.author.slice(0, 47) + "…" : p.author;
  return `<span class="credit">Photograph: <a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(author || "Wikimedia Commons")}</a>, ${esc(p.license)}</span>`;
}

// Animate placeholder from dome-only to full head, or cross-fade to the full photo.
function reveal(stage) {
  if (stage.querySelector("img.r")) { stage.classList.add("revealed"); return; }
  const svg = stage.querySelector("svg");
  const fade = svg.querySelector("[data-fade]");
  const stops = fade.querySelectorAll("stop");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dur = reduce ? 0 : 700, t0 = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const t = dur ? Math.min(1, (now - t0) / dur) : 1, e = ease(t);
    const vb = CROP_VIEW.map((v, i) => v + (FULL_VIEW[i] - v) * e);
    svg.setAttribute("viewBox", vb.join(" "));
    svg.setAttribute("preserveAspectRatio", t > 0.5 ? "xMidYMid meet" : "xMidYMid slice");
    const cut = CUT_CROP + (CUT_FULL - CUT_CROP) * e;
    stops[1].setAttribute("offset", cut / 300); stops[2].setAttribute("offset", Math.min(1, (cut + 8) / 300));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---- Game logic -------------------------------------------------------
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

function buildRound() {
  const picked = [];
  for (const [d, n] of Object.entries(DIFFICULTY_MIX)) {
    picked.push(...shuffle(CELEBS.filter(c => c.difficulty === +d)).slice(0, n));
  }
  // top up if a difficulty tier ran short
  const rest = shuffle(CELEBS.filter(c => !picked.includes(c)));
  while (picked.length < ROUND_LENGTH && rest.length) picked.push(rest.pop());
  return picked.map(answer => Object.assign(answer.id === TRICK_ID
    ? { answer, options: [answer, answer, answer, answer], trick: true }
    : { answer, options: shuffle([answer, ...pickDecoys(answer)]) }, { photo: pickVariant(answer) }));
}

// The joke: every option is Danny DeVito, and every pick is marked wrong.
const TRICK_ID = "danny-devito";

// Wrong answers should look plausible: similar skin tone and shared tags score higher.
function pickDecoys(answer) {
  const scored = CELEBS.filter(c => c !== answer).map(c => {
    let s = Math.random() * 2;
    if (Math.abs(c.skin - answer.skin) <= 1) s += 3;
    s += c.tags.filter(t => answer.tags.includes(t)).length * 1.5;
    return [s, c];
  }).sort((a, b) => b[0] - a[0]);
  return scored.slice(0, 3).map(x => x[1]);
}

const rankFor = score => RANKS.find(([min]) => score >= min)[1];

function loadBest(key = "ntn-best") { try { return +localStorage.getItem(key) || 0; } catch { return 0; } }
function saveBest(n, key = "ntn-best") { try { localStorage.setItem(key, String(n)); } catch {} }
const BEST_ALT = "ntn-best-alt";

const zoneLine = m => { const z = zoneAt(m); return `${z.stage}, ${z.name}`; };

// ---- Rendering --------------------------------------------------------
const app = document.getElementById("app");
let state = null;

function barHTML(left, alt) {
  const meter = alt === undefined ? "" :
    `<span class="altimeter"><span class="label">Altitude</span><b class="thin" id="alt">${Math.round(alt)}m</b></span>`;
  return `<header class="bar enter">${left}${meter}<span class="crest" aria-hidden="true">NTN</span></header>`;
}

function renderHome() {
  state = null;
  document.body.classList.remove("climbing");
  resetClimb();
  const best = loadBest(), bestAlt = loadBest(BEST_ALT);
  app.innerHTML = `
    ${barHTML(`<span class="chip ghost"><span class="diamond" style="color:var(--gold)"></span>Members&rsquo; Foyer</span>`)}
    <section class="brand enter enter-2">
      <p class="tagline">Est. MMXXVI</p>
      <h1><span>Name That</span><span>N<span class="o">o</span>ggin</span></h1>
      <p class="tagline">The most distinguished cranial examination</p>
    </section>
    <section class="card gilded enter enter-3">
      <p class="lede voice">Before you lies the summit of a renowned head, and nothing more. Discern its owner from four candidates of impeccable standing. Each correct identification carries you further up the Great Dome; the swift climb further still.</p>
      <div class="stats">
        <div class="stat"><b>${roman(ROUND_LENGTH)}</b><span>specimens per sitting</span></div>
        <div class="stat"><b>M</b><span>metres to the summit</span></div>
        <div class="stat"><b>${romanBig(CELEBS.length)}</b><span>craniums in the collection</span></div>
      </div>
      <button class="btn wide" id="start">Commence the Examination</button>
    </section>
    <section class="card enter enter-4">
      <div class="record-line">
        <div>
          <p class="label">Your finest showing</p>
          <p class="voice" style="font-size:18px;color:var(--gold)">${best ? rankFor(best) : "Yet to be examined"}</p>
        </div>
        <span class="big thin">${best ? roman(best) : "&mdash;"}<small> / ${roman(ROUND_LENGTH)}</small></span>
      </div>
      ${bestAlt ? `<p class="ascent-line">Highest ascent <b>${bestAlt}m</b> &middot; ${zoneLine(bestAlt)}</p>` : ""}
    </section>
    <p class="note">${Object.keys(PHOTOS).length
      ? "Photographs courtesy of Wikimedia Commons, duly credited upon each reveal."
      : "The collection is shown in drawn likeness until photographs are acquired."}</p>`;
  document.getElementById("start").onclick = startRound;
}

function startRound() {
  state = { round: buildRound(), i: 0, score: 0, alt: 0, results: [], answered: false, climbing: false };
  resetClimb();
  renderQuestion();
}

function trackHTML() {
  return state.round.map((_, j) => {
    const r = state.results[j];
    return `<span class="seg ${r ? (r.correct ? "won" : "lost") : (j === state.i ? "now" : "")}"></span>`;
  }).join("");
}

function renderQuestion() {
  const { round, i } = state;
  const q = round[i];
  state.answered = false;
  state.shownAt = performance.now();
  app.innerHTML = `
    ${barHTML(`<span class="chip"><span class="diamond"></span><span id="honours">${state.score ? roman(state.score) : "Nil"}</span> Honours</span>`, state.alt)}
    <div class="progress enter">
      <div class="row">
        <span class="label">Specimen</span>
        <span class="count thin">${roman(i + 1)} <small>/ ${roman(round.length)}</small></span>
      </div>
      <div class="track" id="track">${trackHTML()}</div>
    </div>
    <section class="card gilded exhibit enter enter-2" id="exhibit">
      <div class="stage" id="stage">${stageHTML(q.answer, "h" + i, q.photo)}</div>
      <div class="caption">
        <span class="plaque" id="plaque">Lot ${roman(i + 1)} &middot; Identity Withhead</span>
      </div>
    </section>
    <p class="question voice enter enter-3">Kindly identify the distinguished cranium.</p>
    <div class="options enter enter-3" id="options">
      ${q.options.map((o, k) => `<button class="opt" id="opt-${k}" data-k="${k}"><span class="num">${roman(k + 1)}</span><span class="who">${esc(o.name)}</span></button>`).join("")}
    </div>
    <div id="after"></div>`;
  app.querySelectorAll(".opt").forEach(b => b.onclick = () => answer(+b.dataset.k));
  app.querySelectorAll(".stage img").forEach(img => img.onerror = () => useFallback(img));
}

function answer(k) {
  if (state.answered) return;
  state.answered = true;
  const q = state.round[state.i];
  const chosen = q.options[k];
  const correct = !q.trick && chosen === q.answer;
  if (correct) state.score++;
  const seconds = (performance.now() - state.shownAt) / 1000;
  const climb = climbFor({ correct, trick: q.trick, difficulty: q.answer.difficulty, seconds });
  state.results.push({ answer: q.answer, chosen, correct, photo: q.photo, climb });

  app.querySelectorAll(".opt").forEach((b, j) => {
    b.disabled = true;
    const o = q.options[j];
    if (q.trick) b.classList.add(j === k ? "wrong" : "dim");
    else if (o === q.answer) b.classList.add("right");
    else if (j === k) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  reveal(document.getElementById("stage"));
  const plaque = document.getElementById("plaque");
  plaque.textContent = q.answer.name;
  plaque.classList.add("named");
  if (correct) document.getElementById("exhibit").classList.add("lauded");
  document.getElementById("track").innerHTML = trackHTML();
  document.getElementById("honours").textContent = state.score ? roman(state.score) : "Nil";

  const last = state.i === state.round.length - 1;
  const after = document.getElementById("after");
  after.innerHTML = `
    <section class="card verdict ${correct ? "good" : "bad"}">
      <span class="exclaim voice">${correct ? pick(PRAISE) : pick(REGRET)}</span>
      <span class="name">${correct ? "Indeed, " : "The cranium belongs to "}${esc(q.answer.name)}.</span>
      <span class="known">${esc(q.answer.known)}</span>
      <span class="climb ${climb.metres > 0 ? "up" : climb.metres < 0 ? "down" : ""}">${climbLine(climb, state.alt)}</span>
      ${creditHTML(q.answer, q.photo)}
      <button class="btn wide" id="next">${climb.metres > 0 ? "Ascend" : last ? "Receive Your Verdict" : "Proceed to the Next Specimen"}</button>
    </section>`;
  const next = document.getElementById("next");
  next.onclick = advance;
  next.focus({ preventScroll: true });
  if (matchMedia("(max-width: 700px)").matches) after.scrollIntoView({ behavior: "smooth", block: "end" });
}

function climbLine(climb, from) {
  if (climb.metres > 0) return `&#9650; ${climb.metres}m up the dome${climb.swift ? `, ${climb.swift}m of it for swiftness` : ""}`;
  if (climb.metres < 0) return `&#9660; The committee sends you ${-climb.metres}m back down.`;
  return `You cling on at ${Math.round(from)}m.`;
}

async function advance() {
  if (state.climbing) return;
  const { climb } = state.results[state.i];
  const to = clampAlt(state.alt + climb.metres);
  if (to !== state.alt) {
    state.climbing = true;
    await ascend(state.alt, to, climb);
    state.climbing = false;
  }
  state.alt = to;
  state.i++;
  window.scrollTo({ top: 0 });
  if (state.i < state.round.length) renderQuestion();
  else renderResults();
}

const wait = ms => new Promise(r => setTimeout(r, ms));

// The climb between specimens: the game steps aside and the camera follows you up the dome.
async function ascend(from, to, climb) {
  const hud = document.getElementById("hud");
  const start = zoneAt(from);
  document.body.classList.add("climbing");
  hud.innerHTML = `
    <section class="card gilded hud-card">
      <p class="label" id="hud-zone">${start.stage} &middot; ${start.name}</p>
      <p class="hud-alt thin"><span id="hud-alt">${Math.round(from)}</span><small>m</small></p>
      <p class="hud-gain">${climbLine(climb, from)}</p>
      <p class="hud-entered voice" id="hud-entered" aria-live="polite"></p>
    </section>`;
  const altEl = document.getElementById("hud-alt"), zoneEl = document.getElementById("hud-zone");
  let zone = start;
  await wait(250);
  await climbTo(to, m => {
    altEl.textContent = Math.round(m);
    const z = zoneAt(m);
    if (z.at !== zone.at) { zone = z; zoneEl.innerHTML = `${z.stage} &middot; ${z.name}`; }
  });
  const end = zoneAt(to);
  const entered = to > from && end.at > start.at;
  if (entered) {
    document.getElementById("hud-entered").textContent = to >= SUMMIT
      ? "You have conquered the summit. The view is magnificent, and very shiny."
      : `You have entered ${end.stage}: ${end.name}.`;
  }
  await wait(entered ? 1500 : 650);
  document.body.classList.remove("climbing");
  hud.innerHTML = "";
}

function shareText() {
  const line = state.results.map(r => r.correct ? "\u{1F7E1}" : "⚫").join("");
  return `Name That Noggin: ${roman(state.score)} of ${roman(state.round.length)} \u25B2 ${state.alt}m\n${line}\n${rankFor(state.score)}, ${zoneAt(state.alt).stage}`;
}

function avatarHTML(r) {
  const p = photoFor(r.answer, r.photo);
  const initials = r.answer.name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).map(w => w[0]).slice(0, 2).join("");
  return `<span class="avatar ${r.correct ? "won" : ""}">${p ? `<img src="${p.crop}" alt="" loading="lazy">` : initials}</span>`;
}

function renderResults() {
  const { score, round, results } = state;
  const best = loadBest(), bestAlt = loadBest(BEST_ALT), alt = state.alt;
  if (score > best) saveBest(score);
  if (alt > bestAlt) saveBest(alt, BEST_ALT);
  app.innerHTML = `
    ${barHTML(`<span class="chip"><span class="diamond"></span>${score ? roman(score) : "Nil"} Honours</span>`, alt)}
    <section class="card gilded jackpot enter">
      <span class="medal" aria-hidden="true">N&middot;T&middot;N</span>
      <p class="label">The Committee Has Deliberated</p>
      <h2>Certificate of Cranial Discernment</h2>
      <p class="body voice" style="font-size:17px">The bearer correctly identified</p>
      <div class="tally">${roman(score)}<small> / ${roman(round.length)}</small></div>
      <p class="body voice" style="font-size:17px">distinguished craniums, and is hereby recognised as</p>
      <p class="rank">${rankFor(score)}</p>
      <p class="ascent-line">Ascended <b>${alt}m</b> &middot; ${alt >= SUMMIT ? "The Summit itself" : zoneLine(alt)}</p>
      <div class="track" style="width:100%;margin-top:6px" aria-label="${score} right, ${round.length - score} wrong">${trackHTML()}</div>
      ${score > best && best ? `<p class="body voice" style="font-size:16px;color:var(--gold)">A new personal distinction, surpassing ${roman(best)}.</p>` : ""}
      ${alt > bestAlt && bestAlt ? `<p class="body voice" style="font-size:16px;color:var(--gold)">Your loftiest ascent yet, above ${bestAlt}m.</p>` : ""}
    </section>
    <div class="actions enter enter-2">
      <button class="btn" id="again">Sit Again</button>
      <button class="btn quiet" id="share">Copy Certificate</button>
      <button class="btn quiet" id="home">The Foyer</button>
    </div>
    <p class="toast" id="toast" aria-live="polite"></p>
    <div id="copyfallback"></div>
    <section class="card board enter enter-3">
      <div class="head"><span class="label">The Record</span><span class="label">${roman(score)} of ${roman(round.length)}</span></div>
      <ol>${results.map((r, j) => `<li><span class="n">${j + 1}</span>${avatarHTML(r)}<span class="who">${esc(r.answer.name)}${r.correct ? "" : `<small>Mistaken for ${esc(r.chosen.name)}</small>`}</span>${r.correct
        ? `<span class="res ok">Named</span>`
        : `<span class="res no">Missed</span>`}</li>`).join("")}</ol>
    </section>`;
  document.getElementById("again").onclick = startRound;
  document.getElementById("home").onclick = renderHome;
  document.getElementById("share").onclick = () => {
    const text = shareText(), toast = document.getElementById("toast");
    const fallback = () => {
      document.getElementById("copyfallback").innerHTML = `<textarea class="copybox" id="copybox" rows="3" readonly>${esc(text)}</textarea>`;
      const box = document.getElementById("copybox"); box.focus(); box.select();
      toast.textContent = "Kindly select the text below and copy it.";
    };
    try {
      navigator.clipboard.writeText(text).then(() => { toast.textContent = "Copied. Do share it with your lesser acquaintances."; }, fallback);
    } catch { fallback(); }
  };
}

// Keyboard: 1–4 to answer.
document.addEventListener("keydown", e => {
  if (!state) return;
  if (!state.answered && /^[1-4]$/.test(e.key)) answer(+e.key - 1);
});

mountWorld(document.getElementById("world"));
renderHome();
