// vr.phylab.uk — the crystal cabinet (/cabinet/).
// A museum cabinet with nine crystals from nature and from everyday life. Take one out and zoom in three steps:
//   1  the object, at about the size you would hold it;
//   2  the same shape built from unit-cell "bricks" (Haüy's idea: a crystal's flat faces and fixed angles come from
//      identical cells stacked in rows), with how many cells there really are;
//   3  the atoms of a few unit cells.
// The atomic positions are real (checked against published bond lengths: quartz Si–O 1.61 Å, pyrite Fe–S 2.26 Å and
// S–S 2.16 Å, calcite C–O 1.29 Å and Ca–O 2.36 Å, ice O–O 2.76 Å). Either hand: point and press the trigger (or pinch)
// to choose a crystal or press a button; trigger or grip elsewhere holds the crystal; the stick up and down resizes it.
import * as THREE from "/vendor/three/three.min.js";
import { PROJECTS } from "/projects.js";
import { sessionGranted, goInVR } from "/xr-nav.js";
import { makeBoard, write, INK, SOFT } from "/lab-text.js";
const { OrbitControls, mergeGeometries } = THREE;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R3 = Math.sqrt(3);
const OBJ = 0.13;                                   // metres per object unit in the viewer (objects are about 2 units wide)
const SHELF = 0.1;                                  // the same on the shelves
const STAGE = V(0.34, -0.3, -0.72), BOARD = V(-0.6, -0.28, -0.58), CAB = V(0, 0, -2.25);
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sup = (n) => String(n).split("").map((d) => (d === "-" ? "⁻" : SUP[+d])).join("");
/** "×25", "×4 × 10⁷" */
function times(x) {
  const e = Math.floor(Math.log10(x));
  if (e < 3) return `×${x < 10 ? Math.round(x * 10) / 10 : Math.round(x / 10 ** (e - 1)) * 10 ** (e - 1)}`;
  let m = Math.round(x / 10 ** e), ee = e;
  if (m === 10) { m = 1; ee++; }
  return `×${m === 1 ? "" : m + " × "}10${sup(ee)}`;
}

// ---------- the atoms ----------
const EL = {
  Na: { name: "sodium ion Na⁺", color: 0x9a6be0, r: 0.55 }, Cl: { name: "chloride ion Cl⁻", color: 0x48c063, r: 0.95 },
  Ow: { name: "oxygen (one per water molecule)", color: 0xe8433a, r: 0.5 }, Si: { name: "silicon", color: 0xd9b26a, r: 0.55 },
  O: { name: "oxygen", color: 0xe8433a, r: 0.42 }, Fe: { name: "iron", color: 0xb7673a, r: 0.55 }, S: { name: "sulfur", color: 0xf0d23a, r: 0.6 },
  C: { name: "carbon", color: 0xa3abbd, r: 0.36 }, Sw: { name: "silicon", color: 0x8d9ab8, r: 0.5 }, Cg: { name: "carbon", color: 0x8a90a0, r: 0.3 },
  Ca: { name: "calcium ion Ca²⁺", color: 0x5aa0e8, r: 0.6 }, Cc: { name: "carbon", color: 0x9aa0ac, r: 0.3 }, Cu: { name: "copper", color: 0xd68a50, r: 0.75 },
};
const cubic = (a) => [[a, 0, 0], [0, a, 0], [0, 0, a]];
const hexa = (a, c) => [[a, 0, 0], [-a / 2, (a * R3) / 2, 0], [0, 0, c]];
const FCC = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
const DIA = [...FCC, [0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]];
const at = (el, list) => list.map((f) => [el, f]);
const LAT = {
  nacl: { a: 5.64, vecs: cubic(5.64), n: [2, 2, 2], basis: [...at("Cl", FCC), ...at("Na", [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5], [0.5, 0.5, 0.5]])], bonds: [] },
  ice: { a: 4.52, vecs: hexa(4.518, 7.356), n: [2, 2, 1], basis: at("Ow", [[1 / 3, 2 / 3, 0.0625], [2 / 3, 1 / 3, 0.5625], [2 / 3, 1 / 3, 0.9375], [1 / 3, 2 / 3, 0.4375]]), bonds: [["Ow", "Ow", 2.9]] },
  quartz: { a: 4.91, vecs: hexa(4.913, 5.405), n: [2, 2, 2],
    basis: [...at("Si", [[0.4697, 0, 2 / 3], [0, 0.4697, 1 / 3], [0.5303, 0.5303, 0]]),
      ...at("O", [[0.4135, 0.2669, 0.7857], [0.7331, 0.1466, 0.4524], [0.8534, 0.5865, 0.119], [0.2669, 0.4135, 0.2143], [0.1466, 0.7331, 0.5476], [0.5865, 0.8534, 0.881]])],
    bonds: [["Si", "O", 1.7, true]] },
  pyrite: { a: 5.42, vecs: cubic(5.417), n: [1, 1, 1],
    basis: [...at("Fe", FCC), ...at("S", [[0.385, 0.385, 0.385], [0.615, 0.615, 0.615], [0.115, 0.615, 0.885], [0.885, 0.385, 0.115], [0.615, 0.885, 0.115], [0.385, 0.115, 0.885], [0.885, 0.115, 0.615], [0.115, 0.885, 0.385]])],
    bonds: [["S", "S", 2.3, true], ["Fe", "S", 2.4]] },
  diamond: { a: 3.57, vecs: cubic(3.567), n: [2, 2, 2], basis: at("C", DIA), bonds: [["C", "C", 1.6]] },
  silicon: { a: 5.43, vecs: cubic(5.431), n: [2, 2, 2], basis: at("Sw", DIA), bonds: [["Sw", "Sw", 2.4]] },
  graphite: { a: 2.46, vecs: hexa(2.464, 6.711), n: [3, 3, 1], basis: at("Cg", [[0, 0, 0.25], [0, 0, 0.75], [1 / 3, 2 / 3, 0.25], [2 / 3, 1 / 3, 0.75]]), bonds: [["Cg", "Cg", 1.5]] },
  calcite: { a: 4.99, vecs: hexa(4.99, 17.062), n: [1, 1, 1],
    basis: [...at("Ca", [[0, 0, 0], [2 / 3, 1 / 3, 1 / 3], [1 / 3, 2 / 3, 2 / 3], [0, 0, 0.5], [2 / 3, 1 / 3, 5 / 6], [1 / 3, 2 / 3, 1 / 6]]),
      ...at("Cc", [[0, 0, 0.25], [2 / 3, 1 / 3, 7 / 12], [1 / 3, 2 / 3, 11 / 12], [0, 0, 0.75], [2 / 3, 1 / 3, 1 / 12], [1 / 3, 2 / 3, 5 / 12]]),
      ...at("O", [[0.2578, 0, 0.25], [0.9245, 1 / 3, 7 / 12], [0.5911, 2 / 3, 11 / 12], [0, 0.2578, 0.25], [2 / 3, 0.5911, 7 / 12], [1 / 3, 0.9245, 11 / 12],
        [0.7422, 0.7422, 0.25], [0.4089, 0.0755, 7 / 12], [0.0755, 0.4089, 11 / 12], [0.7422, 0, 0.75], [0.4089, 1 / 3, 1 / 12], [0.0755, 2 / 3, 5 / 12],
        [0, 0.7422, 0.75], [2 / 3, 0.0755, 1 / 12], [1 / 3, 0.4089, 5 / 12], [0.2578, 0.2578, 0.75], [0.9245, 0.5911, 1 / 12], [0.5911, 0.9245, 5 / 12]])],
    bonds: [["Cc", "O", 1.4, true]] },
  copper: { a: 3.61, vecs: cubic(3.615), n: [2, 2, 2], basis: at("Cu", FCC), bonds: [] },
};
// lattice frame (z up) → scene (y up)
const toY = (v) => V(v[0], v[2], -v[1]);

