// learn.phylab.uk — In class, step 3, part 1: explore the electric field in 3D.
// Point charges and the charge distributions of Knight, Physics for Scientists and Engineers, Chapter 23
// (charged plate = plane of charge, 23.4 and the parallel-plate capacitor, 23.5; charged rod, Example 23.3;
// charged ring, Example 23.4). No conductors: they come in the next chapter.
// One scene, three ways to look at it: in the browser (the default), AR (the camera view, e.g. on a headset with
// passthrough or an Android tablet) and VR (a headset). Everything the student does — taking an object from a
// tray, moving it, putting it back — happens inside the 3D scene, so it works the same way with a mouse, a finger,
// a controller or a hand. Sizes are in metres, so the scene is desk-sized in AR and at arm's length in VR.
// three.js is served from this site (public/vendor/three/), so it comes from the same nearby Cloudflare edge as the page.
import * as THREE from "/vendor/three/three.min.js";
const { OrbitControls, USDZExporter, mergeGeometries } = THREE;

const TABLE = 0.3;            // half-width of the table: only objects above the table make the field
const Y0 = 0.03, Y1 = 0.4;    // lowest and highest an object can be held
const REACH = 0.8;            // how far from the centre an object can be carried
const TOP = 0.13;             // height of the trays: objects slide straight across onto the table
// point charges on round trays at the right; the charge distributions on square trays at the left
const RIGHT = { x: 0.42, half: 0.034, zs: [-0.18, -0.06, 0.06, 0.18], items: [["point", 2], ["point", 1], ["point", -1], ["point", -2]] };
const LEFT = { x: -0.47, half: 0.075, zs: [-0.27, -0.09, 0.09, 0.27], items: [["plate", 6], ["plate", -6], ["rod", 3], ["ring", 3]] };
const SIZE = { plate: 0.08, rod: 0.08, ring: 0.06 }; // half-side, half-length, radius
const CENTER = new THREE.Vector3(0, 0.15, 0);
const BOUND2 = 0.85 * 0.85;   // field lines stop this far from the centre
const SEED = 0.02;            // lines start this far from a point charge
const MAX_OBJECTS = 6;
const START = [{ kind: "point", q: 1, x: -0.09, y: 0.15, z: 0 }, { kind: "point", q: -1, x: 0.09, y: 0.15, z: 0 }];

const COLOR = { pos: 0xc0392b, neg: 0x1f5fbf, paper: 0xf7f5ef, vr: 0x1c2130 };
const LINE = { screen: 0x39415a, xr: 0xffd15c };
// the match: the field to match is orange; the student's own lines (shown after Check) are ink, or light blue in a headset
const TARGET_LINE = { screen: 0xd9822b, xr: 0xff9a3c }, MINE_XR = 0x9fd3ff;
const radius = (q) => 0.012 + 0.004 * Math.abs(q);

// ---------- physics: the field and its lines (k = 1; only the shape of the field matters here) ----------
// Charges are in units of q. The number of lines on an object is proportional to its charge.
// Plate (horizontal square) and rod (along x) use the closed-form results of integrating the point-charge field
// over the plate or along the rod, the same integrals as in the chapter; the ring is summed from 40 small pieces.

/** ln(v + r) with r = √(v² + w2), accurate also when v is large and negative. */
const lnvr = (v, r, w2) => (v >= 0 ? Math.log(v + r) : Math.log(Math.max(w2, 1e-14) / (r - v)));

/** Each object has an orientation o.m: a rotation matrix (column-major, as in three.js) from the object's own
 *  axes to the room. In its own axes a plate lies in the x–z plane, a rod lies along x and a ring lies in the
 *  x–z plane, so the formulas below stay simple; points are turned into the object's axes and fields back. */
const toOwn = (o, x, y, z) => {
  const m = o.m, dx = x - o.x, dy = y - o.y, dz = z - o.z;
  return [m[0] * dx + m[1] * dy + m[2] * dz, m[3] * dx + m[4] * dy + m[5] * dz, m[6] * dx + m[7] * dy + m[8] * dz];
};
const toRoom = (o, v) => {
  const m = o.m;
  return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
};
const pointInRoom = (o, v) => { const w = toRoom(o, v); return [o.x + w[0], o.y + w[1], o.z + w[2]]; };

function prep(o) {
  o.m = o.m || [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (o.kind === "ring") {
    o.sub = [];
    for (let k = 0; k < 40; k++) { const a = (2 * Math.PI * k) / 40; o.sub.push(pointInRoom(o, [SIZE.ring * Math.cos(a), 0, SIZE.ring * Math.sin(a)])); }
  }
  return o;
}

/** Add the field of one object at (x, y, z) to E; false where the field is undefined (on a point charge). */
function addField(o, x, y, z, E) {
  if (o.kind === "point") {
    const dx = x - o.x, dy = y - o.y, dz = z - o.z, r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 1e-10) return false;
    const f = o.q / (r2 * Math.sqrt(r2));
    E[0] += f * dx; E[1] += f * dy; E[2] += f * dz;
    return true;
  }
  if (o.kind === "ring") {
    const dq = o.q / o.sub.length;
    for (const p of o.sub) {
      const dx = x - p[0], dy = y - p[1], dz = z - p[2], r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < 1e-10) return false;
      const f = dq / (r2 * Math.sqrt(r2));
      E[0] += f * dx; E[1] += f * dy; E[2] += f * dz;
    }
    return true;
  }
  const p = toOwn(o, x, y, z);
  let e;
  if (o.kind === "plate") {
    const a = SIZE.plate, eta = o.q / (4 * a * a), X = p[0], Y = p[2];
    let Z = p[1]; if (Math.abs(Z) < 1e-7) Z = Z < 0 ? -1e-7 : 1e-7;
    let ex = 0, ey = 0, ez = 0;
    for (const si of [1, -1]) for (const sj of [1, -1]) {
      const u = si * a - X, v = sj * a - Y, r = Math.sqrt(u * u + v * v + Z * Z), s = si * sj;
      ex += s * lnvr(v, r, u * u + Z * Z);
      ey += s * lnvr(u, r, v * v + Z * Z);
      ez += s * Math.atan((u * v) / (Z * r));
    }
    e = [eta * ex, eta * ez, eta * ey];
  } else { // rod
    const h = SIZE.rod, lam = o.q / (2 * h);
    const s = p[0], wy = p[1], wz = p[2], d = Math.max(Math.hypot(wy, wz), 1e-7);
    const s1 = -h - s, s2 = h - s, r1 = Math.hypot(d, s1), r2 = Math.hypot(d, s2);
    const ep = (lam / d) * (s2 / r2 - s1 / r1);
    e = [lam * (1 / r2 - 1 / r1), (ep * wy) / d, (ep * wz) / d];
  }
  const w = toRoom(o, e);
  E[0] += w[0]; E[1] += w[1]; E[2] += w[2];
  return true;
}

