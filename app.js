(() => {
'use strict';
const D=window.DAWData, engine=new window.DAWAudio(), $=id=>document.getElementById(id);
const BAR_WIDTH=88,DRUMS=new Set(['kick','snare','clap','hat','perc']);
let project=null,selectedTrack=null,selectedClip=null,page=0,octave=4,cursor=0,saveTimer=0;
let recorder=null,recStream=null,recChunks=[],recStart=0,recStartedAt=0,recTicker=0,importedText='';
const status=txt=>{$('status').textContent=txt;};
const safe=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(err=>{console.error(err);status(err.message||String(err));alert(err.message||String(err));});
function node(tag,cls='',text){
 const e=document.createElement(tag);if(cls)e.className=cls;
 if(text!==undefined)e.textContent=String(text);return e;
}
function button(label,action,cls=''){
 const e=node('button',cls,label);e.type='button';if(action)e.addEventListener('click',action);return e;
}
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const integer=(v,min,max)=>Math.max(min,Math.min(max,Math.round(number(v))));
function saveSoon(){
 $('saveStatus').textContent='SAVING';
 clearTimeout(saveTimer);const snapshot=project;
 saveTimer=setTimeout(async()=>{
   try{await D.storage.save(snapshot);if(project===snapshot)$('saveStatus').textContent='SAVED';}
   catch(err){$('saveStatus').textContent='ERROR';status('保存エラー: '+err.message);}
 },450);
}
async function saveNow(){clearTimeout(saveTimer);if(project)await D.storage.save(project);}
async function renderProjects(){
 const projects=(await D.storage.list()).sort((a,b)=>b.updatedAt-a.updatedAt);
 const select=$('projects');select.replaceChildren();
 for(const p of projects){const o=node('option','',p.name);o.value=p.id;select.append(o);}
 if(project)select.value=project.id;
}
async function openProject(p){
 if(recorder)stopRecording();
 engine.stop(false);await saveNow();
 project=p;selectedTrack=p.tracks[0]?.id||null;selectedClip=null;page=0;cursor=0;
 try{localStorage.setItem('ai-daw-active-id',p.id);}catch{}
 await renderProjects();renderAll();await engine.ensureAudio(project);status('Opened: '+p.name);
}
function updatePosition(beat){
 if(!project)return;cursor=Math.max(0,Math.min(project.bars*4,beat));
 const bar=1+Math.floor(Math.max(0,cursor-.00001)/4),quarter=1+Math.floor(cursor%4);
 $('position').textContent=String(bar).padStart(2,'0')+' : '+quarter;
 $('seek').value=String(cursor);
 const line=document.querySelector('.playhead');
 if(line)line.style.left=(180+cursor/4*BAR_WIDTH)+'px';
}
function renderHeader(){
 $('songName').value=project.name;$('bpm').value=project.bpm;$('bars').value=project.bars;
 $('duration').textContent=project.bars+' BARS';$('seek').max=project.bars*4;updatePosition(cursor);
}
function renderTimeline(){
 const holder=$('timelineScroll'),oldLeft=holder.scrollLeft,oldTop=holder.scrollTop;
 const root=$('timeline');root.replaceChildren();root.className='timeline';
 root.style.setProperty('--barw',BAR_WIDTH+'px');
 const width=project.bars*BAR_WIDTH;
 const ruler=node('div','timeline-ruler'),label=node('div','ruler-label','TRACKS'),scale=node('div','ruler-scale');
 scale.style.width=width+'px';scale.tabIndex=0;scale.setAttribute('role','button');
 scale.setAttribute('aria-label','小節を選択して再生位置を変更');
 for(let i=0;i<project.bars;i++){const mark=node('span','bar-mark',i+1);mark.style.left=(i*BAR_WIDTH)+'px';scale.append(mark);}
 scale.addEventListener('click',e=>{
   const rect=scale.getBoundingClientRect();
   seekTo(Math.max(0,Math.min(project.bars-1,Math.floor((e.clientX-rect.left)/BAR_WIDTH)))*4);
 });
 scale.addEventListener('keydown',e=>{
   if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();
     seekTo(Math.max(0,Math.min((project.bars-1)*4,cursor+(e.key==='ArrowRight'?4:-4))));}
 });
 ruler.append(label,scale);root.append(ruler);
 project.tracks.forEach((track,i)=>{
   const color=D.COLORS[i%D.COLORS.length];
   const row=node('div','track-row'),trackLabel=node('div','track-label');
   trackLabel.style.cursor='pointer';trackLabel.title='トラックを選択';
   const dot=node('span','track-dot');dot.style.background=color;
   const info=node('div','track-label-info');
   info.append(node('strong','',track.name),node('small','',track.instrument.toUpperCase()));
   trackLabel.append(dot,info);
   if(selectedTrack===track.id)trackLabel.style.boxShadow='inset 3px 0 var(--lime)';
   trackLabel.addEventListener('click',()=>{selectedTrack=track.id;renderTimeline();renderMixer();});
   const lane=node('div','track-lane');lane.style.width=width+'px';
   lane.addEventListener('click',e=>{
     if(e.target!==lane)return;
     const rect=lane.getBoundingClientRect();
     cursor=Math.max(0,Math.floor((e.clientX-rect.left)/BAR_WIDTH)*4);
     selectedTrack=track.id;updatePosition(cursor);renderTimeline();renderMixer();
   });
   for(const clip of track.clips){
     const c=button('',()=>{
       selectedTrack=track.id;selectedClip={trackId:track.id,clipId:clip.id};
       page=0;octave=track.instrument==='bass'||track.instrument==='808'?2:4;
       renderTimeline();renderEditor();renderMixer();
     },'clip'+(track.instrument==='audio'?' audio-clip':''));
     c.style.setProperty('--track-color',color);
     c.style.left=(clip.start/4*BAR_WIDTH+2)+'px';
     c.style.width=Math.max(18,clip.length/4*BAR_WIDTH-4)+'px';
     c.classList.toggle('selected',selectedClip?.clipId===clip.id);
     c.title=track.name+' · bar '+(1+Math.floor(clip.start/4))+' · '+clip.length+' beats';
     c.append(node('strong','',track.instrument==='audio'?'VOCAL / AUDIO':track.instrument.toUpperCase()),
       node('span','',track.instrument==='audio'?'Recorded audio':clip.notes.length+' notes'),node('i'));
     lane.append(c);
   }
   row.append(trackLabel,lane);root.append(row);
 });
 if(!project.tracks.length)root.append(node('div','empty','＋ Trackから音源を追加できます'));
 const line=node('span','playhead');line.style.left=(180+cursor/4*BAR_WIDTH)+'px';root.append(line);
 holder.scrollLeft=oldLeft;holder.scrollTop=oldTop;
}
function selected(){
 const track=project.tracks.find(t=>t.id===selectedClip?.trackId);
 const clip=track?.clips.find(c=>c.id===selectedClip?.clipId);
 return track&&clip?{track,clip}:null;
}

let insertLength=.5;
function renderEditor(){
 const body=$('editorBody'),selectedClipData=selected();
 body.replaceChildren();$('deleteClip').hidden=!selectedClipData;
 if(!selectedClipData){
   $('editorTitle').textContent='Select a clip';
   const empty=node('div','empty');
   empty.append(node('span','','♫'),node('p','','クリップを選択してください。音符はAI JSONから自動配置できます。'));
   body.append(empty);return;
 }
 const {track,clip}=selectedClipData;
 $('editorTitle').textContent=track.name+' · '+(track.instrument==='audio'?'AUDIO':'MIDI');
 if(track.instrument==='audio'){
   const panel=node('div','editor-audio');
   panel.append(node('p','','Start: bar '+(1+clip.start/4).toFixed(2)+' · Length: '+(clip.length*60/project.bpm).toFixed(1)+' sec'));
   panel.append(node('p','','音声はこの端末に保存されています。クリックで録音の開始位置を1/16音符単位で調整できます。'));
   const actions=node('div','audio-actions');
   actions.append(button('← 1/16',()=>{clip.start=Math.max(0,clip.start-.25);saveSoon();renderTimeline();renderEditor();}));
   actions.append(button('1/16 →',()=>{clip.start=Math.min(project.bars*4-clip.length,clip.start+.25);saveSoon();renderTimeline();renderEditor();}));
   actions.append(node('span','','Offset: '+(clip.offset||0).toFixed(2)+'s'));
   panel.append(actions);body.append(panel);return;
 }
 const controls=node('div','edit-controls');
 const start=node('label','','Start bar'),startInput=node('input');
 startInput.type='number';startInput.min=1;startInput.max=project.bars;
 startInput.value=String(1+clip.start/4);startInput.step='.25';
 startInput.addEventListener('change',()=>{
   clip.start=Math.max(0,Math.min((project.bars*4)-clip.length,(number(startInput.value)-1)*4));
   saveSoon();renderTimeline();renderEditor();
 });start.append(startInput);
 const length=node('label','','Length'),lenInput=node('input');
 lenInput.type='number';lenInput.min=.25;lenInput.step=.25;lenInput.value=clip.length;
 lenInput.addEventListener('change',()=>{
   clip.length=Math.min(project.bars*4-clip.start,Math.max(.25,number(lenInput.value)));
   clip.notes=clip.notes.filter(n=>n.beat<clip.length).map(n=>({...n,duration:Math.min(n.duration,clip.length-n.beat)}));
   page=0;saveSoon();renderTimeline();renderEditor();
 });length.append(lenInput);
 const octaveLabel=node('label','','Octave'),octaveSelect=node('select');
 for(let i=1;i<=7;i++){const o=node('option','','C'+i+' – B'+i);o.value=i;octaveSelect.append(o);}
 octaveSelect.value=octave;
 octaveSelect.addEventListener('change',()=>{octave=Number(octaveSelect.value);renderEditor();});
 octaveLabel.append(octaveSelect);
 const durLabel=node('label','','Note'),duration=node('select');
 for(const [val,text] of [[.25,'1/16'],[.5,'1/8'],[1,'1/4'],[2,'1/2'],[4,'1 bar']]){
   const o=node('option','',text);o.value=val;duration.append(o);
 }
 duration.value=insertLength;
 duration.addEventListener('change',()=>{insertLength=number(duration.value);});
 durLabel.append(duration);
 const prev=button('‹ 4 bars',()=>{page--;renderEditor();});
 const next=button('4 bars ›',()=>{page++;renderEditor();});
 const maxPage=Math.max(0,Math.ceil(clip.length/16)-1);
 prev.disabled=page<=0;next.disabled=page>=maxPage;
 controls.append(start,length);
 if(!DRUMS.has(track.instrument))controls.append(octaveLabel);
 controls.append(durLabel,prev,node('span','',String(page+1)+' / '+String(maxPage+1)),next);
 body.append(controls);
 const viewport=node('div','step-scroll'),grid=node('div','step-grid');
 grid.style.setProperty('--steps','64');
 grid.style.setProperty('--track-color',D.COLORS[project.tracks.indexOf(track)%D.COLORS.length]);
 grid.append(node('div','step-key','Pitch'));
 for(let s=0;s<64;s++)grid.append(node('div','step-key',s%16===0?1+page*4+s/16:s%4===0?'·':''));
 const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
 const pitches=DRUMS.has(track.instrument)?['C2']:names.map(x=>x+octave).reverse();
 for(const pitch of pitches){
   grid.append(node('div','step-key',pitch));
   for(let s=0;s<64;s++){
     const beat=page*16+s/4;
     const found=clip.notes.find(n=>String(n.pitch)===pitch&&n.beat<=beat+.00001&&n.beat+n.duration>beat+.00001);
     const cell=button('',()=>{
       const active=clip.notes.find(n=>String(n.pitch)===pitch&&n.beat<=beat+.00001&&n.beat+n.duration>beat+.00001);
       if(active)clip.notes.splice(clip.notes.indexOf(active),1);
       else clip.notes.push({beat,duration:Math.min(insertLength,clip.length-beat),pitch,velocity:.85});
       clip.notes.sort((a,b)=>a.beat-b.beat);
       saveSoon();renderEditor();renderTimeline();
     },'step-cell'+(s%4===0?' quarter':'')+(found?' on':''));
     cell.disabled=beat>=clip.length;cell.title=pitch+' · beat '+beat;
     grid.append(cell);
   }
 }
 viewport.append(grid);body.append(viewport);
 body.append(node('p','editor-note','1マス＝1/16音符。タップで追加・削除、横スワイプでスクロール。'));
}
function renderMixer(){
 const holder=$('mixerTracks');holder.replaceChildren();
 project.tracks.forEach((t,i)=>{
   const row=node('div','mix-row'),name=node('div','mix-name'),dot=node('span','track-dot');
   dot.style.background=D.COLORS[i%D.COLORS.length];
   name.append(dot,node('span','',t.name));row.append(name);
   const volume=node('input');volume.type='range';volume.min=0;volume.max=1.5;volume.step=.01;volume.value=t.volume;
   volume.setAttribute('aria-label',t.name+' volume');
   volume.addEventListener('input',()=>{t.volume=number(volume.value);engine.updateMix(project);saveSoon();});
   row.append(volume);
   const mute=button('M',()=>{t.mute=!t.mute;engine.updateMix(project);renderMixer();saveSoon();},'tiny'+(t.mute?' on':''));
   mute.title='Mute';mute.setAttribute('aria-label',t.name+' Mute');
   const solo=button('S',()=>{t.solo=!t.solo;engine.updateMix(project);renderMixer();saveSoon();},'tiny'+(t.solo?' on':''));
   solo.title='Solo';solo.setAttribute('aria-label',t.name+' Solo');row.append(mute,solo);
   const fx=node('div','mix-extra');
   if(t.instrument!=='audio'){
     const preset=node('select');preset.setAttribute('aria-label',t.name+' instrument');
     for(const [id,label] of D.INSTRUMENTS.filter(x=>x[0]!=='audio')){
       const option=node('option','',label);option.value=id;preset.append(option);
     }
     preset.value=t.instrument;
     preset.addEventListener('change',()=>{t.instrument=preset.value;engine.stop();saveSoon();renderAll();});
     fx.append(preset);
   }
   for(const [field,label,min,max] of [['pan','Pan',-1,1],['reverb','Rev',0,1],['delay','Dly',0,1]]){
     const wrap=node('label','',label),input=node('input');
     input.type='range';input.min=min;input.max=max;input.step=.05;input.value=t[field];input.className='fx';
     input.setAttribute('aria-label',t.name+' '+label);
     input.addEventListener('input',()=>{t[field]=number(input.value);engine.updateMix(project);saveSoon();});
     wrap.append(input);fx.append(wrap);
   }
   row.append(fx);holder.append(row);
 });
}
function renderAll(){renderHeader();renderTimeline();renderEditor();renderMixer();$('play').textContent='▶';}
function seekTo(beat){
 cursor=Math.max(0,Math.min(project.bars*4-.001,beat));updatePosition(cursor);
 if(engine.playing)engine.seek(cursor).catch(err=>status('再生エラー: '+err.message));
}
async function playPause(){
 if(recorder){status('録音中です。先に録音を終了してください。');return;}
 if(engine.playing){engine.stop();$('play').textContent='▶';return;}
 try{
   $('play').textContent='…';
   await engine.start(project,cursor,beat=>updatePosition(beat),()=>{$('play').textContent='▶';});
   $('play').textContent='Ⅱ';status('Playing');
 }catch(err){$('play').textContent='▶';throw err;}
}
async function importJSON(text){
 if(text.length>2*1024*1024)throw Error('JSONファイルは2MB以下にしてください。');
 let data;try{data=JSON.parse(text);}catch{throw Error('JSON構文が正しくありません。');}
 const p=D.normalize(data,{importing:true});await D.storage.save(p);
 $('importDialog').close();$('jsonText').value='';importedText='';
 await openProject(p);status(p.tracks.length+'トラックをインポートしました');
}
