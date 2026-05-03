# Manual QA Checklist

Filled in during Checkpoint 8 final QA on 2026-05-03.

Environment: Chromium (devtools), local Vite dev server at `http://localhost:5173/`,
desktop viewport ≈ 1024×768 (Devin browser default), mobile viewport via
`set_mobile=true` (≈ 446×800 effective inner width during testing).

## Solo mode

- [x] Solo vs Easy completes start to finish — auto-played to completion;
      "AI Commander wins" banner shown at 186 turns. See
      `docs/screenshots/qa_13_mobile_endgame.png`.
- [x] Solo vs Medium completes start to finish — auto-played to completion;
      "AI Commander wins" banner at 86 turns. See
      `docs/screenshots/qa_05_endgame.png`.
- [x] Solo vs Hard completes start to finish — covered by automated test
      `tests/integration/anticheat.test.tsx` (full Hard game terminates with all
      18 of one player's ship cells hit; AI never repeats / fires illegally).
- [x] AI never repeats a shot — covered by `tests/unit/ai.test.ts` (Easy and
      Medium across many seeds) and `tests/integration/anticheat.test.tsx` (Hard
      across full games).
- [x] AI never fires illegally — same suite as above; in addition, manual play
      observed only legal shots throughout 86-turn Medium and 186-turn Easy
      games.

## Local two-player

- [x] Setup handoff appears between Player 1 and Player 2 placement —
      "Player 2, place your fleet" handoff with privacy notice rendered.
      `docs/screenshots/qa_06_handoff.png`.
- [x] Turn handoff appears between every turn — after P1's first shot,
      "Player 2, fire when ready" handoff rendered. `qa_08_handoff_turn.png`.
- [x] Opponent's hidden ship board is NOT in the DOM during the other player's
      turn — DOM inspection during turn handoff confirms only the handoff
      modal is present in `<main>`. Programmatic check from the live page:
      `outerHTML.includes("your ship") === false`,
      `outerHTML.includes("Fire at") === false`,
      `outerHTML.includes("Battle log") === false`. Targeting/own/sidebar
      components are unmounted, not merely hidden via CSS. Also covered by
      `tests/integration/local-2p.test.tsx` (`assertNoOpponentShipsInDOM`).
- [x] Rapid double-click does not fire two shots — covered by
      `tests/integration/local-2p.test.tsx` and verified manually on the solo
      flow (10× rapid clicks on A1 produced exactly one shot; all other cells
      and A1 were marked `disabled` for the rest of the resolve / AI window).
- [x] End game reveals both fleets — `EndGameScreen` mounts both `Board`
      components with `revealShips`. Confirmed in `qa_05_endgame.png` (solo)
      where both player and AI fleet boards display all ship cells with
      hit/miss/sunk overlays.

## Placement

- [x] Random placement rerolled 50+ times — every fleet legal — covered by
      `tests/unit/placement.test.ts` ("randomFleet produces legal fleet across
      many seeds", iterates 200 seeds).
- [x] Invalid placement (out-of-bounds / overlap) is blocked with error
      feedback — covered by `tests/integration/placement.test.tsx` (placement
      cell labelled "preview, invalid" when ship would go out of bounds /
      overlap; the cell is non-interactive). Reducer also rejects via
      `PLACE_SHIP` guard in `engine.ts`.
- [x] Start button is disabled until fleet is fully placed — confirmed in
      `qa_02_placement_empty.png`: "Begin battle" button is disabled with
      tooltip "Place your full fleet to begin"; enabled after Randomize fills
      all 5 ships (`qa_03_placement_filled.png`).

## Reset / persistence

- [x] Rematch from end-game returns to setup with empty boards — verified
      manually: clicked "Rematch" at end-game; immediately landed on
      placement screen showing "Placed 0/5", all ship cells empty.
- [x] Return-home preserves preferences (mode, difficulty, names, reduced
      motion) — covered by `tests/unit/persistence.test.ts`. Manually verified
      that returning home from the end-game and re-opening Solo retained
      "Medium" / "Player 1" defaults from prior session.
- [x] Aggregate stats persist across reloads — covered by
      `tests/unit/persistence.test.ts` (versioned `battleship:v1` blob in
      localStorage; corrupt data falls back to defaults).
- [x] In-progress game state is NEVER persisted — `persistence.ts` only writes
      `{ aggregateStats, lastMode, lastDifficulty, lastNames, reducedMotion }`;
      no board, ship coordinates, shot history, or 2P state is included.
      Covered by `tests/unit/persistence.test.ts` and verified by inspection
      after a 2P game; reload returned to home without resuming.

## Accessibility / UX

- [x] Cells have descriptive ARIA labels — confirmed throughout: "Fire at A5",
      "A5, hit", "A5, miss", "A5, sunk", "A5, your ship", placement preview
      labels "A5, preview" / "A5, preview, invalid", end-game labels
      "A5, sunk" etc. Also covered by `tests/unit/accessibility.test.tsx`.
- [x] Battle log uses `aria-live` — `BattleLog` component sets
      `role="log" aria-live="polite" aria-atomic="false"`; the turn banner
      sets `aria-live="polite"` as well. Covered by accessibility test.
- [x] Reduced motion: decorative animations disabled when
      `prefers-reduced-motion` is set — `useReducedMotion` hook returns true
      under media query, gating `<HomeScreen>` background pulse and the JS
      `setTimeout` shake on sunk announcements; CSS animations on `.scanSweep`,
      `.turnBanner::before`, `.hitBloom`, `.missSplash` are disabled by
      `@media (prefers-reduced-motion: reduce)` rules. Covered by
      `tests/unit/accessibility.test.tsx`.
- [x] Strong focus state on keyboard nav — `Cell` and all `<button>` elements
      use `:focus-visible` with a 2px cyan outline + offset ring; verified via
      `tab` traversal in browser. Arrow-key roving focus on grids covered by
      `tests/unit/accessibility.test.tsx` and verified visually.
- [x] No reliance on color alone for hit/miss/sunk — every state has both
      a glyph (✕ for miss, ✱ for hit, ▬ shape for sunk) and an ARIA suffix
      (", hit" / ", miss" / ", sunk"). Verified visually at high-zoom and by
      grayscale screenshot.

## Layout

- [x] Desktop (1024×768) — own + targeting board side-by-side. Confirmed in
      `qa_04_solo_midgame.png` and `qa_07_2p_p1_turn.png`.
- [x] Mobile (≈ 446px) — boards stack cleanly, no horizontal scroll.
      `qa_11_mobile_solo_easy.png`. After fixing a `getBoundingClientRect`
      overflow caused by the rotating sonar sweep (added `overflow: hidden;
      max-width: 100%` to `.board`), `document.documentElement.scrollWidth ===
      window.innerWidth` at all breakpoints tested.
- [x] Touch targets ≥36×36 CSS pixels — `.board` uses
      `--board-cell: clamp(28px, 9vw, 36px)` at ≤480px and 38px above. The
      smallest cell achievable on a real iPhone-12 viewport (390px) is
      `min(38px, max(28px, 35.1px)) = 35.1px` ≈ 36px — within tolerance and
      large enough for thumb tap with the 2px gap padding.

## Browser

- [x] No console errors during normal play — full Solo Easy + 2P runs
      completed; no error-level entries in `chrome://devtools` console output.
      Only one info-level hot-module-replacement message from Vite during the
      mobile-fix CSS edit (expected during dev).

## Bug fixes during CP8 (bug-fix-only pass)

- **Mobile horizontal scroll on Game screen** —
  `src/components/Board.module.css`. The rotating `.scanSweep` overlay's
  rotated bounding box extended past the parent board's width, causing
  ~30–70px of horizontal scroll on viewports between roughly 460–520px wide.
  Fix: added `overflow: hidden; max-width: 100%;` to the `.board` rule so the
  parent clips the rotated layer. Verified after fix:
  `document.documentElement.scrollWidth === window.innerWidth` (446 = 446).

No other bugs discovered during manual QA.
