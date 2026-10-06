// Bounded full-callback wall timing. No extra RAF, timer, microtask or network work.
// A completed sample is aggregated at the next callback's measured entry. This
// makes the accounting cost itself visible in that callback's prelude, without
// recursively recalculating the duration being recorded.
const FRAME=0,RAF=1,START=2,CORE_START=3,CORE_END=4,END=5,PLAYING=6,STEPS=7;
class Durations {
  constructor(){this.histogram=new Uint32Array(2001);this.count=0;this.sum=0;this.max=0;}
  add(value){this.histogram[Math.min(2000,Math.floor(value*20))]++;this.count++;this.sum+=value;this.max=Math.max(this.max,value);}
  snapshot(){let total=0,p95=0;const target=Math.ceil(this.count*.95);for(let i=0;i<this.histogram.length&&this.count;i++){total+=this.histogram[i];if(total>=target){p95=i===2000?this.max:(i+1)/20;break;}}return{count:this.count,meanMs:this.count?this.sum/this.count:0,p95Ms:p95,maxMs:this.max};}
}
function recordFrom(s){return{frameId:s[FRAME],rafAtMs:s[RAF],callbackBeginAtMs:s[START],coreBeginAtMs:s[CORE_START],coreEndAtMs:s[CORE_END],callbackMeasuredEndAtMs:s[END],fullWallMs:s[END]-s[START],coreWorkMs:s[CORE_END]-s[CORE_START],preludeMs:s[CORE_START]-s[START],tailMs:s[END]-s[CORE_END],playing:!!s[PLAYING],steps:s[STEPS]};}
function keep(list,entry,key){list.push(entry);list.sort((a,b)=>b[key]-a[key]);if(list.length>6)list.length=6;}
export class CallbackMetrics {
  constructor(){
    this.pending=new Float64Array(8);this.latest=new Float64Array(8);this.pendingReady=false;this.hasLatest=false;this.pendingContext=null;this.latestContext=null;
    this.full=new Durations();this.playingFull=new Durations();this.tail=new Durations();this.playingTail=new Durations();
    this.preludeSum=0;this.preludeMax=0;this.playingPreludeSum=0;this.playingPreludeMax=0;this.slowestPlaying=[];this.slowestPlayingTails=[];
  }
  commitPending(){
    if(!this.pendingReady)return;
    const p=this.pending,full=p[END]-p[START],tail=p[END]-p[CORE_END],prelude=p[CORE_START]-p[START];
    this.full.add(full);this.tail.add(tail);this.preludeSum+=prelude;this.preludeMax=Math.max(this.preludeMax,prelude);
    if(p[PLAYING]){
      this.playingFull.add(full);this.playingTail.add(tail);this.playingPreludeSum+=prelude;this.playingPreludeMax=Math.max(this.playingPreludeMax,prelude);
      const highFull=this.slowestPlaying.length<6||full>this.slowestPlaying.at(-1).fullWallMs,highTail=this.slowestPlayingTails.length<6||tail>this.slowestPlayingTails.at(-1).tailMs;
      if(highFull||highTail){const entry=recordFrom(p);if(this.pendingContext)entry.coreContext=this.pendingContext;if(highFull)keep(this.slowestPlaying,entry,'fullWallMs');if(highTail)keep(this.slowestPlayingTails,entry,'tailMs');}
    }
    this.latest.set(p);this.latestContext=this.pendingContext;this.hasLatest=true;this.pendingReady=false;
  }
  prepare(frameId,rafAt,playing,steps,callbackBegin,coreBegin,coreEnd,coreContext=null){
    // Metadata is prepared before the final timestamp, so these stores are timed.
    const p=this.pending;p[FRAME]=frameId;p[RAF]=rafAt;p[START]=callbackBegin;p[CORE_START]=coreBegin;p[CORE_END]=coreEnd;p[PLAYING]=+playing;p[STEPS]=steps;this.pendingContext=coreContext;
  }
  finish(end){
    // Deliberately only two fixed scalar stores after the final clock read.
    // No histogram, allocation, sorting or export is hidden after this boundary.
    this.pending[END]=end;this.pendingReady=true;
  }
  snapshot({detail=false}={}){
    const result={schema:'callback-wall-v1',scope:'Completed, non-throwing callback wall time from entry through prior-sample aggregation, game/DOM/Canvas work, QA export, existing statistics, rings and requestAnimationFrame registration. Excludes fixed final timestamp/commit-call-and-return overhead (two scalar stores, no iteration or allocation). Completed samples aggregate at the next measured callback entry. Not CPU time, GPU presentation, input-handler time or RAF gap.',throughFrameId:this.hasLatest?this.latest[FRAME]:0,full:this.full.snapshot(),playingFull:this.playingFull.snapshot(),tail:this.tail.snapshot(),playingTail:this.playingTail.snapshot(),prelude:{meanMs:this.full.count?this.preludeSum/this.full.count:0,maxMs:this.preludeMax},playingPrelude:{meanMs:this.playingFull.count?this.playingPreludeSum/this.playingFull.count:0,maxMs:this.playingPreludeMax},latestCompletedFrame:this.hasLatest?recordFrom(this.latest):null,pendingCompletedFrame:this.pendingReady?recordFrom(this.pending):null,percentileResolutionMs:.05,overflowThresholdMs:100,overflowPercentilePolicy:'Observed maximum if p95 falls in the overflow bucket.'};
    if(detail){if(result.latestCompletedFrame&&this.latestContext)result.latestCompletedFrame.coreContext=this.latestContext;if(result.pendingCompletedFrame&&this.pendingContext)result.pendingCompletedFrame.coreContext=this.pendingContext;result.slowestPlayingFrames=this.slowestPlaying.map(s=>({...s}));result.slowestPlayingTails=this.slowestPlayingTails.map(s=>({...s}));}return result;
  }
}
