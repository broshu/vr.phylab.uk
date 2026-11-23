// vr.phylab.uk — a tiny record of what happens on this page, kept in this tab only (sessionStorage).
// space3d.js and match.js call rec.event(...) and rec.set(...); nothing is sent anywhere.
const KEY = "vr.phylab.uk/record";
const box = (() => { try { return window.sessionStorage; } catch { return null; } })();
const read = () => { try { return JSON.parse(box.getItem(KEY)) || {}; } catch { return {}; } };
const write = (v) => { try { box.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable: the page still works */ } };

export function openRecord() {
  const rec = read();
  rec.events = rec.events || []; rec.data = rec.data || {};
  const keep = () => write(rec);
  return {
    event(type, detail = {}) { rec.events.push({ t: Date.now(), type, ...detail }); if (rec.events.length > 500) rec.events.shift(); keep(); },
    set(name, value) { rec.data[name] = value; keep(); },
    get(name) { return rec.data[name]; },
  };
}
