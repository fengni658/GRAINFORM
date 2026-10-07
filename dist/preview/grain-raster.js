// Two display samples per physical-cell axis; physics remains exactly 288×432.
// Coverage stays within each occupied cell; same-color diagonal contacts stay intact.
export const RASTER_SCALE=2;
const NORMAL=[[12,17,19],[234,195,112],[79,192,179],[211,120,163]];
const ACCESSIBLE=[[12,17,19],[255,218,120],[69,146,212],[241,114,182]];
export const GRAIN_COLORS={normal:NORMAL,contrast:ACCESSIBLE};
const FACETS=[[3,1,-1,-3],[12,3,-3,-12]];
// Geometry cues have a maximum two-occupied-cell footprint, not an image-space blur.
const CONTACT=[[0,0,0,0],[12,10,-2,-5],[8,-5,6,-7],[1,-6,-1,-10],[-1,-2,-6,-8],[-5,-4,-2,-2],[-3,-3,-1,-1],[12,7,2,-7],[32,24,24,16],[-16,-24,-24,-32]];
// One mixed stable ID per low-albedo nibble, rather than selecting a fixed brightness class.
export const ANCHOR_MATERIALS=(()=>{const table=new Uint8Array(256);for(let bin=0;bin<16;bin++){let best=0,score=Infinity;for(let m=1;m<256;m++)if((m&15)===bin){let h=Math.imul(m^0x51ed,0x45d9f3b)>>>0;h^=h>>>16;if((h>>>0)<score){best=m;score=h>>>0;}}table[best]=1;}return table;})();
export function grainIndex(color,material,geometry,pattern=0,clear=false){
 const relief=((material>>>5)&3)===0?1:0;
 return ((((color*10+geometry)*4+(clear?2:0)+pattern)*2+relief)*32+(material&31))*8;
}
function palette(colors,contrast){
 const channels=new Uint8ClampedArray(4*10*4*2*32*8*4),words=new Uint32Array(channels.buffer),background=colors[0];
 for(let c=0;c<4;c++)for(let geometry=0;geometry<10;geometry++)for(let flags=0;flags<4;flags++)for(let relief=0;relief<2;relief++)for(let m=0;m<32;m++)for(let corner=0;corner<8;corner++){
  const q=corner%4,clipped=corner>=4,pattern=flags&1,clear=flags&2;
  let shade=0;
  if(c){
   shade=(m-15.5)*.5+FACETS[relief][q]+CONTACT[geometry][q]*(geometry>=8?(contrast?.5:1):(m%2===0?1:.7));
   shade=Math.max(geometry>=8?-34:-20,Math.min(geometry>=8?(contrast?18:30):(contrast?10:16),shade));
   if(contrast)shade+=(c===1?(pattern?3:-57):c===2?(pattern?72:-9):(pattern?7:-69))*.6;
   if(clear)shade+=24;
  }
  const coverage=c&&clipped?.58+(m%3)*.06:1,index=(((((c*10+geometry)*4+flags)*2+relief)*32+m)*8+corner)*4;
  for(let ch=0;ch<3;ch++)channels[index+ch]=(colors[c][ch]+shade)*coverage+background[ch]*(1-coverage);
  channels[index+3]=255;
 }
 return words;
}
const palettes=[palette(NORMAL,false),palette(ACCESSIBLE,true)];
export function grainPalette(contrast){return palettes[+!!contrast];}
function corners(grid,w,h,x,y,color,up,down,left,right){
 const i=y*w+x;let mask=0;
 if(!up&&!left&&!(x>0&&y>0&&grid[i-w-1]===color))mask|=1;
 if(!up&&!right&&!(x<w-1&&y>0&&grid[i-w+1]===color))mask|=2;
 if(!down&&!left&&!(x>0&&y<h-1&&grid[i+w-1]===color))mask|=4;
 if(!down&&!right&&!(x<w-1&&y<h-1&&grid[i+w+1]===color))mask|=8;
 return mask;
}
function contactAppearance(grid,w,h,x,y,color,material){
 const i=y*w+x,up=y>0?grid[i-w]:0,left=x>0?grid[i-1]:0,right=x<w-1?grid[i+1]:0,down=y<h-1?grid[i+w]:0;
 let geometry=0;
 if(!up)geometry=!left?7:1;
 else if(!left)geometry=2;else if(!right)geometry=3;else if(!down)geometry=4;
 else if(up===color&&(material&1)===0&&y>1&&!grid[i-2*w]&&(left===color||right===color))geometry=5;
 else if(up!==color&&(material&3)===0&&(left===color||right===color))geometry=6;
 const mask=!up||!down||!left||!right?corners(grid,w,h,x,y,color,up,down,left,right):0;
 return geometry*16+mask;
}
function eligiblePair(grid,materials,w,h,x,y,color){
 if(x<=0||y<=0||x>=w-2||y>=h-2)return false;
 const i=y*w+x,j=i+w+1;
 if(grid[i]!==color||grid[i+1]!==color||grid[i+w]!==color||grid[j]!==color)return false;
 return contactAppearance(grid,w,h,x,y,color,materials[i])===0&&contactAppearance(grid,w,h,x+1,y+1,color,materials[j])===0;
}
function uniquePair(grid,materials,w,h,x,y,color){
 if(!eligiblePair(grid,materials,w,h,x,y,color))return false;
 // Conflicts suppress both complete pairs; bright/dark cues never accumulate or become orphaned.
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){const nx=x+dx,ny=y+dy,i=ny*w+nx;if(ANCHOR_MATERIALS[materials[i]]&&eligiblePair(grid,materials,w,h,nx,ny,color))return false;}
 return true;
}
export function grainAppearance(grid,w,h,x,y,color,material,materials=null){
 const contact=contactAppearance(grid,w,h,x,y,color,material);if(contact||!materials)return contact;
 if(ANCHOR_MATERIALS[material]&&uniquePair(grid,materials,w,h,x,y,color))return 8*16;
 if(x>0&&y>0&&ANCHOR_MATERIALS[materials[(y-1)*w+x-1]]&&uniquePair(grid,materials,w,h,x-1,y-1,color))return 9*16;
 return 0;
}
export function grainGeometry(grid,w,h,x,y,color,material,materials=null){return grainAppearance(grid,w,h,x,y,color,material,materials)>>>4;}
// The direct per-grain function above remains the reference. Build identical local
// codes once per redraw so both ends do not repeat neighboring-pair eligibility.
export function buildAppearances(grid,materials,w,h,codes,eligible){
 codes.fill(0);eligible.fill(0);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,c=grid[i];if(c)codes[i]=contactAppearance(grid,w,h,x,y,c,materials[i]);}
 for(let y=1;y<h-2;y++)for(let x=1;x<w-2;x++){
  const i=y*w+x,c=grid[i],j=i+w+1;
  if(c&&ANCHOR_MATERIALS[materials[i]]&&!codes[i]&&!codes[j]&&grid[i+1]===c&&grid[i+w]===c&&grid[j]===c)eligible[i]=1;
 }
 for(let y=1;y<h-2;y++)for(let x=1;x<w-2;x++){
  const i=y*w+x;if(!eligible[i])continue;let conflict=false;
  for(let dy=-1;dy<=1&&!conflict;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){const j=i+dy*w+dx;if(eligible[j]&&grid[j]===grid[i]){conflict=true;break;}}
  if(!conflict){codes[i]=8*16;codes[i+w+1]=9*16;}
 }
 return codes;
}
export function cornerMask(grid,w,h,x,y,color){
 const i=y*w+x;return corners(grid,w,h,x,y,color,y>0&&grid[i-w],y<h-1&&grid[i+w],x>0&&grid[i-1],x<w-1&&grid[i+1]);
}
export function writeGrain(words,p,stride,packed,index,mask=0){
 words[p]=packed[index+(mask&1?4:0)];words[p+1]=packed[index+1+(mask&2?4:0)];
 words[p+stride]=packed[index+2+(mask&4?4:0)];words[p+stride+1]=packed[index+3+(mask&8?4:0)];
}
