// vr.phylab.uk — the Worker. Everything in public/ is served as static files; only /api/duel comes here first:
// a WebSocket to the Duel lobby (one Durable Object for the whole site, like the one game hall of old QQ games).
//
// The lobby has a few tables with two seats each. A player only gives a name (chosen from a list on the page) and a
// random id kept in the browser, so there is no account. Sitting down is "ready"; when both seats of a table are
// taken, a 3-second countdown starts (either player can stand up to stop it), then the game starts.
// During a game the lobby only passes messages between the two players of that table, and it keeps the score:
// a hit is reported by the player whose browser follows that charge (see public/duel.js), and is counted once.
import { DurableObject } from "cloudflare:workers";

const TABLES = 6, HP = 5, COUNTDOWN = 3000, GRACE = 10000;
const RELAY = new Set(["pose", "fire", "proj", "gone"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/duel") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("This address takes a WebSocket.", { status: 426 });
      return env.LOBBY.get(env.LOBBY.idFromName("duel")).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

const clean = (s, n) => String(s || "").replace(/[^\p{L}\p{N} '\-]/gu, "").trim().slice(0, n);

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map(); // id -> { id, name, ws, table, seat, ready, gone }
    this.tables = Array.from({ length: TABLES }, () => ({ seats: [null, null], state: "open", until: 0, timer: null, hp: [HP, HP], hits: new Set() }));
  }

  async fetch() {
    const [client, ws] = Object.values(new WebSocketPair());
    ws.accept();
    const conn = { p: null };
    ws.addEventListener("message", (e) => {
      if (typeof e.data !== "string" || e.data.length > 8000) return;
      let m; try { m = JSON.parse(e.data); } catch (err) { return; }
      this.onMessage(ws, conn, m, e.data);
    });
    const closed = () => this.onClose(ws, conn);
    ws.addEventListener("close", closed);
    ws.addEventListener("error", closed);
    return new Response(null, { status: 101, webSocket: client });
  }

  send(p, m) { if (p && p.ws) try { p.ws.send(typeof m === "string" ? m : JSON.stringify(m)); } catch (err) { /* closing */ } }
  opponent(p) { const t = this.tables[p.table]; return t ? this.players.get(t.seats[1 - p.seat]) : null; }

  uniqueName(name, id) {
    const base = clean(name, 24) || "Player";
    const taken = (n) => [...this.players.values()].some((q) => q.id !== id && q.name === n);
    let n = base, k = 2;
    while (taken(n)) n = `${base} ${k++}`;
    return n;
  }

  onMessage(ws, conn, m, raw) {
    if (m.t === "hello") {
      const id = clean(m.id, 40).replace(/\s/g, "") || crypto.randomUUID();
      let p = this.players.get(id);
      if (p) {                                     // the same browser again (a dropped connection, or a second tab)
        clearTimeout(p.gone); p.gone = null;
        if (p.ws && p.ws !== ws) try { p.ws.close(4000, "opened again"); } catch (err) { /* gone */ }
        p.ws = ws;
      } else {
        p = { id, name: this.uniqueName(m.name, id), ws, table: null, seat: null, ready: false, gone: null };
        this.players.set(id, p);
      }
      conn.p = p;
      this.send(p, { t: "welcome", name: p.name });
      const t = this.tables[p.table];
      if (t && t.state === "playing") this.send(p, { t: "start", table: p.table, seat: p.seat, opponent: this.opponent(p)?.name || "", hp: t.hp, resume: true });
      this.broadcast();
      return;
    }
    const p = conn.p;
    if (!p || p.ws !== ws) return;
    const t = this.tables[p.table];

    if (RELAY.has(m.t)) { if (t && t.state === "playing") this.send(this.opponent(p), raw); return; }
    switch (m.t) {
      case "name":
        p.name = this.uniqueName(m.name, p.id);
        this.send(p, { t: "welcome", name: p.name });
        break;
      case "sit": {
        const nt = this.tables[m.table], s = m.seat;
        if (!nt || (s !== 0 && s !== 1) || nt.seats[s] || nt.state === "playing") return;
        if (t && t.state === "playing") return;     // leave the game first
        this.stand(p);
        nt.seats[s] = p.id; p.table = m.table; p.seat = s; p.ready = true;
        this.maybeStart(nt);
        break;
      }
      case "ready":
        if (!t || t.state !== "open") return;
        p.ready = true; this.maybeStart(t);
        break;
      case "stand":
        this.stand(p);
        break;
      case "hit": {                                  // a charge hit seat m.target; count each charge only once
        if (!t || t.state !== "playing" || (m.target !== 0 && m.target !== 1)) return;
        const key = String(m.pid || "").slice(0, 40);
        if (!key || t.hits.has(key)) return;
        t.hits.add(key);
        t.hp[m.target] = Math.max(0, t.hp[m.target] - 1);
        for (const id of t.seats) this.send(this.players.get(id), { t: "score", hp: t.hp, target: m.target });
        if (t.hp[m.target] === 0) this.finish(t, 1 - m.target, "hits");
        return;
      }
      default: return;
    }
    this.broadcast();
  }

  onClose(ws, conn) {
    const p = conn.p;
    if (!p || p.ws !== ws) return;                 // an old connection of a player who is already back
    p.ws = null;
    // keep the seat (and a game) for a little while: a headset's connection can drop for a moment
    p.gone = setTimeout(() => { this.stand(p); this.players.delete(p.id); this.broadcast(); }, GRACE);
    this.broadcast();
  }

  maybeStart(t) {
    if (t.state !== "open" || !t.seats.every((id) => id && this.players.get(id)?.ready)) return;
    t.state = "countdown"; t.until = Date.now() + COUNTDOWN;
    t.timer = setTimeout(() => this.begin(t), COUNTDOWN);
  }

  begin(t) {
    const [a, b] = t.seats.map((id) => this.players.get(id));
    if (!a || !b) { t.state = "open"; this.broadcast(); return; }
    t.state = "playing"; t.hp = [HP, HP]; t.hits = new Set();
    const i = this.tables.indexOf(t);
    this.send(a, { t: "start", table: i, seat: 0, opponent: b.name, hp: t.hp });
    this.send(b, { t: "start", table: i, seat: 1, opponent: a.name, hp: t.hp });
    this.broadcast();
  }

  finish(t, winner, reason) {
    t.state = "open"; clearTimeout(t.timer);
    for (const id of t.seats) {
      const p = this.players.get(id);
      if (!p) continue;
      p.ready = false;                             // after a game, both press Play again to start another
      this.send(p, { t: "over", winner, reason, hp: t.hp });
    }
    this.broadcast();
  }

  stand(p) {
    const t = this.tables[p.table];
    if (!t) return;
    t.seats[p.seat] = null; p.table = null; p.seat = null; p.ready = false;
    if (t.state === "countdown") { clearTimeout(t.timer); t.state = "open"; }
    if (t.state === "playing") { const s = t.seats.findIndex(Boolean); this.finish(t, s, "left"); }
  }

  broadcast() {
    const now = Date.now();
    const tables = this.tables.map((t) => ({
      state: t.state,
      left: t.state === "countdown" ? Math.max(0, t.until - now) : 0,
      seats: t.seats.map((id) => { const q = this.players.get(id); return q ? { name: q.name, ready: q.ready, away: !q.ws } : null; }),
    }));
    for (const p of this.players.values()) {
      if (!p.ws) continue;
      this.send(p, { t: "lobby", tables, me: p.table === null ? null : { table: p.table, seat: p.seat }, online: this.players.size });
    }
  }
}
