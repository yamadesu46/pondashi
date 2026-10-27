export class AudioEngine {
  constructor(context, onChange = () => {}) {
    this.context = context;
    this.onChange = onChange;
    this.active = new Map();
    this.master = context.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(context.destination);
    this.generation = 0;
  }
  setVolume(value) { this.master.gain.setValueAtTime(value, this.context.currentTime); }
  async toggle(pad) {
    const generation = this.generation;
    await this.context.resume();
    if (generation !== this.generation) return;
    if (this.active.has(pad.id)) { this.stop(pad.id, pad.fadeOut); return; }
    if (pad.mode === 'interrupt') this.stopAll();
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const volume = this.context.createGain();
    volume.gain.value = pad.volume ?? 1;
    source.loop = pad.repeat ?? false;
    const now = this.context.currentTime;
    source.buffer = pad.buffer;
    source.connect(gain);
    gain.connect(volume);
    volume.connect(this.master);
    const fade = Math.min(pad.fadeIn, pad.buffer.duration);
    gain.gain.setValueAtTime(fade > 0 ? 0 : 1, now);
    if (fade > 0) gain.gain.linearRampToValueAtTime(1, now + fade);
    const voice = { source, gain, volume, start: now, fadeIn: fade, duration: pad.buffer.duration, stopping: false };
    this.active.set(pad.id, voice);
    source.onended = () => {
      source.disconnect(); gain.disconnect(); volume.disconnect();
      if (this.active.get(pad.id) === voice) { this.active.delete(pad.id); this.onChange(); }
    };
    source.start();
    this.onChange();
  }
  stop(id, fade = 0) {
    const voice = this.active.get(id);
    if (!voice) return;
    if (voice.stopping && fade > 0) return;
    const now = this.context.currentTime;
    if (fade <= 0) {
      voice.source.stop();
      this.active.delete(id);
      this.onChange();
      return;
    }
    const current = voice.fadeIn ? Math.min(1, (now - voice.start) / voice.fadeIn) : 1;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(current, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + fade);
    voice.stopping = true;
    voice.source.stop(now + fade);
    this.onChange();
  }
  updatePad(pad) {
    const voice = this.active.get(pad.id);
    if (!voice) return;
    voice.volume.gain.setValueAtTime(pad.volume ?? 1, this.context.currentTime);
    voice.source.loop = pad.repeat ?? false;
  }
  stopAll(fade = 0) {
    this.generation++;
    for (const id of [...this.active.keys()]) this.stop(id, fade);
  }
}