// ---------- shapes of the objects (object units) and the bricks they are built from ----------
const SNOW = (() => {
  const segs = [];
  for (let k = 0; k < 6; k++) {
    const f = (k * Math.PI) / 3, d = V(Math.cos(f), 0, Math.sin(f));
    segs.push([d.clone().multiplyScalar(0.12), d.clone().multiplyScalar(1), 0.1]);
    for (const [t, len] of [[0.45, 0.34], [0.72, 0.22]])
      for (const s of [1, -1]) {
        const g = f + (s * Math.PI) / 3, e = V(Math.cos(g), 0, Math.sin(g)), p = d.clone().multiplyScalar(t);
        segs.push([p, p.clone().addScaledVector(e, len), 0.075]);
      }
  }
  return segs;
})();
const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
const hexIn = (x, z, r) => { for (let k = 0; k < 6; k++) { const g = Math.PI / 6 + (k * Math.PI) / 3; if (x * Math.sin(g) + z * Math.cos(g) > r * Math.cos(Math.PI / 6) + 1e-9) return false; } return true; };
const RHOMB = (() => { const th = Math.asin(Math.sqrt(0.804)); return [0, 1, 2].map((k) => { const f = (k * 2 * Math.PI) / 3; return V(Math.sin(th) * Math.cos(f), Math.cos(th), Math.sin(th) * Math.sin(f)).multiplyScalar(1.15); }); })();
const RHOMB_INV = new THREE.Matrix4().makeBasis(...RHOMB).invert();
const hexBricks = (a, c) => [V(a, 0, 0), V(-a / 2, 0, (-a * R3) / 2), V(0, c, 0)];
const cubeBricks = (a) => [V(a, 0, 0), V(0, a, 0), V(0, 0, a)];

