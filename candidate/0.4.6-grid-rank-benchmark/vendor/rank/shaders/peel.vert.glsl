#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uAnchors;
uniform sampler2D uPreviousLayer;
uniform ivec2 uStateSize;
uniform int uSlotCapacity;
uniform int uLayer;
flat out float vEncodedSlot;
ivec2 positionCell(vec4 p) {
  int packed = int(abs(p.z)) - 1;
  return ivec2(packed % 256 - 128, packed / 256 - 1024);
}
void main() {
  int slot = gl_VertexID;
  vec4 p = texelFetch(uAnchors, ivec2(slot % uStateSize.x, slot / uStateSize.x), 0);
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 1.0;
  vEncodedSlot = float(slot + 1);
  if (p.z <= 0.0 || p.z >= 16777216.0 || any(isnan(p)) || any(isinf(p))) return;
  ivec2 cell = positionCell(p);
  if (any(lessThan(cell, ivec2(0))) || any(greaterThanEqual(cell, ivec2(58,110)))) return;
  if (uLayer > 0) {
    float previous = texelFetch(uPreviousLayer, cell + ivec2(0, ((uLayer - 1) / 2) * 110), 0).x;
    if (previous < 0.5 || vEncodedSlot <= previous) return;
  }
  vec2 ndc = (vec2(cell) + 0.5) / vec2(58.0,110.0) * 2.0 - 1.0;
  float depth = float(slot + 1) / float(uSlotCapacity + 1);
  gl_Position = vec4(ndc, depth * 2.0 - 1.0, 1.0);
}
