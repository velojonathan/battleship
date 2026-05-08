/**
 * AudioBus — small singleton-ish service that owns a single AudioContext and
 * a master gain node, exposes a single `play(cue)` entry point, and gracefully
 * degrades when Web Audio is unavailable.
 *
 * Lifecycle:
 *  - Construct via `AudioBus.create()` (cheap, does NOT touch Web Audio).
 *  - First `play()` call lazy-creates the AudioContext. This satisfies the
 *    browser's "no audio before user gesture" rule because shooting is by
 *    definition a user gesture.
 *  - `setMuted(true)` mutes the master gain immediately. Cues are still
 *    *not* scheduled while muted, so we don't waste any work.
 *
 * Privacy: this module knows nothing about ships, players, or coordinates.
 * Callers pass only a CueId.
 */

import { playCue, type CueContext, type CueId } from './cues';

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

/**
 * Resolve the global AudioContext constructor, or null if unavailable.
 * Some test envs and locked-down browsers don't expose Web Audio.
 */
function resolveAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export interface AudioBus {
  /** Whether Web Audio appears to be usable in this environment. */
  readonly available: boolean;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  /**
   * Play a cue. No-op if muted, unavailable, or if context creation fails.
   * Never throws.
   */
  play(id: CueId): void;
  /** Tear down the AudioContext (test helper). */
  dispose(): void;
}

export function createAudioBus(): AudioBus {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let muted = false;

  // We probe at construct time so consumers can branch on `available` for UI.
  const available = resolveAudioContextCtor() !== null;

  function ensureContext(): CueContext | null {
    if (!available) return null;
    if (ctx && masterGain) return { ctx, destination: masterGain };
    const Ctor = resolveAudioContextCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.6;
      masterGain.connect(ctx.destination);
      return { ctx, destination: masterGain };
    } catch {
      // A locked-down browser or sandboxed iframe may throw on construction.
      ctx = null;
      masterGain = null;
      return null;
    }
  }

  function play(id: CueId): void {
    if (muted) return;
    if (!available) return;
    const target = ensureContext();
    if (!target) return;
    try {
      // Some browsers leave the context "suspended" until a user gesture.
      // Resuming inside a user-event-driven call (which `play` is) is safe.
      if (target.ctx.state === 'suspended' && typeof target.ctx.resume === 'function') {
        // Fire-and-forget; we don't await so the call site stays sync.
        void target.ctx.resume();
      }
      playCue(id, target);
    } catch {
      // Defensive: never let audio crash the game loop.
    }
  }

  function setMuted(next: boolean): void {
    muted = next;
    if (masterGain) {
      try {
        masterGain.gain.value = muted ? 0 : 0.6;
      } catch {
        /* ignore */
      }
    }
  }

  function dispose(): void {
    try {
      if (ctx && typeof ctx.close === 'function') void ctx.close();
    } catch {
      /* ignore */
    }
    ctx = null;
    masterGain = null;
  }

  return {
    available,
    isMuted: () => muted,
    setMuted,
    play,
    dispose,
  };
}