// ---------- materials and object geometry ----------
function canvasTex(size, draw) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  draw(cv.getContext("2d"), size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const gem = (color, opacity, o = {}) => new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.2, flatShading: true, ...o });
const TEX = {};
function stripes(vertical) {
  return canvasTex(256, (g, n) => {
    g.fillStyle = "#e6c862"; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 60; i++) {
      const p = Math.random() * n, w = 1 + Math.random() * 3;
      g.fillStyle = Math.random() < 0.5 ? "rgba(90,64,20,0.35)" : "rgba(255,236,170,0.35)";
      vertical ? g.fillRect(p, 0, w, n) : g.fillRect(0, p, n, w);
    }
  });
}
function waferTop() {
  return canvasTex(512, (g, n) => {
    g.fillStyle = "#9ea4b0"; g.fillRect(0, 0, n, n);
    const s = 30, c = n / 2;
    for (let x = 8; x < n - s; x += s + 3) for (let y = 8; y < n - s; y += s + 3) {
      const mx = x + s / 2 - c, my = y + s / 2 - c;
      if (Math.hypot(Math.abs(mx) + s / 2, Math.abs(my) + s / 2) > c - 14) continue;
      g.fillStyle = `hsl(${(200 + (mx * 0.6 + my * 0.4)) % 360} 45% ${52 + 10 * Math.sin(mx / 40)}%)`; g.fillRect(x, y, s, s);
      g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(x + 4, y + 4, s - 8, 3);
    }
  });
}
function grains() {
  return canvasTex(256, (g, n) => {
    const seeds = Array.from({ length: 34 }, () => [Math.random() * n, Math.random() * n, 0.75 + Math.random() * 0.4]);
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let best = 1e9, s2 = 1e9, k = 0;
      seeds.forEach((s, i) => { const d = (s[0] - x) ** 2 + (s[1] - y) ** 2; if (d < best) { s2 = best; best = d; k = i; } else if (d < s2) s2 = d; });
      const edge = Math.sqrt(s2) - Math.sqrt(best) < 1.6 ? 0.6 : 1, f = seeds[k][2] * edge, i4 = (y * n + x) * 4;
      img.data[i4] = 205 * f; img.data[i4 + 1] = 120 * f; img.data[i4 + 2] = 72 * f; img.data[i4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}

/** The object itself, about 2 units across, as a Group. */
function makeObject(sp) {
  const g = new THREE.Group();
  const add = (geo, mat, f) => { const m = new THREE.Mesh(geo, mat); if (f) f(m); g.add(m); return m; };
  switch (sp.id) {
    case "salt": add(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshPhysicalMaterial({ color: 0xf4f2ec, roughness: 0.35, transparent: true, opacity: 0.9, clearcoat: 0.4 })); break;
    case "snow": {
      const parts = SNOW.map(([a, b, w]) => { const d = b.clone().sub(a), geo = new THREE.BoxGeometry(d.length(), 0.05, w); geo.rotateY(-Math.atan2(d.z, d.x)); geo.translate(...a.clone().add(b).multiplyScalar(0.5).toArray()); return geo; });
      parts.push(new THREE.CylinderGeometry(0.2, 0.2, 0.055, 6));
      add(mergeGeometries(parts.map((p) => p.toNonIndexed())), new THREE.MeshPhysicalMaterial({ color: 0xe6f3ff, emissive: 0x1d3048, roughness: 0.15, transparent: true, opacity: 0.92, clearcoat: 1, envMapIntensity: 1.6 }));
      break;
    }
    case "quartz": {
      const mat = gem(0xeef4ff, 0.5);
      add(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 6), mat, (m) => (m.position.y = -0.27));
      add(new THREE.CylinderGeometry(0, 0.45, 0.55, 6), mat, (m) => (m.position.y = 0.655));
      break;
    }
    case "pyrite": {
      TEX.pv = TEX.pv || stripes(true); TEX.ph = TEX.ph || stripes(false);
      const m = (t) => new THREE.MeshStandardMaterial({ map: t, metalness: 0.75, roughness: 0.3, envMapIntensity: 2.4 });
      const v = m(TEX.pv), h = m(TEX.ph);
      add(new THREE.BoxGeometry(1.5, 1.5, 1.5), [v, v, v, v, h, h]); // stripes turn by 90° from face to face
      break;
    }
    case "diamond": add(new THREE.OctahedronGeometry(1), gem(0xffffff, 0.55, { envMapIntensity: 3, iridescence: 0.5 })); break;
    case "wafer": {
      TEX.wafer = TEX.wafer || waferTop();
      const side = new THREE.MeshStandardMaterial({ color: 0x8a8f99, metalness: 0.9, roughness: 0.3 });
      add(new THREE.CylinderGeometry(1, 1, 0.035, 72), [side, new THREE.MeshStandardMaterial({ map: TEX.wafer, metalness: 0.85, roughness: 0.12, envMapIntensity: 1.6 }), side]);
      break;
    }
    case "pencil": {
      const along = (geo, x) => { geo.rotateZ(-Math.PI / 2); geo.translate(x, 0, 0); return geo; };
      add(along(new THREE.CylinderGeometry(0.14, 0.14, 1.45, 6), -0.2), new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.45, flatShading: true }));
      add(along(new THREE.CylinderGeometry(0.045, 0.14, 0.32, 24), 0.685), new THREE.MeshStandardMaterial({ color: 0xe0b685, roughness: 0.8 }));
      add(along(new THREE.CylinderGeometry(0, 0.045, 0.1, 24), 0.895), new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.6, roughness: 0.35 }));
      add(along(new THREE.CylinderGeometry(0.145, 0.145, 0.12, 24), -0.985), new THREE.MeshStandardMaterial({ color: 0xc0c3c8, metalness: 0.9, roughness: 0.3 }));
      add(along(new THREE.CylinderGeometry(0.135, 0.135, 0.14, 24), -1.115), new THREE.MeshStandardMaterial({ color: 0xe88a92, roughness: 0.8 }));
      break;
    }
    case "calcite": {
      const geo = new THREE.BoxGeometry(1, 1, 1).applyMatrix4(new THREE.Matrix4().makeBasis(...RHOMB));
      add(geo.toNonIndexed(), gem(0xfff5df, 0.42));
      break;
    }
    case "copper": {
      TEX.grains = TEX.grains || grains();
      add(new THREE.BoxGeometry(1.6, 0.45, 1.1), new THREE.MeshStandardMaterial({ map: TEX.grains, metalness: 0.75, roughness: 0.32, envMapIntensity: 2.2 }));
      break;
    }
  }
  return g;
}

