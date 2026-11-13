// The drawn room for the interactive room section (Home, section 03).
//
// Everything is drawn on a 1600 x 1000 canvas, seen straight on: the back
// wall with a window (blind and curtains), a sofa with cushions, an
// armchair, and a wooden floor with a rug. The floor and the rug are real
// perspective planes (CSS 3D, see room.css rules in globals.css); the rest
// is SVG. Each changeable element has:
//   PARTS      the outline(s) that get the fabric texture
//   Shade      the light and shadow drawn over the fabric (never changes)
//   SPOTS      where its tap point sits
//   FOCUS      the x the room pans to on a phone when it is picked
// Perspective: eye level at y = 360, the wall meets the floor at y = 740,
// the viewer is 1760 units (110% of the width) from the picture.
import type { RoomSlug } from "@/lib/content";

export const W = 1600;
export const H = 1000;

// ---------------------------------------------------------------- helpers

/** Rounded rectangle. */
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;

/** Rectangle with only the top corners rounded (sofa arms, chair back). */
const topRound = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;

/** A filled cushion: corners pulled out, sides drawn in, turned by deg. */
function cushion(cx: number, cy: number, w: number, h: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const p = (x: number, y: number) => {
    const rx = cx + x * Math.cos(a) - y * Math.sin(a);
    const ry = cy + x * Math.sin(a) + y * Math.cos(a);
    return `${rx.toFixed(1)} ${ry.toFixed(1)}`;
  };
  const hw = w / 2;
  const hh = h / 2;
  const inset = Math.min(w, h) * 0.07;
  return (
    `M${p(-hw, -hh)}Q${p(0, -hh + inset)} ${p(hw, -hh)}` +
    `Q${p(hw - inset, 0)} ${p(hw, hh)}` +
    `Q${p(0, hh - inset)} ${p(-hw, hh)}` +
    `Q${p(-hw + inset, 0)} ${p(-hw, -hh)}Z`
  );
}

/** A curtain panel: straight top, slightly flared sides, scalloped hem. */
function panel(topL: number, topR: number, botL: number, botR: number, top: number, bottom: number, folds: number) {
  let d = `M${topL} ${top}H${topR}L${botR} ${bottom}`;
  const step = (botR - botL) / folds;
  for (let i = 1; i <= folds; i++) {
    const x = botR - i * step;
    d += `Q${(x + step / 2).toFixed(1)} ${bottom + 9} ${x.toFixed(1)} ${bottom}`;
  }
  return `${d}L${topL} ${top}Z`;
}

// ------------------------------------------------------------------ parts

const CURTAIN_L = panel(398, 548, 386, 562, 98, 744, 6);
const CURTAIN_R = panel(832, 982, 818, 994, 98, 744, 6);

const BLIND_RAIL = rr(468, 126, 444, 12, 3);
const BLIND_F1 = "M472 134H908V198H472Z";
const BLIND_F2 = "M472 198H908V260H472Z";
const BLIND_F3 = "M472 260H908V320Q690 333 472 320Z";

const SOFA = {
  back: topRound(1000, 574, 520, 160, 26),
  backL: rr(1042, 590, 216, 136, 22),
  backR: rr(1262, 590, 216, 136, 22),
  topL: rr(1040, 710, 220, 26, 9),
  topR: rr(1260, 710, 220, 26, 9),
  frontL: rr(1040, 728, 220, 64, 14),
  frontR: rr(1260, 728, 220, 64, 14),
  base: rr(964, 788, 592, 64, 10),
  armL: topRound(960, 642, 84, 214, 30),
  armR: topRound(1476, 642, 84, 214, 30),
};

const CHAIR = {
  back: topRound(106, 596, 188, 180, 60),
  top: rr(126, 756, 148, 24, 9),
  front: rr(124, 772, 152, 56, 12),
  base: rr(110, 822, 180, 50, 8),
  armL: topRound(70, 690, 64, 186, 26),
  armR: topRound(266, 690, 64, 186, 26),
};

const CUSHIONS = [cushion(1100, 668, 124, 118, -9), cushion(1418, 668, 124, 118, 8), cushion(1262, 692, 150, 86, 0)];

