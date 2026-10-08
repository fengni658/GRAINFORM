#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uRanks;
uniform ivec2 uStateSize;
uniform int uParity;
flat out float vEncodedSlot;
void main() {
  int slot=gl_VertexID;
  vec4 record=texelFetch(uRanks,ivec2(slot%uStateSize.x,slot/uStateSize.x),0);
  gl_Position=vec4(2.0,2.0,2.0,1.0);
  gl_PointSize=1.0;
  vEncodedSlot=float(slot+1);
  int rank=int(record.x);
  if(record.w!=1.0 || rank<0 || rank>=17 || rank%2!=uParity) return;
  ivec2 cell=ivec2(record.yz);
  ivec2 pixel=cell+ivec2(0,(rank/2)*110);
  vec2 ndc=(vec2(pixel)+0.5)/vec2(58.0,990.0)*2.0-1.0;
  gl_Position=vec4(ndc,0.0,1.0);
}
