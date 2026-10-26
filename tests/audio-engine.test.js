import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine } from '../audio-engine.js';
function context() {
  const sources = [];
  return { currentTime: 0, destination: {}, sources,
    resume: async () => {},
    createGain() { return { gain: { value: 1, events: [], setValueAtTime(v,t) { this.events.push(['set',v,t]); }, linearRampToValueAtTime(v,t) { this.events.push(['ramp',v,t]); }, cancelScheduledValues(t) { this.events.push(['cancel',t]); } }, connect() {}, disconnect() {} }; },
    createBufferSource() { const s = { connect() {}, disconnect() {}, start() {this.started=true;}, stop(t) {this.stopTime=t ?? 0;} }; sources.push(s); return s; }
  };
}
const pad = (id, options={}) => ({id, fadeIn:0, fadeOut:0, mode:'overlap', buffer:{duration:10}, ...options});
test('overlap preserves existing sounds; interrupt immediately stops them', async () => {
  const c=context(), e=new AudioEngine(c);
  await e.toggle(pad('a')); await e.toggle(pad('b'));
  assert.equal(e.active.size,2);
  await e.toggle(pad('c',{mode:'interrupt'}));
  assert.deepEqual([...e.active.keys()],['c']);
  assert.equal(c.sources[0].stopTime,0); assert.equal(c.sources[1].stopTime,0);
});
test('same pad stops with fade from its current fade-in level', async () => {
  const c=context(), e=new AudioEngine(c); const p=pad('a',{fadeIn:4,fadeOut:2});
  await e.toggle(p); const v=e.active.get('a'); c.currentTime=1;
  await e.toggle(p);
  assert.equal(v.stopping,true);
  assert.deepEqual(v.gain.gain.events.slice(-3),[['cancel',1],['set',0.25,1],['ramp',0,3]]);
  assert.equal(v.source.stopTime,3);
  v.source.onended(); assert.equal(e.active.size,0);
});
test('all stop overrides a pending fade and clears all voices', async () => {
  const c=context(), e=new AudioEngine(c);
  await e.toggle(pad('a')); e.stop('a',5); e.stopAll();
  assert.equal(c.sources[0].stopTime,0); assert.equal(e.active.size,0);
});
test('all stop cancels a start pending AudioContext resume', async () => {
  const c=context(); let resume; c.resume=()=>new Promise(r=>resume=r);
  const e=new AudioEngine(c); const pending=e.toggle(pad('a')); e.stopAll(); resume(); await pending;
  assert.equal(c.sources.length,0);
});
test('old ended callback cannot remove a new voice for the same pad', async () => {
  const c=context(), e=new AudioEngine(c);
  await e.toggle(pad('a')); const old=c.sources[0]; e.stopAll(); await e.toggle(pad('a')); old.onended();
  assert.equal(e.active.size,1); c.sources[1].onended(); assert.equal(e.active.size,0);
});
test('fade in is capped to clip duration; volume is independent', async () => {
  const c=context(), e=new AudioEngine(c); await e.toggle(pad('a',{fadeIn:30}));
  assert.deepEqual(e.active.get('a').gain.gain.events,[['set',0,0],['ramp',1,10]]);
  e.setVolume(0.3); assert.deepEqual(e.master.gain.events.at(-1),['set',0.3,0]);
});