/** Outlines that take the texture, in drawing order. The rug is not here: it is a CSS 3D plane. */
export const PARTS: Record<Exclude<RoomSlug, "rug">, string[]> = {
  wall: ["M0 0H1600V740H0Z"],
  blind: [BLIND_F1, BLIND_F2, BLIND_F3, BLIND_RAIL],
  curtains: [CURTAIN_L, CURTAIN_R],
  sofa: [SOFA.back, SOFA.backL, SOFA.backR, SOFA.topL, SOFA.topR, SOFA.frontL, SOFA.frontR, SOFA.base, SOFA.armL, SOFA.armR],
  armchair: [CHAIR.back, CHAIR.top, CHAIR.front, CHAIR.base, CHAIR.armL, CHAIR.armR],
  cushions: CUSHIONS,
};

/** Drawing order, back to front. "rug" stands for the floor plane. */
export const ORDER: RoomSlug[] = ["wall", "rug", "blind", "curtains", "armchair", "sofa", "cushions"];

/** Tap point of each element, in canvas units. */
export const SPOTS: Record<RoomSlug, [number, number]> = {
  wall: [1480, 210],
  blind: [690, 196],
  curtains: [473, 430],
  sofa: [1372, 760],
  cushions: [1100, 668],
  armchair: [200, 666],
  rug: [760, 905],
};

/** Where to centre the room on a narrow screen when an element is picked. */
export const FOCUS: Record<RoomSlug, number> = {
  wall: 800,
  blind: 690,
  curtains: 690,
  sofa: 1250,
  cushions: 1250,
  armchair: 300,
  rug: 860,
};

/** Fill used when an element has no options (drawn, but not tappable). */
export const PLAIN: Record<RoomSlug, string> = {
  wall: "#e8e0d3",
  blind: "#efe9de",
  curtains: "#ebe4d4",
  sofa: "#9a958c",
  armchair: "#b9ab98",
  cushions: "#d9cfc2",
  rug: "#d8cfc0",
};

// ---------------------------------------------------- shared definitions

/** Gradients used by the shading layers. Rendered once, in a hidden SVG. */
export function RoomDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="room-fold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="29" y2="0" spreadMethod="repeat">
          <stop offset="0" stopColor="#000" stopOpacity="0.26" />
          <stop offset="0.28" stopColor="#fff" stopOpacity="0.13" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.8" stopColor="#000" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000" stopOpacity="0.26" />
        </linearGradient>
        <linearGradient id="room-hang" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="0.12" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.8" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="room-top-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.26" />
        </linearGradient>
        <linearGradient id="room-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.02" />
          <stop offset="1" stopColor="#000" stopOpacity="0.26" />
        </linearGradient>
        <linearGradient id="room-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.2" />
          <stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </linearGradient>
        <radialGradient id="room-pillow" cx="0.48" cy="0.38" r="0.66">
          <stop offset="0" stopColor="#fff" stopOpacity="0.17" />
          <stop offset="0.55" stopColor="#000" stopOpacity="0.02" />
          <stop offset="1" stopColor="#000" stopOpacity="0.32" />
        </radialGradient>
        <linearGradient id="room-arm-l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="0.5" stopColor="#000" stopOpacity="0.04" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="room-arm-r" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.3" />
          <stop offset="0.5" stopColor="#000" stopOpacity="0.04" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="room-fold-blind" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="0.65" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id="room-cast" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.2" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="room-shadow">
          <stop offset="0" stopColor="#000" stopOpacity="0.42" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="room-glow" gradientUnits="userSpaceOnUse" cx="690" cy="360" r="640">
          <stop offset="0" stopColor="#fff" stopOpacity="0.34" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="room-wall-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.14" />
          <stop offset="0.3" stopColor="#000" stopOpacity="0" />
          <stop offset="0.88" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="room-wall-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.16" />
          <stop offset="0.22" stopColor="#000" stopOpacity="0" />
          <stop offset="0.78" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.16" />
        </linearGradient>
        <linearGradient id="room-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c6d9e6" />
          <stop offset="0.62" stopColor="#e8eef0" />
          <stop offset="1" stopColor="#f3efe5" />
        </linearGradient>
        <linearGradient id="room-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="room-junction" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.24" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <clipPath id="room-glass-clip">
          <rect x="472" y="132" width="436" height="446" />
        </clipPath>
      </defs>
    </svg>
  );
}

// ------------------------------------------------------- static layers

const FRAME = "#f6f2ea";

