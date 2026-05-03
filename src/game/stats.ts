import type { Difficulty, Mode, PlayerId } from './types';

export interface SoloStats {
  games: number;
  wins: number;
  losses: number;
  byDifficulty: Record<Difficulty, { games: number; wins: number; losses: number }>;
}

export interface TwoPlayerStats {
  games: number;
}

export interface AggregateStats {
  solo: SoloStats;
  local2p: TwoPlayerStats;
}

export function emptyStats(): AggregateStats {
  return {
    solo: {
      games: 0,
      wins: 0,
      losses: 0,
      byDifficulty: {
        easy: { games: 0, wins: 0, losses: 0 },
        medium: { games: 0, wins: 0, losses: 0 },
        hard: { games: 0, wins: 0, losses: 0 },
      },
    },
    local2p: { games: 0 },
  };
}

export function recordGame(
  stats: AggregateStats,
  args: { mode: Mode; difficulty: Difficulty; humanPlayer: PlayerId; winner: PlayerId },
): AggregateStats {
  if (args.mode === 'local-2p') {
    return { ...stats, local2p: { games: stats.local2p.games + 1 } };
  }
  // solo
  const won = args.winner === args.humanPlayer;
  const dif = args.difficulty;
  const diffStats = stats.solo.byDifficulty[dif];
  return {
    ...stats,
    solo: {
      games: stats.solo.games + 1,
      wins: stats.solo.wins + (won ? 1 : 0),
      losses: stats.solo.losses + (won ? 0 : 1),
      byDifficulty: {
        ...stats.solo.byDifficulty,
        [dif]: {
          games: diffStats.games + 1,
          wins: diffStats.wins + (won ? 1 : 0),
          losses: diffStats.losses + (won ? 0 : 1),
        },
      },
    },
  };
}
