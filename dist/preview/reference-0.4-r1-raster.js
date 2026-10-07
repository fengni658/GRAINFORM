// Two display samples per physical-cell axis; physics remains exactly 288×432.
// Fractional coverage is confined to exposed corners, never painted into an empty cell.
export const RASTER_SCALE=2;
const NORMAL=[[12,17,19],[234,195,112],[79,192,179],[211,120,163]];
const ACCESSIBLE=[[12,17,19],[255,218,120],[69,146,212],[241,114,182]];
export const GRAIN_COLORS={normal:NORMAL,contrast:ACCESSIBLE};
function palette(colors,contrast){
 const channels=new Uint8ClampedArray(4*32*16*8*4),words=new Uint32Array(channels.buffer),background=colors[0];
 for(let c=0;c<4;c++)for(let m=0;m<32;m++)for(let lights=0;lights<8;lights++)for(let pattern=0;pattern<2;pattern++)for(let corner=0;corner<8;corner++){
  const q=corner%4,clipped=corner>=4;
  // Stable mineral albedo follows the physical grain; tiny directional facets add depth.
  let shade=c?(m-15.5)*.72+[3.5,1,-1.5,-4][q]*(.6+(m%5)*.13):0;
  if(c){if(lights&1)shade+=q<2?6:1;else shade-=1.5;if(lights&2)shade+=q%2===0?1.5:-1;
   if(contrast)shade+=(c===1?(pattern?3:-57):c===2?(pattern?72:-9):(pattern?7:-69))*.6;
   if(lights&4)shade+=24;
  }
  const coverage=c&&clipped?.58+(m%3)*.06:1,index=(((c*32+m)*16+lights*2+pattern)*8+corner)*4;
  for(let ch=0;ch<3;ch++)channels[index+ch]=(colors[c][ch]+shade)*coverage+background[ch]*(1-coverage);
  channels[index+3]=255;
 }
 return words;
}
const palettes=[palette(NORMAL,false),palette(ACCESSIBLE,true)];
export function grainPalette(contrast){return palettes[+!!contrast];}
export function cornerMask(grid,w,h,x,y,color){
 const i=y*w+x,up=y>0&&grid[i-w],down=y<h-1&&grid[i+w],left=x>0&&grid[i-1],right=x<w-1&&grid[i+1];
 let mask=0;
 // Preserve the visual point contact of eight-connected same-color grains.
 if(!up&&!left&&!(x>0&&y>0&&grid[i-w-1]===color))mask|=1;
 if(!up&&!right&&!(x<w-1&&y>0&&grid[i-w+1]===color))mask|=2;
 if(!down&&!left&&!(x>0&&y<h-1&&grid[i+w-1]===color))mask|=4;
 if(!down&&!right&&!(x<w-1&&y<h-1&&grid[i+w+1]===color))mask|=8;
 return mask;
}
export function writeGrain(words,p,stride,packed,index,mask=0){
 words[p]=packed[index+(mask&1?4:0)];words[p+1]=packed[index+1+(mask&2?4:0)];
 words[p+stride]=packed[index+2+(mask&4?4:0)];words[p+stride+1]=packed[index+3+(mask&8?4:0)];
}
