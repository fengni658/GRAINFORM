import {WIDTH,HEIGHT} from './board-geometry.mjs';
// Presentation-only surface reconstruction. Physical cells, identities and paths
// are untouched. A shared dual grid makes neighboring contour edges identical.
const W=WIDTH+2,H=HEIGHT+2,STRIDE=W*2;
const SEGMENTS=[[],[[0,3]],[[1,0]],[[1,3]],[[2,1]],[[0,3],[2,1]],[[2,0]],[[2,3]],[[3,2]],[[0,2]],[[1,0],[3,2]],[[1,2]],[[3,1]],[[0,1]],[[3,0]],[]];
export class MaterialContour {
 constructor(){this.field=new Float64Array(W*H);this.rounded=new Uint16Array(W*H);this.roundedBodies=Array(W*H);this.records=new Map();this.pending=new Set();this.previousMoving=new Set();this.links=new Map();this.points=new Map();this.shades=new Map();this.squares=new Map();this.preserved=new Map();this.result={loops:[],preserve:[]};this.metrics={rebuilds:0,vertices:0,preservedGrains:0,centerGuardGrains:0,lastUpdatedGrains:0,lastUpdatedSquares:0};}
 invalidate(patch){if(patch.reset){this.field.fill(0);this.rounded.fill(0);this.roundedBodies=[];this.records.clear();this.pending.clear();this.previousMoving.clear();this.links.clear();this.points.clear();this.shades.clear();this.squares.clear();this.preserved.clear();this.result={loops:[],preserve:[]};this.metrics.preservedGrains=0;this.metrics.centerGuardGrains=0;}for(const id of patch.removed)this.pending.add(id);for(const b of patch.upsert)this.pending.add(b.id);}
 update(bodies,positions){
  const candidates=this.pending;this.pending=new Set();for(const id of positions.keys())candidates.add(id);for(const id of this.previousMoving)candidates.add(id);this.previousMoving=new Set(positions.keys());
  const updates=[],dirtyNodes=new Set(),dirtyRounded=new Set(),oldRounded=new Map();
  for(const id of candidates){const body=bodies.get(id),old=this.records.get(id),p=positions.get(id),x=body?(p?p[0]:body.x):null,y=body?(p?p[1]:body.y):null;
   if(old&&old.x===x&&old.y===y&&old.color===body?.color)continue;
   let next=null;if(body){const gx=x+.5,gy=y+.5,ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy;if(ix>=0&&ix<W-1&&iy>=0&&iy<H-1){const k=iy*W+ix;next={id,x,y,color:body.color,rounded:Math.round(gy)*W+Math.round(gx),nodes:[],weights:[]};const q0=k,a0=(1-fx)*(1-fy),q1=k+1,a1=fx*(1-fy),q2=k+W,a2=(1-fx)*fy,q3=k+W+1,a3=fx*fy;if(a0){next.nodes.push(q0);next.weights.push(a0)}if(a1){next.nodes.push(q1);next.weights.push(a1)}if(a2){next.nodes.push(q2);next.weights.push(a2)}if(a3){next.nodes.push(q3);next.weights.push(a3)}}}
   updates.push([id,old,next]);
  }
  this.metrics.lastUpdatedGrains=updates.length;this.metrics.lastUpdatedSquares=0;if(!updates.length)return this.result;
  // Accumulate scalar deltas first. Uniform interior samples stay exactly one;
  // expensive ownership/color lookup is reserved for actual contour squares.
  for(const [id,old,next]of updates)if(old){for(let i=0;i<old.nodes.length;i++){const q=old.nodes[i];this.field[q]-=old.weights[i];dirtyNodes.add(q)}if(!next||old.rounded!==next.rounded){if(!oldRounded.has(old.rounded))oldRounded.set(old.rounded,this.rounded[old.rounded]);this.rounded[old.rounded]--;this.roundedBodies[old.rounded].delete(id);dirtyRounded.add(old.rounded)}this.records.delete(id)}
  for(const [id,old,next]of updates)if(next){this.records.set(id,next);for(let i=0;i<next.nodes.length;i++){const q=next.nodes[i];this.field[q]+=next.weights[i];dirtyNodes.add(q)}if(!old||old.rounded!==next.rounded){if(!oldRounded.has(next.rounded))oldRounded.set(next.rounded,this.rounded[next.rounded]);this.rounded[next.rounded]++;(this.roundedBodies[next.rounded]??=new Set()).add(id);dirtyRounded.add(next.rounded)}if(this.preserved.has(id))this.preserved.set(id,[id,next.x,next.y,this.preserved.get(id)[3]])}else this.preserved.delete(id);
  for(const q of dirtyRounded)if(oldRounded.get(q)===this.rounded[q])dirtyRounded.delete(q);
  const dirtySquares=new Set();for(const q of dirtyNodes){this.field[q]=Math.round(this.field[q]*1e9)/1e9;for(const k of [q,q-1,q-W,q-W-1])if(k>=0&&k<W*(H-1)&&k%W<W-1)dirtySquares.add(k)}
  // A protection decision now also depends on neighboring 2x2-supported
  // material. Revisit the two-cell halo when integer occupancy changes.
  // Seeded IDs are a subset of records. Full coverage makes the halo redundant.
  const inspect=new Set();for(const [id,old,next]of updates)if(next&&(!old||old.rounded!==next.rounded))inspect.add(id);if(inspect.size!==this.records.size)for(const q of dirtyRounded)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)for(const id of this.roundedBodies[q+dx+dy*W]??[])inspect.add(id);
  const coreCache=new Map();const isCore=q=>{if(coreCache.has(q))return coreCache.get(q);let supported=false;if(this.rounded[q])for(const dy of [-W,0])for(const dx of [-1,0]){if(supported)break;const p=q+dy+dx;if(this.rounded[p]&&this.rounded[p+1]&&this.rounded[p+W]&&this.rounded[p+W+1])supported=true}coreCache.set(q,supported);return supported};
  for(const id of inspect){const r=this.records.get(id);if(isCore(r.rounded))this.preserved.delete(id);else this.preserved.set(id,[id,r.x,r.y,0]);}
  const shadeCache=new Map();
  const shadeAt=q=>{if(shadeCache.has(q))return shadeCache.get(q);let color=0,max=-1,chosen=Infinity;const x=q%W-.5,y=Math.floor(q/W)-.5;for(const dy of [-W,0,W])for(const dx of [-1,0,1])for(const id of this.roundedBodies[q+dx+dy]??[]){const r=this.records.get(id),weight=Math.max(0,1-Math.abs(x-r.x))*Math.max(0,1-Math.abs(y-r.y));if(weight>max||(weight===max&&id<chosen)){max=weight;chosen=id;color=r.color}}shadeCache.set(q,color);return color};
  const crossing=(a,b)=>{const d=b-a;return d?Math.round(Math.max(0,Math.min(1,(.5-a)/d))*1e6)/1e6:.5};
  for(const k of dirtySquares){for(const key of this.squares.get(k)??[]){this.links.delete(key);this.points.delete(key);this.shades.delete(key)}this.squares.delete(k);}
  for(const k of dirtySquares){
   const x=k%W,y=Math.floor(k/W),a=this.field[k],b=this.field[k+1],c=this.field[k+W+1],d=this.field[k+W];
   const mask=(a>=.5-1e-10?1:0)|(b>=.5-1e-10?2:0)|(c>=.5-1e-10?4:0)|(d>=.5-1e-10?8:0),edges=SEGMENTS[mask];if(!edges.length)continue;
   const keys=[2*x+1+2*y*STRIDE,2*x+2+(2*y+1)*STRIDE,2*x+1+(2*y+2)*STRIDE,2*x+(2*y+1)*STRIDE];
   const xy=[[x+crossing(a,b)-.5,y-.5],[x+.5,y+crossing(b,c)-.5],[x+crossing(d,c)-.5,y+.5],[x-.5,y+crossing(a,d)-.5]];
   let shade=0,max=-1;for(const q of [k,k+1,k+W+1,k+W])if(this.field[q]>max){max=this.field[q];shade=shadeAt(q)}
   // Cases 5/10 stay disconnected. Never join diagonal-only material islands.
   const fromKeys=[];for(const [from,to]of edges){this.links.set(keys[from],keys[to]);this.points.set(keys[from],xy[from]);const mx=(xy[from][0]+xy[to][0])/2,my=(xy[from][1]+xy[to][1])/2;let nearest=Infinity,edgeColor=shade;for(const [q,px,py]of [[k,x-.5,y-.5],[k+1,x+.5,y-.5],[k+W+1,x+.5,y+.5],[k+W,x-.5,y+.5]])if(this.field[q]>=.5-1e-10){const distance=(px-mx)**2+(py-my)**2;if(distance<nearest){nearest=distance;edgeColor=shadeAt(q)}}this.shades.set(keys[from],edgeColor);fromKeys.push(keys[from])}this.squares.set(k,fromKeys);
  }
  const links=new Map(this.links),loops=[];
  for(const start of [...links.keys()].sort((a,b)=>a-b)){if(!links.has(start))continue;let key=start;const loop=[];do{const p=this.points.get(key);if(!p)throw Error('Missing material contour vertex');loop.push([...p,this.shades.get(key)]);const next=links.get(key);links.delete(key);if(next===undefined)throw Error('Open material contour');key=next;}while(key!==start);loops.push(loop)}
  // A two-segment neighborhood smooths outline geometry, not the image texture.
  const smooth=loops.map(loop=>{
   let area=0;for(let i=0;i<loop.length;i++){const p=loop[i],q=loop[(i+1)%loop.length];area+=p[0]*q[1]-q[0]*p[1]}
   if(area<0){loop.linear=true;return loop} // Preserve holes exactly; never close a one-cell void.
   if(loop.length<12)return loop;
   return loop.map((p,i)=>{const a=loop[(i+loop.length-2)%loop.length],b=loop[(i+loop.length-1)%loop.length],c=loop[(i+1)%loop.length],d=loop[(i+2)%loop.length];let dx=(a[0]+4*b[0]-10*p[0]+4*c[0]+d[0])/16,dy=(a[1]+4*b[1]-10*p[1]+4*c[1]+d[1])/16;const length=Math.hypot(dx,dy);if(length>.25){dx*=.25/length;dy*=.25/length}return[p[0]+dx,p[1]+dy,p[2]]});
  });
  // Tighten only an attached surface grain's exemption. Contact strength uses
  // actual presented centers, not rounded-cell attachment, so crossing a half
  // cell cannot abruptly switch a whole grain to a small patch. The half-cell
  // transition is the same support width used by the bilinear contour field.
  const preserve=[...this.preserved.values()].map(p=>{const r=this.records.get(p[0]),weights=[0,0,0,0];
   for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const q=r.rounded+dx+dy*W;if(!isCore(q))continue;for(const id of this.roundedBodies[q]??[]){const c=this.records.get(id),vx=c.x-r.x,vy=c.y-r.y,distance=Math.abs(vx)+Math.abs(vy),contact=Math.max(0,Math.min(1,(1.5-distance)*2));if(!contact||!distance)continue;const wx=contact*Math.abs(vx)/distance,wy=contact*Math.abs(vy)/distance;weights[vx<0?0:1]=Math.max(weights[vx<0?0:1],wx);weights[vy<0?2:3]=Math.max(weights[vy<0?2:3],wy);}}
   // Opposing support means a one-cell bridge: preserve its full glyph. Blending
   // the opposing strengths avoids a second binary bridge/protrusion threshold.
   const opposing=Math.max(Math.min(weights[0],weights[1]),Math.min(weights[2],weights[3]));p[3]=Math.max(0,Math.max(...weights)-opposing);return p;
  }).sort((a,b)=>a[0]-b[0]);
  this.result={loops:smooth,preserve};this.metrics.rebuilds++;this.metrics.vertices=smooth.reduce((n,l)=>n+l.length,0);this.metrics.preservedGrains=[...this.preserved.values()].filter(p=>!p[3]).length;this.metrics.centerGuardGrains=this.preserved.size-this.metrics.preservedGrains;this.metrics.lastUpdatedSquares=dirtySquares.size;return this.result;
 }
}
function vertex(context,loop,i){const p=loop[i],n=loop[(i+1)%loop.length];context.quadraticCurveTo(p[0],p[1],(p[0]+n[0])/2,(p[1]+n[1])/2)}
export function clipMaterialContour(context,{loops,preserve},styles){
 context.beginPath();for(const loop of loops){if(loop.linear){context.moveTo(loop[0][0],loop[0][1]);for(let i=1;i<loop.length;i++)context.lineTo(loop[i][0],loop[i][1]);context.closePath();continue}const a=loop.at(-1),b=loop[0];context.moveTo((a[0]+b[0])/2,(a[1]+b[1])/2);for(let i=0;i<loop.length;i++)vertex(context,loop,i);context.closePath()}
 // Use nonzero winding, with every preserved circle matching the clockwise outer
 // loops. It is a union, so overlapping preserved glyphs cannot punch even-odd holes.
 for(const [id,x,y,centerGuard]of preserve){const s=styles.get(id),strength=centerGuard||0,gx=x+s.dx*(1-strength),gy=y+s.dy*(1-strength),radius=s.radius*(1-strength)+.25*strength;context.moveTo(gx+radius,gy);context.arc(gx,gy,radius,0,Math.PI*2);context.closePath()}
 context.clip();
}
export function paintContourRim(context,{loops},resolveColor){
 const colors=new Set();for(const loop of loops)if(loop.length>=12&&!loop.linear)for(const p of loop)colors.add(p[2]);
 context.lineWidth=.7;context.lineCap='round';context.lineJoin='round';
 for(const color of [...colors].sort((a,b)=>a-b)){context.beginPath();for(const loop of loops)if(loop.length>=12&&!loop.linear)for(let i=0;i<loop.length;i++){if(loop[i][2]!==color)continue;const a=loop[(i+loop.length-1)%loop.length],b=loop[i];context.moveTo((a[0]+b[0])/2,(a[1]+b[1])/2);vertex(context,loop,i)}context.strokeStyle=resolveColor(color);context.stroke()}
}
