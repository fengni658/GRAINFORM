import {materialStyle, positionOnPath} from './reference/ca-layer.mjs';
const body=(id,x,y,color=1)=>({id,x,y,color,sleep:true});
const patch=(upsert=[],removed=[],reset=false)=>({upsert,removed,reset});
const path=(id,x,y)=>({id,points:[x,y,0,x,y+1,1,x+1,y+1,10,x+1,y+2,11]});
const frame=(token,paths)=>({token,ruleTick:token*4,phases:68,paths});
function pick(start, predicate){for(let id=start;id<start+10000;id++)if(predicate(materialStyle(id)))return id;throw Error('No matching deterministic style');}
const a=pick(1,s=>s.radius+s.dx>.6&&s.radius+s.dy>.6);
const b=pick(a+1,s=>s.radius-s.dx>.6&&s.radius+s.dy>.6);
const c=pick(b+1,s=>s.radius+s.dx>.6&&s.radius-s.dy>.6);
const d=pick(c+1,s=>s.radius-s.dx>.6&&s.radius-s.dy>.6);
export const crossingIds={a,b,c,d};
export function sampleFrames(queue,alpha=0){const first=queue[0];return first?{frame:first,alpha,positions:first.paths.map(p=>({id:p.id,xy:positionOnPath(p,alpha)}))}:null;}
export function rendererFixtures(){
 const corner=[body(a,31.5,31.5,1),body(b,32.5,31.5,2),body(c,31.5,32.5,3),body(d,32.5,32.5,4)];
 const f1=frame(1,[path(b,32.5,31.5),path(a,31.5,31.5)]),f2=frame(2,[path(a,32.5,33.5),path(d,32.5,32.5)]);
 return [
  {name:'tile-edge-corner-order-mutations',operations:[
   {patch:patch(corner,[],true),queue:[]},{draw:'initial-corner-overlap'},
   {patch:patch([body(a,31.5,31.5,4)])},{draw:'recolor-oldest-overlapping-grain'},
   {patch:patch([],[b])},{draw:'remove-neighbor-across-edge'},
   {patch:patch([body(b,32.5,31.5,2)])},{draw:'reinsert-changes-map-order'},
   {patch:patch([body(c,47.5,47.5,3)])},{patch:patch([body(d,48.5,47.5,4)])},{draw:'two-patches-before-draw'},
   {patch:patch([],[a,d])},{draw:'delete-old-and-new-footprints'},
  ]},
  {name:'queued-moving-membership-and-overlap',operations:[
   {patch:patch(corner,[],true),queue:[]},{draw:'initial-static'},
   {queue:[f1,f2],patch:patch([body(b,33.5,33.5,2),body(a,33.5,35.5,1),body(d,33.5,34.5,4)])},
   ...[0,.5/68,9.5/68,10.5/68,1].map(alpha=>({draw:`first-path-${alpha}`,alpha})),
   {queue:[f2]},{draw:'first-done-shared-id-still-moving',alpha:0},
   {draw:'second-midphase',alpha:9.5/68},{draw:'second-endpoint',alpha:1},
   {queue:[]},{draw:'dynamic-becomes-static-in-original-map-order'},
   {draw:'unchanged-idle-cache'},
  ]},
  {name:'dense-13824-bed-local-transitions',operations:[
   {patch:patch(Array.from({length:13824},(_,id)=>body(id,28.5+id%232,419.5-Math.floor(id/232),1+id%4)),[],true),queue:[]},{draw:'dense-initial-real-browser-324x486',width:324},
   {queue:[frame(1,[path(0,28.5,419.5)])]},{draw:'dense-one-moving',alpha:0},
   {queue:[frame(1,[path(0,28.5,419.5),path(1,29.5,419.5)])]},{draw:'dense-two-moving',alpha:.5/68},
   {queue:[]},{draw:'dense-back-to-stable'},
   {patch:patch([],[0,1,231,232])},{draw:'dense-edge-removals'},
  ]},
  {name:'generation-reuse-and-fullsync-order',operations:[
   {patch:patch(corner,[],true),queue:[]},{draw:'original-map-order'},
   {patch:patch([],[a])},{patch:patch([body(a+0x100000,31.5,31.5,4)])},{draw:'new-generation-handle-reuses-position'},
   {patch:patch([body(a+0x100000,31.5,31.5,4),corner[3],corner[2],corner[1]],[],true)},{draw:'fullsync-new-map-order'},
   {patch:patch([body(c,31.5,32.5,2)])},{draw:'recolor-after-fullsync-rank-reset'},
  ]},
  {name:'board-clipping-palette-resize-highlight',operations:[
   {patch:patch([body(a+100000,28.5,.5,1),body(b+100000,259.5,.5,2),body(c+100000,28.5,419.5,3),body(d+100000,259.5,419.5,4),...corner],[],true),queue:[]},
   {draw:'board-boundary',width:288},{draw:'nonintegral-scale',width:337},
   {patch:patch([body(a,31.5,31.5,4)])},{draw:'partial-repaint-at-nonintegral-scale'},
   {draw:'highlight-translucent',highlight:[a,b,c,d],highlightAlpha:.35},
   {draw:'contrast-palette',palette:'contrast',highlight:[d,c,b,a],highlightAlpha:.8},
   {draw:'actual-browser-scale',width:324},{patch:patch([body(b,32.5,31.5,3)])},{draw:'actual-browser-local-recolor'},{draw:'device-scale-two',width:576},{draw:'device-scale-three',width:864},
   {patch:patch([],[],true),queue:[]},{draw:'empty-reset'},
  ]},
 ];
}
