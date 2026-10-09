import {LocalSandWorld,SAND_CONTRACT,slotPosition,rowColumns,auditCircles} from './baseline-sand.mjs';
export {SAND_CONTRACT,slotPosition,rowColumns,auditCircles};
export const R=SAND_CONTRACT.radius,D=2*R,DT=SAND_CONTRACT.dt;
const body=b=>({id:b.id,x:b.x,y:b.y,color:b.color,row:b.row,col:b.col,sleep:b.sleep,radius:.87});
/** Compatibility and incremental-render adapter; local-sand rules are unchanged. */
export class GridWorld extends LocalSandWorld{
 constructor(options={}){super(options);this.bs=[];this.active=this._active;this.grid=this._occupied;this._dirty=new Set();this._changeRevision=0;this._consumedRevision=0;}
 _mark(id){this._dirty.add(id);this._changeRevision++;}
 addMany(specs){
  if(Array.isArray(specs)&&specs.some(p=>p?.id!==undefined&&(!Number.isSafeInteger(p.id)||p.id<0)))return {accepted:false,addedIds:[],reason:'game-requires-stable-numeric-ids'};
  const result=super.addMany(specs);if(result.accepted)for(const id of result.addedIds){const b=this._records.get(id);b.radius=.87;b.vx=0;this.bs[id]=b;this._mark(id);}return result;
 }
 add(spec){const result=this.addMany([spec]);return result.accepted?this._records.get(result.addedIds[0]):null;}
 remove(ids){const result=super.remove(Array.isArray(ids)?ids:[ids]);for(const id of result.removedIds)this._mark(id);return result;}
 _wake(b){const wasSleeping=b?.sleep;super._wake(b);if(b?.alive&&wasSleeping&&!b.sleep)this._mark(b.id);}
 _sleep(b,metrics){const wasSleeping=b.sleep;super._sleep(b,metrics);if(!wasSleeping&&b.sleep)this._mark(b.id);}
 _visit(b,metrics){const row=b.row,col=b.col;super._visit(b,metrics);if(b.row!==row||b.col!==col)this._mark(b.id);}
 queryRect(x0,y0,x1,y1){
  const out=[],c=SAND_CONTRACT;if(![x0,y0,x1,y1].every(Number.isFinite)||x1<x0||y1<y0)return out;
  const minRow=Math.max(0,Math.ceil((c.floor-c.radius-y1)/c.rowHeight-1e-10)),maxRow=Math.min(this.maxRows-1,Math.floor((c.floor-c.radius-y0)/c.rowHeight+1e-10));
  for(let row=minRow;row<=maxRow;row++){const shift=(row&1)*.5,minCol=Math.max(0,Math.ceil((x0-c.left-c.radius)/c.spacing-shift-1e-10)),maxCol=Math.min(rowColumns(row)-1,Math.floor((x1-c.left-c.radius)/c.spacing-shift+1e-10));for(let col=minCol;col<=maxCol;col++){const id=this._occupied.get(row*132+col);if(id!==undefined)out.push(this._records.get(id));}}
  return out;
 }
 near(x,y,r=D+.012){return this.queryRect(x-r,y-r,x+r,y+r);}
 consumeChanges({full=false}={}){
  const upsert=[],removed=[];
  if(full){for(const b of this._records.values())if(b.alive)upsert.push(body(b));}
  else for(const id of this._dirty){const b=this._records.get(id);if(b?.alive)upsert.push(body(b));else removed.push(id);}
  const patch={reset:full,previousRevision:full?null:this._consumedRevision,revision:this._changeRevision,upsert,removed};
  this._dirty.clear();this._consumedRevision=this._changeRevision;return patch;
 }
 bodies(){const out=[];for(const b of this._records.values())if(b.alive)out.push(body(b));return out;}
}
export {GridWorld as World};
