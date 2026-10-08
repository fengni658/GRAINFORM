#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;
uniform sampler2D uPosition;
uniform sampler2D uGridPosition;
uniform sampler2D uVelocity;
uniform sampler2D uEvenBuckets;
uniform sampler2D uOddBuckets;
uniform sampler2D uDiagnostics;
uniform sampler2D uPrevious;
uniform ivec2 uStateSize;
uniform ivec2 uGridSize;
uniform int uCount;
uniform float uDiameter;
uniform float uContactSkin;
uniform float uContactActivationDepth;
uniform float uIterationCap;
uniform float uContactDivisor;
uniform float uTangentialFriction;
uniform int uShock;
uniform float uShockHeightBias;
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outDiagnostics;
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
float encodedIdAt(ivec2 cell, int slot) {
  ivec2 at = cell + ivec2(0, (slot / 2) * uGridSize.y);
  return (slot % 2 == 0) ? texelFetch(uEvenBuckets, at, 0).x : texelFetch(uOddBuckets, at, 0).x;
}
bool finite4(vec4 v) { return !any(isnan(v)) && !any(isinf(v)); }
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  int id = at.y * uStateSize.x + at.x;
  vec4 p = texelFetch(uPosition, at, 0);
  vec4 grid = texelFetch(uGridPosition, at, 0);
  vec4 diagnostic = texelFetch(uDiagnostics, at, 0);
  outPosition = p;
  outDiagnostics = diagnostic;
  if (id >= uCount) return;
  if (!finite4(p) || !finite4(grid)) { outDiagnostics.w = 1.0; return; }
  if (p.z <= 0.0) return;
  if (!validCellCode(p.z) || !validCellCode(grid.z)) { outDiagnostics.z = 1.0; return; }
  ivec2 ownCell = positionCell(grid);
  bool outOfGrid = any(lessThan(ownCell, ivec2(0))) || any(greaterThanEqual(ownCell, uGridSize));
  outDiagnostics.z = max(diagnostic.z, outOfGrid ? 1.0 : 0.0);
  float strength = p.w;
  vec2 correction = vec2(0.0);
  float contactCount = 0.0;
  bool overflow = false;
  if (!outOfGrid) {
    for (int oy = -1; oy <= 1; ++oy) {
      for (int ox = -1; ox <= 1; ++ox) {
        ivec2 cell = ownCell + ivec2(ox, oy);
        if (any(lessThan(cell, ivec2(0))) || any(greaterThanEqual(cell, uGridSize))) continue;
        overflow = overflow || encodedIdAt(cell, 16) > 0.5;
        for (int slot = 0; slot < 16; ++slot) {
          int other = int(encodedIdAt(cell, slot)) - 1;
          if (other < 0) break;
          if (other == id || other >= uCount) continue;
          ivec2 otherAt = ivec2(other % uStateSize.x, other / uStateSize.x);
          vec4 q = texelFetch(uPosition, otherAt, 0);
          if (q.z <= 0.0 || !validCellCode(q.z)) continue;
          vec2 separation = positionDifference(p, q);
          float distanceSquared = dot(separation, separation);
          float target = uDiameter + uContactSkin;
          if (distanceSquared >= target * target) continue;
          float distance = sqrt(max(0.0, distanceSquared));
          vec2 normal = distance > 1e-9 ? separation / distance : vec2(id < other ? -1.0 : 1.0, 0.0);
          bool neighborSleeping = texelFetch(uVelocity, otherAt, 0).z > 0.5;
          float dynamicWeight = uShock == 1 ? 1.0 / (1.0 + exp(separation.y * uShockHeightBias)) : 0.5;
          float weight = neighborSleeping ? 1.0 : dynamicWeight;
          float error = target - distance;
          vec2 relative = positionDifference(p, texelFetch(uPrevious, at, 0)) - (neighborSleeping ? vec2(0.0) : positionDifference(q, texelFetch(uPrevious, otherAt, 0)));
          float tangent = -relative.x * normal.y + relative.y * normal.x;
          float friction = clamp(tangent, -uTangentialFriction * error, uTangentialFriction * error) * weight;
          correction += normal * weight * error + vec2(normal.y, -normal.x) * friction;
          float contactStrength = smoothstep(0.0, uContactActivationDepth, error);
          contactCount += contactStrength;
          strength = max(strength, contactStrength);
        }
      }
    }
  }
  correction /= max(1.0, contactCount * uContactDivisor);
  float magnitude = length(correction);
  if (magnitude > uIterationCap) correction *= uIterationCap / magnitude;
  vec4 next = normalizedPosition(p.xy + correction, positionCell(p), strength);
  if (!finite4(next)) { outPosition = next; outDiagnostics.w = 1.0; return; }
  if (!validCellCode(next.z)) { outPosition = next; outDiagnostics.z = 1.0; return; }
  ivec2 cell = positionCell(next);
  // Exact local coordinates for center boundaries; no absolute-world float math.
  if (cell.x < 0 || (cell.x == 0 && next.x < 0.875)) { cell.x = 0; next.x = 0.875; strength = 1.0; }
  if (cell.x > 57 || (cell.x == 57 && next.x > 3.125)) { cell.x = 57; next.x = 3.125; strength = 1.0; }
  if (cell.y > 108 || (cell.y == 108 && next.y >= 3.125)) { cell.y = 108; next.y = 3.125; strength = 1.0; }
  next = normalizedPosition(next.xy, cell, strength);
  outPosition = next;
  outDiagnostics.x = max(diagnostic.x, length(positionDifference(next, grid)));
  outDiagnostics.y = max(diagnostic.y, overflow ? 1.0 : 0.0);
  outDiagnostics.w = max(diagnostic.w, finite4(next) ? 0.0 : 1.0);
}
