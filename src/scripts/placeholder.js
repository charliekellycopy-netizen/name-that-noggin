// A drawn bald head, shown only if a photo fails to load.
const SKIN = {
  1: ["#F1CDB3", "#D9A988", "#FFF1E6"],
  2: ["#DDAB82", "#BB875F", "#F8DCC4"],
  3: ["#BC8256", "#97633C", "#E6B993"],
  4: ["#8E5A36", "#6C4226", "#C08A63"],
  5: ["#6A3F25", "#4E2C18", "#A0704F"],
};
const CROP_VIEW = [22, 20, 156, 117]; // just the dome
const CUT_CROP = 102; // fade line just above the eyebrows

export function headSVG(c, uid) {
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