// ---------- the nine specimens ----------
// size: real size; real: that size in metres; span: the same length in object units (for the magnification)
const SPECIMENS = [
  { id: "salt", title: "Rock salt", formula: "NaCl", system: "cubic", lat: "nacl", size: "1 cm", real: 0.01, span: 1.6,
    bricks: { vecs: cubeBricks(0.16), shape: (p) => Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= 0.8, color: 0xf1efe8 },
    text: ["Rock salt (the mineral halite) grows as cubes, with flat faces meeting at right angles. Table salt grains are small versions of the same cubes.",
      "Why a cube? The crystal is built from identical cubic unit cells stacked face to face in straight rows. A 1 cm crystal is about **18 million** cells along each edge.",
      "Sodium ions and chloride ions alternate in all three directions, and each ion has 6 neighbours of the other kind. The yellow box is one unit cell: *a* = 0.564 nm."] },
  { id: "snow", title: "Snowflake", formula: "H₂O, ice", system: "hexagonal", lat: "ice", size: "3 mm", real: 0.003, span: 2,
    bricks: { vecs: hexBricks(0.075, 0.13), shape: (p) => Math.abs(p.y) <= 0.07 && (hexIn(p.x, p.z, 0.2) || SNOW.some(([a, b, w]) => segDist(V(p.x, 0, p.z), a, b) <= w / 2 + 0.01)), color: 0xdcecff },
    text: ["A snowflake is a single crystal of ice, a few millimetres across. However different two snowflakes look, every one has six arms at 60° to each other.",
      "Ice is built from cells with angles of 60° and 120°: a hexagonal lattice. The arms grow fastest along the directions of the lattice, so they meet at 60°. A 3 mm flake is about **7 million** cells across.",
      "The oxygen atoms of ice. Each water molecule is hydrogen-bonded to 4 others (the rods; one hydrogen atom sits along each rod), making open six-sided rings. That open structure is why ice floats on water. *a* = 0.452 nm, *c* = 0.736 nm."] },
  { id: "quartz", title: "Quartz", formula: "SiO₂", system: "hexagonal (trigonal)", lat: "quartz", size: "5 cm", real: 0.05, span: 1.85,
    bricks: { vecs: hexBricks(0.12, 0.13), shape: (p) => { const y = p.y + 0.27; if (y < -0.65 || y > 1.2) return false; const r = y <= 0.65 ? 0.45 : 0.45 * (1 - (y - 0.65) / 0.55); return hexIn(p.x, p.z, r); }, color: 0xe9eef8 },
    text: ["Quartz, silicon dioxide, grows as six-sided prisms ending in a point. Sand is mostly broken-up quartz.",
      "Six sides again, because quartz has a hexagonal lattice; the prism is long along the *c* axis of its cells. A 5 cm crystal is about **90 million** cells long.",
      "Each silicon atom sits at the centre of a tetrahedron of 4 oxygen atoms, and each oxygen joins 2 silicons. The tetrahedra wind in spirals along the *c* axis, so quartz comes in left-handed and right-handed crystals. *a* = 0.491 nm, *c* = 0.541 nm."] },
  { id: "pyrite", title: "Pyrite", formula: "FeS₂", system: "cubic", lat: "pyrite", size: "2 cm", real: 0.02, span: 1.5,
    bricks: { vecs: cubeBricks(0.15), shape: (p) => Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= 0.75, color: 0xd2b25a },
    text: ["Pyrite, iron disulfide, is called fool's gold. It can grow as almost perfect cubes straight out of the rock, often with fine grooves that turn by 90° from one face to the next.",
      "Cubes, because the unit cell is a cube. A 2 cm cube is about **37 million** cells along each edge.",
      "Iron atoms form a face-centred cubic pattern. Sulfur atoms come in pairs (S₂), and the pairs point along four different diagonals of the cube. Because of that tilt the cube's faces are not all alike, and the grooves on neighbouring faces run at right angles. *a* = 0.542 nm."] },
  { id: "diamond", title: "Diamond", formula: "C", system: "cubic", lat: "diamond", size: "5 mm", real: 0.005, span: 2,
    bricks: { vecs: cubeBricks(0.155), shape: (p) => Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.z) <= 1.02, color: 0xf2f6ff },
    text: ["Natural diamonds often grow as octahedra, with eight triangular faces.",
      "An octahedron stacked from cubic cells: its faces lie along the planes most densely packed with atoms, which grow slowest and so become the faces. A 5 mm diamond is about **14 million** cells across.",
      "Every carbon atom is bonded to 4 others at the corners of a tetrahedron, and this network of strong bonds runs through the whole crystal: that is why diamond is so hard. *a* = 0.357 nm."] },
  { id: "wafer", title: "Silicon wafer", formula: "Si", system: "cubic", lat: "silicon", size: "30 cm", real: 0.3, span: 2,
    bricks: { vecs: cubeBricks(0.16), shape: (p) => Math.max(Math.abs(p.x), Math.abs(p.z)) <= 0.8 && Math.abs(p.y) <= 0.24, color: 0xa8b0c2, piece: "a tiny square of the wafer" },
    text: ["A silicon wafer, 30 cm across and under 1 mm thick, is sliced from one single crystal of silicon. Hundreds of chips are made on it.",
      "The whole wafer is one crystal: every cell lines up the same way across 30 cm, about **550 million** cells. The transistors on a modern chip are only tens of nanometres wide, so a transistor is about a hundred cells across or fewer.",
      "Silicon has the same structure as diamond: each atom bonded to 4 neighbours in a tetrahedron. *a* = 0.543 nm."] },
  { id: "pencil", title: "Pencil lead", formula: "C, graphite", system: "hexagonal", lat: "graphite", size: "17 cm", real: 0.17, span: 2.25,
    bricks: { vecs: hexBricks(0.13, 0.2), shape: (p) => Math.abs(p.x) <= 0.9 && Math.abs(p.z) <= 0.65 && Math.abs(p.y) <= 0.4, layers: [0x6c7280, 0x9aa0ad], piece: "a tiny flake of the lead" },
    text: ["A pencil 'lead' is graphite mixed with clay. Writing works because graphite comes off onto the paper in thin flakes.",
      "Graphite is built in flat layers stacked on top of each other (the two shades). The layers hold together only weakly, so they slide off easily. A flake 0.1 mm thick is about **300 000** layers.",
      "Each layer is a sheet of carbon hexagons, each atom bonded to 3 neighbours: one layer on its own is graphene. The layers are 0.335 nm apart, more than twice the bond length of 0.142 nm. *a* = 0.246 nm, *c* = 0.671 nm."] },
  { id: "calcite", title: "Calcite", formula: "CaCO₃", system: "hexagonal (trigonal)", lat: "calcite", size: "3 cm", real: 0.03, span: 1.9,
    bricks: { vecs: RHOMB.map((v) => v.clone().multiplyScalar(0.12 / 1.15)), shape: (p) => { const q = p.clone().applyMatrix4(RHOMB_INV); return Math.max(Math.abs(q.x), Math.abs(q.y), Math.abs(q.z)) <= 0.5; }, color: 0xfff0d6, haüy: true },
    text: ["Calcite, calcium carbonate, breaks cleanly into rhombohedra: slanted boxes with all faces alike. Look through a clear piece (Iceland spar) and everything behind it appears double.",
      "Around 1781 René Just Haüy dropped a calcite crystal and saw it break into smaller and smaller rhombohedra of the same shape. He guessed that every crystal is built from tiny identical bricks: the idea of the unit cell.",
      "Calcium ions and flat carbonate groups (CO₃: one carbon with 3 oxygens in a triangle). All the triangles lie in parallel planes, so light travels at different speeds in different directions: that splits one image into two (double refraction). Hexagonal cell: *a* = 0.499 nm, *c* = 1.706 nm."] },
  { id: "copper", title: "Copper", formula: "Cu", system: "cubic", lat: "copper", size: "3 cm", real: 0.03, span: 1.6,
    bricks: { vecs: cubeBricks(0.1), shape: (p) => Math.abs(p.x) <= 0.8 && Math.abs(p.y) <= 0.225 && Math.abs(p.z) <= 0.55,
      grains: [{ color: 0xd68a50, rot: 0, test: (p) => p.x + 0.4 * p.z < -0.1 }, { color: 0xb8703e, rot: 0.42, test: (p) => p.x + 0.4 * p.z >= -0.1 && p.z - 0.5 * p.x < 0.25 }, { color: 0xe6a06a, rot: -0.3, test: (p) => p.x + 0.4 * p.z >= -0.1 && p.z - 0.5 * p.x >= 0.25 }] },
    text: ["A piece of copper, polished and etched with acid. The patches are grains: each grain is a separate crystal.",
      "Inside one grain the cubic cells all line up; across a grain boundary the direction changes (three grains here). Metals bend without breaking because planes of atoms can slip past each other inside the grains.",
      "Copper is face-centred cubic: each atom touches 12 neighbours, the closest possible packing of equal spheres. *a* = 0.361 nm."] },
];

