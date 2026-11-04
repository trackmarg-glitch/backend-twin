/**
 * Procedural score for the intro sequence.
 *
 * Everything here is synthesised with Web Audio oscillators and a noise
 * buffer - there are no audio files. That keeps the repo free of media
 * assets and of any music licensing question, and, more usefully, it means
 * every cue is scheduled against the AudioContext clock rather than a
 * <video>/<audio> element, so the score cannot drift out of sync with the
 * animation the way a streamed asset can.
 *
 * Browsers refuse to start audio without a user gesture, which is why the
 * sequence opens on a "press to initialize" beat: that click is what
 * constructs the context. `start()` must be called from inside the gesture
 * handler.
 */

/**
 * Beat map, in seconds from the moment the user presses start.
 *
 * Deliberately unhurried: the assembly gets ~5s so the geometry is readable
 * rather than a flicker, and the two beats that matter to the audience -
 * the host credit and the wordmark - get ~4s and ~5s respectively. Total
 * runtime is about 17.7s, which is a long time to hold a room, so the
 * sequence is skippable at any point and plays only once per session.
 */
export const CUE = {
  droneIn: 0.0,
  riser: 0.3,
  scan: 3.4,
  snap: 5.6,
  credit: 8.8,
  wordmark: 12.8,
  tail: 16.8,
} as const;

export class IntroAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private stopped = false;
  /** AudioContext time that corresponds to cue t=0. */
  private t0 = 0;

  get available() {
    return this.ctx !== null;
  }

  /** Must be called synchronously from a user gesture. */
  start(volume = 0.5) {
    if (this.ctx) return;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // No Web Audio: the sequence still runs, silently.

    try {
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
      return;
    }
    // Safari can hand back a suspended context even inside a gesture.
    void this.ctx.resume().catch(() => undefined);

    this.master = this.ctx.createGain();
    this.master.gain.value = volume;
    this.master.connect(this.ctx.destination);

    this.noise = this.makeNoise();
    this.t0 = this.ctx.currentTime + 0.02;
    this.schedule();
  }

  /** Fade out and release the context. Safe to call more than once. */
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.35);
    window.setTimeout(() => void ctx.close().catch(() => undefined), 500);
  }

  // ---------------------------------------------------------------- helpers

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private at(cue: number) {
    return this.t0 + cue;
  }

  /** One oscillator with an ADSR-ish envelope, optionally swept in pitch. */
  private tone(opts: {
    type: OscillatorType;
    freq: number;
    to?: number;
    at: number;
    dur: number;
    gain: number;
    attack?: number;
    detune?: number;
    filter?: { type: BiquadFilterType; freq: number; to?: number; q?: number };
  }) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type;
    if (opts.detune) osc.detune.value = opts.detune;

    const start = this.at(opts.at);
    const end = start + opts.dur;
    const attack = opts.attack ?? Math.min(0.08, opts.dur * 0.3);

    osc.frequency.setValueAtTime(opts.freq, start);
    if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), end);

    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(opts.gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    let node: AudioNode = osc;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter.type;
      f.Q.value = opts.filter.q ?? 1;
      f.frequency.setValueAtTime(opts.filter.freq, start);
      if (opts.filter.to !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(1, opts.filter.to), end);
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(this.master!);
    osc.start(start);
    osc.stop(end + 0.02);
  }

  /** Filtered noise burst - used for the scan sweep and the impact. */
  private hit(opts: { at: number; dur: number; gain: number; freq: number; to?: number; q?: number; type?: BiquadFilterType }) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.Q.value = opts.q ?? 1.2;
    const g = ctx.createGain();

    const start = this.at(opts.at);
    const end = start + opts.dur;
    f.frequency.setValueAtTime(opts.freq, start);
    if (opts.to !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), end);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(opts.gain, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, end);

    src.connect(f).connect(g).connect(this.master!);
    src.start(start);
    src.stop(end + 0.02);
  }

  // ------------------------------------------------------------- the score

  private schedule() {
    const A2 = 55;        // drone root
    const E3 = 164.81;
    const A3 = 220;
    const Cs4 = 277.18;   // major third - the resolve is deliberately bright
    const E4 = 329.63;

    // Bed: two detuned saws, slow filter opening. Runs the whole sequence.
    for (const detune of [-6, 7]) {
      this.tone({
        type: 'sawtooth', freq: A2, at: CUE.droneIn, dur: CUE.tail + 0.8,
        gain: 0.085, attack: 0.9, detune,
        filter: { type: 'lowpass', freq: 120, to: 1500, q: 6 },
      });
    }

    // Riser across the formation: pitch and filter climbing to the snap.
    this.tone({
      type: 'sawtooth', freq: 110, to: 880, at: CUE.riser, dur: CUE.snap - CUE.riser,
      gain: 0.06, attack: 1.2,
      filter: { type: 'bandpass', freq: 300, to: 3600, q: 4 },
    });

    // A second, slower riser an octave down - over a five-second build one
    // sweep alone thins out badly.
    this.tone({
      type: 'triangle', freq: 55, to: 330, at: CUE.riser, dur: CUE.snap - CUE.riser,
      gain: 0.05, attack: 1.8,
      filter: { type: 'lowpass', freq: 200, to: 2200, q: 3 },
    });

    // Ticks while the geometry assembles, accelerating into the snap.
    const ticks = 12;
    for (let i = 0; i < ticks; i++) {
      const p = i / (ticks - 1);
      // Quadratic spacing: sparse at first, tightening as the part completes.
      const at = CUE.riser + 0.4 + (CUE.snap - CUE.riser - 0.7) * (p * p);
      this.tone({
        type: 'square', freq: 1150 + i * 135, at, dur: 0.05,
        gain: 0.019 + p * 0.012, attack: 0.004,
      });
    }

    // Scanline sweep.
    this.hit({ at: CUE.scan, dur: 0.85, gain: 0.07, freq: 500, to: 5200, q: 2.2 });

    // The snap: the two halves become one part.
    this.hit({ at: CUE.snap, dur: 0.5, gain: 0.16, freq: 2600, to: 160, q: 0.8 });
    this.tone({ type: 'sine', freq: 180, to: 42, at: CUE.snap, dur: 0.75, gain: 0.3, attack: 0.005 });
    this.tone({ type: 'triangle', freq: A3, at: CUE.snap + 0.02, dur: 0.5, gain: 0.07, attack: 0.008 });

    // Credit beat: a soft two-note lift, no percussion.
    this.tone({ type: 'sine', freq: E3, at: CUE.credit, dur: 0.7, gain: 0.05, attack: 0.12 });
    this.tone({ type: 'sine', freq: A3, at: CUE.credit + 0.22, dur: 0.7, gain: 0.04, attack: 0.12 });

    // Wordmark: the resolving chord.
    for (const [f, g] of [[A3, 0.075], [Cs4, 0.055], [E4, 0.05], [A3 * 2, 0.03]] as const) {
      this.tone({ type: 'sine', freq: f, at: CUE.wordmark, dur: 1.9, gain: g, attack: 0.2 });
    }
    this.hit({ at: CUE.wordmark, dur: 1.4, gain: 0.03, freq: 1800, to: 400, q: 0.7, type: 'lowpass' });
  }
}
