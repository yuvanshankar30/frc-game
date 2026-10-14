/**
 * Arena audio: the official FRC field cues plus FUEL dropping around the field. No robot motor sounds.
 *
 * Field cues are the FRC field sounds as shipped with Team 254's Cheesy Arena field software (static/audio), played at
 * the same points in a REBUILT match (game/match_sounds.go): the "charge" start sound at 0:00, the end buzzer when
 * AUTO ends, the resume bell when TELEOP starts, the shift-change tone at each HUB shift, the warning when END GAME
 * starts and the end buzzer at 0:00. Files live in public/sfx/ (see SAMPLE_FILES and public/sfx/README.md); a missing
 * file falls back to a short synthesized tone.
 *
 * Ball drops are soft foam thuds triggered by real FUEL bounces, quieter, duller and later the farther they are from
 * the camera, with a little arena reverb.
 */
/** Field cue → file name (without extension) looked up in public/sfx/. mp3, ogg or wav. */
export const SAMPLE_FILES = {
  start: 'match-start',
  autoEnd: 'match-end',
  teleop: 'teleop-start',
  shift: 'shift',
  endgame: 'endgame',
  end: 'match-end',
} as const;
type Cue = keyof typeof SAMPLE_FILES;

/** Speed of sound (m/s): far drops arrive a little late. */
const SOUND_SPEED = 343;

class AudioEngine {
  private samples: Partial<Record<string, AudioBuffer>> = {};
  private samplesLoaded = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fieldBus: GainNode | null = null;
  private dropBus: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  volume = 0.6;
  private noiseBuf: AudioBuffer | null = null;
  private dropBudget = 0;
  private dropT = 0;

  private ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.ratio.value = 4;
        this.master = this.ctx.createGain();
        this.master.connect(comp).connect(this.ctx.destination);
        this.fieldBus = this.ctx.createGain();
        this.fieldBus.connect(this.master);
        this.dropBus = this.ctx.createGain();
        this.dropBus.gain.value = 0.8;
        this.dropBus.connect(this.master);
        // Arena reverb: a big, soft room (decaying noise impulse response).
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = this.impulse(this.ctx, 1.6);
        const wet = this.ctx.createGain();
        wet.gain.value = 0.35;
        this.reverb.connect(wet).connect(this.master);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.master!.gain.value = this.volume;
    if (!this.samplesLoaded) {
      this.samplesLoaded = true;
      void this.loadSamples(this.ctx);
    }
    return this.ctx;
  }

  private impulse(ctx: AudioContext, secs: number) {
    const len = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  /** Load the field recordings in public/sfx/ (each file once, even if several cues share it). */
  private async loadSamples(ctx: AudioContext) {
    const base = `${import.meta.env.BASE_URL ?? '/'}sfx/`;
    await Promise.all(
      [...new Set(Object.values(SAMPLE_FILES))].map(async (name) => {
        for (const ext of ['mp3', 'ogg', 'wav']) {
          try {
            const res = await fetch(`${base}${name}.${ext}`);
            // The dev server answers unknown paths with index.html, so require an audio content type.
            if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('audio')) continue;
            this.samples[name] = await ctx.decodeAudioData(await res.arrayBuffer());
            return;
          } catch {
            // try the next extension
          }
        }
      }),
    );
  }

  /** Play a field cue: the recording, or a short synthesized stand-in if it's missing / still loading. */
  private cue(cue: Cue, fallback: number) {
    const ctx = this.ensure();
    if (!ctx) return;
    const buf = this.samples[SAMPLE_FILES[cue]];
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.fieldBus!);
      src.start();
      return;
    }
    const t = ctx.currentTime + 0.02;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = fallback;
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(g).connect(this.fieldBus!);
    o.start(t);
    o.stop(t + 0.85);
  }

  private noise() {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    return s;
  }

  // ------------------------------------------------------------- field cues

  /** AUTO starts (0:00). */
  start() {
    this.cue('start', 520);
  }
  /** AUTO ends, robots disabled. */
  autoEnd() {
    this.cue('autoEnd', 140);
  }
  /** TELEOP starts. */
  teleop() {
    this.cue('teleop', 880);
  }
  /** HUB shift change. */
  shift() {
    this.cue('shift', 660);
  }
  /** END GAME starts (30 s left). */
  endgame() {
    this.cue('endgame', 440);
  }
  /** Match over. */
  end() {
    this.cue('end', 140);
  }

  // ------------------------------------------------------------- FUEL drops

  /**
   * FUEL bounces since last frame (world positions, impact speed m/s), heard from `ear`. The loudest few per frame
   * are played; a busy field becomes a soft patter in the distance.
   */
  /**
   * Set up the audio graph ahead of play (the reverb impulse and convolver take a noticeable moment). Called while a
   * match loads so the first sound doesn't stall a frame.
   */
  warm() {
    if (this.ensure()) this.noise();
  }

  ballDrops(drops: readonly { x: number; y: number; z: number; speed: number }[], ear: { x: number; y: number; z: number }) {
    // Never build the audio graph mid-play for a bounce: wait for warm() / a field cue.
    if (!drops.length || !this.ctx) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    // At most ~30 drops a second, refilled over time.
    const now = ctx.currentTime;
    this.dropBudget = Math.min(6, this.dropBudget + (now - this.dropT) * 30);
    this.dropT = now;
    const heard = drops
      .map((d) => {
        const dist = Math.hypot(d.x - ear.x, d.y - ear.y, d.z - ear.z);
        return { dist, loud: Math.min(1, d.speed / 6) / (1 + dist / 2.5) };
      })
      .sort((a, b) => b.loud - a.loud);
    for (const h of heard) {
      if (this.dropBudget < 1 || h.loud < 0.01) break;
      this.dropBudget -= 1;
      this.drop(now + h.dist / SOUND_SPEED + Math.random() * 0.01, h.loud, h.dist);
    }
  }

  /** One foam ball landing: a dull low thump plus a short padded slap, darker with distance. */
  private drop(t: number, loud: number, dist: number) {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = 0.55 * loud;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200 / (1 + dist / 4);
    out.connect(lp);
    lp.connect(this.dropBus!);
    // Farther drops are mostly heard through the room.
    const send = ctx.createGain();
    send.gain.value = Math.min(1, 0.25 + dist / 12);
    lp.connect(send).connect(this.reverb!);

    const f0 = 150 + Math.random() * 70;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.07);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(1, t + 0.003);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.12);

    const n = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500 + Math.random() * 300;
    bp.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    n.connect(bp).connect(ng).connect(out);
    n.start(t, Math.random() * 0.9);
    n.stop(t + 0.06);
  }
}

export const sfx = new AudioEngine();
