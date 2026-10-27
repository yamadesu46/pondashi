import { AudioEngine } from './audio-engine.js';
const $ = (id) => document.getElementById(id);
const palette = ['#b8ee83', '#8fc8f4', '#e4b3ed', '#f0c680', '#8ed9c9', '#ef9eac'];
const freshPad = (i) => ({ id: crypto.randomUUID(), name: `サウンド ${String(i + 1).padStart(2, '0')}`, fadeIn: 0, fadeOut: 0, mode: 'overlap', volume: 1, repeat: false, color: palette[i % palette.length], file: null, filename: '' });
let boards = [], boardId, stopFade = 0;
let pads = [], db, engine, selectedId, selectedColor, toastTimer, busy = false;
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4500); }
function openDB() { return new Promise((resolve, reject) => { const req = indexedDB.open('pondashi', 1); req.onupgradeneeded = () => req.result.createObjectStore('board'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function readStored(key) { return new Promise((resolve, reject) => { const req = db.transaction('board').objectStore('board').get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function persist(nextPads = pads, nextBoards = boards, nextId = boardId, nextFade = stopFade) {
  if (!db) throw new Error('ブラウザ保存を利用できません');
  const data = { boards: nextBoards.map(board => ({ ...board, pads: (board.id === boardId ? nextPads : board.pads).map(({ buffer, ...pad }) => pad) })), boardId: nextId, stopFade: nextFade };
  await new Promise((resolve, reject) => { const tx = db.transaction('board', 'readwrite'); tx.objectStore('board').put(data, 'workspace'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  const current = boards.find(b => b.id === boardId); if (current) current.pads = nextPads;
}
function renderTabs() {
  $('board-tabs').innerHTML = boards.map(b => `<button role="tab" id="tab-${b.id}" aria-controls="pads" aria-selected="${b.id === boardId}" tabindex="${b.id === boardId ? 0 : -1}" data-board="${b.id}">${escapeHTML(b.name)}</button>`).join('');
  $('pads').setAttribute('role', 'tabpanel'); $('pads').setAttribute('aria-labelledby', `tab-${boardId}`);
}
async function switchBoard(id) {
  if (busy || id === boardId) return;
  busy = true;
  try { await persist(pads, boards, id); boardId = id; pads = boards.find(b => b.id === id).pads; render(); }
  catch (err) { toast(`切り替えできませんでした: ${err.message}`); } finally { busy = false; }
}
$('board-tabs').onclick = e => { const tab = e.target.closest('[data-board]'); if (tab) switchBoard(tab.dataset.board); };
$('board-tabs').onkeydown = async e => {
  const keys = ['ArrowLeft','ArrowRight','Home','End']; if (!keys.includes(e.key)) return;
  e.preventDefault(); const i = boards.findIndex(b => b.id === boardId);
  const index = e.key === 'Home' ? 0 : e.key === 'End' ? boards.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + boards.length) % boards.length;
  await switchBoard(boards[index].id); document.getElementById(`tab-${boardId}`).focus();
};
$('add-board').onclick = async () => {
  if (busy) return;
  const name = prompt('ボード名', `ボード ${boards.length + 1}`); if (!name?.trim()) return;
  busy = true;
  try { const board = { id: crypto.randomUUID(), name: name.trim().slice(0,60), pads: Array.from({length:12}, (_,i) => freshPad(i)) }; const next = [...boards, board]; await persist(pads, next, board.id); boards = next; boardId = board.id; pads = board.pads; render(); }
  catch (err) { toast(`追加できませんでした: ${err.message}`); } finally { busy = false; }
};
$('stop-fade').onchange = async () => {
  if (busy) { $('stop-fade').value = stopFade; return; }
  const value = Number($('stop-fade').value);
  if (!Number.isFinite(value) || value < 0 || value > 60) { $('stop-fade').value = stopFade; return; }
  busy = true;
  try { await persist(pads, boards, boardId, value); stopFade = value; }
  catch (err) { $('stop-fade').value = stopFade; toast(`保存できませんでした: ${err.message}`); } finally { busy = false; }
};
function getEngine() {
  if (!engine) engine = new AudioEngine(new (window.AudioContext || window.webkitAudioContext)(), updatePlaying);
  engine.setVolume(Number($('master').value));
  return engine;
}
async function decode(file) {
  try { return await getEngine().context.decodeAudioData(await file.arrayBuffer()); }
  catch { throw new Error('この音声を読み込めません。対応する MP3 / WAV 等を選んでください。'); }
}
function escapeHTML(str) { return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function time(seconds) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function render() {
  renderTabs();
  $('count').textContent = `${pads.filter(p => p.file).length} / ${pads.length}`;
  $('pads').innerHTML = pads.map((pad, i) => `<article class="pad ${pad.file ? 'loaded' : 'empty'}" data-id="${pad.id}" style="--accent:${pad.color}">${pad.file ? `<button class="pad-main" aria-label="${escapeHTML(pad.name)}を再生" aria-pressed="false"><span class="pad-top"><span>PAD ${String(i + 1).padStart(2,'0')}</span><span class="duration">${pad.buffer ? time(pad.buffer.duration) : 'AUDIO'}</span></span><span class="play-symbol">▶</span><span class="pad-name">${escapeHTML(pad.name)}</span><span class="pad-detail"><span class="state">再生する</span><span>· ${pad.mode === 'interrupt' ? '割り込み' : '重ねる'}</span></span></button><div class="pad-bottom"><span>${Math.round((pad.volume ?? 1)*100)}%${pad.repeat ? ' · ↻' : ''} · IN ${pad.fadeIn.toFixed(1)}s / OUT ${pad.fadeOut.toFixed(1)}s</span><button class="settings-button" aria-label="${escapeHTML(pad.name)}の設定">⚙ 設定</button></div><div class="progress"></div>` : `<button class="pad-main" aria-label="ボタン${i + 1}に音声を追加"><span class="pad-top">PAD ${String(i + 1).padStart(2,'0')}</span><span class="plus">＋</span><span class="empty-label">音声をセット</span><span class="empty-caption">クリック または ドロップ</span></button>`}</article>`).join('');
  updatePlaying();
}
function updatePlaying() {
  const active = engine?.active || new Map();
  $('playing-count').textContent = active.size ? `${active.size} 音声を再生中` : '再生待機中';
  document.querySelectorAll('.pad').forEach(el => {
    const voice = active.get(el.dataset.id), pad = pads.find(p => p.id === el.dataset.id);
    el.classList.toggle('playing', !!voice); el.classList.toggle('stopping', !!voice?.stopping);
    const btn = el.querySelector('.pad-main');
    btn.setAttribute('aria-pressed', String(!!voice));
    if (pad.file) {
      btn.setAttribute('aria-label', `${pad.name}を${voice ? '停止' : '再生'}`);
      el.querySelector('.play-symbol').textContent = voice ? '■' : '▶';
      el.querySelector('.state').textContent = voice?.stopping ? 'フェードアウト中' : voice ? '再生中' : '再生する';
    }
  });
}
function animate() {
  document.querySelectorAll('.progress').forEach(el => {
    const voice = engine?.active.get(el.parentElement.dataset.id);
    el.style.width = voice ? `${Math.min(100, ((engine.context.currentTime - voice.start) % (voice.source.loop ? voice.duration : Infinity)) / voice.duration * 100)}%` : '0';
  });
  requestAnimationFrame(animate);
}
function showSettings(pad) {
  if (busy) return;
  selectedId = pad.id; selectedColor = pad.color;
  $('settings-title').textContent = `ボタン ${String(pads.indexOf(pad) + 1).padStart(2, '0')} の設定`;
  $('pad-volume').value = Math.round((pad.volume ?? 1)*100); updatePadVolumeLabel(); $('pad-repeat').checked = pad.repeat ?? false;
  $('pad-name').value = pad.name; $('fade-in').value = pad.fadeIn; $('fade-out').value = pad.fadeOut; $('mode').value = pad.mode;
  $('audio-file').value = ''; $('filename').textContent = pad.filename || 'ファイル未設定';
  renderColors(); $('settings').showModal();
}
function renderColors() { $('colors').innerHTML = palette.map((c, i) => `<button type="button" class="swatch ${c === selectedColor ? 'selected' : ''}" data-color="${c}" style="background:${c}" aria-label="カラー ${i + 1}" aria-pressed="${c === selectedColor}"></button>`).join(''); }
function updatePadVolumeLabel() { $('pad-volume-label').textContent = `${$('pad-volume').value}%`; }
$('pad-volume').addEventListener('input', updatePadVolumeLabel);
$('pad-volume').addEventListener('change', updatePadVolumeLabel);
$('colors').onclick = e => { const c = e.target.closest('[data-color]'); if (c) { selectedColor = c.dataset.color; renderColors(); } };
$('close-settings').onclick = () => { if (!busy) $('settings').close(); };
$('settings').addEventListener('cancel', e => { if (busy) e.preventDefault(); });
const nameFromFile = file => (file.name.replace(/\.[^.]+$/, '') || file.name).slice(0,60);
$('audio-file').onchange = () => {
  const file = $('audio-file').files[0];
  $('filename').textContent = file?.name || pads.find(p => p.id === selectedId)?.filename || 'ファイル未設定';
  if (file) $('pad-name').value = nameFromFile(file);
};
$('settings-form').onsubmit = async e => {
  e.preventDefault(); if (busy) return;
  busy = true; const submit = e.submitter; submit.disabled = true;
  try {
    const pad = pads.find(p => p.id === selectedId), file = $('audio-file').files[0];
    const next = { ...pad, name: $('pad-name').value.trim() || pad.name, fadeIn: Number($('fade-in').value), fadeOut: Number($('fade-out').value), mode: $('mode').value, volume: Number($('pad-volume').value)/100, repeat: $('pad-repeat').checked, color: selectedColor };
    if (file) { next.buffer = await decode(file); next.file = file; next.filename = file.name; }
    const updated = pads.map(p => p.id === selectedId ? next : p);
    await persist(updated); if (file) engine?.stop(pad.id); pads = updated; engine?.updatePad(next);
    render(); $('settings').close(); toast('設定を保存しました');
  } catch (err) { toast(`保存できませんでした: ${err.message}`); }
  finally { busy = false; submit.disabled = false; }
};
$('clear-pad').onclick = async () => {
  if (busy || !confirm('このボタンの音声と設定を解除しますか？')) return;
  busy = true;
  try { const index = pads.findIndex(p => p.id === selectedId); const updated = pads.map((p,i) => i === index ? {...freshPad(i), id:p.id} : p); await persist(updated); engine?.stop(selectedId); pads = updated; render(); $('settings').close(); toast('音声を解除しました'); }
  catch(err) { toast(`解除できませんでした: ${err.message}`); } finally { busy = false; }
};
$('pads').onclick = async e => {
  const el = e.target.closest('.pad'); if (!el || busy) return;
  const pad = pads.find(p => p.id === el.dataset.id);
  if (e.target.closest('.settings-button') || !pad.file) { showSettings(pad); return; }
  // Decode may be asynchronous: invalidate a pending start when Esc or another pad is pressed.
  const audio = getEngine();
  const ticket = ++playRequest;
  try {
    await audio.context.resume();
    if (!pad.buffer) pad.buffer = await decode(pad.file);
    if (ticket !== playRequest) return;
    await audio.toggle(pad);
    const duration = el.querySelector('.duration'); if (duration) duration.textContent = time(pad.buffer.duration);
  } catch(err) { toast(`再生できませんでした: ${err.message}`); }
};
let playRequest = 0;
function stopAll() { playRequest++; engine?.stopAll(stopFade); }
$('stop-all').onclick = stopAll;
document.addEventListener('keydown', e => { if (e.key === 'Escape') stopAll(); });
$('master').oninput = () => { $('volume').textContent = `${Math.round(Number($('master').value)*100)}%`; engine?.setVolume(Number($('master').value)); };
$('add').onclick = async () => {
  if (busy) return; busy = true;
  try { const updated = [...pads, freshPad(pads.length)]; await persist(updated); pads = updated; render(); }
  catch(err) { toast(`追加できませんでした: ${err.message}`); } finally { busy = false; }
};
for (const event of ['dragover','dragleave','drop']) $('pads').addEventListener(event, async e => {
  const el = e.target.closest('.pad'); if (!el) return;
  e.preventDefault(); el.classList.toggle('dragover', event === 'dragover');
  if (event !== 'drop' || busy) return;
  const file = e.dataTransfer.files[0]; if (!file) return;
  busy = true;
  try { const buffer = await decode(file); const pad = pads.find(p => p.id === el.dataset.id); const next = {...pad, file, buffer, filename:file.name, name:nameFromFile(file)}; const updated = pads.map(p => p.id === pad.id ? next : p); await persist(updated); engine?.stop(pad.id); pads = updated; render(); toast('音声をセットしました'); }
  catch(err) { toast(`セットできませんでした: ${err.message}`); } finally { busy = false; }
});
$('help').onclick = () => $('help-dialog').showModal(); $('close-help').onclick = () => $('help-dialog').close();
function blobToDataURL(blob) { return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }
$('export').onclick = async () => {
  if (busy) return; busy = true;
  try { const data = await Promise.all(pads.map(async ({buffer,file,...pad}) => ({...pad, audio: file ? await blobToDataURL(file) : null}))); const url = URL.createObjectURL(new Blob([JSON.stringify({format:'pondashi',version:1,pads:data})],{type:'application/json'})); const a = document.createElement('a'); a.href=url; a.download=`pondashi-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('音声を含むバックアップを書き出しました'); }
  catch(err) { toast(`書き出せませんでした: ${err.message}`); } finally { busy=false; }
};
$('import').onclick = () => { if (!busy) $('import-file').click(); };
$('import-file').onchange = async () => {
  const file = $('import-file').files[0]; if (!file || busy) return;
  if (!confirm('現在のボタンをバックアップの内容に置き換えますか？')) { $('import-file').value=''; return; }
  busy = true;
  try {
    const data = JSON.parse(await file.text());
    if (data.format !== 'pondashi' || data.version !== 1 || !Array.isArray(data.pads) || !data.pads.length || data.pads.length > 200) throw new Error('バックアップの形式が正しくありません');
    const next = [];
    for (const p of data.pads) {
      if (typeof p.name !== 'string' || !['overlap','interrupt'].includes(p.mode) || ![p.fadeIn,p.fadeOut].every(n => Number.isFinite(n) && n >= 0 && n <= 60) || !palette.includes(p.color)) throw new Error('設定値が正しくありません');
      if ((p.volume !== undefined && (!Number.isFinite(p.volume) || p.volume < 0 || p.volume > 1)) || (p.repeat !== undefined && typeof p.repeat !== 'boolean')) throw new Error('音量・リピート設定が正しくありません');
      let audioFile = null, buffer;
      if (p.audio) {
        if (typeof p.audio !== 'string' || !/^data:[^,]*;base64,/.test(p.audio)) throw new Error('音声データが正しくありません');
        const [header,body] = p.audio.split(','); const bytes = Uint8Array.from(atob(body), c => c.charCodeAt(0));
        audioFile = new Blob([bytes],{type:header.slice(5).split(';')[0]}); buffer = await decode(audioFile);
      }
      next.push({id:crypto.randomUUID(), name:p.name.slice(0,60), fadeIn:p.fadeIn, fadeOut:p.fadeOut, mode:p.mode, volume:p.volume ?? 1, repeat:p.repeat ?? false, color:p.color, filename:typeof p.filename === 'string' ? p.filename : '', file:audioFile, buffer});
    }
    await persist(next); stopAll(); pads = next; render(); toast('バックアップを読み込みました');
  } catch(err) { toast(`読み込めませんでした: ${err.message}`); }
  finally { busy=false; $('import-file').value=''; }
};
window.addEventListener('pagehide', () => { playRequest++; engine?.stopAll(); });
try {
  db = await openDB(); const saved = await readStored('workspace');
  if (saved?.boards?.length) { boards = saved.boards; boardId = saved.boardId; stopFade = saved.stopFade ?? 0; }
  else { boards = [{ id: crypto.randomUUID(), name: 'ボード 1', pads: await readStored('pads') || Array.from({length:12}, (_,i) => freshPad(i)) }]; boardId = boards[0].id; }
  if (!boards.some(b => b.id === boardId)) boardId = boards[0].id;
  pads = boards.find(b => b.id === boardId).pads; $('stop-fade').value = stopFade;
} catch { pads = Array.from({length:12}, (_,i) => freshPad(i)); boards = [{id:crypto.randomUUID(), name:'ボード 1', pads}]; boardId = boards[0].id; toast('ブラウザ保存を利用できません。サイトの保存権限を確認してください。'); }
render(); animate();
