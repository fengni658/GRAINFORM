// Intentional appearance update: frozen renderer receives independently injected neutral fill.
// Independent frozen-0.4.12 oracle. Native correctness only; no browser/performance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {CALayerRenderer as Frozen} from '../frozen0412/candidate/ca-layer.mjs';
import {CALayerRenderer as After} from '../candidate/ca-layer.mjs';
import {WIDTH, HEIGHT, VIEW_GRID_TOP, VIEW_GRID_HEIGHT} from '../candidate/board-geometry.mjs';
import {neutralFillOracleClass} from './neutral-fill-oracle.mjs';
const Before=neutralFillOracleClass(Frozen,{x:0,y:VIEW_GRID_TOP,width:WIDTH,height:VIEW_GRID_HEIGHT});
const {createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas');
const palettes=[['','#eac370','#4fc0b3','#d378a3','#789fef'],['','#ffe07a','#4df0b0','#fc87b5','#71a7ff']];
const bodies=[];
for(let y=12;y<19;y++)for(let x=12;x<22;x++)if(!(x>15&&x<18&&y>14&&y<17))bodies.push({id:bodies.length,x:x+.5,y:y+.5,color:1+(x+y)%4});
for(const [x,y] of [[.5,.5],[191.5,.5],[.5,341.5],[191.5,341.5],[15.95,159.98],[16.1,160.05],[159.98,335.99],[160.05,336.1],[19.59,16.6],[19.65,16.65]])bodies.push({id:bodies.length,x,y,color:1+bodies.length%4});
const selected=[...bodies.map(b=>b.id).reverse(),4,4,999999];
let comparedFrames=0;
const rgba=c=>Buffer.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data);
function create(Type,{raw=false,dpr=1,initial=bodies,failScratch=null}={}) {
 let palette=0,creates=0;
 const canvas=createCanvas(Math.round(288*dpr),Math.round(512*dpr)),ctx=canvas.getContext('2d');
 const r=new Type({rawCells:raw,resolveColor:c=>palettes[palette][c],createCanvas:()=>{creates++;if(creates===2&&failScratch==='throw')throw Error('injected scratch failure');if(creates===2&&failScratch==='null-context')return {getContext:()=>null};return createCanvas(1,1);}});
 r.apply({reset:true,upsert:initial,removed:[]});r.configure(canvas.width,canvas.height,'standard');
 return {r,canvas,ctx,creates:()=>creates,palette:()=>{palette=1;r.configure(canvas.width,canvas.height,'contrast');},resize:(w,h)=>{canvas.width=w;canvas.height=h;r.configure(w,h,palette?'contrast':'standard');}};
}
function render(p,{selection=selected,mode='source-over',alpha=.65,transform=[1,0,0,1,0,0],witness=true,standalone=false}={}) {
 const {r,ctx:c,canvas}=p;
 c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.fillStyle='#182327';c.fillRect(0,0,canvas.width,canvas.height);
 c.setTransform(canvas.width/WIDTH,0,0,canvas.height/VIEW_GRID_HEIGHT,0,-VIEW_GRID_TOP*canvas.height/VIEW_GRID_HEIGHT);c.transform(...transform);
 c.globalAlpha=.47;c.globalCompositeOperation=mode;c.fillStyle='#375968';c.lineWidth=.13;c.strokeStyle='#abc123';
 c.beginPath();c.rect(3.25,4.75,2.5,3.5);
 const state=[c.globalAlpha,c.globalCompositeOperation,c.lineWidth,...['a','b','c','d','e','f'].map(k=>c.getTransform()[k])];
 if(standalone){c.save();c.globalAlpha=alpha;c.fillStyle='rgba(251,243,188,.63)';r.drawSelection(c,selection);c.restore();}
 else r.draw(c,selection===null?null:{ids:selection,alpha,fillStyle:'rgba(251,243,188,.63)'});
 assert.deepEqual([c.globalAlpha,c.globalCompositeOperation,c.lineWidth,...['a','b','c','d','e','f'].map(k=>c.getTransform()[k])],state,'numeric caller state restored');
 // @napi-rs/canvas style getters can retain last assignment after restore, so
 // compare actual color-state drawing against the frozen oracle instead.
 c.fillRect(51,53,2,2);c.strokeRect(55,57,2,2);
 const points=[[0,0],[4,6],[20,17],[15.95,159.98],[191.5,341.5]].map(([x,y])=>c.isPointInPath(x,y));
 if(witness){c.globalAlpha=.37;c.globalCompositeOperation='source-over';c.fillStyle='#fe317b';c.strokeStyle='#a1fb71';c.lineWidth=.29;c.fill();c.stroke();}
 return {pixels:rgba(canvas),points,cache:r.canvas?rgba(r.canvas):null};
}
function metrics(r){const m=r.read();for(const key of ['cacheTileCopies','cacheCopiedPixels','lastCacheCopiedPixels'])delete m[key];return m;}
async function compare(a,b,label,opts={}){await new Promise(resolve=>setImmediate(resolve));globalThis.gc?.();const x=render(a,opts),y=render(b,opts);assert(x.pixels.equals(y.pixels),'RGBA '+label);assert.deepEqual(y.points,x.points,'current path '+label);if(x.cache)assert(x.cache.equals(y.cache),'cache RGBA '+label);assert.deepEqual(metrics(b.r),metrics(a.r),'metrics '+label);comparedFrames++;}
function each(pair,fn){for(const p of pair)fn(p);}
function release(pair){for(const p of pair)for(const c of[p.canvas,p.r.canvas,p.r.scratchCanvas])if(c){c.width=1;c.height=1}}
test('oracle is genuinely frozen 0.4.12, with independent constructor identity',async()=>{
 const hash=path=>crypto.createHash('sha256').update(fs.readFileSync(new URL(path,import.meta.url))).digest('hex');
 assert.equal(hash('../frozen0412/candidate/ca-layer.mjs'),'d0b09a3baafaa61100e90016ad2b0de300b244526343f9bb6c5487ea7b799d07');
 assert.notEqual(Before,After);assert.notEqual(hash('../candidate/ca-layer.mjs'),hash('../frozen0412/candidate/ca-layer.mjs'));
 for(const file of ['grain-material.mjs','ca-contour.mjs','board-geometry.mjs','app.mjs','composite-protocol.mjs','composite-presentation.mjs'])assert.equal(hash('../candidate/'+file),hash('../frozen0412/candidate/'+file),file+' unchanged');
});
test('frozen exact RGBA/current path across dirty lifecycle, raw cells and DPR 1/1.5/2',async()=>{
 for(const raw of [false,true])for(const dpr of [1,1.5,2]){
  const pair=[create(Before,{raw,dpr}),create(After,{raw,dpr})], [a,b]=pair;
  await compare(a,b,`cold raw=${raw} dpr=${dpr}`);await compare(a,b,'warm');
  each(pair,p=>p.r.apply({upsert:[{...bodies[9],x:16.12,y:15.89,color:4},{...bodies.at(-2),x:16.01,y:160.03}],removed:[3]}));await compare(a,b,'fractional boundary and delete');
  each(pair,p=>p.r.apply({removed:[4],upsert:[{id:4,x:16.04,y:160.06,color:2},{id:999,x:16.04,y:160.06,color:4}]}));await compare(a,b,'same ID removal/rebirth overlapping newest rank');
  each(pair,p=>p.r.apply({removed:[],upsert:[{...p.r.bodies.get(999),ignoredMarker:'replacement'}]}));await compare(a,b,'unchanged pose replaces body object');
  each(pair,p=>{const body=p.r.bodies.get(4);p.r.synchronize([{paths:[{id:4,points:[body.x,body.y,0,body.x,body.y+1,68]}]}],{positions:[{id:4,xy:[body.x,body.y+.35]}]});});await compare(a,b,'moving membership');
  each(pair,p=>{const body=p.r.bodies.get(4);p.r.apply({upsert:[{...body,y:body.y+1}],removed:[]});p.r.synchronize([],null);});await compare(a,b,'settled membership');
  each(pair,p=>p.palette());await compare(a,b,'palette');
  each(pair,p=>p.resize(Math.round(331*dpr),Math.round(587*dpr)));await compare(a,b,'resize');
  for(const selection of [[],[999999],null,[4,999,4,999999]])await compare(a,b,'selection edge '+JSON.stringify(selection),{selection});
  each(pair,p=>p.r.apply({upsert:[],removed:[...p.r.bodies.keys()]}));await compare(a,b,'all-empty dirty union');
  assert.equal(b.r.metrics.lastCacheCopiedPixels,0);assert.equal(b.r.metrics.lastStablePaints,0);
  each(pair,p=>p.r.apply({removed:[],upsert:[{id:3,x:16.1,y:160.1,color:2},{id:4,x:16.11,y:160.12,color:4}]}));await compare(a,b,'repopulate after skipped scratch clear');
  each(pair,p=>p.r.apply({reset:true,upsert:bodies.slice(-7),removed:[]}));await compare(a,b,'reset generation');release(pair);
 }
});
test('frozen standalone/fused selection, transforms, nonlocal modes, duplicates/missing and fallback',async()=>{
 const modes=['source-over','multiply','screen','destination-over','source-atop','copy','destination-in','destination-out','source-in','source-out','xor','lighter'];
 for(const raw of [false,true])for(const fallback of [false,true]){
  const pair=[create(Before,{raw}),create(After,{raw})],[a,b]=pair;
  if(fallback)each(pair,p=>p.r.fallback('explicit identical fallback'));
  for(const mode of modes)for(const transform of [[1.23,.08,-.13,1.17,3.2,4.1],[-1,0,0,1,190.3,.47]])await compare(a,b,`mode ${mode} raw ${raw} fallback ${fallback}`,{mode,transform});
  for(const selection of [selected,[],[999999]])await compare(a,b,'standalone current-path edge',{selection,standalone:true});release(pair);
 }
});
test('empty union preserves scratch creation/null-context failure fallback and resize',async()=>{
 for(const failScratch of ['throw','null-context',null]){
  const pair=[create(Before,{initial:[bodies[0]],failScratch}),create(After,{initial:[bodies[0]],failScratch})],[a,b]=pair;
  await compare(a,b,'single cold', {selection:null});each(pair,p=>p.r.apply({removed:[bodies[0].id],upsert:[]}));await compare(a,b,'empty allocation '+failScratch,{selection:null});
  assert.equal(a.creates(),2);assert.equal(b.creates(),2);assert.equal(a.r.mode,b.r.mode);assert.equal(a.r.fallbackReason,b.r.fallbackReason);
  if(!failScratch){assert.equal(b.r.scratchCanvas.width,b.canvas.width);assert.equal(b.r.scratchCanvas.height,b.canvas.height);assert.equal(b.r.metrics.cacheTileCopies,0);assert(a.r.metrics.cacheTileCopies>0);}release(pair);
 }
});
test('all-empty union retains cache clear failure; nonempty paint failure is unchanged',async()=>{
 for(const target of ['cache-clear','scratch-paint'])for(const Type of [Before,After]){
  const p=create(Type,{initial:[bodies[0]]});render(p,{selection:null});
  if(target==='cache-clear'){p.r.apply({removed:[bodies[0].id],upsert:[]});const native=p.r.context;p.r.context=new Proxy(native,{get(t,k){if(k==='clearRect')return()=>{throw Error('cache-clear failure');};return typeof t[k]==='function'?t[k].bind(t):t[k];},set(t,k,v){t[k]=v;return true;}});}
  else {p.r.apply({removed:[],upsert:[{...bodies[0],color:3}]});const original=p.r.paint;p.r.paint=function(c,...args){if(c===this.scratchContext)throw Error('scratch-paint failure');return original.call(this,c,...args);};}
  assert.throws(()=>render(p,{selection:null}),new RegExp(target+' failure'));assert(p.r.dirtyTiles.size>0);release([p]);
 }
});
function appHarness(Type,{failures=0}={}){
 const p=create(Type),calls=[];let left=failures;
 const original=p.r.paintSelection;p.r.paintSelection=function(c,ids){original.call(this,c,ids.slice(0,3));if(left-->0)throw Error('overlay failure');original.call(this,c,ids.slice(3));};
 p.canvas.getBoundingClientRect=()=>({width:288});let t=0;
 const s={WORLD_WIDTH:288,WORLD_HEIGHT:512,ctx:p.ctx,canvas:p.canvas,WIDTH,HEIGHT,LEFT:0,FIELD_WIDTH:WIDTH,FLOOR:HEIGHT,devicePixelRatio:1,performance:{now:()=>++t},presentation:{queue:[],sample:()=>null,didDraw:()=>{calls.push('didDraw');return {token:1};}},layerRenderer:p.r,settings:{contrast:false,motion:false},snapshot:{tick:4,clearIds:selected,next:{shape:[],color:1},active:{}},bodyStore:{bodies:p.r.bodies,seq:1},clearStartTick:0,clearHighlightBodies:()=>selected,paintBoard:()=>{calls.push('board');p.ctx.setTransform(1,0,0,1,0,0);p.ctx.globalAlpha=1;p.ctx.globalCompositeOperation='source-over';p.ctx.fillStyle='#182327';p.ctx.fillRect(0,0,288,512);p.ctx.setTransform(288/WIDTH,0,0,512/VIEW_GRID_HEIGHT,0,-VIEW_GRID_TOP*512/VIEW_GRID_HEIGHT);},clipBoard:()=>{p.ctx.save();p.ctx.beginPath();p.ctx.rect(0,VIEW_GRID_TOP,WIDTH,VIEW_GRID_HEIGHT);p.ctx.clip();},piece:()=>calls.push('piece'),lastNextSignature:JSON.stringify([[],1,false]),lastVisualKey:null,currentVisualKey:()=>'',drawCount:0,lastDrawBodySequence:0,lastDrawSnapshotTick:0,lastDrawHighlightCount:0,drawTimes:[],worker:{postMessage:()=>calls.push('ACK')},lastDrawMs:0,maxDrawMs:0,lastDrawStages:{}};
 const source=fs.readFileSync(new URL('../candidate/app.mjs',import.meta.url),'utf8');const draw=source.slice(source.indexOf('function draw(timestamp'),source.indexOf('function renderLoop(timestamp'));
 vm.createContext(s);vm.runInContext(draw+';globalThis.invoke=draw;',s);return {...p,s,calls};
}
test('real production draw overlay failure retries one cleared frame; persistent failure cannot ACK',async()=>{
 for(const failures of [0,1,2]){
  const a=appHarness(Before,{failures}),b=appHarness(After,{failures});
  for(const p of [a,b]){if(failures===2)assert.throws(()=>p.s.invoke(100),/overlay failure/);else p.s.invoke(100);}
  assert.deepEqual(b.calls,a.calls);assert(rgba(a.canvas).equals(rgba(b.canvas)));
  if(failures===2){assert(!b.calls.includes('didDraw'));assert(!b.calls.includes('ACK'));}else assert.equal(b.calls.filter(x=>x==='ACK').length,1);
  if(failures===1)assert.deepEqual(b.calls,['board','board','piece','didDraw','ACK']);release([a,b]);
 }
});
test.after(()=>console.log(JSON.stringify({nativeOnly:true,comparedFrames,frozenLayerSha256:'d0b09a3baafaa61100e90016ad2b0de300b244526343f9bb6c5487ea7b799d07',candidateLayerSha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../candidate/ca-layer.mjs',import.meta.url))).digest('hex')})));
