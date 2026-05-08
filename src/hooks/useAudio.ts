import { useCallback, useEffect, useRef, useState } from 'react';
import { createAudioBus, type AudioBus } from '../audio';
import type { CueId } from '../audio';

export interface UseAudioOptions {
  /**
   * If true, an externally-injected AudioBus is used instead of the
   * lazy-created one. Useful for tests or for sharing a bus across mounts.
   */
  bus?: AudioBus;
}

export interface UseAudioApi {
  /** Whether Web Audio appears available in this environment. */
  available: boolean;
  /** Current mute state (React-managed). */
  muted: boolean;
  /** Toggle mute. */
  toggleMuted: () => void;
  /** Set mute explicitly. */
  setMuted: (next: boolean) => void;
  /** Play a cue (no-op if muted/unavailable). */
  play: (id: CueId) => void;
}

/**
 * Hook wrapping the AudioBus singleton-per-mount. Owns mute state in React
 * (component state only — never localStorage; per FP1 scope).
 */
export function useAudio({ bus: injected }: UseAudioOptions = {}): UseAudioApi {
  const busRef = useRef<AudioBus | null>(injected ?? null);
  // React must re-render when the user toggles mute, but the bus itself is
  // a pure imperative singleton — so we keep mute mirrored in React state.
  const [muted, setMutedState] = useState<boolean>(injected?.isMuted() ?? false);

  // Lazy-create bus on demand (first play call). For external `injected`
  // buses we never overwrite.
  const ensureBus = useCallback((): AudioBus => {
    if (busRef.current) return busRef.current;
    const created = createAudioBus();
    busRef.current = created;
    // Sync the muted state into the new bus so toggles before first play
    // are honored.
    if (muted) created.setMuted(true);
    return created;
  }, [muted]);

  useEffect(() => {
    return () => {
      // Only dispose the bus if WE created it (not injected ones).
      if (!injected && busRef.current) {
        busRef.current.dispose();
        busRef.current = null;
      }
    };
  }, [injected]);

  const setMuted = useCallback(
    (next: boolean) => {
      setMutedState(next);
      // If the bus has been created already, tell it.
      if (busRef.current) busRef.current.setMuted(next);
    },
    [],
  );

  const toggleMuted = useCallback(() => {
    setMuted(!muted);
  }, [muted, setMuted]);

  const play = useCallback(
    (id: CueId) => {
      if (muted) return;
      const bus = ensureBus();
      bus.play(id);
    },
    [ensureBus, muted],
  );

  // `available` is sampled lazily; we cache it once we know.
  const available = busRef.current?.available ?? checkAvailable();

  return { available, muted, toggleMuted, setMuted, play };
}

/**
 * Check Web Audio availability without creating a context.
 * (Pure DOM check, safe to call before any user gesture.)
 */
function checkAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as typeof window & {
    AudioContext?: unknown;
    webkitAudioContext?: unknown;
  };
  return Boolean(w.AudioContext ?? w.webkitAudioContext);
}
