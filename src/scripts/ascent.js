// The Ascent of the Dome: each correct answer climbs the player up a giant forehead,
// from the eyebrows, through the Norwood stages of hair loss, to the polished summit.
// The world is one tall layer behind the game; a camera pans it to follow the climber.

export const SUMMIT = 1000; // metres; a perfect, swift round lands exactly here

// Norwood stage bands, bottom to top: [starts at metres, stage, name]
export const ZONES = [
  [0, "Norwood I", "The Hairline"],
  [120, "Norwood II", "The Temples"],
  [260, "Norwood III", "The Receding Cliffs"],
  [400, "Norwood IV", "The Crown Clearing"],
  [550, "Norwood V", "The Tonsure Plateau"],
  [700, "Norwood VI", "The Last Bridge"],
  [850, "Norwood VII", "Total Enlightenment"],
  [SUMMIT, "The Summit", "A perfect ascent ends here"],
];

const LANDMARKS = [
  [45, "the last eyebrow hair stands to attention"],
  [95, "a comb was last seen here"],
  [165, "the widow’s peak makes its final stand"],
  [215, "hats become a lifestyle choice"],
  [320, "the comb-over expedition of ’87 turned back here"],
  [370, "the shampoo budget is quietly halved"],
  [460, "base camp of the bald spot"],
  [510, "monks have been sighted"],
  [610, "the comb is formally retired"],
  [660, "sun cream is now compulsory"],
  [760, "the last bridge of hair collapses"],
  [820, "a single hair waves farewell"],
  [900, "the glare can be seen by passing aircraft"],
  [960, "the air is thin; the scalp, thinner"],
];

const HAIR_LINE = 800;   // hair thins out completely by here
const LONE_HAIR = 820;
const PX_PER_M = 3;      // world pixels per metre
const BELOW = 260;       // world below 0m: the brows
const ABOVE = 420;       // world above the summit: the glow
const WORLD_H = BELOW + SUMMIT * PX_PER_M + ABOVE;
const yOf = m => WORLD_H - BELOW - m * PX_PER_M; // top offset in the world for an altitude

// Base metres for a correct answer by difficulty, plus up to SWIFT_MAX for answering quickly.
const BASE = { 1: 70, 2: 80, 3: 90 };
const SWIFT_MAX = 22, SWIFT_FULL = 2, SWIFT_NONE = 12; // seconds
export const SLIP = 30; // the DeVito trick pushes you back down

export function climbFor({ correct, trick, difficulty, seconds }) {
  if (trick) return { metres: -SLIP, swift: 0 };
  if (!correct) return { metres: 0, swift: 0 };
  const t = Math.min(1, Math.max(0, (SWIFT_NONE - seconds) / (SWIFT_NONE - SWIFT_FULL)));
  const swift = Math.round(SWIFT_MAX * t);
  return { metres: BASE[difficulty] + swift, swift };
}

export const clampAlt = m => Math.max(0, Math.min(SUMMIT, m));

export function zoneAt(m) {
  let z = ZONES[0];
  for (const zone of ZONES) if (m >= zone[0]) z = zone;
  return { at: z[0], stage: z[1], name: z[2] };
}

