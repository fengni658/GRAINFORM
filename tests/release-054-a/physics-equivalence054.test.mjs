import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {World as W053, CFG as CFG053} from '../../builds/b-73c2c80616249e99328df43ae03f9fd4583fb1062aa8d26bdb00037d86b19a28/ca-world.mjs';
import {World as W054, CFG as CFG054} from '../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/ca-world.mjs';
import {CAWorld as CA053} from '../../builds/b-73c2c80616249e99328df43ae03f9fd4583fb1062aa8d26bdb00037d86b19a28/ca-adapter.mjs';
import {CAWorld as CA054} from '../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/ca-adapter.mjs';
import {Game as Game053} from '../../builds/b-73c2c80616249e99328df43ae03f9fd4583fb1062aa8d26bdb00037d86b19a28/game.mjs';
import {Game as Game054} from '../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/game.mjs';
import {createSimulationRuntime as runtime053} from '../../builds/b-73c2c80616249e99328df43ae03f9fd4583fb1062aa8d26bdb00037d86b19a28/simulation-worker.mjs';
import {createSimulationRuntime as runtime054} from '../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/simulation-worker.mjs';
import {CompositePresentation as Presentation053} from '../../builds/b-73c2c80616249e99328df43ae03f9fd4583fb1062aa8d26bdb00037d86b19a28/composite-presentation.mjs';
import {CompositePresentation as Presentation054} from '../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/composite-presentation.mjs';
import {SettleAnchors as Anchors053} from '../../builds/b-73c2c80616249e99328df43ae03f9fd4583fb1062aa8d26bdb00037d86b19a28/settle-anchors.mjs';
import {SettleAnchors as Anchors054} from '../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/settle-anchors.mjs';
import {CALayerRenderer as Renderer053} from '../../builds/b-73c2c80616249e99328df43ae03f9fd4583fb1062aa8d26bdb00037d86b19a28/ca-layer.mjs';
import {CALayerRenderer as Renderer054} from '../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/ca-layer.mjs';
import {WIDTH,HEIGHT} from '../../builds/b-195ab55f82a0132a5a6e3195a479fcfe8384200b1ed70d8b681c224c09013f56/board-geometry.mjs';
const report={normalization:['Only decoded snapshot.version: exact 0.5.3 versus exact 0.5.4. No physics field is normalized.'],cases:[]};
// Compare every own field, entire typed buffers (including dead slots), and ordered
// Map/Set entries. Prototype identity alone differs because the sources are imported
// separately. Functions must have byte-identical source; no numerical tolerance.
function exact(a,b,label='state') {
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object') {
  if(typeof a==='function'&&typeof b==='function')assert.equal(String(b),String(a),label);
  else assert(Object.is(a,b),label+': '+String(a)+' != '+String(b));
  return;
 }
 assert.equal(b.constructor.name,a.constructor.name,label+' type');
 if(ArrayBuffer.isView(a)) {
  assert.equal(b.length,a.length,label+' length');
  assert(Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength)),label+' full byte buffer');return;
 }
 if(a instanceof Map||a instanceof Set){exact([...a],[...b],label+' insertion order');return;}
 assert.deepEqual(Object.keys(b),Object.keys(a),label+' own keys');
 for(const k of Object.keys(a))exact(a[k],b[k],label+'.'+k);
}
function recorder(name){let checkpoints=0;const hash=createHash('sha256');let slept=false,reused=false,paths=0;
 return{check(a,b,label){exact(a,b,name+'/'+label);const x=a.world??a;if(x.snapshot){exact(x.stats?.(),b.world?.stats?.()??b.stats?.(),name+'/sleep stats');exact(x.materialPaths?.(),(b.world??b).materialPaths?.(),name+'/path ordering');const p=x.materialPaths?.()??[];paths+=p.length;slept||=x.chunks.size===0;reused||=x.snapshot().some(v=>v.id>=WIDTH*HEIGHT);hash.update(JSON.stringify({label,tick:x.tick,seed:x.seed,world:x.snapshot(),chunks:[...x.chunks],paths:p,credit:[...x.credit.slice(0,x.n)],velocity:[...x.vy.slice(0,x.n)],ready:x.ready()}));}checkpoints++;},finish(extra={}){report.cases.push({name,checkpoints,paths,slept,reused,sha256:hash.digest('hex'),...extra});return{checkpoints,slept,reused,paths};}};
}
test('053→054 raw world exact at every rule step, sleep, support release, rejected admission and slot reuse for all six colors',()=>{
 exact(CFG053,CFG054,'CFG');
 for(let color=1;color<=6;color++){
  const a=new W053,b=new W054,r=recorder('raw-color-'+color);
  for(const w of[a,b]){w.admit(Array.from({length:WIDTH*11},(_,i)=>({x:i%WIDTH,y:HEIGHT-11+Math.floor(i/WIDTH)})),color,1,CFG053.maxSpeed);w.admit([{x:WIDTH/2,y:HEIGHT-12}],color,2,CFG053.maxSpeed);}
  r.check(a,b,'admit');
  for(let step=0;step<2;step++){a.step();b.step();r.check(a,b,'initial-rule-'+step)}
  a.completePresentation();b.completePresentation();r.check(a,b,'initial-presentation');assert(a.ready());
  const removal=a.snapshot().filter(v=>v.y>=HEIGHT-11&&v.y<HEIGHT-1).map(v=>v.id);
  a.remove(removal);b.remove(removal);r.check(a,b,'support-removed');
  for(let step=0;step<80;step++){a.step();b.step();r.check(a,b,'released-rule-'+step);a.completePresentation();b.completePresentation();r.check(a,b,'released-receipt-'+step)}
  assert(a.ready());const target=a.snapshot().find(v=>v.y===HEIGHT-2).id;
  a.remove([target]);b.remove([target]);r.check(a,b,'remove-target');
  for(const w of[a,b])w.admit([{x:WIDTH/2,y:2}],color,3,CFG053.maxSpeed);
  r.check(a,b,'recycled-target');
  for(const w of[a,b])assert.throws(()=>w.admit([{x:0,y:0}],null,4,0),/admission-fields/);
  r.check(a,b,'invalid-null-rejected');
  for(let step=0;step<72;step++){a.step();b.step();r.check(a,b,'recycled-rule-'+step)}
  a.completePresentation();b.completePresentation();r.check(a,b,'final-receipt');const done=r.finish();assert(done.slept&&done.reused);
 }
});
test('053→054 frame paths and interpolation order remain exact across low-speed credit, moving column, settled sleep and reuse',()=>{
 const a=new CA053,b=new CA054,r=recorder('adapter');
 for(const w of[a,b]){w.addMany(Array.from({length:64*4},(_,i)=>({x:WIDTH/2-2+i%4,y:15+Math.floor(i/4),color:6})),{batch:1,initialVy:0});}
 for(let step=0;step<90;step++){
  a.step();b.step();r.check(a,b,'frame-'+step);
  const paths=a.materialPaths();for(const p of paths)for(const t of[0,.001,.1,.371,.5,.9,1])exact(a.positionAt(p.id,t),b.positionAt(p.id,t),'all path interpolation');
  exact(a.consumeChanges(),b.consumeChanges(),'patch '+step);r.check(a,b,'patch-'+step);
  a.completePresentation();b.completePresentation();r.check(a,b,'receipt-'+step);
 }
 assert(a.ready());const removed=a.snapshot().slice(0,10).map(x=>x.id);a.remove(removed);b.remove(removed);r.check(a,b,'remove');
 for(const w of[a,b])assert(w.addMany(Array.from({length:10},(_,i)=>({x:i+10,y:0,color:5})),{batch:2,initialVy:.5}).accepted);
 r.check(a,b,'reuse');
 for(let step=0;step<32;step++){a.step();b.step();r.check(a,b,'reused-frame-'+step);a.completePresentation();b.completePresentation();r.check(a,b,'reused-receipt-'+step)}
 const done=r.finish();assert(done.paths>0&&done.slept&&done.reused);
});
test('053→054 whole Game state and both RNGs stay exact after every command, game tick and accepted/rejected presentation ACK',()=>{
 for(const fixture of['four-pieces','clear']){
  const a=new Game053({seed:2026}),b=new Game054({seed:2026}),r=recorder('game-'+fixture);let acks=0,rejected=0,ticks=0;
  if(fixture==='clear')for(const g of[a,b]){g.state='playing';g.active=null;g.world.addMany(Array.from({length:WIDTH},(_,x)=>({x,y:HEIGHT-2,color:6})),{initialVy:0});g.added=WIDTH;g.setPhase('settling');}
  else{exact(a.start(),b.start());r.check(a,b,'start');}
  while(fixture==='clear'?!(a.rawCleared>=WIDTH&&a.phase==='falling'):!(a.pieces===4&&a.phase==='falling')){
   assert(++ticks<2000,'bounded game fixture');
   if(a.phase==='falling'&&fixture==='four-pieces')for(const [name,args] of [['move',[((a.pieces%5)-2)*9]],['rotate',[]],['softDrop',[]],['drop',[]]]){exact(a[name](...args),b[name](...args),'command result');r.check(a,b,'command-'+name+'-'+ticks)}
   exact(a.step(),b.step(),'step result');r.check(a,b,'tick-'+ticks);
   if(a.awaitingPresentation){const token=a.presentationToken;assert.equal(a.completePresentation(token+1),false,'future ACK rejected053');assert.equal(b.completePresentation(token+1),false,'future ACK rejected054');assert.equal(a.presentedToken,b.presentedToken);rejected++;r.check(a,b,'rejected-ack-'+ticks);assert(a.completePresentation(token));assert(b.completePresentation(token));acks++;r.check(a,b,'accepted-ack-'+ticks);}
  }
  r.finish({ticks,acks,rejected,score:a.score,rawCleared:a.rawCleared,pieces:a.pieces,rng:a.rng.state,physicsRng:a.physicsRng.state});assert(acks>0&&rejected===acks);
 }
});
// The worker harness uses only its public clock/timer/post injection interface.
// Actual producer packets, full/delta transport credit and presentation receipts
// are fed through unchanged production presentation/anchor classes on both sides.
// Here commit/abort models paint success/failure; actual native Canvas draw failure
// and endpoint receipt are separately exercised by the unchanged inherited core.
function harness(runtime,Presentation,Anchors,Renderer){let now=0,timer=0,id=0;const out=[],anchors=new Anchors,p=new Presentation({anchors}),renderer=new Renderer({createCanvas:()=>null});
 const r=runtime({now:()=>now,timeOrigin:0,setTimer:()=>++timer,clearTimer:()=>{},post:(e,transfer=[])=>out.push(structuredClone(e,{transfer}))});
 return{r,out,p,anchors,renderer,clock(){return now},step(ms){now+=ms;r.pump()},command(name,value){r.receive({type:'command',id:++id,name,value,epoch:r.epoch,pieceId:r.game?.pieceId})},receipt(e){r.receive({type:'snapshot-received',epoch:e.epoch,transportId:e.transportId})},paint(fail=false){const s=p.sample(now);if(!s)return null;anchors.prepare(renderer,{group:s.group,alpha:s.alpha,now});if(fail){assert.equal(p.didDraw(now),null);anchors.abort(renderer);return null;}anchors.commit();const ack=p.didDraw(now);if(ack)r.receive({type:'presented',...ack});return ack;}};
}
test('053→054 worker packet order, transport credit, pause/hidden/restart and successful/failed-draw ACK history are strict stepwise equals',()=>{
 const a=harness(runtime053,Presentation053,Anchors053,Renderer053),b=harness(runtime054,Presentation054,Anchors054,Renderer054),r=recorder('worker');let packets=0,receipts=0,acks=0,failedDraws=0;const events=createHash('sha256'),operations=[];
 function check(label){operations.push(label);r.check(a.r.game,b.r.game,label);exact(a.r.stats(),b.r.stats(),label+' scheduler/credit');exact(a.p,b.p,label+' presentation');}
 function receive(packet,e,h){h.anchors.observePatch(packet.epoch,packet.bodyPatch);h.renderer.apply(packet.bodyPatch);if(packet.mode==='full')h.p.restore(packet.presentationCheckpoint,packet.presentationGroups,h.clock());else h.p.accept(packet.epoch,packet.presentationGroups,h.clock());}
 function drain(hold=false){let held=null,guard=0;while(a.out.length||b.out.length){assert(++guard<100);assert.equal(b.out.length,a.out.length,'output queue length');const x=a.out.shift(),y=b.out.shift();assert.equal(y.type,x.type);if(x.type==='snapshot-wire'){
   const u=JSON.parse(new TextDecoder().decode(x.buffer)),v=JSON.parse(new TextDecoder().decode(y.buffer));assert.equal(u.snapshot.version,'0.5.3');assert.equal(v.snapshot.version,'0.5.4');u.snapshot.version=v.snapshot.version='version-only-normalized';exact(u,v,'full packet '+packets);exact({...x,buffer:undefined},{...y,buffer:undefined},'envelope');events.update(JSON.stringify(u));packets++;receive(u,x,a);receive(v,y,b);
   if(hold){held=[x,y];break;}a.receipt(x);b.receipt(y);receipts++;
  }else{exact(x,y,'control envelope');assert.notEqual(x.type,'fatal');events.update(JSON.stringify(x));}check('drain-'+packets)}return held;}
 function command(name,value){a.command(name,value);b.command(name,value);check('command-'+name);drain();}
 for(const h of[a,b])h.r.receive({type:'init',seed:2026,qa:true});check('init');drain();command('start');command('left');command('right');command('down');command('rotate');command('drop');
 let held=null;for(let i=0;i<30&&!held;i++){a.step(1000/60);b.step(1000/60);check('prehold-'+i);held=drain(true)}assert(held);
 a.step(200);b.step(200);check('held-wire-200ms');assert.equal(a.r.stats().transportQueuedOwners,1);assert.equal(a.r.stats().presentedToken,0);
 a.receipt(held[0]);b.receipt(held[1]);receipts++;drain();
 for(let i=0;i<180;i++){
  if(i===12)command('pause');if(i===14)command('resume');
  if(i===24){for(const h of[a,b])h.r.receive({type:'visibility',epoch:h.r.epoch,hidden:true});check('hidden');drain()}
  if(i===26){for(const h of[a,b])h.r.receive({type:'visibility',epoch:h.r.epoch,hidden:false});check('visible');drain();command('resume')}
  a.step(i%7===0?80:1000/60);b.step(i%7===0?80:1000/60);check('pump-'+i);drain();
  const fail=i%11===0;const x=a.paint(fail),y=b.paint(fail);exact(x,y,'draw receipt');if(fail&&a.p.core.groups.length)failedDraws++;if(x){acks++;events.update(JSON.stringify(x));}check('draw-'+i);drain();
  if(i>=30&&a.r.game.phase==='falling'&&a.r.game.pieces>=1)break;
 }
 assert(acks>0&&failedDraws>0);command('restart',{seed:2026});check('restart');for(const h of[a,b])h.r.receive({type:'presented',epoch:h.r.epoch-1,groupId:1});check('stale-epoch-ack');drain();
 for(const required of['command-pause','command-resume','hidden','visible','restart','stale-epoch-ack'])assert(operations.includes(required),required+' fixture reached');
 r.finish({packets,receipts,acks,failedDraws,operations,paintModel:'production presentation/anchor commit-abort transaction; native Canvas success/failure is independently covered by unchanged inherited core',packetAndAckSha256:events.digest('hex')});a.r.dispose();b.r.dispose();
});
test.after(()=>fs.writeFileSync(new URL('./physics-equivalence-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n'));
