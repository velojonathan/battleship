# Manual QA Checklist

Filled in during Checkpoint 8 final QA.

## Solo mode

- [ ] Solo vs Easy completes start to finish
- [ ] Solo vs Medium completes start to finish
- [ ] Solo vs Hard completes start to finish
- [ ] AI never repeats a shot
- [ ] AI never fires illegally

## Local two-player

- [ ] Setup handoff appears between Player 1 and Player 2 placement
- [ ] Turn handoff appears between every turn
- [ ] Opponent's hidden ship board is NOT in the DOM during the other player's turn
- [ ] Rapid double-click does not fire two shots
- [ ] End game reveals both fleets

## Placement

- [ ] Random placement rerolled 50+ times — every fleet legal
- [ ] Invalid placement (out-of-bounds / overlap) is blocked with error feedback
- [ ] Start button is disabled until fleet is fully placed

## Reset / persistence

- [ ] Rematch from end-game returns to setup with empty boards
- [ ] Return-home preserves preferences (mode, difficulty, names, reduced motion)
- [ ] Aggregate stats persist across reloads
- [ ] In-progress game state is NEVER persisted

## Accessibility / UX

- [ ] Cells have descriptive ARIA labels
- [ ] Battle log uses `aria-live`
- [ ] Reduced motion: decorative animations disabled when `prefers-reduced-motion` is set
- [ ] Strong focus state on keyboard nav
- [ ] No reliance on color alone for hit/miss/sunk

## Layout

- [ ] Desktop (1440px) — own + targeting board side-by-side
- [ ] Mobile (375px) — boards stack cleanly, no horizontal scroll
- [ ] Touch targets ≥36×36 CSS pixels

## Browser

- [ ] No console errors during normal play
