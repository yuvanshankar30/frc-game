/**
 * FRC-style field cues and continuous robot mechanism sounds. Everything is synthesized by default; any field cue can
 * be replaced by a recording dropped into `public/sfx/` (see SAMPLE_FILES and public/sfx/README.md).
 *
 * Field cues follow a real FRC match: "Charge!" fanfare at the start, a buzzer when AUTO ends, three bells
 * when TELEOP starts, a steam whistle for END GAME, and a buzzer at the end of the match.
 * Robot loops are driven every frame from robot state (drive speed, flywheel spin, intake, indexer).
 */
/** Field cue → file name (without extension) looked up in public/sfx/. mp3, ogg or wav. */
export const SAMPLE_FILES = {
  start: 'match-start',
  autoEnd: 'auto-end',
  teleop: 'teleop-start',
  shift: 'shift',
  endgame: 'endgame',
  end: 'match-end',
  countdown: 'countdown',
} as const;
type Cue = keyof typeof SAMPLE_FILES;

class AudioEngine {
  private samples: Partial<Record<Cue, AudioBuffer>> = {};
  private samplesLoaded = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private fieldBus: GainNode | null = null;
  private loopBus: GainNode | null = null;
  volume = 0.6;
  private last = new Map<string, number>();
  private loops: Record<string, { osc: OscillatorNode[]; gain: GainNode; filter?: BiquadFilterNode; src?: AudioBufferSourceNode }> = {};
  private noiseBuf: AudioBuffer | null = null;

  private ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -16;
        comp.ratio.value = 4;
        this.master = this.ctx.createGain();
        this.master.connect(comp).connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain();
        this.fieldBus = this.ctx.createGain();
        this.loopBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.fieldBus.connect(this.master);
        this.loopBus.connect(this.master);
        this.loopBus.gain.value = 0.55;
        this.fieldBus.gain.value = 0.9;
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

