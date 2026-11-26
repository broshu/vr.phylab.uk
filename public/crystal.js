// vr.phylab.uk — crystal unit cells (/crystal/).
// A crystal is one small box, the unit cell, repeated in every direction. An atom on a corner, an edge or a face of
// the box is shared with the neighbouring cells, so only part of it belongs to this cell: 1/8 at a corner, 1/4 on an
// edge, 1/2 on a face, all of it inside. Here you see the crystal, take one cell out of it (the atoms are cut along
// the faces of the cell, so you see exactly the part that belongs to it), pull the pieces apart, and see one corner,
// edge or face atom shared out between the cells that meet there.
// Either hand: point at a button and press the trigger (or pinch) to press it; press the trigger (or the grip)
// anywhere else to hold the model and turn it in your hand; the stick up and down makes it bigger or smaller.
import * as THREE from "/vendor/three/three.min.js";
import { PROJECTS } from "/projects.js";
import { sessionGranted, goInVR } from "/xr-nav.js";
import { makeBoard, write, SOFT } from "/lab-text.js";
const { OrbitControls } = THREE;

const FCC = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
// radii are in units of the cell edge a; "real" is the hard-sphere size (atoms or ions touching)
const STRUCTS = [
  { id: "sc", title: "Simple cubic", note: "for example polonium", cn: 6,
    species: [{ name: "Po", color: 0x9fb3c8, ball: 0.16, real: 0.5, sites: [[0, 0, 0]] }] },
  { id: "bcc", title: "Body-centred cubic", note: "for example iron, chromium and sodium", cn: 8,
    species: [{ name: "Fe", color: 0xb9bec8, ball: 0.16, real: Math.sqrt(3) / 4, sites: [[0, 0, 0], [0.5, 0.5, 0.5]] }] },
  { id: "fcc", title: "Face-centred cubic", note: "for example copper, aluminium and gold", cn: 12,
    species: [{ name: "Cu", color: 0xd68a50, ball: 0.14, real: Math.SQRT2 / 4, sites: FCC }] },
  { id: "nacl", title: "Sodium chloride", note: "rock salt", formula: "NaCl", cn: 6,
    species: [
      { name: "Na⁺", color: 0x9a6be0, ball: 0.1, real: 0.18, sites: [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [0.5, 0.5, 0.5]] },
      { name: "Cl⁻", color: 0x48c063, ball: 0.15, real: 0.32, sites: FCC }] },
  { id: "cscl", title: "Caesium chloride", formula: "CsCl", cn: 8,
    species: [
      { name: "Cs⁺", color: 0xe0a83a, ball: 0.13, real: 0.41, sites: [[0.5, 0.5, 0.5]] },
      { name: "Cl⁻", color: 0x48c063, ball: 0.15, real: 0.45, sites: [[0, 0, 0]] }] },
  { id: "diamond", title: "Diamond", note: "carbon; silicon and germanium have the same structure", cn: 4, bond: Math.sqrt(3) / 4,
    species: [{ name: "C", color: 0x9aa3b6, ball: 0.09, real: Math.sqrt(3) / 8,
      sites: [...FCC, [0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]] }] },
];
const SHARED = {
  corner: { title: "Corner atom", n: 8, place: "a corner", axes: [0, 1, 2] },
  edge: { title: "Edge atom", n: 4, place: "the middle of an edge", axes: [0, 1] },
  face: { title: "Face atom", n: 2, place: "the middle of a face", axes: [2] },
};
const CELL_COLORS = [0xff6b5a, 0xffb13d, 0xf2dc45, 0x5fd67a, 0x3fc8e8, 0x5a8cff, 0xb27dff, 0xff7ac8];
const DEN = { 3: 8, 2: 4, 1: 2, 0: 1 };
const PLACE = { 3: ["corner", "corners"], 2: ["edge", "edges"], 1: ["face", "faces"] };
const EDGE = 0xffd24a, EPS = 1e-6;
const SCALE = 0.3;                          // metres per cell edge, at first
const STAGE = new THREE.Vector3(0.18, -0.32, -0.75), BOARD = new THREE.Vector3(-0.66, -0.3, -0.56); // from the head
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const onEdge = (v) => Math.abs(v) < EPS || Math.abs(v - 1) < EPS;
const boundary = (p) => p.filter(onEdge).length;

