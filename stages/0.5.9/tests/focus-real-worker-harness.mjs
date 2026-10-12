import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createCanvas} from './native-resources.mjs';

// Based on 056 real-worker-boot-harness. This package selects all app/runtime
// modules from either current candidate or its own frozen 056 fixture.
// DOM, focus, event dispatch/default actions, time and message delivery are
// explicit controlled doubles. This is NOT native browser keyboard evidence.
export const candidateHTML=fs.readFileSync(new URL('../candidate/index.html',import.meta.url),'utf8');
const voidTags=new Set(['AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT','LINK','META','PARAM','SOURCE','TRACK','WBR']);
function eventTarget(){
 const listeners=new Map();
 return {listeners,addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(callback);},dispatch(type,details={}){
  const event={type,currentTarget:this,target:this,cancelable:true,defaultPrevented:false,...details,preventDefault(){if(this.cancelable)this.defaultPrevented=true;}};
  for(const callback of listeners.get(type)??[])callback(event);
  return event;
 }};
}
function classList(){const values=new Set();return{toggle(k,on){on?values.add(k):values.delete(k);},add(...keys){keys.forEach(k=>values.add(k));},remove(...keys){keys.forEach(k=>values.delete(k));},contains:k=>values.has(k)};}
function matchesOne(node,selector){
 const match=selector.trim().match(/^([a-z][\w-]*)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i);
 assert(match&&(match[1]||match[2]),`Unsupported double selector: ${selector}`);
 return (!match[1]||node.tagName===match[1].toUpperCase())&&(!match[2]||(match[2]in node.attributes&&(match[3]===undefined||node.attributes[match[2]]===match[3])));
}
export async function bootFocusRuntime({baseline056=false}={}){
 const base=new URL(baseline056?'./fixtures/056/':'../candidate/',import.meta.url);
 const [Geometry,Palette,{SettleAnchors},{decodeSnapshotWire},{CALayerRenderer:ActualRenderer},{CompositePresentation:MaterialFrameQueue},{createSimulationRuntime}]=await Promise.all(
  ['board-geometry.mjs','grain-palette.mjs','settle-anchors.mjs','snapshot-transport.mjs','ca-layer.mjs','composite-presentation.mjs','simulation-worker.mjs'].map(path=>import(new URL(path,base))));
 const appURL=new URL('app.mjs',base),source=fs.readFileSync(appURL,'utf8'),html=fs.readFileSync(new URL('index.html',base),'utf8');
 let document;const nodes=new Map(),allNodes=[],errors=[],sets=[];
 function makeNode(tag,attributes={},parentElement=null){
  const node={...eventTarget(),tagName:tag.toUpperCase(),id:attributes.id??'',attributes:{...attributes},parentElement,children:[],style:{},classList:classList(),dataset:{},checked:false,hidden:'hidden'in attributes,disabled:'disabled'in attributes,open:false,textContent:'',
   setAttribute(name,value){this.attributes[name]=String(value);},getAttribute(name){return this.attributes[name]??null;},removeAttribute(name){delete this.attributes[name];},
   matches(selector){return selector.split(',').some(s=>matchesOne(this,s));},
   closest(selector){for(let current=this;current;current=current.parentElement)if(current.matches(selector))return current;return null;},
   get isContentEditable(){for(let current=this;current;current=current.parentElement){if(!('contenteditable'in current.attributes))continue;const value=current.attributes.contenteditable.toLowerCase();if(value==='false')return false;if(value===''||value==='true'||value==='plaintext-only')return true;}return false;},
   focus(){if(!this.disabled)document.activeElement=this;},showModal(){assert.equal(this.tagName,'DIALOG');this.open=true;},close(){this.open=false;},setPointerCapture(){}};
  for(const [name,value]of Object.entries(attributes))if(name.startsWith('data-'))node.dataset[name.slice(5)]=value;
  parentElement?.children.push(node);allNodes.push(node);if(node.id){assert(!nodes.has(node.id),'unique HTML id');nodes.set(node.id,node);}return node;
 }
 const stack=[];
 for(const match of html.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<(\/?[a-z][a-z0-9-]*)\b([^>]*)>/gi)){
  const tag=match[1].toUpperCase(),attrs=match[2];
  if(tag.startsWith('/')){const closing=tag.slice(1),index=stack.findLastIndex(node=>node.tagName===closing);if(index>=0)stack.length=index;continue;}
  const attributes=Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
  for(const name of ['hidden','disabled','data-close'])if(new RegExp(`(?:^|\\s)${name}(?:\\s|$)`).test(attrs))attributes[name]='';
  const node=makeNode(tag,attributes,stack.at(-1)??null);if(!voidTags.has(tag)&&!attrs.trimEnd().endsWith('/'))stack.push(node);
 }
 const dialogs=allNodes.filter(n=>n.tagName==='DIALOG'),touchButtons=allNodes.filter(n=>n.tagName==='BUTTON'&&'action'in n.dataset),closeButtons=allNodes.filter(n=>'data-close'in n.attributes);
 assert.equal(dialogs.length,3);assert.equal(touchButtons.length,5);assert.equal(closeButtons.length,5);
 const body=allNodes.find(n=>n.tagName==='BODY'),root=allNodes.find(n=>n.tagName==='HTML');assert(body&&root);
 document={...eventTarget(),hidden:false,body,documentElement:root,activeElement:body,getElementById:id=>nodes.get(id)??null,querySelectorAll(selector){
  if(selector==='dialog')return dialogs;if(selector==='dialog[open]')return dialogs.filter(n=>n.open);if(selector==='#touchControls button')return touchButtons;if(selector==='[data-close]')return closeButtons;
  return allNodes.filter(n=>n.matches(selector));
 },createElement:tag=>{assert.equal(tag,'canvas');return createCanvas(1,1);}};
 for(const id of ['gameCanvas','nextCanvas','nextMobile']){const node=nodes.get(id),surface=createCanvas(id==='gameCanvas'?288:128,id==='gameCanvas'?512:100);Object.assign(node,{width:surface.width,height:surface.height,getContext:()=>surface.getContext('2d'),getBoundingClientRect:()=>({width:288}),canvas:surface});}
 class CALayerRenderer extends ActualRenderer{constructor(options){super({...options,createCanvas:()=>createCanvas(1,1)});}}
 const window=eventTarget(),workers=[],workerMessages=[],posts=[],outbox=[];let stamp=0,rafId=0,timerId=0;const raf=new Map(),timers=new Map(),storage=new Map();
 const flush=()=>{let count=0;while(outbox.length){assert(++count<1000,'bounded real worker delivery');const[worker,data]=outbox.shift();worker.onmessage({data});}return count;};
 class Worker{
  constructor(url,options){assert.equal(String(url),new URL('simulation-worker.mjs',base).href);assert.equal(options.name,`grainform-${Geometry.VERSION}-simulation`);workers.push(this);this.runtime=createSimulationRuntime({now:()=>stamp,timeOrigin:0,setTimer:()=>1,clearTimer(){},post:(message,transfer=[])=>{const data=structuredClone(message,{transfer});posts.push(data);outbox.push([this,data]);}});}
  postMessage(message){workerMessages.push(structuredClone(message));this.runtime.receive(structuredClone(message));}
  terminate(){this.runtime.dispose();}
 }
 const context={...Geometry,...Palette,SettleAnchors,decodeSnapshotWire,CALayerRenderer,MaterialFrameQueue,document,window,Worker,URL,URLSearchParams,structuredClone,devicePixelRatio:1,location:{search:'?qa&seed=1'},matchMedia:()=>({matches:false}),performance:{now:()=>++stamp,timeOrigin:0},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>{sets.push([key,value]);storage.set(key,String(value));}},requestAnimationFrame:fn=>{raf.set(++rafId,fn);return rafId;},cancelAnimationFrame:id=>raf.delete(id),setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId;},clearTimeout:id=>timers.delete(id),console:{error:error=>errors.push(String(error)),log(){}}};
 vm.createContext(context);vm.runInContext(source.replace(/^import .*;\n/gm,'').replace(/\bexport /g,'').replaceAll('import.meta.url',JSON.stringify(appURL.href)),context);
 await window.grainformBoot;assert.deepEqual(errors,[],'actual app boot');assert(window.grainformQA);flush();assert.equal(window.grainformQA.read().failed,false);assert.equal(window.grainformQA.read().ready,true);
 const key=(type,code,details={})=>window.dispatch(type,{code,target:document.activeElement,repeat:false,...details});
 // An explicit browser-default ACTION MODEL, not a trusted KeyboardEvent or
 // native activation test. Production click handlers and worker are real.
 function modelButtonActivation(button,code){
  assert.equal(button.tagName,'BUTTON');assert(['Enter','Space'].includes(code));button.focus();let clicks=0;
  const down=key('keydown',code);if(code==='Enter'&&!down.defaultPrevented&&!button.disabled){button.dispatch('click',{detail:0});clicks++;}
  const up=key('keyup',code);if(code==='Space'&&!down.defaultPrevented&&!up.defaultPrevented&&!button.disabled){button.dispatch('click',{detail:0});clicks++;}
  flush();return{down,up,clicks};
 }
 return{document,window,nodes,allNodes,dialogs,touchButtons,closeButtons,workerMessages,posts,outbox,raf,timers,flush,advance:ms=>{stamp+=ms;workers[0].runtime.pump();flush();},key,modelButtonActivation,qa:window.grainformQA,runtime:workers[0].runtime,html,source,makeFixture:(tag,attributes={},parent=body)=>makeNode(tag,attributes,parent),dispose:()=>workers.forEach(worker=>worker.runtime.dispose()),command:async(name,value)=>{const promise=window.grainformQA.command(name,value);flush();return await promise;}};
}
