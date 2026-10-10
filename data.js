(() => {
'use strict';
const FORMAT='ai-daw', VERSION=1;
const INSTRUMENTS=[
  ['kick','Kick'],['snare','Snare'],['clap','Clap'],['hat','Hi-hat'],['perc','Percussion'],
  ['bass','Synth Bass'],['808','808 Bass'],['lead','Synth Lead'],['pad','Synth Pad'],
  ['piano','Electric Piano'],['guitar','Plucked Guitar'],['keys','Pluck Keys'],['strings','Strings'],
  ['audio','Audio / Vocal']
];
const COLORS=['#caff59','#ffb26a','#68dcdf','#ae9dff','#fd86a0','#86b8ff','#efa36a','#80e8b0','#cab2f6','#f4cd7a'];
const MAX_NOTES=50000;
const num=(v,d,min,max)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):d;
const short=(v,def,max=60)=>typeof v==='string'?(v.trim().slice(0,max)||def):def;
const uid=()=>globalThis.crypto?.randomUUID?.()||('id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
function emptyProject(){
 return {format:FORMAT,version:VERSION,id:uid(),name:'Untitled Project',bpm:128,bars:32,tracks:[],updatedAt:Date.now()};
}
function createTrack(instrument='piano',name){
 return {id:uid(),name:short(name,INSTRUMENTS.find(x=>x[0]===instrument)?.[1]||'Instrument'),
 instrument:INSTRUMENTS.some(x=>x[0]===instrument)?instrument:'piano',volume:.85,pan:0,
 reverb:.12,delay:0,mute:false,solo:false,clips:[]};
}
function normalize(input,{importing=false}={}){
 if(!input || input.format!==FORMAT || Number(input.version)!==VERSION || !Array.isArray(input.tracks))
   throw Error('ai-daw v1形式のJSONを読み込んでください。AI_FORMAT.mdに仕様があります。');
 if(input.tracks.length>32)throw Error('トラック数は最大32です。');
 const project=emptyProject();
 project.id=importing?uid():short(input.id,uid(),120);
 project.name=short(input.name,'Imported Project');
 project.bpm=num(input.bpm,128,40,220);
 project.bars=Math.round(num(input.bars,32,1,128));
 project.updatedAt=Date.now();
 let total=0;
 const ids=new Set();
 input.tracks.forEach((t,i)=>{
   if(!t||typeof t!=='object')throw Error('トラックの形式が不正です。');
   const instrument=short(t.instrument,'piano',25).toLowerCase();
   if(!INSTRUMENTS.some(x=>x[0]===instrument))throw Error('未対応の音源: '+instrument);
   if(importing&&instrument==='audio')throw Error('AI JSONには音声ファイルを含められません。歌声はDAW内で録音してください。');
   const track=createTrack(instrument,short(t.name,INSTRUMENTS.find(x=>x[0]===instrument)[1]));
   track.id=importing?uid():short(t.id,uid(),120);
   if(ids.has(track.id))track.id=uid();
   ids.add(track.id);
   track.volume=num(t.volume,.85,0,1.5);
   track.pan=num(t.pan,0,-1,1);
   track.reverb=num(t.reverb,.12,0,1);
   track.delay=num(t.delay,0,0,1);
   track.mute=Boolean(t.mute);track.solo=Boolean(t.solo);
   const rawClips=Array.isArray(t.clips)?t.clips:(
     Array.isArray(t.notes)?[{start:0,length:project.bars*4,notes:t.notes}]:[]);
   if(rawClips.length>128)throw Error('トラックあたりのクリップは最大128個です。');
   for(const c of rawClips){
     if(!c||typeof c!=='object')continue;
     const start=num(c.start,0,0,project.bars*4);
     if(start>=project.bars*4)continue;
     const length=num(c.length,4,.25,project.bars*4-start);
     const clip={id:importing?uid():short(c.id,uid(),120),start,length,notes:[]};
     if(instrument==='audio'){
       if(importing)continue;
       clip.assetId=short(c.assetId,'',120);
       clip.offset=num(c.offset,0,0,3600);
       if(!clip.assetId)continue;
     }else{
       if(!Array.isArray(c.notes))continue;
       if(c.notes.length>8192)throw Error('1クリップの音符数は8192以下にしてください。');
       clip.notes=c.notes.map(n=>{
         if(!n||typeof n!=='object')return null;
         const beat=num(n.beat,0,0,length);
         if(beat>=length)return null;
         const duration=num(n.duration,.25,.0625,length-beat);
         const pitch=(typeof n.pitch==='number'&&n.pitch>=0&&n.pitch<=127)?Math.round(n.pitch):
           (/^[A-G]#?[0-8]$/.test(n.pitch||'')?n.pitch:'C4');
         return {beat,duration,pitch,velocity:num(n.velocity,.8,0,1)};
       }).filter(Boolean);
       total+=clip.notes.length;
       if(total>MAX_NOTES)throw Error('楽曲の音符数は最大50,000個です。');
     }
     track.clips.push(clip);
   }
   project.tracks.push(track);
 });
 return project;
}
function makeDemo(){
 const p=emptyProject();p.name='NEON CITY / AI DEMO';p.bpm=132;p.bars=32;
 const k=createTrack('kick','01 · Kick');const clap=createTrack('clap','02 · Clap');
 const hat=createTrack('hat','03 · Hats');const bass=createTrack('bass','04 · Bass');
 const pad=createTrack('pad','05 · Atmosphere');const lead=createTrack('lead','06 · Hook');
 const keys=createTrack('piano','07 · Chords');
 const add=(t,start,length,notes)=>t.clips.push({id:uid(),start,length,notes});
 const n=(beat,pitch,duration=.25,velocity=.9)=>({beat,pitch,duration,velocity});
 for(let b=0;b<32;b+=4){
   const st=b*4, chorus=b>=16&&b<28, buildup=b>=12&&b<16;
   add(k,st,16,Array.from({length:16},(_,i)=>n(i,'C2',.15,chorus?1:.87)));
   add(clap,st,16,Array.from({length:8},(_,i)=>n(Math.floor(i/2)*4+(i%2)*2+1,'D2',.25,.78)));
   if(b>=4)add(hat,st,16,Array.from({length:chorus?64:32},(_,i)=>n(i*(chorus?.25:.5),'F#2',.15,i%2?.48:.72)));
   const roots=b%16===0?['F2','F2','F2','F2']:b%16===4?['D#2','D#2','D#2','D#2']:b%16===8?['G#2','G#2','G#2','G#2']:['C2','C2','C2','C2'];
   add(bass,st,16,roots.flatMap((r,i)=>[n(i*4+.0,r,.85,.94),n(i*4+1.5,r,.45,.69),n(i*4+2.5,r,.45,.81)]));
   if(b>=8){
     const chord=b%16===0?['F3','G#3','C4']:b%16===4?['D#3','G3','A#3']:b%16===8?['G#3','C4','D#4']:['C3','D#3','G3'];
     add(pad,st,16,Array.from({length:4},(_,j)=>chord.map(x=>n(j*4,x,3.8,.53))).flat());
     add(keys,st,16,Array.from({length:8},(_,j)=>chord.map((x,i)=>n(j*2+i*.5,x,.4,.44))).flat());
   }
   if(chorus||b>=28){
     const motif=['C5','D#5','G5','F5','D#5','C5','A#4','G#4'];
     add(lead,st,16,Array.from({length:16},(_,j)=>n(j,motif[(j+b)%motif.length],.6,j%4===0?.96:.71)));
   }else if(buildup){
     add(lead,st,16,Array.from({length:24},(_,j)=>n(j*.5+4,j%3?'G4':'G5',.2,.36+j/40)));
   }
 }
 p.tracks=[k,clap,hat,bass,pad,lead,keys];return p;
}
const DB='ai-daw-projects-v1', OPEN_VERSION=1;
let database;
function openDB(){
 if(database)return database;
 database=new Promise((resolve,reject)=>{
   if(!('indexedDB' in globalThis)){reject(Error('このブラウザはIndexedDBに対応していません。'));return;}
   const req=indexedDB.open(DB,OPEN_VERSION);
   req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});
     if(!db.objectStoreNames.contains('assets'))db.createObjectStore('assets',{keyPath:'id'});};
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error);
 });
 return database;
}
async function transaction(store,mode,fn){
 const db=await openDB();
 return new Promise((resolve,reject)=>{
   const tr=db.transaction(store,mode),os=tr.objectStore(store);
   let request;
   try{request=fn(os);}catch(e){reject(e);return;}
   if(request)request.onsuccess=()=>resolve(request.result);
   tr.onerror=()=>reject(tr.error);
   if(!request)tr.oncomplete=()=>resolve(true);
 });
}
const storage={
 list:()=>transaction('projects','readonly',s=>s.getAll()),
 get:id=>transaction('projects','readonly',s=>s.get(id)),
 save:p=>transaction('projects','readwrite',s=>s.put({...p,updatedAt:Date.now()})),
 remove:id=>transaction('projects','readwrite',s=>s.delete(id)),
 putAsset:(id,blob)=>transaction('assets','readwrite',s=>s.put({id,blob})),
 getAsset:async id=>(await transaction('assets','readonly',s=>s.get(id)))?.blob||null
};
window.DAWData={FORMAT,VERSION,INSTRUMENTS,COLORS,uid,emptyProject,createTrack,normalize,makeDemo,storage};
})();