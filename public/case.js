// vr.phylab.uk — The fallen flowerpot (/case/): a physics case to solve.
// A courtyard in front of a ten-storey block of flats. A flowerpot has fallen from one of the balconies and broken
// on the ground. Nothing in the scene says what to measure: the clues are things to notice —
//   the broken pot and its soil (thrown forward, so the pot was moving sideways when it landed),
//   a dark wet line on the ground right below the balcony edges (where rain drips: the place to measure from),
//   fresh leaves under the tree and, up in the tree, a freshly broken branch with soil on it,
//   the bands on the wall at every floor, and the pots standing on the balcony rails.
// Three balconies in the same column have a gap in their row of pots. Only the physics (horizontal launch, so the
// drop is proportional to the square of the horizontal distance) tells which one it was.
// Tools: a laser rangefinder in the right hand, a tape measure in the left, a radio on the chest (grip: lift it to talk).
// Control speaks over the radio: first a short check of the controls (walk to a cone, turn, jump, measure the car and a
// bench, answer on the radio), then the case; at the end you report the floor on the radio. The intercom beside the
// door calls the flats of the middle column (recorded voices). Through the glass doors is the lobby and the lift: walk
// in, press a floor on the panel by the door, the doors close, the car rides up, the doors open into the hall of that
// flat, and its balcony door is open. The lift (at the door of the building)
// takes you up to any balcony of that column. There the pot on the rail is the check: point at it and hold the trigger
// to push harder and harder (the speed shows above it), let go to push it off; or push it off with the controller itself.
// Each visit is a new case (floor height, rail height, floor, speed and branch all change); its number is on the
// boards, and /case/?case=1234 opens that case again. /case/?case=1234&answer shows the answer (in the preview only).
// Models and textures: Poly Haven (CC0). Everything that carries a measurement is built here from the case numbers.
import * as THREE from "/vendor/three/three.min.js";
import { GLTFLoader, HDRLoader, MeshoptDecoder } from "/vendor/three/addons.min.js";
import { sessionGranted, goInVR } from "/xr-nav.js";
import { makeBoard, write, INK, SOFT, ACCENT } from "/lab-text.js";
const { OrbitControls } = THREE;

const AS = "/case/assets/";
const G = 9.8;
const NF = 10;                       // floors
const DEPTH = 1.3;                   // how far a balcony sticks out from the wall
const COLS = [-9.6, -4.8, 0, 4.8, 9.6];
const BW = 3.2;                      // balcony width
const LEDGE = 0.2;                   // the flat top of the balcony rail, where pots stand
const EDGE = DEPTH + 0.05;           // the outer edge of that ledge: where a pushed pot leaves it, right above the wet line
const YARD = { x0: -13, x1: 13, z0: 0.35, z1: 21 };
const START = { x: -2.6, z: 13.5 };
const DOOR_W = 1.2, DOOR_H = 2.2;    // the doorway in the middle column, on every floor
const ROOM_D = 1.9;                  // the room behind it, between the doorway and the lift
const CAR = { x: 0.65, z0: -3.4, z1: -1.95, h: 2.3, door: 0.45 };   // the lift car: half-width, back, front, height, half the door
const MOVE_SPEED = 1.5, SNAP = Math.PI / 6;
const UP = new THREE.Vector3(0, 1, 0);

// ---------- the case: every number comes from one seed ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function makeCase(seed) {
  const R = rng(seed), pick = (a) => a[Math.floor(R() * a.length)];
  const h = pick([2.8, 2.9, 3.0, 3.1]);          // floor to floor
  const rail = pick([1.0, 1.05, 1.1]);           // balcony floor to the top of the rail
  const floor = 4 + Math.floor(R() * 6);         // 4 … 9
  const H = (floor - 1) * h + rail;              // the bottom of the pot above the ground
  const v0 = Math.round((2.6 + R() * 1.2) * 100) / 100;
  const t = Math.sqrt((2 * H) / G), d = v0 * t;
  const yb = 4.6 + R() * Math.max(0.4, Math.min(3, H - 8));   // where the pot broke the branch
  const xb = d * Math.sqrt(1 - yb / H);
  const others = [];
  for (let n = 3; n <= NF; n++) if (Math.abs(n - floor) >= 2) others.push(n);
  const decoys = [];
  while (decoys.length < 2) { const n = pick(others); if (decoys.every((m) => Math.abs(m - n) >= 2)) decoys.push(n); }
  const suspects = [floor, ...decoys].sort((a, b) => a - b);
  return { seed, h, rail, floor, H, v0, t, d, yb, xb, suspects, R };
}

