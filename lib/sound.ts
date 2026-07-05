/**
 * Counting feedback sounds — synthesized percussive clicks, not tones.
 *
 * Deliberately non-musical (product call): each sound is a short burst of
 * band-pass-filtered noise with a fast decay — acoustically a mechanical
 * "tick" like a physical tally counter, with no pitched/instrument quality.
 */

let audioCtx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  audioCtx ??= new Ctor();
  // Mobile browsers suspend the context when idle; taps are user gestures,
  // so resuming here is always permitted.
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function getNoise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
    const length = Math.ceil(ctx.sampleRate * 0.08);
    noiseBuf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function tick(
  ctx: AudioContext,
  at: number,
  opts: { freq: number; gain: number; dur: number },
) {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = opts.freq;
  band.Q.value = 1.2; // low Q — keeps it a dry click, not a ringing pitch
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(opts.gain, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  src.connect(band).connect(gain).connect(ctx.destination);
  src.start(at);
  src.stop(at + opts.dur);
}

/** One count — a single soft tick. */
export function playTap() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    tick(ctx, ctx.currentTime, { freq: 2100, gain: 0.2, dur: 0.05 });
  } catch {
    // audio not available — silent is fine
  }
}

/** A +10 jump — a quick double tick, reads as "several at once". */
export function playTen() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    tick(ctx, t, { freq: 1500, gain: 0.24, dur: 0.06 });
    tick(ctx, t + 0.07, { freq: 1900, gain: 0.2, dur: 0.06 });
  } catch {
    // audio not available — silent is fine
  }
}
