// vr.phylab.uk — the electromagnetism lab (/lab/).
// A room the size of a classroom (9 m × 7 m) with five stations along the walls and a table in the middle:
//   A  a point charge            B  parallel plates (uniform E)      C  a box of uniform B
//   D  a bar magnet              E  a coil (a short solenoid)        the table: build your own from charges, magnets and coils
// The right hand holds a particle gun (the trigger fires; pointing at a button and pressing the trigger presses it).
// The left hand holds a probe: two arrows show E and B where the hand is. A menu on the left wrist chooses the particle,
// its speed, whether field lines are shown and how to move. Walk, or move with the left stick (or teleport) and turn
// with the right stick. Every station has challenges; shots and results are kept in the page's record.
// The fields of everything in the room add up everywhere (superposition); the physics is in lab-physics.js.
import * as THREE from "/vendor/three/three.min.js";
import { PROJECTS } from "/projects.js";
import { sessionGranted, goInVR } from "/xr-nav.js";
import * as P from "/lab-physics.js";
import { makeBoard, write, sprite, INK, SOFT, ACCENT } from "/lab-text.js";
const { OrbitControls } = THREE;

const ROOM = { x: 4.5, z: 3.5, h: 3 };
const START = { x: 0, z: 0.4 };
const PARTICLES = {
  electron: { name: "Electron", a: "an electron", qm: -1, color: 0x4aa8ff, label: "e⁻" },
  proton: { name: "Proton", a: "a proton", qm: 1, color: 0xff5545, label: "p" },
  alpha: { name: "Alpha", a: "an alpha particle", qm: 0.5, color: 0xffa83a, label: "α" },
  neutron: { name: "Neutron", a: "a neutron", qm: 0, color: 0xc9ccd4, label: "n" },
};
const SPEEDS = [0.6, 1.0, 1.4, 2.0];          // m/s in the room
const MAX_LIVE = 8, KEEP_TRAILS = 6, MAX_TABLE = 6;
const MOVE_SPEED = 1.5, SNAP = Math.PI / 6;     // joystick: 1.5 m/s, turning in 30° steps
const COL = { E: 0xffb02e, B: 0x3cc8ff, pos: 0xd33a2c, neg: 0x2a64c8, N: 0xd33a2c, S: 0x2a64c8, copper: 0xc27a3a, ring: 0x37d67a, done: 0xb6ff5c };
const UP = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function startLab(root, { rec } = {}) {
  root.classList.add("v3");
  root.innerHTML = `
    <div class="v3-note" hidden></div>
    <div class="v3-stage"><p class="v3-flash" hidden></p></div>
    <div class="v3-bar">
      <p class="v3-hint">A preview of the lab: drag to turn it, scroll to zoom. In a headset you walk around in it.</p>
      <div class="v3-tools"><button type="button" class="btn ghost v3-view">Reset view</button></div>
    </div>`;
  const stage = root.querySelector(".v3-stage"), note = root.querySelector(".v3-note"), flashEl = root.querySelector(".v3-flash");
  const log = (action, d = {}) => rec && rec.event("lab", { action, ...d });
  function flash(msg) { flashEl.textContent = msg; flashEl.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { flashEl.hidden = true; }, 2500); }

  // ---------- renderer, camera on a "rig" that the joystick, teleport and turning move ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");   // the floor of the room is the real floor, so you can walk
  renderer.xr.cameraAutoUpdate = false;               // the head is read at the start of each frame (for the comfort ring)
  stage.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c2130);
  const rig = new THREE.Group(); scene.add(rig);
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.03, 60); rig.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6d6a60, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(2, 5, 3); scene.add(sun);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.48; controls.minDistance = 1; controls.maxDistance = 16;
  const resetView = () => { camera.position.set(0, 8.5, 7.5); controls.target.set(0, 0.6, -0.3); controls.update(); };
  resetView();

  // ---------- the room ----------
  const pickables = [];
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
  {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const g = cv.getContext("2d"); g.fillStyle = "#d9d4c6"; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#bdb6a4"; g.lineWidth = 4; g.strokeRect(0, 0, 256, 256);
    g.strokeStyle = "#ccc6b6"; g.lineWidth = 2; g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2 * ROOM.x, 2 * ROOM.z); tex.anisotropy = 8;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * ROOM.x, 2 * ROOM.z), std(0xffffff, { map: tex, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    floor.userData = { kind: "floor" };
  }
  const wallMat = std(0xe9e6de, { roughness: 0.95 });
  const wall = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.h), wallMat); m.position.set(x, ROOM.h / 2, z); m.rotation.y = ry; scene.add(m); };
  wall(2 * ROOM.x, 0, -ROOM.z, 0); wall(2 * ROOM.x, 0, ROOM.z, Math.PI); wall(2 * ROOM.z, -ROOM.x, 0, Math.PI / 2); wall(2 * ROOM.z, ROOM.x, 0, -Math.PI / 2);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(2 * ROOM.x, 2 * ROOM.z), std(0xf4f2ec)); ceiling.rotation.x = Math.PI / 2; ceiling.position.y = ROOM.h;
  ceiling.visible = false; scene.add(ceiling);
  // a skirting line along the bottom of the walls, so the corners of the room read clearly
  {
    const s = ROOM, pts = [[-s.x, -s.z], [s.x, -s.z], [s.x, s.z], [-s.x, s.z], [-s.x, -s.z]].map(([x, z]) => new THREE.Vector3(x, 0.08, z));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x9c9686 })));
  }
  const post = (x, z, top, r = 0.018) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, top, 12), std(0x8d8879, { roughness: 0.5 })); m.position.set(x, top / 2, z); scene.add(m);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 24), std(0x8d8879)); f.position.set(x, 0.01, z); scene.add(f); };

  /** An arrow along +y of its own, from its base; setLen(L) changes its length. */
  function arrow(color, r = 0.007) {
    const mat = new THREE.MeshBasicMaterial({ color }), g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8), mat); shaft.geometry.translate(0, 0.5, 0);
    const head = new THREE.Mesh(new THREE.ConeGeometry(r * 2.6, r * 7, 12), mat);
    g.add(shaft, head);
    g.setLen = (L) => { const hl = Math.min(r * 7, L * 0.6); shaft.scale.y = Math.max(1e-4, L - hl); head.scale.setScalar(hl / (r * 7)); head.position.y = L - hl / 2; };
    g.point = (dir) => g.quaternion.setFromUnitVectors(UP, dir);
    g.setLen(0.2);
    return g;
  }
  const placeBoard = (b, x, y, z, ry) => { b.mesh.position.set(x, y, z); b.mesh.rotation.y = ry; scene.add(b.mesh); pickables.push(b.mesh); };
  function ringMesh(c) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(c.r, 0.01, 10, 64), new THREE.MeshBasicMaterial({ color: COL.ring }));
    m.position.copy(v3(c.c)); m.quaternion.setFromUnitVectors(Z, v3(c.n)); m.visible = false; scene.add(m);
    return m;
  }

  // ---------- the stations ----------
  // Each station: title, a short text, its challenges, buttons for its field, the sources it puts in the field and
  // its field lines. A challenge: text, who (which particle), and how it is won (through a ring, an orbit, a hit).
  const stations = [];
  let field = P.makeField();
  const fieldDirty = () => { needField = true; };
  let needField = true;

  // A — a point charge
  const QA = [-3.0, 1.3, -2.3], A = {
    id: "A", title: "A · A point charge", center: QA, zone: 1.0,
    intro: "A fixed charge +*Q*. Its electric field *E* points away from it, and the force on a particle is *qE*: towards +*Q* for an electron, away for a proton.",
    challenges: [
      { text: "The green ring is right behind +*Q*. Fire an **electron** past the charge so that the field bends it round into the ring.", who: "electron", ring: { c: [-3.0, 1.3, -2.88], n: [0, 0, 1], r: 0.1 } },
      { text: "Put an **electron** into orbit: make it go all the way round +*Q* at least once. Fire it sideways past the charge, not at it.", who: "electron", orbit: QA },
      { text: "A **proton** is pushed away from +*Q*. Fire one so that it swerves past the charge and goes through the ring at the side.", who: "proton", ring: { c: [-3.6, 1.3, -2.0], n: [1, 0, 0], r: 0.12 } },
    ],
    controls: [],
    sources(f) { f.points.push({ x: QA[0], y: QA[1], z: QA[2], Q: 0.6 }); f.spheres.push({ x: QA[0], y: QA[1], z: QA[2], r: 0.07, tag: "charge" }); },
    lines(f) {
      return P.spread(24).map((u) => P.traceLine(f, "E", [QA[0] + 0.08 * u[0], QA[1] + 0.08 * u[1], QA[2] + 0.08 * u[2]], 1, { maxLen: 1.2, bound: { c: QA, r: 1.15 } }).pts);
    },
  };
  {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 32, 20), std(COL.pos, { roughness: 0.4 })); m.position.copy(v3(QA)); scene.add(m);
    post(QA[0], QA[2], QA[1] - 0.07, 0.008);
    const lb = sprite("+*Q*", 0.07); lb.position.set(QA[0], QA[1] + 0.15, QA[2]); scene.add(lb);
  }
  stations.push(A);

  // B — parallel plates: uniform E between them
  const PB = { x0: -0.7, x1: 0.7, y0: 0.9, y1: 1.5, z0: -3.0, z1: -2.4 };
  const B = {
    id: "B", title: "B · Parallel plates", center: [0, 1.2, -2.7], zone: 1.1, level: 2, sign: 1,
    intro: "Between the plates the field *E* is uniform, so the force *qE* is the same everywhere there: a particle fired in between moves on a parabola, like a ball thrown sideways.",
    challenges: [
      { text: "Stand at the left end and fire a **proton** in between the plates so that it comes out through the green ring.", who: "proton", ring: { c: [1.15, 1.02, -2.7], n: [1, 0, 0], r: 0.1 } },
      { text: "Now make an **electron** come out through the same ring. You may change *E* with the buttons below.", who: "electron", ring: { c: [1.15, 1.02, -2.7], n: [1, 0, 0], r: 0.1 } },
    ],
    get E() { return 0.25 * this.level; },
    controls: [
      { id: "weaker", label: "*E* weaker", act() { B.level = Math.max(1, B.level - 1); } },
      { id: "stronger", label: "*E* stronger", act() { B.level = Math.min(4, B.level + 1); } },
      { id: "reverse", label: "Reverse *E*", act() { B.sign *= -1; } },
    ],
    status() { return `*E* = ${B.E.toFixed(2)}, ${B.sign > 0 ? "downwards" : "upwards"}`; },
    sources(f) {
      f.uniE.push({ box: [PB.x0, PB.x1, PB.y0, PB.y1, PB.z0, PB.z1], E: [0, -B.sign * B.E, 0] });
      const m = [1, 0, 0, 0, 1, 0, 0, 0, 1], c = [(PB.x0 + PB.x1) / 2, 0, (PB.z0 + PB.z1) / 2], h = [(PB.x1 - PB.x0) / 2, 0.008, (PB.z1 - PB.z0) / 2];
      f.boxes.push({ c: [c[0], PB.y0, c[2]], m, h, tag: "plate" }, { c: [c[0], PB.y1, c[2]], m, h, tag: "plate" });
    },
    update() {
      plateTop.material.color.setHex(B.sign > 0 ? COL.pos : COL.neg); plateBot.material.color.setHex(B.sign > 0 ? COL.neg : COL.pos);
      plateLbTop.material.map = (B.sign > 0 ? plus : minus).material.map; plateLbBot.material.map = (B.sign > 0 ? minus : plus).material.map;
      for (const a of plateArrows) { a.point(new THREE.Vector3(0, -B.sign, 0)); a.setLen(0.12 + 0.07 * B.level); a.position.y = B.sign > 0 ? 1.2 + (0.12 + 0.07 * B.level) / 2 : 1.2 - (0.12 + 0.07 * B.level) / 2; }
    },
  };
  const plus = sprite("+", 0.07), minus = sprite("−", 0.07);
  const plateGeo = new THREE.BoxGeometry(PB.x1 - PB.x0, 0.016, PB.z1 - PB.z0);
  const plateTop = new THREE.Mesh(plateGeo, std(COL.pos, { roughness: 0.4, transparent: true, opacity: 0.8 })), plateBot = new THREE.Mesh(plateGeo, std(COL.neg, { roughness: 0.4, transparent: true, opacity: 0.8 }));
  plateTop.position.set(0, PB.y1, -2.7); plateBot.position.set(0, PB.y0, -2.7); scene.add(plateTop, plateBot);
  const plateLbTop = new THREE.Sprite(new THREE.SpriteMaterial({ map: plus.material.map, depthWrite: false })), plateLbBot = new THREE.Sprite(new THREE.SpriteMaterial({ map: minus.material.map, depthWrite: false }));
  plateLbTop.scale.copy(plus.scale); plateLbBot.scale.copy(minus.scale);
  plateLbTop.position.set(PB.x0 - 0.08, PB.y1, -2.7); plateLbBot.position.set(PB.x0 - 0.08, PB.y0, -2.7); scene.add(plateLbTop, plateLbBot);
  for (const [x, z] of [[PB.x0 + 0.05, PB.z0 + 0.05], [PB.x1 - 0.05, PB.z0 + 0.05]]) {
    post(x, z, PB.y1, 0.012);
  }
  const plateArrows = [];
  for (const x of [-0.5, -0.17, 0.17, 0.5]) for (const z of [-2.85, -2.55]) { const a = arrow(COL.E, 0.006); a.position.set(x, 1.2, z); scene.add(a); plateArrows.push(a); }
  { const lb = sprite("*E*", 0.06, { color: "#9a5b00" }); lb.position.set(0.62, 1.2, -2.4); scene.add(lb); }
  stations.push(B);

  // C — a box of uniform magnetic field
  const CB = { x0: 2.0, x1: 4.0, y0: 0.15, y1: 2.05, z0: -3.3, z1: -1.3 };
  const C = {
    id: "C", title: "C · Uniform magnetic field", center: [3.0, 1.1, -2.3], zone: 1.45, level: 2, sign: 1,
    intro: "Inside the blue box the field *B* is uniform. The force *qv* × *B* is always at right angles to *v*, so the speed stays the same and the path bends into a circle of radius *r* = [[*mv*|*qB*]].",
    challenges: [
      { text: "Fire an **electron** into the blue box so that it goes through the green ring.", who: "electron", ring: { c: [3.4, 1.1, -2.7], n: [0, 0, 1], r: 0.12 } },
      { text: "Now a **proton** through the same ring. Which way does it turn, and why?", who: "proton", ring: { c: [3.4, 1.1, -2.7], n: [0, 0, 1], r: 0.12 } },
      { text: "Fire an **electron** at an angle to *B* so that it spirals up through the ring above. Straight along *B* does not count.", who: "electron", ring: { c: [3.0, 1.8, -2.3], n: [0, 1, 0], r: 0.15 }, angleTo: () => [0, C.sign, 0] },
    ],
    get B() { return 1.0 * this.level; },
    controls: [
      { id: "weaker", label: "*B* weaker", act() { C.level = Math.max(1, C.level - 1); } },
      { id: "stronger", label: "*B* stronger", act() { C.level = Math.min(4, C.level + 1); } },
      { id: "reverse", label: "Reverse *B*", act() { C.sign *= -1; } },
    ],
    status() { return `*B* = ${C.B.toFixed(1)}, ${C.sign > 0 ? "upwards" : "downwards"}`; },
    sources(f) { f.uniB.push({ box: [CB.x0, CB.x1, CB.y0, CB.y1, CB.z0, CB.z1], B: [0, C.sign * C.B, 0] }); },
    update() { for (const a of boxArrows) { a.point(new THREE.Vector3(0, C.sign, 0)); a.setLen(0.12 + 0.06 * C.level); a.position.y = a.userData.y - C.sign * (0.12 + 0.06 * C.level) / 2; } },
  };
  {
    const w = CB.x1 - CB.x0, h = CB.y1 - CB.y0, d = CB.z1 - CB.z0, cx = (CB.x0 + CB.x1) / 2, cy = (CB.y0 + CB.y1) / 2, cz = (CB.z0 + CB.z1) / 2;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: COL.B }));
    edges.position.set(cx, cy, cz); scene.add(edges);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: COL.B, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
    glass.position.copy(edges.position); scene.add(glass);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: COL.B, transparent: true, opacity: 0.12, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(cx, 0.003, cz); scene.add(pad);
    const lb = sprite("*B*", 0.07, { color: "#0a6c94" }); lb.position.set(CB.x0 + 0.1, CB.y1 + 0.08, CB.z1); scene.add(lb);
  }
  const boxArrows = [];
  for (const x of [2.35, 3.0, 3.65]) for (const z of [-2.95, -2.3, -1.65]) for (const y of [0.55, 1.55]) {
    const a = arrow(COL.B, 0.006); a.userData.y = y; a.position.set(x, y, z); scene.add(a); boxArrows.push(a);
  }
  stations.push(C);

  // D — a bar magnet (a north pole and a south pole)
  const MD = [-3.2, 1.2, 1.8], D = {
    id: "D", title: "D · A bar magnet", center: MD, zone: 1.0, dir: 1,
    intro: "The field *B* of a bar magnet is strongest near its poles. Along a field line a particle feels no force; across one it is pushed sideways and curls round the field line.",
    challenges: [
      { text: "Make an **electron** hit the north end (N, red) of the magnet.", who: "electron", hit: "N" },
      { text: "Now make a **proton** hit the south end (S, blue).", who: "proton", hit: "S" },
    ],
    controls: [{ id: "turn", label: "Turn the magnet round", act() { D.dir *= -1; } }],
    status() { return `N end: ${D.dir > 0 ? "towards the room" : "towards the wall"}`; },
    sources(f) {
      const d = D.dir, m = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      f.poles.push({ x: MD[0] + 0.2 * d, y: MD[1], z: MD[2], p: 0.18 }, { x: MD[0] - 0.2 * d, y: MD[1], z: MD[2], p: -0.18 });
      f.boxes.push({ c: [MD[0] + 0.125 * d, MD[1], MD[2]], m, h: [0.125, 0.045, 0.045], tag: "N" }, { c: [MD[0] - 0.125 * d, MD[1], MD[2]], m, h: [0.125, 0.045, 0.045], tag: "S" });
    },
    lines(f) { return magnetLines(f, [MD[0] + 0.2 * D.dir, MD[1], MD[2]], [D.dir, 0, 0], 22, 0.09, { c: MD, r: 1.1 }); },
    update() { magnetD.rotation.y = D.dir > 0 ? 0 : Math.PI; },
  };
  const magnetD = magnetMesh(0.5, 0.09); magnetD.position.copy(v3(MD)); scene.add(magnetD);
  post(MD[0], MD[2], MD[1] - 0.045, 0.015);
  stations.push(D);

  /** A bar magnet along its own +x: red north half at +x, blue south half at −x, letters on both. */
  function magnetMesh(len, t) {
    const g = new THREE.Group();
    const n = new THREE.Mesh(new THREE.BoxGeometry(len / 2, t, t), std(COL.N, { roughness: 0.45 })); n.position.x = len / 4;
    const s = new THREE.Mesh(new THREE.BoxGeometry(len / 2, t, t), std(COL.S, { roughness: 0.45 })); s.position.x = -len / 4;
    const ln = sprite("N", t * 0.8, { color: "#ffffff", bg: "rgba(0,0,0,0)" }); ln.position.set(len / 4, t / 2 + 0.03, 0);
    const ls = sprite("S", t * 0.8, { color: "#ffffff", bg: "rgba(0,0,0,0)" }); ls.position.set(-len / 4, t / 2 + 0.03, 0);
    ln.material.color.setHex(0xffd0c8); ls.material.color.setHex(0xc8dcff);
    g.add(n, s, ln, ls);
    return g;
  }
  /** Field lines of a bar magnet: from points round its north pole, leaving it outwards, until they reach the magnet again. */
  function magnetLines(f, Np, axis, n, r0, bound) {
    const out = [];
    for (const d of P.spread(n)) {
      const s = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
      if (s < -0.1) continue;                               // into the magnet: the two-pole picture is only right outside it
      const start = [Np[0] + r0 * d[0], Np[1] + r0 * d[1], Np[2] + r0 * d[2]];   // just outside the magnet
      out.push(P.traceLine(f, "B", start, 1, { maxLen: 2.5, bound, stop: (x, y, z) => !!P.hitObject(f, x, y, z) }).pts);
    }
    return out;
  }

  // E — a coil: six turns of wire, a short solenoid
  const CE = [3.2, 1.2, 1.8], TURNS = [-0.25, -0.15, -0.05, 0.05, 0.15, 0.25], RC = 0.22;
  const E = {
    id: "E", title: "E · A coil", center: CE, zone: 1.0, on: true, dir: 1,
    intro: "A current *I* in the coil makes a magnetic field. Inside the coil *B* is nearly uniform and lies along its axis; outside it spreads out like the field of a bar magnet.",
    challenges: [
      { text: "Send an **electron** through the coil and out through the green ring at the far end.", who: "electron", ring: { c: [3.95, 1.2, 1.8], n: [1, 0, 0], r: 0.12 } },
      { text: "Now fire the **electron** into the coil at an angle, so that it spirals inside, and still get it through the ring.", who: "electron", ring: { c: [3.95, 1.2, 1.8], n: [1, 0, 0], r: 0.12 }, spiral: true },
    ],
    controls: [
      { id: "onoff", label: "Current on / off", act() { E.on = !E.on; } },
      { id: "reverse", label: "Reverse *I*", act() { E.dir *= -1; } },
    ],
    status() { return E.on ? `Current on; *B* inside points ${E.dir > 0 ? "away from the room" : "towards the room"}` : "Current off: no field"; },
    sources(f) { for (const t of TURNS) P.addLoop(f, [CE[0] + t, CE[1], CE[2]], [E.dir, 0, 0], RC, E.on ? 0.015 : 0); },
    lines(f) {
      if (!E.on) return [];
      return coilLines(f, CE, [1, 0, 0], RC * 0.75, 2, { c: CE, r: 1.15 });
    },
    update() {
      coilArrows.forEach((a) => { a.visible = E.on; a.rotation.y = E.dir > 0 ? 0 : Math.PI; });
      coilMeshes.forEach((m) => m.material.emissive.setHex(E.on ? 0x3a1a00 : 0x000000));
    },
  };
  const coilMeshes = [], coilArrows = [];
  for (const t of TURNS) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(RC, 0.012, 10, 64), std(COL.copper, { roughness: 0.35, metalness: 0.4 }));
    m.position.set(CE[0] + t, CE[1], CE[2]); m.rotation.y = Math.PI / 2; scene.add(m); coilMeshes.push(m);
  }
  // little arrows on top of the coil show which way the current goes round
  for (const t of [-0.2, 0.0, 0.2]) {
    const holder = new THREE.Group(); holder.position.set(CE[0] + t + 0.05, CE[1] + RC, CE[2]);
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 12), new THREE.MeshBasicMaterial({ color: 0xffd15c }));
    a.rotation.x = Math.PI / 2;   // B along +x (right-hand rule): on top of the coil the current runs towards +z
    holder.add(a); scene.add(holder); coilArrows.push(holder);
  }
  { const lb = sprite("*I*", 0.06); lb.position.set(CE[0], CE[1] + RC + 0.1, CE[2]); scene.add(lb); }
  post(CE[0] - 0.3, CE[2], CE[1] - RC, 0.012); post(CE[0] + 0.3, CE[2], CE[1] - RC, 0.012);
  stations.push(E);

  /** Field lines of a coil or loop: from points across its middle, round and back; open ends are traced both ways. */
  function coilLines(f, c, a, rMax, rings, bound) {
    const out = [], [u, w] = P.basis(a), starts = [[...c]];
    for (let k = 1; k <= rings; k++) for (let j = 0; j < 6; j++) {
      const t = (2 * Math.PI * j) / 6 + k * 0.5, r = (rMax * k) / rings;
      starts.push([0, 1, 2].map((i) => c[i] + r * (Math.cos(t) * u[i] + Math.sin(t) * w[i])));
    }
    for (const s of starts) {
      const fw = P.traceLine(f, "B", s, 1, { maxLen: 3.2, bound, closes: true });
      if (fw.closed) { out.push(fw.pts); continue; }
      const bw = P.traceLine(f, "B", s, -1, { maxLen: 3.2, bound });
      const p = [];
      for (let k = bw.pts.length - 3; k > 0; k -= 3) p.push(bw.pts[k], bw.pts[k + 1], bw.pts[k + 2]);
      out.push(p.concat(fw.pts));
    }
    return out;
  }

  // ---------- the table: build your own ----------
  const TBL = { x0: -0.9, x1: 0.9, z0: 0.8, z1: 1.8, top: 0.78, y1: 1.7 };
  const table = [];  // objects on the table: { kind, g, quat, ... }
  const S = {
    id: "S", title: "Build your own", center: [0, 1.2, 1.3], zone: 0,
    intro: "Take charges, a magnet or a coil from the shelf on the right and put them above the table: point at one and hold the trigger. Their fields add up. Fire particles through what you have built. Let go of an object away from the table and it is put away.",
    challenges: [],
    controls: [{ id: "clear", label: "Clear the table", act() { [...table].forEach(removeTableObj); log("clear table"); } }],
    status() { return `${table.length} of ${MAX_TABLE} objects on the table`; },
    sources(f) {
      for (const o of table) {
        const p = o.g.position, ax = new THREE.Vector3(1, 0, 0).applyQuaternion(o.g.quaternion);
        const rot = new THREE.Matrix4().makeRotationFromQuaternion(o.g.quaternion).elements, m = [rot[0], rot[1], rot[2], rot[4], rot[5], rot[6], rot[8], rot[9], rot[10]];
        if (o.kind === "pos" || o.kind === "neg") {
          f.points.push({ x: p.x, y: p.y, z: p.z, Q: o.kind === "pos" ? 0.3 : -0.3 }); f.spheres.push({ x: p.x, y: p.y, z: p.z, r: 0.05, tag: "charge" });
        } else if (o.kind === "magnet") {
          f.poles.push({ x: p.x + 0.15 * ax.x, y: p.y + 0.15 * ax.y, z: p.z + 0.15 * ax.z, p: 0.12 }, { x: p.x - 0.15 * ax.x, y: p.y - 0.15 * ax.y, z: p.z - 0.15 * ax.z, p: -0.12 });
          f.boxes.push({ c: [p.x, p.y, p.z], m, h: [0.2, 0.035, 0.035], tag: "magnet" });
        } else {
          P.addLoop(f, [p.x, p.y, p.z], [ax.x, ax.y, ax.z], 0.14, 0.04);
        }
      }
    },
    lines(f, fast) {
      const out = [], bound = { c: [0, 1.25, 1.3], r: 1.05 };
      const charges = table.filter((o) => o.kind === "pos" || o.kind === "neg");
      const nearNeg = (x, y, z) => charges.some((o) => o.kind === "neg" && o.g.position.distanceToSquared(new THREE.Vector3(x, y, z)) < 0.05 * 0.05);
      const nearPos = (x, y, z) => charges.some((o) => o.kind === "pos" && o.g.position.distanceToSquared(new THREE.Vector3(x, y, z)) < 0.05 * 0.05);
      for (const o of table) {
        const p = o.g.position, ax = new THREE.Vector3(1, 0, 0).applyQuaternion(o.g.quaternion).toArray();
        if (o.kind === "pos" || o.kind === "neg") {
          for (const u of P.spread(fast ? 8 : 14)) {
            const s = [p.x + 0.06 * u[0], p.y + 0.06 * u[1], p.z + 0.06 * u[2]];
            if (o.kind === "pos") out.push(P.traceLine(f, "E", s, 1, { maxLen: 2, bound, stop: nearNeg }).pts);
            else {
              const t = P.traceLine(f, "E", s, -1, { maxLen: 2, bound, stop: nearPos }), q = t.pts, n = q.length;
              if (n > 6 && nearPos(q[n - 3], q[n - 2], q[n - 1])) continue;      // already drawn from that positive charge
              const r = []; for (let k = n - 3; k >= 0; k -= 3) r.push(q[k], q[k + 1], q[k + 2]);
              out.push(r);
            }
          }
        } else if (o.kind === "magnet") {
          out.push(...magnetLines(f, [p.x + 0.15 * ax[0], p.y + 0.15 * ax[1], p.z + 0.15 * ax[2]], ax, fast ? 10 : 16, 0.07, bound));
        } else out.push(...coilLines(f, [p.x, p.y, p.z], ax, 0.1, 1, bound));
      }
      return out;
    },
  };
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(TBL.x1 - TBL.x0, 0.04, TBL.z1 - TBL.z0), std(0xb9a27c, { roughness: 0.7 }));
    top.position.set(0, TBL.top - 0.02, (TBL.z0 + TBL.z1) / 2); scene.add(top);
    for (const x of [TBL.x0 + 0.06, TBL.x1 - 0.06]) for (const z of [TBL.z0 + 0.06, TBL.z1 - 0.06]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, TBL.top - 0.04, 0.05), std(0x6f6556)); leg.position.set(x, (TBL.top - 0.04) / 2, z); scene.add(leg);
    }
    const grid = new THREE.GridHelper(1.0, 10, 0x8e7b5c, 0x9e8b6c); grid.scale.set(1.8, 1, 1); grid.position.set(0, TBL.top + 0.001, (TBL.z0 + TBL.z1) / 2); scene.add(grid);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 1.0), std(0x9a8a6e)); shelf.position.set(1.3, 0.9, 1.3); scene.add(shelf);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.88, 0.06), std(0x6f6556)); leg.position.set(1.3, 0.44, 1.3); scene.add(leg);
  }
  stations.push(S);

  // the shelf: take one and a new one appears
  const SPAWN = [["pos", 0.95], ["neg", 1.18], ["magnet", 1.42], ["coil", 1.66]];
  const spawners = SPAWN.map(([kind, z]) => {
    const g = tableMesh(kind); g.position.set(1.3, 0.92 + (kind === "coil" ? 0.15 : 0.06), z); scene.add(g);
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.copy(g.position); proxy.userData = { kind: "spawn", objKind: kind, g }; scene.add(proxy); pickables.push(proxy);
    return { kind, g };
  });
  function tableMesh(kind) {
    const g = new THREE.Group();
    if (kind === "pos" || kind === "neg") {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 28, 18), std(kind === "pos" ? COL.pos : COL.neg, { roughness: 0.4 })));
      const lb = sprite(kind === "pos" ? "+*q*" : "−*q*", 0.05); lb.position.y = 0.1; g.add(lb);
    } else if (kind === "magnet") g.add(magnetMesh(0.4, 0.07));
    else {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.01, 10, 48), std(COL.copper, { roughness: 0.35, metalness: 0.4, emissive: 0x3a1a00 }));
      m.rotation.y = Math.PI / 2; g.add(m);
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 12), new THREE.MeshBasicMaterial({ color: 0xffd15c }));
      a.position.set(0, 0.14, 0); a.rotation.x = Math.PI / 2; g.add(a);
      const ax = arrow(COL.B, 0.004); ax.point(new THREE.Vector3(1, 0, 0)); ax.setLen(0.12); g.add(ax);  // which way B points through it
    }
    return g;
  }
  function addTableObj(kind, pos) {
    const g = tableMesh(kind); g.position.copy(pos); scene.add(g);
    const proxy = new THREE.Mesh(kind === "magnet" ? new THREE.BoxGeometry(0.44, 0.1, 0.1) : new THREE.SphereGeometry(kind === "coil" ? 0.16 : 0.08, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    g.add(proxy);
    const o = { kind, g, proxy };
    proxy.userData = { kind: "tableobj", o };
    pickables.push(proxy); table.push(o);
    return o;
  }
  function removeTableObj(o) {
    scene.remove(o.g); pickables.splice(pickables.indexOf(o.proxy), 1); table.splice(table.indexOf(o), 1);
    fieldDirty(); linesDirty(S); S.board.redraw();
  }
  const onTable = (p) => p.x > TBL.x0 && p.x < TBL.x1 && p.z > TBL.z0 && p.z < TBL.z1 && p.y > TBL.top - 0.05 && p.y < TBL.y1 + 0.2;

  // ---------- boards ----------
  const BW = 1.4, BH = 1.05;
  for (const s of stations) {
    s.ci = 0; s.shots = s.challenges.map(() => 0); s.done = s.challenges.map(() => false); s.msg = "";
    s.rings = s.challenges.map((ch) => (ch.ring ? ringMesh(ch.ring) : null));
    s.board = makeBoard(BW, BH, (g, W, H, btn) => drawStation(s, g, W, H, btn), { ppm: 750 });
  }
  function drawStation(s, g, W, H, btn) {
    const M = 36;
    let y = write(g, `**${s.title}**`, M, 22, W - 2 * M, { size: 46, face: "serif" });
    y = write(g, s.intro, M, y + 2, W - 2 * M, { size: 31, color: SOFT, gap: 0.33 });
    // from the bottom up: Previous / Next, the buttons for the field, the state of the field, then the challenge box
    const bh = 72, gap = 14;
    let bottom = H - 20;
    const navY = s.challenges.length > 1 ? (bottom -= bh) : null; if (navY !== null) bottom -= gap;
    const ctlY = s.controls.length ? (bottom -= bh) : null; if (ctlY !== null) bottom -= gap;
    const statY = s.status ? (bottom -= 42) : null;
    bottom -= 12;
    if (s.challenges.length) {
      const ch = s.challenges[s.ci], done = s.done[s.ci], n = s.shots[s.ci];
      y += 12;
      g.fillStyle = done ? "#e3f6e6" : "#ffffff"; g.strokeStyle = done ? "#37a05a" : "#d6d0c0"; g.lineWidth = 3;
      g.beginPath(); g.roundRect(M - 10, y, W - 2 * M + 20, bottom - y, 16); g.fill(); g.stroke();
      let yy = write(g, `**Challenge ${s.ci + 1} of ${s.challenges.length}**`, M + 8, y + 8, W - 2 * M - 16, { size: 32, color: ACCENT });
      yy = write(g, ch.text, M + 8, yy, W - 2 * M - 16, { size: 35, gap: 0.3 });
      const line = done ? `**Done** in ${n} shot${n === 1 ? "" : "s"}.${s.ci < s.challenges.length - 1 ? " Press Next for the next one." : " All done here!"}`
        : s.msg || (n ? `Shots so far: ${n}` : "");
      if (line) write(g, line, M + 8, yy + 4, W - 2 * M - 16, { size: 32, color: done ? "#1e7a3e" : s.msg ? "#9a5b00" : SOFT });
    }
    if (statY !== null) write(g, s.status(), M, statY, W - 2 * M, { size: 29, color: SOFT });
    const row = (items, y0) => {
      const bw = (W - 2 * M - gap * (items.length - 1)) / items.length;
      items.forEach((it, i) => btn(it.id, it.label, M + i * (bw + gap), y0, bw, bh, { tone: it.tone }));
    };
    if (ctlY !== null) row(s.controls, ctlY);
    if (navY !== null) row([{ id: "prev", label: "\u2039 Previous" }, { id: "next", label: "Next \u203a", tone: "go" }], navY);
  }
  function pressStation(s, id) {
    if (id === "prev" || id === "next") {
      s.ci = (s.ci + (id === "next" ? 1 : s.challenges.length - 1)) % s.challenges.length; s.msg = "";
      showRings(); log("challenge", { station: s.id, n: s.ci + 1 });
    } else {
      const c = s.controls.find((c) => c.id === id); if (!c) return;
      c.act(); if (s.update) s.update(); fieldDirty(); linesDirty(s); log("control", { station: s.id, control: id, state: s.status && s.status() });
    }
    s.board.redraw();
  }
  function showRings() {
    for (const s of stations) s.rings.forEach((m, i) => {
      if (!m) return;
      m.visible = i === s.ci; m.material.color.setHex(s.done[i] ? COL.done : COL.ring);
    });
  }
  placeBoard(A.board, -3.0, 1.85, -ROOM.z + 0.02, 0);
  placeBoard(B.board, 0, 2.05, -ROOM.z + 0.02, 0);
  placeBoard(C.board, ROOM.x - 0.02, 1.6, -2.3, -Math.PI / 2);
  placeBoard(D.board, -ROOM.x + 0.02, 1.6, 1.8, Math.PI / 2);
  placeBoard(E.board, ROOM.x - 0.02, 1.6, 0.6, -Math.PI / 2);
  placeBoard(S.board, 0, 1.45, 2.5, Math.PI);
  stations.forEach((s) => s.update && s.update());
  showRings();

  // the board by the start: how to use the lab, and the other projects
  const others = PROJECTS.filter((p) => p.slug !== "lab");
  const help = makeBoard(1.25, 1.1, (g, W, H, btn) => {
    const M = 34;
    let y = write(g, "**The electromagnetism lab**", M, 20, W - 2 * M, { size: 44, face: "serif" });
    y = write(g, [
      "**Right hand:** a particle gun. Press the trigger to fire; point at a button and press the trigger to press it.",
      "**Left hand:** a probe. The orange arrow shows *E* and the blue arrow shows *B* where your hand is. On your left wrist: choose the particle and its speed, field lines, and how to move.",
      "**Moving:** walk, or push the left stick. The right stick turns you in steps.",
      "Fields, charges and masses are scaled so that the paths fit in the room (an electron here is as heavy as a proton). Directions, and how a path depends on *v*, *E*, *B*, *q* and *m*, are real.",
    ].join("\n"), M, y + 4, W - 2 * M, { size: 28, color: INK, gap: 0.42 });
    const bh = 68, gap = 14, bw = (W - 2 * M - gap * (others.length - 1)) / Math.max(1, others.length);
    write(g, "Other projects:", M, H - bh - 72, W, { size: 26, color: SOFT });
    others.forEach((p, i) => btn("go:" + p.slug, p.title, M + i * (bw + gap), H - bh - 24, bw, bh));
  }, { ppm: 820 });
  help.mesh.rotation.order = "YXZ";
  placeBoard(help, -1.45, 1.3, -0.25, Math.atan2(START.x + 1.45, START.z + 0.25));
  help.mesh.rotation.x = -0.12;

  // ---------- the field, and field lines ----------
  function rebuildField() {
    const f = P.makeField();
    for (const s of stations) s.sources(f);
    field = f; needField = false;
  }
  let showLines = false;
  const lineSets = new Map();   // station → { obj, arrows, dirty }
  for (const s of stations) if (s.lines) {
    const mat = new THREE.LineBasicMaterial({ color: s.id === "A" ? COL.E : s.id === "S" ? 0xffffff : COL.B, transparent: true, opacity: 0.85 });
    const obj = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
    const arrows = new THREE.InstancedMesh(new THREE.ConeGeometry(0.009, 0.03, 10), new THREE.MeshBasicMaterial({ color: mat.color }), 160);
    arrows.count = 0; obj.visible = arrows.visible = false; scene.add(obj, arrows);
    lineSets.set(s, { obj, arrows, dirty: true });
  }
  function linesDirty(s) { const L = lineSets.get(s); if (L) L.dirty = true; }
  const tq = new THREE.Quaternion(), tm = new THREE.Matrix4(), tp = new THREE.Vector3(), tt = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
  function drawLines(s, fast = false) {
    const L = lineSets.get(s), lines = s.lines(field, fast), seg = [];
    let n = 0;
    for (const p of lines) {
      if (p.length < 6) continue;
      for (let k = 3; k < p.length; k += 3) seg.push(p[k - 3], p[k - 2], p[k - 1], p[k], p[k + 1], p[k + 2]);
      // one arrow per line, a third of the way along
      const i = 3 * Math.max(1, Math.floor(p.length / 9));
      if (n < 160 && i + 2 < p.length) {
        tt.set(p[i] - p[i - 3], p[i + 1] - p[i - 2], p[i + 2] - p[i - 1]).normalize();
        L.arrows.setMatrixAt(n++, tm.compose(tp.set(p[i], p[i + 1], p[i + 2]), tq.setFromUnitVectors(UP, tt), ONE));
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    L.obj.geometry.dispose(); L.obj.geometry = geo; L.arrows.count = n; L.arrows.instanceMatrix.needsUpdate = true;
    L.dirty = fast;
  }
  function setLines(on) { showLines = on; for (const L of lineSets.values()) L.obj.visible = L.arrows.visible = on; }

  // ---------- particles ----------
  const live = [], trails = [];
  const sparkGeo = new THREE.SphereGeometry(0.03, 12, 8), sparks = [];
  const menuState = { particle: "electron", speed: 1, move: "stick" };
  function fire(o, d, type = menuState.particle, speed = SPEEDS[menuState.speed]) {
    if (live.length >= MAX_LIVE) kill(live[0], false);
    const T = PARTICLES[type];
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10), new THREE.MeshBasicMaterial({ color: T.color }));
    const buf = new Float32Array(3 * 4000), geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(buf, 3)); geo.setDrawRange(0, 0);
    const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: T.color }));
    trail.frustumCulled = false; scene.add(mesh, trail);
    const p = { type, qm: T.qm, x: o.x, y: o.y, z: o.z, vx: d.x * speed, vy: d.y * speed, vz: d.z * speed, speed, mesh, trail, buf, n: 0, age: 0,
      alive: true, seen: new Set(), swept: 0, rx: null, spiral: false };
    addTrail(p);
    live.push(p); trails.push(trail);
    while (trails.length > KEEP_TRAILS) { const t = trails.shift(); scene.remove(t); t.geometry.dispose(); }
    log("fire", { particle: type, v: speed, at: [o.x, o.y, o.z].map((v) => +v.toFixed(2)), dir: [d.x, d.y, d.z].map((v) => +v.toFixed(3)) });
  }
  function addTrail(p) {
    if (p.n >= 4000) return;
    const i = 3 * p.n;
    if (p.n && (p.buf[i - 3] - p.x) ** 2 + (p.buf[i - 2] - p.y) ** 2 + (p.buf[i - 1] - p.z) ** 2 < 0.008 * 0.008) return;
    p.buf[i] = p.x; p.buf[i + 1] = p.y; p.buf[i + 2] = p.z; p.n++;
    p.trail.geometry.setDrawRange(0, p.n); p.trail.geometry.attributes.position.needsUpdate = true;
  }
  function kill(p, spark) {
    p.alive = false; scene.remove(p.mesh); p.mesh.geometry.dispose();
    live.splice(live.indexOf(p), 1);
    if (spark) { const s = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: PARTICLES[p.type].color, transparent: true })); s.position.set(p.x, p.y, p.z); s.userData.t = 0; scene.add(s); sparks.push(s); }
  }
  function clearTrails() { while (trails.length) { const t = trails.shift(); scene.remove(t); t.geometry.dispose(); } [...live].forEach((p) => kill(p, false)); }

  /** After each small step: walls, objects, which station the particle is in, rings, orbits. */
  function afterStep(p, x0, y0, z0) {
    if (Math.abs(p.x) > ROOM.x || Math.abs(p.z) > ROOM.z || p.y < 0 || p.y > ROOM.h) { kill(p, true); return; }
    for (const s of stations) if (s.zone && !p.seen.has(s) && (p.x - s.center[0]) ** 2 + (p.y - s.center[1]) ** 2 + (p.z - s.center[2]) ** 2 < s.zone * s.zone) enterZone(p, s);
    for (const s of p.seen) {
      const ch = s.challenges[s.ci];
      if (!ch || s.done[s.ci] || ch.who !== p.type) continue;
      if (ch.ring && crossed(ch.ring, x0, y0, z0, p)) {
        if (ch.angleTo) {
          const b = ch.angleTo(), v = Math.hypot(p.vx, p.vy, p.vz), along = Math.abs(p.vx * b[0] + p.vy * b[1] + p.vz * b[2]) / v;
          if (along > 0.94) { s.msg = "That went straight along *B*: fire it at an angle so that it spirals."; s.board.redraw(); continue; }
        }
        if (ch.spiral && !p.spiral) { s.msg = "Through the ring, but it did not spiral: fire it into the coil at an angle."; s.board.redraw(); continue; }
        win(s, p);
      }
      if (ch.orbit) {
        const rx = p.x - ch.orbit[0], ry = p.y - ch.orbit[1], rz = p.z - ch.orbit[2];
        if (p.rx !== null) {
          const cx = p.ry * rz - p.rz * ry, cy = p.rz * rx - p.rx * rz, cz = p.rx * ry - p.ry * rx;
          p.swept += Math.atan2(Math.hypot(cx, cy, cz), p.rx * rx + p.ry * ry + p.rz * rz);
          if (p.swept >= 2 * Math.PI) win(s, p);
        }
        p.rx = rx; p.ry = ry; p.rz = rz;
      }
    }
    // in the coil: is it moving at an angle to the axis (so it spirals)?
    if (!p.spiral && Math.abs(p.x - CE[0]) < 0.25 && Math.hypot(p.y - CE[1], p.z - CE[2]) < RC) {
      const v = Math.hypot(p.vx, p.vy, p.vz);
      if (Math.hypot(p.vy, p.vz) > 0.3 * v) p.spiral = true;
    }
    const hit = P.hitObject(field, p.x, p.y, p.z);
    if (hit) {
      const sD = D.challenges[D.ci];
      if (p.seen.has(D) && !D.done[D.ci] && (hit.tag === "N" || hit.tag === "S") && sD.who === p.type) {
        if (hit.tag === sD.hit) win(D, p); else { D.msg = `That hit the ${hit.tag === "N" ? "north" : "south"} end.`; D.board.redraw(); }
      }
      kill(p, true);
    }
  }
  function enterZone(p, s) {
    p.seen.add(s);
    const ch = s.challenges[s.ci];
    if (!ch || s.done[s.ci]) return;
    if (ch.who !== p.type) { s.msg = `That was ${PARTICLES[p.type].a}: this challenge needs ${PARTICLES[ch.who].a}.`; s.board.redraw(); return; }
    s.shots[s.ci]++; s.msg = ""; s.board.redraw();
  }
  function crossed(r, x0, y0, z0, p) {
    const n = r.n, c = r.c;
    const s0 = (x0 - c[0]) * n[0] + (y0 - c[1]) * n[1] + (z0 - c[2]) * n[2], s1 = (p.x - c[0]) * n[0] + (p.y - c[1]) * n[1] + (p.z - c[2]) * n[2];
    if (s0 * s1 > 0 || s0 === s1) return false;
    const t = s0 / (s0 - s1), X = x0 + t * (p.x - x0), Y = y0 + t * (p.y - y0), Zc = z0 + t * (p.z - z0);
    return (X - c[0]) ** 2 + (Y - c[1]) ** 2 + (Zc - c[2]) ** 2 < r.r * r.r;
  }
  function win(s, p) {
    if (s.done[s.ci]) return;
    s.done[s.ci] = true; s.msg = "";
    log("challenge done", { station: s.id, n: s.ci + 1, shots: s.shots[s.ci], particle: p.type, v: p.speed });
    showRings(); s.board.redraw();
  }
  function stepParticles(dt) {
    for (const p of [...live]) {
      let t = 0, n = 0;
      while (p.alive && t < dt && n < 500) {
        const h = Math.min(P.stepFor(field, p), dt - t), x0 = p.x, y0 = p.y, z0 = p.z;
        P.boris(p, h, field); t += h; n++; p.age += h;
        afterStep(p, x0, y0, z0);
        if (p.alive) addTrail(p);
      }
      if (!p.alive) continue;
      p.mesh.position.set(p.x, p.y, p.z);
      if (p.age > 30) kill(p, false);
    }
    for (const s of [...sparks]) {
      s.userData.t += dt; s.scale.setScalar(1 + 6 * s.userData.t); s.material.opacity = Math.max(0, 1 - s.userData.t / 0.35);
      if (s.userData.t > 0.35) { scene.remove(s); sparks.splice(sparks.indexOf(s), 1); }
    }
  }

  // ---------- the wrist menu ----------
  const menu = makeBoard(0.3, 0.24, (g, W, H, btn) => {
    const M = 22, bh = 74, gap = 12;
    const row = (title, items, y) => {
      write(g, `**${title}**`, M, y, W, { size: 30, color: INK });
      const bw = (W - 2 * M - gap * (items.length - 1)) / items.length;
      items.forEach((it, i) => btn(it.id, it.label, M + i * (bw + gap), y + 46, bw, bh, { on: it.on, size: 30 }));
      return y + 46 + bh + 18;
    };
    let y = 14;
    y = row("Particle", Object.entries(PARTICLES).map(([k, T]) => ({ id: "p:" + k, label: T.name, on: menuState.particle === k })), y);
    y = row("Speed", SPEEDS.map((v, i) => ({ id: "v:" + i, label: `${v.toFixed(1)} m/s`, on: menuState.speed === i })), y);
    y = row("Field lines", [{ id: "lines:off", label: "Off", on: !showLines }, { id: "lines:on", label: "On", on: showLines }], y);
    y = row("Moving", [{ id: "move:stick", label: "Joystick", on: menuState.move === "stick" }, { id: "move:teleport", label: "Teleport", on: menuState.move === "teleport" }], y);
    btn("clear", "Clear the paths", M, y + 4, W - 2 * M, bh, { size: 30 });
  }, { ppm: 3000, radius: 40 });
  menu.mesh.renderOrder = 2;
  function pressMenu(id) {
    const [k, v] = id.split(":");
    if (k === "p") menuState.particle = v;
    else if (k === "v") menuState.speed = +v;
    else if (k === "lines") setLines(v === "on");
    else if (k === "move") menuState.move = v;
    else if (k === "clear") clearTrails();
    log("menu", { choice: id });
    menu.redraw();
  }

  // ---------- controllers: the gun (right), the probe and the menu (left) ----------
  const ray = new THREE.Raycaster(); ray.far = 8;
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion();
  const gunModel = (() => {
    const g = new THREE.Group(), dark = std(0x2d3340, { roughness: 0.4, metalness: 0.3 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.16, 16), dark); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.06;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 16), std(0x37d6c2, { emissive: 0x0d4f47 })); tip.rotation.x = Math.PI / 2; tip.position.z = -0.14;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.07), dark); body.position.set(0, -0.012, 0.02);
    g.add(barrel, tip, body);
    return g;
  })();
  const probeModel = (() => {
    const g = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.1, 8), std(0x9aa0ad)); rod.rotation.x = Math.PI / 2; rod.position.z = -0.05;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 10), std(0xffffff, { emissive: 0x444444 })); ball.position.z = -0.1;
    g.add(rod, ball);
    return g;
  })();
  const probeE = arrow(COL.E, 0.005), probeB = arrow(COL.B, 0.005);
  const probeELb = sprite("*E*", 0.035, { color: "#9a5b00" }), probeBLb = sprite("*B*", 0.035, { color: "#0a6c94" });
  [probeE, probeB, probeELb, probeBLb].forEach((o) => { o.visible = false; scene.add(o); });
  menu.mesh.position.set(0, 0.07, 0.06); menu.mesh.rotation.x = -0.95;

  const ctrls = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
    beam.visible = false; c.add(beam);
    c.userData = { beam, hand: null, source: null, drag: null };
    c.addEventListener("connected", (e) => {
      c.userData.source = e.data; c.userData.hand = e.data.handedness;
      beam.visible = e.data.targetRayMode === "tracked-pointer" || !!e.data.hand;
      assignTools();
    });
    c.addEventListener("disconnected", () => { c.userData.source = null; c.userData.hand = null; beam.visible = false; endDrag(c); assignTools(); });
    c.addEventListener("selectstart", () => select(c));
    c.addEventListener("selectend", () => endDrag(c));
    rig.add(c);
    return c;
  });
  let gunCtrl = null, probeCtrl = null;
  /** The gun goes on the right hand and the probe and menu on the left; with one hand, that hand has the gun. */
  function assignTools() {
    const on = ctrls.filter((c) => c.userData.source);
    gunCtrl = on.find((c) => c.userData.hand === "right") || on.find((c) => c.userData.hand !== "left") || on[0] || null;
    probeCtrl = on.find((c) => c !== gunCtrl) || null;
    ctrls.forEach((c) => { c.remove(gunModel); c.remove(probeModel); c.remove(menu.mesh); });
    if (gunCtrl) gunCtrl.add(gunModel);
    const i = pickables.indexOf(menu.mesh);
    if (probeCtrl) { probeCtrl.add(probeModel, menu.mesh); if (i < 0) pickables.push(menu.mesh); }
    else if (i >= 0) pickables.splice(i, 1);   // no left hand: no menu to point at
  }
  function aim(c) {
    c.updateMatrixWorld(true);
    tmpM.identity().extractRotation(c.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(c.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  }
  /** What the controller points at that it can use: a button, a shelf object or an object on the table. */
  function pointAt(c) {
    aim(c);
    const hits = ray.intersectObjects(pickables, false).filter((h) => !(c === probeCtrl && h.object === menu.mesh));
    return hits.find((h) => h.object.userData.kind) || null;
  }
  function select(c) {
    const hit = pointAt(c), u = hit && hit.object.userData;
    if (u && u.kind === "board") {
      const id = u.board.at(hit.uv);
      if (!id) return;
      if (u.board === menu) pressMenu(id);
      else if (u.board === help) { if (id.startsWith("go:")) { log("go", { to: id.slice(3) }); goInVR(`/${id.slice(3)}/`); } }
      else { const s = stations.find((s) => s.board === u.board); if (s) pressStation(s, id); }
      return;
    }
    if (u && (u.kind === "spawn" || u.kind === "tableobj")) {
      let o = u.o;
      if (u.kind === "spawn") {
        if (table.length >= MAX_TABLE) { S.msg = ""; flash(`At most ${MAX_TABLE} objects on the table.`); return; }
        o = addTableObj(u.objKind, u.g.position.clone());
        u.g.scale.setScalar(0.01); u.g.userData.grow = 0;
      }
      const cq = c.getWorldQuaternion(new THREE.Quaternion());
      c.userData.drag = { o, dist: hit.distance, qc0: cq.invert(), q0: o.g.quaternion.clone(), isNew: u.kind === "spawn" };
      return;
    }
    if (c === gunCtrl) {
      aim(c);
      const o = ray.ray.origin.clone().addScaledVector(ray.ray.direction, 0.15);
      fire(o, ray.ray.direction.clone());
    }
  }
  function endDrag(c) {
    const d = c.userData.drag; if (!d) return;
    c.userData.drag = null;
    const p = d.o.g.position;
    if (!onTable(p)) { removeTableObj(d.o); if (!d.isNew) log("put away", { kind: d.o.kind }); return; }
    p.y = Math.max(p.y, TBL.top + 0.06);
    fieldDirty(); linesDirty(S); S.board.redraw();
    log(d.isNew ? "add" : "move", { kind: d.o.kind, at: p.toArray().map((v) => +v.toFixed(2)) });
  }
  function followDrag(c) {
    const d = c.userData.drag; if (!d) return;
    aim(c);
    d.o.g.position.copy(ray.ray.origin).addScaledVector(ray.ray.direction, d.dist);
    if (d.o.kind === "magnet" || d.o.kind === "coil") d.o.g.quaternion.copy(c.getWorldQuaternion(tmpQ).multiply(d.qc0).multiply(d.q0));
    fieldDirty();
  }

  // ---------- moving: walking, the joystick or teleporting, and turning ----------
  const head = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let turnReady = true, telAim = false, comfort = 0;
  const telLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7fe3ff }));
  const telMark = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 40), new THREE.MeshBasicMaterial({ color: 0x7fe3ff, side: THREE.DoubleSide }));
  telMark.rotation.x = -Math.PI / 2; telLine.visible = telMark.visible = false; telLine.frustumCulled = false; scene.add(telLine, telMark);
  const telTarget = new THREE.Vector3();
  const stick = (c) => {
    const gp = c && c.userData.source && c.userData.source.gamepad;
    if (!gp || !gp.axes) return [0, 0];
    return gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
  };
  /** Keep the head inside the room: if the joystick would take it through a wall, move the rig back. */
  function keepInside() {
    camera.getWorldPosition(head);
    const mx = ROOM.x - 0.25, mz = ROOM.z - 0.25;
    const dx = Math.max(-mx - head.x, 0) - Math.max(head.x - mx, 0), dz = Math.max(-mz - head.z, 0) - Math.max(head.z - mz, 0);
    rig.position.x += dx; rig.position.z += dz;
  }
  function locomotion(dt) {
    const L = stick(probeCtrl || ctrls.find((c) => c.userData.hand === "left")), R = stick(gunCtrl);
    let moving = false;
    camera.getWorldPosition(head); camera.getWorldDirection(fwd); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize(); right.crossVectors(fwd, UP);
    if (menuState.move === "stick") {
      const mag = Math.hypot(L[0], L[1]);
      if (mag > 0.2) {
        const k = (MOVE_SPEED * dt * Math.min(1, (mag - 0.2) / 0.6)) / mag;   // a steady pace, no speeding up
        rig.position.addScaledVector(fwd, -L[1] * k).addScaledVector(right, L[0] * k);
        moving = true; keepInside();
      }
    } else {
      const src = probeCtrl || gunCtrl;
      if (src && L[1] < -0.6) { telAim = true; aimTeleport(src); }
      else if (telAim && L[1] > -0.3) {
        telAim = false; telLine.visible = telMark.visible = false;
        if (telMark.userData.ok) {
          camera.getWorldPosition(head);
          rig.position.x += telTarget.x - head.x; rig.position.z += telTarget.z - head.z;
          log("teleport", { to: [telTarget.x, telTarget.z].map((v) => +v.toFixed(2)) });
        }
      }
    }
    // turn in 30° steps about the head
    if (Math.abs(R[0]) > 0.7 && turnReady) {
      turnReady = false;
      const a = R[0] > 0 ? -SNAP : SNAP;
      camera.getWorldPosition(head);
      rig.position.sub(head).applyAxisAngle(UP, a).add(head); rig.rotation.y += a;
      comfort = Math.max(comfort, 0.6);
    } else if (Math.abs(R[0]) < 0.3) turnReady = true;
    comfort = moving ? Math.min(1, comfort + dt * 6) : Math.max(0, comfort - dt * 4);
    rig.updateMatrixWorld(true);
  }
  /** The teleport arc: a thrown line from the hand; where it lands on the floor is where you go. */
  function aimTeleport(c) {
    aim(c);
    const o = ray.ray.origin, v = ray.ray.direction.clone().multiplyScalar(6), pts = [];
    let land = null;
    for (let i = 0; i < 60; i++) {
      const t = i * 0.03, p = new THREE.Vector3(o.x + v.x * t, o.y + v.y * t - 4.9 * t * t, o.z + v.z * t);
      if (p.y <= 0) { land = p.setY(0.01); pts.push(land); break; }
      pts.push(p);
    }
    telLine.geometry.dispose(); telLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    const ok = !!land && Math.abs(land.x) < ROOM.x - 0.3 && Math.abs(land.z) < ROOM.z - 0.3;
    telMark.userData.ok = ok; telLine.visible = true; telMark.visible = !!land;
    if (land) { telMark.position.copy(land); telTarget.copy(land); }
    telMark.material.color.setHex(ok ? 0x7fe3ff : 0xff6a5c); telLine.material.color.setHex(ok ? 0x7fe3ff : 0xff6a5c);
  }
  // the comfort ring: while the joystick moves you, the edges of the view darken (this keeps most people from feeling sick)
  const vignette = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const g = cv.getContext("2d"), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.3, "rgba(0,0,0,0)"); gr.addColorStop(0.75, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    m.renderOrder = 10; m.frustumCulled = false; m.visible = false; scene.add(m);
    return m;
  })();
  function placeVignette() {
    vignette.visible = comfort > 0.01;
    if (!vignette.visible) return;
    camera.getWorldPosition(head); camera.getWorldQuaternion(tmpQ);
    vignette.position.copy(head).add(new THREE.Vector3(0, 0, -0.4).applyQuaternion(tmpQ)); vignette.quaternion.copy(tmpQ);
    vignette.material.opacity = 0.92 * comfort;
  }

  // ---------- the probe, the beams and hover ----------
  const Ef = [0, 0, 0], Bf = [0, 0, 0], tipP = new THREE.Vector3();
  function updateProbe() {
    const show = !!probeCtrl;
    [probeE, probeB, probeELb, probeBLb].forEach((o) => { o.visible = show; });
    if (!show) return;
    probeCtrl.updateMatrixWorld(true);
    tipP.set(0, 0, -0.1).applyMatrix4(probeCtrl.matrixWorld);
    P.fieldAt(field, tipP.x, tipP.y, tipP.z, Ef, Bf);
    for (const [a, lb, F] of [[probeE, probeELb, Ef], [probeB, probeBLb, Bf]]) {
      const m = Math.hypot(F[0], F[1], F[2]);
      if (m < 0.03) { a.visible = lb.visible = false; continue; }
      const L = 0.22 * (1 - Math.exp(-m / 1.2)) + 0.02;
      a.position.copy(tipP); a.point(tt.set(F[0] / m, F[1] / m, F[2] / m)); a.setLen(L);
      lb.position.copy(tipP).addScaledVector(tt, L + 0.03);
    }
  }
  let hoverBoard = null;
  function updateBeams() {
    let hov = null;
    for (const c of ctrls) {
      if (!c.userData.source) continue;
      const hit = pointAt(c), len = hit ? hit.distance : c === gunCtrl ? 0.6 : 0.3;
      c.userData.beam.scale.z = len;
      c.userData.beam.material.opacity = hit ? 0.9 : 0.35;
      if (hit && hit.object.userData.kind === "board" && !hov) hov = { board: hit.object.userData.board, id: hit.object.userData.board.at(hit.uv) };
    }
    if (hoverBoard && (!hov || hov.board !== hoverBoard)) hoverBoard.setHover(null);
    if (hov) hov.board.setHover(hov.id);
    hoverBoard = hov ? hov.board : null;
  }

  // ---------- VR ----------
  const supported = navigator.xr ? navigator.xr.isSessionSupported("immersive-vr").catch(() => false) : Promise.resolve(false);
  const XR_OPTIONS = { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"] };
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
      ? `<p><b>Clear a space in the classroom, put the headset on, then start.</b> You can walk around the lab, or move with the left stick.</p><button type="button" class="btn v3-enter">Start VR</button>`
      : `<p><b>This browser cannot open VR.</b> Open vr.phylab.uk/lab/ in the browser of a VR headset (for example Meta Quest). Below is a preview of the lab from above: drag to turn it.</p>`;
    note.hidden = false;
    const b = note.querySelector(".v3-enter");
    if (b) b.addEventListener("click", () => enter());
    if (!ok) return;
    if (await sessionGranted()) enter("handed on"); else offer();
  });
  renderer.xr.addEventListener("sessionstart", () => {
    controls.enabled = false; ceiling.visible = true;
    camera.position.set(0, 0, 0); camera.quaternion.identity();
    rig.position.set(START.x, 0, START.z); rig.rotation.set(0, 0, 0);
  });
  renderer.xr.addEventListener("sessionend", () => {
    ctrls.forEach(endDrag);
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); ceiling.visible = false; comfort = 0;
    controls.enabled = true; resetView(); log("exit"); offer();
  });

  // ---------- size and the frame loop ----------
  function resize() {
    if (renderer.xr.isPresenting) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage); resize();
  root.querySelector(".v3-view").addEventListener("click", resetView);

  let lineClock = 0;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), xr = renderer.xr.isPresenting;
    if (xr) {
      locomotion(dt);
      renderer.xr.updateCamera(camera);       // the head as it is now, after moving the rig
      placeVignette();
      ctrls.forEach(followDrag);
    } else controls.update();
    if (needField) rebuildField();
    stepParticles(dt);
    for (const s of spawners) if (s.g.userData.grow !== undefined && s.g.userData.grow < 1) { s.g.userData.grow = Math.min(1, s.g.userData.grow + dt / 0.35); s.g.scale.setScalar(Math.max(0.01, s.g.userData.grow)); }
    if (showLines) {
      // at most one set of lines per frame, so a frame is never long; while dragging on the table, fewer lines, 4 times a second
      lineClock += dt;
      const dragging = ctrls.some((c) => c.userData.drag);
      for (const [s, L] of lineSets) if (L.dirty && (s !== S || !dragging || lineClock > 0.25)) { if (s === S && dragging) lineClock = 0; drawLines(s, s === S && dragging); break; }
    }
    if (xr) { updateProbe(); updateBeams(); }
    renderer.render(scene, camera);
  });

  // for checking: /lab/?debuglab exposes the lab in the console
  if (new URLSearchParams(location.search).has("debuglab"))
    window.lab = { fire: (o, d, type, v) => fire(v3(o), v3(d).normalize(), type, v), stations, live, setLines, P, get field() { return field; }, camera, controls, addTableObj: (k, p) => { const o = addTableObj(k, v3(p)); fieldDirty(); linesDirty(S); return o; }, step: stepParticles };
}
