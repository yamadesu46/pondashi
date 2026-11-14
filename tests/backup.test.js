import test from 'node:test';
import assert from 'node:assert/strict';
import {exportSetup,importSetup} from '../backup.js';
const pad=(id,file=null)=>({id,name:'拍手',fadeIn:1,fadeOut:2,mode:'crossfade',crossfade:3,volume:0.35,repeat:true,color:'#b8ee83',filename:'拍手.wav',file,buffer:{decoded:true}});
const setup=()=>({boards:[{id:'one',name:'イベント',pads:[pad('a',new Blob(['sound'],{type:'audio/wav'})),pad('b')]},{id:'two',name:'BGM',pads:[pad('c')]}],boardId:'two',master:0.45,stopFade:4});
test('all boards, audio bytes, pad order and all settings survive a round trip',async()=>{
 const original=setup(),data=await exportSetup(original);
 assert.equal(data.version,2);assert.equal('buffer' in data.boards[0].pads[0],false);assert.equal('file' in data.boards[0].pads[0],false);
 const restored=await importSetup(JSON.parse(JSON.stringify(data)),async file=>({decoded:await file.text()}));
 assert.deepEqual(restored.boards.map(b=>b.name),['イベント','BGM']);assert.equal(restored.boardId,restored.boards[1].id);
 const p=restored.boards[0].pads[0];assert.equal(await p.file.text(),'sound');assert.equal(p.buffer.decoded,'sound');assert.equal(p.volume,0.35);assert.equal(p.crossfade,3);assert.equal(p.repeat,true);assert.equal(p.fadeIn,1);assert.equal(p.fadeOut,2);assert.equal(p.filename,'拍手.wav');assert.equal(restored.boards[0].pads[1].file,null);
 assert.equal(restored.master,0.45);assert.equal(restored.stopFade,4);assert.notEqual(restored.boards[0].id,'one');
});
test('legacy board backups remain readable with defaults',async()=>{
 const {file,buffer,volume,repeat,crossfade,...p}=pad('a');const restored=await importSetup({format:'pondashi',version:1,pads:[{...p,audio:null}]},()=>{});
 assert.equal(restored.legacy,true);assert.equal(restored.boards[0].pads[0].volume,1);assert.equal(restored.boards[0].pads[0].crossfade,2);
});
test('invalid settings, missing selected board and duplicate board identities are rejected',async()=>{
 const original=await exportSetup(setup());
 for(const change of [d=>d.master=2,d=>d.stopFade=-1,d=>d.boardId='missing',d=>d.boards[1].id='one',d=>d.boards[0].pads[0].audio='data:audio/wav;base64,!!',d=>d.boards[1].pads[0].volume=-1]) {
  const data=structuredClone(original);change(data);await assert.rejects(importSetup(data,async()=>({})));
 }
});
test('a later corrupt audio file fails the import and leaves the input unchanged',async()=>{
 const data=await exportSetup(setup());data.boards[1].pads[0].audio=data.boards[0].pads[0].audio;
 const before=JSON.stringify(data);let calls=0;
 await assert.rejects(importSetup(data,async()=>{if(++calls===2)throw new Error('corrupt');return {};}),/corrupt/);
 assert.equal(JSON.stringify(data),before);assert.equal(calls,2);
});
