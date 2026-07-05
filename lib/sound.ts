/**
 * Counting feedback sounds — synthesized percussive clicks, not tones.
 *
 * Hard constraint (D37, owner is Hanafi): app audio must never resemble
 * music — no melodies, no pitched jingles, no instrument-like timbres.
 * Everything here is band-pass-filtered noise with a fast decay: unpitched
 * mechanical clicks/thuds, like a physical tally counter or tasbih bead.
 * Richer audio later should use recorded nature sounds, not tones.
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

function burst(
  ctx: AudioContext,
  at: number,
  opts: { freq: number; gain: number; dur: number; q: number },
) {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = opts.freq;
  band.Q.value = opts.q; // kept low — a dry click, never a ringing pitch
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(opts.gain, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + opts.dur);
  src.connect(band).connect(gain).connect(ctx.destination);
  src.start(at);
  src.stop(at + opts.dur);
}

/** ±8% jitter so repeated taps sound physical, not machine-identical. */
function jitter(n: number) {
  return n * (0.92 + Math.random() * 0.16);
}

/**
 * One "thock": a low noise thud for body + a tiny high snap for crispness —
 * the mechanical-keyboard / tasbih-bead feel, at a moment in time.
 */
function thock(ctx: AudioContext, at: number, strength = 1) {
  burst(ctx, at, {
    freq: jitter(240),
    gain: 0.55 * strength,
    dur: 0.05,
    q: 0.9,
  });
  burst(ctx, at, {
    freq: jitter(2800),
    gain: 0.14 * strength,
    dur: 0.025,
    q: 1.4,
  });
}

/** One count — a single thock. */
export function playTap() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    thock(ctx, ctx.currentTime);
  } catch {
    // audio not available — silent is fine
  }
}

/** A +10 jump — a single, heavier thock: deeper and louder than a tap. */
export function playTen() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    burst(ctx, t, { freq: jitter(160), gain: 0.85, dur: 0.07, q: 0.9 });
    burst(ctx, t, { freq: jitter(1900), gain: 0.16, dur: 0.03, q: 1.4 });
  } catch {
    // audio not available — silent is fine
  }
}

/**
 * Task completed — a celebratory flourish that stays non-musical (D37):
 * a rising air-whoosh (band-swept noise) + a scatter of bright ticks at
 * random timings, like a swish and falling beads. No pitches, no rhythm.
 */
export function playComplete() {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Rising whoosh: looped noise through a bandpass sweeping upward.
    const src = ctx.createBufferSource();
    src.buffer = getNoise(ctx);
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.5;
    band.frequency.setValueAtTime(300, t);
    band.frequency.exponentialRampToValueAtTime(3500, t + 0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(band).connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.5);

    // Sparkle: a few bright ticks scattered irregularly over the whoosh.
    for (let i = 0; i < 6; i++) {
      const at = t + 0.08 + Math.random() * 0.35;
      burst(ctx, at, {
        freq: 2500 + Math.random() * 2700,
        gain: 0.05 + Math.random() * 0.06,
        dur: 0.03,
        q: 2,
      });
    }
  } catch {
    // audio not available — silent is fine
  }
}
