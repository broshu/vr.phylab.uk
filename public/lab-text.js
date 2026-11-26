// vr.phylab.uk — boards and buttons drawn on a canvas, for the lab (/lab/).
// Text can carry a little markup so that physics is set properly:
//   *v*            italic (symbols)
//   [[*m**v*|*qB*]] a fraction, numerator over denominator, each with its own markup
//   **Title**      bold
//   a line on its own: "\n"
import * as THREE from "/vendor/three/three.min.js";

const SERIF = 'Georgia, "Times New Roman", serif', SANS = '-apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
export const INK = "#1a2030", SOFT = "#55607a", ACCENT = "#0d6b5f", PAPER = "#f7f5ef";

/** Split markup into runs: {t, it, b} text and {frac: [num runs, den runs]}. */
function parse(s) {
  const out = [];
  const re = /\[\[(.+?)\|(.+?)\]\]|\*\*(.+?)\*\*|\*(.+?)\*|([^*[]+|\[|\*)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) out.push({ frac: [parse(m[1]), parse(m[2])] });
    else if (m[3] !== undefined) out.push({ t: m[3], b: true });
    else if (m[4] !== undefined) out.push({ t: m[4], it: true });
    else out.push({ t: m[5] });
  }
  return out;
}
const fontOf = (r, size, face) => `${r.it ? "italic " : ""}${r.b ? "700" : "400"} ${size}px ${r.it ? SERIF : face}`;
function runsWidth(g, runs, size, face) {
  let w = 0;
  for (const r of runs) { g.font = fontOf(r, size, face); w += g.measureText(r.t).width; }
  return w;
}
function drawRuns(g, runs, x, y, size, face, color) {
  g.fillStyle = color;
  for (const r of runs) { g.font = fontOf(r, size, face); g.fillText(r.t, x, y); x += g.measureText(r.t).width; }
  return x;
}

/**
 * Write wrapped text from (x, y) (the top of the first line) within width w. Returns the y below the last line.
 * opts: size (px), color, face ("serif" or "sans"), gap (extra space between lines, as a share of size)
 */
export function write(g, text, x, y, w, { size = 34, color = INK, face = "sans", gap = 0.45 } = {}) {
  const F = face === "serif" ? SERIF : SANS, fs = Math.round(size * 0.82);
  // break the runs into words, keeping fractions whole
  const words = [];
  for (const para of text.split("\n")) {
    for (const r of parse(para)) {
      if (r.frac) { words.push({ frac: r.frac }); continue; }
      for (const piece of r.t.split(/(?<= )/)) if (piece) words.push({ t: piece, it: r.it, b: r.b });
    }
    words.push({ br: true });
  }
  words.pop();
  const widthOf = (wd) => wd.frac ? Math.max(runsWidth(g, wd.frac[0], fs, F), runsWidth(g, wd.frac[1], fs, F)) + size * 0.3 : runsWidth(g, [wd], size, F);
  // lay out lines
  const lines = [[]];
  let lw = 0;
  for (const wd of words) {
    if (wd.br) { lines.push([]); lw = 0; continue; }
    const ww = widthOf(wd);
    if (lw + ww > w && lines[lines.length - 1].length) { lines.push([]); lw = 0; if (wd.t === " ") continue; }
    lines[lines.length - 1].push(wd); lw += ww;
  }
  for (const line of lines) {
    const tall = line.some((wd) => wd.frac);
    const base = y + size * (tall ? 1.55 : 1.0);
    let cx = x;
    for (const wd of line) {
      if (!wd.frac) { cx = drawRuns(g, [wd], cx, base, size, F, color); continue; }
      const [num, den] = wd.frac, nw = runsWidth(g, num, fs, F), dw = runsWidth(g, den, fs, F), fw = Math.max(nw, dw);
      const axis = base - size * 0.3, pad = size * 0.15;
      drawRuns(g, num, cx + pad + (fw - nw) / 2, axis - size * 0.16, fs, F, color);
      drawRuns(g, den, cx + pad + (fw - dw) / 2, axis + size * 0.16 + fs * 0.78, fs, F, color);
      g.fillRect(cx + pad * 0.6, axis - Math.max(1.5, size * 0.03), fw + pad * 0.8, Math.max(3, size * 0.06));
      cx += fw + 2 * pad;
    }
    y = base + size * (tall ? 0.85 : 0) + size * gap;
  }
  return y;
}

/**
 * A board: a flat rectangle w × h metres, drawn by draw(g, W, H, btn) on a canvas of `ppm` pixels per metre.
 * btn(id, label, x, y, w, h, {on, tone}) draws a button and makes it pressable. Returns
 * { mesh, redraw(), press(uv) → button id or null, buttons }.
 */
export function makeBoard(w, h, draw, { ppm = 900, bg = PAPER, radius = 26, doubleSided = false } = {}) {
  const cv = document.createElement("canvas"), W = Math.round(w * ppm), H = Math.round(h * ppm);
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const board = { mesh, buttons: [], hover: null };
  function btn(id, label, x, y, bw, bh, { on = false, tone = "plain", size = Math.round(bh * 0.42) } = {}) {
    board.buttons.push({ id, x, y, w: bw, h: bh });
    const hot = board.hover === id;
    g.fillStyle = on ? ACCENT : tone === "go" ? ACCENT : "#ffffff";
    g.strokeStyle = hot ? "#e0a100" : on || tone === "go" ? ACCENT : "#b9b4a6";
    g.lineWidth = hot ? 8 : 3;
    g.beginPath(); g.roundRect(x, y, bw, bh, Math.min(18, bh / 3)); g.fill(); g.stroke();
    const runs = parse(label), F = SANS, tw = runsWidth(g, runs, size, F);
    drawRuns(g, runs, x + (bw - tw) / 2, y + bh / 2 + size * 0.36, size, F, on || tone === "go" ? "#ffffff" : INK);
  }
  board.redraw = () => {
    board.buttons = [];
    g.clearRect(0, 0, W, H);
    g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, W, H, radius); g.fill();
    draw(g, W, H, btn);
    tex.needsUpdate = true;
  };
  /** The button under a point of the board (uv from a raycast hit). */
  board.at = (uv) => {
    if (!uv) return null;
    const px = uv.x * W, py = (1 - uv.y) * H;
    const b = board.buttons.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
    return b ? b.id : null;
  };
  board.setHover = (id) => { if (id !== board.hover) { board.hover = id; board.redraw(); } };
  mesh.userData = { kind: "board", board };
  board.redraw();
  return board;
}

/** A small label that always faces the viewer; parts as markup. h: height in metres. */
export function sprite(text, h = 0.05, { color = INK, bg = "rgba(255,255,255,0.92)" } = {}) {
  const cv = document.createElement("canvas"), g = cv.getContext("2d"), size = 64, pad = 18;
  const runs = parse(text);
  const w = runsWidth(g, runs, size, SANS);
  cv.width = Math.ceil(w + pad * 2); cv.height = size + pad;
  g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, 22); g.fill();
  drawRuns(g, runs, pad, cv.height / 2 + size * 0.36, size, SANS, color);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set((h * cv.width) / cv.height, h, 1);
  return s;
}