/** Distance from a point to an object (for the step size). */
function dist(o, x, y, z) {
  if (o.kind === "point") return Math.hypot(x - o.x, y - o.y, z - o.z);
  const p = toOwn(o, x, y, z);
  if (o.kind === "plate") return Math.hypot(Math.max(Math.abs(p[0]) - SIZE.plate, 0), p[1], Math.max(Math.abs(p[2]) - SIZE.plate, 0));
  if (o.kind === "rod") return Math.hypot(Math.max(Math.abs(p[0]) - SIZE.rod, 0), p[1], p[2]);
  return Math.hypot(Math.hypot(p[0], p[2]) - SIZE.ring, p[1]);
}
/** Is the point close enough to the object for a line to end on it? */
function near(o, x, y, z) {
  if (o.kind === "point") return dist(o, x, y, z) < 0.016;
  if (o.kind === "plate") { const p = toOwn(o, x, y, z); return Math.abs(p[1]) < 0.005 && Math.abs(p[0]) < SIZE.plate && Math.abs(p[2]) < SIZE.plate; }
  return dist(o, x, y, z) < 0.007;
}

function unit(objs, x, y, z, dir) {
  const E = [0, 0, 0];
  for (const o of objs) if (!addField(o, x, y, z, E)) return null;
  const m = Math.hypot(E[0], E[1], E[2]);
  if (m < 1e-6) return null;
  return [(dir * E[0]) / m, (dir * E[1]) / m, (dir * E[2]) / m];
}

/** Follow the field (dir = +1) or against it (dir = −1) with fourth-order Runge–Kutta steps. */
function trace(objs, [x, y, z], dir) {
  const pts = [x, y, z];
  let end = -1;
  for (let i = 0; i < 1600; i++) {
    let dmin = Infinity;
    for (const o of objs) dmin = Math.min(dmin, dist(o, x, y, z));
    const h = Math.min(0.012, Math.max(0.0015, 0.2 * dmin)); // small steps near an object
    const k1 = unit(objs, x, y, z, dir); if (!k1) break;
    const k2 = unit(objs, x + h / 2 * k1[0], y + h / 2 * k1[1], z + h / 2 * k1[2], dir); if (!k2) break;
    const k3 = unit(objs, x + h / 2 * k2[0], y + h / 2 * k2[1], z + h / 2 * k2[2], dir); if (!k3) break;
    const k4 = unit(objs, x + h * k3[0], y + h * k3[1], z + h * k3[2], dir); if (!k4) break;
    x += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    pts.push(x, y, z);
    if ((x - CENTER.x) ** 2 + (y - CENTER.y) ** 2 + (z - CENTER.z) ** 2 > BOUND2) break;
    const hit = objs.findIndex((o) => o.q * dir < 0 && near(o, x, y, z));
    if (hit >= 0) { end = hit; break; }
  }
  return { pts, end };
}

/** Evenly spread directions on a sphere (golden-angle spiral). */
function spread(n, turn) {
  const out = [], ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), t = ga * i + turn;
    out.push([Math.cos(t) * r, y, Math.sin(t) * r]);
  }
  return out;
}

/** Lines leaving (or reaching) a plate, placed where the field through its surface is strong: the number of lines
 *  through each small patch is proportional to the field there, on either face. Between the plates of a capacitor
 *  the field is strong, outside it is weak, so almost all the lines run between the plates. */
function plateSeeds(o, n, objs) {
  const G = 14, a = SIZE.plate, cell = (2 * a) / G, e = 0.004, cand = [];
  let W = 0;
  for (const side of [1, -1]) {
    const nrm = toRoom(o, [0, side, 0]);
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const own = [-a + (i + 0.5) * cell, side * e, -a + (j + 0.5) * cell], p = pointInRoom(o, own), E = [0, 0, 0];
      for (const b of objs) addField(b, p[0], p[1], p[2], E);
      const w = Math.max(0, Math.sign(o.q) * (E[0] * nrm[0] + E[1] * nrm[1] + E[2] * nrm[2]));
      cand.push({ own, w }); W += w;
    }
  }
  if (W <= 0) cand.forEach((c) => { c.w = 1; W += 1; });
  const out = [];
  let k = 0, acc = 0;
  for (const c of cand) {
    while (k < n && (k + 0.5) / n * W < acc + c.w) {
      const f = ((k + 0.5) / n * W - acc) / c.w; // where in this patch: spread lines that share a patch
      out.push(pointInRoom(o, [c.own[0] + (f - 0.5) * cell * 0.9, c.own[1], c.own[2]]));
      k++;
    }
    acc += c.w;
  }
  return out;
}

/** Where the lines of an object start: spread evenly over it, about n of them. */
function seeds(o, n, turn, objs) {
  const own = [];
  if (o.kind === "point") return spread(n, turn).map((u) => [o.x + u[0] * SEED, o.y + u[1] * SEED, o.z + u[2] * SEED]);
  if (o.kind === "plate") return plateSeeds(o, n, objs);
  if (o.kind === "rod") {
    const rows = Math.max(1, Math.round(n / 6));
    for (let k = 0; k < rows; k++) for (let j = 0; j < 6; j++) {
      const f = (2 * Math.PI * j) / 6 + (k % 2) * (Math.PI / 6);
      own.push([SIZE.rod * ((2 * k + 1) / rows - 1), 0.008 * Math.cos(f), 0.008 * Math.sin(f)]);
    }
  } else {
    const m = Math.max(1, Math.round(n / 4));
    for (let k = 0; k < m; k++) for (let j = 0; j < 4; j++) {
      const a = (2 * Math.PI * k) / m + turn, f = Math.PI / 4 + (j * Math.PI) / 2, R = SIZE.ring + 0.008 * Math.cos(f);
      own.push([R * Math.cos(a), 0.008 * Math.sin(f), R * Math.sin(a)]);
    }
  }
  return own.map((v) => pointInRoom(o, v));
}

/** All field lines. Lines start on positive objects; a negative object that receives fewer lines than its
 *  charge calls for gets the rest traced backwards from it, from the places where no line arrives yet. */
