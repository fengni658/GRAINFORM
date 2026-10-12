import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {materialStyle as current} from '../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/ca-layer.mjs';
import {materialStyle as original052} from '../../builds/b-2d6d08de2a639908e63ffcba4603cc15dd201d3481f49436c1ee1f54c264f48a/ca-layer.mjs';
import {materialStyle as original051} from '../../builds/b-684ce8df6298ed3eb9e04b2cbc304417a51fcf059d78db09956e3be600778ff6/ca-layer.mjs';
import * as G from '../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/board-geometry.mjs';
import {GRAIN_DIAMETER_SCALE,GRAIN_FLANK_SCALE,GRAIN_OFFSET_BOUND} from '../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/grain-material.mjs';
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0]},0))/2;
const diameter=p=>Math.max(...p.flatMap(a=>p.map(b=>Math.hypot(a[0]-b[0],a[1]-b[1]))));
const close=(a,b,label='')=>assert(Math.abs(a-b)<1e-12,`${label}: ${a} vs ${b}`);
test('054 retains053 diameter/area and contracts053 center offset5/6 (20/27 of052 world offset)',()=>{
 assert.equal(G.GRAIN_PITCH,24/9);assert.equal(GRAIN_DIAMETER_SCALE,.95625);assert.equal(GRAIN_FLANK_SCALE,.94);assert.equal(GRAIN_OFFSET_BOUND,.15);
 const seen=new Set;for(let id=0;id<2000;id++){const a=original052(id),b=current(id);for(const key of ['brightness','facet','lightEdge'])assert.equal(b[key],a[key],key);assert.deepEqual(b.outline,a.outline);close(b.radius/a.radius,.95625);close(diameter(b.outline)*b.radius*G.GRAIN_PITCH/(diameter(a.outline)*a.radius*3),.85,'world diameter');close(area(b.outline)*(b.radius*G.GRAIN_PITCH)**2/(area(a.outline)*(a.radius*3)**2),.85**2,'world area');close(b.dx,a.dx*5/6);close(b.dy,a.dy*5/6);close(b.dx*G.GRAIN_PITCH,a.dx*3*20/27);close(b.dy*G.GRAIN_PITCH,a.dy*3*20/27);assert(Math.abs(b.dx)<=.15&&Math.abs(b.dy)<=.15);seen.add(b.outline)}assert.equal(seen.size,64);
});
test('053 keeps052 fixed94percent flank contraction and convex containment in051, independent of glyph radius',()=>{
 for(let id=0;id<2000;id++){const a=original051(id),b=current(id);close(diameter(b.outline),diameter(a.outline));close(area(b.outline)/area(a.outline),.94);const phase=Math.atan2(a.outline[0][1],a.outline[0][0]),c=Math.cos(phase),s=Math.sin(phase);for(let i=0;i<12;i++){const[x,y]=a.outline[i],u=x*c+y*s,v=(-x*s+y*c)*.94;close(b.outline[i][0],u*c-v*s);close(b.outline[i][1],u*s+v*c)}for(const q of b.outline)for(let i=0;i<12;i++){const p=a.outline[i],r=a.outline[(i+1)%12];assert((r[0]-p[0])*(q[1]-p[1])-(r[1]-p[1])*(q[0]-p[0])>=-1e-14)}for(let i=0;i<12;i++){const p=b.outline[i],r=b.outline[(i+1)%12],q=b.outline[(i+2)%12];assert((r[0]-p[0])*(q[1]-r[1])-(r[1]-p[1])*(q[0]-r[0])>0)}}
});
test('053 fixed facet stays inside glyph; appearance and center offset remain stable over repeated samples',()=>{
 for(let id=0;id<2000;id++){const s=current(id);assert.deepEqual(current(id),s);if(!s.facet)continue;const p=s.outline,a=p[s.lightEdge],b=p[(s.lightEdge+1)%12],tri=[[a[0]*.9,a[1]*.9],[b[0]*.9,b[1]*.9],[-.08,-.08]];for(const q of tri)for(let i=0;i<12;i++){const x=p[i],y=p[(i+1)%12];assert((y[0]-x[0])*(q[1]-x[1])-(y[1]-x[1])*(q[0]-x[0])>=0)}}
});
test('054 production changes are exact offset/palette/legend/version allowlist; all other053 bytes retained',()=>{
 const before=new URL('../../builds/b-73c2c80616249e99328df43ae03f9fd4583fb1062aa8d26bdb00037d86b19a28/',import.meta.url),after=new URL('../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/',import.meta.url),allow=JSON.parse(fs.readFileSync(new URL('./source-byte-allowlist053to054.json',import.meta.url),'utf8'));
 assert.deepEqual(fs.readdirSync(after).sort(),fs.readdirSync(before).sort());
 for(const file of fs.readdirSync(before)){let expected=fs.readFileSync(new URL(file,before),'utf8');for(const {old,replacement,count=1} of allow[file]??[]){assert.equal(expected.split(old).length-1,count,file+' declared edit count');expected=expected.split(old).join(replacement)}assert.equal(fs.readFileSync(new URL(file,after),'utf8'),expected,file+' undeclared delta')}
});
