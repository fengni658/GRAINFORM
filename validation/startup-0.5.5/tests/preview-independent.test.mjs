import * as G from '../candidate/board-geometry.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {CALayerRenderer} from '../candidate/ca-layer.mjs';
import {CompositeBuilder} from '../candidate/composite-protocol.mjs';
import {SettleAnchors,ANCHOR_SETTLE_MS} from '../candidate/settle-anchors.mjs';
import {CompositePresentation} from '../candidate/composite-presentation.mjs';
import {clearHighlightBodies,visualFrameKey} from '../candidate/app.mjs';
import {createCanvas} from './native-resources.mjs';
const src=fs.readFileSync(new URL('../candidate/app.mjs',import.meta.url),'utf8');
const appDraw=src.slice(src.indexOf('function paintBoard() {'),src.indexOf('function renderLoop(timestamp)'));
function setup({failures=0,fallback=false}={}) {
 const canvas=createCanvas(288,512);canvas.getBoundingClientRect=()=>({width:288});const native=canvas.getContext('2d');
 const events=[];let depth=0,overlays=0;
 const ctx=new Proxy(native,{get:(t,k)=>{if(k==='save')return()=>{depth++;events.push('save');t.save();};if(k==='restore')return()=>{depth--;events.push('restore');t.restore();};if(k==='fillRect')return(...args)=>{events.push(args[0]===0&&args[1]===G.VIEW_GRID_TOP&&args[2]===G.WIDTH&&args[3]===G.VIEW_GRID_HEIGHT?'board':'rect');return t.fillRect(...args);};return typeof t[k]==='function'?t[k].bind(t):t[k];},set:(t,k,v)=>{t[k]=v;return true;}});
 const r=new CALayerRenderer({createCanvas:()=>createCanvas(1,1)}),b=new CompositeBuilder(),anchors=new SettleAnchors(),p=new CompositePresentation({anchors});
 for(let i=1;i<=4;i++)for(const g of b.accept({token:i,ruleTick:i*4,phases:68,durationMs:1000/60,paths:[{id:7,points:[9.5+i,50.5,0,10.5+i,50.5,68]}]},{quiet:i===4}))p.accept(1,[g],0);
 const bodies=[{id:7,x:14.5,y:50.5,color:1,sleep:true},...Array.from({length:6},(_,i)=>({id:10+i,x:14.5+i%3,y:51.5+Math.floor(i/3),color:1,sleep:true}))];
 const patch={reset:true,upsert:bodies,removed:[]};anchors.observePatch(1,patch,r.bodies);r.apply(patch);if(fallback)r.fallback('test reference');
 const original=r.paintSelection;r.paintSelection=function(context,ids){overlays++;events.push('overlay:'+overlays);if(overlays<=failures){original.call(this,context,ids.slice(0,1));events.push('partial-overlay');throw Error('injected overlay failure');}original.call(this,context,ids);events.push('overlay-complete');};
 let clock=0;const sandbox={WIDTH:288,HEIGHT:512,LEFT:0,FIELD_WIDTH:288,FLOOR:512,canvas,ctx,devicePixelRatio:1,performance:{now:()=>++clock/10},presentation:p,anchors,layerRenderer:r,settings:{contrast:false,motion:true},clearStartTick:0,snapshot:{clearIds:bodies.map(b=>b.id),tick:2,active:{},next:null},bodyStore:{bodies:new Map(bodies.map(b=>[b.id,b])),seq:4,epoch:1,revision:4},clearHighlightBodies,visualFrameKey,piece:()=>events.push('piece'),drawNext:()=>events.push('preview'),$:(id)=>id,worker:{postMessage:(packet)=>{events.push('presented');assert(b.ack(packet));}},lastNextSignature:'',lastVisualKey:null,drawCount:0,lastDrawBodySequence:0,lastDrawSnapshotTick:0,lastDrawHighlightCount:0,drawTimes:[],lastDrawMs:0,maxDrawMs:0,lastDrawStages:null};
 Object.assign(sandbox,G);vm.createContext(sandbox);vm.runInContext(appDraw,sandbox);
 return {sandbox,canvas,ctx,native,r,b,p,anchors,events,depth:()=>depth,draw:(time=100)=>sandbox.draw(time)};
}

