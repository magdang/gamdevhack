import type { AudioKit, GameClock, GameState, KitContext } from '../core/contracts';
import { AUDIO, type AudioKey } from '../core/manifest';
import { AUDIO_CONFIG as C, SOUNDS, type SoundKey } from './config';

type LoopKey = 'music_loop' | 'ambience_souq';
interface Voice { source: AudioBufferSourceNode; gain: GainNode }

/** Crossfade the end into the beginning once, then let the audio thread loop sample-accurately.
 * The overlapping head is removed, so the last blended sample joins the first retained head sample.
 */
export function crossfadeLoop(context: BaseAudioContext, buffer: AudioBuffer): AudioBuffer {
  const overlap = Math.min(Math.floor(C.crossfadeSeconds * buffer.sampleRate), Math.floor(buffer.length / 4));
  if (overlap < 2) return buffer;
  const length = buffer.length - overlap;
  const output = context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const dest = output.getChannelData(channel);
    dest.set(source.subarray(overlap));
    for (let index = 0; index < overlap; index++) {
      const mix = index / (overlap - 1);
      const target = length - overlap + index;
      dest[target] = source[buffer.length - overlap + index] * (1 - mix) + source[index] * mix;
    }
  }
  return output;
}

export class AudioEngine implements AudioKit {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private bass: BiquadFilterNode | null = null;
  private musicGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private buffers = new Map<AudioKey, Promise<AudioBuffer | null>>();
  private loops = new Map<LoopKey, AudioBufferSourceNode>();
  private starting = new Set<LoopKey>();
  private voices = new Map<SoundKey, Set<Voice>>();
  private lastSound = new Map<SoundKey, number>();
  private state: GameState = 'title';
  private paused = false;
  private finalCutDucked = false;
  private musicStopped = false;
  private _muted = false;
  private forcedMute: boolean;
  private muteRevision = 0;
  private loopGeneration = 0;
  private targetRate = 1;
  private active = true;

  constructor(private ctx: KitContext) {
    this.forcedMute = ctx.debug.mute || new URLSearchParams(window.location.search).get('mute') === '1';
    try { this._muted = localStorage.getItem(C.muteKey) === '1'; } catch { /* Storage may be blocked. */ }
    this._muted ||= this.forcedMute;
    // Capture sees the gesture even when a UI button stops bubbling to the game's input layer.
    window.addEventListener('pointerdown', this.gesture, { capture: true });
    window.addEventListener('keydown', this.gesture, { capture: true });
    document.addEventListener('visibilitychange', () => {
      this.active = !document.hidden;
      this.mix();
    });
    const on = ctx.events.on.bind(ctx.events);
    on('ui:toggleMute', () => {
      // Core may forward this intent synchronously. Toggle only if it did not call setMuted itself.
      const revision = this.muteRevision;
      queueMicrotask(() => { if (revision === this.muteRevision) this.setMuted(!this._muted); });
    });
    on('game:state', ({ state }) => {
      this.state = state;
      this.finalCutDucked = state === 'finalCut';
      if (state === 'title' || state === 'playing' || state === 'bossIntro' || state === 'bossFight') {
        this.musicStopped = false;
        this.ensureLoops();
      }
      if (state === 'victory' || state === 'gameOver') this.fadeMusic();
      this.mix();
    });
    on('game:paused', ({ paused }) => { this.paused = paused; this.mix(); });
    on('player:slash', () => this.play('slash'));
    on('enemy:hit', () => this.play('hit'));
    on('enemy:killed', () => this.play('enemy_die'));
    on('dash:start', () => this.play('dash'));
    on('finisher:start', () => this.play('finisher'));
    on('player:hurt', () => this.play('player_hurt'));
    on('wave:start', () => this.play('wave_start'));
    on('boss:intro', () => {
      this.state = 'bossIntro'; this.mix(); this.play('boss_roar');
    });
    on('boss:spawned', () => { this.state = 'bossFight'; this.mix(); });
    on('boss:slam', () => this.play('boss_slam'));
    on('finalcut:ready', () => { this.finalCutDucked = true; this.mix(); });
    on('finalcut:start', () => { this.finalCutDucked = true; this.mix(); });
    on('finalcut:impact', () => this.play('final_cut'));
    on('combo:tier', () => this.play('combo_tier'));
    on('game:victory', () => { this.play('victory'); this.fadeMusic(); });
    on('game:over', () => { this.play('game_over'); this.fadeMusic(); });
  }

  private gesture = (): void => { this.unlock(); };

  get muted(): boolean { return this._muted; }

  setMuted(value: boolean): void {
    this.muteRevision++;
    this._muted = this.forcedMute || value;
    // A forced URL mute should not overwrite the user's saved preference.
    if (!this.forcedMute) {
      try { localStorage.setItem(C.muteKey, this._muted ? '1' : '0'); } catch { /* Optional storage. */ }
    }
    this.mix();
  }

