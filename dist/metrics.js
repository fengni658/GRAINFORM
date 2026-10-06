// Bounded-memory full-session telemetry. No network transmission or persisted telemetry.
export class SessionMetrics {
  constructor(start=0){
    this.start=start;this.frames=0;this.playingFrames=0;this.playingElapsedMs=0;
    this.workHistogram=new Uint32Array(2001);this.playHistogram=new Uint32Array(2001);
    this.gapHistogram=new Uint32Array(2001);this.playGapHistogram=new Uint32Array(2001);
    this.workMax=0;this.playMax=0;this.workSum=0;this.playSum=0;
    this.gapMax=0;this.playGapMax=0;this.gapSum=0;this.slowPlayingFrames=0;
    this.lastHeapAt=-Infinity;this.heapSamples=[];
  }
  record(work,gap,playing,now,heap){
    const value=Math.max(0,Number.isFinite(work)?work:0),bin=Math.min(2000,Math.floor(value*20));
    const interval=Math.max(0,Number.isFinite(gap)?gap:0),gapBin=Math.min(2000,Math.floor(interval*2));
    this.frames++;this.workHistogram[bin]++;this.workMax=Math.max(this.workMax,value);this.workSum+=value;
    this.gapHistogram[gapBin]++;this.gapMax=Math.max(this.gapMax,interval);this.gapSum+=interval;
    if(playing){
      this.playingFrames++;this.playHistogram[bin]++;this.playMax=Math.max(this.playMax,value);this.playSum+=value;this.playingElapsedMs+=interval;
      this.playGapHistogram[gapBin]++;this.playGapMax=Math.max(this.playGapMax,interval);if(interval>25)this.slowPlayingFrames++;
    }
    if(heap&&now-this.lastHeapAt>=30000){this.lastHeapAt=now;this.heapSamples.push({elapsedMs:Math.max(0,now-this.start),used:heap.usedJSHeapSize,total:heap.totalJSHeapSize});if(this.heapSamples.length>2880)this.heapSamples.shift();}
  }
  percentile(hist,count,max,quantile,scale=20){
    if(!count)return 0;const target=Math.ceil(count*quantile);let n=0;
    for(let i=0;i<hist.length;i++){n+=hist[i];if(n>=target)return i===2000?max:(i+1)/scale;}return max;
  }
  snapshot(now){return {
    elapsedMs:Math.max(0,now-this.start),frames:this.frames,playingFrames:this.playingFrames,playingElapsedMs:this.playingElapsedMs,
    workMean:this.frames?this.workSum/this.frames:0,workP50:this.percentile(this.workHistogram,this.frames,this.workMax,.5),workP95:this.percentile(this.workHistogram,this.frames,this.workMax,.95),workMax:this.workMax,
    playingWorkMean:this.playingFrames?this.playSum/this.playingFrames:0,playingWorkP95:this.percentile(this.playHistogram,this.playingFrames,this.playMax,.95),playingWorkMax:this.playMax,
    frameGapMean:this.frames?this.gapSum/this.frames:0,frameGapP95:this.percentile(this.gapHistogram,this.frames,this.gapMax,.95,2),frameGapMax:this.gapMax,
    playingFrameGapP95:this.percentile(this.playGapHistogram,this.playingFrames,this.playGapMax,.95,2),playingFrameGapMax:this.playGapMax,
    effectivePlayingFps:this.playingElapsedMs?this.playingFrames*1000/this.playingElapsedMs:0,
    playingGapsOver25ms:this.slowPlayingFrames,playingGapsOver25msRatio:this.playingFrames?this.slowPlayingFrames/this.playingFrames:0,
    workPercentileResolutionMs:.05,workOverflowThresholdMs:100,gapPercentileResolutionMs:.5,gapOverflowThresholdMs:1000,
    overflowPercentilePolicy:'If the percentile lands in an overflow bucket, report the observed maximum.',
    heapSamples:this.heapSamples.map(s=>({...s}))
  };}
}
