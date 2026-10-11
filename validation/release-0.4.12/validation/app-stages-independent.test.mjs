import * as G from '../candidate/board-geometry.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {CALayerRenderer} from '../candidate/ca-layer.mjs';
import {CompositeBuilder} from '../candidate/composite-protocol.mjs';
import {CompositePresentation} from '../candidate/composite-presentation.mjs';
import {clearHighlightBodies,visualFrameKey} from '../candidate/app.mjs';
const {createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas');
const src=fs.readFileSync(new URL('../candidate/app.mjs',import.meta.url),'utf8');
const appDraw=src.slice(src.indexOf('function paintBoard() {'),src.indexOf('function renderLoop(timestamp)'));
function setup({failures=0,fallback=false}={}) {
 const canvas=createCanvas(288,512);canvas.getBoundingClientRect=()=>({width:288});const native=canvas.getContext('2d');
 const events=[];let depth=0,overlays=0;
 const ctx=new Proxy(native,{get:(t,k)=>{if(k==='save')return()=>{depth++;events.push('save');t.save();};if(k==='restore')return()=>{depth--;events.push('restore');t.restore();};if(k==='fillRect')return(...args)=>{events.push(t.fillStyle==='#4b4b4b'?'neutral-shade':args[0]===0&&args[1]===G.VIEW_GRID_TOP&&args[2]===G.WIDTH&&args[3]===G.VIEW_GRID_HEIGHT?'board':'rect');return t.fillRect(...args);};return typeof t[k]==='function'?t[k].bind(t):t[k];},set:(t,k,v)=>{t[k]=v;return true;}});
 const r=new CALayerRenderer({createCanvas:()=>createCanvas(1,1)}),b=new CompositeBuilder(),p=new CompositePresentation();
 for(let i=1;i<=4;i++)for(const g of b.accept({token:i,ruleTick:i*4,phases:68,durationMs:1000/60,paths:[{id:7,points:[99.5+i,50.5,0,100.5+i,50.5,68]}]},{quiet:i===4}))p.accept(1,[g],0);
 const bodies=[{id:7,x:104.5,y:50.5,color:1,sleep:true},...Array.from({length:6},(_,i)=>({id:10+i,x:104.5+i%3,y:51.5+Math.floor(i/3),color:1,sleep:true}))];
 r.apply({reset:true,upsert:bodies,removed:[]});if(fallback)r.fallback('test reference');
 const original=r.paintSelection;r.paintSelection=function(context,ids){overlays++;events.push('overlay:'+overlays);if(overlays<=failures){original.call(this,context,ids.slice(0,1));events.push('partial-overlay');throw Error('injected overlay failure');}original.call(this,context,ids);events.push('overlay-complete');};
 let clock=0;const sandbox={WIDTH:288,HEIGHT:512,LEFT:0,FIELD_WIDTH:288,FLOOR:512,canvas,ctx,devicePixelRatio:1,performance:{now:()=>++clock/10},presentation:p,layerRenderer:r,settings:{contrast:false,motion:true},clearStartTick:0,snapshot:{clearIds:bodies.map(b=>b.id),tick:2,active:{},next:null},bodyStore:{bodies:new Map(bodies.map(b=>[b.id,b])),seq:4},clearHighlightBodies,visualFrameKey,piece:()=>events.push('piece'),drawNext:()=>events.push('preview'),$:(id)=>id,worker:{postMessage:(packet)=>{events.push('presented');assert(b.ack(packet));}},lastNextSignature:'',lastVisualKey:null,drawCount:0,lastDrawBodySequence:0,lastDrawSnapshotTick:0,lastDrawHighlightCount:0,drawTimes:[],lastDrawMs:0,maxDrawMs:0,lastDrawStages:null};
 Object.assign(sandbox,G);vm.createContext(sandbox);vm.runInContext(appDraw,sandbox);
 return {sandbox,canvas,native,r,b,p,events,depth:()=>depth,draw:(time=100)=>sandbox.draw(time)};
}
test('one partial selection failure repaints opaque board, retries full fallback and ACKs only once afterward',()=>{
 const a=setup({failures:1}),expected=setup({fallback:true});a.draw();expected.draw();
 assert.equal(a.r.mode,'full-cell-fallback');assert.equal(a.depth(),0);assert.equal(a.events.filter(x=>x==='board').length,2);assert.equal(a.events.filter(x=>x==='presented').length,1);
 const fail=a.events.indexOf('partial-overlay'),clear=a.events.lastIndexOf('board'),done=a.events.indexOf('overlay-complete');assert(fail<clear&&clear<done&&done<a.events.indexOf('piece')&&a.events.indexOf('preview')<a.events.indexOf('presented'));
 assert.deepEqual(a.native.getImageData(0,0,288,512).data,expected.native.getImageData(0,0,288,512).data);assert.equal(a.p.core.completedMaterialTicks,4);assert.equal(a.b.pending.length,0);
});
test('persistent selection failure must not ACK and must unwind the outer board clip',()=>{
 const a=setup({failures:2});assert.throws(()=>a.draw(),/injected overlay failure/);assert.equal(a.events.filter(x=>x==='presented').length,0);assert.equal(a.p.core.completedMaterialTicks,0);assert.equal(a.b.pending.length,1);assert.equal(a.depth(),0,'outer board save must be restored after fallback retry throws');
});
test('stage version 2 accurately declares material plus selection and total remains the sum',()=>{
 const a=setup();a.draw();const s=a.sandbox.lastDrawStages;assert.equal(s.version,2);assert.equal(s.layerScope,'material-and-selection');assert(Math.abs(s.totalMs-(s.sampleMs+s.synchronizeMs+s.layerDrawMs+s.remainingDrawMs))<1e-12);assert.equal(s.totalMs,a.sandbox.lastDrawMs);assert(src.includes('v1 excluded selection'));assert(src.includes('not directly comparable to v1'));
});
test('empty selection and absent body IDs restore draw context alpha, fill, transform and clip state',()=>{
 const a=setup(),r=a.r,c=a.ctx??a.native;r.configure(288,512,'standard');c.globalAlpha=.75;c.fillStyle='#123456';c.translate(2,3);const before=c.getTransform(),beforeAlpha=c.globalAlpha,reference=createCanvas(288,512).getContext('2d');reference.globalAlpha=beforeAlpha;reference.fillStyle='#123456';reference.translate(2,3);
 for(const ids of [[],[987654]]){r.draw(c,{ids,alpha:.5,fillStyle:'#ffffff'});assert.equal(c.globalAlpha,beforeAlpha);assert.deepEqual(c.getTransform(),before);c.fillRect(0,0,1,1);reference.fillRect(0,0,1,1);assert.deepEqual(c.getImageData(2,3,1,1).data,reference.getImageData(2,3,1,1).data);}
});

// Additional parent-assigned reviewer cases execute actual draw + real presentation.
test('failure at each renderer/application stage never prematurely acknowledges and later real retry does',()=>{
 for(const stage of ['contour','material','cache-copy','piece','preview']) {
  const a=setup();let left=stage==='piece'||stage==='preview'?1:2;
  const fail=(original)=>(...args)=>{if(left-->0)throw Error('stage:'+stage);return original(...args)};
  if(stage==='contour')a.r.contour.update=fail(a.r.contour.update.bind(a.r.contour));
  if(stage==='material')a.r.paint=fail(a.r.paint.bind(a.r));
  if(stage==='cache-copy'){const original=a.native.drawImage.bind(a.native);a.native.drawImage=fail(original);left=1;}
  if(stage==='piece')a.sandbox.piece=fail(a.sandbox.piece);
  if(stage==='preview')a.sandbox.drawNext=fail(a.sandbox.drawNext);
  if(stage==='cache-copy'){a.draw();assert.equal(a.p.core.completedMaterialTicks,4);assert.equal(a.events.filter(x=>x==='presented').length,1);}
  else {assert.throws(()=>a.draw(),new RegExp('stage:'+stage));assert.equal(a.p.core.completedMaterialTicks,0);assert.equal(a.b.pending.length,1);assert.equal(a.events.filter(x=>x==='presented').length,0);assert.equal(a.depth(),0);a.draw(120);assert.equal(a.p.core.completedMaterialTicks,4);assert.equal(a.b.pending.length,0);assert.equal(a.events.filter(x=>x==='presented').length,1);}
  assert.equal(a.depth(),0);
 }
});
test('real paused queue remains unacknowledged until resume and final draw',()=>{const a=setup();a.p.setPaused(true,0);a.draw(1000);assert.equal(a.events.filter(x=>x==='presented').length,0);a.p.setPaused(false,1000);a.draw(1001);assert.equal(a.events.filter(x=>x==='presented').length,0);a.draw(1200);assert.equal(a.events.filter(x=>x==='presented').length,1);assert.equal(a.b.pending.length,0);});