function fieldLines(objs, perQ) {
  // the same objects always give the same lines, whatever order they were put on the table in
  // (so a correct match lies exactly on the target field)
  objs = objs.slice().sort((a, b) => a.kind.localeCompare(b.kind) || a.q - b.q || a.x - b.x || a.y - b.y || a.z - b.z);
  const lines = [], arrive = objs.map(() => []);
  objs.forEach((o, i) => {
    if (o.q <= 0) return;
    for (const p of seeds(o, Math.round(perQ * o.q), 0, objs)) {
      const t = trace(objs, p, 1);
      lines.push({ pts: t.pts, start: true, end: t.end >= 0 });
      if (t.end >= 0) { const n = t.pts.length; arrive[t.end].push([t.pts[n - 3], t.pts[n - 2], t.pts[n - 1]]); }
    }
  });
  objs.forEach((o, i) => {
    if (o.q >= 0) return;
    const ss = seeds(o, Math.round(perQ * -o.q), 0, objs);
    for (const a of arrive[i]) {
      if (!ss.length) break;
      let best = 0, bd = Infinity;
      ss.forEach((s, k) => { const d = (s[0] - a[0]) ** 2 + (s[1] - a[1]) ** 2 + (s[2] - a[2]) ** 2; if (d < bd) { bd = d; best = k; } });
      ss.splice(best, 1);
    }
    for (const p0 of ss) {
      const t = trace(objs, p0, -1);
      if (t.end >= 0) continue; // already drawn from that positive object
      const p = [];
      for (let k = t.pts.length - 3; k >= 0; k -= 3) p.push(t.pts[k], t.pts[k + 1], t.pts[k + 2]);
      lines.push({ pts: p, start: false, end: true });
    }
  });
  return lines;
}

// ---------- labels ----------

/** A small label with a white background; parts with it: true are set in italic (the q). */
function label(parts, h = 0.016) {
  const cv = document.createElement("canvas"), g = cv.getContext("2d");
  const fs = 64, pad = 18;
  const font = (it) => `${it ? "italic " : ""}600 ${fs}px Georgia, "Times New Roman", serif`;
  let w = 0;
  for (const p of parts) { g.font = font(p.it); w += g.measureText(p.t).width; }
  cv.width = Math.ceil(w + pad * 2); cv.height = fs + pad;
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, 22); g.fill();
  g.fillStyle = "#1a2030"; g.textBaseline = "middle";
  let x = pad;
  for (const p of parts) { g.font = font(p.it); g.fillText(p.t, x, cv.height / 2 + 3); x += g.measureText(p.t).width; }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set((h * cv.width) / cv.height, h, 1);
  return s;
}
const sign = (q) => (q > 0 ? "+" : "\u2212");
const qParts = (q) => [{ t: sign(q) + (Math.abs(q) === 1 ? "" : Math.abs(q)) }, { t: "q", it: true }];
/** Labels use the symbols of the textbook: η for surface charge density, λ for linear charge density. */
const partsOf = (kind, q) => kind === "point" ? qParts(q)
  : [{ t: sign(q) }, { t: kind === "plate" ? "\u03b7" : kind === "rod" ? "\u03bb" : "Q", it: true }];

// ---------- the explorer ----------

/**
 * mode "explore": free exploration, the field lines of whatever is on the table are always shown.
 * mode "match": the field of `target` (hidden objects) is shown in orange; the student places objects without
 * seeing their own lines, then Check shows their lines over the target and calls judge(placed) and onCheck(result).
 * vrFirst: where the device can open VR, start on the VR tab with its Start VR button (a headset page opens ready for VR).
 * Returns { check, clear }.
 */
