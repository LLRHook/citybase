# Citybase Model Shop implementation plan

Profile: full. User-authorized visual reconstruction supersedes the older no-styling-overhaul constraint. Work is isolated on feat/living-city-reimagined.

## Intent
A repository feels like a place: recognizable districts, architecture for files, warm illuminated streets, a camera with weight, and visible cause/effect between Git state, selected files and actual agent work. The core journey stays local and authentic.

## Stack profile
- JavaScript / JSX, React 19, Vite 8, Electron 42; npm package-lock.
- Entry: electron/main/main.cjs, isolated preload, src/App.jsx.
- Tests: Vitest/jsdom; Playwright Electron desktop smoke.
- Required checks: npm run lint; npm run build; npm test -- --run; npm run test:e2e.
- GitHub Actions CI, desktop distribution only, no hosting configuration.
- External execution: locally authenticated Claude/Codex CLIs. No server added.
- Existing constraints retained: renderer sandbox, explicit write-run approval, no public publishing, no unrelated project changes.

## Ordered work
1. Inspect existing code/history, identify real runtime and inspector gaps.
2. Add bounded workspace file/diff reading in the main process, with path and size protections.
3. Build deterministic complete file model and a procedural Three.js city. Use one verified dependency for lighting, real orbiting and instanced geometry.
4. Replace navigation with a calm Observatory shell: neighborhood list, city lens, searchable inspector, agent dispatch overlay and activity feedback.
5. Independently validate real fixture opening, file inspection, Git status, search, camera, agent runtime and error paths. Capture actual rendered screenshots.
6. Review changes, correct concrete issues, document delivered behavior and remaining limits.

## Art direction and references
Final direction: a hand-built architectural model on a workbench under a desk lamp. Balsa base, opaque cream card, ink typography, red pins and stamps, painted crew tokens and paper work orders. The world is the primary play surface; file content appears only on inspection. A read-only critique from Claude Fable 5.1 informed this revision after the user found the first teal design too generic. Inspiration: Bruno Simon's interactive portfolio (https://bruno-simon.com/) for direct exploration and authored world detail, without adopting its driving/navigation mechanic. Technical references: https://threejs.org/docs/pages/OrbitControls.html and https://threejs.org/docs/pages/InstancedMesh.html .

## Risk and rollback
WebGL complexity/performance is bounded by instancing, pixel-ratio caps, cleanup and reduced-motion support. Maintain a useful DOM file explorer if graphics is unavailable. Camera must survive Git refresh. Git service reads must remain confined to current workspace and avoid symlink escape. Existing agent permissions and history stay intact. All changes are in an isolated worktree, so rollback is returning to the original checkout.

## Playable first shift and progression
Walk Pip to a neighborhood, open a real file, choose a crew member, complete a Survey job and stamp the returned report. Juniper maps to Claude; Mica maps to Codex. Crew can be assigned by clicking their token then a building. Survey, Craft and Mend earn separate skill points; 100 total XP raises the crew level and 100 XP in a skill raises that skill level. Game levels record work in this shop and do not change the provider model. The next suggested work order creates a real standalone interactive campfire HTML file, without dependencies.

Survey rewards require successful execution and actual assistant output. Craft/Mend rewards require successful execution and a changed bounded repository fingerprint. This proves an observed state change, not code correctness or sole authorship. Receipts are keyed by run ID to prevent duplicate rewards.

## Local development
Citybase's Vite/Electron development pair uses port 5187 so the user's concurrent Appshot project on 5173 remains independent. The production renderer still loads from dist with no dev server.
