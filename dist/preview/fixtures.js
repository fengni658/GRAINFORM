import{Game as Baseline,RNG,SHAPES}from'./baseline-engine.js';
import{Game as Fine,SLEEP_STEPS,PHYSICS_SUBSTEPS}from'./engine.js';
export const SEQUENCE=[{shape:0,color:1},{shape:2,color:1},{shape:3,color:2},{shape:1,color:3},{shape:5,color:1},{shape:4,color:2},{shape:6,color:3}];
export const SCENES={
  landing:{name:'空地落地与散开',duration:13,description:'相同O形块、同一归一落点。观察触地后0.1–0.8秒的展开，以及其后的收稳。',piece:0,x:40,y:104,inputs:[]},
  slope:{name:'斜坡表层滚落',duration:13,description:'相同初始斜坡、形色序列及输入时刻。观察金色沙粒是否真正沿坡滚落。',piece:1,x:24,y:50,inputs:[{tick:18,action:'rotate'},{tick:36,action:'move',dx:4}]},
  collapse:{name:'消除抽底与塌落',duration:13,description:'相同分层沙堆。第2秒同时触发底层消除；观察逐层下落、局部滑坡与最终收稳。',piece:null,inputs:[]}
};
function setSequence(g,first){let cursor=first+1;const make=n=>{const spec=SEQUENCE[n%SEQUENCE.length];return {shape:SHAPES[spec.shape].map(p=>p.slice()),color:spec.color,materialSeed:(0x842137+Math.imul(n+1,2654435761))>>>0};};g.randomPiece=()=>make(cursor++);g.next=make(first);g.sequenceCursor=()=>cursor;}
function initialCell(x,y,scene){
  if(scene==='slope'&&x>=10&&x<91){const top=Math.floor(83+(x<30?(30-x)*1.4:(x-30)*.65));return y>=top?2:0;}
  if(scene==='collapse'){
    if(y>=124)return 3;
    const height=Math.max(0,44-Math.abs(x-48)*.8);if(y>=124-height&&y<124)return Math.floor((124-y)/5)%2+1;
  }return 0;
}
function fillInitial(g,scale,scene){
  for(let y=0;y<144;y++)for(let x=0;x<96;x++){
    const c=initialCell(x,y,scene);if(!c)continue;
    for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++){
      const px=x*scale+sx,py=y*scale+sy,i=py*g.width+px;g.grid[i]=c;g.added++;
      if(scale===3){g.material[i]=g.materialFor(px,py,4781);g.sleep[i]=0;}
    }
  }
  g.dirty=false;if(scale===3){g.wakeAll();}
}
export function makeComparison(sceneKey='landing'){
  const spec=SCENES[sceneKey],baseline=new Baseline({seed:930241}),fine=new Fine({seed:930241});
  for(const [g,scale]of [[baseline,1],[fine,3]]){
    setSequence(g,spec.piece??0);fillInitial(g,scale,sceneKey);g.connectionEnabled=false;
    if(scale===1)g.beginClear=()=>{g.dirty=false;};
    if(spec.piece!==null){g.start();g.active.x=spec.x*scale;g.active.y=spec.y*scale;g.fall=0;}
    else{g.state='playing';g.active=null;g.spawnDelay=1e9;}
  }
  return {baseline,fine,spec,sceneKey,tick:0,finished:false,landTicks:{baseline:null,fine:null},measurements:[]};
}
function clearBase(g){
  let count=0;for(let i=0;i<g.size;i++)if(g.grid[i]===3){g.clearCells[count++]=i;g.clearMask[i]=1;}
  g.clearCount=count;g.clearRegions=1;g.chain=1;g.clearTimer=12;
}
function metrics(g,scale){
  let left=g.width,right=-1,top=g.height,moving=0;for(let i=0;i<g.size;i++)if(g.grid[i]===1){const x=i%g.width,y=(i/g.width)|0;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);if(scale===3&&g.sleep[i]<SLEEP_STEPS)moving++;}
  return {rawGrains:g.count(),normalizedGrains:g.count()/(scale*scale),conserved:g.count()===g.added-g.removed,markedWidth:right<left?0:(right-left+1)/scale,markedTop:top/scale,activeGrains:moving,activeChunks:g.activeChunkCount??null};
}
export function tickComparison(pair){
  pair.tick++;for(const [g,scale,name]of [[pair.baseline,1,'baseline'],[pair.fine,3,'fine']]){
    for(const input of pair.spec.inputs)if(input.tick===pair.tick){if(input.action==='rotate')g.rotate();else if(input.action==='move')g.move(input.dx*scale);}
    if(pair.sceneKey==='collapse'&&pair.tick===120)clearBase(g);
    g.step();if(g.pieces>=1){g.spawnDelay=1e9;if(pair.landTicks[name]===null)pair.landTicks[name]=pair.tick;}
    g.consumeEvents();
  }
  if(pair.tick%6===0)pair.measurements.push({seconds:pair.tick/60,baseline:metrics(pair.baseline,1),fine:metrics(pair.fine,3)});
  if(pair.tick>=pair.spec.duration*60)pair.finished=true;
}
export function comparisonState(pair){return {scene:pair.sceneKey,seconds:pair.tick/60,sequenceId:'GF-AB-01',initialActivity:'both fully awake at t=0, zero initial velocity; no pre-roll',world: '96×144 normalized units',linearScale:3,particleAreaScale:9,physicsSubstepsPerGameTick:PHYSICS_SUBSTEPS,inputSchedule:pair.spec.inputs,landSeconds:{baseline:pair.landTicks.baseline===null?null:pair.landTicks.baseline/60,fine:pair.landTicks.fine===null?null:pair.landTicks.fine/60},baseline:metrics(pair.baseline,1),fine:metrics(pair.fine,3),finished:pair.finished};}
