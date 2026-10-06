// Original deterministic simulation. A cell is one grain; four 8x8 blocks form a piece.
export const WIDTH = 96, HEIGHT = 144, BLOCK = 8;
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
export class Game {
  constructor({width=WIDTH,height=HEIGHT,seed=1}={}){
    this.width=width;this.height=height;this.size=width*height;
    this.grid=new Uint8Array(this.size); this.rigid=new Uint8Array(this.size);
    this.visited=new Uint32Array(this.size);this.queue=new Int32Array(this.size);
    this.clearCells=new Int32Array(this.size);this.clearMask=new Uint8Array(this.size);
    this.reset(seed);
  }
  reset(seed=1){
    this.grid.fill(0);this.rigid.fill(0);this.visited.fill(0);this.clearMask.fill(0);
    this.rng=new RNG(seed);this.seed=seed>>>0;this.stamp=0;this.tick=0;
    this.score=0;this.cleared=0;this.lines=0;this.pieces=0;this.chain=0;this.maxChain=0;
    this.level=1;this.active=null;this.next=this.randomPiece();this.state='ready';
    this.fall=0;this.spawnDelay=0;this.clearTimer=0;this.clearCount=0;
    this.clearRegions=0;this.dirty=false;this.events=[];this.added=0;this.removed=0;
  }
  randomPiece(){return {shape:SHAPES[this.rng.int(SHAPES.length)].map(p=>p.slice()),color:1+this.rng.int(3)};}
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
  move(dx){
    if(this.state!=='playing'||!this.active||this.clearTimer)return false;
    // Check each grain-column between positions, so movement cannot tunnel through sand.
    const sign=Math.sign(dx);let moved=false;
    for(let i=0;i<Math.abs(dx);i++){
      if(!this.canPlace(this.active.x+sign,this.active.y))break;
      this.active.x+=sign;moved=true;
    }return moved;
  }
  rotate(){
    if(this.state!=='playing'||!this.active||this.clearTimer)return false;
    const shape=rotateShape(this.active.shape);
    for(const kick of [0,-BLOCK,BLOCK,-2*BLOCK,2*BLOCK]){
      if(this.canPlace(this.active.x+kick,this.active.y,shape)){
        this.active.shape=shape;this.active.x+=kick;this.events.push({type:'rotate'});return true;
      }
    }return false;
  }
  nudgeDown(distance=4){
    if(this.state!=='playing'||!this.active||this.clearTimer)return false;
    for(let n=0;n<distance&&this.active;n++){
      if(this.canPlace(this.active.x,this.active.y+1))this.active.y++;
      else this.lock();
    }
    return true;
  }
  hardDrop(){
    if(this.state!=='playing'||!this.active||this.clearTimer)return false;
    let n=0;while(this.canPlace(this.active.x,this.active.y+1)){this.active.y++;n++;}
    this.score+=Math.floor(n/BLOCK)*2;this.lock();return true;
  }
  ghostY(){
    if(!this.active)return 0;let y=this.active.y;
    while(this.canPlace(this.active.x,y+1))y++;
    return y;
  }
  lock(){
    if(!this.active)return;
    for(const [bx,by] of this.active.shape)for(let y=0;y<BLOCK;y++)for(let x=0;x<BLOCK;x++){
      const i=(this.active.y+by*BLOCK+y)*this.width+this.active.x+bx*BLOCK+x;
      if(this.grid[i])throw new Error('Particle overlap');
      this.grid[i]=this.active.color;this.added++;
    }
    this.pieces++;this.chain=0;this.active=null;this.spawnDelay=22;this.dirty=true;
    this.events.push({type:'land'});
  }
  markRigid(){
    this.rigid.fill(0);if(!this.active)return;
    for(const [bx,by]of this.active.shape)for(let y=0;y<BLOCK;y++){
      const i=(this.active.y+by*BLOCK+y)*this.width+this.active.x+bx*BLOCK;
      this.rigid.fill(1,i,i+BLOCK);
    }
  }
  sandStep(){
    const w=this.width,g=this.grid,r=this.rigid;let moved=false;
    this.markRigid();const rightFirst=(this.tick&1)===0;
    for(let y=this.height-2;y>=0;y--){
      for(let n=0;n<w;n++){
        const x=rightFirst?n:w-1-n,i=y*w+x,c=g[i];if(!c)continue;
        const below=i+w;let dest=-1;
        if(!g[below]&&!r[below])dest=below;
        else{
          const dir=this.rng.int(2)?1:-1;
          if(x+dir>=0&&x+dir<w&&!g[below+dir]&&!r[below+dir])dest=below+dir;
          else if(x-dir>=0&&x-dir<w&&!g[below-dir]&&!r[below-dir])dest=below-dir;
        }
        if(dest!==-1){g[dest]=c;g[i]=0;moved=true;}
      }
    }
    if(moved)this.dirty=true;return moved;
  }
  findConnections(){
    const g=this.grid,w=this.width,h=this.height,v=this.visited,q=this.queue;
    if(++this.stamp===0xffffffff){v.fill(0);this.stamp=1;}
    const stamp=this.stamp;let count=0,regions=0;
    this.clearMask.fill(0);
    for(let start=0;start<this.size;start++){
      if(!g[start]||v[start]===stamp)continue;
      const color=g[start];let head=0,tail=1,left=false,right=false;q[0]=start;v[start]=stamp;
      while(head<tail){
        const i=q[head++],x=i%w,y=(i/w)|0;
        if(x===0)left=true;if(x===w-1)right=true;
        // Only orthogonal adjacency; diagonal contact does not join regions.
        if(x>0&&v[i-1]!==stamp&&g[i-1]===color){v[i-1]=stamp;q[tail++]=i-1;}
        if(x<w-1&&v[i+1]!==stamp&&g[i+1]===color){v[i+1]=stamp;q[tail++]=i+1;}
        if(y>0&&v[i-w]!==stamp&&g[i-w]===color){v[i-w]=stamp;q[tail++]=i-w;}
        if(y<h-1&&v[i+w]!==stamp&&g[i+w]===color){v[i+w]=stamp;q[tail++]=i+w;}
      }
      if(left&&right){regions++;for(let k=0;k<tail;k++){this.clearCells[count++]=q[k];this.clearMask[q[k]]=1;}}
    }
    this.clearCount=count;this.clearRegions=regions;return {count,regions};
  }
  beginClear(){
    const result=this.findConnections();this.dirty=false;
    if(result.count){this.clearTimer=12;this.chain++;this.maxChain=Math.max(this.chain,this.maxChain);this.events.push({type:'clearStart',chain:this.chain,count:result.count,regions:result.regions});}
  }
  finishClear(){
    for(let k=0;k<this.clearCount;k++){const i=this.clearCells[k];if(this.grid[i]){this.grid[i]=0;this.removed++;}}
    const gained=(this.clearCount+100*this.clearRegions)*this.level*this.chain;
    this.score+=gained;this.cleared+=this.clearCount;this.lines+=this.clearRegions;
    this.level=1+Math.min(19,Math.floor(this.cleared/1800));
    this.events.push({type:'clear',score:gained,chain:this.chain,count:this.clearCount,regions:this.clearRegions});
    this.clearCount=0;this.clearMask.fill(0);this.dirty=true;this.spawnDelay=Math.max(this.spawnDelay,18);
  }
  step({softDrop=false}={}){
    if(this.state!=='playing')return;
    this.tick++;
    if(this.clearTimer){if(--this.clearTimer===0)this.finishClear();return;}
    this.sandStep();
    if(this.dirty&&this.tick%8===0){this.beginClear();if(this.clearTimer)return;}
    if(this.active){
      this.fall+=softDrop?2.6:Math.min(1.45,0.24+(this.level-1)*0.065+Math.min(0.4,this.pieces*0.002));
      while(this.fall>=1&&this.active){
        this.fall--;
        if(this.canPlace(this.active.x,this.active.y+1))this.active.y++;
        else this.lock();
      }
    }else if(this.spawnDelay>0)this.spawnDelay--;
    else this.spawn();
  }
  consumeEvents(){const events=this.events;this.events=[];return events;}
  count(){let count=0;for(const cell of this.grid)if(cell)count++;return count;}
  snapshot(){return {state:this.state,score:this.score,level:this.level,pieces:this.pieces,cleared:this.cleared,regions:this.lines,chain:this.chain,maxChain:this.maxChain,grains:this.count(),seed:this.seed,tick:this.tick};}
}