/** Wall light and shade, cornice, skirting, the window and the picture. */
export function BackStatic() {
  return (
    <>
      <rect width="1600" height="740" fill="url(#room-wall-v)" />
      <rect width="1600" height="740" fill="url(#room-wall-h)" />
      <rect width="1600" height="740" fill="url(#room-glow)" />
      {/* Skirting board */}
      <rect y="710" width="1600" height="4" fill="#000" opacity="0.1" />
      <rect y="713" width="1600" height="27" fill="#f2ece2" />
      {/* Window: shadow on the wall, frame, the view, glazing bars, sill */}
      <rect x="456" y="118" width="480" height="490" rx="4" fill="#000" opacity="0.08" />
      <rect x="450" y="110" width="480" height="490" rx="4" fill={FRAME} />
      <rect x="472" y="132" width="436" height="446" fill="url(#room-sky)" />
      <g clipPath="url(#room-glass-clip)">
        <ellipse cx="520" cy="560" rx="120" ry="80" fill="#a9bf9f" opacity="0.7" />
        <ellipse cx="640" cy="585" rx="150" ry="70" fill="#9db394" opacity="0.65" />
        <ellipse cx="820" cy="555" rx="140" ry="95" fill="#b3c7a8" opacity="0.7" />
        <ellipse cx="905" cy="590" rx="90" ry="60" fill="#97ad8f" opacity="0.6" />
        <path d="M472 132H700L472 420Z" fill="url(#room-shine)" />
        <path d="M720 132H800L560 578H480Z" fill="#fff" opacity="0.12" />
      </g>
      <rect x="472" y="132" width="436" height="10" fill="#000" opacity="0.08" />
      <rect x="472" y="132" width="8" height="446" fill="#000" opacity="0.05" />
      <rect x="686" y="132" width="8" height="446" fill={FRAME} />
      <rect x="472" y="288" width="436" height="8" fill={FRAME} />
      <rect x="432" y="596" width="516" height="18" rx="3" fill="#f9f6ef" />
      <rect x="440" y="614" width="500" height="12" fill="url(#room-cast)" />
      {/* Framed picture above the sofa */}
      <rect x="1167" y="309" width="200" height="160" fill="#000" opacity="0.14" />
      <rect x="1160" y="300" width="200" height="160" fill="#2e2722" />
      <rect x="1167" y="307" width="186" height="146" fill="#f4efe6" />
      <rect x="1186" y="326" width="148" height="108" fill="#eadbc6" />
      <circle cx="1296" cy="362" r="20" fill="#c06a4e" />
      <path d="M1186 412Q1226 376 1262 400T1334 392V434H1186Z" fill="#9aab8f" />
      <path d="M1186 424Q1240 404 1290 420T1334 416V434H1186Z" fill="#6f8566" />
    </>
  );
}

/** Soft shadows on the floor: where it meets the wall and under furniture. */
export function FloorShadows() {
  return (
    <>
      <rect y="740" width="1600" height="26" fill="url(#room-junction)" />
      <ellipse cx="474" cy="745" rx="100" ry="7" fill="url(#room-shadow)" />
      <ellipse cx="906" cy="745" rx="100" ry="7" fill="url(#room-shadow)" />
      <ellipse cx="200" cy="893" rx="160" ry="15" fill="url(#room-shadow)" />
      <ellipse cx="1260" cy="872" rx="340" ry="18" fill="url(#room-shadow)" />
    </>
  );
}

// ---------------------------------------------------------------- shading

const seam = { fill: "none", stroke: "#000", strokeOpacity: 0.16, strokeWidth: 1.5 } as const;

