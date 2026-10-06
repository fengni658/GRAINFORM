// Synthetic event/DOM harness only. It does not validate browser rendering or native input.
import fs from 'node:fs';
let run=0;
class Target {
  constructor(){this.listeners=new Map();}
  addEventListener(type,fn){const a=this.listeners.get(type)||[];a.push(fn);this.listeners.set(type,a);}
  dispatch(type,props={}){const event={type,target:this,detail:1,repeat:false,preventDefault(){this.defaultPrevented=true;},...props};for(const fn of this.listeners.get(type)||[])fn(event);return event;}
}
class Element extends Target{
  constructor(tag,attrs={}){super();this.tagName=tag.toUpperCase();this.attrs=attrs;this.id=attrs.id||'';this.open=false;this.hidden='hidden'in attrs;this.disabled='disabled'in attrs;this.checked=false;this.textContent='';this.innerHTML='';this.style={};this.dataset={};for(const k in attrs)if(k.startsWith('data-'))this.dataset[k.slice(5)]=attrs[k];const classes=new Set((attrs.class||'').split(' '));this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,value){if(value===undefined)value=!classes.has(x);value?classes.add(x):classes.delete(x);}};this.width=Number(attrs.width||0);this.height=Number(attrs.height||0);this.captures=new Set();}
  setAttribute(k,v){this.attrs[k]=v;}
  blur(){if(document.activeElement===this)document.activeElement=document.body;}
  focus(){document.activeElement=this;}
  showModal(){this.open=true;}
  close(){this.open=false;this.dispatch('close');}
  setPointerCapture(id){this.captures.add(id);}
  replaceChildren(...children){this.children=children;}
  append(c){(this.children??=[]).push(c);}
  closest(selector){for(let n=this;n;n=n.parent){if(selector[0]==='.'?n.classList.contains(selector.slice(1)):n.tagName.toLowerCase()===selector)return n;}return null;}
  getContext(){if(!this.context){const draws=[];const target={draws,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(image){this.lastImage=new Uint8ClampedArray(image.data);},fillRect(...args){draws.push({args,fillStyle:this.fillStyle});if(draws.length>5000)draws.splice(0,2500);}};this.context=new Proxy(target,{get:(t,p)=>t[p]||(()=>{}),set:(t,p,v)=>(t[p]=v,true)});}return this.context;}
}
export async function harness({initial={},denyRead=false,denyWrite=false,search='?qa'}={}){
  let now=0,pendingFrame;
  const document=new Target(),window=new Target(),storage=new Map(Object.entries(initial));
  const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),elements=[];
  const stack=[];
  for(const match of html.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)){
    if(match[1]){while(stack.length){if(stack.pop().tagName===match[2].toUpperCase())break;}continue;}
    const attrs={};for(const a of match[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??'';
    const e=new Element(match[2],attrs);e.parent=stack.at(-1)||null;elements.push(e);
    if(!['meta','link','input','br','img','hr'].includes(match[2])&&!match[3].endsWith('/'))stack.push(e);
  }
  document.body=elements.find(x=>x.tagName==='BODY');document.activeElement=document.body;document.hidden=false;
  document.querySelectorAll=s=>elements.filter(e=>s[0]==='#'?e.id===s.slice(1):s[0]==='['?s.slice(1,-1) in e.attrs:e.tagName.toLowerCase()===s);
  document.created=[];document.querySelector=s=>document.querySelectorAll(s)[0];document.createElement=tag=>{const e=new Element(tag);document.created.push(e);return e;};document.createTextNode=text=>({textContent:text});
  Object.assign(globalThis,{document,window,location:{search},performance:{now:()=>now},matchMedia:()=>({matches:false}),requestAnimationFrame:cb=>{pendingFrame=cb;return 1;},localStorage:{getItem(k){if(denyRead)throw Error('Denied');return storage.get(k)??null;},setItem(k,v){if(denyWrite)throw Error('QuotaExceeded');storage.set(k,String(v));},removeItem(k){if(denyWrite)throw Error('Denied');storage.delete(k);}}});
  await import(`${new URL('../dist/app.js',import.meta.url).href}?independent=${++run}`);
  return {api:window.__grainform,window,document,storage,el:id=>document.querySelector('#'+id),control:action=>elements.find(e=>e.dataset.action===action),frame(count=1){for(let i=0;i<count;i++){now+=1000/60+.0001;pendingFrame(now);}},key(code,props={}){return window.dispatch('keydown',{code,...props});},up(code){window.dispatch('keyup',{code});}};
}
