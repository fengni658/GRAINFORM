// Selection is O(1). Histograms are incremented by SessionMetrics, never rebuilt.
// Live text is intentionally small; retained detailed records are exported off the playing path.
export const DIAGNOSTIC_REFRESH_MS=10000;
export function diagnosticMode(search){const p=new URLSearchParams(search);return p.has('qa')?'profile':p.has('summary')?'summary':'off';}
export class DiagnosticOutput {
  constructor(mode){this.mode=mode;this.lastAt=-Infinity;this.lastState='';this.lastKind='';}
  next(now,state,wasPlaying){
    if(this.mode==='off')return null;
    const kind=this.mode==='profile'&&state!=='playing'&&!wasPlaying?'full':'summary';
    if(now-this.lastAt<DIAGNOSTIC_REFRESH_MS&&state===this.lastState&&kind===this.lastKind)return null;
    this.lastAt=now;this.lastState=state;this.lastKind=kind;return kind;
  }
}
export function compactSession(metrics,now){
  return{elapsedMs:Math.max(0,now-metrics.start),frames:metrics.frames,playingFrames:metrics.playingFrames,playingElapsedMs:metrics.playingElapsedMs,
    playingWorkMean:metrics.playingFrames?metrics.playSum/metrics.playingFrames:0,
    playingWorkP95:metrics.percentile(metrics.playHistogram,metrics.playingFrames,metrics.playMax,.95),playingWorkMax:metrics.playMax,
    playingFrameGapP95:metrics.percentile(metrics.playGapHistogram,metrics.playingFrames,metrics.playGapMax,.95,2),playingFrameGapMax:metrics.playGapMax,
    effectivePlayingFps:metrics.playingElapsedMs?metrics.playingFrames*1000/metrics.playingElapsedMs:0,
    playingGapsOver25ms:metrics.slowPlayingFrames,playingGapsOver25msRatio:metrics.playingFrames?metrics.slowPlayingFrames/metrics.playingFrames:0,
    workPercentileResolutionMs:.05,gapPercentileResolutionMs:.5};
}
