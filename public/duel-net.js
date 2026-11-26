// vr.phylab.uk — Duel: the connection to the lobby (/api/duel). No account: a random id kept in this browser,
// so the lobby knows it is the same player after a dropped connection, and the name chosen from the list.
// The connection comes back by itself after it drops.
const ID_KEY = "duel-id", NAME_KEY = "duel-name";
const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage off */ } };

export const savedName = () => get(NAME_KEY);
export const saveName = (n) => set(NAME_KEY, n);
function myId() {
  let id = get(ID_KEY);
  if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""); set(ID_KEY, id); }
  return id;
}

export function connect({ onMessage, onStatus }) {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/duel`;
  let ws = null, wait = 500;
  function open() {
    onStatus("connecting");
    ws = new WebSocket(url);
    ws.onopen = () => { wait = 500; ws.send(JSON.stringify({ t: "hello", id: myId(), name: savedName() || "" })); onStatus("online"); };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onMessage(m); };
    ws.onclose = (e) => {
      onStatus("offline");
      if (e.code === 4000) return;                 // this page was opened again elsewhere: that one takes over
      setTimeout(open, wait); wait = Math.min(wait * 2, 5000);
    };
  }
  open();
  return {
    send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); },
    get online() { return !!ws && ws.readyState === 1; },
  };
}