function actualPreviews({failure='fill',failOn=1}={}) {
 const a=setup();a.sandbox.BLOCK=G.BLOCK;a.sandbox.PALETTES={standard:['','#f0c56a','#49c6b7','#d873a3','#729df5','#f0883d','#a973ee'],contrast:['','#ffe07a','#45f8b2','#ff84b4','#71a7ff','#ff9a45','#bc83ff']};a.sandbox.snapshot.next={shape:[[0,0],[1,0],[1,1],[2,1]],color:2};a.sandbox.snapshot.active=null;
 const previews=[];let failures=1;
 for(let index=0;index<2;index++) {const canvas=createCanvas(96,80),native=canvas.getContext('2d');native.translate(.25,.5);native.globalAlpha=.75;let depth=0,draws=0;const before=native.getTransform();
  const ctx=new Proxy(native,{get(t,k){if(k==='save')return()=>{depth++;t.save();};if(k==='restore')return()=>{depth--;t.restore();};if(k===failure)return(...args)=>{if(index===failOn&&failures-->0)throw Error('preview-'+failure);return t[k](...args);};if(k==='clearRect')return(...args)=>{draws++;return t[k](...args);};return typeof t[k]==='function'?t[k].bind(t):t[k];},set(t,k,v){t[k]=v;return true;}});
  previews.push({canvas,native,ctx,before,depth:()=>depth,draws:()=>draws,target:{width:96,height:80,getContext:()=>ctx}});
 }
 a.sandbox.$=id=>previews[id==='nextCanvas'?0:1].target;
 const functions=src.slice(src.indexOf('function color(value)'),src.indexOf('function paintBoard()'));
 vm.runInContext(functions,a.sandbox);return {...a,previews};
}
test('actual production drawNext restores preview context after translate, scale or glyph-fill exception',()=>{for(const failure of ['translate','scale','fill'])for(const failOn of [0,1]){const a=actualPreviews({failure,failOn}),p=a.previews[failOn];assert.throws(()=>a.sandbox.drawNext(p.target),new RegExp('preview-'+failure));assert.equal(p.depth(),0);assert.deepEqual(p.native.getTransform(),p.before);assert.equal(p.native.globalAlpha,.7490196078431373);a.sandbox.drawNext(p.target);assert.equal(p.depth(),0);assert.deepEqual(p.native.getTransform(),p.before);assert(p.native.getImageData(0,0,96,80).data.some(x=>x!==0));}});
test('real draw and both production previews: failed desktop/mobile preview neither commits signature nor ACKs; retry repaints both then ACKs once',()=>{for(const failOn of [0,1]){const a=actualPreviews({failure:'fill',failOn}),old=a.sandbox.lastNextSignature;assert.throws(()=>a.draw(),/preview-fill/);assert.equal(a.sandbox.lastNextSignature,old);assert.equal(a.b.pending.length,1);assert.equal(a.p.core.completedMaterialTicks,0);assert.equal(a.events.filter(x=>x==='presented').length,0);assert.equal(a.depth(),0);for(const p of a.previews){assert.equal(p.depth(),0);assert.deepEqual(p.native.getTransform(),p.before);}const before=a.previews.map(p=>p.draws());a.draw(120);assert.equal(a.b.pending.length,0,'successful endpoint retry may ACK immediately');assert.equal(a.events.filter(x=>x==='presented').length,1);assert.equal(a.anchors.pending,null);a.draw(120+ANCHOR_SETTLE_MS+1);assert.equal(a.b.pending.length,0);assert.equal(a.events.filter(x=>x==='presented').length,1);a.previews.forEach((p,i)=>{assert.equal(p.draws(),before[i]+1);assert.equal(p.depth(),0);assert.deepEqual(p.native.getTransform(),p.before);});assert.notEqual(a.sandbox.lastNextSignature,old);}});
