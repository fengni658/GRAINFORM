// Independent CPU owner field for the explicit Float32 GPU competition contract.
// Test-only. It never runs in the game.
import {SURFACE_MATERIALS} from '../../dist/preview/surface-grains.js';
export function gpuOwnerOracle(g,m,w,h){
 const rw=w*2,n=rw*h*2,best=new Float32Array(n).fill(16),next=new Float32Array(n).fill(16),winner=new Uint32Array(n),runner=new Uint32Array(n);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,c=g[i],d=SURFACE_MATERIALS[m[i]];if(!c||!d.anchor)continue;
  for(let yy=Math.max(0,y-4);yy<Math.min(h,y+5);yy++)for(let xx=Math.max(0,x-4);xx<Math.min(w,x+5);xx++){
   if(g[yy*w+xx]!==c)continue;
   for(let q=0;q<4;q++){
    const px=xx*2+(q&1),py=yy*2+(q>>1),p=py*rw+px,dx=(px+.5)/2-(x+.5+d.jx),dy=(py+.5)/2-(y+.5+d.jy);
    if(px<Math.floor((x+.5+d.jx-3.4)*2)||px>=Math.ceil((x+.5+d.jx+3.4)*2)||py<Math.floor((y+.5+d.jy-3.4)*2)||py>=Math.ceil((y+.5+d.jy+3.4)*2))continue;
    const u=dx*d.a+dy*d.b,v=-dx*d.b+dy*d.a,raw=u*u/d.aspect+v*v*d.aspect;if(raw>3.4*3.4)continue;const value=Math.fround(raw);
    if(value<best[p]){next[p]=best[p];runner[p]=winner[p];best[p]=value;winner[p]=i+1;}
    else if(value<next[p]){next[p]=value;runner[p]=i+1;}
   }
  }
 }
 return{winner,runner,best,next};
}
