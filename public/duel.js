// vr.phylab.uk — Duel: two players, each with an electric shield and a magnetic shield, fire charges at each other.
//
// In VR you first see the lobby: a wall of tables with two seats each, like the game hall of old QQ games.
// Point at an empty seat and press the trigger to sit; when both seats of a table are taken the game starts after
// a 3-second countdown. Practice (no one else needed) fires charges at you from the other end.
//
// Controllers: right trigger — hold to charge, let go to fire (longer is faster); A or B — change the sign of the
// charge. Left trigger — hold to raise the shield (it uses energy); X — electric ↔ magnetic; Y — turn the shield round
// (+ ↔ −, or the magnetic field the other way). The magnetic field points along the top of the left controller, so
// turning the wrist turns the field.
//
// Who decides a hit: every charge is followed in both browsers, but only the player it was fired AT decides what it
// hits (their own shield and body are exact there, with no delay). That player sends where it is ten times a second,
// so the shooter sees the same path, and reports hits to the lobby, which keeps the score.
// A computer browser (no VR) can sit at a table too and fire with the mouse, to test a game with one headset.
import * as THREE from "/vendor/three/three.min.js";
import { PROJECTS } from "/projects.js";
import { sessionGranted, goInVR } from "/xr-nav.js";
import * as P from "/duel-physics.js";
import { connect, savedName, saveName } from "/duel-net.js";

const NAMES = ["Red Fox", "Blue Whale", "Green Frog", "Gold Eagle", "Silver Wolf", "Orange Tiger",
  "Purple Owl", "White Bear", "Black Cat", "Pink Dolphin", "Grey Shark", "Yellow Bee"];
const TABLES = 6, WALL = -2.6;
const C = { bg: 0x1c2130, pos: 0xe0473a, neg: 0x3a7be0, accent: 0x0d6b5f, me: 0x19a58f, them: 0xe08a2b, field: 0x5fe0c0 };
const CSS = { ink: "#1a2030", soft: "#55607a", paper: "#f7f5ef", accent: "#0d6b5f", me: "#19a58f", pos: "#c0392b", neg: "#1f5fbf", warn: "#9a5b00" };
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
const SERIF = `Georgia, "Times New Roman", serif`;

// ---------- panels: flat boards with text drawn on a canvas ----------

