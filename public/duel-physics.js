// vr.phylab.uk — Duel: the physics. Plain numbers and arrays only (no three.js), so it can be tested on its own.
//
// Each player stands at the origin of their own space, facing −z; the other player stands at distance D in front.
// A message from the other player is turned into our space by turning it half round about the vertical and moving it
// D forward (mirrorP, mirrorV, mirrorQ). Doing it twice gives back the same thing, so both players use the same rule.
//
// Units: metres, seconds; every charge has mass 1 and charge +1 or −1, so q/m = ±1. The constants are chosen for the
// feel of the game, not real sizes (a real hand-held field could not stop anything).
//
// Electric shield: a uniformly charged ball held in front of the left hand. Outside the ball E = kQ r̂ / r², inside it
// grows linearly from the centre. A like charge is slowed and pushed back; an unlike charge is pulled in. A fast charge
// gets through: head-on, a charge stops where kQ/r = ½v², and the ball's centre is at 1.5 kQ/R.
// Magnetic shield: a uniform field B in a slab in front of the left hand, B along the hand's "up". The force qv × B is
// always at right angles to v, so it does no work: the charge is turned on a circle of radius r = mv/(qB), never
// slowed. A fast charge is turned less.
// The charges are moved with the Boris method, which keeps the speed exactly the same in a magnetic field (a simple
// step would make charges speed up in B, the one thing a magnetic field cannot do).

export const D = 6;                                           // distance between the two players
export const HP = 5;                                          // hits a player can take
export const SPEED = { min: 4, max: 10, full: 1 };            // m/s; holding the trigger `full` s gives max
export const COOLDOWN = 0.35, MAX_LIVE = 6;
export const E_SHIELD = { k: 6.3, r: 0.2, ahead: 0.25 };
export const B_SHIELD = { b: 16, w: 0.9, h: 0.9, d: 0.45, ahead: 0.4 };
export const ENERGY = { max: 100, drain: 30, refill: 20, restart: 20 };
export const PROJ = { r: 0.05, life: 5 };
export const BODY = { head: 0.14, torso: 0.2, neck: 0.25, hip: 1.0 };

/** Rotate vector v by quaternion q = [x, y, z, w]. */
export function rot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
export const mirrorP = ([x, y, z]) => [-x, y, -z - D];
export const mirrorV = ([x, y, z]) => [-x, y, -z];
export const mirrorQ = ([x, y, z, w]) => [z, w, -x, -y];   // half a turn about the vertical, then q

const add = (a, b, s = 1) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The shield in front of a hand { p, q }: type "E" or "B", sign +1 or −1. */
export function shieldFrom(hand, type, sign) {
  const fwd = rot(hand.q, [0, 0, -1]);
  if (type === "E") return { type, sign, c: add(hand.p, fwd, E_SHIELD.ahead) };
  return { type, sign, c: add(hand.p, fwd, B_SHIELD.ahead), right: rot(hand.q, [1, 0, 0]), up: rot(hand.q, [0, 1, 0]), fwd };
}

/** Is the point inside the magnetic slab? */
export function inSlab(s, x) {
  const d = [x[0] - s.c[0], x[1] - s.c[1], x[2] - s.c[2]];
  return Math.abs(dot(d, s.right)) < B_SHIELD.w / 2 && Math.abs(dot(d, s.up)) < B_SHIELD.h / 2 && Math.abs(dot(d, s.fwd)) < B_SHIELD.d / 2;
}

/** E and B at point x from all shields (written into E and B). */
export function fieldAt(shields, x, E, B) {
  E[0] = E[1] = E[2] = B[0] = B[1] = B[2] = 0;
  for (const s of shields) {
    if (!s) continue;
    if (s.type === "E") {
      const dx = x[0] - s.c[0], dy = x[1] - s.c[1], dz = x[2] - s.c[2], r = Math.hypot(dx, dy, dz);
      const f = (s.sign * E_SHIELD.k) / Math.max(r, E_SHIELD.r) ** 3;
      E[0] += f * dx; E[1] += f * dy; E[2] += f * dz;
    } else if (inSlab(s, x)) {
      const b = s.sign * B_SHIELD.b;
      B[0] += b * s.up[0]; B[1] += b * s.up[1]; B[2] += b * s.up[2];
    }
  }
}

const E = [0, 0, 0], B = [0, 0, 0];
/** Move a charge { p, v, q } for time dt (Boris method, mass 1). */
export function push(c, shields, dt) {
  fieldAt(shields, c.p, E, B);
  const h = (c.q * dt) / 2, v = c.v;
  const m = [v[0] + h * E[0], v[1] + h * E[1], v[2] + h * E[2]];          // half the electric kick
  const t = [h * B[0], h * B[1], h * B[2]], t2 = dot(t, t);
  const s = [(2 * t[0]) / (1 + t2), (2 * t[1]) / (1 + t2), (2 * t[2]) / (1 + t2)];
  const pr = [m[0] + (m[1] * t[2] - m[2] * t[1]), m[1] + (m[2] * t[0] - m[0] * t[2]), m[2] + (m[0] * t[1] - m[1] * t[0])];
  const pl = [m[0] + (pr[1] * s[2] - pr[2] * s[1]), m[1] + (pr[2] * s[0] - pr[0] * s[2]), m[2] + (pr[0] * s[1] - pr[1] * s[0])]; // the turn in B
  v[0] = pl[0] + h * E[0]; v[1] = pl[1] + h * E[1]; v[2] = pl[2] + h * E[2];                       // the other half kick
  c.p[0] += v[0] * dt; c.p[1] += v[1] * dt; c.p[2] += v[2] * dt;
}

/** Move a charge for time dt in small steps. */
export function advance(c, shields, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.004));
  for (let i = 0; i < n; i++) push(c, shields, dt / n);
}

/** Has the charge left the arena (the same box seen from either player)? */
export const gone = (p) => Math.abs(p[0]) > 5 || p[1] < 0 || p[1] > 4 || p[2] > 2.5 || p[2] < -D - 2.5;

/** Does a charge at p hit the body of a player whose head is at `head`? Head: a ball; body: an upright capsule. */
export function hitsBody(p, head) {
  const r = PROJ.r;
  if (Math.hypot(p[0] - head[0], p[1] - head[1], p[2] - head[2]) < BODY.head + r) return true;
  const top = head[1] - BODY.neck, bottom = Math.max(0.2, head[1] - BODY.hip);
  const y = Math.min(top, Math.max(bottom, p[1]));
  return Math.hypot(p[0] - head[0], p[1] - y, p[2] - head[2]) < BODY.torso + r;
}

/** Speed after holding the trigger for `held` seconds. */
export const speedFor = (held) => SPEED.min + (SPEED.max - SPEED.min) * Math.min(1, held / SPEED.full);
