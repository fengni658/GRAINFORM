export const STANDARD_COLORS=[[13,19,21],[238,196,104],[79,195,185],[215,113,163]];
export const ACCESSIBLE_COLORS=[[13,19,21],[255,216,107],[48,143,214],[247,100,173]];
export const COLOR_NAMES=['','琥珀色','海青色','玫红色'];
export const PATTERN_NAMES=['','斜纹','点纹','横纹'];
// Grain-aligned, high-contrast patterns remain distinguishable without hue.
export function textureOffset(color,x,y){
  if(color===1)return (x+y)%6<2?-57:3;
  if(color===2)return x%4<2&&y%4<2?72:-9;
  if(color===3)return y%4===0?-69:7;
  return 0;
}