function makePanel(w, h, res = 480) {
  const cv = document.createElement("canvas");
  cv.width = Math.round(w * res); cv.height = Math.round(h * res);
  const g = cv.getContext("2d"), tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return { mesh, draw(fn) { g.clearRect(0, 0, cv.width, cv.height); fn(g, cv.width, cv.height); tex.needsUpdate = true; } };
}
function card(g, W, H, fill, stroke, lw = 6) {
  g.fillStyle = fill; g.beginPath(); g.roundRect(lw / 2, lw / 2, W - lw, H - lw, Math.min(W, H) * 0.12); g.fill();
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function txt(g, s, x, y, size, color, { align = "center", weight = 600, font = FONT, max = 0.92 } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  const room = g.canvas.width * max, w = g.measureText(s).width;   // too long for the board: smaller, never cut off
  if (w > room) g.font = `${weight} ${size * room / w}px ${font}`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = "middle"; g.fillText(s, x, y);
}
/** A line with some parts in italic (the symbols of physics: q, v, B, E, F). parts: [text, italic?] */
function rich(g, parts, x, y, size, color, align = "left") {
  const f = (it) => `${it ? "italic " : ""}500 ${size}px ${it ? SERIF : FONT}`;
  let w = 0;
  for (const [t, it] of parts) { g.font = f(it); w += g.measureText(t).width; }
  const room = g.canvas.width * 0.88;
  if (w > room) { size *= room / w; w = room; }
  let cx = align === "center" ? x - w / 2 : x;
  g.fillStyle = color; g.textAlign = "left"; g.textBaseline = "middle";
  for (const [t, it] of parts) { g.font = f(it); g.fillText(t, cx, y); cx += g.measureText(t).width; }
}

export function startDuel(root) {
  root.classList.add("v3");
  root.innerHTML = `<div class="v3-note" hidden></div><div class="v3-stage"><p class="v3-flash" hidden></p></div>
    <p class="v3-hint">In the headset: point at a seat at a table and press the trigger to sit. When two players sit at the same table, the duel starts. Practice needs no one else.</p>`;
  const stage = root.querySelector(".v3-stage"), note = root.querySelector(".v3-note"), flashEl = root.querySelector(".v3-flash");
  const flash = (msg) => { flashEl.textContent = msg; flashEl.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(() => { flashEl.hidden = true; }, 2500); };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  stage.prepend(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(62, 1.6, 0.03, 60);
  camera.position.set(0, 1.6, 0.4);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.bg);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404858, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(1, 3, 2); scene.add(sun);
  const lobbyG = new THREE.Group(), arenaG = new THREE.Group();
  scene.add(lobbyG, arenaG);
  arenaG.visible = false;

  // ---------- things to point at ----------
  const clickables = [];
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  function button(group, w, h, pos, drawFn, onClick, res) {
    const p = makePanel(w, h, res);
    p.mesh.position.copy(pos);
    const u = { onClick, hover: false, drawFn };
    p.mesh.userData = u;
    p.redraw = () => p.draw((g, W, H) => drawFn(g, W, H, u.hover));
    u.redraw = p.redraw;
    p.redraw();
    group.add(p.mesh); clickables.push(p.mesh);
    return p;
  }
  const plainBtn = (label, sub) => (g, W, H, hover) => {
    card(g, W, H, hover ? "#ffffff" : "#e9e5da", hover ? CSS.accent : "#c9c3b2");
    txt(g, label, W / 2, sub ? H * 0.4 : H / 2, H * 0.32, CSS.ink);
    if (sub) txt(g, sub, W / 2, H * 0.72, H * 0.17, CSS.soft, { weight: 500 });
  };

  // ---------- the lobby ----------
  let myName = savedName() || "", status = "connecting", lobby = null, online = 0, choosing = !savedName();
  const title = makePanel(2.6, 0.34);
  title.mesh.position.set(0, 2.32, WALL); lobbyG.add(title.mesh);
  function drawTitle() {
    title.draw((g, W, H) => {
      txt(g, choosing ? "Choose your name" : "Duel · choose a table", W / 2, H * 0.36, H * 0.38, "#ffffff", { font: SERIF });
      const st = status === "online" ? `You are ${myName || "…"} · ${online} in the lobby` : status === "connecting" ? "Connecting to the lobby…" : "Not connected · trying again";
      txt(g, st, W / 2, H * 0.8, H * 0.2, status === "online" ? "#b8c4d8" : "#f0b429", { weight: 500 });
    });
  }

  const tablesG = new THREE.Group(), namesG = new THREE.Group();
  lobbyG.add(tablesG, namesG);
  const tableUI = [];
  const tableOf = (i) => (lobby ? lobby.tables[i] : { state: "open", seats: [null, null], left: 0 });
  const isMe = (i, s) => lobby && lobby.me && lobby.me.table === i && lobby.me.seat === s;
  const leftOf = (t) => Math.max(0, Math.ceil((t.left - (performance.now() - lobbyAt)) / 1000));
  let lobbyAt = 0;
  for (let i = 0; i < TABLES; i++) {
    const x = ((i % 3) - 1) * 1.02, y = 1.72 - Math.floor(i / 3) * 0.64;
    const head = makePanel(0.94, 0.16);
    head.mesh.position.set(x, y + 0.2, WALL); tablesG.add(head.mesh);
    const seats = [0, 1].map((s) => button(tablesG, 0.45, 0.3, new THREE.Vector3(x + (s ? 0.235 : -0.235), y - 0.05, WALL),
      (g, W, H, hover) => drawSeat(g, W, H, hover, i, s), () => clickSeat(i, s)));
    tableUI.push({ head, seats, shownLeft: -1 });
  }
  function drawHead(i) {
    const t = tableOf(i), ui = tableUI[i];
    ui.shownLeft = t.state === "countdown" ? leftOf(t) : -1;
    ui.head.draw((g, W, H) => {
      card(g, W, H, "rgba(255,255,255,0.10)");
      txt(g, `Table ${i + 1}`, W * 0.05, H / 2, H * 0.5, "#ffffff", { align: "left", font: SERIF });
      const n = t.seats.filter(Boolean).length;
      const st = t.state === "playing" ? "Playing" : t.state === "countdown" ? `Starting in ${ui.shownLeft}` : n === 2 ? "Waiting for Play again" : n === 1 ? "1 player waiting" : "Empty";
      txt(g, st, W * 0.95, H / 2, H * 0.4, t.state === "countdown" ? "#f0b429" : "#b8c4d8", { align: "right", weight: 500 });
    });
  }
  function drawSeat(g, W, H, hover, i, s) {
    const t = tableOf(i), seat = t.seats[s], mine = isMe(i, s);
    if (mine) {
      card(g, W, H, hover ? "#24c2a8" : CSS.me, "#ffffff");
      txt(g, myName, W / 2, H * 0.36, H * 0.2, "#ffffff");
      txt(g, seat && !seat.ready ? "Point here: Play again" : "You · point here to stand up", W / 2, H * 0.68, H * 0.12, "#ffffff", { weight: 500 });
    } else if (seat) {
      card(g, W, H, "#e9e5da", "#c9c3b2");
      txt(g, seat.name, W / 2, H * 0.4, H * 0.2, CSS.ink);
      txt(g, seat.away ? "connection lost…" : t.state === "playing" ? "playing" : seat.ready ? "waiting" : "deciding", W / 2, H * 0.7, H * 0.13, CSS.soft, { weight: 500 });
    } else {
      const free = t.state !== "playing";
      card(g, W, H, hover && free ? "#ffffff" : "rgba(255,255,255,0.16)", hover && free ? CSS.accent : "rgba(255,255,255,0.45)");
      txt(g, "Empty seat", W / 2, H * 0.42, H * 0.17, hover && free ? CSS.ink : "#e8ecf4");
      txt(g, "point and press the trigger", W / 2, H * 0.68, H * 0.11, hover && free ? CSS.soft : "#b8c4d8", { weight: 500 });
    }
  }
  function clickSeat(i, s) {
    if (!net.online) { flash("Not connected to the lobby yet."); return; }
    const t = tableOf(i), seat = t.seats[s];
    if (isMe(i, s)) { net.send({ t: seat && !seat.ready ? "ready" : "stand" }); return; }
    if (!seat && t.state !== "playing") net.send({ t: "sit", table: i, seat: s });
  }

  // the name list (first time, or after "Change name")
  NAMES.forEach((n, k) => {
    const x = ((k % 4) - 1.5) * 0.62, y = 1.78 - Math.floor(k / 4) * 0.36;
    button(namesG, 0.56, 0.28, new THREE.Vector3(x, y, WALL), plainBtn(n), () => {
      myName = n; saveName(n); net.send({ t: "name", name: n }); choosing = false; refreshLobby();
    });
  });

  // the bottom row: practice, change name, the other projects
  const rowY = 0.66;
  button(tablesG, 0.62, 0.24, new THREE.Vector3(-1.02, rowY, WALL), plainBtn("Practice", "charges fired at you"), () => startGame({ practice: true }));
  const nameBtn = button(tablesG, 0.62, 0.24, new THREE.Vector3(0, rowY, WALL), (g, W, H, hover) => plainBtn(myName || "Choose a name", "change name")(g, W, H, hover), () => {
    if (lobby && lobby.me) net.send({ t: "stand" });
    choosing = true; refreshLobby();
  });
  const here = location.pathname.split("/").filter(Boolean)[0] || "";
  const others = [{ slug: "", title: "Home" }, ...PROJECTS.filter((p) => p.slug !== here)];
  others.forEach((p, k) => button(tablesG, 0.3, 0.24, new THREE.Vector3(0.5 + k * 0.32, rowY, WALL),
    plainBtn(p.title.length > 10 ? p.slug[0].toUpperCase() + p.slug.slice(1) : p.title), () => (renderer.xr.isPresenting ? goInVR(`/${p.slug}${p.slug ? "/" : ""}`) : (location.href = `/${p.slug}${p.slug ? "/" : ""}`))));

  // how to play: a board on the right
  const help = makePanel(1.25, 1.35, 420);
  help.mesh.position.set(2.15, 1.45, -1.5); help.mesh.lookAt(0, 1.45, 0.3); lobbyG.add(help.mesh);
  help.draw((g, W, H) => {
    card(g, W, H, "rgba(247,245,239,0.95)");
    const L = W * 0.07, s = H * 0.032;
    let y = H * 0.08;
    txt(g, "How to play", L, y, s * 1.5, CSS.ink, { align: "left", font: SERIF }); y += s * 2.2;
    const line = (parts, gap = 1.45) => { rich(g, parts, L, y, s, CSS.ink); y += s * gap; };
    const head = (t) => { y += s * 0.5; txt(g, t, L, y, s * 1.05, CSS.accent, { align: "left", weight: 700 }); y += s * 1.5; };
    head("Right hand: your charges");
    line([["Hold the trigger to charge, let go to fire."]]);
    line([["Hold longer: a faster charge."]]);
    line([["A or B: change the sign, + or −."]]);
    head("Left hand: your shield");
    line([["Hold the trigger to raise it (it uses energy)."]]);
    line([["X: electric shield ↔ magnetic shield."]]);
    line([["Y: turn the shield round."]]);
    head("The physics");
    line([["Electric shield: a charged ball. It pushes like"]], 1.2);
    line([["charges back and pulls unlike charges in."]]);
    line([["Magnetic shield: the force "], ["F", true], [" = "], ["q", true], ["v", true], [" × "], ["B", true], [" is at right"]], 1.2);
    line([["angles to "], ["v", true], [", so it turns a charge and never"]], 1.2);
    line([["slows it. "], ["B", true], [" points along the top of the controller:"]], 1.2);
    line([["turn your wrist to turn the field."]]);
    line([["A fast charge gets through either shield more easily."]]);
    head("Hits");
    line([[`${P.HP} hits and you are out. Your own charges can hit you too.`]]);
  });

  function refreshLobby() {
    tablesG.visible = !choosing; namesG.visible = choosing;
    drawTitle();
    for (let i = 0; i < TABLES; i++) { drawHead(i); tableUI[i].seats.forEach((b) => b.redraw()); }
    nameBtn.redraw();
  }
  refreshLobby();

  // ---------- the arena ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 15), new THREE.MeshStandardMaterial({ color: 0x232838, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -P.D / 2; arenaG.add(floor);
  const grid = new THREE.GridHelper(10, 20, 0x3a4258, 0x2c3346); grid.position.set(0, 0.002, -P.D / 2); arenaG.add(grid);
  const pad = (color, z) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 48), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.004, z); arenaG.add(m); };
  pad(C.me, 0); pad(C.them, -P.D);
  const mid = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.03), new THREE.MeshBasicMaterial({ color: 0x55607a })); mid.rotation.x = -Math.PI / 2; mid.position.set(0, 0.004, -P.D / 2); arenaG.add(mid);

  const board = makePanel(1.7, 0.62);
  board.mesh.position.set(-1.9, 2.3, -P.D / 2 - 0.4); arenaG.add(board.mesh);
  const leaveBtn = button(arenaG, 0.44, 0.2, new THREE.Vector3(1.15, 0.85, -0.85), plainBtn("Leave"), () => leaveGame());
  leaveBtn.mesh.lookAt(0, 1.3, 0);

  // the other player: head, body, hands and name
  const oppG = new THREE.Group(); arenaG.add(oppG);
  const oppMat = new THREE.MeshStandardMaterial({ color: C.them, roughness: 0.5 });
  const oHead = new THREE.Mesh(new THREE.SphereGeometry(P.BODY.head, 24, 16), oppMat);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 }));
  visor.position.set(0, 0.01, -0.12); oHead.add(visor);
  const oBody = new THREE.Mesh(new THREE.CylinderGeometry(P.BODY.torso, P.BODY.torso * 0.85, 1, 20), new THREE.MeshStandardMaterial({ color: C.them, roughness: 0.7, transparent: true, opacity: 0.75 }));
  const oL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.12), oppMat), oR = oL.clone();
  const oTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: C.pos }));
  oTip.position.z = -0.08; oR.add(oTip);
  const oName = makePanel(0.8, 0.16); oName.mesh.material.depthTest = false;
  oppG.add(oHead, oBody, oL, oR, oName.mesh);

  // the practice launcher at the other end
  const bot = new THREE.Group();
  const botBase = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.2, 24), new THREE.MeshStandardMaterial({ color: 0x55607a, roughness: 0.6 }));
  botBase.position.y = 0.6;
  const botGun = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0x8a94ad }));
  botGun.rotation.x = Math.PI / 2; botGun.position.set(0, 1.4, 0.2);
  bot.add(botBase, botGun); bot.position.set(0, 0, -P.D); arenaG.add(bot);

  // shields as you see them: the electric one as a glowing ball, the magnetic one as a box with arrows along B
  function shieldVis() {
    const g = new THREE.Group(); g.visible = false; arenaG.add(g);
    const eG = new THREE.Group(), bG = new THREE.Group(); g.add(eG, bG);
    const core = new THREE.Mesh(new THREE.SphereGeometry(P.E_SHIELD.r, 32, 20), new THREE.MeshBasicMaterial({ color: C.pos, transparent: true, opacity: 0.35, depthWrite: false }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(P.E_SHIELD.r * 2, 32, 20), new THREE.MeshBasicMaterial({ color: C.pos, transparent: true, opacity: 0.08, depthWrite: false }));
    const rays = new THREE.Group(); // short field lines leaving (or entering) the ball
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.7, 0], [-0.7, 0.7, 0], [0.7, -0.7, 0], [-0.7, -0.7, 0], [0, 0.7, 0.7], [0, -0.7, 0.7], [0, 0.7, -0.7], [0, -0.7, -0.7]]) {
      const v = new THREE.Vector3(...d).normalize();
      const a = new THREE.ArrowHelper(v, v.clone().multiplyScalar(P.E_SHIELD.r * 1.05), P.E_SHIELD.r * 0.9, 0xffffff, 0.05, 0.035);
      rays.add(a);
    }
    eG.add(core, halo, rays);
    const { w, h, d } = P.B_SHIELD;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: C.field, transparent: true, opacity: 0.07, depthWrite: false }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: C.field, transparent: true, opacity: 0.7 }));
    const arrows = new THREE.Group();
    for (const ax of [-1, 0, 1]) for (const az of [-1, 0, 1]) {
      const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ax * w * 0.33, -h * 0.4, az * d * 0.3), h * 0.8, C.field, 0.08, 0.05);
      arrows.add(a);
    }
    const bLb = makePanel(0.16, 0.12); bLb.mesh.position.set(w / 2 + 0.1, h * 0.3, 0);
    bLb.draw((g2, W, H) => rich(g2, [["B", true]], W / 2, H / 2, H * 0.8, "#5fe0c0", "center"));
    bG.add(slab, edges, arrows, bLb.mesh);
    let last = "";
    return {
      set(s, handQ) {
        g.visible = !!s; if (!s) return;
        g.position.set(...s.c);
        eG.visible = s.type === "E"; bG.visible = s.type === "B";
        if (s.type === "B") { g.quaternion.set(...handQ); arrows.rotation.x = s.sign > 0 ? 0 : Math.PI; arrows.position.y = 0; }
        else g.quaternion.identity();
        const key = s.type + s.sign;
        if (key !== last && s.type === "E") {
          const col = s.sign > 0 ? C.pos : C.neg;
          core.material.color.setHex(col); halo.material.color.setHex(col);
          rays.children.forEach((a) => { const v = a.userData.v || (a.userData.v = new THREE.Vector3().copy(a.position).normalize());
            if (s.sign > 0) { a.position.copy(v).multiplyScalar(P.E_SHIELD.r * 1.05); a.setDirection(v); }
            else { a.position.copy(v).multiplyScalar(P.E_SHIELD.r * 1.95); a.setDirection(v.clone().negate()); } });
        }
        last = key;
      },
    };
  }
  const myShieldVis = shieldVis(), oppShieldVis = shieldVis();

  // charges in flight
  const shots = new Map();
  const shotGeo = new THREE.SphereGeometry(P.PROJ.r, 16, 12);
  const shotMat = { 1: new THREE.MeshBasicMaterial({ color: C.pos }), [-1]: new THREE.MeshBasicMaterial({ color: C.neg }) };
  const TRAIL = 24;
  function addShot(id, p, v, q, auth) {
    if (shots.has(id)) return shots.get(id);
    const mesh = new THREE.Mesh(shotGeo, shotMat[q]);
    const geo = new THREE.BufferGeometry(); const arr = new Float32Array(TRAIL * 3);
    for (let k = 0; k < TRAIL; k++) arr.set(p, k * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: q > 0 ? 0xff8a7a : 0x8ab8ff, transparent: true, opacity: 0.6 }));
    arenaG.add(mesh, trail);
    const s = { id, p: p.slice(), v: v.slice(), q, auth, age: 0, mesh, trail, arr, near: false, mine: id.startsWith(myTag()) };
    mesh.position.set(...p);
    shots.set(id, s);
    return s;
  }
  function removeShot(s) { arenaG.remove(s.mesh, s.trail); s.trail.geometry.dispose(); s.trail.material.dispose(); shots.delete(s.id); }
  const clearShots = () => [...shots.values()].forEach(removeShot);

  // ---------- the player's own hands ----------
  const me = {
    gun: 1, shieldType: "E", shieldSign: 1, shieldHeld: false, energy: P.ENERGY.max, locked: false,
    charging: false, held: 0, cool: 0, count: 0, hp: P.HP, oppHp: P.HP,
  };
  const ray = new THREE.Raycaster(), tmpM = new THREE.Matrix4();
  const ctrls = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    c.userData = { hand: null, hover: null };
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    beam.scale.z = 3; beam.visible = false; c.add(beam); c.userData.beam = beam;
    // the gun (right) and the shield's little screen (left), shown by hand once the controller says which hand it is
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x8a94ad }));
    barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.05;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 10), new THREE.MeshBasicMaterial({ color: C.pos }));
    tip.position.z = -0.12; gun.add(barrel, tip); c.add(gun);
    const hud = makePanel(0.15, 0.07, 1200); hud.mesh.position.set(0, 0.055, 0.02); hud.mesh.rotation.x = -0.6; c.add(hud.mesh);
    Object.assign(c.userData, { gun, tip, hud, hudKey: "" });
    c.addEventListener("connected", (e) => {
      c.userData.hand = e.data.handedness; c.userData.src = e.data;
      beam.visible = e.data.targetRayMode === "tracked-pointer";
    });
    c.addEventListener("disconnected", () => { c.userData.hand = null; c.userData.src = null; beam.visible = false; });
    c.addEventListener("selectstart", () => press(c));
    c.addEventListener("selectend", () => release(c));
    scene.add(c);
    return c;
  });
  const handOf = (side) => ctrls.find((c) => c.userData.hand === side);
  function ctrlRay(c) {
    tmpM.identity().extractRotation(c.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(c.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM);
  }
  const pointed = () => ray.intersectObjects(clickables.filter(shown), false)[0];

  let mode = "lobby"; // lobby | game | practice
  const inArena = () => mode !== "lobby";
  function press(c) {
    ctrlRay(c);
    const hit = pointed();
    if (hit) { c.userData.clicked = true; hit.object.userData.onClick(); return; }
    c.userData.clicked = false;
    if (!inArena()) return;
    if (c.userData.hand === "left") me.shieldHeld = true;
    else startCharge();
  }
  function release(c) {
    if (c.userData.clicked) { c.userData.clicked = false; return; }
    if (!inArena()) return;
    if (c.userData.hand === "left") me.shieldHeld = false;
    else fire(handPose(c));
  }
  function startCharge() { if (me.cool <= 0) { me.charging = true; me.held = 0; } }
  const myTag = () => (mode === "practice" ? "me" : `s${seat}`);
  function fire(hand) {
    if (!me.charging) return;
    me.charging = false;
    if ([...shots.values()].filter((s) => s.mine).length >= P.MAX_LIVE) return;
    const dir = P.rot(hand.q, [0, 0, -1]), v = P.speedFor(me.held);
    const p = [hand.p[0] + dir[0] * 0.14, hand.p[1] + dir[1] * 0.14, hand.p[2] + dir[2] * 0.14];
    const id = `${myTag()}-${me.count++}`, vel = dir.map((x) => x * v);
    addShot(id, p, vel, me.gun, mode === "practice");
    me.cool = P.COOLDOWN;
    if (mode === "game") net.send({ t: "fire", id, p: r3(p), v: r3(vel), q: me.gun });
  }
  const r3 = (a) => a.map((x) => Math.round(x * 1000) / 1000);
  const r4 = (a) => a.map((x) => Math.round(x * 10000) / 10000);
  const tv = new THREE.Vector3(), tq = new THREE.Quaternion();
  function handPose(o) { o.getWorldPosition(tv); o.getWorldQuaternion(tq); return { p: [tv.x, tv.y, tv.z], q: [tq.x, tq.y, tq.z, tq.w] }; }
  function headPose() {
    const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    return handPose(cam);
  }

  // buttons A, B, X, Y (the xr-standard layout: 4 and 5)
  const prevBtn = new Map();
  function pollButtons() {
    const session = renderer.xr.getSession(); if (!session) return;
    for (const src of session.inputSources) {
      const gp = src.gamepad; if (!gp) continue;
      for (const k of [4, 5]) {
        const key = src.handedness + k, down = !!(gp.buttons[k] && gp.buttons[k].pressed);
        if (down && !prevBtn.get(key) && inArena()) {
          if (src.handedness === "right") me.gun = -me.gun;
          else if (k === 4) me.shieldType = me.shieldType === "E" ? "B" : "E";
          else me.shieldSign = -me.shieldSign;
        }
        prevBtn.set(key, down);
      }
    }
  }
  function drawHud(c) {
    const u = c.userData, left = u.hand === "left";
    u.gun.visible = !left && !!u.hand && inArena();
    u.hud.mesh.visible = !!u.hand && inArena();
    u.tip.material.color.setHex(me.gun > 0 ? C.pos : C.neg);
    u.tip.scale.setScalar(me.charging ? 1 + Math.min(1, me.held / P.SPEED.full) : 1);
    const key = left ? `${me.shieldType}${me.shieldSign}${Math.round(me.energy / 5)}${me.locked}` : `${me.gun}${me.charging ? Math.round(me.held * 10) : -1}`;
    if (key === u.hudKey || !u.hud.mesh.visible) return;
    u.hudKey = key;
    u.hud.draw((g, W, H) => {
      card(g, W, H, "rgba(20,24,36,0.85)", null);
      if (left) {
        const word = me.shieldType === "E" ? "Electric" : "Magnetic";
        const sign = me.shieldType === "E" ? (me.shieldSign > 0 ? "+" : "−") : (me.shieldSign > 0 ? "B up ↑" : "B down ↓");
        txt(g, `${word} ${sign}`, W / 2, H * 0.33, H * 0.3, me.shieldType === "E" ? (me.shieldSign > 0 ? "#ff8a7a" : "#8ab8ff") : "#5fe0c0");
        g.fillStyle = "#3a4258"; g.fillRect(W * 0.1, H * 0.64, W * 0.8, H * 0.16);
        g.fillStyle = me.locked ? "#9a5b00" : "#f0b429"; g.fillRect(W * 0.1, H * 0.64, W * 0.8 * (me.energy / P.ENERGY.max), H * 0.16);
      } else {
        txt(g, `Charge ${me.gun > 0 ? "+" : "−"}`, W / 2, H * 0.33, H * 0.32, me.gun > 0 ? "#ff8a7a" : "#8ab8ff");
        const sp = me.charging ? P.speedFor(me.held) : null;
        txt(g, sp ? `${sp.toFixed(1)} m/s` : "hold the trigger", W / 2, H * 0.73, H * 0.22, "#b8c4d8", { weight: 500 });
      }
    });
  }

  // ---------- the other player, as last heard ----------
  let seat = 0, oppName = "", opp = null; // opp: { target, cur } in our space
  const lerpA = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const slerpA = (a, b, t) => { qa.set(...a); qb.set(...b); qa.slerp(qb, t); return [qa.x, qa.y, qa.z, qa.w]; };
  const mirrorHand = (h) => (h ? { p: P.mirrorP(h[0]), q: P.mirrorQ(h[1]) } : null);
  function onPose(m) {
    const target = { h: mirrorHand(m.h), l: mirrorHand(m.l), r: mirrorHand(m.r), s: m.s, g: m.g };
    if (!opp || !opp.cur.h) opp = { target, cur: JSON.parse(JSON.stringify(target)) };
    else opp.target = target;
  }
  function smoothOpp(dt) {
    if (!opp) return;
    const t = 1 - Math.exp(-dt * 14), cur = opp.cur, tg = opp.target;
    for (const k of ["h", "l", "r"]) {
      if (!tg[k]) { cur[k] = null; continue; }
      if (!cur[k]) { cur[k] = { p: tg[k].p.slice(), q: tg[k].q.slice() }; continue; }
      cur[k].p = lerpA(cur[k].p, tg[k].p, t); cur[k].q = slerpA(cur[k].q, tg[k].q, t);
    }
    cur.s = tg.s; cur.g = tg.g;
  }
  const oppShield = () => (opp && opp.cur.s && opp.cur.s.on && opp.cur.l ? P.shieldFrom(opp.cur.l, opp.cur.s.type, opp.cur.s.sign) : null);
  function drawOpp() {
    oppG.visible = mode === "game" && !!(opp && opp.cur.h);
    if (!oppG.visible) return;
    const { h, l, r, g } = opp.cur;
    oHead.position.set(...h.p); oHead.quaternion.set(...h.q);
    const top = h.p[1] - P.BODY.neck, bottom = Math.max(0.2, h.p[1] - P.BODY.hip);
    oBody.position.set(h.p[0], (top + bottom) / 2, h.p[2]); oBody.scale.set(1, Math.max(0.05, top - bottom), 1);
    for (const [m, x] of [[oL, l], [oR, r]]) { m.visible = !!x; if (x) { m.position.set(...x.p); m.quaternion.set(...x.q); } }
    oTip.material.color.setHex(g > 0 ? C.pos : C.neg);
    oName.mesh.position.set(h.p[0], h.p[1] + 0.32, h.p[2]);
    oName.mesh.lookAt(camWorld);
  }
  const camWorld = new THREE.Vector3();

  // ---------- the game ----------
  let banner = "", bannerUntil = 0, endAt = 0, practiceHits = 0, practiceSeen = 0, botNext = 0, ending = false;
  function drawBoard() {
    board.draw((g, W, H) => {
      card(g, W, H, "rgba(247,245,239,0.94)");
      if (mode === "practice") {
        txt(g, "Practice", W / 2, H * 0.17, H * 0.14, CSS.soft, { font: SERIF });
        txt(g, `Hits on you: ${practiceHits}`, W / 2, H * 0.42, H * 0.17, CSS.ink);
        txt(g, `Charges kept off: ${Math.max(0, practiceSeen - practiceHits)}`, W / 2, H * 0.66, H * 0.13, CSS.accent);
      } else {
        const pips = (n, x, col) => { for (let k = 0; k < P.HP; k++) { g.fillStyle = k < n ? col : "#d6d0c0"; g.beginPath(); g.arc(x + (k - 2) * W * 0.06, H * 0.58, H * 0.045, 0, 7); g.fill(); } };
        txt(g, "You", W * 0.27, H * 0.3, H * 0.13, CSS.ink); pips(me.hp, W * 0.27, CSS.me);
        txt(g, oppName, W * 0.73, H * 0.3, H * 0.13, CSS.ink); pips(me.oppHp, W * 0.73, "#e08a2b");
      }
      if (banner && performance.now() < bannerUntil) txt(g, banner, W / 2, H * 0.86, H * 0.13, CSS.warn, { weight: 700 });
    });
  }
  let boardKey = "";
  function say(msg, ms = 2500) { banner = msg; bannerUntil = performance.now() + ms; boardKey = ""; }

  function startGame({ practice = false, seat: s = 0, opponent = "", hp = [P.HP, P.HP] } = {}) {
    mode = practice ? "practice" : "game";
    if (practice && lobby && lobby.me) net.send({ t: "stand" });
    seat = s; oppName = opponent; opp = null; ending = false;
    me.hp = hp[seat]; me.oppHp = hp[1 - seat]; me.energy = P.ENERGY.max; me.locked = false; me.charging = false; me.cool = 0;
    practiceHits = 0; practiceSeen = 0; botNext = performance.now() + 2000;
    clearShots();
    lobbyG.visible = false; arenaG.visible = true; bot.visible = practice;
    say(practice ? "Charges are coming: raise your shield!" : `Duel with ${opponent}!`, 3000);
    oName.draw((g, W, H) => { card(g, W, H, "rgba(20,24,36,0.75)"); txt(g, opponent, W / 2, H / 2, H * 0.5, "#ffffff"); });
    if (!renderer.xr.isPresenting) camera.position.set(0, 1.6, 0.4);
  }
  function toLobby() {
    mode = "lobby"; clearShots(); opp = null;
    lobbyG.visible = true; arenaG.visible = false; me.charging = false; me.shieldHeld = false;
    refreshLobby();
  }
  function leaveGame() { if (mode === "game") net.send({ t: "stand" }); toLobby(); }

  const sent = { pose: 0, proj: 0 };
  function tick(dt, now) {
    const head = headPose();
    camWorld.set(...head.p);
    const L = handOf("left"), R = handOf("right");
    const lh = L ? handPose(L) : null, rh = R ? handPose(R) : null;

    // energy for the shield
    const up = me.shieldHeld && !me.locked && !!lh;
    if (up) { me.energy -= P.ENERGY.drain * dt; if (me.energy <= 0) { me.energy = 0; me.locked = true; } }
    else { me.energy = Math.min(P.ENERGY.max, me.energy + P.ENERGY.refill * dt); if (me.locked && me.energy >= P.ENERGY.restart) me.locked = false; }
    if (me.charging) me.held += dt;
    me.cool -= dt;

    const mine = up ? P.shieldFrom(lh, me.shieldType, me.shieldSign) : null;
    const theirs = mode === "game" ? oppShield() : null;
    myShieldVis.set(mine, lh && lh.q); oppShieldVis.set(theirs, opp && opp.cur.l && opp.cur.l.q);
    const shields = [mine, theirs];

    // the practice launcher: a charge every 1.6 s at your head (a little off), random sign and speed
    if (mode === "practice" && now > botNext) {
      botNext = now + 1600;
      const from = [0, 1.4, -P.D + 0.45], aim = [head.p[0] + (Math.random() - 0.5) * 0.3, head.p[1] - Math.random() * 0.4, head.p[2]];
      const d = [aim[0] - from[0], aim[1] - from[1], aim[2] - from[2]], n = Math.hypot(...d), v = 4 + Math.random() * 5;
      addShot(`bot-${me.count++}`, from, d.map((x) => (x / n) * v), Math.random() < 0.5 ? 1 : -1, true);
      practiceSeen++; boardKey = "";
      botGun.lookAt(aim[0], aim[1], aim[2] + 0.5);
    }

    const oppHead = opp && opp.cur.h ? opp.cur.h.p : null;
    for (const s of [...shots.values()]) {
      P.advance(s, shields, dt); s.age += dt;
      s.mesh.position.set(...s.p);
      s.arr.copyWithin(3, 0, (TRAIL - 1) * 3); s.arr.set(s.p, 0); s.trail.geometry.attributes.position.needsUpdate = true;
      const hitMe = P.hitsBody(s.p, head.p), hitThem = oppHead && P.hitsBody(s.p, oppHead);
      if (s.auth) {
        if (hitMe || hitThem) {
          if (mode === "practice") { practiceHits++; say("Hit!", 900); }
          else { net.send({ t: "hit", pid: s.id, target: hitMe ? seat : 1 - seat }); net.send({ t: "gone", id: s.id }); }
          removeShot(s); continue;
        }
        if (P.gone(s.p) || s.age > P.PROJ.life) { if (mode === "game") net.send({ t: "gone", id: s.id }); removeShot(s); continue; }
      } else if (hitMe || hitThem || P.gone(s.p) || s.age > P.PROJ.life + 1) { removeShot(s); continue; } // the other player decides; just stop drawing it
    }

    if (mode === "game") {
      if (now - sent.pose > 50) {
        sent.pose = now;
        const pk = (h) => (h ? [r3(h.p), r4(h.q)] : null);
        net.send({ t: "pose", h: pk(head), l: pk(lh), r: pk(rh), s: { on: up, type: me.shieldType, sign: me.shieldSign }, g: me.gun });
      }
      if (now - sent.proj > 100) {
        sent.proj = now;
        const list = [...shots.values()].filter((s) => s.auth).map((s) => [s.id, ...r3(s.p), ...r3(s.v)]);
        if (list.length) net.send({ t: "proj", list });
      }
    }
    smoothOpp(dt); drawOpp();
    ctrls.forEach(drawHud);
    board.mesh.lookAt(camWorld.x, board.mesh.position.y, camWorld.z);
    const key = `${mode}${me.hp}${me.oppHp}${practiceHits}${practiceSeen}${banner && now < bannerUntil ? banner : ""}`;
    if (key !== boardKey) { boardKey = key; drawBoard(); }
  }

  // ---------- messages from the lobby ----------
  function onMessage(m) {
    switch (m.t) {
      case "welcome": myName = m.name; refreshLobby(); break;
      case "lobby": lobby = m; lobbyAt = performance.now(); online = m.online; if (mode === "lobby") refreshLobby(); break;
      case "start":
        if (m.resume && mode === "game") break;      // the connection only dropped for a moment: carry on
        startGame({ seat: m.seat, opponent: m.opponent, hp: m.hp }); break;
      case "pose": if (mode === "game") onPose(m); break;
      case "fire":
        if (mode !== "game") break;
        { const s = addShot(m.id, P.mirrorP(m.p), P.mirrorV(m.v), m.q > 0 ? 1 : -1, true); P.advance(s, [], 0.05); }
        break;
      case "proj":
        if (mode !== "game") break;
        for (const [id, x, y, z, vx, vy, vz] of m.list) {
          const s = shots.get(id); if (!s || s.auth) continue;
          const p = P.mirrorP([x, y, z]);
          for (let k = 0; k < 3; k++) s.p[k] += (p[k] - s.p[k]) * 0.6;
          s.v.splice(0, 3, ...P.mirrorV([vx, vy, vz]));
        }
        break;
      case "gone": { const s = shots.get(m.id); if (s && !s.auth) removeShot(s); break; }
      case "score":
        if (mode !== "game") break;
        me.hp = m.hp[seat]; me.oppHp = m.hp[1 - seat];
        say(m.target === seat ? "You were hit!" : `You hit ${oppName}!`, 1200);
        break;
      case "over":
        if (mode !== "game") break;
        say(m.reason === "left" ? `${oppName} left the game` : m.winner === seat ? "You won!" : `${oppName} won`, 5000);
        endAt = performance.now() + 4500; ending = true;
        break;
      default: break;
    }
  }
  const net = connect({ onMessage, onStatus: (s) => { status = s; drawTitle(); } });

  // ---------- mouse (a computer browser: for a preview, and to test a game with one headset) ----------
  const ndc = new THREE.Vector2();
  function mouseRay(e) {
    const b = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  let hoverMouse = null;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (renderer.xr.isPresenting) return;
    mouseRay(e);
    const hit = pointed();
    if (hit) { hit.object.userData.onClick(); return; }
    if (inArena()) startCharge();
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (renderer.xr.isPresenting || !me.charging) return;
    mouseRay(e);
    const d = ray.ray.direction, q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), d);
    fire({ p: [camera.position.x + 0.15, camera.position.y - 0.25, camera.position.z], q: [q.x, q.y, q.z, q.w] });
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (renderer.xr.isPresenting) return;
    mouseRay(e);
    setHover(hoverMouse, false); hoverMouse = pointed()?.object || null; setHover(hoverMouse, true);
    renderer.domElement.style.cursor = hoverMouse ? "pointer" : "";
  });
  function setHover(o, on) { if (o && o.userData.hover !== on) { o.userData.hover = on; o.userData.redraw(); } }

  // ---------- VR: as on the other projects, a big Start VR button; handed on from the home page if the browser can ----------
  const supported = navigator.xr ? navigator.xr.isSessionSupported("immersive-vr").catch(() => false) : Promise.resolve(false);
  const XR_OPTIONS = { optionalFeatures: ["local-floor", "hand-tracking"] };
  async function use(session) { await renderer.xr.setSession(session); }
  async function enter() {
    if (renderer.xr.isPresenting) return;
    try { await use(await navigator.xr.requestSession("immersive-vr", XR_OPTIONS)); }
    catch (err) { flash(`Could not start VR: ${err.message || err}`); }
  }
  function offer() {
    if (!navigator.xr || !navigator.xr.offerSession || renderer.xr.isPresenting) return;
    navigator.xr.offerSession("immersive-vr", XR_OPTIONS).then(use).catch(() => {});
  }
  supported.then(async (ok) => {
    note.innerHTML = ok
      ? `<p><b>Put the headset on, then start.</b> You need both controllers. Give yourself room to move: about 2 m by 2 m, and not near the other player in the same room.</p><button type="button" class="btn v3-enter">Start VR</button>`
      : `<p><b>This browser cannot open VR.</b> Open vr.phylab.uk/duel/ in the browser of a VR headset. Here you can still sit at a table with the mouse and fire by clicking, to test a game with one headset.</p>`;
    note.hidden = false;
    const b = note.querySelector(".v3-enter");
    if (b) b.addEventListener("click", enter);
    if (!ok) return;
    if (await sessionGranted()) enter(); else offer();
  });
  renderer.xr.addEventListener("sessionend", () => { me.shieldHeld = false; me.charging = false; offer(); });

  function resize() {
    if (renderer.xr.isPresenting) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
    const xr = renderer.xr.isPresenting;
    if (xr) {
      pollButtons();
      for (const c of ctrls) {                       // what each controller points at (lit up)
        if (!c.userData.beam.visible) continue;
        ctrlRay(c);
        const hit = pointed(), o = hit ? hit.object : null;
        if (o !== c.userData.hover) { setHover(c.userData.hover, false); setHover(o, true); c.userData.hover = o; }
        c.userData.beam.scale.z = hit ? hit.distance : inArena() ? 0.4 : 3;
      }
    }
    if (mode === "lobby") {
      for (let i = 0; i < TABLES; i++) { const t = tableOf(i); if (t.state === "countdown" && leftOf(t) !== tableUI[i].shownLeft) drawHead(i); }
    } else {
      tick(dt, now);
      if (ending && now > endAt) toLobby();
    }
    renderer.render(scene, camera);
  });
}
