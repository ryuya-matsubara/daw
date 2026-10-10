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
