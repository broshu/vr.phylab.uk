// vr.phylab.uk — the 3D match, student side only (taken from learn.phylab.uk /during/match.js; the simulated class
// and the teacher's picture stay on learn.phylab.uk).
// A field is shown in orange; you choose objects from the trays and place them to make the same field, without seeing
// your own field lines until you check. Then your lines appear over the target and the check says what to fix.
import { startSpace3D } from "/space3d.js";
import { TARGET, TOL, judgeMatch } from "/match-judge.js";

const OK = "#0d6b5f", BAD = "#c0392b", EXTRA = "#d98200";

export function startMatch({ student, rec, vrFirst = false }) {
  const fb = (student.innerHTML = `<div id="mSpace"></div><div id="mFeedback" aria-live="polite" style="margin-top:12px"></div>`, student.querySelector("#mFeedback"));
  let checks = 0;
  startSpace3D(student.querySelector("#mSpace"), {
    rec, vrFirst, mode: "match", target: TARGET, judge: judgeMatch,
    onCheck(result, placed) {
      checks++;
      rec.set("match", { placed, result, checks });
      fb.innerHTML = feedback(result, placed);
    },
  });

  function feedback(r, placed) {
    if (!placed.length) return `<p class="note warn" style="margin:0"><strong>The table is empty.</strong> Take objects from the trays and place them to make the orange field.</p>`;
    const head = r.ok
      ? `<p class="note" style="margin:0"><strong>Matched.</strong> Your objects were close enough, so they have been moved onto the exact places: now your field (dark lines) lies on the orange one. The orange field comes from a point charge +2<i>q</i>, a point charge &minus;<i>q</i> and a negatively charged plate: half of the lines from +2<i>q</i> end on &minus;<i>q</i>, the other half on the plate.</p>`
      : `<p class="note warn" style="margin:0"><strong>Not yet.</strong> Your field is drawn in dark lines over the orange one. Change your objects, then check again; your lines hide while you change them.</p>`;
    const items = r.items.filter((i) => !r.ok || i.status !== "ok").map((i) =>
      `<li><b style="color:${i.status === "ok" ? OK : i.status === "extra" ? EXTRA : BAD}">${i.status === "ok" ? "Right" : i.status === "extra" ? "Extra" : "Fix"}:</b> ${i.msg}</li>`);
    return `${head}${items.length ? `<ul class="tight" style="margin-top:12px">${items.join("")}</ul>` : ""}
      <p class="muted small" style="margin:6px 0 0">The check is forgiving: within ${TOL.cm} cm, and turned within ${TOL.deg}°.</p>`;
  }
}
