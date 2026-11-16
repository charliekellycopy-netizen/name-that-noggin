import { CELEBS } from "../data/celebs.js";
import PHOTOS from "../data/photos.json"; // per person, a list of photos with their Commons credit
import ZOOM from "../data/zoom.json";     // per photo ("<id>/<n>"), its dome and full framings in zoom.jpg
import { headSVG } from "./placeholder.js";

// ---- The examination ----------------------------------------------------
// Everyone sits the same ten heads each day (the Daily Noggin), once. Each head starts as
// the bare dome and slowly withdraws to the full face; the sooner you name him, the more
// honours he's worth. The Practice Room is the same game, endless and unrecorded.

const ROUND_LENGTH = 10;
const DIFFICULTY_MIX = { 1: 4, 2: 4, 3: 2 }; // easy first, toughest last
const FIRST_DAY = Date.UTC(2026, 10, 16); // Daily Noggin No. I

// How far the picture has withdrawn decides what a correct answer is worth.
// The thresholds (where the brows, eyes and nose first show) come from each photo's zoom data.
const STAGES = [
  { key: "dome", name: "Dome", worth: 100, emoji: "\u{1F7E1}", said: "Named from the dome alone." },
  { key: "brow", name: "Brow", worth: 70, emoji: "\u{1F7E0}", said: "Named at the first hint of eyebrow." },
  { key: "eyes", name: "Eyes", worth: 40, emoji: "\u{1F7E4}", said: "Named once the eyes appeared." },
  { key: "face", name: "Face", worth: 20, emoji: "⚪", said: "Named only when the whole face was shown." },
];
const MISS_EMOJI = "⚫";

// Timing, in seconds: the dome holds still, then the picture withdraws, slowly at first.
const HOLD = 2.5, WITHDRAW = 14, GRACE = 5;
const TIME_LIMIT = HOLD + WITHDRAW + GRACE;
const withdrawnAt = s => Math.pow(Math.min(1, Math.max(0, (s - HOLD) / WITHDRAW)), 2); // 0 = dome, 1 = full

const RANKS = [
  [900, "Grand Master of the Dome"],
  [700, "Fellow of the Royal Chrome Society"],
  [450, "Esteemed Scholar of the Scalp"],
  [200, "Apprentice of the Pate"],
  [0, "Hair Today, Gone Tomorrow"],
];

// The house speaks in a certain register.
const PRAISE = ["Splendid.", "Impeccably observed.", "Quite right.", "A connoisseur’s eye.", "Most distinguished."];
const REGRET = ["Regrettably, no.", "Alas, no.", "A most unfortunate misjudgement.", "The committee is unmoved."];
const pickOne = a => a[Math.random() * a.length | 0];

function roman(n) {
  if (n === 0) return "Nil";
  const map = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

// ---- Days and storage ---------------------------------------------------
function today() {
  const d = new Date();
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - FIRST_DAY) / 86400000) + 1;
}

function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

// ntn-daily: { day, results, done } for the latest daily sat; ntn-record: streak and bests.
const loadDaily = () => { const d = load("ntn-daily", null); return d && d.day === today() ? d : null; };
const loadRecord = () => load("ntn-record", { streak: 0, lastDay: 0, sat: 0, best: 0 });

function recordDaily(points) {
  const r = loadRecord(), day = today();
  if (r.lastDay !== day) {
    r.streak = r.lastDay === day - 1 ? r.streak + 1 : 1;
    r.lastDay = day;
    r.sat++;
  }
  r.best = Math.max(r.best, points);
  save("ntn-record", r);
}

