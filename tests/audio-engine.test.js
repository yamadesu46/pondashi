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
test('pad volume and repeat are independent and update during playback', async () => {
  const c=context(), e=new AudioEngine(c);
  await e.toggle(pad('a',{volume:0.25,repeat:true,fadeIn:2}));
  const v=e.active.get('a');
  assert.equal(v.source.loop,true); assert.equal(v.volume.gain.value,0.25);
  e.updatePad(pad('a',{volume:0,repeat:false}));
  assert.equal(v.source.loop,false);
  assert.deepEqual(v.volume.gain.events.at(-1),['set',0,0]);
  assert.deepEqual(v.gain.gain.events,[['set',0,0],['ramp',1,2]]);
});
test('global fade stops every voice including loops and cancels pending starts', async () => {
  const c=context(), e=new AudioEngine(c);
  await e.toggle(pad('a',{repeat:true})); await e.toggle(pad('b',{volume:0.4}));
  c.currentTime=3; e.stopAll(2);
  for (const v of e.active.values()) {
    assert.equal(v.stopping,true); assert.equal(v.source.stopTime,5);
    assert.deepEqual(v.gain.gain.events.at(-1),['ramp',0,5]);
  }
  for (const s of c.sources) s.onended();
  assert.equal(e.active.size,0);
});
test('crossfade replaces every active sound with simultaneous matched gain ramps',async()=>{
  const c=context(), e=new AudioEngine(c);
  await e.toggle(pad('board-a'));await e.toggle(pad('board-b',{repeat:true,volume:0.3}));
  c.currentTime=1;
  await e.toggle(pad('new',{mode:'crossfade',crossfade:3,fadeIn:0,volume:0.6}));
  assert.equal(e.active.size,3);
  for (const id of ['board-a','board-b']) {
    const v=e.active.get(id);assert.equal(v.source.stopTime,4);
    assert.deepEqual(v.gain.gain.events.slice(-2),[['set',1,1],['ramp',0,4]]);
  }
  const next=e.active.get('new');assert.deepEqual(next.gain.gain.events,[['set',0,1],['ramp',1,4]]);
  assert.equal(next.volume.gain.value,0.6);
});
test('crossfade retimes an existing fade from its current level without a gain jump',async()=>{
  const c=context(), e=new AudioEngine(c);await e.toggle(pad('old'));
  e.stop('old',10);c.currentTime=5;
  await e.toggle(pad('next',{mode:'crossfade',crossfade:2}));
  assert.deepEqual(e.active.get('old').gain.gain.events.slice(-3),[['cancel',5],['set',0.5,5],['ramp',0,7]]);
  assert.equal(c.sources[0].stopTime,7);
});
test('crossfade from a fading-in sound and immediate cut during crossfade work',async()=>{
  const c=context(), e=new AudioEngine(c);await e.toggle(pad('old',{fadeIn:4}));c.currentTime=1;
  await e.toggle(pad('next',{mode:'crossfade',crossfade:2}));
  assert.deepEqual(e.active.get('old').gain.gain.events.at(-2),['set',0.25,1]);
  await e.toggle(pad('cut',{mode:'interrupt'}));assert.deepEqual([...e.active.keys()],['cut']);
  assert.equal(c.sources[0].stopTime,0);assert.equal(c.sources[1].stopTime,0);
});
