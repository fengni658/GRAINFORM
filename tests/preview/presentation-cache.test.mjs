import test from'node:test';import assert from'node:assert/strict';
import{GrainRenderer as Reference}from'../../dist/preview/renderer.js';
import{GrainRenderer as Candidate}from'../../dist/preview/renderer.js';
import{Game,SHAPES}from'../../dist/preview/engine.js';
function canvas(main=false){
 const ctx={calls:0,composition:[],createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(im){this.pixels=im.data.slice();},drawImage(source,...geometry){this.calls++;if(geometry.length===4&&geometry[0]===0&&geometry[1]===0)this.composition=[];this.composition.push({type:'image',geometry,pixels:source.context.pixels});},strokeRect(...geometry){this.composition.push({type:'stroke',geometry,stroke:this.strokeStyle,width:this.lineWidth,dash:this.dash});},setLineDash(dash){this.dash=[...dash];}};
 return{main,style:{},width:0,height:0,getBoundingClientRect:()=>({width:384,height:576}),getContext:()=>ctx,context:ctx};
}
test('Whole-frame reuse preserves the exact last composition through active/ghost/clear/preferences/resize changes',()=>{
 globalThis.window={devicePixelRatio:2};globalThis.document={createElement:()=>canvas()};
 const a=new Reference(canvas(true)),b=new Candidate(canvas(true)),g=new Game({seed:18});let options={ghost:true};
 const same=()=>{a.presented=null;a.draw(g,options);b.draw(g,options);assert.deepEqual(b.im.data,a.im.data);assert.deepEqual(b.canvas.context.composition,a.canvas.context.composition);assert.equal(b.canvas.context.imageSmoothingQuality,a.canvas.context.imageSmoothingQuality);};
 same();const count=b.canvas.context.calls;for(let i=0;i<10;i++)same();assert.equal(b.canvas.context.calls,count,'unchanged output must not be recomposited');
 g.start();same();for(let t=0;t<30;t++){g.step();same();same();}
 g.move(20);same();g.rotate();same();g.hardDrop();same();for(let t=0;t<40;t++){g.step();same();same();}
 for(const contrast of[true,false])for(const motion of[true,false])for(const ghost of[true,false]){options={contrast,motion,ghost};same();same();}
 g.clearTimer=12;g.clearMask.fill(1);g.gridVersion++;same();same();g.clearTimer--;same();g.clearTimer=0;g.gridVersion++;same();
 g.pause();same();same();g.resume();same();g.active={shape:SHAPES[1],color:2,x:20,y:0,materialSeed:42};same();same();
 a.canvas.width=b.canvas.width=600;a.canvas.height=b.canvas.height=900;same();same();b.lastRevision=-1;same();
});
