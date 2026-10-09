import {CALayerRenderer as FrozenRenderer} from './reference/ca-layer.mjs';
import {CALayerRenderer as CandidateRenderer} from '../ca-layer.mjs';
import {rendererFixtures,sampleFrames} from './render-fixtures.mjs';
const PALETTES={standard:['','#eac370','#4fc0b3','#d378a3','#789fef'],contrast:['','#ffe07a','#4df0b0','#fc87b5','#71a7ff']};
function make(Renderer,rawCells,fallback,createCanvas){const canvas=createCanvas();return{canvas,context:canvas.getContext('2d',{alpha:false}),renderer:new Renderer({rawCells,resolveColor:c=>PALETTES[state.palette][c],createCanvas:()=>fallback?{getContext:()=>null}:createCanvas()})};}
let state;
function paint(target,operation){
 const {canvas,context:c,renderer}=target,width=state.width,height=Math.round(width*432/288);
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 renderer.synchronize(state.queue,sampleFrames(state.queue,operation.alpha??0));renderer.configure(width,height,state.palette);
 c.setTransform(width/288,0,0,height/432,0,0);c.fillStyle='#0d1315';c.fillRect(0,0,288,432);
 c.save();c.beginPath();c.rect(28,0,232,420);c.clip();renderer.draw(c);
 if(operation.highlight){c.globalAlpha=operation.highlightAlpha;c.fillStyle='#fffce8';renderer.drawSelection(c,operation.highlight);c.globalAlpha=1;}
 c.restore();
}
function compare(a,b){
 if(a.width!==b.width||a.height!==b.height)return{equal:false,dimensionMismatch:true};
 const left=a.getContext('2d').getImageData(0,0,a.width,a.height).data,right=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
 let channelDifferences=0,pixelDifferences=0,maxChannelDifference=0,x0=a.width,y0=a.height,x1=-1,y1=-1;
 for(let i=0;i<left.length;i+=4){let differs=false;for(let channel=0;channel<4;channel++){const d=Math.abs(left[i+channel]-right[i+channel]);if(d){differs=true;channelDifferences++;maxChannelDifference=Math.max(maxChannelDifference,d);}}if(differs){pixelDifferences++;const pixel=i/4,x=pixel%a.width,y=Math.floor(pixel/a.width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
 return{equal:channelDifferences===0,pixelDifferences,channelDifferences,maxChannelDifference,bounds:pixelDifferences?{x0,y0,x1,y1}:null};
}
export async function runPixelEquivalence({backend="browser Canvas2D",createCanvas=()=>document.createElement("canvas")}={}){
 const results=[];
 for(const fallback of [false,true])for(const rawCells of [false,true])for(const fixture of rendererFixtures()){
  state={width:576,palette:'standard',queue:[]};const reference=make(FrozenRenderer,rawCells,fallback,createCanvas),candidate=make(CandidateRenderer,rawCells,fallback,createCanvas);
  for(const op of fixture.operations){
   if(op.width)state.width=op.width;if(op.palette)state.palette=op.palette;
   if(op.queue){state.queue=structuredClone(op.queue);for(const t of [reference,candidate])t.renderer.synchronize(state.queue,sampleFrames(state.queue,0));}
   if(op.patch)for(const t of [reference,candidate])t.renderer.apply(structuredClone(op.patch));
   if(!op.draw)continue;
   paint(reference,op);paint(candidate,op);
   const screen=compare(reference.canvas,candidate.canvas),cache=!fallback?compare(reference.renderer.canvas,candidate.renderer.canvas):null;
   results.push({fixture:fixture.name,draw:op.draw,rawCells,fallback,width:state.width,palette:state.palette,screen,cache,equal:screen.equal&&(cache?.equal??true)});
   if(!results.at(-1).equal&&typeof document!=='undefined'){document.body.append(reference.canvas,candidate.canvas);}
  }
 }
 const report={passed:results.every(r=>r.equal),comparison:`exact RGBA bytes in ${backend}; no tolerance`,baseline:'tests/reference/ca-layer.mjs SHA256 66dfa582e1c3f7ee2a567f67984b0e04e78344ba76e32a675ef91eadf4b63e2d',candidateStatus:'Authorized stable dirty-tile cache only; material and dynamic paths unchanged',drawComparisons:results.length,failures:results.filter(r=>!r.equal),results};
 if(typeof window!=='undefined')window.pixelEquivalence=report;if(typeof document!=='undefined')document.getElementById('result').textContent=JSON.stringify(report,null,2);return report;
}
if(typeof window!=='undefined'){window.runPixelEquivalence=runPixelEquivalence;if(new URLSearchParams(location.search).has('run'))window.pixelEquivalencePromise=runPixelEquivalence();}
