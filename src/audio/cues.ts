/**
 * Web Audio cue builders for FP1.
 *
 * Each cue is a *fully synthesized* short envelope (no asset files, no network
 * fetches, no copyrighted content). Every cue is class-agnostic — sinking a
 * carrier and sinking a destroyer sound identical, by design, so audio can't
 * leak which ship class was sunk in local 2P.
 *
 * Each builder accepts the AudioContext + a destination GainNode and schedules
 * a one-shot envelope that auto-disconnects on completion.
 *
 * Cue catalog:
 *   - miss:       short, low whoosh + soft tick     (~140ms)
 *   - hit:        punchy mid boom                   (~180ms)
 *   - sunk:       deeper boom + descending sweep    (~480ms)
 *   - gameOverWin:  rising minor-major arpeggio    (~620ms)
 *   - gameOverLoss: descending sad-horn pair       (~700ms)
 *
 * No cue ever leaks ship state: arguments are limited to the AudioContext +
 * destination; nothing about the firing player, the hit cell, or the ship is
 * passed in.
 */

export type CueId = 'miss' | 'hit' | 'sunk' | 'gameOverWin' | 'gameOverLoss';

/** A scheduling target: either a built AudioContext or a typed Mock used in tests. */
export interface CueContext {
  ctx: AudioContext;
  destination: AudioNode;
}

/**
 * Apply an attack/decay envelope to a gain node. Returns the time at which the
 * envelope ends so callers can chain disposal.
 */
function adsr(
  gain: GainNode,
  startAt: number,
  attack: number,
  decay: number,
  peak: number,
): number {
  const g = gain.gain;
  g.cancelScheduledValues(startAt);
  g.setValueAtTime(0, startAt);
  g.linearRampToValueAtTime(peak, startAt + attack);
  g.exponentialRampToValueAtTime(0.0001, startAt + attack + decay);
  return startAt + attack + decay;
}

/**
 * White-noise buffer used by miss/hit/sunk for grit. Generated once per ctx.
 * Falls back gracefully if `createBuffer` is not available.
 */
const noiseBufferCache = new WeakMap<AudioContext, AudioBuffer>();
function noiseBuffer(ctx: AudioContext): AudioBuffer | null {
  const cached = noiseBufferCache.get(ctx);
  if (cached) return cached;
  if (typeof ctx.createBuffer !== 'function') return null;
  const sampleRate = ctx.sampleRate || 44_100;
  const length = Math.floor(sampleRate * 0.5);
  const buf = ctx.createBuffer(1, length, sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBufferCache.set(ctx, buf);
  return buf;
}

function playMiss({ ctx, destination }: CueContext): void {
  const t0 = ctx.currentTime;
  // Low descending sine + soft splash from filtered noise.
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, t0);
  osc.frequency.exponentialRampToValueAtTime(80, t0 + 0.12);
  const oscEnd = adsr(oscGain, t0, 0.005, 0.13, 0.18);
  osc.connect(oscGain).connect(destination);
  osc.start(t0);
  osc.stop(oscEnd + 0.02);

  const buf = noiseBuffer(ctx);
  if (buf) {
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const noiseGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    const noiseEnd = adsr(noiseGain, t0, 0.002, 0.10, 0.06);
    noise.connect(filter).connect(noiseGain).connect(destination);
    noise.start(t0);
    noise.stop(noiseEnd + 0.02);
  }
}

function playHit({ ctx, destination }: CueContext): void {
  const t0 = ctx.currentTime;
  // Punchy boom: sawtooth thud + short noise burst.
  const osc = ctx.createOscillator();
  const oscGain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(140, t0);
  osc.frequency.exponentialRampToValueAtTime(50, t0 + 0.16);
  const oscEnd = adsr(oscGain, t0, 0.003, 0.18, 0.32);
  osc.connect(oscGain).connect(destination);
  osc.start(t0);
  osc.stop(oscEnd + 0.02);

  const buf = noiseBuffer(ctx);
  if (buf) {
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const noiseGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    const noiseEnd = adsr(noiseGain, t0, 0.002, 0.06, 0.12);
    noise.connect(filter).connect(noiseGain).connect(destination);
    noise.start(t0);
    noise.stop(noiseEnd + 0.02);
  }
}

function playSunk({ ctx, destination }: CueContext): void {
  const t0 = ctx.currentTime;
  // Deeper boom layered with a descending sweep.
  const boom = ctx.createOscillator();
  const boomGain = ctx.createGain();
  boom.type = 'sine';
  boom.frequency.setValueAtTime(110, t0);
  boom.frequency.exponentialRampToValueAtTime(36, t0 + 0.45);
  const boomEnd = adsr(boomGain, t0, 0.005, 0.46, 0.45);
  boom.connect(boomGain).connect(destination);
  boom.start(t0);
  boom.stop(boomEnd + 0.04);

  const sweep = ctx.createOscillator();
  const sweepGain = ctx.createGain();
  sweep.type = 'triangle';
  sweep.frequency.setValueAtTime(420, t0);
  sweep.frequency.exponentialRampToValueAtTime(110, t0 + 0.42);
  const sweepEnd = adsr(sweepGain, t0, 0.003, 0.42, 0.18);
  sweep.connect(sweepGain).connect(destination);
  sweep.start(t0);
  sweep.stop(sweepEnd + 0.02);

  const buf = noiseBuffer(ctx);
  if (buf) {
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const noiseGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t0);
    filter.frequency.exponentialRampToValueAtTime(220, t0 + 0.4);
    const noiseEnd = adsr(noiseGain, t0, 0.002, 0.42, 0.18);
    noise.connect(filter).connect(noiseGain).connect(destination);
    noise.start(t0);
    noise.stop(noiseEnd + 0.04);
  }
}

/**
 * Three-note rising arpeggio (root, fifth, octave) — naval "all clear" feel.
 */
function playGameOverWin({ ctx, destination }: CueContext): void {
  const t0 = ctx.currentTime;
  const notes: ReadonlyArray<{ f: number; offset: number; dur: number }> = [
    { f: 440, offset: 0, dur: 0.22 },
    { f: 660, offset: 0.16, dur: 0.22 },
    { f: 880, offset: 0.32, dur: 0.32 },
  ];
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(note.f, t0 + note.offset);
    const end = adsr(gain, t0 + note.offset, 0.01, note.dur, 0.22);
    osc.connect(gain).connect(destination);
    osc.start(t0 + note.offset);
    osc.stop(end + 0.02);
  }
}

/**
 * Two-note descending minor third — naval "fleet down" lament.
 */
function playGameOverLoss({ ctx, destination }: CueContext): void {
  const t0 = ctx.currentTime;
  const notes: ReadonlyArray<{ f: number; offset: number; dur: number }> = [
    { f: 330, offset: 0, dur: 0.32 },
    { f: 220, offset: 0.28, dur: 0.42 },
  ];
  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(note.f, t0 + note.offset);
    osc.frequency.exponentialRampToValueAtTime(
      note.f * 0.92,
      t0 + note.offset + note.dur,
    );
    const end = adsr(gain, t0 + note.offset, 0.012, note.dur, 0.18);
    osc.connect(gain).connect(destination);
    osc.start(t0 + note.offset);
    osc.stop(end + 0.04);
  }
}

const CUES: Readonly<Record<CueId, (c: CueContext) => void>> = {
  miss: playMiss,
  hit: playHit,
  sunk: playSunk,
  gameOverWin: playGameOverWin,
  gameOverLoss: playGameOverLoss,
};

export function playCue(id: CueId, ctx: CueContext): void {
  const fn = CUES[id];
  if (!fn) return;
  fn(ctx);
}