// Seeded random so the hair looks the same every visit.
function rng(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

function hairSVG() {
  const rand = rng(1987);
  const W = 1000;
  let paths = "";
  // Density falls off towards HAIR_LINE, in bands so each Norwood stage visibly thins.
  for (let m = -60; m < HAIR_LINE; m += 6) {
    const left = Math.max(0, 1 - Math.max(0, m) / HAIR_LINE);
    const n = Math.round(14 * Math.pow(left, 1.6));
    for (let k = 0; k < n; k++) {
      // a bald patch opens in the middle and widens with altitude
      const gap = Math.max(0, m - 250) / (HAIR_LINE - 250) * 0.42;
      let x = rand();
      if (Math.abs(x - 0.5) < gap) x = x < 0.5 ? 0.5 - gap - rand() * 0.05 : 0.5 + gap + rand() * 0.05;
      x *= W;
      const y = yOf(m + rand() * 6);
      // each strand is a lazy S-curve, combed outwards from the middle
      const len = 30 + rand() * 40;
      const lean = (rand() - 0.5) * 40 + (x < W / 2 ? -14 : 14);
      const curl = (rand() - 0.5) * 36;
      const tone = 16 + (rand() * 16 | 0);
      const f = n => n.toFixed(1);
      paths += `<path d="M${f(x)} ${f(y)} c${f(curl)} ${f(-len * .35)} ${f(lean - curl)} ${f(-len * .65)} ${f(lean)} ${f(-len)}" stroke="hsl(28 24% ${tone}%)"/>`;
    }
  }
  // the lone survivor
  const y = yOf(LONE_HAIR);
  paths += `<path class="lone" d="M640 ${y} q-6 -40 14 -78 q10 -18 2 -34" stroke="var(--gold)"/>`;
  return `<svg class="hair" viewBox="0 0 ${W} ${WORLD_H}" preserveAspectRatio="none" aria-hidden="true">
    <g fill="none" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke">${paths}</g></svg>`;
}

// The world begins at the eyebrows.
function browsSVG() {
  return `<svg class="brows" viewBox="0 0 1000 ${BELOW}" preserveAspectRatio="xMidYMin meet" style="top:${WORLD_H - BELOW}px;height:${BELOW}px" aria-hidden="true">
    <path d="M150 140 q160 -90 330 -20 M520 120 q170 -70 330 20" stroke="#2B211C" stroke-width="34" stroke-linecap="round" fill="none"/>
  </svg>`;
}

function worldHTML() {
  const marks = LANDMARKS.map(([m, text], i) =>
    `<div class="mark ${i % 2 ? "r" : "l"}" style="top:${yOf(m)}px"><span>${text}</span><b>${m}m</b></div>`).join("");
  const zones = ZONES.slice(0, -1).map(([m, stage, name]) =>
    `<div class="zone" style="top:${yOf(m)}px"><span>${stage}</span><em>${name}</em></div>`).join("");
  return `
    <div class="world-track" id="world-track" style="height:${WORLD_H}px">
      <div class="summit" style="top:${yOf(SUMMIT)}px"><span>The Summit</span><em>a perfect ascent ends here</em></div>
      ${hairSVG()}${browsSVG()}${zones}${marks}
      <div class="climber" id="climber" style="top:${yOf(0)}px"><span class="pip"></span><span class="you">You</span></div>
    </div>
    <div class="gauge" aria-hidden="true">
      ${ZONES.map(([m]) => `<i style="bottom:${m / SUMMIT * 100}%"></i>`).join("")}
      <b id="gauge-pip" style="bottom:0%"></b>
    </div>`;
}

// ---- Camera ---------------------------------------------------------------
let alt = 0;
let track, climber, pip;
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountWorld(el) {
  el.innerHTML = worldHTML();
  track = el.querySelector("#world-track");
  climber = el.querySelector("#climber");
  pip = el.querySelector("#gauge-pip");
  addEventListener("resize", () => place(alt));
  place(0);
}

function place(m) {
  // keep the climber about 60% of the way down the screen
  const anchor = innerHeight * 0.6;
  track.style.transform = `translateY(${(anchor - yOf(m)).toFixed(1)}px)`;
  climber.style.top = `${yOf(m)}px`;
  pip.style.bottom = `${(m / SUMMIT * 100).toFixed(2)}%`;
}

// Pan from the current altitude to `to`. onTick gets the altitude on each frame.
export function climbTo(to, onTick = () => {}) {
  const from = alt;
  alt = to;
  const dur = reduce() || from === to ? 0 : 900 + Math.min(1200, Math.abs(to - from) * 12);
  return new Promise(done => {
    const t0 = performance.now();
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    let finished = false;
    function frame(now) {
      if (finished) return;
      const t = dur ? Math.min(1, (now - t0) / dur) : 1;
      const m = from + (to - from) * ease(t);
      place(m);
      onTick(m);
      if (t < 1) requestAnimationFrame(frame);
      else { finished = true; done(); }
    }
    requestAnimationFrame(frame);
    // frames stop in a background tab; never leave the game stuck mid-climb
    setTimeout(() => frame(t0 + dur), dur + 200);
  });
}

export function resetClimb() {
  alt = 0;
  place(0);
}
