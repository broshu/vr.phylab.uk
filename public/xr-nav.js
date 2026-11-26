// vr.phylab.uk — going from page to page without pressing Start VR again.
//
// A browser only starts VR from a tap, a pinch or the trigger. But when a page is in VR and goes to another page,
// Meta Quest Browser can hand the VR session on: the new page gets a "sessiongranted" event and may then start VR
// by itself. This file uses that in two places:
//   - the home page: choosing a project box starts VR there (that choice is the tap), then goes to the project,
//     so the project page opens straight in VR;
//   - a project page: the project buttons on the floor in VR go to another project and stay in VR.
// If the browser does not hand the session on, the project page simply shows its Start VR button, as before, and
// the home page stops trying (remembered in this browser), so nobody sees VR flash on and off.

const xr = navigator.xr;
const NAV_KEY = "vr-nav", TRY_KEY = "vr-nav-try";
const store = (s, k, v) => { try { v === undefined ? s.removeItem(k) : s.setItem(k, v); } catch (e) { /* storage off */ } };
const read = (s, k) => { try { return s.getItem(k); } catch (e) { return null; } };

// listen at once: the event can come as soon as the page has loaded
let grantedNow = false;
const granted = new Promise((resolve) => {
  if (!xr) return resolve(false);
  xr.addEventListener("sessiongranted", () => { grantedNow = true; resolve(true); });
});

/** Resolves true if the page that sent us here handed its VR session on (waits at most `ms`). */
export function sessionGranted(ms = 2500) {
  if (grantedNow) return Promise.resolve(true);
  const cameFromVR = read(sessionStorage, TRY_KEY) === "1";
  store(sessionStorage, TRY_KEY);
  if (!cameFromVR) ms = 300; // not sent here from VR: only a short wait, in case the browser's own Back did it
  return Promise.race([granted, new Promise((r) => setTimeout(() => r(false), ms))]).then((ok) => {
    // remember whether handing on works in this browser, so the home page knows whether to try
    if (cameFromVR) store(localStorage, NAV_KEY, ok ? "on" : "off");
    return ok;
  });
}

/** Go to another page while in VR, asking the next page to start VR by itself. */
export function goInVR(href) {
  store(sessionStorage, TRY_KEY, "1");
  location.href = href;
}

/**
 * Home page: choosing a project box starts VR at once (an empty dark room for a moment), then goes to the project.
 * Falls back to an ordinary link when the browser cannot open VR or did not hand the session on last time.
 */
export async function vrLinks(container) {
  if (!xr || read(localStorage, NAV_KEY) === "off") return;
  const ok = await xr.isSessionSupported("immersive-vr").catch(() => false);
  if (!ok) return;
  container.addEventListener("click", async (e) => {
    const a = e.target.closest("a[href]");
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    try {
      const session = await xr.requestSession("immersive-vr", { optionalFeatures: ["hand-tracking"] });
      // the session needs something to draw: a plain dark room, the colour of the VR space
      const gl = document.createElement("canvas").getContext("webgl2", { xrCompatible: true });
      await session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
      const frame = () => {
        const layer = session.renderState.baseLayer;
        gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
        gl.clearColor(0.11, 0.13, 0.19, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        session.requestAnimationFrame(frame);
      };
      session.requestAnimationFrame(frame);
    } catch (err) { location.href = a.href; return; } // could not start VR here: just open the page
    goInVR(a.href);
  });
}