export function startSpace3D(root, { rec, mode: task = "explore", target = [], judge = null, onCheck = () => {}, vrFirst = false } = {}) {
  const match = task === "match";
  root.classList.add("v3");
  root.innerHTML = `
    <div class="v3-tabs" role="tablist" aria-label="How to view the 3D space">
      <button type="button" role="tab" data-mode="browser" class="on" aria-selected="true">Browser</button>
      <button type="button" role="tab" data-mode="ar">AR</button>
      <button type="button" role="tab" data-mode="vr">VR</button>
    </div>
    <div class="v3-note" hidden></div>
    <div class="v3-stage">
      <div class="v3-xr" hidden><button type="button" class="btn v3-exit">Exit AR</button></div>
      <p class="v3-flash" hidden></p>
    </div>
    <div class="v3-bar">
      <p class="v3-hint">${match ? "The orange lines are the field you have to make. " : ""}Slide an object from a tray onto the table: point charges on the right; a charged plate, rod and ring on the left. A new one appears on the tray. Only objects above the table make the field. Let go of an object anywhere else and it falls and is gone, unless you put it back on a tray. Drag an object to move it sideways; drag the grey handle above it to move it up or down; drag the green arrow to turn a plate, rod or ring (sideways to turn it round, up and down to tilt it). Drag empty space to turn the view; scroll or pinch to zoom.</p>
      <div class="v3-tools">
        <label>Lines per <i>q</i> <select class="v3-density"><option value="8">8</option><option value="12" selected>12</option><option value="20">20</option></select></label>
        <button type="button" class="btn ghost v3-view">Reset view</button>
        ${match ? `<button type="button" class="btn v3-check">Check my match</button>` : ""}
      </div>
    </div>`;
  const stage = root.querySelector(".v3-stage"), note = root.querySelector(".v3-note");
  const xrBar = root.querySelector(".v3-xr"), flashEl = root.querySelector(".v3-flash");
  const log = (action, d = {}) => rec && rec.event(match ? "match3d" : "space3d", { action, ...d });

  // renderer, camera, scene
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local");
  stage.prepend(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(42, 1.6, 0.01, 20);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.paper);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8576, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(0.4, 1, 0.6); scene.add(sun);
  const world = new THREE.Group(); scene.add(world);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.minDistance = 0.3; controls.maxDistance = 2.2;
  controls.maxPolarAngle = Math.PI * 0.47; // never below the floor
  const resetView = () => { camera.position.set(0.2, 0.5, 1.0); controls.target.set(-0.02, 0.11, 0.0); controls.update(); };
  resetView();

  // floor of the space: a light square with a grid, so heights and shadows can be read
  const floorMat = new THREE.MeshBasicMaterial({ color: 0xece7da, transparent: true, opacity: 1, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), floorMat);
  floor.rotation.x = -Math.PI / 2; world.add(floor);
  const grid = new THREE.GridHelper(0.6, 12, 0xbdb6a4, 0xd6d0c0); grid.position.y = 0.0005; world.add(grid);

  // what each kind of object looks like
  const pickables = [];
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  /** Visible body of an object, how far it reaches below its centre, a larger invisible shape that is easy
   *  to grab, its footprint for the shadow, and where its label goes. */
  function shape(kind, q, mat) {
    if (kind === "point") {
      const r = radius(q);
      return { body: new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), mat), proxy: new THREE.SphereGeometry(r + 0.01, 8, 6) };
    }
    if (kind === "plate") {
      const a = SIZE.plate;
      return { body: new THREE.Mesh(new THREE.BoxGeometry(2 * a, 0.004, 2 * a), mat), proxy: new THREE.BoxGeometry(2 * a + 0.01, 0.02, 2 * a + 0.01) };
    }
    if (kind === "rod") {
      const h = SIZE.rod, g = new THREE.CylinderGeometry(0.004, 0.004, 2 * h, 14); g.rotateZ(Math.PI / 2);
      return { body: new THREE.Mesh(g, mat), proxy: new THREE.BoxGeometry(2 * h + 0.01, 0.022, 0.022) };
    }
    const R = SIZE.ring, g = new THREE.TorusGeometry(R, 0.004, 10, 72); g.rotateX(Math.PI / 2);
    const pg = new THREE.TorusGeometry(R, 0.014, 6, 36); pg.rotateX(Math.PI / 2);
    return { body: new THREE.Mesh(g, mat), proxy: pg };
  }
  const bodyMat = (q, opacity = 1) => new THREE.MeshStandardMaterial({ color: q > 0 ? COLOR.pos : COLOR.neg, roughness: 0.45, transparent: true, opacity });

  // how an object is turned: first tilted about the front–back axis, then turned about the vertical axis.
  // Plates start upright, facing left and right, so their field lines run across the view.
  const DEG = Math.PI / 180, SNAP = 15 * DEG;
  const START_TILT = { point: 0, plate: 90 * DEG, rod: 0, ring: 0 };
  const AXIS_Y = new THREE.Vector3(0, 1, 0), AXIS_Z = new THREE.Vector3(0, 0, 1);
  const orient = (yaw, tilt) => new THREE.Quaternion().setFromAxisAngle(AXIS_Y, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_Z, tilt));
  /** How far the turned object reaches sideways (ex) and up and down (ey) from its centre. */
  function reach(geom, quat) {
    if (!geom.boundingBox) geom.computeBoundingBox();
    const h = geom.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const e = new THREE.Matrix4().makeRotationFromQuaternion(quat).elements;
    return { ex: Math.abs(e[0]) * h.x + Math.abs(e[4]) * h.y + Math.abs(e[8]) * h.z,
             ey: Math.abs(e[1]) * h.x + Math.abs(e[5]) * h.y + Math.abs(e[9]) * h.z };
  }

  // the trays, at the height the objects are used: taking an object off a tray hatches a new one in its place
  const trayMat = new THREE.MeshStandardMaterial({ color: 0xe2dccb, roughness: 0.8 });
  const postMat = new THREE.MeshStandardMaterial({ color: 0xb3ad9d, roughness: 0.6 });
  const trays = [];
  for (const col of [RIGHT, LEFT]) col.items.forEach(([kind, q], k) => {
    const x = col.x, z = col.zs[k], round = kind === "point";
    const top = round ? new THREE.CylinderGeometry(col.half, col.half * 0.85, 0.006, 32) : new THREE.BoxGeometry(2 * col.half, 0.006, 2 * col.half);
    const dish = new THREE.Mesh(top, trayMat); dish.position.set(x, TOP - 0.003, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, TOP - 0.006, 8), postMat); post.position.set(x, (TOP - 0.006) / 2, z);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.003, 20), postMat); foot.position.set(x, 0.0015, z);
    const sh = shape(kind, q, bodyMat(q, kind === "plate" ? 0.85 : 1));
    const quat = orient(0, START_TILT[kind]), { ey } = reach(sh.body.geometry, quat);
    const m = sh.body; m.position.set(x, TOP + ey, z); m.quaternion.copy(quat);
    const lb = label(partsOf(kind, q), 0.018);
    // labels sit on the outer side of each column, away from the table
    if (col === RIGHT) lb.position.set(x + col.half + 0.022, TOP + ey + 0.004, z);
    else lb.position.set(x, TOP + 2 * ey + 0.018, z); // above the object, so an upright plate cannot hide it
    const t = { kind, q, x, z, half: col.half, mesh: m, grow: 1 };
    const pr = new THREE.Mesh(sh.proxy, proxyMat); pr.position.copy(m.position); pr.quaternion.copy(quat); pr.userData = { kind: "token", t };
    world.add(dish, post, foot, m, lb, pr); pickables.push(pr); trays.push(t);
  });
  const clearBtn = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.04), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
  clearBtn.position.set(RIGHT.x - 0.05, 0.006, 0.28); clearBtn.userData = { kind: "clear" }; world.add(clearBtn); pickables.push(clearBtn);
  const clearLb = label([{ t: "Clear" }], 0.014); clearLb.position.set(RIGHT.x - 0.05, 0.024, 0.28); world.add(clearLb);

  // field lines and their arrows: one set for the objects on the table and, in the match, one for the target field
  function lineSet(color) {
    const mat = new THREE.LineBasicMaterial({ color }), obj = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
    const amat = new THREE.MeshBasicMaterial({ color }), arrows = new THREE.InstancedMesh(new THREE.ConeGeometry(0.0045, 0.014, 10), amat, 800);
    arrows.count = 0; world.add(obj, arrows);
    return { obj, arrows, color: (hex) => { mat.color.setHex(hex); amat.color.setHex(hex); }, show: (on) => { obj.visible = arrows.visible = on; } };
  }
  const mine = lineSet(LINE.screen);
  const goal = match ? lineSet(TARGET_LINE.screen) : null;

  // in the match: a Check button on the floor next to Clear (so it also works in a headset), and the result above the table
  let resultLb = null;
  if (match) {
    const chk = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.012, 0.04), new THREE.MeshStandardMaterial({ color: 0x0d6b5f, roughness: 0.6 }));
    chk.position.set(RIGHT.x + 0.04, 0.006, 0.28); chk.userData = { kind: "check" }; world.add(chk); pickables.push(chk);
    const chkLb = label([{ t: "Check" }], 0.014); chkLb.position.set(RIGHT.x + 0.04, 0.024, 0.28); world.add(chkLb);
  }
  function showResult(text) {
    if (resultLb) { world.remove(resultLb); resultLb.material.map.dispose(); resultLb = null; }
    if (!text) return;
    resultLb = label([{ t: text }], 0.024); resultLb.position.set(0, 0.46, 0); world.add(resultLb);
  }

  // objects in the space
  const charges = [];
  let perQ = 12, dirty = true;
  const dropMat = new THREE.LineDashedMaterial({ color: 0x8a8f9c, dashSize: 0.008, gapSize: 0.006 });
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x9aa0ad, roughness: 0.5 });
  const turnMat = new THREE.MeshStandardMaterial({ color: 0x0d6b5f, roughness: 0.5 });
  /** The turn handle: a green curved arrow. */
  function turnHandle() {
    const k = new THREE.Group();
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 8, 28, 1.5 * Math.PI), turnMat);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0045, 0.008, 12), turnMat);
    tip.position.set(0.009, -0.002, 0); tip.rotation.z = Math.PI; k.add(arc, tip);
    return k;
  }

  function addObject(kind, q, x, y, z) {
    const g = new THREE.Group(), spin = new THREE.Group();
    const solid = kind === "plate" ? 0.85 : 1, mat = bodyMat(q, solid), sh = shape(kind, q, mat);
    spin.add(sh.body); g.add(spin);
    const lb = label(partsOf(kind, q), 0.022); g.add(lb);
    const handle = new THREE.Mesh(new THREE.OctahedronGeometry(0.008), handleMat); handle.scale.set(0.8, 1.5, 0.8); g.add(handle);
    world.add(g);
    const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), dropMat);
    const shadow = new THREE.Mesh(sh.body.geometry, shadowMat); shadow.matrixAutoUpdate = false;
    world.add(drop, shadow);
    const c = { kind, q, x, y, z, yaw: 0, tilt: START_TILT[kind], quat: orient(0, START_TILT[kind]), ey: 0,
      g, spin, geom: sh.body.geometry, lb, handle, mat, drop, shadow, proxies: [], out: false, solid };
    const pb = new THREE.Mesh(sh.proxy, proxyMat); pb.userData = { kind: "charge", c }; spin.add(pb);
    const ph = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), proxyMat); ph.userData = { kind: "handle", c }; g.add(ph);
    c.proxies = [pb, ph]; c.hProxy = ph;
    if (kind !== "point") {  // only the charge distributions can be turned: a point charge looks the same every way round
      c.knob = turnHandle(); g.add(c.knob);
      const pk = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), proxyMat); pk.userData = { kind: "turn", c }; g.add(pk);
      c.kProxy = pk; c.proxies.push(pk);
    }
    pickables.push(...c.proxies);
    charges.push(c); turned(c); setOut(c);
    return c;
  }
  /** After the object is turned: move its label and handles to clear it, and redraw. */
  function turned(c) {
    c.spin.quaternion.copy(c.quat);
    const { ex, ey } = reach(c.geom, c.quat);
    c.ey = ey;
    c.lb.position.set(ex + 0.026, 0, 0);
    c.handle.position.set(0, ey + 0.022, 0); c.hProxy.position.copy(c.handle.position);
    if (c.knob) { c.knob.position.set(0.03, ey + 0.022, 0); c.kProxy.position.copy(c.knob.position); }
    place(c);
  }
  const shadowM = new THREE.Matrix4(), flat = new THREE.Matrix4().makeScale(1, 0.0001, 1), turnM = new THREE.Matrix4();
  function place(c) {
    c.g.position.set(c.x, c.y, c.z);
    const a = c.drop.geometry.attributes.position;
    a.setXYZ(0, c.x, c.y - c.ey, c.z); a.setXYZ(1, c.x, 0.001, c.z); a.needsUpdate = true;
    c.drop.computeLineDistances();
    // the shadow is the object squashed flat onto the floor, so it shows how the object is turned
    shadowM.makeTranslation(c.x, 0.0012, c.z).multiply(flat).multiply(turnM.makeRotationFromQuaternion(c.quat));
    c.shadow.matrix.copy(shadowM); c.shadow.matrixWorldNeedsUpdate = true;
    if (!c.out) dirty = true;
    if (!c.falling) changed();
  }
  /** Only a charge above the table makes the field; anywhere else it is shown faded and left out. */
  function setOut(c) {
    const out = !(Math.abs(c.x) < TABLE && Math.abs(c.z) < TABLE);
    if (out !== c.out) dirty = true;
    c.out = out; c.mat.opacity = out ? 0.45 : c.solid; c.drop.visible = c.shadow.visible = !out;
  }
  function removeCharge(c) {
    world.remove(c.g, c.drop, c.shadow);
    c.proxies.forEach((p) => pickables.splice(pickables.indexOf(p), 1));
    charges.splice(charges.indexOf(c), 1);
    dirty = true; changed();
  }
  function clearAll() { [...charges].forEach(removeCharge); log("clear"); }

  // in the match, the student's own lines are shown only after Check; any change hides them again until the next Check
  let shown = !match;
  function changed() { if (match && shown) { shown = false; mine.show(false); showResult(""); } }
  const toSpec = (c) => ({ kind: c.kind, q: c.q, x: c.x, y: c.y, z: c.z, m: new THREE.Matrix3().setFromMatrix4(turnM.makeRotationFromQuaternion(c.quat)).elements.slice() });
  /** The objects above the table, for judging: position, charge and the direction that says how each is turned. */
  const placedNow = () => charges.filter((c) => !c.out && !c.falling).map((c) => ({
    kind: c.kind, q: c.q, x: +c.x.toFixed(3), y: +c.y.toFixed(3), z: +c.z.toFixed(3),
    axis: c.kind === "point" ? null : new THREE.Vector3(c.kind === "rod" ? 1 : 0, c.kind === "rod" ? 0 : 1, 0).applyQuaternion(c.quat).toArray().map((v) => +v.toFixed(4)),
    // a plate's corners seen from above, for the teacher's picture
    corners: c.kind !== "plate" ? undefined : [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([u, w]) =>
      new THREE.Vector3(u * SIZE.plate, 0, w * SIZE.plate).applyQuaternion(c.quat).add(new THREE.Vector3(c.x, c.y, c.z))).map((v) => [+v.x.toFixed(4), +v.z.toFixed(4)]) }));
  function check() {
    const placed = placedNow(), result = judge ? judge(placed) : null;
    // matched within the tolerance: move the objects onto the exact places, so the two fields lie on each other
    // (field lines are sensitive: 2 cm out is right, but the lines would visibly part)
    if (result && result.ok) {
      const used = new Set();
      for (const t of target) {
        let best = null, bd = Infinity;
        for (const c of charges) if (!c.out && !c.falling && !used.has(c) && c.kind === t.kind && Math.sign(c.q) === Math.sign(t.q)) {
          const d = Math.hypot(c.x - t.x, c.y - t.y, c.z - t.z); if (d < bd) { bd = d; best = c; }
        }
        if (!best) continue;
        used.add(best);
        best.x = t.x; best.y = t.y; best.z = t.z;
        if (best.kind !== "point") { best.yaw = (t.turn || 0) * DEG; best.tilt = (t.tilt || 0) * DEG; best.quat = orient(best.yaw, best.tilt); }
        turned(best);
      }
    }
    shown = true; mine.show(true); dirty = true;
    if (result) showResult(result.ok ? "Matched!" : `Not yet: ${result.items.filter((i) => i.status !== "ok").length} to fix`);
    log("check", { ok: result && result.ok, placed });
    onCheck(result, placed);
    return result;
  }
  let goalDirty = match;
  if (!match) START.forEach((s) => addObject(s.kind, s.q, s.x, s.y, s.z));
  // for checking the field lines: /during/?debug3d exposes a way to place objects from the console
  if (new URLSearchParams(location.search).has("debug3d"))
    window[match ? "match3d" : "space3d"] = { add: (kind, q, x, y, z, tilt, yaw) => { const c = addObject(kind, q, x, y, z); if (tilt !== undefined) { c.tilt = tilt * DEG; c.yaw = (yaw || 0) * DEG; c.quat = orient(c.yaw, c.tilt); turned(c); } return c; }, clear: () => [...charges].forEach(removeCharge), check, camera, controls,
      usdz: async () => { const g = new THREE.Group(); for (const c of charges) { const m = new THREE.Mesh(c.geom, new THREE.MeshStandardMaterial()); m.position.set(c.x, c.y, c.z); g.add(m); } if (mine.lines) g.add(tubes(mine.lines, LINE.screen)); return (await new USDZExporter().parseAsync(g, { quickLookCompatible: true })).byteLength; } };

  const up = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
  const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

  /** Where the arrow of a line goes, as a matrix for a cone (or null for a very short line):
   *  in the middle of a line between two charges, otherwise near its charge. */
  function arrowAt(L, out = new THREE.Matrix4()) {
    const p = L.pts, len = [0];
    for (let k = 3; k < p.length; k += 3) len.push(len[len.length - 1] + Math.hypot(p[k] - p[k - 3], p[k + 1] - p[k - 2], p[k + 2] - p[k - 1]));
    const total = len[len.length - 1];
    if (total < 0.025) return null;
    const s = L.start && L.end ? total / 2 : L.start ? Math.min(total / 2, 0.08) : total - Math.min(total / 2, 0.08);
    let k = 1; while (k < len.length - 1 && len[k] < s) k++;
    const i = 3 * k;
    tmpT.set(p[i] - p[i - 3], p[i + 1] - p[i - 2], p[i + 2] - p[i - 1]).normalize();
    tmpP.set(p[i], p[i + 1], p[i + 2]);
    return out.compose(tmpP, tmpQ.setFromUnitVectors(up, tmpT), one);
  }
  /** Put a set of field lines into a line set, with one arrow per line. */
  function draw(set, lines) {
    set.lines = lines;
    const seg = [];
    let n = 0;
    for (const L of lines) {
      const p = L.pts;
      for (let k = 3; k < p.length; k += 3) seg.push(p[k - 3], p[k - 2], p[k - 1], p[k], p[k + 1], p[k + 2]);
      if (n < set.arrows.instanceMatrix.count && arrowAt(L, tmpM)) set.arrows.setMatrixAt(n++, tmpM);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    set.obj.geometry.dispose(); set.obj.geometry = geo;
    set.arrows.count = n; set.arrows.instanceMatrix.needsUpdate = true;
  }
  function rebuild() {
    dirty = false;
    if (goalDirty) {
      goalDirty = false;
      draw(goal, fieldLines(target.map((t) => prep({ kind: t.kind, q: t.q, x: t.x, y: t.y, z: t.z,
        m: new THREE.Matrix3().setFromMatrix4(turnM.makeRotationFromQuaternion(orient((t.turn || 0) * DEG, (t.tilt || 0) * DEG))).elements.slice() })), perQ));
    }
    if (!shown) { mine.show(false); return; } // the match before Check: the student's own field stays hidden
    const ch = charges.filter((c) => !c.out && !c.falling).map((c) => prep(toSpec(c)));
    // while something is being dragged, half the lines keep the view smooth (a headset is slower than a computer);
    // the full set is drawn as soon as it is let go
    const moving = sDrag || ctrls.some((c) => c.userData.drag);
    draw(mine, ch.length ? fieldLines(ch, moving ? Math.max(4, perQ / 2) : perQ) : []);
  }

  // ---------- dragging: one set of rules for mouse, finger, controller and hand ----------
  const ray = new THREE.Raycaster();
  const clampTo = (v, a, b) => Math.min(b, Math.max(a, v));
  function flash(msg) {
    flashEl.textContent = msg; flashEl.hidden = false;
    clearTimeout(flash.t); flash.t = setTimeout(() => { flashEl.hidden = true; }, 2200);
  }

  /** Start a drag from whatever the ray hits; returns the drag, or null if it hit nothing to drag. */
  function grab(hit, mode) {
    const u = hit.object.userData;
    if (u.kind === "clear") { clearAll(); return null; }
    if (u.kind === "check") { check(); return null; }
    if (u.kind === "token") {
      if (charges.filter((c) => !c.falling).length >= MAX_OBJECTS) { flash(`At most ${MAX_OBJECTS} objects at a time.`); return null; }
      const t = u.t;
      const c = addObject(t.kind, t.q, t.x, t.mesh.position.y, t.z);
      t.mesh.scale.setScalar(0.01); t.grow = 0;          // a new one hatches on the tray
      return { c, mode, h: c.y, dist: hit.distance, isNew: true };
    }
    const c = u.c;
    if (c.falling) return null;
    if (mode === "screen" && u.kind === "turn") return { c, mode: "turn", yaw0: c.yaw, tilt0: c.tilt };
    if (mode === "xr" && c.kind !== "point") return { c, mode, h: c.y, dist: hit.distance, rot: true }; // in a headset it turns with the hand
    if (mode === "screen" && u.kind === "handle") {
      const n = new THREE.Vector3().subVectors(camera.position, c.g.position).setY(0).normalize();
      return { c, mode: "lift", plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, c.g.position.clone()) };
    }
    return { c, mode, h: c.y, dist: hit.distance };
  }

  /** Move the dragged charge along a ray given in the scene's own coordinates. */
  function follow(d, o, dir) {
    const c = d.c;
    if (c.falling) return;
    if (d.mode === "lift") {
      const p = new THREE.Ray(o, dir).intersectPlane(d.plane, new THREE.Vector3());
      if (!p) return;
      c.y = clampTo(p.y, Math.max(Y0, c.ey + 0.005), Y1);
    } else if (d.mode === "screen") {                  // slide at the charge's own height
      const t = (d.h - o.y) / dir.y; if (!(t > 0)) return;
      const p = o.clone().addScaledVector(dir, t);
      c.x = clampTo(p.x, -REACH, REACH); c.z = clampTo(p.z, -REACH, REACH);
    } else {                                           // controller or hand: same distance along the ray, so free 3D
      const p = o.clone().addScaledVector(dir, d.dist);
      c.x = clampTo(p.x, -REACH, REACH); c.y = clampTo(p.y, Math.max(Y0, c.ey + 0.005), Y1); c.z = clampTo(p.z, -REACH, REACH);
    }
    place(c); setOut(c);
  }
  /** Turn handle on the screen: sideways turns the object about the vertical, up and down tilts it; both in 15° steps. */
  function turnBy(d, e) {
    const c = d.c, snap = (a) => Math.round(a / SNAP) * SNAP;
    c.yaw = snap(d.yaw0 + (e.clientX - d.px) * 0.012);
    c.tilt = snap(d.tilt0 - (e.clientY - d.py) * 0.012);
    c.quat = orient(c.yaw, c.tilt);
    turned(c);
    if (c.y - c.ey < 0.005) { c.y = c.ey + 0.005; place(c); } // never through the table
  }
  /** Let go: above the table the charge stays; back on a tray it is put away; anywhere else it falls and is gone. */
  function drop(d) {
    const c = d.c;
    const at = [c.x, c.y, c.z].map((v) => +v.toFixed(3));
    dirty = true;
    if (d.mode === "turn") { log("turn", { kind: c.kind, turn: Math.round(c.yaw / DEG), tilt: Math.round(c.tilt / DEG) }); return; }
    if (!c.out) { log(d.isNew ? "add" : "move", { kind: c.kind, q: c.q, at }); return; }
    const onTray = trays.some((t) => Math.abs(c.x - t.x) < t.half + 0.012 && Math.abs(c.z - t.z) < t.half + 0.012 && Math.abs(c.y - c.ey - TOP) < 0.06);
    if (onTray) removeCharge(c);
    else { c.falling = true; c.vy = 0; }
    if (!d.isNew) log(onTray ? "put back" : "drop off table", { kind: c.kind, q: c.q });
  }
  const toLocal = (o, dir) => [world.worldToLocal(o.clone()), dir.clone()]; // the scene is only moved, never turned

  // mouse and touch on the page
  const ndc = new THREE.Vector2();
  let sDrag = null;
  function screenRay(e) {
    const b = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (renderer.xr.isPresenting) return;
    screenRay(e);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (!hit) return;                         // empty space: the view turns
    e.stopImmediatePropagation();             // keep the view still while dragging a charge
    const d = grab(hit, "screen");
    if (!d) return;
    sDrag = d; renderer.domElement.setPointerCapture(e.pointerId);
    if (d.mode === "turn") { d.px = e.clientX; d.py = e.clientY; } else follow(d, ...toLocal(ray.ray.origin, ray.ray.direction));
  }, { capture: true });
  renderer.domElement.addEventListener("pointermove", (e) => {
    screenRay(e);
    if (sDrag) { if (sDrag.mode === "turn") turnBy(sDrag, e); else follow(sDrag, ...toLocal(ray.ray.origin, ray.ray.direction)); return; }
    renderer.domElement.style.cursor = ray.intersectObjects(pickables, false)[0] ? "grab" : "";
  });
  const endScreen = () => { if (sDrag) { drop(sDrag); sDrag = null; } };
  renderer.domElement.addEventListener("pointerup", endScreen);
  renderer.domElement.addEventListener("pointercancel", endScreen);

  // controllers, hands and screen taps inside AR / VR
  const ctrls = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    beam.scale.z = 0.6; beam.visible = false; c.add(beam);
    c.addEventListener("connected", (e) => { beam.visible = e.data.targetRayMode === "tracked-pointer"; });
    c.addEventListener("disconnected", () => { beam.visible = false; if (c.userData.drag) { drop(c.userData.drag); c.userData.drag = null; } });
    c.addEventListener("selectstart", () => {
      ctrlRay(c);
      const hit = ray.intersectObjects(pickables, false)[0];
      if (hit) c.userData.drag = grab(hit, "xr");
      const d = c.userData.drag;
      if (d && d.rot) { d.qc0 = c.getWorldQuaternion(new THREE.Quaternion()).invert(); d.q0 = d.c.quat.clone(); }
    });
    c.addEventListener("selectend", () => { if (c.userData.drag) { drop(c.userData.drag); c.userData.drag = null; } });
    scene.add(c);
    return c;
  });
  function ctrlRay(c) {
    tmpM.identity().extractRotation(c.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(c.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  }

  // ---------- Browser / AR / VR ----------
  const support = { ar: false, vr: false };
  const checked = (navigator.xr ? Promise.all(["ar", "vr"].map((m) =>
    navigator.xr.isSessionSupported("immersive-" + m).then((ok) => { support[m] = ok; }).catch(() => {}))) : Promise.resolve());
  const tabs = [...root.querySelectorAll(".v3-tabs button")];
  let mode = "browser";
  checked.then(() => tabs.forEach((b) => { const m = b.dataset.mode; if (m !== "browser" && !support[m] && !(m === "ar" && quickLook)) b.classList.add("na"); }));

  const NOTE = {
    ar: {
      yes: "<b>AR</b> puts this space on the desk in front of you, in the camera view. Point at a charge and pinch, press the trigger or touch the screen to take it and move it.",
      no: "<b>AR</b> needs a headset browser with passthrough (for example Meta Quest) or Chrome on an Android phone or tablet. This browser cannot open it, so the view below stays in the browser. Safari on iPad and iPhone does not support AR on web pages yet.",
    },
    vr: {
      yes: "<b>VR</b> puts this space in front of you in the headset. Point at an object and pinch or press the trigger to take it; it moves and turns with your hand.",
      no: "<b>VR</b> needs the browser of a VR headset (for example Meta Quest or Apple Vision Pro). This browser cannot open it, so the view below stays in the browser.",
    },
  };
  const APPLE_AR = "<b>AR on iPad and iPhone.</b> Safari on iPad and iPhone does not support AR inside web pages: this is a limit of Apple\u2019s Safari, not of this site. Instead, the button opens Apple\u2019s own AR viewer with what is on the table now. You can place it on a real desk and walk round it, but nothing can be moved there: to change it, come back here, change it, and open it again.";
  function setTab(m) {
    mode = m;
    tabs.forEach((b) => { const on = b.dataset.mode === m; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    if (m === "browser") { note.hidden = true; return; }
    checked.then(() => {
      if (mode !== m) return;
      const ok = support[m];
      if (m === "ar" && !ok && quickLook) {
        // the anchor must hold an image for Safari to hand the file to the AR viewer
        note.innerHTML = `<p>${APPLE_AR}</p><a rel="ar" class="btn v3-enter busy" href="#"><img alt="" width="1" height="1" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==">Preparing the AR view\u2026</a>`;
        note.hidden = false;
        note.querySelector("a[rel=ar]").addEventListener("click", (e) => { if (!qlURL) e.preventDefault(); else log("apple ar viewer"); });
        prepareQuickLook();
        return;
      }
      note.innerHTML = `<p>${ok ? NOTE[m].yes : NOTE[m].no}</p>` + (ok ? `<button type="button" class="btn v3-enter">Start ${m.toUpperCase()}</button>` : "");
      note.hidden = false;
      const b = note.querySelector(".v3-enter");
      if (b) b.addEventListener("click", () => enter(m));
    });
    log("tab", { mode: m });
  }
  tabs.forEach((b) => b.addEventListener("click", () => setTab(b.dataset.mode)));
  if (vrFirst) checked.then(() => { if (support.vr && mode === "browser") setTab("vr"); });

  // ---------- iPad and iPhone: Apple's AR viewer instead of AR in the page ----------
  // Safari on iPad and iPhone does not support WebXR, so AR cannot run inside the page there (an Apple limit, not this
  // site's). Instead the scene on the table is exported as a USDZ file made in the browser's memory and opened in
  // Apple's AR viewer (AR Quick Look): it can be looked at from every side, but not changed there. Only one such file
  // is kept, in memory: the previous one is released whenever a new one is made, and all of it when the page closes.
  const appleTouch = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const quickLook = (appleTouch && !!document.createElement("a").relList?.supports?.("ar"))
    || new URLSearchParams(location.search).has("appletest"); // ?appletest shows the iPad version on a computer, for checking
  let qlURL = null, qlTimer = 0, qlBusy = false;
  const releaseQL = () => { if (qlURL) { URL.revokeObjectURL(qlURL); qlURL = null; } };
  window.addEventListener("pagehide", releaseQL);
  /** Field lines as thin tubes (Apple's viewer cannot show plain lines), with their arrows, as one mesh. */
  function tubes(lines, color) {
    const geos = [];
    for (const L of lines) {
      const p = L.pts, pts = [];
      for (let k = 0; k < p.length; k += 6) pts.push(new THREE.Vector3(p[k], p[k + 1], p[k + 2]));
      const e = p.length - 3; pts.push(new THREE.Vector3(p[e], p[e + 1], p[e + 2]));
      if (pts.length < 2) continue;
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.min(160, pts.length * 2), 0.0012, 5, false));
      const m = arrowAt(L);
      if (m) geos.push(new THREE.ConeGeometry(0.0045, 0.014, 10).applyMatrix4(m));
    }
    return geos.length ? new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color, roughness: 0.6 })) : null;
  }
  function prepareQuickLook() {
    clearTimeout(qlTimer);
    const a = note.querySelector("a[rel=ar]");
    if (a) { a.classList.add("busy"); a.lastChild.textContent = "Preparing the AR view\u2026"; }
    qlTimer = setTimeout(async () => {
      if (qlBusy) { prepareQuickLook(); return; }
      qlBusy = true;
      try {
        const g = new THREE.Group();
        const floorM = new THREE.Mesh(new THREE.BoxGeometry(2 * TABLE, 0.002, 2 * TABLE), new THREE.MeshStandardMaterial({ color: 0xece7da, roughness: 0.9 }));
        floorM.position.y = -0.001; g.add(floorM);
        for (const c of charges) if (!c.out && !c.falling) {
          const m = new THREE.Mesh(c.geom, new THREE.MeshStandardMaterial({ color: c.q > 0 ? COLOR.pos : COLOR.neg, roughness: 0.45 }));
          m.position.set(c.x, c.y, c.z); m.quaternion.copy(c.quat); g.add(m);
        }
        if (goal && goal.lines) { const t = tubes(goal.lines, TARGET_LINE.screen); if (t) g.add(t); }
        if (shown && mine.lines) { const t = tubes(mine.lines, LINE.screen); if (t) g.add(t); }
        g.updateMatrixWorld(true); // the exporter reads each object's matrix: without this every object sits at the centre
        const buf = await new USDZExporter().parseAsync(g, { quickLookCompatible: true });
        releaseQL();
        qlURL = URL.createObjectURL(new Blob([buf], { type: "model/vnd.usdz+zip" }));
        const a2 = note.querySelector("a[rel=ar]");
        if (a2) { a2.href = qlURL; a2.classList.remove("busy"); a2.lastChild.textContent = "View in AR (Apple\u2019s viewer)"; }
      } catch (err) {
        flash(`Could not make the AR view: ${err.message || err}`);
      } finally { qlBusy = false; }
    }, 500);
  }

  let xrMode = null;
  async function enter(m) {
    const opts = m === "ar"
      ? { optionalFeatures: ["dom-overlay", "hand-tracking"], domOverlay: { root: xrBar } }
      : { optionalFeatures: ["hand-tracking"] };
    try {
      const session = await navigator.xr.requestSession("immersive-" + m, opts);
      xrMode = m;
      await renderer.xr.setSession(session);
      log("enter", { mode: m });
    } catch (err) {
      xrMode = null;
      flash(`Could not start ${m.toUpperCase()}: ${err.message || err}`);
    }
  }
  xrBar.querySelector(".v3-exit").addEventListener("beforexrselect", (e) => e.preventDefault());
  xrBar.querySelector(".v3-exit").addEventListener("click", () => renderer.xr.getSession()?.end());

  renderer.xr.addEventListener("sessionstart", () => {
    world.position.set(0.02, -0.42, -0.65);               // the space sits a little below the eyes, at arm's length
    scene.background = xrMode === "vr" ? new THREE.Color(COLOR.vr) : null;
    floorMat.opacity = xrMode === "vr" ? 0.12 : 0.35;
    mine.color(match ? MINE_XR : LINE.xr); if (goal) goal.color(TARGET_LINE.xr);
    xrBar.hidden = xrMode !== "ar";
    controls.enabled = false;
  });
  renderer.xr.addEventListener("sessionend", () => {
    ctrls.forEach((c) => { if (c.userData.drag) { drop(c.userData.drag); c.userData.drag = null; } });
    world.position.set(0, 0, 0);
    scene.background = new THREE.Color(COLOR.paper);
    floorMat.opacity = 1;
    mine.color(LINE.screen); if (goal) goal.color(TARGET_LINE.screen);
    xrBar.hidden = true; controls.enabled = true; xrMode = null;
    log("exit");
  });

  // ---------- size and drawing ----------
  function resize() {
    if (renderer.xr.isPresenting) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // on a narrow (phone) screen widen the view, so the whole tray still fits from side to side
    const half = Math.atan(Math.tan((21 * Math.PI) / 180) * Math.max(1, 1.6 / camera.aspect));
    camera.fov = (2 * half * 180) / Math.PI;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  root.querySelector(".v3-density").addEventListener("change", (e) => { perQ = +e.target.value; dirty = true; goalDirty = match; log("density", { perQ }); });
  if (match) root.querySelector(".v3-check").addEventListener("click", check);
  // draw only while the space is on screen: two 3D spaces on one page, and a headset battery, need not both run
  let onScreen = true;
  new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; }).observe(stage);
  root.querySelector(".v3-view").addEventListener("click", resetView);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const xr = renderer.xr.isPresenting;
    if (!xr && (!stage.offsetParent || !onScreen)) return; // not on screen: nothing to draw
    for (const c of [...charges]) if (c.falling) {
      c.vy -= 4 * dt; c.y += c.vy * dt; place(c);
      if (c.y < -0.6) removeCharge(c);
    }
    for (const t of trays) if (t.grow < 1) { t.grow = Math.min(1, t.grow + dt / 0.35); t.mesh.scale.setScalar(Math.max(0.01, t.grow)); }
    if (xr) ctrls.forEach((c) => {
      const d = c.userData.drag; if (!d) return;
      if (d.rot) { d.c.quat = c.getWorldQuaternion(new THREE.Quaternion()).multiply(d.qc0).multiply(d.q0); turned(d.c); }
      ctrlRay(c); follow(d, ...toLocal(ray.ray.origin, ray.ray.direction));
    });
    if (dirty) { rebuild(); if (mode === "ar" && quickLook) prepareQuickLook(); }
    if (!xr) controls.update();
    renderer.render(scene, camera);
  });
  return { check, clear: clearAll };
}