// ---------- building the three steps ----------
function brickMesh(sp) {
  const B = sp.bricks, list = [];
  const grainsList = B.grains || [{ color: B.color, rot: 0, test: () => true }];
  for (const gr of grainsList) {
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), gr.rot);
    const vecs = B.vecs.map((v) => v.clone().applyQuaternion(q)), n = vecs.map((v) => Math.ceil(2.2 / v.length()) + 1);
    for (let i = -n[0]; i <= n[0]; i++) for (let j = -n[1]; j <= n[1]; j++) for (let k = -n[2]; k <= n[2]; k++) {
      const c = V(0, 0, 0).addScaledVector(vecs[0], i).addScaledVector(vecs[1], j).addScaledVector(vecs[2], k);
      if (c.lengthSq() < 9 && B.shape(c) && gr.test(c)) list.push({ c, vecs, color: B.layers ? B.layers[((k % 2) + 2) % 2] : gr.color });
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: sp.id === "pyrite" || sp.id === "copper" ? 0.6 : 0.05 }), Math.max(1, list.length));
  const m = new THREE.Matrix4(), col = new THREE.Color();
  list.forEach((b, i) => {
    m.makeBasis(...b.vecs.map((v) => v.clone().multiplyScalar(0.86))).setPosition(b.c);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.set(b.color).multiplyScalar(0.72 + 0.32 * Math.random()));
  });
  mesh.count = list.length;
  return { mesh, n: list.length };
}

/** A few unit cells of atoms (positions in Å), with bonds and one unit cell outlined. */
function atomBlock(sp) {
  const L = LAT[sp.lat], vecs = L.vecs.map(toY), n = L.n, eps = 1e-3;
  const cart = (f) => V(0, 0, 0).addScaledVector(vecs[0], f[0]).addScaledVector(vecs[1], f[1]).addScaledVector(vecs[2], f[2]);
  const all = [];
  for (let i = -1; i <= n[0]; i++) for (let j = -1; j <= n[1]; j++) for (let k = -1; k <= n[2]; k++)
    for (const [el, f] of L.basis) {
      const g = [f[0] + i, f[1] + j, f[2] + k];
      all.push({ el, g, p: cart(g), keep: g.every((v, a) => v >= -eps && v <= n[a] + eps) });
    }
  const keep = all.filter((a) => a.keep);
  for (const [A, Bn, max, whole] of L.bonds) {          // bring in the rest of a molecule or tetrahedron cut by the edge
    if (!whole) continue;
    for (const a of [...keep]) for (const b of all) {
      if (b.keep || !((a.el === A && b.el === Bn) || (a.el === Bn && b.el === A))) continue;
      if (a.p.distanceTo(b.p) < max) { b.keep = true; keep.push(b); }
    }
  }
  const group = new THREE.Group(), box = new THREE.Box3();
  keep.forEach((a) => box.expandByPoint(a.p));
  const centre = box.getCenter(V(0, 0, 0)), size = box.getSize(V(0, 0, 0));
  const els = [...new Set(keep.map((a) => a.el))], m = new THREE.Matrix4();
  for (const el of els) {
    const mine = keep.filter((a) => a.el === el), E = EL[el];
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(E.r, 28, 20), new THREE.MeshStandardMaterial({ color: E.color, roughness: 0.35, metalness: 0.1 }), mine.length);
    mine.forEach((a, i) => mesh.setMatrixAt(i, m.makeTranslation(a.p.x - centre.x, a.p.y - centre.y, a.p.z - centre.z)));
    group.add(mesh);
  }
  const pairs = [];
  for (const [A, Bn, max] of L.bonds)
    for (let i = 0; i < keep.length; i++) for (let j = i + 1; j < keep.length; j++) {
      const a = keep[i], b = keep[j];
      if (((a.el === A && b.el === Bn) || (a.el === Bn && b.el === A)) && a.p.distanceTo(b.p) < max) pairs.push([a.p, b.p]);
    }
  if (pairs.length) group.add(rods(pairs, 0.12, sp.lat === "ice" ? 0xbfe0ff : 0xc9cfdb, centre));
  // one unit cell, outlined
  const o = V(0, 0, 0), corners = [];
  for (const a of [0, 1]) for (const b of [0, 1]) for (const c of [0, 1]) corners.push(cart([a, b, c]));
  const edges = [];
  corners.forEach((p, i) => corners.forEach((q, j) => { if (j > i && [1, 2, 4].includes(i ^ j)) edges.push([p, q]); }));
  group.add(rods(edges, 0.06, 0xffd24a, centre.clone().sub(o), true));
  return { group, extent: Math.max(size.x, size.y, size.z) + 2, els };
}
function rods(pairs, r, color, centre, glow = false) {
  const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, 1, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: glow ? color : 0, emissiveIntensity: 0.4 }), pairs.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  pairs.forEach(([a, b], i) => {
    const d = b.clone().sub(a);
    q.setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
    m.compose(a.clone().add(b).multiplyScalar(0.5).sub(centre), q, V(1, d.length(), 1));
    mesh.setMatrixAt(i, m);
  });
  return mesh;
}

