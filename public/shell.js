// vr.phylab.uk — the bar at the top of every project page: a big way back to the project list, and the project's name.
import { PROJECTS } from "/projects.js";

export function mountShell(slug) {
  const p = PROJECTS.find((x) => x.slug === slug);
  const bar = document.createElement("header");
  bar.className = "vbar";
  bar.innerHTML = `<a class="vback" href="/" aria-label="All projects">‹ Projects</a><span class="vtitle">${p ? p.title : slug}</span><span class="vbrand">vr<span>.phylab.uk</span></span>`;
  document.body.prepend(bar);
  if (p) document.title = `${p.title} · vr.phylab.uk`;
}