  /** Load any recordings present in public/sfx/ (missing files fall back to the synthesized cue). */
  private async loadSamples(ctx: AudioContext) {
    const base = `${import.meta.env.BASE_URL ?? '/'}sfx/`;
    await Promise.all(
      (Object.keys(SAMPLE_FILES) as Cue[]).map(async (cue) => {
        for (const ext of ['mp3', 'ogg', 'wav']) {
          try {
            const res = await fetch(`${base}${SAMPLE_FILES[cue]}.${ext}`);
            // The dev server answers unknown paths with index.html, so require an audio content type.
            if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('audio')) continue;
            this.samples[cue] = await ctx.decodeAudioData(await res.arrayBuffer());
            return;
          } catch {
            // try the next extension
          }
        }
      }),
    );
  }

  /** Play a recorded cue if one was provided. Returns false to fall back to synthesis. */
  private sample(cue: Cue) {
    const buf = this.samples[cue];
    const ctx = this.ctx;
    if (!buf || !ctx) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.fieldBus!);
    src.start();
    return true;
  }

  private gate(key: string, minGap: number) {
    const now = performance.now();
    if ((this.last.get(key) ?? 0) + minGap * 1000 > now) return false;
    this.last.set(key, now);
    return true;
  }

  private noise() {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    return s;
  }

  /** Enveloped oscillator note. */
  private note(bus: GainNode, type: OscillatorType, freq: number, t0: number, dur: number, gain: number, opts: { attack?: number; slideTo?: number; vibrato?: number; filter?: number } = {}) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    let node: AudioNode = o;
    if (opts.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.value = opts.vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.1);
    }
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.filter;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    const a = opts.attack ?? 0.01;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + a);
    g.gain.setValueAtTime(gain, t0 + Math.max(a, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    node.connect(g).connect(bus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  private burst(bus: GainNode, t0: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q = 1) {
    const ctx = this.ctx!;
    const s = this.noise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(t0, Math.random());
    s.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------- field cues

  /** Match start: bugle "Charge!" (G4 C5 E5 G5 … E5 G5). */
  charge() {
    const ctx = this.ensure();
    if (!ctx || this.sample('start')) return;
    const t = ctx.currentTime + 0.05;
    const seq: [number, number, number][] = [
      [392, 0, 0.16],
      [523.3, 0.17, 0.16],
      [659.3, 0.34, 0.16],
      [784, 0.51, 0.36],
      [659.3, 0.9, 0.14],
      [784, 1.06, 0.9],
    ];
    for (const [f, dt, d] of seq) {
      this.note(this.fieldBus!, 'sawtooth', f, t + dt, d, 0.16, { attack: 0.025, vibrato: dt > 1 ? 6 : 0, filter: 2600 });
      this.note(this.fieldBus!, 'square', f / 2, t + dt, d, 0.05, { attack: 0.02, filter: 1200 });
    }
  }

  /** AUTO / match end buzzer. */
  buzzer(cue: 'autoEnd' | 'end' = 'end') {
    const ctx = this.ensure();
    if (!ctx || this.sample(cue)) return;
    const t = ctx.currentTime + 0.02;
    for (const f of [92, 138, 185]) this.note(this.fieldBus!, 'square', f, t, 1.6, 0.09, { attack: 0.01, filter: 1800 });
    this.burst(this.fieldBus!, t, 1.6, 0.05, 'bandpass', 700, 0.6);
  }

  /** TELEOP start: three struck bells. */
  bells() {
    const ctx = this.ensure();
    if (!ctx || this.sample('teleop')) return;
    const t = ctx.currentTime + 0.02;
    for (let k = 0; k < 3; k++) this.strike(t + k * 0.42, 880, 0.2);
  }

  private strike(t: number, f: number, g: number) {
    for (const [ratio, amp, dec] of [
      [1, 1, 1.6],
      [2.76, 0.45, 0.9],
      [5.4, 0.25, 0.5],
      [8.93, 0.12, 0.3],
    ] as const)
      this.note(this.fieldBus!, 'sine', f * ratio, t, dec, g * amp, { attack: 0.002 });
    this.burst(this.fieldBus!, t, 0.05, 0.08, 'highpass', 4000);
  }

  /** END GAME: steam whistle. */
  whistle() {
    const ctx = this.ensure();
    if (!ctx || this.sample('endgame')) return;
    const t = ctx.currentTime + 0.02;
    for (const f of [466, 587, 698]) this.note(this.fieldBus!, 'sawtooth', f, t, 1.3, 0.07, { attack: 0.08, vibrato: 4, filter: 3200 });
    this.burst(this.fieldBus!, t, 1.3, 0.06, 'bandpass', 2400, 1.5);
  }

  /** Shift change: two-tone chime. */
  chime(active: boolean) {
    const ctx = this.ensure();
    if (!ctx || this.sample('shift')) return;
    const t = ctx.currentTime + 0.02;
    const [a, b] = active ? [784, 1175] : [1175, 784];
    this.note(this.fieldBus!, 'triangle', a, t, 0.35, 0.16);
    this.note(this.fieldBus!, 'triangle', b, t + 0.18, 0.5, 0.16);
  }

  /** Pre-match countdown beep (final = higher). */
  countdown(final = false) {
    const ctx = this.ensure();
    if (!ctx || this.sample('countdown')) return;
    this.note(this.fieldBus!, 'square', final ? 1046 : 660, ctx.currentTime + 0.01, 0.16, 0.08, { filter: 2400 });
  }

  // ------------------------------------------------------------- one-shots

  shoot() {
    if (!this.gate('shoot', 0.035)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.note(this.sfxBus!, 'sine', 150, t, 0.12, 0.28, { slideTo: 55, attack: 0.002 });
    this.burst(this.sfxBus!, t, 0.06, 0.18, 'bandpass', 900, 0.8);
  }

  intake() {
    if (!this.gate('intake', 0.06)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.burst(this.sfxBus!, ctx.currentTime, 0.07, 0.12, 'lowpass', 500);
  }

  score() {
    if (!this.gate('score', 0.05)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.burst(this.sfxBus!, t, 0.08, 0.12, 'lowpass', 380);
    this.note(this.sfxBus!, 'sine', 1318, t + 0.02, 0.22, 0.07, { attack: 0.003 });
  }

  wasted() {
    if (!this.gate('wasted', 0.08)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.burst(this.sfxBus!, ctx.currentTime, 0.12, 0.12, 'lowpass', 240);
  }

  /** Robot impact (strength 0..1). */
  impact(strength: number) {
    if (!this.gate('impact', 0.12)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.note(this.sfxBus!, 'sine', 90, t, 0.18, 0.25 * strength, { slideTo: 45, attack: 0.002 });
    this.burst(this.sfxBus!, t, 0.12, 0.2 * strength, 'lowpass', 900);
  }

  climb() {
    if (!this.gate('climb', 0.6)) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.note(this.sfxBus!, 'sawtooth', 120, ctx.currentTime, 1.4, 0.05, { slideTo: 260, filter: 900, attack: 0.05 });
  }

  click() {
    const ctx = this.ensure();
    if (!ctx) return;
    this.note(this.sfxBus!, 'square', 1800, ctx.currentTime, 0.03, 0.03, { attack: 0.001 });
  }

  // ------------------------------------------------------------- continuous robot loops

  private loop(name: string, build: (ctx: AudioContext, out: GainNode) => { osc: OscillatorNode[]; filter?: BiquadFilterNode; src?: AudioBufferSourceNode }) {
    if (this.loops[name]) return this.loops[name];
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.loopBus!);
    const parts = build(ctx, gain);
    this.loops[name] = { ...parts, gain };
    return this.loops[name];
  }

  /**
   * Called every frame with the local robot's state (0..1 values; speed in m/s).
   * Drive: swerve motor whine + carpet rumble. Flywheel: rising whine. Intake: roller drone. Indexer: rattle.
   */
  updateRobot(s: { speed: number; maxSpeed: number; spin: number; intake: number; feeding: boolean; enabled: boolean }) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const k = s.enabled ? 1 : 0;
    const sp = Math.min(1, s.speed / Math.max(0.5, s.maxSpeed));
    const drive = this.loop('drive', (c, out) => {
      const o1 = c.createOscillator();
      const o2 = c.createOscillator();
      o1.type = 'sawtooth';
      o2.type = 'square';
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 2.5;
      o1.connect(f);
      o2.connect(f);
      f.connect(out);
      const rumble = this.noise();
      rumble.loop = true;
      const rf = c.createBiquadFilter();
      rf.type = 'lowpass';
      rf.frequency.value = 180;
      const rg = c.createGain();
      rg.gain.value = 0.6;
      rumble.connect(rf).connect(rg).connect(out);
      o1.start();
      o2.start();
      rumble.start();
      return { osc: [o1, o2], filter: f, src: rumble };
    });
    const df = 110 + sp * 620;
    drive.osc[0].frequency.setTargetAtTime(df, t, 0.05);
    drive.osc[1].frequency.setTargetAtTime(df * 1.5, t, 0.05);
    drive.filter!.frequency.setTargetAtTime(df * 2, t, 0.05);
    // Silent when stopped; motor whine fades in with speed.
    drive.gain.gain.setTargetAtTime(k * (sp < 0.03 ? 0 : 0.015 + sp * 0.11), t, 0.06);

    const fly = this.loop('fly', (c, out) => {
      const o1 = c.createOscillator();
      const o2 = c.createOscillator();
      o1.type = 'triangle';
      o2.type = 'sine';
      o1.connect(out);
      o2.connect(out);
      o1.start();
      o2.start();
      return { osc: [o1, o2] };
    });
    fly.osc[0].frequency.setTargetAtTime(140 + s.spin * 980, t, 0.12);
    fly.osc[1].frequency.setTargetAtTime(280 + s.spin * 1960, t, 0.12);
    fly.gain.gain.setTargetAtTime(k * s.spin * 0.07, t, 0.1);

    const intake = this.loop('intake', (c, out) => {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = 196;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      // Tremolo modulates an inner gain stage, so the loop's output gain (0 when the intake is off) still silences it.
      const trem = c.createOscillator();
      const tg = c.createGain();
      const inner = c.createGain();
      trem.frequency.value = 23;
      tg.gain.value = 0.4;
      inner.gain.value = 0.6;
      trem.connect(tg).connect(inner.gain);
      o.connect(f).connect(inner).connect(out);
      o.start();
      trem.start();
      return { osc: [o, trem], filter: f };
    });
    intake.gain.gain.setTargetAtTime(k * s.intake * 0.05, t, 0.05);

    const index = this.loop('index', (c, out) => {
      const src = this.noise();
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1300;
      f.Q.value = 3;
      src.connect(f).connect(out);
      src.start();
      return { osc: [], filter: f, src };
    });
    index.gain.gain.setTargetAtTime(k * (s.feeding ? 0.09 : 0), t, 0.04);
  }

  /** Silence the robot loops (pause / menus). */
  stopLoops() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const l of Object.values(this.loops)) l.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }

  /** Back-compat aliases. */
  bell() {
    this.bells();
  }
  horn() {
    this.whistle();
  }
}

export const sfx = new AudioEngine();