// ---- Randomness ---------------------------------------------------------
// The daily round is drawn from a generator seeded by the day, so every member gets the same one.
function seeded(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const shuffle = (a, rand) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// The joke: every option is Danny DeVito, and every pick is marked wrong.
const TRICK_ID = "danny-devito";

function buildRound(rand, practice) {
  const picked = [];
  for (const [d, n] of Object.entries(DIFFICULTY_MIX)) {
    picked.push(...shuffle(CELEBS.filter(c => c.difficulty === +d), rand).slice(0, n));
  }
  const rest = shuffle(CELEBS.filter(c => !picked.includes(c)), rand);
  while (picked.length < ROUND_LENGTH && rest.length) picked.push(rest.pop());
  return picked.map(answer => ({
    answer,
    ...(answer.id === TRICK_ID
      ? { options: [answer, answer, answer, answer], trick: true }
      : { options: shuffle([answer, ...pickDecoys(answer, rand)], rand) }),
    photo: practice ? pickFreshVariant(answer) : (rand() * (PHOTOS[answer.id]?.length || 1)) | 0,
  }));
}

// Wrong answers should look plausible: similar skin tone and shared tags score higher.
function pickDecoys(answer, rand) {
  return CELEBS.filter(c => c !== answer).map(c => {
    let s = rand() * 2;
    if (Math.abs(c.skin - answer.skin) <= 1) s += 3;
    s += c.tags.filter(t => answer.tags.includes(t)).length * 1.5;
    return [s, c];
  }).sort((a, b) => b[0] - a[0]).slice(0, 3).map(x => x[1]);
}

// In practice, avoid showing the photo of someone this member saw last time.
function pickFreshVariant(c) {
  const n = PHOTOS[c.id]?.length || 0;
  if (n < 2) return 0;
  const last = load("ntn-last-photo", {});
  const choices = [...Array(n).keys()].filter(v => v !== last[c.id]);
  const v = choices[Math.random() * choices.length | 0];
  last[c.id] = v;
  save("ntn-last-photo", last);
  return v;
}

// ---- Photos and the zoom ------------------------------------------------
const IMG = import.meta.env.BASE_URL.replace(/\/$/, "") + "/img";
const zoomFor = q => ZOOM[`${q.answer.id}/${q.photo}`];

function stageAt(z, t) {
  if (!z || t < z.brow) return STAGES[0];
  if (t < z.eyes) return STAGES[1];
  if (t < z.nose) return STAGES[2];
  return STAGES[3];
}

// Frame the zoom picture so the stage shows the rect between the dome (t=0) and full (t=1) framings.
function frame(img, z, t) {
  const r = z.crop.map((v, i) => v + (z.full[i] - v) * t);
  img.style.transform = `translate(${(-r[0] / r[2] * 100).toFixed(3)}%, ${(-r[1] / r[2] * 100).toFixed(3)}%) scale(${(1 / r[2]).toFixed(4)})`;
}

function stageHTML(q, uid) {
  if (!zoomFor(q)) return headSVG(q.answer, uid);
  return `<img class="zoom" src="${IMG}/${q.answer.id}/${q.photo}/zoom.jpg" alt="The top of a famous bald head" data-fallback="${uid}">`;
}

function useFallback(img) {
  const c = state?.round[state.i].answer;
  if (c) img.outerHTML = headSVG(c, img.dataset.fallback);
}

function creditHTML(q) {
  const p = PHOTOS[q.answer.id]?.[q.photo];
  if (!p) return "";
  const author = p.author.length > 48 ? p.author.slice(0, 47) + "…" : p.author;
  return `<span class="credit">Photograph: <a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(author || "Wikimedia Commons")}</a>, ${esc(p.license)}</span>`;
}

// ---- Rendering ----------------------------------------------------------
const app = document.getElementById("app");
let state = null;
let clock = 0; // the running zoom's animation frame

const rankFor = points => RANKS.find(([min]) => points >= min)[1];
const pointsOf = results => results.reduce((s, r) => s + r.points, 0);
const stageOf = r => STAGES.find(s => s.key === r.stage);
const gridOf = results => results.map(r => r.correct ? stageOf(r).emoji : MISS_EMOJI).join("");
const gridLabel = results => results.map((r, j) => `${j + 1}: ${r.correct ? stageOf(r).name : "missed"}`).join(", ");

function barHTML(left) {
  return `<header class="bar enter">${left}<span class="crest" aria-hidden="true">NTN</span></header>`;
}

function untilTomorrow() {
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.ceil((next - now) / 60000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function renderHome() {
  cancelAnimationFrame(clock);
  state = null;
  const day = today(), sat = loadDaily();
  if (sat && !sat.done) forfeitRest(sat);
  const rec = loadRecord();
  const streak = rec.lastDay >= day - 1 ? rec.streak : 0;
  const done = sat?.done;
  app.innerHTML = `
    ${barHTML(`<span class="chip ghost"><span class="diamond" style="color:var(--gold)"></span>Members&rsquo; Foyer</span>`)}
    <section class="brand enter enter-2">
      <p class="tagline">Est. MMXXVI</p>
      <h1><span>Name That</span><span>N<span class="o">o</span>ggin</span></h1>
      <p class="tagline">The most distinguished cranial examination</p>
    </section>
    <section class="card gilded enter enter-3">
      <div class="daily-head">
        <span class="label">The Daily Noggin</span>
        <span class="label gold">No. ${roman(day)}</span>
      </div>
      ${done ? `
        <p class="lede voice">You have sat today&rsquo;s examination.</p>
        <p class="daily-score"><b class="thin">${pointsOf(sat.results)}</b><small> honours</small></p>
        <p class="grid-line" aria-label="${gridLabel(sat.results)}">${gridOf(sat.results)}</p>
        <button class="btn wide quiet" id="share">Copy Today&rsquo;s Certificate</button>
        <p class="toast" id="toast" aria-live="polite"></p><div id="copyfallback"></div>
        <p class="note">The next examination opens in ${untilTomorrow()}.</p>` : `
        <p class="lede voice">Ten distinguished heads, the same for every member today. Each begins as the dome alone and slowly withdraws to the full face. Name him early for the greater honour.</p>
        <div class="worths">${STAGES.map(s => `<span><b>${s.worth}</b>${s.name}</span>`).join("")}</div>
        <button class="btn wide" id="start">Commence Today&rsquo;s Examination</button>`}
      <div class="stats">
        <div class="stat"><b>${streak ? roman(streak) : "Nil"}</b><span>day streak</span></div>
        <div class="stat"><b>${rec.best || "&mdash;"}</b><span>finest honours</span></div>
        <div class="stat"><b>${rec.sat ? roman(rec.sat) : "Nil"}</b><span>examinations sat</span></div>
      </div>
    </section>
    <section class="card enter enter-4 practice">
      <div>
        <p class="label">The Practice Room</p>
        <p class="voice">Unlimited sittings. Nothing is recorded.</p>
      </div>
      <button class="btn quiet" id="practice">Enter</button>
    </section>
    <p class="note">Photographs courtesy of Wikimedia Commons, duly credited upon each reveal.</p>`;
  document.getElementById("start")?.addEventListener("click", startDaily);
  document.getElementById("practice").onclick = startPractice;
  if (done) wireShare(() => shareText(sat.results, day));
}

function startDaily() {
  const day = today();
  // One sitting per day: the attempt is saved as it goes, so leaving midway forfeits the rest.
  state = { mode: "daily", day, round: buildRound(seeded(day * 7919), false), i: 0, results: [] };
  save("ntn-daily", { day, results: [], done: false });
  renderQuestion();
}

// A daily left midway is finished as it stood: the unanswered heads count as missed.
function forfeitRest(sat) {
  const round = buildRound(seeded(sat.day * 7919), false);
  for (const q of round.slice(sat.results.length)) {
    sat.results.push({ id: q.answer.id, photo: q.photo, chosen: null, correct: false, stage: "dome", points: 0 });
  }
  sat.done = true;
  save("ntn-daily", sat);
  recordDaily(pointsOf(sat.results));
}

function startPractice() {
  state = { mode: "practice", round: buildRound(Math.random, true), i: 0, results: [] };
  renderQuestion();
}

function trackHTML() {
  return state.round.map((_, j) => {
    const r = state.results[j];
    return `<span class="seg ${r ? (r.correct ? "won" : "lost") : (j === state.i ? "now" : "")}"></span>`;
  }).join("");
}

function meterHTML(active) {
  return STAGES.map((s, k) => `<span class="step ${k < active ? "past" : k === active ? "on" : ""}">${s.name}<b>${s.worth}</b></span>`).join("");
}

function renderQuestion() {
  const { round, i } = state;
  const q = round[i];
  state.answered = false;
  state.started = 0;
  app.innerHTML = `
    ${barHTML(`<span class="chip"><span class="diamond"></span><span id="honours">${pointsOf(state.results)}</span> Honours</span>`)}
    <div class="progress enter">
      <div class="row">
        <span class="label">${state.mode === "daily" ? `Daily No. ${roman(state.day)}` : "The Practice Room"}</span>
        <span class="count thin">${roman(i + 1)} <small>/ ${roman(round.length)}</small></span>
      </div>
      <div class="track" id="track">${trackHTML()}</div>
    </div>
    <section class="card gilded exhibit enter enter-2" id="exhibit">
      <div class="stage" id="stage">${stageHTML(q, "h" + i)}</div>
      <div class="meter" id="meter" aria-hidden="true">${meterHTML(0)}</div>
      <div class="caption">
        <span class="plaque" id="plaque">Lot ${roman(i + 1)} &middot; Identity Withhead</span>
        <span class="worth" id="worth">Worth ${STAGES[0].worth}</span>
      </div>
    </section>
    <p class="question voice enter enter-3">Kindly identify the distinguished cranium.</p>
    <div class="options enter enter-3" id="options">
      ${q.options.map((o, k) => `<button class="opt" data-k="${k}"><span class="num">${roman(k + 1)}</span><span class="who">${esc(o.name)}</span></button>`).join("")}
    </div>
    <div id="after"></div>`;
  app.querySelectorAll(".opt").forEach(b => b.onclick = () => answer(+b.dataset.k));
  const img = app.querySelector(".stage img");
  if (img) {
    frame(img, zoomFor(q), 0);
    // the clock starts once he's actually on screen (or the drawn stand-in is)
    let started = false;
    const go = () => { if (!started && state?.round[state.i] === q && !state.answered) { started = true; runClock(q, img); } };
    img.onerror = () => { useFallback(img); go(); };
    if (img.complete) go(); else img.onload = go;
  } else {
    runClock(q, null);
  }
}

function runClock(q, img) {
  const z = zoomFor(q), t0 = performance.now();
  const meter = document.getElementById("meter"), worth = document.getElementById("worth");
  let shown = 0;
  state.started = t0;
  const tick = now => {
    if (state?.round[state.i] !== q || state.answered) return;
    const s = (now - t0) / 1000, t = withdrawnAt(s);
    if (img?.isConnected) frame(img, z, t);
    const k = STAGES.indexOf(stageAt(z, t));
    if (k !== shown) {
      shown = k;
      meter.innerHTML = meterHTML(k);
      worth.textContent = `Worth ${STAGES[k].worth}`;
    }
    if (s >= TIME_LIMIT) return answer(null);
    clock = requestAnimationFrame(tick);
  };
  clock = requestAnimationFrame(tick);
  // frames stop in a background tab; the time limit still applies
  setTimeout(() => { if (state?.round[state.i] === q && !state.answered) answer(null); }, TIME_LIMIT * 1000 + 100);
}

function answer(k) {
  if (state.answered) return;
  state.answered = true;
  cancelAnimationFrame(clock);
  const q = state.round[state.i];
  const z = zoomFor(q);
  // answering before the picture has even loaded counts as the dome
  const t = state.started ? withdrawnAt((performance.now() - state.started) / 1000) : 0;
  const stage = stageAt(z, t);
  const chosen = k === null ? null : q.options[k];
  const correct = !q.trick && chosen === q.answer;
  const points = correct ? stage.worth : 0;
  state.results.push({ id: q.answer.id, photo: q.photo, chosen: chosen?.id ?? null, correct, stage: stage.key, points });
  const last = state.i === state.round.length - 1;
  if (state.mode === "daily") {
    save("ntn-daily", { day: state.day, results: state.results, done: last });
    if (last) recordDaily(pointsOf(state.results));
  }

  app.querySelectorAll(".opt").forEach((b, j) => {
    b.disabled = true;
    const o = q.options[j];
    if (q.trick) b.classList.add(j === k ? "wrong" : "dim");
    else if (o === q.answer) b.classList.add("right");
    else if (j === k) b.classList.add("wrong");
    else b.classList.add("dim");
  });
  revealFull(app.querySelector(".stage img.zoom"), z, t);
  const plaque = document.getElementById("plaque");
  plaque.textContent = q.answer.name;
  plaque.classList.add("named");
  document.getElementById("meter").innerHTML = meterHTML(STAGES.indexOf(stage));
  document.getElementById("worth").textContent = `+${points}`;
  if (correct) document.getElementById("exhibit").classList.add("lauded");
  document.getElementById("track").innerHTML = trackHTML();
  document.getElementById("honours").textContent = pointsOf(state.results);

  const after = document.getElementById("after");
  after.innerHTML = `
    <section class="card verdict ${correct ? "good" : "bad"}">
      <span class="exclaim voice">${k === null ? "Time has been called." : correct ? pickOne(PRAISE) : pickOne(REGRET)}</span>
      <span class="name">${correct ? "Indeed, " : "The cranium belongs to "}${esc(q.answer.name)}.</span>
      <span class="known">${esc(q.answer.known)}</span>
      <span class="how">${correct ? `${stage.said} <b>+${points}</b>` : q.trick ? "There is only one Danny DeVito, and it was not that one." : "No honours for this specimen."}</span>
      ${creditHTML(q)}
      <button class="btn wide" id="next">${last ? "Receive Your Verdict" : "Proceed to the Next Specimen"}</button>
    </section>`;
  const next = document.getElementById("next");
  next.onclick = advance;
  next.focus({ preventScroll: true });
  if (matchMedia("(max-width: 700px)").matches) after.scrollIntoView({ behavior: "smooth", block: "end" });
}

// After answering, the picture glides the rest of the way out to the full head.
function revealFull(img, z, from) {
  if (!img || !z) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dur = reduce ? 0 : 1100, t0 = performance.now();
  const ease = x => 1 - Math.pow(1 - x, 3);
  const step = now => {
    const u = dur ? Math.min(1, (now - t0) / dur) : 1;
    frame(img, z, from + (1 - from) * ease(u));
    if (u < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  setTimeout(() => frame(img, z, 1), dur + 200); // frames stop in a background tab
}

function advance() {
  state.i++;
  window.scrollTo({ top: 0 });
  if (state.i < state.round.length) renderQuestion();
  else renderResults();
}

function shareText(results, day) {
  const points = pointsOf(results);
  const head = day ? `The Daily Noggin No. ${roman(day)}` : "Name That Noggin (practice)";
  return `${head}: ${points} honours\n${gridOf(results)}\n${rankFor(points)}\n${location.origin}${import.meta.env.BASE_URL}`;
}

function wireShare(text) {
  document.getElementById("share").onclick = () => {
    const toast = document.getElementById("toast"), t = text();
    const fallback = () => {
      document.getElementById("copyfallback").innerHTML = `<textarea class="copybox" id="copybox" rows="4" readonly>${esc(t)}</textarea>`;
      const box = document.getElementById("copybox"); box.focus(); box.select();
      toast.textContent = "Kindly select the text below and copy it.";
    };
    try {
      navigator.clipboard.writeText(t).then(() => { toast.textContent = "Copied. Do share it with your lesser acquaintances."; }, fallback);
    } catch { fallback(); }
  };
}

const byId = id => CELEBS.find(c => c.id === id);

function renderResults() {
  const { results, round, mode, day } = state;
  const points = pointsOf(results), daily = mode === "daily";
  const rec = loadRecord();
  const named = results.filter(r => r.correct).length;
  const fromDome = results.filter(r => r.correct && r.stage === "dome").length;
  app.innerHTML = `
    ${barHTML(`<span class="chip"><span class="diamond"></span>${points} Honours</span>`)}
    <section class="card gilded jackpot enter">
      <span class="medal" aria-hidden="true">N&middot;T&middot;N</span>
      <p class="label">${daily ? `The Daily Noggin &middot; No. ${roman(day)}` : "The Practice Room"}</p>
      <h2>Certificate of Cranial Discernment</h2>
      <p class="body voice" style="font-size:17px">The bearer is awarded</p>
      <div class="tally">${points}<small> honours</small></div>
      <p class="body voice" style="font-size:17px">having named ${roman(named)} of ${roman(round.length)} craniums${fromDome ? `, ${roman(fromDome)} from the dome alone` : ""}, and is hereby recognised as</p>
      <p class="rank">${rankFor(points)}</p>
      <p class="grid-line" aria-label="${gridLabel(results)}">${gridOf(results)}</p>
      ${daily && rec.streak > 1 ? `<p class="body voice" style="font-size:16px;color:var(--gold)">A streak of ${roman(rec.streak)} consecutive days.</p>` : ""}
    </section>
    <div class="actions enter enter-2 ${daily ? "two" : ""}">
      ${daily ? "" : `<button class="btn" id="again">Sit Again</button>`}
      <button class="btn ${daily ? "" : "quiet"}" id="share">Copy Certificate</button>
      <button class="btn quiet" id="home">The Foyer</button>
    </div>
    <p class="toast" id="toast" aria-live="polite"></p>
    <div id="copyfallback"></div>
    ${daily ? `<p class="note">The next examination opens in ${untilTomorrow()}. The Practice Room is open meanwhile.</p>` : ""}
    <section class="card board enter enter-3">
      <div class="head"><span class="label">The Record</span><span class="label">${points} honours</span></div>
      <ol>${results.map((r, j) => {
        const c = byId(r.id), chosen = r.chosen && byId(r.chosen);
        const how = r.correct ? `Named at the ${stageOf(r).name.toLowerCase()}`
          : r.chosen === null ? "Time was called"
          : r.chosen === r.id ? "There is only one DeVito"
          : `Mistaken for ${esc(chosen.name)}`;
        return `<li><span class="n">${j + 1}</span><span class="avatar ${r.correct ? "won" : ""}"><img src="${IMG}/${r.id}/${r.photo}/crop.jpg" alt="" loading="lazy"></span><span class="who">${esc(c.name)}<small>${how}</small></span><span class="res ${r.correct ? "ok" : "no"}">+${r.points}</span></li>`;
      }).join("")}</ol>
    </section>`;
  document.getElementById("again")?.addEventListener("click", startPractice);
  document.getElementById("home").onclick = renderHome;
  wireShare(() => shareText(results, daily ? day : 0));
}

// Keyboard: 1–4 to answer.
document.addEventListener("keydown", e => {
  if (!state || state.answered || !document.getElementById("options")) return;
  if (/^[1-4]$/.test(e.key)) answer(+e.key - 1);
});

renderHome();
