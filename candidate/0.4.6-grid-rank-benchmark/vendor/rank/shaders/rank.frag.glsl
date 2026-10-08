#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uNextAnchors;
uniform sampler2D uOldEven;
uniform sampler2D uOldOdd;
uniform ivec2 uStateSize;
uniform int uSlotCapacity;
// Output: rank, destination cell x, destination cell y, self occurrence count.
// All living slots retain this tuple, including rank >=17. Dead/padding use w=0.
layout(location=0) out vec4 outRank;
ivec2 positionCell(vec4 p) {
  int packed = int(abs(p.z)) - 1;
  return ivec2(packed % 256 - 128, packed / 256 - 1024);
}
bool inGrid(ivec2 c) { return all(greaterThanEqual(c,ivec2(0))) && all(lessThan(c,ivec2(58,110))); }
float oldSlotAt(ivec2 cell,int layer) {
  ivec2 at=cell+ivec2(0,(layer/2)*110);
  return layer%2==0?texelFetch(uOldEven,at,0).x:texelFetch(uOldOdd,at,0).x;
}
void main() {
  ivec2 at=ivec2(gl_FragCoord.xy);
  int slot=at.y*uStateSize.x+at.x;
  outRank=vec4(-1.0,0.0,0.0,0.0);
  if(slot>=uSlotCapacity) return;
  vec4 p=texelFetch(uNextAnchors,at,0);
  if(p.z<=0.0) return;
  if(p.z>=16777216.0 || any(isnan(p)) || any(isinf(p))) { outRank.w=-1.0; return; }
  ivec2 target=positionCell(p);
  if(!inGrid(target)) { outRank.w=-1.0; return; }
  int rank=0,selfCount=0;
  for(int dy=-1;dy<=1;dy++) for(int dx=-1;dx<=1;dx++) {
    ivec2 cell=target+ivec2(dx,dy);
    if(!inGrid(cell)) continue;
    for(int layer=0;layer<16;layer++) {
      int other=int(oldSlotAt(cell,layer))-1;
      if(other<0) break;
      if(other>=uSlotCapacity) { outRank.w=-1.0; return; }
      vec4 q=texelFetch(uNextAnchors,ivec2(other%uStateSize.x,other/uStateSize.x),0);
      if(q.z<=0.0 || q.z>=16777216.0) continue;
      if(any(notEqual(positionCell(q),target))) continue;
      if(other==slot) selfCount++;
      if(other<slot) rank++;
    }
  }
  outRank=vec4(float(rank),vec2(target),float(selfCount));
}
