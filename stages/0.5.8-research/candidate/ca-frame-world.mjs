import {World,CFG} from './ca-world.mjs';
export {CFG};
// Fixed four original material rule steps per 60 Hz display frame. Rigid fall stays 60 Hz.
export class FrameWorld extends World {
 constructor(){super();const C=this.live.length;this.frameVisitBits=new Uint32Array(Math.ceil(C/32));this.frame=0;this.framePending=false;this.frameIds=[];this.frameStamp=new Uint32Array(C);this.frameN=new Uint8Array(C);this.frameX=new Int16Array(C*69);this.frameY=new Int16Array(C*69);this.framePhase=new Uint8Array(C*69);this.frameDirty=null;this.frameLast=null;}
 _resetSlot(i){super._resetSlot(i);this.frameStamp[i]=(this.frame-1)>>>0;this.frameN[i]=0;const p=i*69;this.frameX.fill(0,p,p+69);this.frameY.fill(0,p,p+69);this.framePhase.fill(0,p,p+69)}
 remove(ids){super.remove(ids);this.frameIds=this.frameIds.filter(id=>this.has(id))}
 stepFrame(){this.frame++;this.framePending=true;this.frameIds.length=0;this.frameDirty=null;const totals={steps:0,moves:0,particles:0,cellVisits:0};const cv=this.metrics.cellVisits;
 for(let s=0;s<4;s++){if(!this.chunks.size)break;super.step();totals.steps++;totals.moves+=this.last.moves;totals.particles+=this.last.particles;
 // Keep original first-visited slot order, including stationary holds. A lazy
 // rule path has no copied origin until it moves; its unchanged current cell
 // supplies the same frame origin without reordering later-moving particles.
 // Cache every actual unit leg, including holds between rule steps, before base buffers overwrite.
 // The base step stamps exactly its integrated IDs, including stationary holds.
 // Enumerate that same set in ascending slot order, matching the old full scan.
 // Capacity follows the live-slot store; malformed out-of-capacity IDs fail loudly.
 if(this.frameVisitBits.length<Math.ceil(this.live.length/32))this.frameVisitBits=new Uint32Array(Math.ceil(this.live.length/32));
 const words=Math.ceil(this.n/32);this.frameVisitBits.fill(0,0,words);
 for(const i of this.stepIds){if(i<0||i>=this.live.length)throw Error('frame-visited-slot-capacity');this.frameVisitBits[i>>>5]|=1<<(i&31);}
 for(let word=0;word<words;word++){let bits=this.frameVisitBits[word];while(bits){const bit=31-Math.clz32(bits&-bits),i=word*32+bit;bits=(bits&(bits-1))>>>0;if(!this.live[i]||this.pathStamp[i]!==this.tick)continue;const dst=i*69,src=i*18;
 if(this.frameStamp[i]!==this.frame){this.frameStamp[i]=this.frame;this.frameIds.push(this.identity[i]);this.frameN[i]=1;this.frameX[dst]=this.pathN[i]?this.pathX[src]:this.x[i];this.frameY[dst]=this.pathN[i]?this.pathY[src]:this.y[i];this.framePhase[dst]=0;}
 for(let j=1;j<this.pathN[i];j++){const k=dst+this.frameN[i]++;if(this.frameN[i]>69)throw Error('frame-path-capacity');this.frameX[k]=this.pathX[src+j];this.frameY[k]=this.pathY[src+j];this.framePhase[k]=s*17+this.pathPhase[src+j];}}}
 if(this.dirty){const d=this.dirty;if(!this.frameDirty)this.frameDirty={...d};else{const a=this.frameDirty;a.x0=Math.min(a.x0,d.x0);a.y0=Math.min(a.y0,d.y0);a.x1=Math.max(a.x1,d.x1);a.y1=Math.max(a.y1,d.y1)}}}
 totals.cellVisits=this.metrics.cellVisits-cv;this.frameLast=totals;return totals;}
 completePresentation(){super.completePresentation();this.framePending=false;}
 ready(){return !this.framePending&&super.ready();}
 positionAt(id,alpha){const i=this.slotOf(id);if(!this.frameN[i]||this.frameStamp[i]!==this.frame)return[this.x[i]+.5,this.y[i]+.5];const phase=alpha*68,n=this.frameN[i],base=i*69;let x=this.frameX[base],y=this.frameY[base];for(let j=1;j<n;j++){const k=base+j,end=this.framePhase[k];if(phase<end-1)return[x+.5,y+.5];if(phase<end){const u=phase-(end-1);return[x+(this.frameX[k]-x)*u+.5,y+(this.frameY[k]-y)*u+.5]}x=this.frameX[k];y=this.frameY[k]}return[x+.5,y+.5];}
}
