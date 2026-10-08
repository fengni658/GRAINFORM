import { CONTRACT as C, ContractError, cellOf, validateOldGrid } from './contract/rank-grid.mjs';
import { encodeGPUPosition, decodeGPUPositions } from './position-encoding.mjs';
export const DIAGNOSTIC_FLAGS = Object.freeze(['overflow','outOfGrid','nonfinite','driftExceeded','invalid']);
export function freshDiagnostics(inherited) {
  if (inherited !== undefined && DIAGNOSTIC_FLAGS.some(k => typeof inherited?.[k] !== 'boolean')) throw new ContractError('old-validity-unproven','Inherited diagnostic flags must all be known booleans.');
  const d={overflow:false,outOfGrid:false,nonfinite:false,driftExceeded:false,invalid:false,...inherited};
  d.invalid ||= d.overflow||d.outOfGrid||d.nonfinite||d.driftExceeded;
  return d;
}
export function canonicalizeRecords(input) {
  if(!Array.isArray(input)) throw new ContractError('records-not-array','Records must be an array.');
  const seen=new Set(), encodedBySlot=new Map();let maxEncodingError=0;
  const records=input.map(p=>{
    if(!p||!Number.isInteger(p.slot)||p.slot<0||p.slot>C.maxSlot) throw new ContractError('invalid-slot','Stable slot must be a bounded nonnegative integer.');
    if(seen.has(p.slot)) throw new ContractError('duplicate-slot',`Repeated slot ${p.slot}.`);seen.add(p.slot);
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)) throw new ContractError('nonfinite-position',`Slot ${p.slot} requires finite coordinates.`);
    let encoded;try{encoded=encodeGPUPosition(p.x,p.y,p.alive!==false);}catch(e){throw new ContractError('position-packing',e.message);}
    const decoded=decodeGPUPositions(encoded);encodedBySlot.set(p.slot,encoded);
    maxEncodingError=Math.max(maxEncodingError,Math.abs(decoded[0]-p.x),Math.abs(decoded[1]-p.y));
    return {...p,id:p.id??p.slot,x:decoded[0],y:decoded[1],alive:p.alive!==false};
  });
  return {records,encodedBySlot,maxEncodingError};
}
export function encodedAxisDelta(a,b) {
  const pa=encodeGPUPosition(a.x,a.y,a.alive),pb=encodeGPUPosition(b.x,b.y,b.alive);
  const cell=code=>{const n=Math.abs(code)-1;return [n%256-128,Math.floor(n/256)-1024];};
  const ca=cell(pa[2]),cb=cell(pb[2]);
  return [(pb[0]-pa[0])+(cb[0]-ca[0])*4,(pb[1]-pa[1])+(cb[1]-ca[1])*4];
}
const inGrid=p=>{const c=cellOf(p);return c.x>=0&&c.x<C.cols&&c.y>=0&&c.y<C.rows;};
export function qualifyWholeRound(old,next) {
  const valid=validateOldGrid(old);
  if(!valid.ok)return {eligible:false,reason:valid.reason};
  const nextBySlot=new Map(next.map(p=>[p.slot,p]));
  for(const p of old.anchors)if(!nextBySlot.has(p.slot))return {eligible:false,reason:'missing-slot-tombstone',slot:p.slot};
  for(const p of next)if(p.alive&&!inGrid(p))return {eligible:false,reason:'next-out-of-grid',slot:p.slot,outOfGrid:true};
  const unproven=[],proof={maxAbsDx:0,maxAbsDy:0,strictLimit:4,checkedLiveSlots:0,wholeRound:true,source:'CPU verification of GPU-read old anchors/buckets and encoded next anchors'};
  for(const p of next){
    const previous=valid.bySlot.get(p.slot);
    // Even a newly introduced dead slot stops this bounded prototype; no partial growth.
    if(!previous){unproven.push({slot:p.slot,reason:'new-slot'});continue;}
    if(!p.alive)continue;
    if(!previous.alive||previous.id!==p.id){unproven.push({slot:p.slot,reason:!previous.alive?'resurrected-slot':'reused-slot'});continue;}
    const [dx,dy]=encodedAxisDelta(previous,p);proof.checkedLiveSlots++;
    proof.maxAbsDx=Math.max(proof.maxAbsDx,Math.abs(dx));proof.maxAbsDy=Math.max(proof.maxAbsDy,Math.abs(dy));
    if(!(Math.abs(dx)<4&&Math.abs(dy)<4))unproven.push({slot:p.slot,reason:'anchor-motion-unproven',dx,dy});
  }
  return unproven.length?{eligible:false,reason:'rank-proof-unavailable',unproven,proof}:{eligible:true,proof};
}
