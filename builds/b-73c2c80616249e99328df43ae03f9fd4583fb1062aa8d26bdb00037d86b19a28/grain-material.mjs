// Variant interface: change only this constant in the square branch.
export const GRAIN_SHAPE = 'mineral';
export const GRAIN_OFFSET_BOUND = .18;
// Presentation only. Diameter is the maximum distance between outline vertices:
// opposite +/-radius tips guarantee the original grid-unit circle diameter. Camera pitch 3 doubles the world diameter relative to the frozen 1.5-pitch 0.4.12.
// Four mineral-like silhouettes, sixteen stable orientations, twelve tones.
// No time-dependent noise, per-pixel shader, gradients or physics rescaling.
export const GRAIN_DIAMETER_SCALE = .95625;
const RADII = [
 [1,.99,.98,.96,.99,.98,1,.97,.99,.97,.98,.99],
 [1,.98,.97,.99,.98,.96,1,.99,.98,.97,.99,.98],
 [1,.96,.99,.97,.98,.99,1,.98,.96,.99,.97,.99],
 [1,.99,.96,.98,.97,.99,1,.96,.99,.98,.99,.97],
];
// 0.5.2 fixed-ID flank contraction. Keep both maximum-diameter tips;
// perpendicular width is 94%, polygon area is 94%. No contact-state mutation.
export const GRAIN_FLANK_SCALE = .94;
const SHAPES=RADII.map(radii=>radii.flatMap((r,i)=>[Math.cos(i*Math.PI/6)*r,Math.sin(i*Math.PI/6)*r*GRAIN_FLANK_SCALE]));
export const GRAIN_OUTLINES = Object.freeze(SHAPES.flatMap(shape => Array.from({length:16},(_,orientation)=>{
  const angle=orientation*Math.PI/8,c=Math.cos(angle),s=Math.sin(angle);
  return Object.freeze(Array.from({length:12},(_,i)=>Object.freeze([shape[i*2]*c-shape[i*2+1]*s,shape[i*2]*s+shape[i*2+1]*c])));
})));
export function appendGrainPath(context,x,y,style,scale=1) {
  const r=style.radius*scale,points=style.outline;
  context.moveTo(x+points[0][0]*r,y+points[0][1]*r);
  for(let i=1;i<points.length;i++)context.lineTo(x+points[i][0]*r,y+points[i][1]*r);
  context.closePath();
}

export const GRAIN_LIGHT_EDGES = Object.freeze(GRAIN_OUTLINES.map(points=>{let edge=0,light=Infinity;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],v=a[0]+a[1]+b[0]+b[1];if(v<light){light=v;edge=i;}}return edge;}));
