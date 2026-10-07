export const STEP_MS=1000/60,SIMULATION_BUDGET_MS=6;
// A deadline controls chunk grouping only. All elapsed active time and logical steps are retained.
export class SimulationBudget{
 constructor({budgetMs=SIMULATION_BUDGET_MS,maxSteps=6,clock=()=>performance.now()}={}){this.budgetMs=budgetMs;this.maxSteps=maxSteps;this.clock=clock;this.sessionMaxDebtMs=0;this.sessionMaxChunkMs=0;this.cancelledByResetMs=0;this.reset();}
 reset(){
  this.cancelledByResetMs+=this.debtMs||0;this.generation=null;
  this.debtMs=0;this.activeElapsedMs=0;this.completedSteps=0;this.maxDebtMs=0;
  this.pendingStartedAt=null;this.pendingActiveAt=0;this.lastCompletedActiveMs=0;
  this.maxStepActiveMs=0;this.lastCompletedAt=this.clock();this.maxStepLatencyMs=0;
  this.yieldedFrames=0;this.totalChunks=0;this.maxChunkMs=0;this.lastChunks=0;
 }
 run(game,gap,{beforeStep=()=>({}),onChunk=()=>{},afterStep=()=>{}}={}){
  if(game.state!=='playing')return{steps:0,chunks:0};
  if(this.generation!==game.generation){if(this.generation!==null)this.reset();this.generation=game.generation;}
  if(Number.isFinite(gap)&&gap>0){this.debtMs+=gap;this.activeElapsedMs+=gap;}
  this.maxDebtMs=Math.max(this.maxDebtMs,this.debtMs);this.sessionMaxDebtMs=Math.max(this.sessionMaxDebtMs,this.debtMs);
  const start=this.clock();let steps=0,chunks=0;
  while(game.state==='playing'&&(game.stepPending||this.debtMs+1e-7>=STEP_MS)&&steps<this.maxSteps){
   if(chunks&&this.clock()-start>=this.budgetMs)break;
   if(!game.stepPending){const options=beforeStep();if(game.state!=='playing')break;game.beginStep(options);this.pendingStartedAt=this.clock();this.pendingActiveAt=this.activeElapsedMs;}
   const at=this.clock(),done=game.advanceStep(),duration=this.clock()-at;this.maxChunkMs=Math.max(this.maxChunkMs,duration);this.sessionMaxChunkMs=Math.max(this.sessionMaxChunkMs,duration);chunks++;onChunk();
   if(done){this.debtMs=Math.max(0,this.debtMs-STEP_MS);this.completedSteps++;steps++;afterStep();this.lastCompletedAt=this.clock();this.lastCompletedActiveMs=this.activeElapsedMs;this.maxStepActiveMs=Math.max(this.maxStepActiveMs,this.activeElapsedMs-this.pendingActiveAt);this.maxStepLatencyMs=Math.max(this.maxStepLatencyMs,this.lastCompletedAt-this.pendingStartedAt);this.pendingStartedAt=null;}
  }
  this.totalChunks+=chunks;this.lastChunks=chunks;
  if(game.state==='playing'&&(game.stepPending||this.debtMs+1e-7>=STEP_MS))this.yieldedFrames++;
  return{steps,chunks};
 }
 snapshot(game){return{schema:'retained-simulation-debt-v1',budgetMs:this.budgetMs,budgetScope:'Cooperative checks between fixed eight-row physics chunks; atomic input/clear/search work and host scheduling can overrun. Not a hard callback deadline.',activeElapsedMs:this.activeElapsedMs,simulatedMs:this.completedSteps*STEP_MS,completedSteps:this.completedSteps,debtMs:this.debtMs,maxDebtMs:this.maxDebtMs,pendingStep:!!game?.stepPending,yieldedFrames:this.yieldedFrames,totalChunks:this.totalChunks,lastChunks:this.lastChunks,maxChunkMs:this.maxChunkMs,sessionMaxDebtMs:this.sessionMaxDebtMs,sessionMaxChunkMs:this.sessionMaxChunkMs,cancelledByResetMs:this.cancelledByResetMs,pendingStepWallMs:game?.stepPending&&this.pendingStartedAt!==null?Math.max(0,this.clock()-this.pendingStartedAt):0,maxStepLatencyMs:this.maxStepLatencyMs,completedStateAgeMs:game?.stepPending&&game.state==='playing'?Math.max(0,this.clock()-this.lastCompletedAt):0,completedStateActiveAgeMs:game?.stepPending?Math.max(0,this.activeElapsedMs-this.lastCompletedActiveMs):0,maxStepActiveMs:this.maxStepActiveMs};}
}
// Rendering reads only a completed board, including while paused inside a work unit sequence.
export class CommittedView{
 constructor(game){this.game=game;this.view=Object.create(Object.getPrototypeOf(game));this.view.grid=new Uint8Array(game.size);this.view.material=new Uint8Array(game.size);this.view.clearMask=new Uint8Array(game.size);this.revision=-1;this.generation=-1;this.capture(true);}
 capture(force=false){const g=this.game,v=this.view;
  if(!g.stepPending){
   if(force||this.revision!==g.gridVersion||this.generation!==g.generation){v.grid.set(g.grid);v.material.set(g.material);this.revision=g.gridVersion;this.generation=g.generation;v.ghostCache=null;}
   if(force||!!v.clearTimer!==!!g.clearTimer)v.clearMask.set(g.clearMask);v.gridVersion=g.gridVersion;v.tick=g.tick;v.clearTimer=g.clearTimer;
   v.width=g.width;v.height=g.height;v.size=g.size;v.seed=g.seed;v.active=g.active?{...g.active}:null;
  }
  v.state=g.state;return v;
 }
}
