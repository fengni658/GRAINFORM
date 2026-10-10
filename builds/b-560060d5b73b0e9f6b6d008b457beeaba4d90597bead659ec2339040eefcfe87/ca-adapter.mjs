import {LEFT,FIELD_WIDTH,FIELD_HEIGHT} from './board-geometry.mjs';
import {FrameWorld} from './ca-frame-world.mjs';
export const DT=1/60,R=.5,D=1;
export class CAWorld extends FrameWorld{
 constructor(){super();this.cache=new Map();this.changedBodies=new Map();this.removedBodies=new Set();this.revision=0;this.consumedRevision=0;this.sentFrame=0;this.maxParticles=this.live.length;this.active={};Object.defineProperty(this.active,'size',{get:()=>this.chunks.size?this.count:0});}
 publicId(slot){return this.idAt?this.idAt(slot):slot}
 resolveSlot(id){if(!Number.isSafeInteger(id)||id<0)return -1;const slot=this.identity?id%this.live.length:id;return slot<this.n&&this.live[slot]&&(!this.identity||this.identity[slot]===id)?slot:-1}
 has(id){return this.resolveSlot(id)>=0}
 stats(){return{live:this.count,active:this.active.size,sleeping:this.chunks.size?0:this.count,lastTick:{visits:this.frameLast?.particles??0}}}
 bodies(){return this.snapshot().map(p=>({...p,x:p.x+LEFT+.5,y:p.y+.5,sleep:!this.chunks.has(this.chunk(p.x,p.y))}))}
 // Preserve slot order and patch semantics; allocate body objects only for changes.
 sync(){
  let changed=false;
  for(let i=0;i<this.n;i++){
   if(!this.live[i])continue;
   const id=this.identity[i],x=this.x[i]+LEFT+.5,y=this.y[i]+.5,color=this.color[i],sleep=!this.chunks.has(this.chunk(this.x[i],this.y[i]));
   const old=this.cache.get(id);
   if(!old||old.x!==x||old.y!==y||old.color!==color||old.sleep!==sleep){
    const b={id,x,y,color,batch:this.batch[i],sleep};
    this.cache.set(id,b);this.changedBodies.set(id,b);this.removedBodies.delete(id);changed=true;
   }
  }
  // Public identity already proves current membership, including recycled slots.
  // Avoid rebuilding a full live-ID Set on every material frame.
  for(const id of this.cache.keys())if(!this.has(id)){this.cache.delete(id);this.changedBodies.delete(id);this.removedBodies.add(id);changed=true;}
  if(changed)this.revision++;
 }
 addMany(points,{batch=0,initialVy=480}={}){if(this.count+points.length>this.maxParticles)return{accepted:false,reason:'capacity',addedIds:[]};try{const before=new Set(this.snapshot().map(p=>p.id));this.admit(points.map(p=>({x:p.x-LEFT,y:p.y})),points[0]?.color??1,batch,initialVy);const ids=this.snapshot().filter(p=>!before.has(p.id)).map(p=>p.id);this.sync();return{accepted:true,addedIds:ids}}catch(e){if(/capacity/.test(e.message))return{accepted:false,reason:'capacity',addedIds:[]};if(/admission|bounds/.test(e.message))return{accepted:false,reason:'occupied-slot',addedIds:[]};throw e}}
 remove(ids){super.remove(ids);this.sync()}
 step(){super.stepFrame();this.sync()}
 consumeChanges({full=false}={}){const previousRevision=this.consumedRevision;const p={reset:full,previousRevision,revision:this.revision,upsert:full?[...this.cache.values()]:[...this.changedBodies.values()],removed:full?[]:[...this.removedBodies]};this.changedBodies.clear();this.removedBodies.clear();this.consumedRevision=this.revision;return p}
 connections(){const visited=new Uint8Array(this.grid.length),spanningComponents=[];for(let index=0;index<this.grid.length;index++){if(!this.grid[index]||visited[index])continue;const color=this.color[this.grid[index]-1],q=[index],ids=[];visited[index]=1;let left=false,right=false;for(let j=0;j<q.length;j++){const cell=q[j],x=cell%FIELD_WIDTH,y=Math.floor(cell/FIELD_WIDTH);ids.push(this.publicId(this.grid[cell]-1));left||=x===0;right||=x===FIELD_WIDTH-1;for(const [xx,yy]of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(xx<0||xx>=FIELD_WIDTH||yy<0||yy>=FIELD_HEIGHT)continue;const next=xx+yy*FIELD_WIDTH,v=this.grid[next];if(v&&!visited[next]&&this.color[v-1]===color){visited[next]=1;q.push(next)}}}if(left&&right)spanningComponents.push({color,ids})}return{spanningComponents}}
 materialPaths(){const paths=[];for(const handle of this.frameIds){const slot=this.identity?this.resolveSlot(handle):handle;if(slot<0)continue;const n=this.frameN[slot];if(n<2)continue;const base=slot*69,points=[];for(let j=0;j<n;j++)points.push(this.frameX[base+j]+LEFT+.5,this.frameY[base+j]+.5,this.framePhase[base+j]);paths.push({id:this.publicId(slot),points})}return paths}
 setRigidObstacle(){}
}
