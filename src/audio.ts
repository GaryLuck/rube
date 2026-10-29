/** Tiny WebAudio synth for bells, knocks and the success fanfare. */
export class Sound {
  muted = false;
  private ctx: AudioContext | null = null;
  private lastImpact = 0;

  /** Must be called from a user gesture before sounds can play. */
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine') {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  bell(pitch = 1) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 880 * pitch;
    // Inharmonic partials give a metallic ring.
    this.tone(f, t, 1.6, 0.18);
    this.tone(f * 2.76, t, 0.9, 0.06);
    this.tone(f * 5.4, t, 0.4, 0.03);
  }

  impact(speed: number) {
    if (this.muted || !this.ctx) return;
    const now = performance.now();
    if (now - this.lastImpact < 45) return;
    this.lastImpact = now;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600 + Math.min(speed, 15) * 120;
    const g = ctx.createGain();
    g.gain.value = Math.min(0.35, 0.03 * speed);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
  }

  success() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, t + i * 0.11, 0.5, 0.15, 'triangle'));
  }
}
