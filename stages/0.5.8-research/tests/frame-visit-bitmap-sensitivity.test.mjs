import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CAWorld as Baseline} from '../../0.5.6/candidate/ca-adapter.mjs';
import {CAWorld as Candidate} from '../candidate/ca-adapter.mjs';
import {CFG} from '../candidate/ca-world.mjs';
const frameURL=new URL('../candidate/ca-frame-world.mjs',import.meta.url),adapterURL=new URL('../candidate/ca-adapter.mjs',import.meta.url);
const originalFrame=await readFile(frameURL,'utf8'),originalAdapter=await readFile(adapterURL,'utf8');
function replaceRequired(source,a,b){assert(source.includes(a),`mutation anchor must exist: ${a}`);return source.replace(a,b);}
const dataURL=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
async function mutant(transform){let frame=transform(originalFrame);frame=replaceRequired(frame,"'./ca-world.mjs'",JSON.stringify(new URL('../candidate/ca-world.mjs',import.meta.url).href));let adapter=replaceRequired(originalAdapter,"'./ca-frame-world.mjs'",JSON.stringify(dataURL(frame)));for(const file of ['grain-palette.mjs','board-geometry.mjs'])adapter=replaceRequired(adapter,`'./${file}'`,JSON.stringify(new URL('../candidate/'+file,import.meta.url).href));return(await import(dataURL(adapter))).CAWorld;}
function lateFirst(Type){const w=new Type();w.admit([{x:40,y:4}],1,1,0);w.credit[0]=.15;w.admit([{x:50,y:4}],2,2,90);w.admit([{x:30,y:4}],3,3,120);w.step();return w;}
function lateWake(Type){const w=new Type();w.admit([{x:14,y:CFG.height-1}],1,1,0);w.step();w.completePresentation();w.admit([{x:14,y:CFG.height-12}],2,2,CFG.maxSpeed);w.step();return w;}

test('oracle rejects moving-only collection, including lost early stationary holds',async()=>{const Mutant=await mutant(s=>replaceRequired(s,'if(!this.live[i]||this.pathStamp[i]!==this.tick)continue;','if(!this.live[i]||this.pathStamp[i]!==this.tick||this.pathN[i]<2)continue;'));const base=lateFirst(Baseline),actual=lateFirst(Candidate),bad=lateFirst(Mutant);assert.deepEqual(actual.materialPaths(),base.materialPaths());assert.notDeepEqual(bad.materialPaths(),base.materialPaths());assert.deepEqual(bad.materialPaths().map(p=>p.id),[1,2,0]);});

test('oracle rejects direct physical-integration order instead of ascending slot order',async()=>{const Mutant=await mutant(s=>{s=replaceRequired(s,'for(let word=0;word<words;word++){let bits=this.frameVisitBits[word];while(bits){const bit=31-Math.clz32(bits&-bits),i=word*32+bit;bits=(bits&(bits-1))>>>0;','for(const i of this.stepIds){');return replaceRequired(s,'this.framePhase[k]=s*17+this.pathPhase[src+j];}}}','this.framePhase[k]=s*17+this.pathPhase[src+j];}}');});const base=lateFirst(Baseline),actual=lateFirst(Candidate),bad=lateFirst(Mutant);assert.deepEqual(actual.materialPaths(),base.materialPaths());assert.notDeepEqual(bad.materialPaths(),base.materialPaths());assert.deepEqual(bad.materialPaths().map(p=>p.id),[2,0,1]);});

test('oracle rejects global frame slot sorting that destroys first-visited order',async()=>{const Mutant=await mutant(s=>replaceRequired(s,'totals.cellVisits=this.metrics.cellVisits-cv;','this.frameIds.sort((a,b)=>a-b);totals.cellVisits=this.metrics.cellVisits-cv;'));const base=lateWake(Baseline),actual=lateWake(Candidate),bad=lateWake(Mutant);assert.deepEqual(actual.frameIds,base.frameIds);assert.deepEqual(base.frameIds,[1,0]);assert.notDeepEqual(bad.frameIds,base.frameIds);assert.deepEqual(bad.frameIds,[0,1]);});