  unlock(): void {
    try {
      if (!this.context) {
        const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) return;
        const context = this.context = new Constructor();
        this.master = context.createGain();
        this.master.gain.value = this._muted || !this.active ? 0 : C.masterVolume;
        this.compressor = context.createDynamicsCompressor();
        this.compressor.threshold.value = -12;
        this.compressor.knee.value = 12;
        this.compressor.ratio.value = 8;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.2;
        this.master.connect(this.compressor).connect(context.destination);
        this.lowpass = context.createBiquadFilter();
        this.lowpass.type = 'lowpass';
        this.lowpass.frequency.value = 20_000;
        this.lowpass.Q.value = 0.5;
        this.bass = context.createBiquadFilter();
        this.bass.type = 'lowshelf'; this.bass.frequency.value = 220;
        this.bass.connect(this.lowpass).connect(this.master);
        this.musicGain = context.createGain();
        this.musicGain.gain.value = 0;
        this.musicGain.connect(this.bass);
        this.ambienceGain = context.createGain();
        this.ambienceGain.gain.value = 0;
        this.ambienceGain.connect(this.lowpass);
        this.sfxGain = context.createGain();
        this.sfxGain.gain.value = 0.85;
        this.sfxGain.connect(this.master);
        for (const key of Object.keys(AUDIO) as AudioKey[]) void this.load(key);
        this.mix();
      }
      const context = this.context;
      if (context.state === 'running') this.didUnlock();
      else void context.resume().then(() => this.didUnlock()).catch(() => { /* Retry on next gesture. */ });
    } catch { /* Web Audio is optional, including exhausted/disabled device contexts. */ }
  }

  private didUnlock(): void {
    if (this.context?.state !== 'running') return;
    window.removeEventListener('pointerdown', this.gesture, { capture: true });
    window.removeEventListener('keydown', this.gesture, { capture: true });
    this.ensureLoops();
  }

  private load(key: AudioKey): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const context = this.context;
    if (!context) return Promise.resolve(null);
    const pending = (async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), C.fetchTimeoutMs);
      try {
        const response = await fetch(this.ctx.assets.audioUrl(key), { signal: controller.signal });
        if (!response.ok) return null;
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        return key === 'music_loop' || key === 'ambience_souq' ? crossfadeLoop(context, buffer) : buffer;
      } catch { return null; }
      finally { clearTimeout(timeout); }
    })();
    this.buffers.set(key, pending);
    return pending;
  }

  private ensureLoops(): void {
    const context = this.context;
    if (!context || context.state !== 'running' || this.musicStopped) return;
    for (const key of ['music_loop', 'ambience_souq'] as const) {
      if (this.loops.has(key) || this.starting.has(key)) continue;
      this.starting.add(key);
      void this.load(key).then((buffer) => {
        this.starting.delete(key);
        if (!buffer || this.musicStopped) return;
        const bus = key === 'music_loop' ? this.musicGain : this.ambienceGain;
        if (!bus) return;
        const source = context.createBufferSource();
        source.buffer = buffer; source.loop = true;
        source.playbackRate.value = key === 'music_loop' ? this.targetRate : 1;
        source.connect(bus);
        this.loops.set(key, source);
        source.onended = () => {
          source.disconnect();
          if (this.loops.get(key) === source) this.loops.delete(key);
        };
        source.start();
      });
    }
  }

  private play(key: SoundKey): void {
    const context = this.context;
    if (!context || context.state !== 'running' || this._muted || !this.active) return;
    const requested = performance.now();
    void this.load(key).then((buffer) => {
      if (!buffer || !this.sfxGain || this._muted || !this.active || context.state !== 'running'
        || performance.now() - requested > C.pendingSoundMaxAgeMs) return;
      const settings = SOUNDS[key];
      const now = context.currentTime;
      if (now - (this.lastSound.get(key) ?? -Infinity) < settings.gap) return;
      const active = this.voices.get(key) ?? new Set<Voice>();
      if (active.size >= settings.voices) return;
      this.voices.set(key, active);
      this.lastSound.set(key, now);
      const source = context.createBufferSource();
      source.buffer = buffer;
      // Cosmetic jitter must not consume the shared seeded gameplay RNG.
      source.playbackRate.value = 1 + (Math.random() * 2 - 1) * C.pitchVariation;
      const gain = context.createGain();
      gain.gain.value = settings.volume * (1 + (Math.random() * 2 - 1) * C.volumeVariation);
      source.connect(gain).connect(this.sfxGain);
      const voice = { source, gain };
      active.add(voice);
      source.onended = () => { active.delete(voice); source.disconnect(); gain.disconnect(); };
      source.start();
    });
  }

  private smooth(parameter: AudioParam | undefined, value: number, seconds: number = C.smoothing): void {
    if (!parameter || !this.context) return;
    parameter.setTargetAtTime(value, this.context.currentTime, seconds);
  }

  private mix(): void {
    if (!this.context) return;
    this.smooth(this.master?.gain, this._muted || !this.active ? 0 : C.masterVolume, 0.035);
    const music = this.musicStopped ? 0 : this.paused ? C.pauseVolume : this.finalCutDucked
      ? C.finalCutVolume : this.state === 'title' || this.state === 'boot' ? C.titleVolume : C.musicVolume;
    this.smooth(this.musicGain?.gain, music, this.musicStopped ? C.fadeSeconds / 3 : C.smoothing);
    this.smooth(this.ambienceGain?.gain, this.musicStopped ? 0 : C.ambienceVolume);
    this.smooth(this.bass?.gain, this.state === 'bossFight' || this.state === 'bossIntro' ? C.bossBassDb : 0);
  }

  private fadeMusic(): void {
    if (this.musicStopped) return;
    this.musicStopped = true;
    this.mix();
    // Disconnect after the gain fade. A restarted run invalidates this scheduled cleanup.
    const generation = ++this.loopGeneration;
    window.setTimeout(() => {
      if (!this.musicStopped || this.loopGeneration !== generation) return;
      this.loops.forEach((source) => source.stop());
      this.loops.clear();
    }, C.fadeSeconds * 1000 + 100);
  }

  update(clock: GameClock): void {
    const boss = this.state === 'bossFight' || this.state === 'bossIntro';
    this.targetRate = (C.minRate + (1 - C.minRate) * Math.max(0, Math.min(1, clock.timeScale))) * (boss ? C.bossRate : 1);
    const slow = Math.max(0, Math.min(1, clock.timeScale));
    this.smooth(this.loops.get('music_loop')?.playbackRate, this.targetRate);
    this.smooth(this.lowpass?.frequency, 750 + 19_250 * slow * slow);
  }
}