export function startCase(root, { rec } = {}) {
  const qs = new URLSearchParams(location.search);
  const seed = qs.has("case") ? (parseInt(qs.get("case"), 10) || 1) : 1000 + Math.floor(Math.random() * 9000);
  const C = makeCase(seed), R = C.R;
  const log = (action, d = {}) => rec && rec.event("case", { action, case: seed, ...d });
  const rnd = (a, b) => a + R() * (b - a);

  root.classList.add("v3");
  root.innerHTML = `
    <div class="v3-note"><p>Loading the scene (about 7 MB)…</p></div>
    <div class="v3-stage"><p class="v3-flash" hidden></p></div>
    <div class="v3-bar">
      <p class="v3-hint">Case ${seed}. A preview of the courtyard: drag to turn it, scroll to zoom. In a headset you walk around in it.</p>
      <div class="v3-tools"><button type="button" class="btn ghost v3-view">Reset view</button></div>
    </div>`;
  const stage = root.querySelector(".v3-stage"), note = root.querySelector(".v3-note"), flashEl = root.querySelector(".v3-flash");
  function flash(msg) { flashEl.textContent = msg; flashEl.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { flashEl.hidden = true; }, 2500); }

  // ---------- renderer and camera rig ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType("local-floor"); renderer.xr.cameraAutoUpdate = false;
  renderer.xr.setFoveation(0.5);
  stage.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb9c0c6);
  const rig = new THREE.Group(); scene.add(rig);
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.03, 400); rig.add(camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 2; controls.maxDistance = 60;
  const resetView = () => { camera.position.set(-9, 13, 26); controls.target.set(0, 6, 3); controls.update(); };
  resetView();
  const sun = new THREE.DirectionalLight(0xfff4e6, 0.9);
  sun.position.set(-14, 30, 22); sun.target.position.set(0, 0, 6); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 26, bottom: -14, near: 5, far: 80 });

  // ---------- loading ----------
  const gltf = new GLTFLoader(); gltf.setMeshoptDecoder(MeshoptDecoder);
  const texL = new THREE.TextureLoader();
  const MODELS = ["tree", "planter_pot_clay", "potted_plant_04", "exterior_aircon_unit", "wooden_broom", "metal_trash_can", "covered_car", "shrub_04", "plastic_crate_01"];
  const TEX = ["beige_wall_001", "concrete_pavers_02", "brown_mud_02", "bark_platanus", "concrete_floor_02"];
  const M = {}, T = {};
  const loadTex = (name) => Promise.all(["diff", "nor", "arm"].map((k) => texL.loadAsync(`${AS}tex/${name}_${k}.webp`))).then(([d, n, a]) => {
    d.colorSpace = THREE.SRGBColorSpace;
    for (const x of [d, n, a]) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 8; }
    T[name] = { d, n, a };
  });
  Promise.all([
    ...MODELS.map((m) => gltf.loadAsync(`${AS}${m}.glb`).then((g) => { M[m] = g.scene; })),
    ...TEX.map(loadTex),
    new HDRLoader().loadAsync(`${AS}sky.hdr`).then((hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromEquirectangular(hdr).texture; scene.environmentIntensity = 0.9;
      scene.background = hdr; scene.backgroundBlurriness = 0.02; scene.backgroundIntensity = 0.9;
    }),
  ]).then(build).catch((err) => { note.innerHTML = `<p>The scene could not load (${err.message || err}). Reload the page to try again.</p>`; console.error(err); });

  /** A material from one of the tiled textures; rx, ry: how many times it repeats (a clone, so each can tile its own way). */
  function tiled(name, rx = 1, ry = 1, o = {}) {
    const t = T[name], c = (x) => { const y = x.clone(); y.repeat.set(rx, ry); y.needsUpdate = true; return y; };
    const arm = c(t.a);
    return new THREE.MeshStandardMaterial({ map: c(t.d), normalMap: c(t.n), roughnessMap: arm, aoMap: arm, metalnessMap: arm, metalness: 1, roughness: 1, ...o });
  }
  const plain = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  const shadow = (o, cast = true, receive = true) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } }); return o; };
  function place(name, x, y, z, ry = 0, s = 1) { const o = M[name].clone(true); o.position.set(x, y, z); o.rotation.y = ry; o.scale.setScalar(s); scene.add(shadow(o)); return o; }

  // things the tools can measure to, and boards the hands can press
  const measurable = [], pickables = [];
  const mark = (o) => { measurable.push(o); return o; };

  let S = null;   // set once the scene is built
  function build() {
    note.hidden = true;
    S = {};
    // ---------- the ground ----------
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), tiled("concrete_pavers_02", 40, 40, { metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(mark(ground));

    // ---------- the block of flats (the facade is the plane z = 0, the building behind it) ----------
    S.main = building({ x: 0, z: 0, ry: 0, width: 28, floors: NF, h: C.h, rail: C.rail, cols: COLS, main: true });
    // the other blocks round the courtyard, close enough that it is closed in on all sides
    building({ x: 0, z: 26, ry: Math.PI, width: 32, floors: 8, h: 2.95, rail: 1.05, cols: [-12, -6, 0, 6, 12] });
    building({ x: -15.2, z: 12.5, ry: Math.PI / 2, width: 27, floors: 7, h: 3.0, rail: 1.05, cols: [-8, 0, 8] });
    building({ x: 15.2, z: 12.5, ry: -Math.PI / 2, width: 27, floors: 9, h: 2.9, rail: 1.05, cols: [-8, 0, 8] });

    crimeScene();
    theTree();
    props();
    tools();
    buildRoom(); buildCar(); intercom(); buildRadio(); tutorialProps(); pushTest();
    goTo(1);
    renderer.shadowMap.needsUpdate = true;
    if (qs.has("answer")) answerBoard();
    readyVR();
  }

  /**
   * A block of flats facing +z in its own frame (front wall at local z = 0), placed at (x, z) and turned by ry.
   * Balconies in columns `cols` on floors 2 and up, a horizontal band on the wall at every floor level, windows between.
   */
  function building({ x, z, ry, width, floors, h, rail, cols, main = false }) {
    const B = new THREE.Group(); B.position.set(x, 0, z); B.rotation.y = ry; scene.add(B);
    const top = floors * h + 0.9;
    const wallM = tiled("beige_wall_001", width / 2.5, top / 2.5, { metalness: 0 });
    if (!main) {
      const front = new THREE.Mesh(new THREE.PlaneGeometry(width, top), wallM);
      front.position.set(0, top / 2, 0); front.receiveShadow = true; B.add(front);
    } else {
      // the main block's wall has a doorway in the middle column on every floor (the entrance below, a balcony door
      // above), each closed by sliding glass doors, so the wall is built in pieces round them
      const wm = tiled("beige_wall_001", 1 / 2.5, 1 / 2.5, { metalness: 0 });
      const piece = (x0, x1, y0, y1) => {
        if (x1 - x0 < 0.001 || y1 - y0 < 0.001) return;
        const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0), uv = g.attributes.uv, P = g.attributes.position;
        for (let i = 0; i < P.count; i++) uv.setXY(i, P.getX(i) + (x0 + x1) / 2, P.getY(i) + (y0 + y1) / 2);
        const m = new THREE.Mesh(g, wm); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); m.receiveShadow = true; B.add(mark(m));
      };
      piece(-width / 2, -DOOR_W / 2, 0, top); piece(DOOR_W / 2, width / 2, 0, top);
      for (let n = 1; n <= floors; n++) piece(-DOOR_W / 2, DOOR_W / 2, (n - 1) * h + DOOR_H, n < floors ? n * h : top);
    }
    // the block behind the wall (for the main block, with no front face: the wall pieces are its front)
    const bodyM = wallM.clone();
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, top, 12), main ? [bodyM, bodyM, bodyM, bodyM, new THREE.MeshBasicMaterial({ visible: false }), bodyM] : bodyM);
    body.position.set(0, top / 2, -6.01); body.castShadow = true; B.add(body);
    // roof edge
    const cap = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.25, 0.35), plain(0x9d978c)); cap.position.set(0, top, 0.05); B.add(cap);
    // bands at each floor level
    const bandM = plain(0xc9c0b0, { roughness: 0.9 });
    const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(width, 0.14, 0.06), bandM, floors);
    const m4 = new THREE.Matrix4();
    for (let n = 1; n <= floors; n++) { m4.makeTranslation(0, (n - 1) * h + (n === 1 ? 0.07 : 0), 0.03); bands.setMatrixAt(n - 1, m4); }
    B.add(bands); if (main) mark(bands);
    // windows between the balcony columns (two per gap), and glass doors at the back of each balcony
    const winX = [];
    const edges = [-width / 2, ...cols.map((c) => [c - BW / 2, c + BW / 2]).flat(), width / 2];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1], gap = b - a;
      if (gap < 1.6) continue;
      const k = Math.max(1, Math.floor(gap / 2.4));
      for (let j = 0; j < k; j++) winX.push(a + (gap * (j + 0.5)) / k);
    }
    const glassM = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.06, envMapIntensity: 1.0 });
    const frameM = plain(0xd8d6d0, { roughness: 0.5 });
    const nWin = winX.length * floors, nDoor = cols.length * (floors - 1);
    const glass = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.04), glassM, nWin + nDoor);
    const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.05), frameM, nWin + nDoor);
    let gi = 0;
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const put = (mesh, i, px, py, pz, sx, sy, sz) => { ps.set(px, py, pz); sc.set(sx, sy, sz); m4.compose(ps, q, sc); mesh.setMatrixAt(i, m4); };
    for (let n = 1; n <= floors; n++) {
      const y0 = (n - 1) * h;
      for (const wx of winX) {
        put(frame, gi, wx, y0 + 1.55, 0.01, 1.62, 1.52, 1); put(glass, gi, wx, y0 + 1.55, 0.03, 1.5, 1.4, 1); gi++;
      }
    }
    for (let n = 2; n <= floors; n++) for (const cx of cols) {
      if (main && cx === 0) continue;   // the middle column's doors open: built in columnDoors()
      const y0 = (n - 1) * h + 0.15;
      put(frame, gi, cx, y0 + 1.1, 0.01, 2.5, 2.25, 1); put(glass, gi, cx, y0 + 1.1, 0.03, 2.38, 2.13, 1); gi++;
    }
    glass.count = frame.count = gi;
    // each window a little different: some with curtains, some darker
    const tint = new THREE.Color(), tints = [0x56636c, 0x4b5862, 0x6b6f66, 0x7a6a5a, 0x5d6870, 0x8a8478];
    for (let i = 0; i < gi; i++) glass.setColorAt(i, tint.setHex(tints[Math.floor(R() * tints.length)]));
    B.add(frame, glass);
    // balconies: a slab, a low wall up to a flat ledge at rail height, and the railing bars between
    const slabM = tiled("concrete_floor_02", 1.5, 0.6, { metalness: 0 });
    const nb = cols.length * (floors - 1);
    const slab = new THREE.InstancedMesh(new THREE.BoxGeometry(BW, 0.15, DEPTH), slabM, nb);
    const ledgeM = tiled("concrete_floor_02", 1.2, 0.15, { metalness: 0, color: 0xcfc9bd });
    const ledgeF = new THREE.InstancedMesh(new THREE.BoxGeometry(BW + LEDGE, 0.06, LEDGE), ledgeM, nb);
    const ledgeS = new THREE.InstancedMesh(new THREE.BoxGeometry(LEDGE, 0.06, DEPTH), ledgeM, nb * 2);
    const barG = new THREE.CylinderGeometry(0.012, 0.012, 1, 6), barM = plain(0x4b4f52, { roughness: 0.45, metalness: 0.6 });
    const perFront = Math.floor(BW / 0.12), perSide = Math.floor(DEPTH / 0.12);
    const bars = new THREE.InstancedMesh(barG, barM, nb * (perFront + 2 * perSide));
    let bi = 0, si = 0, li = 0;
    for (let n = 2; n <= floors; n++) for (const cx of cols) {
      const y0 = (n - 1) * h, yt = y0 + rail;
      put(slab, si++, cx, y0 + 0.075 - 0.15, DEPTH / 2, 1, 1, 1);
      put(ledgeF, li, cx, yt - 0.03, DEPTH - LEDGE / 2 + 0.05, 1, 1, 1);
      put(ledgeS, 2 * li, cx - BW / 2, yt - 0.03, DEPTH / 2, 1, 1, 1); put(ledgeS, 2 * li + 1, cx + BW / 2, yt - 0.03, DEPTH / 2, 1, 1, 1); li++;
      const bh = rail - 0.06;
      for (let k = 0; k < perFront; k++) put(bars, bi++, cx - BW / 2 + (k + 0.5) * (BW / perFront), y0 + bh / 2, DEPTH - 0.06, 1, bh, 1);
      for (const sx of [-1, 1]) for (let k = 0; k < perSide; k++) put(bars, bi++, cx + (sx * BW) / 2, y0 + bh / 2, (k + 0.5) * (DEPTH / perSide), 1, bh, 1);
    }
    for (const o of [slab, ledgeF, ledgeS, bars]) { o.castShadow = true; o.receiveShadow = true; B.add(o); if (main && o !== bars) mark(o); }
    for (const o of [frame, glass]) o.receiveShadow = true;
    if (main) {
      columnDoors(B, floors, h, glassM, frameM);
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.6), plain(0x9a958b)); step.position.set(0, 0.03, 0.3); step.receiveShadow = true; B.add(step);
    }
    // the dark line where rain drips off each balcony ledge (the clue for where to measure from)
    if (main) for (const cx of cols) {
      const s = drip(BW + 0.15); s.position.set(cx, 0.004, EDGE); B.add(s);
    }
    // air conditioners on the wall and life on the balconies of the other columns
    if (main) {
      for (let n = 1; n <= floors; n++) for (const wx of winX) if (R() < 0.28) {
        const o = M.exterior_aircon_unit.clone(true); o.scale.setScalar(0.5); o.position.set(wx + 0.95, (n - 1) * h + 0.55, 0.12); B.add(shadow(o));
        const dr = drip(0.25, 0.2); dr.position.set(x + wx + 0.95, 0.004, 0.45); scene.add(dr);
      }
      for (let n = 2; n <= floors; n++) for (const cx of cols) if (cx !== 0 && R() < 0.35) potsRow(B, cx, (n - 1) * h + rail, R() < 0.5 ? 3 : 2);
    }
    return B;
  }

  /** A soft dark strip on the ground: wet from water dripping off the edge above. */
  let dripTex = null;
  function drip(w, d = 0.3) {
    if (!dripTex) {
      const cv = document.createElement("canvas"); cv.width = 512; cv.height = 64;
      const g = cv.getContext("2d");
      const gr = g.createLinearGradient(0, 0, 0, 64); g.fillStyle = "#000"; g.fillRect(0, 0, 512, 64);
      gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, 512, 64);
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; g.beginPath(); g.arc(Math.random() * 512, Math.random() * 64, 2 + Math.random() * 8, 0, 7); g.fill(); }
      dripTex = new THREE.CanvasTexture(cv);
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0x15181a, alphaMap: dripTex, transparent: true, opacity: 0.5, roughness: 0.25, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    return m;
  }

  /** Pots standing on a balcony ledge (top at yTop), along a balcony in column cx; `skip`: x of a gap left empty. */
  function potsRow(parent, cx, yTop, n, skip = null, stain = false) {
    const xs = n === 2 ? [-0.9, 0.9] : n === 3 ? [-1.1, 0, 1.1] : [-1.25, -0.62, 0, 0.62, 1.25];
    const made = [];
    for (const dx of xs) {
      if (skip !== null && Math.abs(dx - skip) < 0.01) {
        if (stain) { const r = ring(); r.position.set(cx + dx, yTop + 0.002, DEPTH - LEDGE / 2 + 0.05); parent.add(r); }
        continue;
      }
      const o = pot(R() < 0.5); o.position.set(cx + dx, yTop, DEPTH - LEDGE / 2 + 0.05); o.rotation.y = R() * 6.28; parent.add(o); made.push(o);
    }
    return made;
  }
  /** A clay pot with a plant in it. */
  function pot(withPlant = true) {
    const g = new THREE.Group();
    const p = M.planter_pot_clay.clone(true); p.scale.setScalar(0.95); g.add(p);
    if (!pot.soilM) pot.soilM = tiled("brown_mud_02", 0.2, 0.2, { metalness: 0 });
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.118, 20), pot.soilM); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.19; g.add(soil);
    if (withPlant) { const pl = M.potted_plant_04.clone(true); pl.scale.setScalar(1.0); pl.position.y = 0.035; g.add(pl); }
    else { const sh = M.shrub_04.clone(true); sh.scale.setScalar(0.9); sh.position.set(-0.22, 0.18, 0); g.add(sh); }
    return shadow(g);
  }
  /** The ring of dirt a pot leaves where it stood for a long time. */
  function ring() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g = cv.getContext("2d"), gr = g.createRadialGradient(64, 64, 30, 64, 64, 60);
    g.fillStyle = "#000"; g.fillRect(0, 0, 128, 128);
    gr.addColorStop(0, "rgba(255,255,255,0.2)"); gr.addColorStop(0.75, "rgba(255,255,255,0.9)"); gr.addColorStop(0.88, "rgba(255,255,255,0.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.27), new THREE.MeshStandardMaterial({ color: 0x3b2c20, alphaMap: new THREE.CanvasTexture(cv), transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  // ---------- the column the pot fell from: pots on every balcony, a gap on three of them ----------
  const railTop = (n) => (n - 1) * C.h + C.rail;

  function crimeScene() {
    S.restPots = {}; S.decor = {};
    for (let n = 2; n <= NF; n++) {
      const sus = C.suspects.includes(n);
      if (!sus && R() < 0.25) continue;                      // some balconies have no pots at all
      const made = potsRow(S.main, 0, railTop(n), 5, sus ? 0 : null, sus);
      if (!sus) S.restPots[n] = made.find((o) => Math.abs(o.position.x) < 0.01);
      // a little life on the suspects' balconies (the same kinds of things on all three, at random)
      if (sus) {
        const y0 = (n - 1) * C.h, k = Math.floor(R() * 3); S.decor[n] = k;
        if (k === 0) { const b = M.wooden_broom.clone(true); b.position.set(1.2, y0 + 0.12, 0.25); b.rotation.set(0.12, R() * 3, 0); S.main.add(shadow(b)); }
        else if (k === 1) { const c = M.plastic_crate_01.clone(true); c.position.set(-1.1, y0, 0.45); c.rotation.y = R(); S.main.add(shadow(c)); }
        else { const p = pot(false); p.position.set(1.15, y0, 0.4); S.main.add(p); }
      }
    }
    // the broken pot: it left the ledge's outer edge (z = EDGE) and its bottom hit the ground d further out
    const zL = EDGE + C.d;
    S.landing = new THREE.Vector3(0, 0, zL);
    const potMat = (() => { let m = null; M.planter_pot_clay.traverse((o) => { if (o.isMesh && !m) m = o.material; }); return m.clone(); })();
    potMat.side = THREE.DoubleSide;
    const shards = new THREE.Group(); scene.add(shards);
    const ang = (a, b) => a + R() * (b - a);
    for (let i = 0; i < 18; i++) {
      // an irregular piece of the pot's wall: a jagged outline, bent round the pot's radius
      const k = 6 + Math.floor(R() * 4), a = ang(0.025, 0.075), b = ang(0.02, 0.06), pts = [];
      for (let j = 0; j < k; j++) { const th = (j / k) * Math.PI * 2 + ang(-0.2, 0.2), f = ang(0.6, 1.15); pts.push(new THREE.Vector2(Math.cos(th) * a * f, Math.sin(th) * b * f)); }
      const geo = new THREE.ShapeGeometry(new THREE.Shape(pts));
      const P = geo.attributes.position, rr = 0.125;
      for (let j = 0; j < P.count; j++) { const u = P.getX(j), v = P.getY(j); P.setXYZ(j, rr * Math.sin(u / rr), v, rr * Math.cos(u / rr) - rr); }
      geo.computeVertexNormals();
      const s = new THREE.Mesh(geo, potMat);
      const fwd = Math.pow(R(), 0.7) * 1.3, side = (R() - 0.5) * 0.9 * (0.4 + fwd);
      s.rotation.set(R() < 0.5 ? -Math.PI / 2 : Math.PI / 2, 0, 0); s.rotateZ(ang(0, 6.28));
      s.position.set(side, 0.012, zL + fwd - 0.15);
      shards.add(s);
    }
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.105, 18, 0, 4.3), potMat); base.rotation.x = -Math.PI / 2; base.position.set(0.05, 0.015, zL + 0.06); shards.add(base);
    // the plant, thrown out of its pot, with its root ball
    const plant = new THREE.Group();
    const rootBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), tiled("brown_mud_02", 0.3, 0.3, { metalness: 0 })); rootBall.scale.set(1, 0.75, 1.1); plant.add(rootBall);
    const tuft = M.shrub_04.clone(true); tuft.scale.setScalar(1.1); tuft.rotation.z = 1.2; tuft.position.set(0.05, 0.02, 0); plant.add(tuft);
    plant.position.set(-0.25, 0.06, zL + 0.8); plant.rotation.y = 0.6; shards.add(plant);
    shadow(shards); shards.traverse((o) => { if (o.isMesh) measurable.push(o); });
    // the soil, spread forwards from where it hit
    const soilTex = (() => {
      const cv = document.createElement("canvas"); cv.width = 256; cv.height = 512;
      const g = cv.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, 256, 512);
      g.filter = "blur(10px)";
      for (let i = 0; i < 14; i++) { const f = i / 14, y = 455 - f * 330; g.fillStyle = `rgba(255,255,255,${0.55 - f * 0.35})`; g.beginPath(); g.ellipse(128 + (Math.random() - 0.5) * 30, y, 30 + f * 30, 28, 0, 0, 7); g.fill(); }
      g.filter = "none";
      for (let i = 0; i < 2200; i++) {
        const f = Math.pow(Math.random(), 1.2), y = 470 - f * 440, sp = 22 + f * 75, x = 128 + (Math.random() - 0.5) * 2 * sp * Math.random();
        g.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.5})`; g.beginPath(); g.arc(x, y, 0.7 + Math.random() * (2.6 - f * 1.6), 0, 7); g.fill();
      }
      g.filter = "blur(3px)"; g.fillStyle = "rgba(255,255,255,0.95)"; g.beginPath(); g.ellipse(128, 452, 36, 28, 0, 0, 7); g.fill(); g.filter = "none";
      return new THREE.CanvasTexture(cv);
    })();
    const soilM = tiled("brown_mud_02", 0.6, 1.2, { metalness: 0, alphaMap: soilTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    soilM.color.setHex(0x8a6a50);
    const soil = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.8), soilM);
    soil.rotation.x = -Math.PI / 2; soil.position.set(0, 0.005, zL + 1.8 / 2 - 0.15); soil.receiveShadow = true; scene.add(soil);
    const clumpG = new THREE.DodecahedronGeometry(1, 0), clumpM = tiled("brown_mud_02", 0.1, 0.1, { metalness: 0 });
    const clumps = new THREE.InstancedMesh(clumpG, clumpM, 40), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 40; i++) {
      const f = Math.pow(R(), 1.4), r = 0.012 + (1 - f) * 0.04 * R();
      q.setFromEuler(e.set(R() * 6, R() * 6, R() * 6));
      m4.compose(new THREE.Vector3((R() - 0.5) * (0.2 + f * 0.8), r * 0.4, zL - 0.05 + f * 1.8), q, new THREE.Vector3(r, r * 0.55, r));
      clumps.setMatrixAt(i, m4);
    }
    clumps.castShadow = true; scene.add(clumps);
  }

  // ---------- the tree, and the branch the pot broke on the way down ----------
  function theTree() {
    const zB = EDGE + C.xb, yB = C.yb;
    S.breakAt = new THREE.Vector3(0.1, yB, zB);
    const tx = 3.4, tz = zB + 0.6;
    const tree = M.tree.clone(true); tree.scale.setScalar(0.56); tree.position.set(tx, 0, tz); tree.rotation.y = 2.2;
    tree.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (o.material.alphaTest > 0 || o.material.name === "leaves") { o.material.alphaTest = 0.5; o.material.alphaToCoverage = true; o.material.transparent = false; o.material.side = THREE.DoubleSide; S.leafMat = o.material; }
    });
    scene.add(tree);
    // a proxy for the trunk, so the tools can measure to it without testing the whole tree
    const trunkP = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 3, 8), new THREE.MeshBasicMaterial({ visible: false }));
    trunkP.position.set(tx, 1.5, tz); scene.add(mark(trunkP));
    // a bed of soil round the trunk, with a kerb
    const bed = new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), tiled("brown_mud_02", 1.2, 1.2, { metalness: 0 }));
    bed.rotation.x = -Math.PI / 2; bed.position.set(tx, 0.012, tz); bed.receiveShadow = true; scene.add(mark(bed));
    const kerb = new THREE.Mesh(new THREE.TorusGeometry(1.33, 0.06, 6, 48), plain(0xa8a196)); kerb.rotation.x = Math.PI / 2; kerb.position.set(tx, 0.04, tz); kerb.scale.z = 1.6; scene.add(kerb);
    // the branch: from the trunk out to the broken end, right where the pot passed
    const barkM = tiled("bark_platanus", 0.6, 3, { metalness: 0 });
    const p0 = new THREE.Vector3(tx - 0.2, yB - 1.3, tz - 0.15), p1 = new THREE.Vector3(1.2, yB - 0.25, zB + 0.25), p2 = S.breakAt.clone();
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    const branch = new THREE.Mesh(taperTube(curve, 0.075, 0.03), barkM); branch.castShadow = true; scene.add(mark(branch));
    // the broken end: pale torn wood, and soil smeared on the top of it
    const dir = curve.getTangent(1).normalize();
    const stub = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.07, 7, 1, true), plain(0xd9c49a, { roughness: 0.95, side: THREE.DoubleSide }));
    stub.position.copy(p2).addScaledVector(dir, 0.03); stub.quaternion.setFromUnitVectors(UP, dir); scene.add(mark(stub));
    const smear = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), plain(0x3e2a1c, { roughness: 1 }));
    smear.scale.set(0.045, 0.012, 0.07); smear.position.copy(p2).addScaledVector(dir, -0.06).add(new THREE.Vector3(0, 0.03, 0)); smear.lookAt(p2.clone().add(dir)); scene.add(smear);
    // twigs with leaves along the branch, so it looks like part of the tree
    if (S.leafMat) for (let i = 0; i < 9; i++) {
      const p = curve.getPoint(0.15 + 0.75 * R()), card = leafCard(0.5 + R() * 0.4);
      card.position.copy(p).add(new THREE.Vector3(0, 0.1, 0)); card.rotation.set(R() * 1.2 - 0.6, R() * 6.3, R() * 1.2 - 0.6); scene.add(card);
    }
    // what came down: a broken twig and fresh green leaves on the ground below
    const twigCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0.3, 0.06, 0.1), new THREE.Vector3(0.62, 0.03, 0.05));
    const twig = new THREE.Mesh(taperTube(twigCurve, 0.028, 0.008), barkM); twig.position.set(-0.4, 0, zB + 0.9); twig.rotation.y = 0.7; scene.add(mark(twig));
    if (S.leafMat) {
      for (let i = 0; i < 3; i++) { const c = leafCard(0.45); c.position.set(-0.4 + 0.2 * i, 0.06, zB + 0.95 + 0.1 * i); c.rotation.set(-Math.PI / 2 + 0.25, 0, R() * 6); scene.add(c); }
      for (let i = 0; i < 14; i++) {
        const c = leafCard(0.18 + R() * 0.16), a = R() * 6.28, r = Math.sqrt(R()) * 1.6;
        c.position.set(Math.cos(a) * r * 0.8, 0.012 + i * 0.0005, zB + 0.4 + Math.sin(a) * r); c.rotation.set(-Math.PI / 2, 0, R() * 6.28); scene.add(c);
      }
    }
  }
  /** A tube along a curve that gets thinner from r0 to r1. */
  function taperTube(curve, r0, r1) {
    const geo = new THREE.TubeGeometry(curve, 24, 1, 8, false), pos = geo.attributes.position, n = 25, rs = 9;
    const P = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), c = curve.getPoint(t), r = r0 + (r1 - r0) * t;
      for (let j = 0; j < rs; j++) { const k = i * rs + j; P.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, P.x, P.y, P.z); }
    }
    geo.computeVertexNormals();
    return geo;
  }
  function leafCard(s) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), S.leafMat);
    m.castShadow = true;
    return m;
  }

  // ---------- other things in the courtyard (none of them matter to the case) ----------
  function props() {
    const car = place("covered_car", 8.6, 0, 10.5, 0.15); S.carPos = car.position.clone();
    car.traverse((o) => { if (o.isMesh) measurable.push(o); });
    place("metal_trash_can", -7.4, 0, 1.0, 0, 0.7);
    for (let i = 0; i < 7; i++) place("shrub_04", -12 + i * 1.9 + R() * 0.6, 0, 0.6 + R() * 0.3, R() * 6, 2.2);
    // bicycle-free zone: a few crates and a pot near the door
    place("plastic_crate_01", -4.0, 0, 0.9, 0.3);
    const p = pot(true); p.position.set(-0.9, 0, 0.7); scene.add(p);
    // benches along the far side, simple
    for (const x of [-6, 2]) {
      const b = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.45), plain(0x7a5a3c, { roughness: 0.7 })); seat.position.y = 0.45;
      const legM = plain(0x5f6366, { metalness: 0.6, roughness: 0.4 });
      for (const lx of [-0.75, 0.75]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), legM); l.position.set(lx, 0.225, 0); b.add(l); }
      b.add(seat); b.position.set(x, 0, 19.5); scene.add(shadow(b)); b.traverse((o) => { if (o.isMesh) measurable.push(o); });
    }
  }

  // ---------- the tools: a laser rangefinder (right hand) and a tape measure (left hand) ----------
  let ctrls = [], rangeCtrl = null, tapeCtrl = null;
  const ray = new THREE.Raycaster(); ray.far = 60;
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion();
  const T_ = {};
  function screenTex(w = 256, h = 96) { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return { cv, g: cv.getContext("2d"), t }; }
  function showOn(s, text, sub = "") {
    const { g, cv, t } = s;
    g.fillStyle = "#16201b"; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = "#b8f5c8"; g.font = "600 54px ui-monospace, Menlo, monospace"; g.textAlign = "right"; g.fillText(text, cv.width - 14, 58);
    g.fillStyle = "#6fae83"; g.font = "400 20px ui-monospace, Menlo, monospace"; g.textAlign = "left"; g.fillText(sub, 12, 86);
    t.needsUpdate = true;
  }
  function tools() {
    // rangefinder: a yellow body with a small screen on top; the laser leaves from its front
    const rf = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.11), plain(0xe2b31c, { roughness: 0.55 })); body.position.z = -0.03; rf.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 16), plain(0x111111, { roughness: 0.2 })); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0, -0.087); rf.add(lens);
    T_.rfScreen = screenTex(); showOn(T_.rfScreen, "– – –", "hold trigger, let go");
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.015), new THREE.MeshBasicMaterial({ map: T_.rfScreen.t })); scr.rotation.x = -Math.PI / 2 + 0.25; scr.position.set(0, 0.0155, -0.02); rf.add(scr);
    T_.rf = rf;
    T_.laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.6 }));
    T_.laser.visible = false; T_.laser.frustumCulled = false; scene.add(T_.laser);
    T_.dot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2020 })); T_.dot.visible = false; scene.add(T_.dot);
    // tape measure: a round yellow case; the tape runs from the hook (first point) to the second point
    const tm = new THREE.Group();
    const cs = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 24), plain(0xf0c419, { roughness: 0.5 })); cs.rotation.z = Math.PI / 2; cs.position.z = -0.02; tm.add(cs);
    const cs2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.032, 16), plain(0x2b2b2b)); cs2.rotation.z = Math.PI / 2; cs2.position.z = -0.02; tm.add(cs2);
    T_.tm = tm;
    T_.tape = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.002, 1), plain(0xf2d22e, { roughness: 0.4, metalness: 0.3 })); T_.tape.visible = false; scene.add(T_.tape);
    T_.hookA = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.012), plain(0x9aa0a6, { metalness: 0.8, roughness: 0.3 })); T_.hookA.visible = false; scene.add(T_.hookA);
    T_.tapeLabel = screenTex(256, 96);
    T_.tapeSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: T_.tapeLabel.t, depthTest: false })); T_.tapeSprite.scale.set(0.16, 0.06, 1); T_.tapeSprite.visible = false; T_.tapeSprite.renderOrder = 5; scene.add(T_.tapeSprite);
    T_.tapeA = null; T_.tapeB = null;
    T_.pointer = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.02, 20), new THREE.MeshBasicMaterial({ color: 0xffe066, depthTest: false, side: THREE.DoubleSide })); T_.pointer.visible = false; T_.pointer.renderOrder = 6; scene.add(T_.pointer);

    ctrls = [0, 1].map((i) => {
      const c = renderer.xr.getController(i);
      const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
      beam.visible = false; c.add(beam);
      c.userData = { beam, hand: null, source: null, laserOn: false };
      c.addEventListener("connected", (e) => { c.userData.source = e.data; c.userData.hand = e.data.handedness; assignTools(); });
      c.addEventListener("disconnected", () => { c.userData.source = null; c.userData.hand = null; c.userData.laserOn = false; assignTools(); });
      c.addEventListener("selectstart", () => selectStart(c));
      c.addEventListener("selectend", () => selectEnd(c));
      c.addEventListener("squeezestart", () => squeezeStart(c));
      c.addEventListener("squeezeend", () => squeezeEnd(c));
      rig.add(c);
      return c;
    });
  }
  function assignTools() {
    const on = ctrls.filter((c) => c.userData.source);
    rangeCtrl = on.find((c) => c.userData.hand === "right") || on.find((c) => c.userData.hand !== "left") || on[0] || null;
    tapeCtrl = on.find((c) => c !== rangeCtrl) || null;
    ctrls.forEach((c) => { c.remove(T_.rf); c.remove(T_.tm); });
    if (rangeCtrl) rangeCtrl.add(T_.rf);
    if (tapeCtrl) tapeCtrl.add(T_.tm);
  }
  function aim(c) {
    c.updateMatrixWorld(true);
    tmpM.identity().extractRotation(c.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(c.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  }
  const boardHit = (c) => { aim(c); ray.far = 4; const h = ray.intersectObjects(pickables, false)[0]; ray.far = 60; return h && h.object.userData.kind === "board" ? h : null; };
  const surfaceHit = (c) => { aim(c); return ray.intersectObjects(measurable, false)[0] || null; };
  function selectStart(c) {
    const b = boardHit(c);
    if (b) { const id = b.object.userData.board.at(b.uv); if (id) pressBoard(b.object.userData.board, id); return; }
    if (radioHit(c)) { if (radio.last && !radio.talking) speak(radio.last); return; }
    if (potHit(c)) { push.charge = { c, t: 0 }; return; }
    if (c === rangeCtrl) { c.userData.laserOn = true; return; }
    if (c === tapeCtrl) {
      const h = surfaceHit(c); if (!h) return;
      if (!T_.tapeA || T_.tapeB) { T_.tapeA = h.point.clone(); T_.tapeB = null; T_.hookA.position.copy(h.point); T_.hookA.visible = true; T_.tapeSprite.visible = false; }
      else { T_.tapeB = h.point.clone(); const L = T_.tapeA.distanceTo(T_.tapeB); drawTape(T_.tapeA, T_.tapeB); if (L > 0.3) tut.ev.taped = true; log("tape", { m: +L.toFixed(2), a: T_.tapeA.toArray().map((v) => +v.toFixed(2)), b: T_.tapeB.toArray().map((v) => +v.toFixed(2)) }); }
    }
  }
  function selectEnd(c) {
    if (push.charge && push.charge.c === c) { launch(chargeSpeed(push.charge.t), "trigger"); return; }
    if (c !== rangeCtrl || !c.userData.laserOn) return;
    c.userData.laserOn = false; T_.laser.visible = T_.dot.visible = false;
    const h = surfaceHit(c);
    if (!h) { showOn(T_.rfScreen, "– – –", "no target"); return; }
    const front = new THREE.Vector3(0, 0, -0.087).applyMatrix4(c.matrixWorld), L = front.distanceTo(h.point);
    showOn(T_.rfScreen, `${L.toFixed(2)} m`, "from the front"); tut.ev.ranged = true;
    log("rangefinder", { m: +L.toFixed(2), at: h.point.toArray().map((v) => +v.toFixed(2)) });
  }
  function drawTape(a, b) {
    const L = a.distanceTo(b);
    T_.tape.visible = L > 0.005; T_.tape.position.copy(a).add(b).multiplyScalar(0.5); T_.tape.lookAt(b); T_.tape.scale.z = Math.max(L, 0.001);
    const { g, cv, t } = T_.tapeLabel;
    g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = "rgba(242,210,46,0.95)"; g.beginPath(); g.roundRect(4, 4, cv.width - 8, cv.height - 8, 18); g.fill();
    g.fillStyle = "#1d1d1d"; g.font = "700 56px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillText(`${L.toFixed(2)} m`, cv.width / 2, 66); t.needsUpdate = true;
    T_.tapeSprite.visible = true; T_.tapeSprite.position.copy(b).add(new THREE.Vector3(0, 0.08, 0));
  }
  const dotScale = new THREE.Vector3();
  function updateTools() {
    // the laser while the trigger is held
    if (rangeCtrl && rangeCtrl.userData.laserOn) {
      const h = surfaceHit(rangeCtrl), front = new THREE.Vector3(0, 0, -0.087).applyMatrix4(rangeCtrl.matrixWorld);
      const end = h ? h.point : front.clone().addScaledVector(ray.ray.direction, 40);
      T_.laser.geometry.setFromPoints([front, end]); T_.laser.visible = true;
      T_.dot.visible = !!h; if (h) { T_.dot.position.copy(h.point); T_.dot.scale.setScalar(0.006 + 0.0025 * h.distance); }
    }
    // the tape follows the hand's pointer until its second end is set
    T_.pointer.visible = false;
    if (tapeCtrl && !boardHit(tapeCtrl) && !potHit(tapeCtrl)) {
      const h = surfaceHit(tapeCtrl);
      if (h && h.distance < 30) {
        T_.pointer.visible = true; T_.pointer.position.copy(h.point);
        const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : UP; T_.pointer.lookAt(h.point.clone().add(n));
        T_.pointer.position.addScaledVector(n, 0.004); T_.pointer.scale.setScalar(0.6 + 0.12 * h.distance);
        if (T_.tapeA && !T_.tapeB) drawTape(T_.tapeA, h.point);
      }
    }
    // white beams to the boards
    for (const c of ctrls) {
      if (!c.userData.source) continue;
      const b = boardHit(c);
      c.userData.beam.visible = !!b; if (b) c.userData.beam.scale.z = b.distance;
      if (b) { const bd = b.object.userData.board; bd.setHover(bd.at(b.uv)); if (hoverBoard && hoverBoard !== bd) hoverBoard.setHover(null); hoverBoard = bd; }
    }
    if (hoverBoard && !ctrls.some((c) => c.userData.source && boardHit(c))) { hoverBoard.setHover(null); hoverBoard = null; }
  }
  let hoverBoard = null;

  // ---------- the middle column: sliding glass doors on every floor, the room behind them, and the lift ----------
  let where = 0;                 // 0: on the ground floor; n ≥ 2: on floor n (its room, the lift, or its balcony)
  const B_ = {};
  const levelY = (n) => (n - 1) * C.h;
  /** Sliding glass doors in the doorway of the middle column on every floor: fixed panes at the sides, two that slide. */
  function columnDoors(B, floors, h, glassM, frameM) {
    S.colDoors = [];
    const gm = glassM.clone(); gm.color.setHex(0x9aa6ad); gm.roughness = 0.18; gm.envMapIntensity = 0.55;
    for (let n = 1; n <= floors; n++) {
      const g = new THREE.Group(); g.position.set(0, (n - 1) * h, 0); B.add(g);
      const bar = (w, hh, x, y, z = 0.02) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.06), frameM); m.position.set(x, y, z); g.add(m); };
      bar(2.46, 0.07, 0, DOOR_H + 0.035); bar(0.06, DOOR_H, -1.2, DOOR_H / 2); bar(0.06, DOOR_H, 1.2, DOOR_H / 2);
      bar(0.05, DOOR_H, -DOOR_W / 2 - 0.02, DOOR_H / 2); bar(0.05, DOOR_H, DOOR_W / 2 + 0.02, DOOR_H / 2);
      for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.56, DOOR_H - 0.04, 0.02), gm); f.position.set(sx * 0.9, DOOR_H / 2, 0.025); g.add(f); }
      const leaves = [-1, 1].map((sx) => {
        const l = new THREE.Group(), pane = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2, DOOR_H - 0.02, 0.025), gm), edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, DOOR_H - 0.02, 0.035), frameM);
        edge.position.x = -sx * (DOOR_W / 4 - 0.02); l.add(pane, edge); l.position.set(sx * DOOR_W / 4, DOOR_H / 2, -0.03); g.add(l); return { l, sx };
      });
      S.colDoors[n] = { g, leaves, open: 0 };
    }
  }
  function setColumnDoor(n, f) {
    const d = S.colDoors[n]; if (!d) return; d.open = f;
    for (const { l, sx } of d.leaves) l.position.x = sx * (DOOR_W / 4 + f * (DOOR_W / 2 - 0.04));
  }
  /** The room behind the doorway (the lobby on the ground floor, a hall in the flat above): it goes wherever you are. */
  function buildRoom() {
    const R_ = new THREE.Group(); scene.add(R_);
    const wallM = tiled("beige_wall_001", 1, 1, { metalness: 0, color: 0xfaf6ee });
    const floorM = tiled("concrete_floor_02", 2, 1.2, { metalness: 0, color: 0xc4b49c });
    const ceilM = plain(0xf4f2ee, { roughness: 0.9, emissive: 0x6b675f });
    const add = (geo, m, x, y, z, ry = 0, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); o.receiveShadow = false;   /* the block's shadow would make it dark inside */ R_.add(o); measurable.push(o); return o; };
    const H_ = 2.55, W_ = BW;
    add(new THREE.PlaneGeometry(W_, ROOM_D), floorM, 0, 0.002, -ROOM_D / 2, 0, -Math.PI / 2);
    add(new THREE.PlaneGeometry(W_, ROOM_D), ceilM, 0, H_, -ROOM_D / 2, 0, Math.PI / 2);
    add(new THREE.PlaneGeometry(ROOM_D, H_), wallM, -W_ / 2, H_ / 2, -ROOM_D / 2, Math.PI / 2);
    add(new THREE.PlaneGeometry(ROOM_D, H_), wallM, W_ / 2, H_ / 2, -ROOM_D / 2, -Math.PI / 2);
    // the inside of the front wall round the doorway, and the back wall round the lift's opening
    const strip = (x0, x1, y0, y1, z, ry) => add(new THREE.PlaneGeometry(x1 - x0, y1 - y0), wallM, (x0 + x1) / 2, (y0 + y1) / 2, z, ry);
    strip(-W_ / 2, -DOOR_W / 2 - 0.05, 0, H_, -0.05, Math.PI); strip(DOOR_W / 2 + 0.05, W_ / 2, 0, H_, -0.05, Math.PI); strip(-DOOR_W / 2 - 0.05, DOOR_W / 2 + 0.05, DOOR_H + 0.07, H_, -0.05, Math.PI);
    strip(-W_ / 2, -CAR.door - 0.05, 0, H_, -ROOM_D, 0); strip(CAR.door + 0.05, W_ / 2, 0, H_, -ROOM_D, 0); strip(-CAR.door - 0.05, CAR.door + 0.05, 2.15, H_, -ROOM_D, 0);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dd, emissiveIntensity: 1.2 }));
    lamp.position.set(0, H_ - 0.02, -ROOM_D / 2); R_.add(lamp);
    const skirt = plain(0x8a7d6c); for (const sx of [-1, 1]) { const k = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, ROOM_D), skirt); k.position.set(sx * (W_ / 2 - 0.01), 0.05, -ROOM_D / 2); R_.add(k); }
    // a frame round the lift's opening, with the floor number above it
    const fr = plain(0xa9adb1, { metalness: 0.7, roughness: 0.35 });
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.15, 0.05), fr); p.position.set(sx * (CAR.door + 0.04), 1.075, -ROOM_D + 0.02); R_.add(p); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(CAR.door * 2 + 0.16, 0.08, 0.05), fr); lintel.position.set(0, 2.19, -ROOM_D + 0.02); R_.add(lintel);
    S.roomSign = screenTex(256, 128);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), new THREE.MeshBasicMaterial({ map: S.roomSign.t })); sign.position.set(0, 2.36, -ROOM_D + 0.01); R_.add(sign);
    S.room = R_;
  }
  function drawFloorSign(s, n, arrow = "") {
    const { g, cv, t } = s;
    g.fillStyle = "#141414"; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = "#ff9a3c"; g.font = "700 84px ui-monospace, Menlo, monospace"; g.textAlign = "center"; g.fillText(`${arrow}${n === 1 ? "G" : n}`, cv.width / 2, 96);
    t.needsUpdate = true;
  }
  /** The lift car: steel walls, two sliding doors, the buttons on the wall beside the door, the floor shown above it. */
  function buildCar() {
    const K = new THREE.Group(); scene.add(K);
    const steel = new THREE.MeshStandardMaterial({ color: 0xbfc3c7, metalness: 0.85, roughness: 0.32 });
    const doorM = new THREE.MeshStandardMaterial({ color: 0xa8adb2, metalness: 0.9, roughness: 0.25 });
    const add = (w, h, d, x, y, z, m = steel) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); K.add(o); measurable.push(o); return o; };
    const zc = (CAR.z0 + CAR.z1) / 2, dz = CAR.z1 - CAR.z0;
    add(CAR.x * 2, 0.04, dz, 0, -0.02, zc, plain(0x2e2f31, { roughness: 0.6 }));
    add(CAR.x * 2, 0.04, dz, 0, CAR.h + 0.02, zc);
    add(CAR.x * 2, CAR.h, 0.04, 0, CAR.h / 2, CAR.z0 - 0.02);
    add(0.04, CAR.h, dz, -CAR.x - 0.02, CAR.h / 2, zc); add(0.04, CAR.h, dz, CAR.x + 0.02, CAR.h / 2, zc);
    add(CAR.x - CAR.door, CAR.h, 0.04, -(CAR.x + CAR.door) / 2, CAR.h / 2, CAR.z1); add(CAR.x - CAR.door, CAR.h, 0.04, (CAR.x + CAR.door) / 2, CAR.h / 2, CAR.z1);
    add(CAR.door * 2, CAR.h - 2.1, 0.04, 0, (CAR.h + 2.1) / 2, CAR.z1);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.9), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.4 }));
    light.position.set(0, CAR.h - 0.01, zc); K.add(light);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, CAR.x * 2 - 0.2, 10), steel); rail.rotation.z = Math.PI / 2; rail.position.set(0, 0.95, CAR.z0 + 0.06); K.add(rail);
    S.carDoors = [-1, 1].map((sx) => { const d = new THREE.Mesh(new THREE.BoxGeometry(CAR.door, 2.1, 0.03), doorM); d.position.set(sx * CAR.door / 2, 1.05, CAR.z1 - 0.04); K.add(d); measurable.push(d); return { d, sx }; });
    // the floor above the door, inside
    S.carSign = screenTex(256, 128);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshBasicMaterial({ map: S.carSign.t })); sign.position.set(0, 2.2, CAR.z1 - 0.025); sign.rotation.y = Math.PI; K.add(sign);
    // the buttons, on the side wall next to the door, where a hand reaches them
    B_.car = makeBoard(0.2, 0.42, (g, W, H, btn) => {
      g.fillStyle = "#b9bdc1"; g.beginPath(); g.roundRect(0, 0, W, H, 16); g.fill();
      const fl = ["G", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
      fl.forEach((f, i) => {
        const n = i === 0 ? 1 : i + 1, col = i % 2, row = 4 - Math.floor(i / 2);
        btn(`go:${n}`, f, 22 + col * 86, 28 + row * 70, 70, 56, { on: lift.target === n || (lift.state === "idle" && lift.level === n), size: 26 });
      });
    }, { ppm: 900, radius: 16 });
    B_.car.mesh.position.set(CAR.x - 0.005, 1.15, CAR.z1 - 0.22); B_.car.mesh.rotation.y = -Math.PI / 2; K.add(B_.car.mesh); pickables.push(B_.car.mesh);
    S.car = K;
    S.hum = sound("fx_hum", K, { loop: true, vol: 0.35 });
  }
  function setCarDoors(f) { for (const { d, sx } of S.carDoors) d.position.x = sx * (CAR.door / 2 + f * (CAR.door - 0.02)); }

  // the lift: idle with its doors open on your floor; a button closes the doors, the car (and you in it) travels, the doors open
  const lift = { level: 1, target: 0, state: "idle", doors: 1, t: 0, T: 0, y0: 0, y1: 0 };
  function pressBoard(b, id) {
    if (id.startsWith("go:")) callLift(+id.slice(3));
    else if (id.startsWith("call:")) callFlat(+id.slice(5));
  }
  function callLift(n) {
    if (lift.state !== "idle" || n === lift.level) return;
    lift.target = n; lift.state = "closing"; B_.car.redraw();
    play("fx_door", S.car, 0.6); log("lift", { from: lift.level, to: n });
  }
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  function stepLift(dt) {
    if (lift.state === "closing") {
      lift.doors = Math.max(0, lift.doors - dt / 0.9);
      if (lift.doors === 0) {
        lift.state = "moving"; lift.t = 0; lift.y0 = levelY(lift.level); lift.y1 = levelY(lift.target);
        lift.T = 1.5 + Math.abs(lift.y1 - lift.y0) / 3.2;
        S.room.visible = false; clearPush(); for (const k in S.restPots) S.restPots[k].visible = true;
        if (S.hum) { S.hum.setVolume(0.35); if (!S.hum.isPlaying && S.hum.buffer) S.hum.play(); }
      }
    } else if (lift.state === "moving") {
      lift.t += dt;
      const f = Math.min(1, lift.t / lift.T), y = lift.y0 + (lift.y1 - lift.y0) * ease(f);
      const dy = y - S.car.position.y; S.car.position.y = y; rig.position.y += dy;
      const n = Math.round(y / C.h) + 1; drawFloorSign(S.carSign, n, lift.y1 > lift.y0 ? "▲" : "▼");
      if (f >= 1) {
        lift.level = lift.target; lift.target = 0; where = lift.level > 1 ? lift.level : 0;
        S.room.position.y = y; S.room.visible = true; drawFloorSign(S.carSign, lift.level); drawFloorSign(S.roomSign, lift.level);
        if (where) newTestPot();
        if (S.hum && S.hum.isPlaying) S.hum.stop();
        play("fx_ding", S.car, 0.8);
        lift.state = "opening"; B_.car.redraw();
      }
    } else if (lift.state === "opening") {
      lift.doors = Math.min(1, lift.doors + dt / 0.9);
      if (lift.doors === 1) { lift.state = "idle"; B_.car.redraw(); }
    }
    setCarDoors(lift.doors);
    for (let n = 1; n <= NF; n++) setColumnDoor(n, n === lift.level && lift.state !== "moving" ? lift.doors : 0);
  }
  /** Straight to floor n, no ride (for the preview and for leaving VR). */
  function goTo(n) {
    clearPush(); for (const k in S.restPots) S.restPots[k].visible = true;
    lift.level = n; lift.target = 0; lift.state = "idle"; lift.doors = 1; where = n > 1 ? n : 0;
    const y = levelY(n); S.car.position.y = y; S.room.position.y = y; S.room.visible = true;
    drawFloorSign(S.carSign, n); drawFloorSign(S.roomSign, n);
    if (where) newTestPot();
    stepLift(0); B_.car.redraw();
  }

  // ---------- the door intercom: call the flats of the middle column ----------
  const said = {};                 // what each flat says this case: a voice line id, or null for no answer
  function intercom() {
    // who says what: the three flats with a gap on the balcony talk about what is on their balcony (the same for the
    // real one and the two others), the rest say other things or are out
    const R2 = rng(seed * 7 + 3), voices = [0, 1, 2, 3];
    const kinds = ["r_broom", "r_crate", "r_plants"], used = {};
    const others = ["r_cat", "r_wind", "r_crash", "r_nothing", "r_work", null, null].sort(() => R2() - 0.5);
    for (let n = 2; n <= NF; n++) {
      const v = voices[Math.floor(R2() * 4)];
      if (C.suspects.includes(n)) { const k = kinds[S.decor[n]]; used[k] = (used[k] || 0) + 1; said[n] = `${k}${used[k] > 1 ? 2 : 1}_${v}`; }
      else { const k = others.length ? others.pop() : null; said[n] = k && `${k}_${v}`; }
    }
    B_.intercom = makeBoard(0.26, 0.4, (g, W, H, btn) => {
      g.fillStyle = "#8d9296"; g.beginPath(); g.roundRect(0, 0, W, H, 16); g.fill();
      g.fillStyle = "#2b2e30"; for (let i = 0; i < 5; i++) for (let j = 0; j < 9; j++) { g.beginPath(); g.arc(W / 2 - 64 + j * 16, 24 + i * 14, 3.4, 0, 7); g.fill(); }
      g.fillStyle = "#f4f4f2"; g.font = "600 22px -apple-system, Arial"; g.textAlign = "center"; g.fillText("CALL A FLAT", W / 2, 118); g.textAlign = "left";
      for (let i = 0; i < 9; i++) { const n = i + 2; btn(`call:${n}`, `${n}`, 20 + (i % 3) * 64, 136 + Math.floor(i / 3) * 70, 54, 54, { size: 26, on: call.floor === n }); }
    }, { ppm: 900, radius: 16 });
    B_.intercom.mesh.position.set(1.42, 1.35, 0.025); scene.add(B_.intercom.mesh); pickables.push(B_.intercom.mesh);
  }
  const call = { floor: 0 };
  async function callFlat(n) {
    if (call.floor) return;
    call.floor = n; B_.intercom.redraw(); log("call", { floor: n });
    const at = B_.intercom.mesh, line = said[n];
    for (let i = 0; i < (line ? 2 : 4); i++) await playWait("fx_ring", at, 0.5);
    if (line) await speak([line], { via: at, who: `Floor ${n}` });
    else showSub(`Floor ${n}`, "(No answer.)", 2.5);
    call.floor = 0; B_.intercom.redraw();
  }

  // ---------- sound ----------
  const listener = new THREE.AudioListener(); camera.add(listener);
  const BUF = {}; let LINES = {};
  const AUD = "/case/audio/";
  const audioReady = fetch(AUD + "lines.json").then((r) => r.json()).then((j) => { LINES = j; }).catch(() => {});
  function buf(id) {
    if (!BUF[id]) BUF[id] = new Promise((res) => new THREE.AudioLoader().load(`${AUD}${id}.mp3`, res, undefined, () => res(null)));
    return BUF[id];
  }
  /** A sound: at an object in the scene (PositionalAudio), or with no object, in your ears. */
  function sound(id, at, { loop = false, vol = 1 } = {}) {
    const a = at ? new THREE.PositionalAudio(listener) : new THREE.Audio(listener);
    if (at) { a.setRefDistance(1.2); at.add(a); }
    a.setLoop(loop); a.setVolume(vol);
    buf(id).then((b) => { if (b) a.setBuffer(b); });
    return a;
  }
  function playWait(id, at, vol = 1) {
    return buf(id).then((b) => new Promise((res) => {
      if (!b || listener.context.state !== "running") { setTimeout(res, 600); return; }
      const a = at ? new THREE.PositionalAudio(listener) : new THREE.Audio(listener);
      if (at) { a.setRefDistance(1.2); at.add(a); }
      a.setBuffer(b); a.setVolume(vol); a.onEnded = () => { a.isPlaying = false; if (at) at.remove(a); res(); }; a.play();
    }));
  }
  const play = (id, at, vol) => { playWait(id, at, vol); };

  // ---------- the radio on your chest, and the words of whoever is speaking ----------
  const radio = { obj: null, led: null, screen: null, held: null, talking: false, last: null, pick: null, holdT: 0, stickReady: true, choice: 0 };
  function buildRadio() {
    const o = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.035), plain(0x1d1f21, { roughness: 0.6 }));
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.07, 8), plain(0x111111)); ant.position.set(0.017, 0.09, 0);
    radio.led = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), new THREE.MeshBasicMaterial({ color: 0x1f3a24 })); radio.led.position.set(-0.018, 0.047, 0.018);
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.035), plain(0x2c2f31, { roughness: 1 })); grille.position.set(0, -0.03, 0.0176);
    radio.screen = screenTex(192, 96);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.021), new THREE.MeshBasicMaterial({ map: radio.screen.t })); scr.position.set(0, 0.02, 0.0176);
    o.add(body, ant, radio.led, grille, scr);
    radio.pick = body; radio.obj = o; o.visible = false; scene.add(o);
    radioScreen();
    // the words, low in front of you
    S.sub = screenTex(1024, 200);
    S.subMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.14), new THREE.MeshBasicMaterial({ map: S.sub.t, transparent: true, depthTest: false }));
    S.subMesh.renderOrder = 9; S.subMesh.visible = false; scene.add(S.subMesh);
  }
  function radioScreen() {
    const { g, cv, t } = radio.screen;
    g.fillStyle = "#1a2a1f"; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = "#b8f5c8"; g.textAlign = "center";
    if (radio.held && tut.phase === "case") { g.font = "600 30px ui-monospace, Menlo, monospace"; g.fillText("REPORT FLOOR", 96, 34); g.font = "700 44px ui-monospace, Menlo, monospace"; g.fillText(radio.choice ? `▲ ${radio.choice} ▼` : "▲ – ▼", 96, 82); }
    else { g.font = "600 40px ui-monospace, Menlo, monospace"; g.fillText(radio.talking ? "RX ))" : "CH 1", 96, 62); }
    t.needsUpdate = true;
  }
  function showSub(who, text, hold = 0) {
    const { g, cv, t } = S.sub;
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = "rgba(12,14,13,0.78)"; g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, 26); g.fill();
    g.fillStyle = "#ffcf8a"; g.font = "600 30px -apple-system, Arial"; g.fillText(who, 30, 44);
    g.fillStyle = "#ffffff"; g.font = "400 32px -apple-system, Arial";
    const words = text.split(" "); let line = "", y = 92;
    for (const w of words) { const tr = line ? `${line} ${w}` : w; if (g.measureText(tr).width > cv.width - 60) { g.fillText(line, 30, y); line = w; y += 40; } else line = tr; }
    g.fillText(line, 30, y); t.needsUpdate = true;
    S.subMesh.visible = renderer.xr.isPresenting; S.subUntil = hold ? performance.now() / 1000 + hold : Infinity;
  }
  /** Say some lines one after another: over the radio (via: "radio") or from an object in the scene. */
  let speakQ = Promise.resolve(), speakGen = 0;
  function speak(ids, { via = "radio", who = "Control" } = {}) {
    const gen = speakGen;
    speakQ = speakQ.then(async () => {
      await audioReady;
      if (gen !== speakGen) return;
      const isRadio = via === "radio";
      if (isRadio) { radio.talking = true; radioScreen(); radio.last = ids; await playWait("fx_squelch", null, 0.5); }
      for (const id of ids) {
        if (gen !== speakGen) break;
        showSub(isRadio ? "Control (radio)" : who, ids.length > 2 && ids[0] === "c_copy" ? ids.map((i) => LINES[i] || "").join(" ") : LINES[id] || "");
        await playWait(id, isRadio ? null : via, isRadio ? 0.9 : 1);
      }
      if (isRadio) { await playWait("fx_squelch", null, 0.4); radio.talking = false; radioScreen(); }
      S.subUntil = performance.now() / 1000 + 2.5;
    });
    return speakQ;
  }
  function hush() { speakGen++; speakQ = Promise.resolve(); radio.talking = false; radioScreen(); }
  const radioHit = (c) => { if (!radio.obj.visible || radio.held) return null; aim(c); ray.far = 1.5; const h = ray.intersectObject(radio.pick, false)[0]; ray.far = 60; return h || null; };
  const yawQ = new THREE.Quaternion(), eyeQ = new THREE.Quaternion(), eye = new THREE.Vector3(), look = new THREE.Vector3();
  let bodyYaw = null;
  function placeRadio(dt) {
    camera.getWorldPosition(eye); camera.getWorldDirection(look);
    const yaw = Math.atan2(-look.x, -look.z);
    if (bodyYaw === null) bodyYaw = yaw;
    let d = yaw - bodyYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > 0.6) bodyYaw += d - Math.sign(d) * 0.6;           // the body follows the head only when it turns far
    bodyYaw += d * Math.min(1, dt * 1.5);
    yawQ.setFromAxisAngle(UP, bodyYaw);
    if (radio.held) {
      const c = radio.held; c.updateMatrixWorld(true);
      radio.obj.position.setFromMatrixPosition(c.matrixWorld).add(new THREE.Vector3(0, 0.07, -0.02).applyQuaternion(c.getWorldQuaternion(eyeQ)));
      radio.obj.quaternion.copy(eyeQ);
    } else {
      radio.obj.position.copy(eye).add(new THREE.Vector3(-0.17, -0.4, -0.3).applyQuaternion(yawQ));
      radio.obj.quaternion.copy(yawQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.75, 0.25, 0)));
    }
    radio.led.material.color.setHex(radio.talking && (performance.now() % 500 < 280) ? 0x3dff6e : 0x1f3a24);
    // the words: low, in front of the body
    if (S.subMesh.visible) {
      S.subMesh.position.copy(eye).add(new THREE.Vector3(0, -0.3, -0.85).applyQuaternion(yawQ)); S.subMesh.lookAt(eye);
      if (performance.now() / 1000 > S.subUntil) S.subMesh.visible = false;
    }
  }
  function squeezeStart(c) {
    if (!radio.obj.visible) return;
    if (ctrls.every((k) => !k.userData.source || k.userData.squeezing)) radio.bothT = 0;
    c.userData.squeezing = true;
    if (!radio.held) { radio.held = c; radio.choice = 0; radioScreen(); play("fx_squelch", null, 0.3); }
  }
  function squeezeEnd(c) {
    c.userData.squeezing = false;
    if (radio.held !== c) return;
    radio.held = null; radioScreen(); play("fx_squelch", null, 0.3);
    if (tut.phase === "tutorial") tut.ev.talked = true;
    else if (tut.phase === "case" && radio.choice) {
      const n = radio.choice; log("report", { floor: n, right: n === C.floor });
      hush(); speak(["c_copy", `n${n}`, "c_logged"]);
    }
  }
  function radioStick(dt) {
    if (!radio.held || tut.phase !== "case") return;
    const st = stick(radio.held)[1];
    if (Math.abs(st) > 0.6 && radio.stickReady) { radio.stickReady = false; radio.choice = Math.max(2, Math.min(NF, (radio.choice || 5) + (st < 0 ? 1 : -1))); radioScreen(); }
    else if (Math.abs(st) < 0.3) radio.stickReady = true;
  }

  // ---------- the tutorial: control checks your kit over the radio before giving you the case ----------
  const tut = { phase: "off", i: -1, ev: {}, lookT: 0, t: 0, labels: [] };
  const STEPS = [
    { line: "c_look", done: (dt) => { camera.getWorldDirection(look); tut.lookT = look.y < -0.5 ? tut.lookT + dt : 0; return tut.lookT > 0.4; } },
    { line: "c_walk", label: ["left", "Left stick: walk"], done: () => { camera.getWorldPosition(eye); return Math.hypot(eye.x - S.cone.x, eye.z - S.cone.z) < 1.2; } },
    { line: "c_turn", label: ["right", "Right stick left or right: turn"], done: () => { if (!tut.ev.turned) return false; camera.getWorldPosition(eye); camera.getWorldDirection(look); const a = Math.atan2(S.carPos.x - eye.x, S.carPos.z - eye.z) - Math.atan2(look.x, look.z); return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.7; } },
    { line: "c_jump", label: ["right", "Right stick forward: aim. Let go: jump"], done: () => tut.ev.jumped },
    { line: "c_range", label: ["right", "Trigger: hold to aim, let go to measure"], done: () => tut.ev.ranged },
    { line: "c_tape", label: ["left", "Trigger: one end, then the other end"], done: () => tut.ev.taped },
    { line: "c_talk", label: ["both", "Grip: lift the radio. Let go: send"], done: () => tut.ev.talked },
  ];
  function startTutorial() {
    if (qs.has("skip")) { briefing(); return; }
    tut.phase = "tutorial"; tut.i = -1; nextStep();
  }
  function nextStep() {
    tut.i++; tut.ev = {}; tut.lookT = 0; tut.t = 0; setLabels(null);
    if (tut.i >= STEPS.length) { briefing(); return; }
    const st = STEPS[tut.i];
    log("tutorial", { step: st.line });
    speak([st.line]).then(() => { if (tut.phase === "tutorial" && STEPS[tut.i] === st) setLabels(st.label); });
    tut.speaking = true; speakQ.then(() => { tut.speaking = false; });
  }
  function stepTutorial(dt) {
    if (tut.phase !== "tutorial") return;
    // both grips held for over a second: skip it
    if (ctrls.filter((c) => c.userData.source).length === 2 && ctrls.every((c) => !c.userData.source || c.userData.squeezing)) {
      radio.bothT = (radio.bothT || 0) + dt;
      if (radio.bothT > 1.2) { radio.bothT = 0; hush(); setLabels(null); tut.phase = "brief"; speak(["c_skip"]).then(briefing); return; }
    }
    const st = STEPS[tut.i];
    if (st && st.done(dt) && !tut.speaking) { play("fx_chime", null, 0.6); speak([`c_good${1 + (tut.i % 3)}`]); nextStep(); }
  }
  function briefing() {
    setLabels(null); tut.phase = "brief";
    log("tutorial", { step: "brief" });
    tut.phase = "case";                 // the floor can be reported from now on
    speak(["c_brief1", "c_brief2", "c_brief3", "c_repeat_hint"]);
  }
  function setLabels(lb) {
    for (const s of tut.labels) s.parent && s.parent.remove(s);
    tut.labels = [];
    if (!lb) return;
    const [hand, text] = lb;
    const targets = hand === "both" ? ctrls.filter((c) => c.userData.source) : [hand === "left" ? (tapeCtrl || ctrls[1]) : (rangeCtrl || ctrls[0])];
    for (const c of targets) {
      if (!c) continue;
      const s = screenTex(512, 96), { g, cv, t } = s;
      g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = "rgba(255,206,120,0.95)"; g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, 30); g.fill();
      g.fillStyle = "#1a1a1a"; g.font = "600 32px -apple-system, Arial"; g.textAlign = "center"; g.fillText(text, cv.width / 2, 60); t.needsUpdate = true;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); sp.scale.set(0.2, 0.0375, 1); sp.position.set(0, 0.075, 0.02); sp.renderOrder = 8;
      c.add(sp); tut.labels.push(sp);
    }
  }

  // a cone to walk to, on the far side of the courtyard, away from the clues
  function tutorialProps() {
    S.cone = new THREE.Vector3(-5.2, 0, 17.2);
    const cone = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.36), plain(0x222222)); base.position.y = 0.015;
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.62, 24, 1, true), plain(0xff6a14, { roughness: 0.6 })); body.position.y = 0.34;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.093, 0.1, 24, 1, true), plain(0xf2f2f2, { roughness: 0.4 })); band.position.y = 0.4;
    cone.add(base, body, band); cone.position.copy(S.cone); scene.add(shadow(cone));
  }

  // ---------- the push test: the pot on the rail in front of you ----------
  // Point at it and hold the trigger: the push builds up (an arrow behind the pot grows, the controller shakes harder,
  // the speed shows above the pot); let go and the pot leaves the rail horizontally at that speed.
  // Or push it with the controller itself: it leaves at the speed your hand was moving outwards.
  const SLOT_Z = DEPTH - LEDGE / 2 + 0.05;
  const push = { pot: null, hit: null, label: null, arrow: null, charge: null, flying: null, flights: [], waitNew: 0, hover: false, prev: new Map() };
  function pushTest() {
    push.hit = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 12), new THREE.MeshBasicMaterial({ visible: false }));
    push.hit.visible = false; scene.add(push.hit);
    push.label = screenTex(320, 96);
    push.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: push.label.t, depthTest: false, transparent: true }));
    push.sprite.scale.set(0.27, 0.081, 1); push.sprite.renderOrder = 5; push.sprite.visible = false; scene.add(push.sprite);
    // the arrow: the push on the pot, from behind it (the balcony side) towards the outside
    const am = new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.9, depthTest: false });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 10), am), head = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 14), am);
    shaft.rotation.x = Math.PI / 2; head.rotation.x = Math.PI / 2; shaft.renderOrder = head.renderOrder = 4;
    push.arrow = new THREE.Group(); push.arrow.add(shaft, head); push.arrow.userData = { shaft, head }; push.arrow.visible = false; scene.add(push.arrow);
  }
  function label(text, sub = "") {
    const { g, cv, t } = push.label;
    g.clearRect(0, 0, cv.width, cv.height);
    g.fillStyle = "rgba(20,24,22,0.82)"; g.beginPath(); g.roundRect(4, 4, cv.width - 8, cv.height - 8, 22); g.fill();
    g.textAlign = "center";
    if (sub) { g.fillStyle = "#ffd29a"; g.font = "500 30px -apple-system, Arial"; g.fillText(sub, cv.width / 2, 60); }
    else { g.fillStyle = "#ffffff"; g.font = "700 56px ui-monospace, Menlo, monospace"; g.fillText(text, cv.width / 2, 68); }
    t.needsUpdate = true;
  }
  const slotY = () => railTop(where);
  function newTestPot() {
    if (push.pot) scene.remove(push.pot);
    if (S.restPots[where]) S.restPots[where].visible = false;
    push.pot = pot(true); push.pot.position.set(0, slotY(), SLOT_Z); scene.add(push.pot);
    push.hit.position.set(0, slotY() + 0.17, SLOT_Z);
  }
  function setArrow(v) {
    const L = 0.06 + 0.07 * v, { shaft, head } = push.arrow.userData, zTip = SLOT_Z - 0.14;
    shaft.scale.y = L; shaft.position.set(0, 0, -0.035 - L / 2); head.position.set(0, 0, 0);
    push.arrow.position.set(0, slotY() + 0.12, zTip - 0.035); push.arrow.visible = true;
  }
  const potHit = (c) => { if (!where || !push.pot || push.flying) return null; aim(c); ray.far = 3; const h = ray.intersectObject(push.hit, false)[0]; ray.far = 60; return h || null; };
  function chargeSpeed(t) { return Math.min(8, 0.3 + 0.9 * t); }
  function launch(v, how) {
    if (!where || !push.pot || push.flying) return;
    v = Math.round(v * 10) / 10;
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb02e })); line.frustumCulled = false; scene.add(line);
    push.flying = { p: push.pot, line, t: 0, y: slotY(), v, pts: [], how };
    push.pot = null; push.charge = null; push.arrow.visible = false;
    label(`${v.toFixed(1)} m/s`); push.sprite.visible = true; push.sprite.position.set(0, slotY() + 0.5, SLOT_Z);
    log("push", { floor: where, v, how });
  }
  function stepPush(dt) {
    const f = push.flying;
    if (f) {
      f.t += dt;
      // it slides the last few centimetres to the edge of the ledge, then flies (from the edge, as a projectile)
      const z = EDGE + f.v * f.t, y = f.y - 0.5 * G * f.t * f.t;
      if (y <= 0) {
        const tl = Math.sqrt((2 * f.y) / G), zl = EDGE + f.v * tl;
        f.p.position.set(0, 0, zl); f.pts.push(new THREE.Vector3(0, 0.02, zl)); f.line.geometry.setFromPoints(f.pts);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.17, 32), new THREE.MeshBasicMaterial({ color: 0xffb02e, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.02, zl); scene.add(ring);
        push.flights.push([f.p, f.line, ring]); push.flying = null; push.waitNew = 0.8;
        while (push.flights.length > 3) for (const o of push.flights.shift()) scene.remove(o);
      } else {
        f.p.position.set(0, y, z); f.p.rotation.x += dt * 2.5;
        f.pts.push(new THREE.Vector3(0, y + 0.1, z)); f.line.geometry.setFromPoints(f.pts);
      }
    }
    if (push.waitNew > 0 && (push.waitNew -= dt) <= 0 && where) newTestPot();
  }
  /** In VR, every frame: the trigger charge, the hand push, and the hint when you point at the pot. */
  function updatePush(dt) {
    if (!where) return;
    const ch = push.charge;
    if (ch) {
      ch.t += dt;
      const v = chargeSpeed(ch.t);
      setArrow(v); label(`${v.toFixed(1)} m/s`); push.sprite.visible = true; push.sprite.position.set(0, slotY() + 0.5, SLOT_Z);
      if (push.pot) push.pot.rotation.z = Math.sin(ch.t * 40) * 0.004 * v;
      const gp = ch.c.userData.source && ch.c.userData.source.gamepad, hap = gp && gp.hapticActuators && gp.hapticActuators[0];
      if (hap && hap.pulse) { try { hap.pulse(Math.min(1, 0.08 + v / 8), 40); } catch (e) { /* not supported */ } }
    }
    // pushing it with the controller itself
    const centre = push.pot ? push.pot.position.clone().add(new THREE.Vector3(0, 0.12, 0)) : null;
    for (const c of ctrls) {
      if (!c.userData.source) continue;
      const p = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld), q = push.prev.get(c);
      push.prev.set(c, p);
      if (!q || !centre || push.charge || push.flying || dt <= 0) continue;
      const vz = (p.z - q.z) / dt;
      if (p.distanceTo(centre) < 0.16 && vz > 0.4) launch(vz, "hand");
    }
    // pointing at the pot: say what to do (once, before the first push)
    if (!ch && !push.flying && push.pot) {
      const pointing = ctrls.some((c) => c.userData.source && potHit(c));
      if (pointing && !push.hover) { label("", "Hold the trigger to push"); push.sprite.visible = true; push.sprite.position.set(0, slotY() + 0.5, SLOT_Z); }
      if (!pointing && push.hover && push.sprite.visible && !push.flights.length) push.sprite.visible = false;
      push.hover = pointing;
    }
  }
  function clearPush() {
    if (push.flying) { scene.remove(push.flying.p, push.flying.line); push.flying = null; }
    for (const f of push.flights) for (const o of f) scene.remove(o);
    push.flights = []; push.charge = null; push.waitNew = 0;
    if (push.pot) { scene.remove(push.pot); push.pot = null; }
    if (push.arrow) push.arrow.visible = false;
    if (push.sprite) push.sprite.visible = false;
  }

  /** In the preview only, with ?answer: the numbers of this case. */
  function answerBoard() {
    const b = makeBoard(1.6, 1.1, (g, W) => {
      write(g, `**Case ${seed}: the answer**`, 50, 40, W - 100, { size: 52 });
      write(g, `Floor height *h* = ${C.h.toFixed(2)} m, rail height ${C.rail.toFixed(2)} m\nFell from floor **${C.floor}**: *H* = ${C.H.toFixed(2)} m above the ground\nSpeed *v*₀ = ${C.v0.toFixed(2)} m/s, time *t* = ${C.t.toFixed(2)} s\nLanded *d* = ${C.d.toFixed(2)} m from the ledge line\nBranch broken at ${C.xb.toFixed(2)} m out, ${C.yb.toFixed(2)} m up\nBalconies with a gap: ${C.suspects.join(", ")}`, 50, 140, W - 100, { size: 38 });
    });
    b.mesh.position.set(-6, 3.5, 8); b.mesh.rotation.y = 0.5; b.mesh.scale.setScalar(2.4); scene.add(b.mesh);
    renderer.xr.addEventListener("sessionstart", () => { b.mesh.visible = false; });
    window.caseAnswer = { ...C, R: undefined };
  }

  // ---------- moving: the joystick, jumping and turning ----------
  const head = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let turnReady = true, telAim = false, comfort = 0;
  const telLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7fe3ff }));
  const telMark = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 40), new THREE.MeshBasicMaterial({ color: 0x7fe3ff, side: THREE.DoubleSide }));
  telMark.rotation.x = -Math.PI / 2; telLine.visible = telMark.visible = false; telLine.frustumCulled = false; scene.add(telLine, telMark);
  const telTarget = new THREE.Vector3();
  const stick = (c) => { const gp = c && c.userData.source && c.userData.source.gamepad; if (!gp || !gp.axes) return [0, 0]; return gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0]; };
  /** Where you can stand now: a few boxes on the floor (in world x, z) that together make up the space. */
  function areas() {
    if (lift.state !== "idle" && lift.state !== "opening") return [{ x0: -CAR.x + 0.2, x1: CAR.x - 0.2, z0: CAR.z0 + 0.2, z1: CAR.z1 - 0.15 }];
    const A = [
      { x0: -CAR.x + 0.2, x1: CAR.x - 0.2, z0: CAR.z0 + 0.2, z1: CAR.z1 - 0.15 },                  // in the lift
      { x0: -CAR.door + 0.15, x1: CAR.door - 0.15, z0: CAR.z1 - 0.3, z1: -ROOM_D + 0.3 },            // its doorway
      { x0: -BW / 2 + 0.2, x1: BW / 2 - 0.2, z0: -ROOM_D + 0.2, z1: -0.25 },                         // the room
      { x0: -DOOR_W / 2 + 0.15, x1: DOOR_W / 2 - 0.15, z0: -0.4, z1: 0.4 },                          // the glass doorway
    ];
    if (lift.level === 1) A.push(YARD);
    else A.push({ x0: -BW / 2 + 0.2, x1: BW / 2 - 0.2, z0: 0.2, z1: DEPTH - LEDGE - 0.05 });      // the balcony
    return A;
  }
  function keepInside() {
    camera.getWorldPosition(head);
    let best = null, bd = Infinity;
    for (const b of areas()) {
      const x = Math.max(b.x0, Math.min(b.x1, head.x)), z = Math.max(b.z0, Math.min(b.z1, head.z)), d = (x - head.x) ** 2 + (z - head.z) ** 2;
      if (d < bd) { bd = d; best = [x, z]; }
      if (d === 0) return;
    }
    rig.position.x += best[0] - head.x; rig.position.z += best[1] - head.z;
  }
  function locomotion(dt) {
    const lc = tapeCtrl || ctrls.find((c) => c.userData.hand === "left");
    const L = lc && lc === radio.held ? [0, 0] : stick(lc), Rs = rangeCtrl && rangeCtrl === radio.held ? [0, 0] : stick(rangeCtrl);
    let moving = false;
    camera.getWorldPosition(head); camera.getWorldDirection(fwd); fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize(); right.crossVectors(fwd, UP);
    const mag = Math.hypot(L[0], L[1]);
    if (mag > 0.2) {
      const k = (MOVE_SPEED * dt * Math.min(1, (mag - 0.2) / 0.6)) / mag;
      rig.position.addScaledVector(fwd, -L[1] * k).addScaledVector(right, L[0] * k);
      moving = true;
    }
    keepInside();
    // right stick: sideways turns in 30° steps; forwards aims a jump, letting go jumps (in the courtyard)
    camera.getWorldPosition(head);
    const inYard = lift.level === 1 && head.z > YARD.z0 - 0.01;
    if (inYard && rangeCtrl && Rs[1] < -0.6) { telAim = true; aimTeleport(rangeCtrl); }
    else if (telAim && Rs[1] > -0.3) {
      telAim = false; telLine.visible = telMark.visible = false;
      if (telMark.userData.ok) { camera.getWorldPosition(head); rig.position.x += telTarget.x - head.x; rig.position.z += telTarget.z - head.z; comfort = 0.8; tut.ev.jumped = true; log("jump"); }
    }
    if (Math.abs(Rs[0]) > 0.7 && turnReady && !telAim) {
      turnReady = false;
      const a = Rs[0] > 0 ? -SNAP : SNAP;
      camera.getWorldPosition(head);
      const ry = rig.position.y; rig.position.sub(head).applyAxisAngle(UP, a).add(head); rig.position.y = ry; rig.rotation.y += a; tut.ev.turned = true;
      comfort = Math.max(comfort, 0.6);
    } else if (Math.abs(Rs[0]) < 0.3) turnReady = true;
    comfort = moving ? Math.min(1, comfort + dt * 6) : Math.max(0, comfort - dt * 3);
    rig.updateMatrixWorld(true);
  }
  function aimTeleport(c) {
    aim(c);
    const o = ray.ray.origin, v = ray.ray.direction.clone().multiplyScalar(8), pts = [];
    let land = null;
    for (let i = 0; i < 80; i++) {
      const t = i * 0.03, p = new THREE.Vector3(o.x + v.x * t, o.y + v.y * t - 4.9 * t * t, o.z + v.z * t);
      if (p.y <= 0) { land = p.setY(0.02); pts.push(land); break; }
      pts.push(p);
    }
    telLine.geometry.dispose(); telLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    const b = YARD, ok = !!land && land.x > b.x0 && land.x < b.x1 && land.z > b.z0 && land.z < b.z1;
    telMark.userData.ok = ok; telLine.visible = true; telMark.visible = !!land;
    if (land) { telMark.position.copy(land); telTarget.copy(land); }
    telMark.material.color.setHex(ok ? 0x7fe3ff : 0xff6a5c); telLine.material.color.setHex(ok ? 0x7fe3ff : 0xff6a5c);
  }
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
    vignette.visible = comfort > 0.01; if (!vignette.visible) return;
    camera.getWorldPosition(head); camera.getWorldQuaternion(tmpQ);
    vignette.position.copy(head).add(new THREE.Vector3(0, 0, -0.4).applyQuaternion(tmpQ)); vignette.quaternion.copy(tmpQ);
    vignette.material.opacity = 0.92 * comfort;
  }

  // ---------- VR ----------
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
  function readyVR() {
    const supported = navigator.xr ? navigator.xr.isSessionSupported("immersive-vr").catch(() => false) : Promise.resolve(false);
    supported.then(async (ok) => {
      note.innerHTML = ok
        ? `<p><b>Case ${seed}.</b> Clear a space, put the headset on, then start. Walk, or move with the left stick.</p><button type="button" class="btn v3-enter">Start VR</button>`
        : `<p><b>This browser cannot open VR.</b> Open vr.phylab.uk/case/ in the browser of a VR headset (for example Meta Quest). Below is a preview of the courtyard: drag to turn it.</p>`;
      note.hidden = false;
      const b = note.querySelector(".v3-enter"); if (b) b.addEventListener("click", () => enter());
      if (!ok) return;
      if (await sessionGranted()) enter("handed on"); else offer();
    });
  }
  renderer.xr.addEventListener("sessionstart", () => {
    controls.enabled = false;
    camera.position.set(0, 0, 0); camera.quaternion.identity();
    if (S) goTo(1);
    rig.position.set(START.x, 0, START.z); rig.rotation.set(0, 0, 0); bodyYaw = null;
    if (listener.context.state !== "running") listener.context.resume();
    if (S) { radio.obj.visible = true; if (tut.phase === "off") setTimeout(startTutorial, 1500); }
  });
  renderer.xr.addEventListener("sessionend", () => {
    if (S) { goTo(1); radio.obj.visible = false; S.subMesh.visible = false; hush(); setLabels(null); if (tut.phase !== "case") tut.phase = "off"; radio.held = null; }
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); comfort = 0;
    controls.enabled = true; resetView(); log("exit"); offer();
  });

  // ---------- size and the frame loop ----------
  function resize() {
    if (renderer.xr.isPresenting) return;
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage); resize();
  root.querySelector(".v3-view").addEventListener("click", resetView);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), xr = renderer.xr.isPresenting;
    if (S) stepLift(dt);
    if (xr && S) { locomotion(dt); renderer.xr.updateCamera(camera); placeVignette(); updateTools(); updatePush(dt); placeRadio(dt); radioStick(dt); stepTutorial(dt); }
    else if (!xr) controls.update();
    if (S) stepPush(dt);
    renderer.render(scene, camera);
  });

  // for checking: /case/?debugcase exposes the scene in the console
  if (qs.has("debugcase")) window.cs = { C, scene, camera, controls, renderer, rig, goTo: (n) => goTo(n), push: (v) => launch(v, "debug"), lift: (n) => callLift(n), sub: (t) => { S.subMesh.visible = true; showSub("Control (radio)", t); }, charge: (t) => { push.charge = { c: ctrls[0], t }; updatePush(0); }, get S() { return S; } };
}
