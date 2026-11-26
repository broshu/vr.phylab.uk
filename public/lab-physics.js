// vr.phylab.uk — the physics of the electromagnetism lab (/lab/): electric and magnetic fields of the things in the
// room, the motion of a charged particle in them, and field lines. No three.js here, so it can be tested on its own.
//
// Units: lengths in metres and times in seconds, as in the room. Charges, masses and field strengths are scaled so
// that the paths are a metre or so across at walking pace; the directions, and how a path depends on v, E, B and q/m,
// are the real ones. Each particle has a charge-to-mass ratio qm (electron −1, proton +1, alpha +½, neutron 0).
//   point charge:  E = Q r̂ / r²                         (k = 1)
//   magnetic pole: B = p r̂ / r²                         (a bar magnet is a north pole +p and a south pole −p)
//   current loop:  B from the Biot–Savart law, summed over straight pieces, with c·I in place of μ₀I / 4π
//   uniform field: E or B inside a box, zero outside     (parallel plates; the field region of a cyclotron-like box)

/** Everything that makes a field, flattened for fast sums. Build it again whenever something changes. */
export function makeField() {
  return { points: [], poles: [], loops: [], uniE: [], uniB: [], boxes: [], spheres: [] };
}

/** A circle of wire: centre c, unit axis a (the right-hand rule: current going round a gives B along a), radius R. */
export function addLoop(f, c, a, R, cI, n = 36) {
  const [u, w] = basis(a), pts = new Float64Array(3 * (n + 1));
  for (let k = 0; k <= n; k++) {
    const t = (2 * Math.PI * k) / n, cs = Math.cos(t), sn = Math.sin(t);
    pts[3 * k] = c[0] + R * (cs * u[0] + sn * w[0]);
    pts[3 * k + 1] = c[1] + R * (cs * u[1] + sn * w[1]);
    pts[3 * k + 2] = c[2] + R * (cs * u[2] + sn * w[2]);
  }
  f.loops.push({ pts, cI, c, a, R });
}

/** Two unit vectors u, w at right angles to a, with u × w = a. */
export function basis(a) {
  const t = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(t, a)), w = cross(a, u);
  return [u, w];
}
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
const inBox = (b, x, y, z) => x > b[0] && x < b[1] && y > b[2] && y < b[3] && z > b[4] && z < b[5];

/** E and B at (x, y, z), written into the arrays E and B. */
export function fieldAt(f, x, y, z, E, B) {
  E[0] = E[1] = E[2] = B[0] = B[1] = B[2] = 0;
  for (const s of f.points) {
    const dx = x - s.x, dy = y - s.y, dz = z - s.z, r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 1e-8) continue;
    const k = s.Q / (r2 * Math.sqrt(r2));
    E[0] += k * dx; E[1] += k * dy; E[2] += k * dz;
  }
  for (const s of f.poles) {
    const dx = x - s.x, dy = y - s.y, dz = z - s.z, r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 1e-8) continue;
    const k = s.p / (r2 * Math.sqrt(r2));
    B[0] += k * dx; B[1] += k * dy; B[2] += k * dz;
  }
  // a straight piece of wire from A to C, seen from the point: a = A − P, b = C − P.
  // B = c·I (a × b)(|a| + |b|) / (|a||b|(|a||b| + a·b)), the Biot–Savart law integrated along the piece
  for (const L of f.loops) {
    const p = L.pts, n = p.length - 3;
    for (let k = 0; k < n; k += 3) {
      const ax = p[k] - x, ay = p[k + 1] - y, az = p[k + 2] - z, bx = p[k + 3] - x, by = p[k + 4] - y, bz = p[k + 5] - z;
      const la = Math.sqrt(ax * ax + ay * ay + az * az), lb = Math.sqrt(bx * bx + by * by + bz * bz);
      const den = la * lb * (la * lb + ax * bx + ay * by + az * bz);
      if (den < 1e-12) continue;
      const s = (L.cI * (la + lb)) / den;
      B[0] += s * (ay * bz - az * by); B[1] += s * (az * bx - ax * bz); B[2] += s * (ax * by - ay * bx);
    }
  }
  for (const u of f.uniE) if (inBox(u.box, x, y, z)) { E[0] += u.E[0]; E[1] += u.E[1]; E[2] += u.E[2]; }
  for (const u of f.uniB) if (inBox(u.box, x, y, z)) { B[0] += u.B[0]; B[1] += u.B[1]; B[2] += u.B[2]; }
}

/** How close (x, y, z) is to something where the field is very strong: a charge, a pole or a wire. */
export function nearest(f, x, y, z) {
  let d = Infinity;
  for (const s of f.points) d = Math.min(d, Math.hypot(x - s.x, y - s.y, z - s.z));
  for (const s of f.poles) d = Math.min(d, Math.hypot(x - s.x, y - s.y, z - s.z));
  for (const L of f.loops) d = Math.min(d, wireDist(L, x, y, z));
  return d;
}
/** Distance from a point to the wire of a loop. */
export function wireDist(L, x, y, z) {
  const dx = x - L.c[0], dy = y - L.c[1], dz = z - L.c[2];
  const along = dx * L.a[0] + dy * L.a[1] + dz * L.a[2];
  const across = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
  return Math.hypot(along, across - L.R);
}

