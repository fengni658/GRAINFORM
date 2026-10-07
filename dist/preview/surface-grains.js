// Visible grains span several simulation cells. Sites are carried material seeds:
// their coordinates move with the real particles, never with time or screen noise.
// Ownership may deform under shear. Collision, color, mass and RNG are untouched.
import {grainPalette,grainIndex,grainAppearance,writeGrain} from './grain-raster.js';
import {textureOffset} from '../palette.js';
export const SURFACE_RADIUS=3.4,SURFACE_HALO=4;
const BACKGROUND=[12,17,19],RAMPS=[null,[[213,172,94],[228,185,104],[236,199,118],[244,208,127]],[[64,170,158],[74,185,172],[84,195,183],[91,205,191]],[[188,100,142],[202,112,155],[214,124,168],[222,134,177]]],ACCESSIBLE=[BACKGROUND,[255,218,120],[69,146,212],[241,114,182]];
import {grainTone} from './grain-raster.js';
const MATTE_WORDS=RAMPS.map((r,c)=>c?r.map(a=>(255<<24|a[2]<<16|a[1]<<8|a[0])>>>0):[0xff13110c]);
const FACE=new Float64Array(256*324),CREASE=new Uint8Array(256*324),OWNER_MATERIAL=new Uint8Array(256*324);
export const SURFACE_MATERIALS=Array.from({length:256},(_,m)=>{
 let h=Math.imul(m+11,2654435761)>>>0;h^=h>>>15;
 const angle=(h&255)*Math.PI/128,aspect=.88+((h>>>8)&31)/100,d={anchor:((h>>>17)&7)===0,jx:(((h>>>3)&15)-7.5)/35,jy:(((h>>>12)&15)-7.5)/35,a:Math.cos(angle),b:Math.sin(angle),aspect,tone:grainTone(m)};
 const footprint=[];if(!d.anchor){d.footprint=footprint;return d;}
 for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){
  const samples=[],ids=[];for(let q=0;q<4;q++){const dx=x+((q&1)?.75:.25)-(.5+d.jx),dy=y+(q>=2?.75:.25)-(.5+d.jy),u=dx*d.a+dy*d.b,v=-dx*d.b+dy*d.a,dist=u*u/aspect+v*v*aspect;const px=x*2+(q&1),py=y*2+(q>=2?1:0),inside=px>=Math.floor((.5+d.jx-SURFACE_RADIUS)*2)&&px<Math.ceil((.5+d.jx+SURFACE_RADIUS)*2)&&py>=Math.floor((.5+d.jy-SURFACE_RADIUS)*2)&&py<Math.ceil((.5+d.jy+SURFACE_RADIUS)*2);samples.push(inside&&dist<=SURFACE_RADIUS*SURFACE_RADIUS?dist:Infinity);const id=m*324+((y+4)*9+x+4)*4+q,direction=(dx+dy)*.7071;ids.push(id);FACE[id]=Math.max(-7,Math.min(5,-direction*3.2));CREASE[id]=direction>.25;OWNER_MATERIAL[id]=m;}
  if(samples.some(Number.isFinite))footprint.push({x,y,samples,ids});
 }
 d.footprint=footprint;return d;
});
function buffers(r,n,w){let s=r.surfaceState;if(!s||s.n!==n)s=r.surfaceState={n,best:new Float32Array(n),second:new Float32Array(n),owner:new Int32Array(n)};
 if(s.w!==w){s.w=w;s.kernels=SURFACE_MATERIALS.map(d=>{const n=d.footprint.length,x=new Int8Array(n),y=new Int8Array(n),cell=new Int32Array(n),pixel=new Int32Array(n),distance=new Float64Array(n*4),ids=new Int32Array(n*4);for(let k=0;k<n;k++){const f=d.footprint[k];x[k]=f.x;y[k]=f.y;cell[k]=f.y*w+f.x;pixel[k]=f.y*w*4+f.x*2;distance.set(f.samples,k*4);ids.set(f.ids,k*4);}return{n,x,y,cell,pixel,distance,ids};});}return s;}
// Recompute an output rectangle using its full source halo, without a full-board
// pass on a local edit. The same routine serves full builds, sprites and dirty tiles.
export function buildSurfaceRegion(r,g,m,w,h,contrast=false,clearMask=null,x0=0,y0=0,x1=w,y1=h){
 const rw=w*2,n=rw*h*2,s=buffers(r,n,w),{best,second,owner}=s,packed=grainPalette(contrast),words=r.words,data=r.im.data;
 for(let y=y0*2;y<y1*2;y++){const start=y*rw+x0*2,end=y*rw+x1*2;best.fill(Infinity,start,end);second.fill(Infinity,start,end);owner.fill(-1,start,end);}
 for(let y=Math.max(0,y0-SURFACE_HALO);y<Math.min(h,y1+SURFACE_HALO);y++)for(let x=Math.max(0,x0-SURFACE_HALO);x<Math.min(w,x1+SURFACE_HALO);x++){
  const i=y*w+x,c=g[i];if(!c)continue;const desc=SURFACE_MATERIALS[m[i]];if(!desc.anchor)continue;
  const kernel=s.kernels[m[i]],base=y*rw*2+x*2;
  for(let k=0;k<kernel.n;k++){const xx=x+kernel.x[k],yy=y+kernel.y[k];if(xx<x0||xx>=x1||yy<y0||yy>=y1||g[i+kernel.cell[k]]!==c)continue;
   const start=base+kernel.pixel[k],at=k*4;
   for(let q=0;q<4;q++){const p=start+(q&1)+(q>=2?rw:0),d=kernel.distance[at+q];if(d<best[p]){second[p]=best[p];best[p]=d;owner[p]=kernel.ids[at+q];}else if(d<second[p])second[p]=d;}
  }
 }
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const i=y*w+x,c=g[i],start=y*2*rw+x*2;
  if(!c){words[start]=words[start+1]=words[start+rw]=words[start+rw+1]=packed[0];continue;}
  const appearance=grainAppearance(g,w,h,x,y,c),mask=appearance&15,pattern=contrast&&textureOffset(c,x,y)>0?1:0,clear=!!clearMask?.[i];
  writeGrain(words,start,rw,packed,grainIndex(c,m[i],appearance>>>4,pattern,clear),mask);
  for(let q=0;q<4;q++){
   const p=start+(q&1)+(q>=2?rw:0),j=owner[p];if(j<0)continue;
   const desc=SURFACE_MATERIALS[OWNER_MATERIAL[j]];
   let shade=FACE[j];const edge=second[p]-best[p];if(edge<1.1&&CREASE[j])shade-=7*(1-edge/1.1);
   if(contrast)shade+=(c===1?(pattern?3:-57):c===2?(pattern?72:-9):(pattern?7:-69))*.6+[-10,-4,1,7][desc.tone];if(clear)shade+=24;
   const clipped=!!(mask&(1<<q));
   if(!contrast&&!clipped&&!clear){words[p]=MATTE_WORDS[c][desc.tone]+Math.round(shade)*0x010101;continue;}
   const color=contrast?ACCESSIBLE[c]:RAMPS[c][desc.tone],offset=p*4;
   for(let ch=0;ch<3;ch++){const value=color[ch]+shade;data[offset+ch]=value;if(clipped)data[offset+ch]=data[offset+ch]*.67+BACKGROUND[ch]*.33;}data[offset+3]=255;
  }
 }
 return s;
}
