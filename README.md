# Battleship — Naval Command

A polished, accessible Battleship web game with solo (vs AI) and local two-player (pass-and-play) modes. Built with React 18, strict TypeScript, Vite, and a pure-reducer game engine.

> Status: implementation in progress through scoped checkpoints. See `battleship-plan.md` for the approved scope.

## Quick start

```bash
npm install
npm run dev          # dev server
npm run typecheck    # tsc -b --noEmit
npm run lint         # ESLint, no warnings allowed
npm test             # Vitest unit tests
npm run test:coverage
npm run build        # Vite production build
npm run preview      # serve the built bundle
npm run e2e          # Playwright (added in a later checkpoint)
```

## Architecture

```
src/
  game/         pure logic (types, engine reducer, AI, placement, rules, persistence)
  components/   React UI (added in Checkpoints 2–7)
  hooks/        useGame, useAITurn, useReducedMotion (added in CP3+)
  styles/       CSS Modules + design tokens
tests/
  unit/         Vitest tests for src/game/**
  integration/  React Testing Library (added in CP2+)
  e2e/          Playwright (added in CP8)
```

The reducer in `src/game/engine.ts` is the single source of truth for game rules. UI components dispatch actions and render state; they never compute rules. The AI module (`src/game/ai.ts`) is restricted by ESLint from importing engine, placement, or rules — it can only read a `PublicOpponentView` and its own memory, which makes hard-AI cheating impossible by construction.

### Implementation checkpoints

1. Engine + pure logic + tests (this commit)
2. Placement UI
3. Solo flow
4. AI difficulties (Easy/Medium/Hard)
5. Local two-player privacy flow
6. Visual polish and animations
7. Accessibility and responsive
8. Final QA

## Game rules

Standard 10×10 Battleship. Fleet: Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2. Ships may touch. One shot per turn — turn alternates after every shot, hit or miss. Game ends when an entire fleet is sunk.

## Notes

- No copyrighted/paid assets.
- No backend.
- No drag-and-drop, audio, or in-progress game persistence in v1.