// ---------- the page ----------
export function startCabinet(root, { rec } = {}) {
  root.classList.add("v3");
  root.innerHTML = `
    <div class="v3-note" hidden></div>
    <div class="v3-stage"><p class="v3-flash" hidden></p></div>
    <div class="v3-bar">
      <p class="v3-hint">A preview: drag to turn the view, scroll to zoom. Click a crystal in the cabinet, then the buttons on the board.</p>
      <div class="v3-tools"><button type="button" class="btn ghost v3-view">Reset view</button></div>
    </div>`;
  const stageEl = root.querySelector(".v3-stage"), note = root.querySelector(".v3-note"), flashEl = root.querySelector(".v3-flash");
  const log = (action, d = {}) => rec && rec.event("cabinet", { action, ...d });
  function flash(msg) { flashEl.textContent = msg; flashEl.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { flashEl.hidden = true; }, 2500); }

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  stageEl.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1e2a);
  // reflections for the metals and gems: a soft room with a few bright panels
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), new THREE.MeshBasicMaterial({ color: 0x2c3242, side: THREE.BackSide })));
    for (const [x, y, z, w, h, c] of [[0, 3.9, 0, 6, 0.2, 7], [-5.9, 1.5, -2, 0.2, 3, 4], [5.9, 2, 2, 0.2, 2, 3], [2, 1, -5.9, 3, 1.4, 2.5]]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, Math.max(0.2, w === 0.2 ? 3 : 0.2)), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(c) }));
      p.position.set(x, y, z); env.add(p);
    }
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.03).texture; pm.dispose();
  }
  const rig = new THREE.Group(); scene.add(rig);
  const camera = new THREE.PerspectiveCamera(55, 1.6, 0.02, 40); rig.add(camera);
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3630, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(1, 4, 2.5); scene.add(sun);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.minDistance = 0.3; controls.maxDistance = 6;

  // ---------- the room and the cabinet ----------
  const floorTex = canvasTex(256, (g, n) => { g.fillStyle = "#3a2e26"; g.fillRect(0, 0, n, n); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#41342a" : "#362a22"; g.fillRect(0, (i * n) / 8, n, n / 8 - 2); } });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(4, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.4), new THREE.MeshStandardMaterial({ color: 0x2b3a3a, roughness: 0.95 }));
  wall.position.set(0, 1.7, CAB.z - 0.45); scene.add(wall);
  const cabinet = new THREE.Group(); cabinet.position.copy(CAB); scene.add(cabinet);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5e3f2a, roughness: 0.55 }), felt = new THREE.MeshStandardMaterial({ color: 0x1f3d36, roughness: 1 });
  const W = 2.5, H = 2.25, D = 0.5, COLS = [-0.8, 0, 0.8], ROWS = [1.92, 1.32, 0.72];
  const slab = (w, h, d, x, y, z, mat = wood) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); cabinet.add(m); return m; };
  slab(W, H, 0.04, 0, H / 2, -D / 2, felt);
  slab(0.06, H, D, -W / 2, H / 2, 0); slab(0.06, H, D, W / 2, H / 2, 0); slab(W + 0.1, 0.08, D + 0.06, 0, H + 0.04, 0); slab(W + 0.1, 0.4, D + 0.06, 0, 0.2, 0);
  for (const y of [0.42, 1.02, 1.62]) slab(W, 0.035, D, 0, y, 0);
  for (const x of [-0.4, 0.4]) slab(0.025, H - 0.45, D, x, 0.42 + (H - 0.45) / 2, 0, felt);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H - 0.4), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, roughness: 0, clearcoat: 1, depthWrite: false }));
  glass.position.set(0, 0.4 + (H - 0.4) / 2, D / 2 + 0.01); cabinet.add(glass);
  for (const x of COLS) for (const y of ROWS) { const lamp = new THREE.PointLight(0xfff1d6, 0.35, 0.9, 2); lamp.position.set(x, y + 0.24, 0.05); cabinet.add(lamp); }

  const pickables = [], cases = [];
  SPECIMENS.forEach((sp, i) => {
    const x = COLS[i % 3], y = ROWS[Math.floor(i / 3)];
    const obj = makeObject(sp); obj.scale.setScalar(SHELF); obj.position.set(x, y, 0); obj.rotation.set(0.25, 0.6, 0); cabinet.add(obj);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.56, 0.45), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    hit.position.set(x, y - 0.03, 0.02); hit.userData = { kind: "case", i }; cabinet.add(hit); pickables.push(hit);
    const label = makeBoard(0.5, 0.075, (g, Wc, Hc) => { write(g, `**${sp.title}**  ${sp.formula}`, 16, 4, Wc - 32, { size: 34 }); }, { ppm: 1000, radius: 10 });
    label.mesh.position.set(x, y - 0.255, D / 2 + 0.02); cabinet.add(label.mesh);
    cases.push({ sp, obj, label });
  });

  // ---------- the viewer: home holds the stage and the board, in front of you ----------
  const home = new THREE.Group(); scene.add(home);
  const stage = new THREE.Group(); home.add(stage);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 1, 40), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.6 }));
  home.add(plinth);
  const wraps = [0, 1, 2].map(() => { const w = new THREE.Group(); stage.add(w); return w; });
  const view = { i: -1, step: 0, from: 0, t: 1, scaleAtoms: 1, bricks: 0, els: [] };
  let headY = 1.55, held = null;
  function placeHome(pos, yaw, y) {
    headY = y;
    home.position.set(pos.x, 0, pos.z); home.rotation.set(0, yaw, 0);
    home.attach(stage);
    stage.position.set(STAGE.x, y + STAGE.y, STAGE.z); stage.rotation.set(0.25, 0, 0); stage.scale.setScalar(1);
    plinth.position.set(STAGE.x, (y + STAGE.y - 0.2) / 2, STAGE.z); plinth.scale.y = Math.max(0.2, y + STAGE.y - 0.2);
    board.mesh.position.set(BOARD.x, y + BOARD.y, BOARD.z);
    board.mesh.rotation.set(-0.12, Math.atan2(-BOARD.x, -BOARD.z), 0, "YXZ");
  }
  const resetView = () => { camera.position.set(0.05, headY + 0.2, 0.75); controls.target.set(0.0, headY - 0.3, -0.75); controls.update(); };

  function clearWraps() { wraps.forEach((w) => { w.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); if (o.isMesh && o.material && !o.material.map) [].concat(o.material).forEach((m) => m.dispose()); }); w.clear(); }); }
  function choose(i) {
    if (view.i >= 0) cases[view.i].obj.visible = true;
    clearWraps();
    view.i = i; view.step = 0; view.from = -1; view.t = 0;
    if (i < 0) { board.redraw(); return; }
    const sp = SPECIMENS[i];
    cases[i].obj.visible = false;
    const obj = makeObject(sp); obj.scale.setScalar(OBJ); wraps[0].add(obj);
    const br = brickMesh(sp); br.mesh.scale.setScalar(OBJ); wraps[1].add(br.mesh); view.bricks = br.n;
    const ab = atomBlock(sp); view.scaleAtoms = 0.34 / ab.extent; ab.group.scale.setScalar(view.scaleAtoms); wraps[2].add(ab.group); view.els = ab.els;
    stage.rotation.set(0.25, 0, 0);
    log("choose", { id: sp.id });
    board.redraw();
  }
  function go(step) {
    if (view.i < 0 || step === view.step || step < 0 || step > 2) return;
    view.from = view.step; view.step = step; view.t = 0;
    log("step", { id: SPECIMENS[view.i].id, step });
    board.redraw();
  }
  const ease = (t) => t * t * (3 - 2 * t);
  function animate(dt) {
    view.t = Math.min(1, view.t + dt / 0.9);
    const e = ease(view.t), inward = view.step > view.from;
    wraps.forEach((w, k) => {
      if (k === view.step) { w.visible = view.t > (inward ? 0 : 0.3); w.scale.setScalar(view.from < 0 ? 0.3 + 0.7 * e : inward ? 0.12 + 0.88 * e : 4 - 3 * e); }
      else if (k === view.from && view.t < 1) { w.visible = inward ? e < 0.7 : e < 0.5; w.scale.setScalar(inward ? 1 + 3 * e : 1 - 0.88 * e); }
      else w.visible = false;
    });
  }

  // ---------- the board ----------
  const others = PROJECTS.filter((p) => p.slug !== "cabinet");
  const STEPS = ["Object", "Built from cells", "Atoms"];
  function scaleLine(sp) {
    if (view.step === 0) { const m = (sp.span * OBJ) / sp.real; return `Real size about ${sp.size}; ${m < 1 ? `shown at ${Math.round(m * 100)}% of real size` : `shown magnified about ${times(m)}`}.`; }
    if (view.step === 1) {
      if (sp.bricks.haüy) return `Each brick stands for one tiny rhombohedron, far too small to see.`;
      const m = (sp.bricks.vecs[0].length() * OBJ) / (LAT[sp.lat].a * 1e-10);
      return `${sp.bricks.piece ? `This is ${sp.bricks.piece}. ` : ""}Each brick is one unit cell, drawn about ${times(m)} too big (${view.bricks} bricks here).`;
    }
    return `Magnified about ${times(view.scaleAtoms / 1e-10)}.`;
  }
  const board = makeBoard(1.3, 1.25, (g, Wb, Hb, btn) => {
    const M = 30, gap = 12, bh = 62, row = (n) => (Wb - 2 * M - gap * (n - 1)) / n;
    const ob = 52, wo = row(Math.max(1, others.length));
    write(g, "Other projects", M, Hb - ob - 56, Wb, { size: 22, color: SOFT });
    others.forEach((p, i) => btn(`go:${p.slug}`, p.title, M + i * (wo + gap), Hb - ob - 22, wo, ob, { size: 21 }));
    if (view.i < 0) {
      let y = write(g, "**The crystal cabinet**", M, 16, Wb - 2 * M, { size: 46, face: "serif" });
      write(g, "Nine crystals, from a snowflake to a silicon wafer. Each has the shape it has because of how its atoms are arranged.\n**Point at a crystal in the cabinet and press the trigger** to take it out. Then zoom in, in three steps: the object, the object built from its unit cells, and the atoms.\nHold the trigger or the grip anywhere else to hold the crystal and turn it; push the stick forwards or back to make it bigger or smaller.",
        M, y + 8, Wb - 2 * M, { size: 29, gap: 0.55 });
      return;
    }
    const sp = SPECIMENS[view.i];
    let y = write(g, `**${sp.title}**`, M, 12, Wb - 2 * M, { size: 44, face: "serif" });
    y = write(g, `${sp.formula} · ${sp.system} lattice`, M, y - 8, Wb - 2 * M, { size: 25, color: SOFT });
    const w3 = row(3);
    STEPS.forEach((t, k) => btn(`step:${k}`, `${k + 1}  ${t}`, M + k * (w3 + gap), y + 6, w3, bh, { on: view.step === k, size: 25 }));
    y += bh + 18;
    btn("out", "‹ Zoom out", M, y, w3, bh, { size: 25 });
    btn("in", "Zoom in ›", M + w3 + gap, y, w3, bh, { size: 25, tone: view.step < 2 ? "go" : "plain" });
    btn("back", "Put it back", M + 2 * (w3 + gap), y, w3, bh, { size: 25 });
    y += bh + 22;
    g.fillStyle = "#e9e5da"; g.fillRect(M, y - 8, Wb - 2 * M, 3);
    y = write(g, scaleLine(sp), M, y + 2, Wb - 2 * M, { size: 25, color: SOFT });
    y = write(g, sp.text[view.step], M, y + 6, Wb - 2 * M, { size: 28, gap: 0.5 });
    if (view.step === 2) {
      let x = M; y += 6;
      const items = [...view.els.map((e) => [EL[e].color, EL[e].name]), [0xffd24a, "one unit cell"]];
      for (const [c, name] of items) {
        g.font = '400 24px -apple-system, "Segoe UI", Arial, sans-serif';
        const w = g.measureText(name).width + 48;
        if (x + w > Wb - M) { x = M; y += 38; }
        g.fillStyle = "#" + new THREE.Color(c).getHexString(); g.beginPath(); g.arc(x + 13, y + 16, 12, 0, 7); g.fill();
        g.fillStyle = INK; g.fillText(name, x + 32, y + 25); x += w + 10;
      }
    }
  }, { ppm: 800 });
  home.add(board.mesh); pickables.push(board.mesh);

  function press(id) {
    if (!id) return;
    const [k, v] = id.split(":");
    if (k === "step") go(+v);
    else if (k === "in") go(view.step + 1);
    else if (k === "out") go(view.step - 1);
    else if (k === "back") choose(-1);
    else if (k === "go") { log("go", { to: v }); if (renderer.xr.isPresenting) goInVR(`/${v}/`); else location.href = `/${v}/`; }
  }
  /** What was hit: a board button, or a case in the cabinet. */
  function act(hit) {
    if (!hit) return false;
    const u = hit.object.userData;
    if (u.kind === "case") { if (view.i !== u.i) choose(u.i); return true; }
    if (u.kind === "board") { press(u.board.at(hit.uv)); return true; }
    return false;
  }
  let hoverCase = -1;
  function setHover(hit) {
    const u = hit && hit.object.userData;
    const c = u && u.kind === "case" ? u.i : -1;
    if (c !== hoverCase) { if (hoverCase >= 0) cases[hoverCase].obj.scale.setScalar(SHELF); if (c >= 0) cases[c].obj.scale.setScalar(SHELF * 1.18); hoverCase = c; }
    board.setHover(u && u.kind === "board" ? u.board.at(hit.uv) : null);
  }

  // ---------- hands ----------
  const ray = new THREE.Raycaster(), tmpM = new THREE.Matrix4();
  const ctrls = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
    beam.visible = false; c.add(beam);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.01, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffd24a })); dot.visible = false; scene.add(dot);
    c.userData = { beam, dot, source: null };
    c.addEventListener("connected", (e) => { c.userData.source = e.data; beam.visible = true; });
    c.addEventListener("disconnected", () => { c.userData.source = null; beam.visible = false; dot.visible = false; letGo(c); });
    c.addEventListener("selectstart", () => { if (!act(pointAt(c))) hold(c); });
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
  function hold(c) { if (held || view.i < 0) return; held = c; c.attach(stage); log("hold"); }
  function letGo(c) { if (held !== c) return; home.attach(stage); held = null; }
  const stick = (c) => { const gp = c.userData.source && c.userData.source.gamepad; return gp && gp.axes && gp.axes.length >= 4 ? gp.axes[3] : 0; };

  const mouse = new THREE.Vector2(); let down = null;
  function mouseHit(e) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    return ray.intersectObjects(pickables, false)[0] || null;
  }
  renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) act(mouseHit(e)); down = null; });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (renderer.xr.isPresenting) return;
    const h = mouseHit(e); setHover(h);
    const u = h && h.object.userData;
    renderer.domElement.style.cursor = u && (u.kind === "case" || (u.kind === "board" && u.board.at(h.uv))) ? "pointer" : "";
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
      ? `<p><b>Put the headset on, then start.</b> Stand or sit: the cabinet is in front of you, the board on your left.</p><button type="button" class="btn v3-enter">Start VR</button>`
      : `<p><b>This browser cannot open VR.</b> Open vr.phylab.uk/cabinet/ in the browser of a VR headset (for example Meta Quest). Below is a preview you can turn with the mouse; you can click the crystals and the board.</p>`;
    note.hidden = false;
    const b = note.querySelector(".v3-enter");
    if (b) b.addEventListener("click", () => enter());
    if (!ok) return;
    if (await sessionGranted()) enter("handed on"); else offer();
  });
  renderer.xr.addEventListener("sessionstart", () => { controls.enabled = false; camera.position.set(0, 0, 0); camera.quaternion.identity(); placeNext = true; });
  renderer.xr.addEventListener("sessionend", () => { ctrls.forEach(letGo); controls.enabled = true; placeHome(V(0, 0, 0), 0, 1.55); resetView(); log("exit"); offer(); });

  function resize() {
    if (renderer.xr.isPresenting) return;
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stageEl); resize();
  root.querySelector(".v3-view").addEventListener("click", () => { placeHome(V(0, 0, 0), 0, 1.55); resetView(); });

  placeHome(V(0, 0, 0), 0, 1.55); resetView(); board.redraw();
  const timer = new THREE.Timer(), head = V(0, 0, 0), fwd = V(0, 0, 0);
  let spin = 0;
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05), xr = renderer.xr.isPresenting;
    if (xr) {
      const xc = renderer.xr.getCamera();
      if (placeNext && xc.matrixWorld.elements[13] > 0.3) {
        xc.getWorldPosition(head); xc.getWorldDirection(fwd);
        // the cabinet stays where it is; the board and the stage come in front of you, facing the cabinet
        placeHome(head, Math.atan2(-fwd.x, -fwd.z), head.y); placeNext = false;
      }
      let hover = null;
      for (const c of ctrls) {
        if (!c.userData.source) continue;
        const h = pointAt(c), { beam, dot } = c.userData;
        beam.scale.z = h ? h.distance : 1.5; dot.visible = !!h; if (h) dot.position.copy(h.point);
        if (h && !hover) hover = h;
        const sy = stick(c);
        if (Math.abs(sy) > 0.2 && view.i >= 0) stage.scale.setScalar(THREE.MathUtils.clamp(stage.scale.x * (1 - sy * dt * 1.5), 0.3, 4));
      }
      setHover(hover);
    } else controls.update();
    if (view.i >= 0) animate(dt);
    if (!held && view.i >= 0) { spin += dt; stage.rotateY(dt * 0.3); }
    cases.forEach((c, k) => { c.obj.rotation.y += dt * (k === hoverCase ? 1.2 : 0.25); });
    renderer.render(scene, camera);
  });

  // for checking: /cabinet/?debugcabinet exposes the page in the console
  if (new URLSearchParams(location.search).has("debugcabinet"))
    window.cabinet = { choose, go, view, press, SPECIMENS, camera, controls, stage };
}
