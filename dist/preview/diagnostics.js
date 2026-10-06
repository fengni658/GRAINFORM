// Candidate-only, bounded, local diagnostics. No storage or network transmission.
const STAGES=['inputRepeat','simulation','events','hud','render','diagnostics'];
const RENDER_STAGES=['pixelBuild','pixelUpload','boardComposite','ghost','spriteBuild','spriteComposite'];
class Distribution{
  constructor(){this.hist=new Uint32Array(2001);this.count=0;this.sum=0;this.max=0;}
  add(ms){ms=Math.max(0,ms);this.hist[Math.min(2000,Math.floor(ms*20))]++;this.count++;this.sum+=ms;this.max=Math.max(this.max,ms);}
  read(){let total=0,p95=0;for(let i=0;i<this.hist.length;i++){total+=this.hist[i];if(total>=Math.ceil(this.count*.95)){p95=i===2000?this.max:(i+1)/20;break;}}return{count:this.count,meanMs:this.count?this.sum/this.count:0,p95Ms:this.count?p95:0,maxMs:this.max};}
}
function keepTop(list,item,key,limit=6){list.push(item);list.sort((a,b)=>b[key]-a[key]);if(list.length>limit)list.length=limit;}
export class FrameDiagnostics{
  constructor({clock=()=>performance.now()}={}){
    this.clock=clock;this.stages=Object.fromEntries(STAGES.map(s=>[s,new Distribution()]));this.engine=Object.fromEntries(['sandStep','findConnections','finishClear','lock'].map(s=>[s,new Distribution()]));
    this.renderer=Object.fromEntries(RENDER_STAGES.map(s=>[s,new Distribution()]));this.renderFrame=null;this.presentedFrames=0;this.reusedFrames=0;
    this.engineFrame={};this.input=new Distribution();this.inputSinceFrame=0;this.inputCallsSinceFrame=0;this.inputMaxSinceFrame=0;this.inputTop=[];
    this.topWork=[];this.topGaps=[];this.previousFrame=null;this.longTasks=[];this.longTaskCount=0;this.longTaskMax=0;this.longAnimationFrames=[];this.loafCount=0;
    this.observerSupport={longtask:false,'long-animation-frame':false};this.observers=[];
  }
  instrument(game){
    for(const key of Object.keys(this.engine)){const method=game[key],self=this;game[key]=function(...args){const at=self.clock();try{return method.apply(this,args);}finally{const ms=self.clock()-at;self.engine[key].add(ms);self.engineFrame[key]=(self.engineFrame[key]||0)+ms;}};}
  }
  observe(Observer=globalThis.PerformanceObserver){
    if(!Observer)return;
    for(const type of Object.keys(this.observerSupport)){
      if(!Observer.supportedEntryTypes?.includes(type))continue;
      try{const observer=new Observer(list=>{for(const e of list.getEntries()){
        if(type==='longtask'){this.longTaskCount++;this.longTaskMax=Math.max(this.longTaskMax,e.duration);keepTop(this.longTasks,{atMs:e.startTime,durationMs:e.duration,name:e.name},'durationMs');}
        else{this.loafCount++;keepTop(this.longAnimationFrames,{atMs:e.startTime,durationMs:e.duration,blockingDurationMs:e.blockingDuration,renderStartMs:e.renderStart,styleAndLayoutStartMs:e.styleAndLayoutStart,scripts:[...(e.scripts||[])].sort((a,b)=>b.duration-a.duration).slice(0,3).map(s=>({durationMs:s.duration,source:s.sourceURL,function:s.sourceFunctionName,invoker:s.invoker,forcedStyleAndLayoutMs:s.forcedStyleAndLayoutDuration}))},'durationMs');}
      }});observer.observe({type,buffered:true});this.observerSupport[type]=true;this.observers.push(observer);}catch{}
    }
  }
  rendered(phases,reused,playing){if(!playing)return;reused?this.reusedFrames++:this.presentedFrames++;for(const key of RENDER_STAGES)this.renderer[key].add(phases?.[key]||0);this.renderFrame={reused,phases};}
  inputAction(name,at,ms){this.input.add(ms);this.inputSinceFrame+=ms;this.inputCallsSinceFrame++;this.inputMaxSinceFrame=Math.max(this.inputMaxSinceFrame,ms);keepTop(this.inputTop,{name,atMs:at,durationMs:ms},'durationMs');}
  recordFrame({frameId,now,begin,gap,work,playing,steps,phases}){
    if(playing){for(const key of STAGES)this.stages[key].add(phases[key]||0);
      const highWork=this.topWork.length<6||work>this.topWork.at(-1).workMs,highGap=this.topGaps.length<6||gap>this.topGaps.at(-1).gapMs;
      if(highWork||highGap){const entry={frameId,atMs:now,gapMs:gap,workMs:work,rafCallbackDelayMs:Math.max(0,begin-now),steps,phases,render:this.renderFrame,engine:this.engineFrame,inputSincePreviousFrame:{count:this.inputCallsSinceFrame,totalMs:this.inputSinceFrame,maxMs:this.inputMaxSinceFrame},previousFrame:this.previousFrame};
        if(highWork)keepTop(this.topWork,entry,'workMs');if(highGap)keepTop(this.topGaps,entry,'gapMs');}

    }
    // The arriving rAF gap follows the previous callback, not this frame's simulation.
    this.previousFrame={frameId,atMs:now,workMs:work,playing,steps,phases,engine:this.engineFrame,render:this.renderFrame,inputCount:this.inputCallsSinceFrame,inputTotalMs:this.inputSinceFrame,inputMaxMs:this.inputMaxSinceFrame};
    this.engineFrame={};this.renderFrame=null;this.inputSinceFrame=0;this.inputCallsSinceFrame=0;this.inputMaxSinceFrame=0;
  }
  snapshot(){return{
    scope:'Frame stage distributions are playing-only. Input and nested engine methods cover the complete session. Legacy core work includes QA output generation but ends before statistics/ring/scheduling tail. The separate callback metric includes that tail and its own measured prelude; browser observer entries are independent. All times use performance time origin. GPU presentation is not measured.',
    phases:Object.fromEntries(Object.entries(this.stages).map(([k,v])=>[k,v.read()])),nestedEngineMethods:Object.fromEntries(Object.entries(this.engine).map(([k,v])=>[k,v.read()])),
    renderer:{presentedFrames:this.presentedFrames,reusedFrames:this.reusedFrames,phases:Object.fromEntries(Object.entries(this.renderer).map(([k,v])=>[k,v.read()]))},
    inputActions:{...this.input.read(),slowest:this.inputTop},slowestWorkFrames:this.topWork,longestFrameGaps:this.topGaps,
    browserObservers:{supported:this.observerSupport,longTaskCount:this.longTaskCount,longTaskMaxMs:this.longTaskMax,longestTasks:this.longTasks,longAnimationFrameCount:this.loafCount,longestAnimationFrames:this.longAnimationFrames}
  };}
}
