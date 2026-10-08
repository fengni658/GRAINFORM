#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;
uniform sampler2D uPosition;
uniform sampler2D uPrevious;
uniform float uDt;
uniform float uContactDamping;
uniform float uFloorFriction;
layout(location=0) out vec4 outVelocity;
// RGBA = local x/y in [0,4), signed exact cell code, contact strength.
// Positive code is alive; negative code retains a removed particle; zero is padding.
// 2^24 is reserved for a runtime packing failure, never an aliased cell.
const float INVALID_CELL_CODE = 16777216.0;
bool validCellCode(float code) {
  return !isnan(code) && !isinf(code) && abs(code) >= 1.0 && abs(code) < INVALID_CELL_CODE && floor(abs(code)) == abs(code);
}
ivec2 positionCell(vec4 p) {
  int cellIndex = int(abs(p.z)) - 1;
  return ivec2(cellIndex % 256 - 128, cellIndex / 256 - 1024);
}
vec2 positionDifference(vec4 a, vec4 b) {
  return (a.xy - b.xy) + vec2(positionCell(a) - positionCell(b)) * 4.0;
}
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 p = texelFetch(uPosition, at, 0);
  vec4 old = texelFetch(uPrevious, at, 0);
  if (p.z <= 0.0 || !validCellCode(p.z) || !validCellCode(old.z)) { outVelocity = vec4(0.0); return; }
  vec2 v = positionDifference(p, old) / uDt;
  v *= 1.0 - (1.0 - uContactDamping) * p.w;
  ivec2 cell = positionCell(p);
  if (cell.y > 108 || (cell.y == 108 && p.y >= 3.125 - 1e-6)) v.x *= uFloorFriction;
  // Sleep is intentionally disabled in this prototype.
  outVelocity = vec4(v, 0.0, 0.0);
}