/** Every atom of the structure with all coordinates in [lo, hi] (in cell edges). */
function atomsIn(st, lo, hi) {
  const out = [];
  for (const sp of st.species) for (const s of sp.sites)
    for (let i = Math.floor(lo) - 1; i <= Math.ceil(hi); i++)
      for (let j = Math.floor(lo) - 1; j <= Math.ceil(hi); j++)
        for (let k = Math.floor(lo) - 1; k <= Math.ceil(hi); k++) {
          const p = [s[0] + i, s[1] + j, s[2] + k];
          if (p.every((v) => v >= lo - EPS && v <= hi + EPS)) out.push({ sp, p });
        }
  return out;
}

/** How many atoms of each kind belong to one cell, written out as a sum. */
function countOf(st) {
  const cell = atomsIn(st, 0, 1);
  return st.species.map((sp) => {
    const by = {};
    cell.filter((a) => a.sp === sp).forEach((a) => { const k = boundary(a.p); by[k] = (by[k] || 0) + 1; });
    const parts = [3, 2, 1, 0].filter((k) => by[k]).map((k) => k === 0 ? `${by[k]} inside` : `${by[k]} ${PLACE[k][by[k] > 1 ? 1 : 0]} × [[1|${DEN[k]}]]`);
    const total = [3, 2, 1, 0].reduce((s, k) => s + (by[k] || 0) / DEN[k], 0);
    return { sp, total, text: `**${sp.name}:** ${parts.join(" + ")} = ${total}` };
  });
}
const filled = (st, counts) => counts.reduce((s, c) => s + c.total * (4 / 3) * Math.PI * c.sp.real ** 3, 0);

