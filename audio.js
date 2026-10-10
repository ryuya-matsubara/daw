(() => {
'use strict';
const D=window.DAWData, TAU=Math.PI*2;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
function pitchHz(p){
 if(Number.isFinite(p))return 440*Math.pow(2,(p-69)/12);
 const m=/^([A-G])(#?)([0-8])$/.exec(p||'C4');
 if(!m)return 261.626;
 const semis={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
 return 440*Math.pow(2,((Number(m[3])+1)*12+semis[m[1]]+(m[2]?1:0)-69)/12);
}
class DAWAudio {
 constructor(){
   this.ctx=null;this.master=null;this.buses=new Map();this.buffers=new Map();
   this.guitarCache=new Map();this.sources=new Set();this.events=[];
   this.playing=false;this.timer=0;this.raf=0;this.cursor=0;this.nextIndex=0;
   this.anchorBeat=0;this.anchorTime=0;this.project=null;this.onPosition=null;this.onStop=null;
   this.generation=0;
 }
 init(){
   if(this.ctx?.state==='running'||this.ctx?.state==='suspended')return this.ctx;
   if(!window.AudioContext&&!window.webkitAudioContext)throw Error('Web Audio未対応のブラウザです。');
   const ctx=new (window.AudioContext||window.webkitAudioContext)();
   this.ctx=ctx;this.buses.clear();this.guitarCache.clear();
   const limiter=ctx.createDynamicsCompressor();
   limiter.threshold.value=-9;limiter.ratio.value=6;limiter.knee.value=6;
   limiter.attack.value=.002;limiter.release.value=.15;
   const master=ctx.createGain();master.gain.value=.8;master.connect(limiter).connect(ctx.destination);this.master=master;
   // Shared reverb and feedback delay, with per-track send controls.
   const impulse=ctx.createBuffer(2,ctx.sampleRate*1.8,ctx.sampleRate);
   for(let ch=0;ch<2;ch++){
     const arr=impulse.getChannelData(ch);
     for(let i=0;i<arr.length;i++)arr[i]=(Math.random()*2-1)*Math.pow(1-i/arr.length,2.7)*.5;
   }
   const reverb=ctx.createConvolver();reverb.buffer=impulse;
   const wet=ctx.createGain();wet.gain.value=.48;reverb.connect(wet).connect(master);
   this.reverbInput=reverb;
   const delay=ctx.createDelay(1);delay.delayTime.value=.3125;
   const feedback=ctx.createGain();feedback.gain.value=.29;
   const lowpass=ctx.createBiquadFilter();lowpass.type='lowpass';lowpass.frequency.value=4200;
   delay.connect(lowpass).connect(feedback).connect(delay);
   delay.connect(master);this.delayInput=delay;
   this.noise=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);
   const noise=this.noise.getChannelData(0);
   for(let i=0;i<noise.length;i++)noise[i]=Math.random()*2-1;
   return ctx;
 }
 async ensureAudio(project){
   if(!this.ctx)this.init();
   const ids=new Set(project.tracks.flatMap(t=>t.instrument==='audio'?t.clips.map(c=>c.assetId):[]));
   for(const id of ids){
     if(this.buffers.has(id))continue;
     const blob=await D.storage.getAsset(id);
     if(!blob)continue;
     try{this.buffers.set(id,await this.ctx.decodeAudioData(await blob.arrayBuffer()));}
     catch(err){console.warn('Audio decode failed',id,err);}
   }
 }
 buildBus(track){
   const ctx=this.ctx;
   const input=ctx.createGain(),panner=ctx.createStereoPanner();
   input.connect(panner).connect(this.master);
   const reverb=ctx.createGain(),delay=ctx.createGain();
   panner.connect(reverb).connect(this.reverbInput);
   panner.connect(delay).connect(this.delayInput);
   const bus={input,panner,reverb,delay,track};
   this.buses.set(track.id,bus);
   this.applyBus(bus);return bus;
 }
 applyBus(bus){
   const t=bus.track,now=this.ctx.currentTime;
   const solos=this.project?.tracks.some(x=>x.solo);
   const audible=!t.mute&&(!solos||t.solo);
   bus.input.gain.setTargetAtTime(audible?t.volume:0,now,.015);
   bus.panner.pan.setTargetAtTime(t.pan,now,.025);
   bus.reverb.gain.setTargetAtTime(t.reverb,now,.03);
   bus.delay.gain.setTargetAtTime(t.delay*.65,now,.03);
 }
 updateMix(project){
   this.project=project;
   for(const t of project.tracks){const b=this.buses.get(t.id);if(b){b.track=t;this.applyBus(b);}}
 }
 makeEvents(project){
   const events=[];
   for(const track of project.tracks){
     for(const clip of track.clips){
       if(track.instrument==='audio'){
         events.push({beat:clip.start,kind:'audio',track,clip});
       }else{
         for(const note of clip.notes)
           events.push({beat:clip.start+note.beat,kind:'note',track,note});
       }
     }
   }
   events.sort((a,b)=>a.beat-b.beat);
   return events;
 }
 position(){
   if(!this.playing)return this.cursor;
   return clamp(this.anchorBeat+(this.ctx.currentTime-this.anchorTime)*this.project.bpm/60,0,this.project.bars*4);
 }
 async start(project,fromBeat=0,onPosition=null,onStop=null){
   this.stop(false);
   const generation=++this.generation;
   this.project=project;this.onPosition=onPosition;this.onStop=onStop;
   if(this.ctx?.state==='interrupted'||this.ctx?.state==='closed'){
     try{this.ctx.close().catch(()=>{});}catch{}
     this.ctx=null;
   }
   const ctx=this.init();
   // This must be requested inside the actual Play user gesture on Safari.
   const resume=ctx.state!=='running'?ctx.resume():Promise.resolve();
   await resume;
   if(generation!==this.generation)return;
   if(ctx.state!=='running')throw Error('音声を開始できません。もう一度Playを押してください。');
   await this.ensureAudio(project);
   if(generation!==this.generation)return;
   for(const t of project.tracks)this.buildBus(t);
   this.events=this.makeEvents(project);
   const startBeat=clamp(fromBeat,0,Math.max(0,project.bars*4-.001));
   this.cursor=startBeat;this.anchorBeat=startBeat;this.anchorTime=ctx.currentTime+.12;
   // Locate the first event at or after the seek location.
   this.nextIndex=this.events.findIndex(e=>e.beat>=startBeat-.00001);
   if(this.nextIndex<0)this.nextIndex=this.events.length;
   this.playing=true;
   // If seeking into an existing audio clip, start from the matching file offset.
   for(const t of project.tracks.filter(x=>x.instrument==='audio')){
     for(const clip of t.clips){
       if(clip.start<startBeat&&clip.start+clip.length>startBeat)
         this.startAudio(t,clip,this.anchorTime,startBeat-clip.start);
     }
   }
   this.schedule();
   this.timer=setInterval(()=>this.schedule(),25);
   const draw=()=>{
     if(!this.playing)return;
     this.cursor=this.position();
     this.onPosition?.(this.cursor);
     this.raf=requestAnimationFrame(draw);
   };
   this.raf=requestAnimationFrame(draw);
 }
 schedule(){
   if(!this.playing)return;
   const ctx=this.ctx,secondsPerBeat=60/this.project.bpm;
   const ahead=this.position()+.2/secondsPerBeat;
   while(this.nextIndex<this.events.length&&this.events[this.nextIndex].beat<=ahead){
     const e=this.events[this.nextIndex++];
     const time=this.anchorTime+(e.beat-this.anchorBeat)*secondsPerBeat;
     if(e.kind==='audio')this.startAudio(e.track,e.clip,Math.max(time,ctx.currentTime+.005),0);
     else this.trigger(e.track,e.note,Math.max(time,ctx.currentTime+.005));
   }
   if(this.position()>=this.project.bars*4-.01)this.stop(true);
 }
 startAudio(track,clip,time,extraBeats){
   const buf=this.buffers.get(clip.assetId),bus=this.buses.get(track.id);
   if(!buf||!bus)return;
   const offset=clip.offset+extraBeats*60/this.project.bpm;
   const available=Math.min(buf.duration-offset,(clip.length-extraBeats)*60/this.project.bpm);
   if(available<=.005)return;
   const src=this.ctx.createBufferSource();
   src.buffer=buf;src.connect(bus.input);
   this.trackSource(src);
   src.start(time,offset,available);
 }
 trackSource(src){
   this.sources.add(src);
   src.onended=()=>this.sources.delete(src);
 }
 stop(notify=true){
   ++this.generation;
   if(this.timer)clearInterval(this.timer);
   if(this.raf)cancelAnimationFrame(this.raf);
   this.timer=0;this.raf=0;
   for(const src of this.sources){try{src.stop();}catch{}}
   this.sources.clear();
   for(const bus of this.buses.values()){
     try{bus.input.disconnect();bus.panner.disconnect();bus.reverb.disconnect();bus.delay.disconnect();}catch{}
   }
   this.buses.clear();
   const wasPlaying=this.playing;
   if(wasPlaying)this.cursor=this.position();
   this.playing=false;
   if(wasPlaying&&notify)this.onStop?.();
 }
 seek(beat){
   this.cursor=beat;
   if(this.playing)return this.start(this.project,beat,this.onPosition,this.onStop);
   this.onPosition?.(beat);
 }
 envelope(gain,time,peak,attack,hold,release){
   const g=gain.gain;
   g.setValueAtTime(.0001,time);
   g.linearRampToValueAtTime(Math.max(.0002,peak),time+Math.max(.002,attack));
   g.setValueAtTime(Math.max(.0002,peak),time+Math.max(.002,attack)+Math.max(.005,hold));
   g.exponentialRampToValueAtTime(.0001,time+Math.max(.002,attack)+Math.max(.005,hold)+Math.max(.01,release));
 }
 tone(type,freq,time,len,level,destination,{attack=.005,release=.08,detune=0,filter=0}={}){
   const c=this.ctx,g=c.createGain(),o=c.createOscillator();
   o.type=type;o.frequency.setValueAtTime(Math.max(20,freq),time);o.detune.value=detune;
   if(filter){
     const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=filter;
     o.connect(f).connect(g);
   }else o.connect(g);
   g.connect(destination);
   this.envelope(g,time,level,attack,Math.max(.005,len-attack-release),release);
   this.trackSource(o);o.start(time);o.stop(time+len+release+.02);return o;
 }
 noiseHit(bus,time,len,level,highpass=0){
   const c=this.ctx,s=c.createBufferSource(),g=c.createGain();
   s.buffer=this.noise;
   if(highpass){
     const f=c.createBiquadFilter();f.type='highpass';f.frequency.value=highpass;
     s.connect(f).connect(g);
   }else s.connect(g);
   g.connect(bus);this.envelope(g,time,level,.002,.007,len);
   this.trackSource(s);s.start(time);s.stop(time+len+.04);
 }
 pluckString(freq,time,len,volume,out){
   const c=this.ctx,sr=c.sampleRate,period=clamp(Math.round(sr/freq),16,2200);
   const key=Math.round(freq*10);
   let buffer=this.guitarCache.get(key);
   if(!buffer){
     buffer=c.createBuffer(1,Math.floor(sr*2.6),sr);
     const wave=buffer.getChannelData(0),string=new Float32Array(period);
     for(let i=0;i<period;i++)string[i]=(Math.random()*2-1)*Math.sin(Math.PI*i/period);
     let idx=0;
     for(let i=0;i<wave.length;i++){
       wave[i]=string[idx];
       const next=(idx+1)%period;
       string[idx]=.994*(string[idx]+string[next])*.5;
       idx=next;
     }
     if(this.guitarCache.size>=48)this.guitarCache.delete(this.guitarCache.keys().next().value);
     this.guitarCache.set(key,buffer);
   }
   const src=c.createBufferSource(),g=c.createGain(),filter=c.createBiquadFilter();
   src.buffer=buffer;filter.type='lowpass';filter.frequency.value=5000;
   src.connect(filter).connect(g).connect(out);
   this.envelope(g,time,volume,.003,Math.min(len,.9),.28);
   this.trackSource(src);src.start(time);src.stop(time+Math.min(len+1,2.5));
 }
 trigger(track,note,time){
   const bus=this.buses.get(track.id);if(!bus)return;
   const out=bus.input,c=this.ctx,sec=60/this.project.bpm;
   const duration=clamp(note.duration*sec,.04,8);
   const v=clamp(note.velocity??.8,0,1);
   const freq=pitchHz(note.pitch);
   switch(track.instrument){
     case 'kick':{
       const o=this.tone('sine',150,time,.32,v*.92,out,{release:.15});
       o.frequency.exponentialRampToValueAtTime(43,time+.12);break;
     }
     case '808':{
       const o=this.tone('sine',freq*1.5,time,Math.max(.15,duration*.94),v*.95,out,{release:.17});
       o.frequency.exponentialRampToValueAtTime(freq,time+.08);break;
     }
     case 'snare':
       this.noiseHit(out,time,.20,v*.58,900);
       this.tone('triangle',170,time,.11,v*.22,out,{release:.11});break;
     case 'clap':
       for(const off of [0,.011,.025])this.noiseHit(out,time+off,.11,v*.26,1300);break;
     case 'hat':this.noiseHit(out,time,.045+duration*.12,v*.21,5900);break;
     case 'perc':this.tone('triangle',Math.max(95,freq),time,.13,v*.54,out,{release:.10});break;
     case 'bass':
       this.tone('sawtooth',freq,time,duration*.94,v*.39,out,{release:.08,filter:1100});
       this.tone('sine',freq,time,duration*.96,v*.48,out,{release:.08});break;
     case 'lead':
       this.tone('sawtooth',freq,time,duration,v*.22,out,{release:.14,filter:5000});
       this.tone('sawtooth',freq,time,duration,v*.18,out,{release:.14,detune:8,filter:4900});break;
     case 'pad':
       for(const detune of [-8,0,8])
         this.tone('sawtooth',freq,time,Math.max(.25,duration),v*.085,out,{attack:.17,release:.55,detune,filter:2400});
       break;
     case 'strings':
       for(const detune of [-4,4])
         this.tone('sawtooth',freq,time,Math.max(.23,duration),v*.13,out,{attack:.09,release:.4,detune,filter:3200});
       break;
     case 'piano':
       this.tone('sine',freq,time,Math.min(duration,1.8),v*.45,out,{attack:.004,release:.24});
       this.tone('sine',freq*2,time,Math.min(duration*.65,.85),v*.13,out,{release:.13});break;
     case 'guitar':this.pluckString(freq,time,duration,v*.62,out);break;
     case 'keys':
       this.tone('triangle',freq,time,Math.min(duration,.7),v*.30,out,{attack:.002,release:.12});
       this.tone('sine',freq*2,time,Math.min(duration,.42),v*.18,out,{release:.10});break;
   }
 }
}
window.DAWAudio=DAWAudio;
})();