const E_ = [0, 0, 0], B_ = [0, 0, 0];
/**
 * One step of the Boris method for m dv/dt = q(E + v × B): half a kick from E, a rotation about B, half a kick from E.
 * In a magnetic field alone the speed stays exactly the same, so a circle stays a circle however long it runs.
 */
export function boris(pt, h, f) {
  const k = pt.qm * h / 2;
  fieldAt(f, pt.x, pt.y, pt.z, E_, B_);
  let vx = pt.vx + k * E_[0], vy = pt.vy + k * E_[1], vz = pt.vz + k * E_[2];
  const tx = k * B_[0], ty = k * B_[1], tz = k * B_[2], t2 = tx * tx + ty * ty + tz * tz, s = 2 / (1 + t2);
  const px = vx + (vy * tz - vz * ty), py = vy + (vz * tx - vx * tz), pz = vz + (vx * ty - vy * tx);
  vx += s * (py * tz - pz * ty); vy += s * (pz * tx - px * tz); vz += s * (px * ty - py * tx);
  pt.vx = vx + k * E_[0]; pt.vy = vy + k * E_[1]; pt.vz = vz + k * E_[2];
  pt.x += pt.vx * h; pt.y += pt.vy * h; pt.z += pt.vz * h;
}

/** A step size that is small near a charge, pole or wire and never more than 4 ms. */
export function stepFor(f, pt) {
  const v = Math.hypot(pt.vx, pt.vy, pt.vz) || 1;
  return Math.min(0.004, Math.max(0.0004, (0.08 * nearest(f, pt.x, pt.y, pt.z)) / v));
}

/** Is the point inside an object (a charge, a magnet, a plate)? Returns the object, or null. */
export function hitObject(f, x, y, z) {
  for (const s of f.spheres) if ((x - s.x) ** 2 + (y - s.y) ** 2 + (z - s.z) ** 2 < s.r * s.r) return s;
  for (const b of f.boxes) {
    // b.m: the room-to-box rotation (rows are the box's own axes); b.c its centre; b.h its half sizes
    const dx = x - b.c[0], dy = y - b.c[1], dz = z - b.c[2], m = b.m;
    if (Math.abs(m[0] * dx + m[1] * dy + m[2] * dz) < b.h[0] && Math.abs(m[3] * dx + m[4] * dy + m[5] * dz) < b.h[1] &&
        Math.abs(m[6] * dx + m[7] * dy + m[8] * dz) < b.h[2]) return b;
  }
  for (const L of f.loops) if (wireDist(L, x, y, z) < 0.012) return { tag: "wire" };
  return null;
}

/**
 * A field line through `start`, followed along the field (dir = +1) or against it (dir = −1) with fourth-order
 * Runge–Kutta steps on the field's direction. Stops after maxLen, outside the sphere (bound.c, bound.r), when
 * stop(x, y, z) is true, where the field is too weak, or when the line comes back to its start (a closed line).
 */
export function traceLine(f, which, start, dir, { maxLen = 2, bound, stop, closes = false } = {}) {
  const E = [0, 0, 0], B = [0, 0, 0];
  const unit = (x, y, z) => {
    fieldAt(f, x, y, z, E, B);
    const F = which === "E" ? E : B, m = Math.hypot(F[0], F[1], F[2]);
    return m < 1e-5 ? null : [(dir * F[0]) / m, (dir * F[1]) / m, (dir * F[2]) / m];
  };
  let [x, y, z] = start, len = 0, closed = false;
  const pts = [x, y, z];
  while (len < maxLen) {
    const h = Math.min(0.03, Math.max(0.003, 0.2 * nearest(f, x, y, z)));
    const k1 = unit(x, y, z); if (!k1) break;
    const k2 = unit(x + h / 2 * k1[0], y + h / 2 * k1[1], z + h / 2 * k1[2]); if (!k2) break;
    const k3 = unit(x + h / 2 * k2[0], y + h / 2 * k2[1], z + h / 2 * k2[2]); if (!k3) break;
    const k4 = unit(x + h * k3[0], y + h * k3[1], z + h * k3[2]); if (!k4) break;
    x += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    len += h; pts.push(x, y, z);
    if (bound && (x - bound.c[0]) ** 2 + (y - bound.c[1]) ** 2 + (z - bound.c[2]) ** 2 > bound.r * bound.r) break;
    if (stop && stop(x, y, z)) break;
    if (closes && len > 0.3 && Math.hypot(x - start[0], y - start[1], z - start[2]) < 0.02) {
      pts.push(start[0], start[1], start[2]); closed = true; break;
    }
  }
  return { pts, closed };
}

/** n directions spread evenly over a sphere (a golden-angle spiral). */
export function spread(n) {
  const out = [], ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), t = ga * i;
    out.push([Math.cos(t) * r, y, Math.sin(t) * r]);
  }
  return out;
}