/** Light and shadow over each element's fabric. Never changes with the fabric. */
export function Shade({ slug }: { slug: Exclude<RoomSlug, "rug"> }) {
  switch (slug) {
    case "wall":
      return null;
    case "blind":
      return (
        <>
          <rect x="472" y="320" width="436" height="18" fill="url(#room-cast)" />
          <path d={BLIND_F1} fill="url(#room-fold-blind)" />
          <path d={BLIND_F2} fill="url(#room-fold-blind)" />
          <path d={BLIND_F3} fill="url(#room-fold-blind)" />
          <path d={BLIND_RAIL} fill="url(#room-top-light)" />
          <rect x="472" y="197" width="436" height="2" fill="#000" opacity="0.2" />
          <rect x="472" y="259" width="436" height="2" fill="#000" opacity="0.2" />
        </>
      );
    case "curtains":
      return (
        <>
          {[CURTAIN_L, CURTAIN_R].map((d) => (
            <g key={d}>
              <path d={d} fill="url(#room-fold)" />
              <path d={d} fill="url(#room-hang)" />
            </g>
          ))}
          {/* Pleated heading */}
          <rect x="398" y="98" width="150" height="26" fill="#fff" opacity="0.08" />
          <rect x="832" y="98" width="150" height="26" fill="#fff" opacity="0.08" />
          <rect x="398" y="123" width="150" height="2" fill="#000" opacity="0.14" />
          <rect x="832" y="123" width="150" height="2" fill="#000" opacity="0.14" />
          {/* Pole, brackets, finials and rings */}
          <rect x="424" y="84" width="6" height="16" fill="#3a3029" />
          <rect x="950" y="84" width="6" height="16" fill="#3a3029" />
          <rect x="392" y="88" width="596" height="7" rx="3.5" fill="#3a3029" />
          <circle cx="388" cy="91.5" r="10" fill="#3a3029" />
          <circle cx="992" cy="91.5" r="10" fill="#3a3029" />
          {[...Array(7)].map((_, i) => (
            <g key={i}>
              <ellipse cx={404 + i * 23} cy="96" rx="5.5" ry="7" fill="none" stroke="#3a3029" strokeWidth="2.5" />
              <ellipse cx={838 + i * 23} cy="96" rx="5.5" ry="7" fill="none" stroke="#3a3029" strokeWidth="2.5" />
            </g>
          ))}
        </>
      );
    case "sofa":
      return (
        <>
          <path d={SOFA.back} fill="url(#room-top-light)" />
          {/* Cushion shadows on the back */}
          <ellipse cx="1110" cy="690" rx="70" ry="58" fill="url(#room-shadow)" opacity="0.7" />
          <ellipse cx="1428" cy="690" rx="70" ry="58" fill="url(#room-shadow)" opacity="0.7" />
          <ellipse cx="1266" cy="706" rx="84" ry="40" fill="url(#room-shadow)" opacity="0.7" />
          <path d={SOFA.backL} fill="url(#room-pillow)" />
          <path d={SOFA.backR} fill="url(#room-pillow)" />
          <path d={SOFA.topL} fill="#fff" opacity="0.12" />
          <path d={SOFA.topR} fill="#fff" opacity="0.12" />
          <path d={SOFA.frontL} fill="url(#room-front)" />
          <path d={SOFA.frontR} fill="url(#room-front)" />
          <path d={SOFA.base} fill="url(#room-base)" />
          <path d={SOFA.armL} fill="url(#room-arm-l)" />
          <path d={SOFA.armR} fill="url(#room-arm-r)" />
          <rect x="960" y="642" width="84" height="22" rx="11" fill="#fff" opacity="0.1" />
          <rect x="1476" y="642" width="84" height="22" rx="11" fill="#fff" opacity="0.1" />
          {[SOFA.backL, SOFA.backR, SOFA.frontL, SOFA.frontR, SOFA.armL, SOFA.armR].map((d) => (
            <path key={d} d={d} {...seam} />
          ))}
          {/* Legs */}
          <path d="M982 852H998L995 878H985Z" fill="#3a3029" />
          <path d="M1522 852H1538L1535 878H1525Z" fill="#3a3029" />
        </>
      );
    case "armchair":
      return (
        <>
          <path d={CHAIR.back} fill="url(#room-pillow)" />
          <path d={CHAIR.top} fill="#fff" opacity="0.12" />
          <path d={CHAIR.front} fill="url(#room-front)" />
          <path d={CHAIR.base} fill="url(#room-base)" />
          <path d={CHAIR.armL} fill="url(#room-arm-l)" />
          <path d={CHAIR.armR} fill="url(#room-arm-r)" />
          <rect x="70" y="690" width="64" height="20" rx="10" fill="#fff" opacity="0.1" />
          <rect x="266" y="690" width="64" height="20" rx="10" fill="#fff" opacity="0.1" />
          {[CHAIR.back, CHAIR.front, CHAIR.armL, CHAIR.armR].map((d) => (
            <path key={d} d={d} {...seam} />
          ))}
          <path d="M84 874H98L95 898H87Z" fill="#3a3029" />
          <path d="M302 874H316L313 898H305Z" fill="#3a3029" />
        </>
      );
    case "cushions":
      return (
        <>
          {CUSHIONS.map((d) => (
            <g key={d}>
              <path d={d} fill="url(#room-pillow)" />
              <path d={d} {...seam} />
            </g>
          ))}
        </>
      );
  }
}
