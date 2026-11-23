// learn.phylab.uk — In class, step 3, part 2: the 3D match. What field is shown, and how a student's objects are judged.
// The judging is forgiving: the right kinds of object with the right signs, the point charge the right size,
// each object within a few centimetres of its place, and a plate, rod or ring turned within 20 degrees.
// Pure functions (no three.js), so the simulated class for the teacher is judged by exactly the same code.

/** The hidden source of the field shown: a point charge +2q, a point charge −q and an upright negative plate
 *  (Knight 23.2 and 23.4). The +2q sends half its lines to the −q and half to the plate, so matching it needs
 *  the rule that the number of lines is proportional to the charge.
 *  tilt / turn in degrees, as in the 3D space: an upright plate faces left and right. */
export const TARGET = [
  { kind: "point", q: 2, x: -0.12, y: 0.12, z: 0.03 },
  { kind: "point", q: -1, x: -0.04, y: 0.24, z: -0.05 },
  { kind: "plate", q: -6, x: 0.08, y: 0.15, z: 0, tilt: 90, turn: 0 },
];
export const TOL = { cm: 4, deg: 20 };

const NAME = { point: "point charge", plate: "charged plate", rod: "charged rod", ring: "charged ring" };

/** The direction that matters for how an object is turned: across a plate, along a rod, through a ring. */
export function axisOf(kind, tiltDeg = 0, turnDeg = 0) {
  if (kind === "point") return null;
  const t = (tiltDeg * Math.PI) / 180, y = (turnDeg * Math.PI) / 180;
  // own axis before turning: plate and ring y, rod x; tilt about z, then turn about y (as in the 3D space)
  let v = kind === "rod" ? [Math.cos(t), Math.sin(t), 0] : [-Math.sin(t), Math.cos(t), 0];
  return [v[0] * Math.cos(y) + v[2] * Math.sin(y), v[1], -v[0] * Math.sin(y) + v[2] * Math.cos(y)];
}

const angleBetween = (a, b) => {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));
  return (Math.acos(Math.min(1, d)) * 180) / Math.PI; // either way round counts: a plate has no front or back
};

/**
 * placed: the objects above the table, each { kind, q, x, y, z, axis } (axis as from axisOf, or null for a point).
 * Returns { ok, items: [{ kind, status, cm?, deg?, msg }] } with status ok | missing | sign | size | far | turn | extra.
 */
export function judgeMatch(placed) {
  const pool = placed.slice(), items = [];
  for (const t of TARGET) {
    const tAxis = axisOf(t.kind, t.tilt, t.turn);
    const same = pool.filter((p) => p.kind === t.kind);
    if (!same.length) {
      items.push({ kind: t.kind, status: "missing", msg: `The field comes from a ${t.kind === "point" ? (t.q > 0 ? "positive" : "negative") + " " : ""}${NAME[t.kind]} that is not on your table.` }); continue;
    }
    // the best candidate: the right sign first, then the nearest
    const dist = (p) => Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z);
    same.sort((a, b) => (Math.sign(a.q) !== Math.sign(t.q)) - (Math.sign(b.q) !== Math.sign(t.q)) || dist(a) - dist(b));
    const p = same[0];
    pool.splice(pool.indexOf(p), 1);
    const cm = Math.round(dist(p) * 100);
    const deg = tAxis && p.axis ? Math.round(angleBetween(tAxis, p.axis)) : 0;
    let it;
    if (Math.sign(p.q) !== Math.sign(t.q))
      it = { status: "sign", msg: `One of your ${NAME[t.kind]}s has the wrong sign. Look at which way the arrows point near it: away from it, or towards it?` };
    else if (t.kind === "point" && Math.abs(p.q) !== Math.abs(t.q))
      it = { status: "size", msg: `Your ${t.q > 0 ? "positive" : "negative"} point charge has the right sign but not the right size. Count how many lines ${t.q > 0 ? "leave" : "reach"} it: the number of lines is proportional to the charge.` };
    else if (cm > TOL.cm)
      it = { status: "far", msg: `Your ${NAME[t.kind]} is about ${cm} cm from where the field says it is. Look where its lines ${t.q > 0 ? "start" : "end"}.` };
    else if (deg > TOL.deg)
      it = { status: "turn", msg: `Your ${NAME[t.kind]} is in the right place but turned about ${deg}° the wrong way. Near a plate, the lines meet it square on.` };
    else it = { status: "ok", msg: t.kind === "point" ? `${t.q > 0 ? "Positive" : "Negative"} point charge: right.` : `${NAME[t.kind][0].toUpperCase() + NAME[t.kind].slice(1)}: right.` };
    items.push({ kind: t.kind, cm, deg, ...it, obj: p }); // obj: which of the placed objects this is about
  }
  for (const p of pool) items.push({ kind: p.kind, obj: p, status: "extra", msg: `There is a ${NAME[p.kind]} on your table that the field does not need.` });
  return { ok: items.every((i) => i.status === "ok"), items };
}

/** The corners of a plate seen from above (x, z), for the teacher's picture. */
export function plateCorners(x, z, tiltDeg, turnDeg, a = 0.08) {
  const t = (tiltDeg * Math.PI) / 180, y = (turnDeg * Math.PI) / 180;
  return [[a, a], [a, -a], [-a, -a], [-a, a]].map(([u, w]) => {
    const vx = u * Math.cos(t), vz = w; // own (u, 0, w), tilted about z
    return [+(x + vx * Math.cos(y) + vz * Math.sin(y)).toFixed(4), +(z - vx * Math.sin(y) + vz * Math.cos(y)).toFixed(4)];
  });
}

/** For the teacher: what each kind of result is called. */
export const KINDS = {
  sign: "An object with the wrong sign",
  size: "A point charge the wrong size",
  far: "An object in the wrong place",
  turn: "Plate turned the wrong way",
  missing: "Something missing",
  extra: "Something extra",
};