export function startCrystal(root, { rec } = {}) {
  root.classList.add("v3");
  root.innerHTML = `
    <div class="v3-note" hidden></div>
    <div class="v3-stage"><p class="v3-flash" hidden></p></div>
    <div class="v3-bar">
      <p class="v3-hint">A preview: drag to turn the view, scroll to zoom, click the buttons on the board. In a headset you hold the crystal in your hand.</p>
      <div class="v3-tools"><button type="button" class="btn ghost v3-view">Reset view</button></div>
    </div>`;
  const stageEl = root.querySelector(".v3-stage"), note = root.querySelector(".v3-note"), flashEl = root.querySelector(".v3-flash");
  const log = (action, d = {}) => rec && rec.event("crystal", { action, ...d });
  function flash(msg) { flashEl.textContent = msg; flashEl.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { flashEl.hidden = true; }, 2500); }

  // ---------- renderer and scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;       // the atoms of one cell are cut along the faces of the cell
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  stageEl.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c2130);
  const rig = new THREE.Group(); scene.add(rig);
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.02, 40); rig.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5850, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1.5, 4, 2.5); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color: 0x2a3042, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const grid = new THREE.PolarGridHelper(3, 12, 6, 64, 0x3a4258, 0x3a4258); grid.position.y = 0.002; scene.add(grid);

  // home: where the stage and the board stand (put in front of you when VR starts, and by Reset position)
  const home = new THREE.Group(); scene.add(home);
  const stage = new THREE.Group(); home.add(stage);  // what you hold and turn; its origin is the centre of the model
  const model = new THREE.Group(); stage.add(model);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.minDistance = 0.4; controls.maxDistance = 5;
  let headY = 1.55;
  function placeHome(pos, yaw, y) {
    headY = y;
    home.position.set(pos.x, 0, pos.z); home.rotation.set(0, yaw, 0);
    home.attach(stage);
    stage.position.set(STAGE.x, y + STAGE.y, STAGE.z); stage.quaternion.identity(); stage.rotation.set(0.35, -0.5, 0); stage.scale.setScalar(SCALE);
    board.mesh.position.set(BOARD.x, y + BOARD.y, BOARD.z);
    board.mesh.rotation.set(-0.12, Math.atan2(-BOARD.x, -BOARD.z), 0, "YXZ");
  }
  const resetView = () => {
    camera.position.set(-0.28, headY + 0.12, 1.15); controls.target.set(-0.26, headY - 0.3, -0.66); controls.update();
  };

  // ---------- what is shown ----------
  const state = { st: 3, view: "crystal", apart: false, real: false, count: false };
  let apartNow = 0;          // 0 together … 1 pulled apart (moves smoothly)
  let pieces = [];           // cut atoms: { g (moved when pulled apart), atom (its clipping follows), home, dir, local, world, label }
  let bondsCell = null;
  const geoCache = new Map();
  const sphereGeo = (r, seg = 40) => { const k = `${r.toFixed(4)}:${seg}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7))); return geoCache.get(k); };
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, ...o });

  function clearModel() {
    model.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); if (o.geometry && ![...geoCache.values()].includes(o.geometry)) o.geometry.dispose(); });
    model.clear(); pieces = []; bondsCell = null;
  }

  /** The 12 edges of the cube [0,1]³ (or of a cube of side 1 centred at the origin), as thin rods. */
  function cubeEdges(color, r = 0.012, centred = false) {
    const g = new THREE.Group(), geo = new THREE.CylinderGeometry(r, r, 1, 8), mat = std(color, { emissive: color, emissiveIntensity: 0.35 });
    const o = centred ? -0.5 : 0;
    for (let ax = 0; ax < 3; ax++) for (const a of [0, 1]) for (const b of [0, 1]) {
      const m = new THREE.Mesh(geo, mat), p = [0, 0, 0];
      p[ax] = 0.5 + o; p[(ax + 1) % 3] = a + o; p[(ax + 2) % 3] = b + o;
      m.position.set(...p);
      if (ax === 0) m.rotation.z = Math.PI / 2; else if (ax === 2) m.rotation.x = Math.PI / 2;
      g.add(m);
    }
    return g;
  }

  /** Rods between atoms that are one bond length apart (diamond). */
  function bondsBetween(list, len, opacity = 1) {
    const pairs = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i].p, b = list[j].p, d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (Math.abs(d - len) < 1e-3) pairs.push([a, b]);
    }
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 10), std(0x7d869b, { transparent: opacity < 1, opacity, depthWrite: opacity === 1 }), Math.max(1, pairs.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    pairs.forEach(([a, b], i) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
      q.setFromUnitVectors(up, d.clone().normalize());
      m.compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, d.length(), 1));
      mesh.setMatrixAt(i, m);
    });
    mesh.count = pairs.length;
    return mesh;
  }

  /** A small label showing a fraction (or 1). */
  function fracLabel(den, h = 0.2) {
    const cv = document.createElement("canvas"); cv.width = 120; cv.height = den === 1 ? 110 : 170;
    const g = cv.getContext("2d");
    g.fillStyle = "rgba(255,255,255,0.94)"; g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, 26); g.fill();
    g.fillStyle = "#1a2030"; g.textAlign = "center"; g.font = '500 64px Georgia, "Times New Roman", serif';
    if (den === 1) g.fillText("1", 60, 78);
    else { g.fillText("1", 60, 68); g.fillRect(28, 82, 64, 6); g.fillText(String(den), 60, 150); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set((h * cv.width) / cv.height, h, 1); s.renderOrder = 10; s.visible = false;
    return s;
  }

  /**
   * An atom of radius r cut by planes through its centre: cuts = [{ axis, sign }] keeps the side where sign·x ≥ 0.
   * The cut faces are covered by flat discs (cut the same way), so a piece looks solid.
   */
  function cutAtom(r, color, cuts) {
    const atom = new THREE.Group();
    const local = cuts.map(({ axis, sign }) => { const n = new THREE.Vector3(); n.setComponent(axis, sign); return new THREE.Plane(n, 0); });
    const world = local.map((p) => p.clone());
    const c = new THREE.Color(color);
    atom.add(new THREE.Mesh(sphereGeo(r), std(color, { clippingPlanes: world })));
    const capMat = std(c.clone().multiplyScalar(0.72), { clippingPlanes: world, side: THREE.DoubleSide });
    for (const pl of local) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.999, 48), capMat);
      disc.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pl.normal);
      disc.position.copy(pl.normal).multiplyScalar(0.002);
      atom.add(disc);
    }
    return { atom, local, world };
  }

  function buildCrystal(st) {
    model.position.set(-0.5, -0.5, -0.5);
    const list = atomsIn(st, -1, 2);
    for (const sp of st.species) {
      const r = state.real ? sp.real : sp.ball;
      for (const inside of [true, false]) {
        const mine = list.filter((a) => a.sp === sp && a.p.every((v) => v > -EPS && v < 1 + EPS) === inside);
        if (!mine.length) continue;
        const mat = inside ? std(sp.color) : std(sp.color, { transparent: true, opacity: 0.16, depthWrite: false });
        const mesh = new THREE.InstancedMesh(sphereGeo(r, 24), mat, mine.length), m = new THREE.Matrix4();
        mine.forEach((a, i) => mesh.setMatrixAt(i, m.makeTranslation(...a.p)));
        if (!inside) mesh.renderOrder = 2;
        model.add(mesh);
      }
    }
    if (st.bond) model.add(bondsBetween(list, st.bond, 0.55));
    model.add(cubeEdges(EDGE, 0.014));
  }

  function buildCell(st) {
    model.position.set(-0.5, -0.5, -0.5);
    const list = atomsIn(st, 0, 1), centre = new THREE.Vector3(0.5, 0.5, 0.5);
    for (const a of list) {
      const cuts = [];
      a.p.forEach((v, axis) => { if (Math.abs(v) < EPS) cuts.push({ axis, sign: 1 }); else if (Math.abs(v - 1) < EPS) cuts.push({ axis, sign: -1 }); });
      const r = state.real ? a.sp.real : Math.max(a.sp.ball, 0.12) * 1.25;
      const { atom, local, world } = cutAtom(r, a.sp.color, cuts);
      const pos = new THREE.Vector3(...a.p);
      atom.position.copy(pos);
      const label = fracLabel(DEN[cuts.length]); label.position.set(0, r + 0.13, 0); atom.add(label);
      model.add(atom);
      pieces.push({ g: atom, atom, home: pos, dir: pos.clone().sub(centre).multiplyScalar(0.9), local, world, label });
    }
    if (st.bond) { bondsCell = bondsBetween(list, st.bond); model.add(bondsCell); }
    model.add(cubeEdges(EDGE, 0.012));
  }

  function buildShared(kind) {
    model.position.set(0, 0, 0);
    const sh = SHARED[kind], r = 0.3;
    const signs = sh.axes.reduce((acc, ax) => acc.flatMap((s) => [1, -1].map((v) => ({ ...s, [ax]: v }))), [{}]);
    signs.forEach((s, i) => {
      const color = CELL_COLORS[i % CELL_COLORS.length], cell = new THREE.Group();
      const dir = new THREE.Vector3(s[0] || 0, s[1] || 0, s[2] || 0);
      cell.position.copy(dir).multiplyScalar(0.5);     // the cell's centre; the shared atom is at the model's origin
      cell.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(color, { transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide })));
      cell.add(cubeEdges(color, 0.01, true));
      const { atom, local, world } = cutAtom(r, color, sh.axes.map((axis) => ({ axis, sign: s[axis] })));
      atom.position.copy(dir).multiplyScalar(-0.5);
      const label = fracLabel(sh.n, 0.17); label.position.set(0, r + 0.12, 0); atom.add(label);
      cell.add(atom); model.add(cell);
      pieces.push({ g: cell, atom, home: cell.position.clone(), dir: dir.clone().multiplyScalar(0.38), local, world, label });
    });
  }

  function rebuild() {
    clearModel();
    const st = STRUCTS[state.st];
    if (state.view === "crystal") buildCrystal(st);
    else if (state.view === "cell") buildCell(st);
    else buildShared(state.view);
    board.redraw();
  }

  // ---------- the board ----------
  const others = PROJECTS.filter((p) => p.slug !== "crystal");
  function info() {
    const st = STRUCTS[state.st];
    if (state.view === "crystal")
      return `**${st.title}**${st.note ? ` (${st.note})` : ""}. The yellow edges mark one unit cell: the crystal is this cell repeated in every direction. Each atom here touches ${st.cn} nearest neighbours (coordination number ${st.cn}).\nChoose **Unit cell** to take the cell out of the crystal.`;
    if (state.view === "cell") {
      if (!state.count) return `**${st.title}: one unit cell.** The atoms are cut along the faces of the cell, so you see only the part of each atom that belongs to this cell.\nHow many atoms belong to one cell? Count them, press **Pull apart** to see the pieces, then **Show the count** to check.`;
      const c = countOf(st);
      let t = `**${st.title}: atoms in one unit cell**\n` + c.map((x) => x.text).join("\n");
      if (st.formula && c.length === 2) { const g = gcd(c[0].total, c[1].total); t += `\n${c[0].sp.name} : ${c[1].sp.name} = ${c[0].total} : ${c[1].total} = ${c[0].total / g} : ${c[1].total / g}, so the formula is **${st.formula}**.`; }
      t += `\nWith the atoms at their true size, they fill ${Math.round(filled(st, c) * 100)}% of the cell (the packing fraction).`;
      return t;
    }
    const sh = SHARED[state.view];
    return state.count
      ? `**${sh.title}.** An atom at ${sh.place} of a unit cell is shared by **${sh.n} cells**, so each cell holds [[1|${sh.n}]] of it. Each colour is one cell and its part of the atom.`
      : `**${sh.title}.** One atom at ${sh.place} of a unit cell. How many cells share it, and how much of it does each cell hold? Press **Pull apart**, then **Show the count** to check.`;
  }
  const board = makeBoard(1.3, 1.2, (g, W, H, btn) => {
    const M = 30, gap = 12, bh = 60, row = (n) => (W - 2 * M - gap * (n - 1)) / n;
    let y = write(g, "**Crystal unit cells**", M, 14, W - 2 * M, { size: 42, face: "serif" });
    write(g, "Structure", M, y - 6, W, { size: 22, color: SOFT }); y += 26;
    const w3 = row(3);
    STRUCTS.forEach((s, i) => btn(`st:${i}`, s.title, M + (i % 3) * (w3 + gap), y + Math.floor(i / 3) * (bh + 10), w3, bh, { on: state.st === i, size: 25 }));
    y += 2 * (bh + 10) + 6;
    write(g, "View", M, y - 6, W, { size: 22, color: SOFT }); y += 26;
    const views = [["crystal", "Crystal"], ["cell", "Unit cell"], ["corner", "Corner atom"], ["edge", "Edge atom"], ["face", "Face atom"]], w5 = row(5);
    views.forEach(([id, t], i) => btn(`view:${id}`, t, M + i * (w5 + gap), y, w5, bh, { on: state.view === id, size: 24 }));
    y += bh + 14;
    const w4 = row(4);
    [["apart", state.apart ? "Put together" : "Pull apart", state.apart], ["real", "True size", state.real], ["count", state.count ? "Hide the count" : "Show the count", state.count], ["reset", "Reset position", false]]
      .forEach(([id, t, on], i) => btn(id, t, M + i * (w4 + gap), y, w4, bh, { on, size: 24 }));
    y += bh + 20;
    g.fillStyle = "#e9e5da"; g.fillRect(M, y - 8, W - 2 * M, 3);
    write(g, info(), M, y + 4, W - 2 * M, { size: 27, gap: 0.5 });
    const ob = 54, wo = row(Math.max(1, others.length));
    write(g, "Other projects", M, H - ob - 58, W, { size: 22, color: SOFT });
    others.forEach((p, i) => btn(`go:${p.slug}`, p.title, M + i * (wo + gap), H - ob - 22, wo, ob, { size: 22 }));
  }, { ppm: 800 });
  home.add(board.mesh);
  const pickables = [board.mesh];

  function press(id) {
    if (!id) return;
    const [k, v] = id.split(":");
    log("press", { id });
    if (k === "st") { state.st = +v; if (state.view !== "cell" && state.view !== "crystal") state.view = "cell"; rebuild(); }
    else if (k === "view") { state.view = v; if (v === "crystal") state.apart = false; rebuild(); }
    else if (k === "apart") { if (state.view === "crystal") { state.view = "cell"; rebuild(); } state.apart = !state.apart; board.redraw(); }
    else if (k === "real") { state.real = !state.real; if (SHARED[state.view]) flash("True size changes the crystal and the unit cell."); rebuild(); }
    else if (k === "count") { state.count = !state.count; board.redraw(); }
    else if (k === "reset") { if (renderer.xr.isPresenting) placeNext = true; else { placeHome(new THREE.Vector3(), 0, 1.55); resetView(); } }
    else if (k === "go") { if (renderer.xr.isPresenting) goInVR(`/${v}/`); else location.href = `/${v}/`; }
  }

  // ---------- hands ----------
  const ray = new THREE.Raycaster(), tmpM = new THREE.Matrix4();
  let holder = null;
  const ctrls = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
    beam.visible = false; c.add(beam);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd24a })); dot.visible = false; scene.add(dot);
    c.userData = { beam, dot, source: null };
    c.addEventListener("connected", (e) => { c.userData.source = e.data; beam.visible = true; });
    c.addEventListener("disconnected", () => { c.userData.source = null; beam.visible = false; dot.visible = false; letGo(c); });
    c.addEventListener("selectstart", () => { const h = pointAt(c); if (h) press(board.at(h.uv)); else hold(c); });
    c.addEventListener("selectend", () => letGo(c));
    c.addEventListener("squeezestart", () => hold(c));
    c.addEventListener("squeezeend", () => letGo(c));
    rig.add(c);
    return c;
  });
  function pointAt(c) {
    c.updateMatrixWorld(true);
    tmpM.identity().extractRotation(c.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(c.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
    return ray.intersectObjects(pickables, false)[0] || null;
  }
  function hold(c) { if (holder) return; holder = c; c.attach(stage); log("hold"); }
  function letGo(c) { if (holder !== c) return; home.attach(stage); holder = null; }
  const stick = (c) => { const gp = c.userData.source && c.userData.source.gamepad; return gp && gp.axes && gp.axes.length >= 4 ? gp.axes[3] : 0; };

  // the mouse on the board (preview, or a classroom screen)
  const mouse = new THREE.Vector2(); let down = null;
  function boardUnderMouse(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const h = ray.intersectObject(board.mesh, false)[0];
    return h ? board.at(h.uv) : null;
  }
  renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) press(boardUnderMouse(e));
    down = null;
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (renderer.xr.isPresenting) return;
    const id = boardUnderMouse(e); board.setHover(id); renderer.domElement.style.cursor = id ? "pointer" : "";
  });

  // ---------- VR ----------
  const supported = navigator.xr ? navigator.xr.isSessionSupported("immersive-vr").catch(() => false) : Promise.resolve(false);
  const XR_OPTIONS = { optionalFeatures: ["local-floor", "hand-tracking"] };
  let placeNext = false;
  async function use(session, how) { await renderer.xr.setSession(session); log("enter", { how }); }
  async function enter(how = "button") {
    if (renderer.xr.isPresenting) return;
    try { await use(await navigator.xr.requestSession("immersive-vr", XR_OPTIONS), how); }
    catch (err) { flash(`Could not start VR: ${err.message || err}`); }
  }
  function offer() {
    if (!navigator.xr || !navigator.xr.offerSession || renderer.xr.isPresenting) return;
    navigator.xr.offerSession("immersive-vr", XR_OPTIONS).then((s) => use(s, "browser bar")).catch(() => {});
  }
  supported.then(async (ok) => {
    note.innerHTML = ok
      ? `<p><b>Put the headset on, then start.</b> You can stand or sit: the crystal appears in front of you.</p><button type="button" class="btn v3-enter">Start VR</button>`
      : `<p><b>This browser cannot open VR.</b> Open vr.phylab.uk/crystal/ in the browser of a VR headset (for example Meta Quest). Below is a preview you can turn with the mouse; the buttons on the board work too.</p>`;
    note.hidden = false;
    const b = note.querySelector(".v3-enter");
    if (b) b.addEventListener("click", () => enter());
    if (!ok) return;
    if (await sessionGranted()) enter("handed on"); else offer();
  });
  renderer.xr.addEventListener("sessionstart", () => { controls.enabled = false; camera.position.set(0, 0, 0); camera.quaternion.identity(); placeNext = true; });
  renderer.xr.addEventListener("sessionend", () => {
    ctrls.forEach(letGo); controls.enabled = true;
    placeHome(new THREE.Vector3(), 0, 1.55); resetView(); log("exit"); offer();
  });

  // ---------- size and the frame loop ----------
  function resize() {
    if (renderer.xr.isPresenting) return;
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stageEl); resize();
  root.querySelector(".v3-view").addEventListener("click", () => { placeHome(new THREE.Vector3(), 0, 1.55); resetView(); });

  placeHome(new THREE.Vector3(), 0, 1.55); resetView(); rebuild();
  const clock = new THREE.Clock(), head = new THREE.Vector3(), fwd = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), xr = renderer.xr.isPresenting;
    if (xr) {
      const xc = renderer.xr.getCamera();
      if (placeNext && xc.matrixWorld.elements[13] > 0.3) {      // the head is known: put the crystal and the board in front of it
        xc.getWorldPosition(head); xc.getWorldDirection(fwd);
        placeHome(head, Math.atan2(-fwd.x, -fwd.z), head.y); placeNext = false;
      }
      let hover = null;
      for (const c of ctrls) {
        if (!c.userData.source) continue;
        const h = pointAt(c), { beam, dot } = c.userData;
        beam.scale.z = h ? h.distance : 1.2;
        dot.visible = !!h; if (h) dot.position.copy(h.point);
        if (h && !hover) hover = board.at(h.uv);
        const sy = stick(c);
        if (Math.abs(sy) > 0.2) { const s = THREE.MathUtils.clamp(stage.scale.x * (1 - sy * dt * 1.5), 0.08, 1.2); stage.scale.setScalar(s); }
      }
      board.setHover(hover);
    } else controls.update();
    // pull apart smoothly, and keep each piece's cutting planes on the piece
    const target = state.apart && state.view !== "crystal" ? 1 : 0;
    apartNow += Math.sign(target - apartNow) * Math.min(Math.abs(target - apartNow), dt / 0.6);
    const ease = apartNow * apartNow * (3 - 2 * apartNow);
    scene.updateMatrixWorld();
    for (const p of pieces) {
      p.g.position.copy(p.home).addScaledVector(p.dir, ease);
      p.g.updateMatrixWorld(true);
      p.local.forEach((pl, i) => p.world[i].copy(pl).applyMatrix4(p.atom.matrixWorld));
      p.label.visible = state.count && apartNow > 0.6;
    }
    if (bondsCell) bondsCell.visible = apartNow < 0.02;
    renderer.render(scene, camera);
  });

  // for checking: /crystal/?debugcrystal exposes the page in the console
  if (new URLSearchParams(location.search).has("debugcrystal"))
    window.crystal = { state, press, countOf: (i) => countOf(STRUCTS[i]).map((c) => ({ name: c.sp.name, total: c.total })), filled: (i) => filled(STRUCTS[i], countOf(STRUCTS[i])), get pieces() { return pieces.length; }, camera, controls };
}
