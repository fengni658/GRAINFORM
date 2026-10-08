#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;
uniform sampler2D uPosition;
uniform sampler2D uVelocity;
uniform float uDt;
uniform float uGravity;
uniform float uVyCap;
layout(location=0) out vec4 outGridPosition;
layout(location=1) out vec4 outPrevious;
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
vec4 normalizedPosition(vec2 local, ivec2 cell, float strength) {
  if (any(isnan(local)) || any(isinf(local))) return vec4(local, INVALID_CELL_CODE, strength);
  vec2 carry = floor(local / 4.0);
  vec2 nextCell = vec2(cell) + carry;
  local -= carry * 4.0;
  // Cancellation next to a boundary can round a small negative remainder to 4.
  vec2 extraCarry = floor(local / 4.0);
  nextCell += extraCarry;
  local -= extraCarry * 4.0;
  if (any(lessThan(nextCell, vec2(-128.0, -1024.0))) || any(greaterThan(nextCell, vec2(127.0, 64511.0)))) {
    return vec4(local, INVALID_CELL_CODE, strength);
  }
  ivec2 next = ivec2(nextCell);
  int code = (next.y + 1024) * 256 + next.x + 128 + 1;
  return vec4(local, float(code), strength);
}
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 p = texelFetch(uPosition, at, 0);
  vec4 v = texelFetch(uVelocity, at, 0);
  outPrevious = p;
  if (p.z <= 0.0) { outGridPosition = p; return; }
  if (!validCellCode(p.z)) { outGridPosition = p; return; }
  vec2 velocity = vec2(v.x, min(uVyCap, v.y + uGravity * uDt));
  outGridPosition = normalizedPosition(p.xy + velocity * uDt, positionCell(p), 0.0);
}
