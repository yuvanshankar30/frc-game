/** Tiny synthesized sound effects (no asset files). */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.6;
  private last = new Map<string, number>();

  private ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.master!.gain.value = this.volume;
    return this.ctx;
  }

  /** Rate-limit a sound key. */
  private gate(key: string, minGap: number) {
    const now = performance.now();
    if ((this.last.get(key) ?? 0) + minGap * 1000 > now) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  private noise(dur: number, gain: number, freq = 800) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  shoot() {
    if (this.gate('shoot', 0.045)) this.noise(0.07, 0.35, 300);
  }
  intake() {
    if (this.gate('intake', 0.05)) this.tone(220, 0.05, 'triangle', 0.08, -80);
  }
  score() {
    if (this.gate('score', 0.06)) this.tone(880, 0.12, 'sine', 0.12, 220);
  }
  wasted() {
    if (this.gate('wasted', 0.08)) this.tone(160, 0.12, 'square', 0.04);
  }
  buzzer() {
    this.tone(110, 0.9, 'sawtooth', 0.18);
    this.tone(113, 0.9, 'square', 0.1);
  }
  bell() {
    this.tone(1320, 0.6, 'sine', 0.2);
    this.tone(1980, 0.4, 'sine', 0.08);
  }
  horn() {
    this.tone(330, 0.5, 'sawtooth', 0.12);
    this.tone(415, 0.5, 'sawtooth', 0.08);
  }
  climb() {
    if (this.gate('climb', 0.5)) this.tone(300, 0.4, 'triangle', 0.1, 300);
  }
}

export const sfx = new Sfx();
