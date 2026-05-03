// Anti-cheat AI module.
//
// This module is restricted by ESLint to import ONLY pure types/constants and
// the public-view types. It must NEVER import the engine, placement helpers,
// rules, or any module that exposes hidden ship coordinates.
//
// Stub implementation: for Checkpoint 1 we only need legal random moves.
// Medium and Hard strategies are added in Checkpoint 4.

import { coordKey, neighbors4 } from './coordinates';
import { pickOne } from './rng';
import type {
  AIInput,
  AIMemory,
  AIOutput,
  Coord,
  Orientation,
  PublicOpponentView,
} from './types';

export function computeAIMove(input: AIInput): AIOutput {
  const { view, memory, difficulty, rng } = input;
  const updatedMemory = updateMemoryFromView(memory, view);
  switch (difficulty) {
    case 'easy':
      return chooseEasy(view, updatedMemory, rng);
    case 'medium':
      return chooseMedium(view, updatedMemory, rng);
    case 'hard':
      return chooseHard(view, updatedMemory, rng);
    default: {
      const _exhaustive: never = difficulty;
      void _exhaustive;
      return chooseEasy(view, updatedMemory, rng);
    }
  }
}

// Synchronize AIMemory with the latest public view.
// - Append any shots fired since last call to shotsFired (no-op if already there).
// - Drop unresolvedHits that belong to a now-sunk ship (we can attribute hits to
//   sunk ships by checking sunk-ship cells).
// - Reset orientation hypothesis if no unresolved hits remain.
function updateMemoryFromView(prev: AIMemory, view: PublicOpponentView): AIMemory {
  const shotsFired = new Set(prev.shotsFired);
  for (const s of view.shots) shotsFired.add(coordKey(s.at));

  // Cells that belong to publicly sunk ships.
  const sunkCellKeys = new Set<string>();
  for (const ship of view.sunkShips) {
    for (const c of ship.cells) sunkCellKeys.add(coordKey(c));
  }

  const unresolvedHits: Coord[] = [];
  // Hits we've made on cells that aren't part of a sunk ship are still "unresolved".
  for (const s of view.shots) {
    if (s.outcome === 'hit' && !sunkCellKeys.has(coordKey(s.at))) {
      unresolvedHits.push(s.at);
    }
  }

  const orientationHypothesis: Orientation | null =
    unresolvedHits.length === 0
      ? null
      : detectOrientation(unresolvedHits) ?? prev.orientationHypothesis;

  return {
    shotsFired: Array.from(shotsFired),
    unresolvedHits,
    orientationHypothesis: unresolvedHits.length === 0 ? null : orientationHypothesis,
  };
}

function detectOrientation(hits: Coord[]): Orientation | null {
  if (hits.length < 2) return null;
  const allSameRow = hits.every((h) => h.row === hits[0]!.row);
  const allSameCol = hits.every((h) => h.col === hits[0]!.col);
  if (allSameRow) return 'H';
  if (allSameCol) return 'V';
  return null;
}

function chooseEasy(
  view: PublicOpponentView,
  memory: AIMemory,
  rng: () => number,
): AIOutput {
  const legal = listLegalCells(view, memory);
  if (legal.length === 0) {
    throw new Error('AI has no legal moves remaining');
  }
  const target = pickOne(rng, legal);
  return {
    target,
    memory: { ...memory, shotsFired: [...memory.shotsFired, coordKey(target)] },
  };
}

function chooseMedium(
  view: PublicOpponentView,
  memory: AIMemory,
  rng: () => number,
): AIOutput {
  // Hunt/target. If we have unresolved hits, target neighbors / line extensions.
  const legalKeys = new Set(listLegalCells(view, memory).map(coordKey));

  if (memory.unresolvedHits.length > 0) {
    const candidates = targetCandidates(memory, view, legalKeys);
    if (candidates.length > 0) {
      const target = pickOne(rng, candidates);
      return commit(memory, target);
    }
  }
  // Hunt: parity-bias on a checker pattern (every other cell), filtered to legal.
  const parity: Coord[] = [];
  for (const c of legalKeys) {
    const [r, col] = c.split(',').map(Number) as [number, number];
    if ((r + col) % 2 === 0) parity.push({ row: r, col });
  }
  const pool = parity.length > 0 ? parity : Array.from(legalKeys).map(toCoord);
  if (pool.length === 0) throw new Error('AI has no legal moves remaining');
  return commit(memory, pickOne(rng, pool));
}

function chooseHard(
  view: PublicOpponentView,
  memory: AIMemory,
  rng: () => number,
): AIOutput {
  const legalCells = listLegalCells(view, memory);
  if (legalCells.length === 0) {
    throw new Error('AI has no legal moves remaining');
  }
  // Build "blocked" set: misses + sunk-ship cells. Hits NOT in sunk ships are
  // unresolved hits; placements that cover all unresolved hits are weighted higher.
  const missKeys = new Set<string>();
  const sunkKeys = new Set<string>();
  for (const s of view.shots) {
    if (s.outcome === 'miss') missKeys.add(coordKey(s.at));
  }
  for (const ship of view.sunkShips) {
    for (const c of ship.cells) sunkKeys.add(coordKey(c));
  }
  const unresolvedHitKeys = new Set(memory.unresolvedHits.map(coordKey));

  // Probability density: for each remaining ship length, count placements covering each cell.
  const score = new Map<string, number>();
  for (const length of view.remainingShipLengths) {
    accumulateProbability({
      length,
      size: view.size,
      missKeys,
      sunkKeys,
      unresolvedHitKeys,
      score,
      // Weight placements that cover unresolved hits higher (finishing-known-ship).
    });
  }

  // Filter to legal cells only.
  let bestScore = -1;
  let best: Coord[] = [];
  for (const cell of legalCells) {
    const key = coordKey(cell);
    const s = score.get(key) ?? 0;
    if (s > bestScore) {
      bestScore = s;
      best = [cell];
    } else if (s === bestScore) {
      best.push(cell);
    }
  }
  if (best.length === 0) {
    return commit(memory, pickOne(rng, legalCells));
  }
  const target = pickOne(rng, best);
  return commit(memory, target);
}

