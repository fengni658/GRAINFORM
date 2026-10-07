import test from 'node:test';import assert from 'node:assert/strict';
import {gpuTables,SurfaceGPU} from '../../dist/preview/surface-gpu.js';
import {SURFACE_MATERIALS} from '../../dist/preview/surface-grains.js';
import {gpuOwnerOracle} from '../fixtures/surface-gpu-oracle.mjs';
test('GPU kernels freeze Float32 distances, unchanged tones and enclosing instance bounds',()=>{
 const t=gpuTables();assert.equal(t,gpuTables());for(let m=0;m<256;m++){const d=SURFACE_MATERIALS[m];assert.equal(t.material[m*4],+d.anchor);assert.equal(t.material[m*4+1],d.tone);for(const f of d.footprint){assert(f.x>=t.material[m*4+2]-4&&f.x<t.material[(m+256)*4]-4);assert(f.y>=t.material[m*4+3]-4&&f.y<t.material[(m+256)*4+1]-4);for(let q=0;q<4;q++){const at=m*324+((f.y+4)*9+f.x+4)*4+q;assert.equal(t.distance[at],Number.isFinite(f.samples[q])?Math.fround(f.samples[q]):16);}}}
});
test('Equal material anchors remain distinct and nearest/runner distances stay ordered',()=>{
 const w=15,h=15,g=new Uint8Array(w*h).fill(1),m=new Uint8Array(w*h),seed=SURFACE_MATERIALS.findIndex(d=>d.anchor);m.fill(SURFACE_MATERIALS.findIndex(d=>!d.anchor));m[7*w+5]=m[7*w+9]=seed;const r=gpuOwnerOracle(g,m,w,h);
 for(let p=0;p<r.winner.length;p++)if(r.runner[p]){assert.notEqual(r.winner[p],r.runner[p]);assert.equal(m[r.winner[p]-1],m[r.runner[p]-1]);assert(r.best[p]<=r.next[p]);if(r.best[p]===r.next[p])assert(r.winner[p]<r.runner[p]);}
});
test('No WebGL2 context produces an explicit CPU fallback, without changing state or inventing GPU metrics',()=>{
 const old=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>null,addEventListener(){}})};try{const gpu=new SurfaceGPU();assert.equal(gpu.ready,false);assert.equal(gpu.draw(new Uint8Array(1),new Uint8Array(1),1,1),null);const s=gpu.snapshot();assert.equal(s.backend,'cpu-fallback');assert.equal(s.reason,'webgl2-unavailable');assert.equal(s.gpuElapsed.count,0);}finally{globalThis.document=old;}
});

test('Frozen kernels retain distinct Float32 distances for different anchor positions at each subpixel',()=>{
 const t=gpuTables();for(let q=0;q<4;q++){const seen=new Map();for(let m=0;m<256;m++)if(SURFACE_MATERIALS[m].anchor)for(let k=0;k<81;k++){const d=t.distance[m*324+k*4+q];if(d>=16)continue;const prior=seen.get(d);if(prior!==undefined)assert.equal(prior,k,'different relative positions may not collapse to one depth');else seen.set(d,k);}}
});
