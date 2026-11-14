const colors = ['#b8ee83','#8fc8f4','#e4b3ed','#f0c680','#8ed9c9','#ef9eac'];
const number = (n,min,max) => Number.isFinite(n) && n >= min && n <= max;
async function audioData(file) {
  const bytes = new Uint8Array(await file.arrayBuffer()); let binary='';
  for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return `data:${file.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}
export async function exportSetup({boards,boardId,stopFade,master}) {
  const result=[];
  for(const board of boards) {
    const pads=[];
    for(const {buffer,file,...pad} of board.pads) pads.push({...pad,audio:file ? await audioData(file) : null});
    result.push({id:board.id,name:board.name,pads});
  }
  return {format:'pondashi',version:2,boards:result,boardId,stopFade,master};
}
export async function importSetup(data,decode) {
  if(data?.format!=='pondashi' || ![1,2].includes(data.version)) throw new Error('バックアップの形式が正しくありません');
  const legacy=data.version===1;
  const source=legacy ? [{id:'legacy',name:'読み込んだボード',pads:data.pads}] : data.boards;
  if(!Array.isArray(source) || !source.length || source.length>100) throw new Error('ボードの形式が正しくありません');
  if(!legacy && (!number(data.stopFade,0,60) || !number(data.master,0,1))) throw new Error('全体音量・全停止フェードが正しくありません');
  const boards=[],ids=new Map();
  for(const b of source) {
    if(!b || typeof b.id!=='string' || ids.has(b.id) || typeof b.name!=='string' || !b.name.trim() || b.name.length>60 || !Array.isArray(b.pads) || !b.pads.length || b.pads.length>200) throw new Error('ボードの設定が正しくありません');
    const id=crypto.randomUUID();ids.set(b.id,id);const pads=[];
    for(const p of b.pads) {
      if(!p || typeof p.name!=='string' || !['overlap','interrupt','crossfade'].includes(p.mode) || ![p.fadeIn,p.fadeOut].every(n=>number(n,0,60)) || !colors.includes(p.color) || (p.volume!==undefined && !number(p.volume,0,1)) || (p.repeat!==undefined && typeof p.repeat!=='boolean') || (p.crossfade!==undefined && !number(p.crossfade,0.1,60))) throw new Error('ボタンの設定値が正しくありません');
      let file=null,buffer;
      if(p.audio!==null && p.audio!==undefined) {
        if(typeof p.audio!=='string' || !/^data:[^,]*;base64,[A-Za-z0-9+/]*={0,2}$/.test(p.audio)) throw new Error('音声データが正しくありません');
        const [header,body]=p.audio.split(',');const bytes=Uint8Array.from(atob(body),c=>c.charCodeAt(0));
        file=new Blob([bytes],{type:header.slice(5).split(';')[0]});
        buffer=await decode(file);
      }
      pads.push({id:crypto.randomUUID(),name:p.name.slice(0,60),mode:p.mode,fadeIn:p.fadeIn,fadeOut:p.fadeOut,crossfade:p.crossfade??2,volume:p.volume??1,repeat:p.repeat??false,color:p.color,filename:typeof p.filename==='string'?p.filename:'',file,buffer});
    }
    boards.push({id,name:b.name,pads});
  }
  if(!legacy && !ids.has(data.boardId)) throw new Error('選択中のボードが見つかりません');
  return {legacy,boards,boardId:legacy?boards[0].id:ids.get(data.boardId),stopFade:data.stopFade,master:data.master};
}
