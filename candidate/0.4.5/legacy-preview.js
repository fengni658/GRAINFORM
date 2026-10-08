// High-resolution granular preview. Physical grains have velocity, friction and sleep.
// The original world size is preserved at 3x linear density; score area is divided by 9.
export const SCALE=3, AREA_SCALE=9, WIDTH=288, HEIGHT=432, BLOCK=24, PHYSICS_SUBSTEPS=2, SLEEP_STEPS=14;
// 0.2.1: diagonal contact joins the same-color component; empty cells are never bridged.
export const CONNECTIVITY=8;
const TILE=12, Q=16, REST=SLEEP_STEPS;
export const SHAPES = [
  [[0,0],[1,0],[0,1],[1,1]],
  [[0,0],[1,0],[2,0],[3,0]],
  [[1,0],[0,1],[1,1],[2,1]],
  [[0,0],[0,1],[1,1],[2,1]],
  [[2,0],[0,1],[1,1],[2,1]],
  [[1,0],[2,0],[0,1],[1,1]],
  [[0,0],[1,0],[1,1],[2,1]]
];
export function rotateShape(shape) {
  const maxY = Math.max(...shape.map(p=>p[1]));
  return shape.map(([x,y])=>[maxY-y,x]);
}
export class RNG {
  constructor(seed=1){ this.state=seed>>>0; }
  next(){ let t=this.state=(this.state+0x6d2b79f5)>>>0; t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296; }
  int(n){return Math.floor(this.next()*n);}
}
// Precomputed permutations preserve P3 RNG draws and traversal exactly, without per-grain modulo.
const ROW_ORDERS=Array.from({length:TILE+1},(_,n)=>n?Array.from({length:n*(n===12?2:1)},(_,j)=>{
  const offset=j%n,stride=n===12?(j>=n?5:7):1;
  return Uint8Array.from({length:n},(_,k)=>(offset+k*stride)%n);
}):[]);
// For an already validated position, a one-cell shift only introduces its leading edge.
// Cache exact exposed cells by immutable shape identity; internal block seams are omitted.
const SHAPE_EDGES=new WeakMap();
function leadingEdges(shape){
  let edges=SHAPE_EDGES.get(shape);if(edges)return edges;
  edges={left:[],right:[],down:[]};
  for(const [bx,by]of shape){
    const left=!shape.some(([x,y])=>x===bx-1&&y===by),right=!shape.some(([x,y])=>x===bx+1&&y===by),down=!shape.some(([x,y])=>x===bx&&y===by+1);
    for(let i=0;i<BLOCK;i++){
      if(left)edges.left.push([bx*BLOCK,by*BLOCK+i]);
      if(right)edges.right.push([(bx+1)*BLOCK-1,by*BLOCK+i]);
      if(down)edges.down.push([bx*BLOCK+i,(by+1)*BLOCK-1]);
    }
  }
  SHAPE_EDGES.set(shape,edges);return edges;
}
export class Game {
  constructor({width=WIDTH,height=HEIGHT,seed=1}={}){
    this.width=width;this.height=height;this.size=width*height;
    this.grid=new Uint8Array(this.size); this.rigid=new Uint8Array(this.size);
    this.visited=new Uint32Array(this.size);this.queue=new Int32Array(this.size);
    this.clearCells=new Int32Array(this.size);this.clearMask=new Uint8Array(this.size);
    this.material=new Uint8Array(this.size);this.vx=new Int16Array(this.size);this.vy=new Int16Array(this.size);
    this.fx=new Int16Array(this.size);this.fy=new Int16Array(this.size);this.energy=new Uint8Array(this.size);this.sleep=new Uint8Array(this.size);this.movedAt=new Uint32Array(this.size);this.departureDrop=new Uint8Array(this.size);
    this.surfaceWindowTick=new Uint32Array(width);this.insideSandStep=false;this.stepCursor=null;this.surface=new Uint16Array(width);this.tileCols=Math.ceil(width/TILE);this.tileRows=Math.ceil(height/TILE);
    this.cellChunk=new Uint16Array(this.size);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)this.cellChunk[y*width+x]=((y/TILE)|0)*this.tileCols+((x/TILE)|0);
    this.activeChunks=new Uint8Array(this.tileCols*this.tileRows);this.nextChunks=new Uint8Array(this.activeChunks.length);
    this.reset(seed);
  }
  reset(seed=1){
    this.generation=(this.generation||0)+1;this.stepCursor=null;this.insideSandStep=false;this.surfaceWindowTick.fill(0);
    this.grid.fill(0);this.rigid.fill(0);this.visited.fill(0);this.clearMask.fill(0);
    this.pieceRng=new RNG(seed);this.physicsRng=new RNG((seed^0x9e3779b9)>>>0);this.rng=this.physicsRng;this.seed=seed>>>0;this.stamp=0;this.tick=0;this.physicsTick=0;this.pieceSerial=0;
    for(const a of [this.material,this.vx,this.vy,this.fx,this.fy,this.energy,this.sleep,this.movedAt,this.departureDrop,this.activeChunks,this.nextChunks])a.fill(0);
    this.surface.fill(this.height);this.gridVersion=0;this.rigidKey='';this.rigidPrevious={valid:false,x:0,y:0,shape:null};this.rawCleared=0;this.connectionEnabled=true;this.ghostCache=null;this.activeChunkCount=0;
    this.score=0;this.cleared=0;this.lines=0;this.pieces=0;this.chain=0;this.maxChain=0;
    this.level=1;this.active=null;this.next=this.randomPiece();this.state='ready';
    this.fall=0;this.spawnDelay=0;this.clearTimer=0;this.clearCount=0;
    this.clearRegions=0;this.dirty=false;this.events=[];this.added=0;this.removed=0;
  }
  randomPiece(){return {shape:SHAPES[this.pieceRng.int(SHAPES.length)].map(p=>p.slice()),color:1+this.pieceRng.int(3),materialSeed:(this.seed+Math.imul(++this.pieceSerial,2654435761))>>>0};}
  start(){if(this.state==='ready'){this.state='playing';this.spawn();}}
  pause(){if(this.state==='playing'){this.state='paused';return true;}return false;}
  resume(){if(this.state==='paused'){this.state='playing';return true;}return false;}
  spawn(){
    const p=this.next;this.next=this.randomPiece();
    const wide=(1+Math.max(...p.shape.map(v=>v[0])))*BLOCK;
    this.active={...p,x:Math.floor((this.width-wide)/2),y:0}; this.fall=0;
    if(!this.canPlace(this.active.x,0,this.active.shape)){
      this.active=null;this.state='over';this.events.push({type:'over'});
    }
  }
  canPlace(x,y,shape=this.active?.shape){
    if(!shape)return false;
    for(const [bx,by] of shape){
      const x0=x+bx*BLOCK,y0=y+by*BLOCK;
      if(x0<0||x0+BLOCK>this.width||y0<0||y0+BLOCK>this.height)return false;
      for(let py=y0;py<y0+BLOCK;py++)for(let px=x0;px<x0+BLOCK;px++)if(this.grid[py*this.width+px])return false;
    }return true;
  }
  canShiftValidated(x,y,direction){
    const {grid:g,width:w,height:h}=this;
    for(const [lx,ly]of leadingEdges(this.active.shape)[direction]){
      const px=x+lx,py=y+ly;if(px<0||px>=w||py<0||py>=h||g[py*w+px])return false;
    }return true;
  }
  move(dx){
    if(this.state!=='playing'||this.stepCursor||!this.active||this.clearTimer)return false;
    // Check each grain-column between positions, so movement cannot tunnel through sand.
    const sign=Math.sign(dx);let moved=false;
    for(let i=0;i<Math.abs(dx);i++){
      if(!(i===0?this.canPlace(this.active.x+sign,this.active.y):this.canShiftValidated(this.active.x+sign,this.active.y,sign<0?'left':'right')))break;
      this.active.x+=sign;moved=true;
    }return moved;
  }
  rotate(){
    if(this.state!=='playing'||this.stepCursor||!this.active||this.clearTimer)return false;
    const shape=rotateShape(this.active.shape);
    for(const kick of [0,-BLOCK,BLOCK,-2*BLOCK,2*BLOCK]){
      if(this.canPlace(this.active.x+kick,this.active.y,shape)){
        this.active.shape=shape;this.active.x+=kick;this.events.push({type:'rotate'});return true;
      }
    }return false;
  }
  nudgeDown(distance=12){
    if(this.state!=='playing'||this.stepCursor||!this.active||this.clearTimer)return false;
    for(let n=0;n<distance&&this.active;n++){
      if(n===0?this.canPlace(this.active.x,this.active.y+1):this.canShiftValidated(this.active.x,this.active.y+1,'down'))this.active.y++;
      else this.lock();
    }
    return true;
  }
  hardDrop(){
    if(this.state!=='playing'||this.stepCursor||!this.active||this.clearTimer)return false;
    let n=0;while(n===0?this.canPlace(this.active.x,this.active.y+1):this.canShiftValidated(this.active.x,this.active.y+1,'down')){this.active.y++;n++;}
    this.score+=Math.floor(n/BLOCK)*2;this.lock();return true;
  }
  ghostY(){
    if(!this.active)return 0;
    const a=this.active,cache=this.ghostCache;
    if(cache&&cache.x===a.x&&cache.shape===a.shape&&cache.revision===this.gridVersion&&cache.y>=a.y)return cache.y;
    const maxX=(Math.max(...a.shape.map(p=>p[0]))+1)*BLOCK;let distance=this.height;
    for(let lx=0;lx<maxX;lx++){
      let bottom=-1;for(const [bx,by]of a.shape)if(lx>=bx*BLOCK&&lx<(bx+1)*BLOCK)bottom=Math.max(bottom,(by+1)*BLOCK-1);
      if(bottom<0)continue;let y=a.y+bottom+1;const x=a.x+lx;
      while(y<this.height&&!this.grid[y*this.width+x])y++;
      distance=Math.min(distance,y-(a.y+bottom)-1);
    }
    const y=a.y+distance;this.ghostCache??={};Object.assign(this.ghostCache,{x:a.x,shape:a.shape,revision:this.gridVersion,y});return y;
  }
  materialFor(x,y,seed=0){let h=(Math.imul(x+1,73856093)^Math.imul(y+1,19349663)^seed)>>>0;h^=h>>>13;return 1+(h%255);}
  wakeChunk(x,y,force=false,target=this.nextChunks){
    if(x<0||x>=this.width||y<0||y>=this.height)return;
    const t=this.cellChunk[y*this.width+x];target[t]=Math.max(target[t],force?2:1);
  }
  wakeAround(i,x=i%this.width,y=(i/this.width)|0){
    const w=this.width,h=this.height,g=this.grid,sl=this.sleep,map=this.cellChunk,next=this.nextChunks,current=this.activeChunks;
    // Same wake set and order as P3, with invariant cell-to-tile indices cached once.
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
      const n=ny*w+nx;if(g[n]){sl[n]=0;const t=map[n];if(!next[t])next[t]=1;if(!current[t])current[t]=1;}
    }
    if(this.insideSandStep){if(this.surfaceWindowTick[x]===this.physicsTick)return;this.surfaceWindowTick[x]=this.physicsTick;}
    for(let nx=Math.max(0,x-4);nx<=Math.min(w-1,x+4);nx++){
      const sy=this.surface[nx];if(sy<h){const n=sy*w+nx;sl[n]=0;const t=map[n];if(!next[t])next[t]=1;if(!current[t])current[t]=1;}
    }
  }
  invalidateSurfaceWindow(x){for(let nx=Math.max(0,x-4),end=Math.min(this.width-1,x+4);nx<=end;nx++)this.surfaceWindowTick[nx]=0;}
  rebuildSurface(){
    this.surface.fill(this.height);for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++)if(this.grid[y*this.width+x]&&y<this.surface[x])this.surface[x]=y;
  }
  wakeAll(){this.sleep.fill(0);this.activeChunks.fill(2);this.nextChunks.fill(2);this.dirty=true;this.gridVersion++;this.rebuildSurface();}
  lock(){
    if(!this.active)return;const a=this.active;
    for(const [bx,by]of a.shape)for(let gy=0;gy<BLOCK;gy++)for(let gx=0;gx<BLOCK;gx++){
      const x=a.x+bx*BLOCK+gx,y=a.y+by*BLOCK+gy,i=y*this.width+x;
      if(this.grid[i])throw new Error('Particle overlap');
      this.grid[i]=a.color;this.material[i]=this.materialFor(bx*BLOCK+gx,by*BLOCK+gy,a.materialSeed||this.seed);
      // Release jitter is small and grain-local, not a coherent outward burst of the whole shape.
      this.vx[i]=Math.round((this.physicsRng.next()-.5)*.5*Q);
      this.vy[i]=8;this.fx[i]=0;this.fy[i]=0;this.energy[i]=8;this.sleep[i]=0;this.movedAt[i]=0;
      this.surface[x]=Math.min(this.surface[x],y);this.wakeChunk(x,y,true,this.activeChunks);this.added++;
    }
    this.pieces++;this.chain=0;this.active=null;this.spawnDelay=22;this.dirty=true;this.gridVersion++;this.rigidKey='';
    this.events.push({type:'land'});
  }
  wakeIfSand(x,y){if(x>=0&&x<this.width&&y>=0&&y<this.height&&this.grid[y*this.width+x])this.wakeChunk(x,y,true,this.activeChunks);}
  markRigid(){
    const a=this.active,old=this.rigidPrevious;
    if(!a&&!old.valid)return;
    if(a&&old.valid&&a.x===old.x&&a.y===old.y&&a.shape===old.shape)return;
    // Only departing support wakes adjacent sand; an approaching block cannot disturb a distant pile.
    if(old.valid)for(const [bx,by]of old.shape){
      const x=old.x+bx*BLOCK,y=old.y+by*BLOCK;
      for(let n=-1;n<=BLOCK;n++){this.wakeIfSand(x+n,y-1);this.wakeIfSand(x+n,y+BLOCK);this.wakeIfSand(x-1,y+n);this.wakeIfSand(x+BLOCK,y+n);}
    }
    this.rigid.fill(0);old.valid=!!a;
    if(!a)return;
    old.x=a.x;old.y=a.y;old.shape=a.shape;
    for(const [bx,by]of a.shape)for(let py=a.y+by*BLOCK;py<a.y+(by+1)*BLOCK;py++){
      const i=py*this.width+a.x+bx*BLOCK;this.rigid.fill(1,i,i+BLOCK);
    }
  }
  free(x,y){return x>=0&&x<this.width&&y>=0&&y<this.height&&!this.grid[y*this.width+x]&&!this.rigid[y*this.width+x];}
  transfer(i,j,vx,vy,fx,fy,energy,x=i%this.width,y=(i/this.width)|0,nx=j%this.width,ny=(j/this.width)|0){
    const w=this.width;
    this.grid[j]=this.grid[i];this.material[j]=this.material[i];this.vx[j]=vx;this.vy[j]=vy;this.fx[j]=fx;this.fy[j]=fy;this.energy[j]=energy;this.sleep[j]=0;this.movedAt[j]=this.physicsTick;
    this.departureDrop[i]=Math.max(0,ny-y);
    this.grid[i]=0;this.material[i]=0;this.vx[i]=0;this.vy[i]=0;this.fx[i]=0;this.fy[i]=0;this.energy[i]=0;this.sleep[i]=0;
    if(this.surface[x]===y){let sy=y+1;while(sy<this.height&&!this.grid[sy*w+x])sy++;this.surface[x]=sy;this.invalidateSurfaceWindow(x);}
    if(ny<this.surface[nx]){this.surface[nx]=ny;this.invalidateSurfaceWindow(nx);}
    this.wakeAround(i,x,y);const tile=this.cellChunk[j];if(!this.nextChunks[tile])this.nextChunks[tile]=1;
  }
  *sandRows(generation=this.generation){
    if(this.generation!==generation)return 0;this.insideSandStep=true;this.physicsTick++;this.markRigid();const w=this.width,g=this.grid,h=this.height,chunks=this.activeChunks;this.nextChunks.fill(0);let moved=0,anyActive=false;
    const vxA=this.vx,vyA=this.vy,fxA=this.fx,fyA=this.fy,energyA=this.energy,sleepA=this.sleep,stampA=this.movedAt,matA=this.material,departureA=this.departureDrop,rigid=this.rigid,surface=this.surface,rng=this.physicsRng,next=this.nextChunks,cellChunk=this.cellChunk;
    for(let t=0;t<chunks.length;t++)if(chunks[t]){anyActive=true;break;}
    if(!anyActive){this.activeChunks=this.nextChunks;this.nextChunks=chunks;this.activeChunkCount=0;this.insideSandStep=false;return 0;}
    for(let y=h-1;y>=0;y--){
      const row=y*w,reverse=(this.physicsTick+y)&1,tileRow=((y/TILE)|0)*this.tileCols;
      for(let c=0;c<this.tileCols;c++){
        const tc=reverse?this.tileCols-1-c:c,flag=chunks[tileRow+tc];if(!flag)continue;
        // Coprime, offset row traversal prevents neighboring grains becoming an artificial synchronized ramp.
        const lo=tc*TILE,hi=Math.min(w,lo+TILE),length=hi-lo,offset=rng.int(length),variant=length===12?rng.int(2):0,order=ROW_ORDERS[length][offset+variant*length];
        for(let k=0;k<hi-lo;k++){
          const x=lo+order[k],i=row+x;if(!g[i]||stampA[i]===this.physicsTick||(sleepA[i]>=REST&&flag<2))continue;
          stampA[i]=this.physicsTick;
          // Exactly equivalent stationary-interior shortcut; preserve the one directional RNG draw.
          if(energyA[i]<=1&&vyA[i]<=45&&x>0&&x<w-1&&y<h-1&&(g[i+w]||rigid[i+w])&&(g[i-1]||rigid[i-1])&&(g[i+1]||rigid[i+1])&&(g[i+w-1]||rigid[i+w-1])&&(g[i+w+1]||rigid[i+w+1])){
            rng.int(2);vxA[i]=0;vyA[i]=0;fxA[i]=0;fyA[i]=0;energyA[i]=0;sleepA[i]=Math.min(255,sleepA[i]+1);if(surface[x]===y)this.invalidateSurfaceWindow(x);
            if(sleepA[i]<REST){const tile=cellChunk[i];if(!next[tile])next[tile]=1;}continue;
          }
          let vx=vxA[i],vy=Math.min(112,vyA[i]+3),energy=Math.max(0,energyA[i]-1);
          // A support that just fell carries the immediately overlying grain in this same fixed step.
          // Without this contact propagation, each dense layer waits to accumulate gravity from zero.
          if(y<h-1&&!g[i+w]&&stampA[i+w]===this.physicsTick)vy=Math.max(vy,departureA[i+w]*Q*2);
          if(energy===0&&!this.free(x,y+1)){vx=0;fxA[i]=0;}
          let tx=fxA[i]+vx,ty=fyA[i]+vy,dx=Math.trunc(tx/(Q*2)),dy=Math.floor(ty/(Q*2)),fx=tx-dx*Q*2,fy=ty-dy*Q*2;
          let nx=x,ny=y,blocked=false;const steps=Math.max(Math.abs(dx),dy);
          if(dx===0){
            const stop=Math.min(dy,h-1-y);for(let n=1;n<=stop;n++){const j=i+n*w;if(g[j]||rigid[j]){blocked=true;break;}ny++;}
            if(!blocked&&stop<dy)blocked=true;
          }else for(let n=1;n<=steps;n++){
            const px=x+Math.round(dx*n/steps),py=y+Math.floor(dy*n/steps);
            if(px===nx&&py===ny)continue;
            if(!this.free(px,py)||(px!==nx&&py!==ny&&rigid[ny*w+px]&&rigid[py*w+nx])){blocked=true;break;}nx=px;ny=py;
          }
          if(blocked&&ny===y&&this.free(x,y+1)){
            nx=x;ny=y;for(let n=1;n<=Math.max(1,dy);n++){if(!this.free(x,y+n))break;ny=y+n;}vx=Math.trunc(vx*.55);fx=0;
          }
          const supported=!this.free(nx,ny+1);
          if(supported){
            if(vy>48&&energyA[i]===0){energy=4;vx+=Math.round((rng.next()-.5)*Math.min(12,vy*.12));}
            vy=0;fy=0;vx=Math.trunc(vx*.76);
          }else vx=Math.trunc(vx*.995);
          if(nx===x&&ny===y&&supported){
            const dir=vx!==0?Math.sign(vx):(rng.int(2)?1:-1);
            for(let pass=0;pass<2;pass++){
              const d=pass?-dir:dir;
              // Sample local contact space; a distant airborne grain is not supporting this grain.
              const slopeX=x+4*d,drop=this.free(slopeX,y)?(this.free(slopeX,y+1)?2:1):0;
              if((energy>0||drop>=((matA[i]%3===0)?1:2))&&!rigid[y*w+x+d]&&this.free(x+d,y+1)){nx=x+d;ny=y+1;vy=8;vx=Math.trunc(vx*.65);fx=0;break;}
              // Sand is a point-grain lattice: diagonal packing is allowed; rigid corners remain impermeable.
              // Material-dependent friction gates rolling; only exposed grains take a longer surface step.
              const far=x+3*d,slope=this.free(far,y)&&this.free(far,y+1)?2:0;
              if((matA[i]&1)===0&&(y===0||!g[i-w])&&drop>=2&&slope>1&&this.free(x+d,y)&&this.free(x+2*d,y+1)&&!(rigid[y*w+x+2*d]&&rigid[(y+1)*w+x+d])){
                nx=x+2*d;ny=y+1;vx=d*12;vy=4;fx=0;break;
              }
              // Brief landing impulse can roll along a free supported surface, then friction stops it.
              if(energy>0&&Math.abs(vx)>=8&&d===Math.sign(vx)&&this.free(x+d,y)){
                nx=x+d;ny=y;fx=0;break;
              }
            }
          }
          if(supported&&Math.abs(vx)<3){vx=0;fx=0;}
          if(nx!==x||ny!==y){this.transfer(i,ny*w+nx,vx,vy,fx,fy,energy,x,y,nx,ny);moved++;}
          else{
            vxA[i]=vx;vyA[i]=vy;fxA[i]=fx;fyA[i]=fy;energyA[i]=energy;
            sleepA[i]=supported&&energy===0&&vx===0?Math.min(255,sleepA[i]+1):0;if(sleepA[i]>0&&surface[x]===y)this.invalidateSurfaceWindow(x);
            if(sleepA[i]<REST){const tile=cellChunk[i];if(!next[tile])next[tile]=1;}
          }
        }
      }
      // Fixed eight-row work units preserve traversal/RNG exactly across yields.
      if((y&7)===0){yield;if(this.generation!==generation)return 0;}
    }
    this.activeChunks=this.nextChunks;this.nextChunks=chunks;this.activeChunkCount=0;for(const f of this.activeChunks)if(f)this.activeChunkCount++;
    if(moved){this.dirty=true;this.gridVersion++;}this.insideSandStep=false;return moved;
  }
  sandStep(){const cursor=this.sandRows();let result;do{result=cursor.next();}while(!result.done);return result.value;}
  findConnections(){
    const g=this.grid,w=this.width,h=this.height,v=this.visited,q=this.queue;
    if(++this.stamp===0xffffffff){v.fill(0);this.stamp=1;}
    const stamp=this.stamp;let count=0,regions=0,leftMask=0,rightMask=0;
    this.clearMask.fill(0);
    for(let y=0;y<h;y++){if(g[y*w])leftMask|=1<<g[y*w];if(g[y*w+w-1])rightMask|=1<<g[y*w+w-1];}
    const candidates=leftMask&rightMask;
    if(candidates)for(let sy=0;sy<h;sy++){
      const start=sy*w,color=g[start];if(!color||!(candidates&(1<<color))||v[start]===stamp)continue;
      let head=0,tail=1,right=false;q[0]=start;v[start]=stamp;
      while(head<tail){
        const i=q[head++],x=i%w,y=(i/w)|0;if(x===w-1)right=true;
        if(x>0&&v[i-1]!==stamp&&g[i-1]===color){v[i-1]=stamp;q[tail++]=i-1;}
        if(x<w-1&&v[i+1]!==stamp&&g[i+1]===color){v[i+1]=stamp;q[tail++]=i+1;}
        if(y>0&&v[i-w]!==stamp&&g[i-w]===color){v[i-w]=stamp;q[tail++]=i-w;}
        if(y<h-1&&v[i+w]!==stamp&&g[i+w]===color){v[i+w]=stamp;q[tail++]=i+w;}
        if(x>0&&y>0&&v[i-w-1]!==stamp&&g[i-w-1]===color){v[i-w-1]=stamp;q[tail++]=i-w-1;}
        if(x<w-1&&y>0&&v[i-w+1]!==stamp&&g[i-w+1]===color){v[i-w+1]=stamp;q[tail++]=i-w+1;}
        if(x>0&&y<h-1&&v[i+w-1]!==stamp&&g[i+w-1]===color){v[i+w-1]=stamp;q[tail++]=i+w-1;}
        if(x<w-1&&y<h-1&&v[i+w+1]!==stamp&&g[i+w+1]===color){v[i+w+1]=stamp;q[tail++]=i+w+1;}
      }
      if(right){regions++;for(let k=0;k<tail;k++){this.clearCells[count++]=q[k];this.clearMask[q[k]]=1;}}
    }
    this.clearCount=count;this.clearRegions=regions;return {count,regions};
  }
  beginClear(){
    const result=this.findConnections();this.dirty=false;
    if(result.count){this.clearTimer=12;this.chain++;this.maxChain=Math.max(this.chain,this.maxChain);this.events.push({type:'clearStart',chain:this.chain,count:result.count,regions:result.regions});}
  }
  finishClear(){
    const raw=this.clearCount;
    for(let k=0;k<raw;k++){
      const i=this.clearCells[k];if(this.grid[i]){this.grid[i]=0;this.material[i]=0;this.vx[i]=0;this.vy[i]=0;this.fx[i]=0;this.fy[i]=0;this.energy[i]=0;this.sleep[i]=0;this.removed++;this.wakeAround(i);}
    }
    const gained=Math.round((raw/AREA_SCALE+100*this.clearRegions)*this.level*this.chain);
    this.score+=gained;this.rawCleared+=raw;this.cleared=Math.floor(this.rawCleared/AREA_SCALE);this.lines+=this.clearRegions;
    this.level=1+Math.min(19,Math.floor(this.rawCleared/(1800*AREA_SCALE)));
    this.events.push({type:'clear',score:gained,chain:this.chain,count:Math.round(raw/AREA_SCALE),rawCount:raw,regions:this.clearRegions});
    this.clearCount=0;this.clearMask.fill(0);this.dirty=true;this.spawnDelay=Math.max(this.spawnDelay,18);this.gridVersion++;this.rebuildSurface();
    for(let i=0;i<this.activeChunks.length;i++)this.activeChunks[i]=Math.max(this.activeChunks[i],this.nextChunks[i]);
  }
  *stepRows({softDrop=false}={},generation=this.generation){
    if(this.state!=='playing'||this.generation!==generation)return;
    this.tick++;
    if(this.clearTimer){if(--this.clearTimer===0)this.finishClear();return;}
    // Two 120 Hz granular half-steps inside the unchanged 60 Hz game/input clock.
    for(let sub=0;sub<PHYSICS_SUBSTEPS;sub++){yield* this.sandRows(generation);if(this.generation!==generation)return;}
    if(this.connectionEnabled&&this.dirty&&this.tick%10===0){this.beginClear();if(this.clearTimer)return;}
    if(this.active){
      this.fall+=softDrop?7.8:SCALE*Math.min(1.45,0.24+(this.level-1)*0.065+Math.min(0.4,this.pieces*0.002));
      while(this.fall>=1&&this.active){
        this.fall--;
        if(this.canPlace(this.active.x,this.active.y+1))this.active.y++;
        else this.lock();
      }
    }else if(this.spawnDelay>0)this.spawnDelay--;
    else this.spawn();
  }
  get stepPending(){return this.stepCursor!==null;}
  beginStep(options={}){if(this.state!=='playing'||this.stepCursor)return false;this.stepCursor=this.stepRows(options,this.generation);return true;}
  advanceStep(){
    if(!this.stepCursor)return true;if(this.state!=='playing')return false;
    const cursor=this.stepCursor,done=cursor.next().done;if(done&&this.stepCursor===cursor)this.stepCursor=null;return done;
  }
  step(options={}){if(this.state!=='playing')return;if(!this.stepCursor)this.beginStep(options);while(this.stepCursor)this.advanceStep();}
  consumeEvents(){const events=this.events;this.events=[];return events;}
  count(){let count=0;for(const cell of this.grid)if(cell)count++;return count;}
  snapshot(){const grains=this.count();return {state:this.state,score:this.score,level:this.level,pieces:this.pieces,cleared:this.cleared,regions:this.lines,chain:this.chain,maxChain:this.maxChain,grains,rawCleared:this.rawCleared,normalizedGrains:grains/AREA_SCALE,activeChunks:this.activeChunkCount,physicsTick:this.physicsTick,physicsSubsteps:PHYSICS_SUBSTEPS,gridVersion:this.gridVersion,seed:this.seed,tick:this.tick};}
}
