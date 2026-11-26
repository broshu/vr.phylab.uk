# vr.phylab.uk

The 3D and VR part of the electric-field lesson, on its own short address so it is quick to type on a headset.
It was moved out of learn.phylab.uk (broshu/learn.phylab.uk, `public/during/`); the lesson there is unchanged.

- `/` — the project list: big boxes to point at in a headset
- `/explore/` — Explore: place charges and charged objects in 3D and look at their field lines
- `/match/` — Match: place hidden charges to make the orange field you are shown
- `/lab/` — Electromagnetism lab: a classroom-sized room with five stations (a point charge, parallel plates, a box of uniform magnetic field, a bar magnet, a coil) and a table to build on; a particle gun in the right hand, a probe for E and B in the left, challenges at each station
- `/duel/` — Duel: two players, each with an electric and a magnetic shield, fire charges at each other (see below)
- `/crystal/` — Crystal unit cells: six structures (simple cubic, body-centred cubic, face-centred cubic, sodium chloride, caesium chloride, diamond). See the crystal with one unit cell marked, take the cell out (atoms cut along the cell faces, so only the part that belongs to the cell is left), pull the pieces apart, and see a corner, edge or face atom shared between 8, 4 or 2 cells. The count (with stacked fractions), the formula and the packing fraction are hidden until Show the count, so learners count first. Either hand: trigger on a button presses it, trigger or grip elsewhere holds the crystal, stick up and down resizes it. The preview's board can be clicked with a mouse.
- `/cabinet/` — Crystal cabinet: a museum cabinet with nine crystals (rock salt, snowflake, quartz, pyrite, diamond, silicon wafer, pencil lead, calcite, copper). Point at one to take it out, then zoom in three steps: 1 the object (real size and magnification shown), 2 the same shape built from unit-cell bricks (Haüy's idea; how many cells there really are; copper shows three grains, graphite its layers), 3 the atoms of a few unit cells with one cell outlined and a key. Atomic positions are real and were checked against published bond lengths (quartz Si–O 1.61 Å; pyrite Fe–S 2.26 Å, S–S 2.16 Å; calcite C–O 1.29 Å, Ca–O 2.36 Å; ice O–O 2.76 Å). Same hands as Crystal unit cells.
- The site is for VR headsets only: there are no Browser or AR modes. A project page shows the space and a large Start VR button (a browser only starts VR from a tap, a pinch or the trigger, never by itself). On a device that cannot open VR the page says so and shows the space as a preview you can turn with the mouse.
- Fewer Start VR presses (`public/xr-nav.js`): choosing a box on the home page starts VR there and hands it on, so the project opens already in VR; in VR, the project buttons on the floor (front left) go to another project and stay in VR. This needs the browser to hand the VR session on to the next page (the `sessiongranted` event in Meta Quest Browser). If it does not, the project page shows Start VR as before, and the home page stops trying in that browser. Meta Quest Browser also shows an Enter VR button in its own bar (`offerSession`).

## Adding a project

1. Add an entry to `public/projects.js` (`slug`, `title`, `blurb`). It then appears on the home page.
2. Make `public/<slug>/index.html` (copy `public/explore/index.html`). Its address is `vr.phylab.uk/<slug>/`.

## Files

- `public/space3d.js` — the 3D space (three.js, WebXR VR)
- `public/match.js`, `public/match-judge.js` — the match task and its forgiving check
- `public/xr-nav.js` — going from page to page in VR without pressing Start VR again
- `public/shell.js` — the top bar of a project page (back to the list, project name)
- `public/duel.js` — Duel: the lobby and the game in VR
- `public/duel-physics.js` — Duel: the fields of the two shields and how a charge moves (no three.js, can be tested on its own)
- `public/duel-net.js` — Duel: the connection to the lobby
- `src/worker.js` — the Worker: serves `public/`, and `/api/duel`, the lobby (a Durable Object)
- `public/vendor/three/` — three.js
- `public/record.js` — a small record kept in this tab only
- `public/lab.js` — the electromagnetism lab: the room, stations, challenges, particle gun, probe, wrist menu and moving (walking, joystick with a comfort ring, teleport, turning in 30° steps)
- `public/lab-physics.js` — its physics: fields of charges, poles, current loops (Biot–Savart) and uniform regions, added together; the Boris method for the motion of a charged particle; field lines
- `public/crystal.js` — Crystal unit cells: the structures, the cut atoms (clipping planes that follow each piece, with discs over the cut faces), the board and the hands
- `public/cabinet.js` — Crystal cabinet: the room and cabinet, the nine specimens (object geometry, brick shapes, lattices and atom positions, texts), the three zoom steps, the board and the hands
- `public/lab-text.js` — its boards and buttons, with italic symbols and stacked fractions

## Duel

- **Lobby.** No account. The first time, you choose a name from a list (no typing in a headset); it is kept in the browser, with a random id, so a dropped connection gets its seat back. Six tables with two seats each: point at an empty seat and press the trigger to sit. When both seats are taken a 3-second countdown starts; pointing at your own seat stands you up. After a game, both point at their seat (Play again) to start another. **Practice** fires charges at you from the other end, with no one else needed.
- **Controllers.** Right trigger: hold to charge, let go to fire (longer is faster, 4 to 10 m/s). A or B: the sign of the charge. Left trigger: hold to raise the shield (it uses energy). X: electric or magnetic shield. Y: turn the shield round.
- **Physics** (`duel-physics.js`). The electric shield is a uniformly charged ball in front of the left hand: like charges are slowed and pushed back, unlike charges pulled in. The magnetic shield is a uniform field in a slab in front of the left hand, along the top of the controller: the force is at right angles to the velocity, so it turns a charge and never slows it. Charges are moved with the Boris method, which keeps the speed exactly the same in a magnetic field. Fast charges get through either shield more easily. 5 hits and you are out; your own charges can hit you too.
- **Who decides a hit.** Every charge is followed in both browsers, but only the player it was fired at decides what it hits (their own shield and body have no delay there); they send its position ten times a second so both see the same path, and report hits to the lobby, which counts each charge once and keeps the score.
- **Testing with one headset.** A computer browser can also sit at a table: click to fire (no shield).
- The lobby is one Durable Object (`Lobby`, SQLite class, so it runs on the free plan). It keeps a seat 10 seconds after a connection drops; after that the other player wins.

## How it runs

One Cloudflare Worker (`vr-phylab-uk`) serving `public/` as static files, custom domain `vr.phylab.uk`. Requests to `/api/*` go to the Worker first (`src/worker.js`): `/api/duel` is the Duel lobby.
Local test: `npx wrangler dev`, then open `http://localhost:8787/duel/` in two browser windows.
Deploy: `npx wrangler deploy`, or connect this repo to Workers Builds so every push to `main` deploys.
