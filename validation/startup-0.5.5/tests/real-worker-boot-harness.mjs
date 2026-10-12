import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import * as Geometry from '../candidate/board-geometry.mjs';
import * as Palette from '../candidate/grain-palette.mjs';
import {SettleAnchors} from '../candidate/settle-anchors.mjs';
import {decodeSnapshotWire} from '../candidate/snapshot-transport.mjs';
import {CALayerRenderer as ActualRenderer} from '../candidate/ca-layer.mjs';
import {CompositePresentation as MaterialFrameQueue} from '../candidate/composite-presentation.mjs';
import {createCanvas} from './native-resources.mjs';
import {createSimulationRuntime} from '../candidate/simulation-worker.mjs';
export const html=fs.readFileSync(new URL('../candidate/index.html',import.meta.url),'utf8');

export function assertLegendStructure(text){
 const allIds=[...text.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(allIds).size,allIds.length,'all HTML IDs must be unique');
 const swatches=text.match(/<div class="swatches"[^>]*>(.*?)<\/div>/s);assert(swatches,'actual swatches container');
 const ids=[...swatches[1].matchAll(/<i\bid="([^"]+)"|<i\s+id="([^"]+)"/g)].map(m=>m[1]||m[2]);
 assert.deepEqual(ids,Array.from({length:6},(_,i)=>'grainColor'+(i+1)),'exact six IDs in actual swatches');
 assert.equal([...swatches[1].matchAll(/<i\b/g)].length,6);
 for(let i=1;i<=6;i++)assert.equal(allIds.filter(x=>x==='grainColor'+i).length,1);
 return allIds;
}
function eventTarget(){const listeners=new Map();return{listeners,addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(callback)},dispatch(type,details={}){for(const f of listeners.get(type)??[])f({currentTarget:this,target:this,preventDefault(){},...details})}};}
export async function bootRealWorker({storage=new Map(),storageError=false,hidden=false,baseline=false}={}){
 const appURL=new URL(baseline?'../baseline/app.mjs':'../candidate/app.mjs',import.meta.url);
 const source=fs.readFileSync(appURL,'utf8');
 const ids=assertLegendStructure(html),nodes=new Map(),sets=[],classes=new Set(),errors=[];
 const classList={toggle(k,on){on?classes.add(k):classes.delete(k)},add(...v){v.forEach(k=>classes.add(k))},remove(...v){v.forEach(k=>classes.delete(k))}};
 for(const id of ids)nodes.set(id,{...eventTarget(),id,style:{},classList:{...classList},dataset:{},checked:false,hidden:false,open:false,textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v},focus(){},showModal(){this.open=true},close(){this.open=false}});
 for(const id of['gameCanvas','nextCanvas','nextMobile']){const n=nodes.get(id),c=createCanvas(id==='gameCanvas'?288:128,id==='gameCanvas'?512:100);Object.assign(n,{width:c.width,height:c.height,getContext:()=>c.getContext('2d'),getBoundingClientRect:()=>({width:288}),canvas:c});}
 const document={...eventTarget(),hidden,body:{dataset:{}},documentElement:{classList},getElementById:id=>nodes.get(id)??null,querySelectorAll:selector=>selector==='dialog'?[]:[],createElement:tag=>{assert.equal(tag,'canvas');return createCanvas(1,1)}};
 class CALayerRenderer extends ActualRenderer{constructor(options){super({...options,createCanvas:()=>createCanvas(1,1)});}}
 const window=eventTarget(),workerMessages=[],workers=[],outbox=[],posts=[];
 const flush=()=>{let count=0;while(outbox.length){assert(++count<1000,'bounded worker message drain');const [worker,data]=outbox.shift();worker.onmessage({data});}return count;};
 class Worker{constructor(url,options){workers.push(this);assert.match(String(url),/simulation-worker\.mjs$/);assert.equal(options.name,'grainform-0.5.5-simulation');this.runtime=createSimulationRuntime({now:()=>stamp,timeOrigin:0,setTimer:()=>1,clearTimer(){},post:(m,transfer=[])=>{const cloned=structuredClone(m,{transfer});posts.push(cloned);outbox.push([this,cloned]);}});}postMessage(m){workerMessages.push(structuredClone(m));this.runtime.receive(structuredClone(m));}terminate(){this.runtime.dispose();}}
 let stamp=0,rafId=0;const raf=new Map(),localStorage={getItem:k=>{if(storageError)throw Error('storage denied');return storage.has(k)?storage.get(k):null},setItem:(k,v)=>{if(storageError)throw Error('storage denied');sets.push([k,v]);storage.set(k,String(v))}};
 const c={...Geometry,...Palette,SettleAnchors,decodeSnapshotWire,CALayerRenderer,MaterialFrameQueue,document,window,Worker,URL,URLSearchParams,localStorage,location:{search:'?qa&seed=1'},matchMedia:()=>({matches:false}),performance:{now:()=>++stamp,timeOrigin:0},requestAnimationFrame:f=>{raf.set(++rafId,f);return rafId},cancelAnimationFrame:id=>raf.delete(id),setTimeout:()=>1,clearTimeout(){},devicePixelRatio:1,structuredClone,console:{error:e=>errors.push(String(e)),log(){}}};
 vm.createContext(c);vm.runInContext(source.replace(/^import .*;\n/gm,'').replace(/\bexport /g,'').replaceAll('import.meta.url',JSON.stringify(appURL.href)),c);
 await window.grainformBoot;assert.deepEqual(errors,[],'full actual boot must not reject');assert(window.grainformQA,'production QA object created');assert.equal(window.grainformQA.read().failed,false);assert.equal(workerMessages[0].type,'init');
 return{document,workers,posts,outbox,flush,advance:ms=>{stamp+=ms;workers[0].runtime.pump();return flush();},dispose:()=>workers.forEach(w=>w.runtime.dispose()),runtime:workers[0].runtime,nodes,window,storage,sets,qa:window.grainformQA,colors:()=>Array.from({length:6},(_,i)=>nodes.get('grainColor'+(i+1)).style.background),raf,workerMessages,emit:data=>workers[0].onmessage({data}),draw:timestamp=>{const[id,callback]=raf.entries().next().value;raf.delete(id);callback(timestamp)}};
}