interface PDCtx {
  length: number;
  size: number;
  missKeys: Set<string>;
  sunkKeys: Set<string>;
  unresolvedHitKeys: Set<string>;
  score: Map<string, number>;
}

function accumulateProbability(ctx: PDCtx): void {
  const orientations: Orientation[] = ['H', 'V'];
  const haveUnresolved = ctx.unresolvedHitKeys.size > 0;
  // Bonus weight for placements covering ANY unresolved hit.
  const unresolvedBonus = 50;
  for (const orientation of orientations) {
    const maxRow = orientation === 'V' ? ctx.size - ctx.length : ctx.size - 1;
    const maxCol = orientation === 'H' ? ctx.size - ctx.length : ctx.size - 1;
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= maxCol; c++) {
        const cells: Coord[] = [];
        for (let i = 0; i < ctx.length; i++) {
          cells.push(
            orientation === 'H'
              ? { row: r, col: c + i }
              : { row: r + i, col: c },
          );
        }
        // Reject placements that overlap a miss or a sunk-ship cell.
        let illegal = false;
        let coversUnresolved = 0;
        for (const cell of cells) {
          const k = coordKey(cell);
          if (ctx.missKeys.has(k) || ctx.sunkKeys.has(k)) {
            illegal = true;
            break;
          }
          if (ctx.unresolvedHitKeys.has(k)) coversUnresolved++;
        }
        if (illegal) continue;
        // If unresolved hits exist, placements that cover NONE are still considered
        // (the AI may still hunt elsewhere) but down-weighted.
        const weight = 1 + coversUnresolved * unresolvedBonus + (haveUnresolved && coversUnresolved === 0 ? -0.5 : 0);
        for (const cell of cells) {
          const k = coordKey(cell);
          // We only score cells that aren't already shot. Shot cells are excluded from
          // candidate pool by listLegalCells anyway, but skip here too.
          if (ctx.missKeys.has(k) || ctx.sunkKeys.has(k) || ctx.unresolvedHitKeys.has(k)) continue;
          ctx.score.set(k, (ctx.score.get(k) ?? 0) + weight);
        }
      }
    }
  }
}

function targetCandidates(
  memory: AIMemory,
  view: PublicOpponentView,
  legalKeys: Set<string>,
): Coord[] {
  // If we have a strong line, extend along it; otherwise neighbors of any unresolved hit.
  const unresolved = memory.unresolvedHits;
  if (unresolved.length === 0) return [];
  if (memory.orientationHypothesis && unresolved.length >= 2) {
    const sorted = unresolved
      .slice()
      .sort((a, b) =>
        memory.orientationHypothesis === 'H' ? a.col - b.col : a.row - b.row,
      );
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const candidates: Coord[] = [];
    if (memory.orientationHypothesis === 'H') {
      candidates.push({ row: first.row, col: first.col - 1 });
      candidates.push({ row: last.row, col: last.col + 1 });
    } else {
      candidates.push({ row: first.row - 1, col: first.col });
      candidates.push({ row: last.row + 1, col: last.col });
    }
    const filtered = candidates.filter((c) => legalKeys.has(coordKey(c)));
    if (filtered.length > 0) return filtered;
  }
  // Otherwise neighbors of any unresolved hit.
  const out: Coord[] = [];
  const seen = new Set<string>();
  for (const hit of unresolved) {
    for (const n of neighbors4(hit, view.size)) {
      const k = coordKey(n);
      if (legalKeys.has(k) && !seen.has(k)) {
        seen.add(k);
        out.push(n);
      }
    }
  }
  return out;
}

function listLegalCells(view: PublicOpponentView, memory: AIMemory): Coord[] {
  const fired = new Set(memory.shotsFired);
  // Also exclude cells with publicly observed shot outcomes (defensive).
  for (const s of view.shots) fired.add(coordKey(s.at));
  const out: Coord[] = [];
  for (let r = 0; r < view.size; r++) {
    for (let c = 0; c < view.size; c++) {
      const k = `${r},${c}`;
      if (!fired.has(k)) out.push({ row: r, col: c });
    }
  }
  return out;
}

function commit(memory: AIMemory, target: Coord): AIOutput {
  return {
    target,
    memory: {
      ...memory,
      shotsFired: [...memory.shotsFired, coordKey(target)],
    },
  };
}

function toCoord(key: string): Coord {
  const [r, c] = key.split(',').map(Number) as [number, number];
  return { row: r, col: c };
}

// Re-exports for tests.
export { listLegalCells, updateMemoryFromView };

// Sanity-check helpers (used by tests but not the engine).
export function legalCellCount(view: PublicOpponentView, memory: AIMemory): number {
  return listLegalCells(view, memory).length;
}


