// One bounded whole-grain matte palette experiment, on the unchanged288 grid.
export const RASTER_SCALE=2;
const NORMAL=[[12,17,19],[234,195,112],[79,192,179],[211,120,163]];
const ACCESSIBLE=[[12,17,19],[255,218,120],[69,146,212],[241,114,182]];
export const GRAIN_COLORS={normal:NORMAL,contrast:ACCESSIBLE};
// Frozen four-tone ramps: average grain color, not pin highlights or animated noise.
const MATTE=[
 [[12,17,19],[12,17,19],[12,17,19],[12,17,19]],
 [[213,172,94],[228,185,104],[236,199,118],[244,208,127]],
 [[64,170,158],[74,185,172],[84,195,183],[91,205,191]],
 [[188,100,142],[202,112,155],[214,124,168],[222,134,177]]
];
// Material bytes are stable seeds, not ordered luminance. A fixed bijection
// preserves exact tone proportions without revealing linear fixture seed sequences.
const TONE=(()=>{const ranks=Uint8Array.from({length:256},(_,i)=>i);let seed=0x713d5a49;for(let i=255;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1),value=ranks[i];ranks[i]=ranks[j];ranks[j]=value;}return ranks.map(m=>m<26?0:m<102?1:m<204?2:3);})();
export function grainTone(material){return TONE[material&255];}
export function grainIndex(color,material,geometry,pattern=0,clear=false){return(((color*4+grainTone(material))*16+geometry)*4+(clear?2:0)+pattern)*8;}
function palette(contrast){
 const data=new Uint8ClampedArray(4*4*16*4*8*4),words=new Uint32Array(data.buffer),background=NORMAL[0];
 for(let c=0;c<4;c++)for(let tone=0;tone<4;tone++)for(let exposed=0;exposed<16;exposed++)for(let flags=0;flags<4;flags++)for(let sample=0;sample<8;sample++){
  const q=sample%4;let shade=0;
  if(c){
   if((exposed&1)&&q<2)shade+=2;if((exposed&2)&&!(q&1))shade+=1;
   if((exposed&4)&&(q&1))shade-=1;if((exposed&8)&&q>=2)shade-=2;
   if(contrast)shade+=(c===1?(flags&1?3:-57):c===2?(flags&1?72:-9):(flags&1?7:-69))*.6;
   if(flags&2)shade+=24;
  }
  const base=contrast?ACCESSIBLE[c]:MATTE[c][tone],toneShade=contrast&&c?[-10,-4,1,7][tone]:0;
  const alpha=c&&sample>=4?.60+tone*.035:1,index=((((c*4+tone)*16+exposed)*4+flags)*8+sample)*4;
  for(let ch=0;ch<3;ch++)data[index+ch]=(base[ch]+toneShade+shade)*alpha+background[ch]*(1-alpha);data[index+3]=255;
 }
 return words;
}
const palettes=[palette(false),palette(true)];
export function grainPalette(contrast){return palettes[+!!contrast];}
export function cornerMask(g,w,h,x,y,color){const i=y*w+x,u=y>0&&g[i-w],d=y<h-1&&g[i+w],l=x>0&&g[i-1],r=x<w-1&&g[i+1];let mask=0;
 if(!u&&!l&&!(x>0&&y>0&&g[i-w-1]===color))mask|=1;if(!u&&!r&&!(x<w-1&&y>0&&g[i-w+1]===color))mask|=2;
 if(!d&&!l&&!(x>0&&y<h-1&&g[i+w-1]===color))mask|=4;if(!d&&!r&&!(x<w-1&&y<h-1&&g[i+w+1]===color))mask|=8;return mask;
}
export function grainAppearance(g,w,h,x,y,color){const i=y*w+x,exposed=(y===0||!g[i-w]?1:0)|(x===0||!g[i-1]?2:0)|(x===w-1||!g[i+1]?4:0)|(y===h-1||!g[i+w]?8:0);return exposed*16+(exposed?cornerMask(g,w,h,x,y,color):0);}
export function grainGeometry(...args){return grainAppearance(...args)>>>4;}
export function buildAppearances(g,m,w,h,codes){for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;codes[i]=g[i]?grainAppearance(g,w,h,x,y,g[i]):0;}return codes;}
export function writeGrain(words,p,stride,packed,index,mask=0){words[p]=packed[index+(mask&1?4:0)];words[p+1]=packed[index+1+(mask&2?4:0)];words[p+stride]=packed[index+2+(mask&4?4:0)];words[p+stride+1]=packed[index+3+(mask&8?4:0)];}
