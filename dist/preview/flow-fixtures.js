import{Game as Before,SHAPES}from'./reference-0.3-engine.js';
import{Game as After}from'./engine.js';
export const FLOW_SEED=930241;
export const FLOW_SCENES={
 pour:{name:'连续注沙',seconds:14,description:'前6秒从同一12格开口持续加入同样的沙粒，之后停料。观察流束与堆面接触、侧缘滑落和收稳。'},
 slope:{name:'顺坡流动',seconds:16,description:'同一初始斜坡，在同一位置同时释放T形沙块。观察新沙沿已有沙堆表面迁移；不混入刚体移动或落点差异。'},
 avalanche:{name:'局部边缘塌落',seconds:14,description:'第2秒移除右半侧的人工支撑台，左半仍保留。观察局部边缘逐步滑落；支撑台是此物理夹具的可见辅助线。'},
 settle:{name:'落地与静止',seconds:14,description:'同一O形块在地面释放。观察短暂松散、坡面形成及停止后的稳定性，不添加持续抖动。'},
 collapse:{name:'消除后塌落',seconds:14,description:'第2秒按真实消除流程清除横贯两壁的紫色底层。自由下落阶段允许共同加速，重点观察接触地面后的压实与边缘运动。'}
};
function add(g,x,y,c,m=42,vy=0){const i=y*g.width+x;if(g.grid[i])throw Error('Fixture injection overlaps a grain');g.grid[i]=c;g.material[i]=m;g.vy[i]=vy;g.added++;g.surface[x]=Math.min(g.surface[x],y);g.wakeChunk(x,y,true,g.activeChunks);}
function fill(g,key){const w=g.width,h=g.height;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let c=0;
  if(key==='slope'&&x>=18&&x<270){const top=270+Math.floor(Math.abs(x-90)*.53);if(y>=top)c=2;}
  if(key==='avalanche'&&x>=78&&x<210&&y>=276+Math.floor(Math.abs(x-144)*.35)&&y<330)c=Math.floor((330-y)/9)%2+1;
  if(key==='collapse'){if(y>=402)c=3;else if(x>=48&&x<240&&y>=402-Math.max(0,90-Math.abs(x-144)*.7))c=Math.floor((402-y)/14)%2+1;}
  if(c)add(g,x,y,c,g.materialFor(x,y,4781));
 }
 if(key==='avalanche')for(let y=330;y<333;y++)for(let x=60;x<228;x++)g.rigid[y*w+x]=1;
 g.wakeAll();
}
export function makeFlowComparison(key='pour'){
 const spec=FLOW_SCENES[key];if(!spec)throw Error('Unknown flow fixture');const before=new Before({seed:FLOW_SEED}),after=new After({seed:FLOW_SEED});
 for(const g of[before,after]){g.state='playing';g.active=null;g.spawnDelay=1e9;g.connectionEnabled=false;fill(g,key);
  if(key==='settle'){g.active={shape:SHAPES[0].map(p=>p.slice()),color:1,x:120,y:384,materialSeed:412};g.lock();g.spawnDelay=1e9;}
  if(key==='slope'){g.active={shape:SHAPES[2].map(p=>p.slice()),color:1,x:60,y:174,materialSeed:412};g.lock();g.spawnDelay=1e9;}
 }
 return {key,spec,before,after,tick:0,finished:false,addedByEmitter:0};
}
export function stepFlowComparison(p){
 if(p.finished)return;p.tick++;
 for(const g of[p.before,p.after]){
  if(p.key==='pour'&&p.tick<=360&&p.tick%2===0){for(let y=26;y<28;y++)for(let x=138;x<150;x++)add(g,x,y,1,1+((x*17+y*13+p.tick*7)%255),32);g.gridVersion++;}
  if(p.key==='avalanche'&&p.tick===120){for(let y=330;y<333;y++)for(let x=144;x<228;x++)g.rigid[y*g.width+x]=0;g.wakeAll();}
  if(p.key==='collapse'&&p.tick===120)g.beginClear();
  g.step();if(g.pieces)g.spawnDelay=1e9;g.consumeEvents();
 }
 if(p.key==='pour'&&p.tick<=360&&p.tick%2===0)p.addedByEmitter+=24;
 if(p.tick>=p.spec.seconds*60)p.finished=true;
}
function state(g){let active=0,edge=0;const w=g.width,h=g.height;for(let i=0;i<g.size;i++)if(g.grid[i]){if(g.sleep[i]<14)active++;const x=i%w,y=(i/w)|0;if(x===0||x===w-1||y===0||y===h-1||!g.grid[i-1]||!g.grid[i+1]||!g.grid[i-w]||!g.grid[i+w])edge++;}
 const grains=g.count();return {grains,added:g.added,removed:g.removed,conserved:grains===g.added-g.removed,activeGrains:active,edgeGrains:edge,activeChunks:g.activeChunkCount,score:g.score,rawCleared:g.rawCleared};}
export function flowState(p){return {scene:p.key,seed:FLOW_SEED,seconds:p.tick/60,tick:p.tick,finished:p.finished,physicalGrid:[288,432],equalEmitterCount:p.addedByEmitter,schedule:'GF-FLOW-04 fixed cell coordinates, colors, material IDs and event ticks; no pre-roll',initialState:'Same geometry/material; release velocity and energy follow each version intentionally',before:state(p.before),after:state(p.after)};}
