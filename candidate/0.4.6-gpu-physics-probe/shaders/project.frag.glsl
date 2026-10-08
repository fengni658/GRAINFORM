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
uniform vec2 uGridOrigin;
uniform float uCell;
uniform int uCount;
uniform float uRadius;
uniform float uDiameter;
uniform float uContactSkin;
uniform float uLeft;
uniform float uRight;
uniform float uFloor;
uniform float uIterationCap;
uniform float uContactDivisor;
uniform float uTangentialFriction;
uniform int uShock;
uniform float uShockHeightBias;
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outDiagnostics;
float encodedIdAt(ivec2 cell, int slot) {
  ivec2 at = cell + ivec2(0, (slot / 2) * uGridSize.y);
  return (slot % 2 == 0) ? texelFetch(uEvenBuckets, at, 0).x : texelFetch(uOddBuckets, at, 0).x;
}
bool finite2(vec2 v) { return !any(isnan(v)) && !any(isinf(v)); }
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  int id = at.y * uStateSize.x + at.x;
  vec4 p = texelFetch(uPosition, at, 0);
  vec4 grid = texelFetch(uGridPosition, at, 0);
  vec4 diagnostic = texelFetch(uDiagnostics, at, 0);
  outPosition = p;
  outDiagnostics = diagnostic;
  if (id >= uCount || p.z < 0.5) return;
  if (!finite2(p.xy) || !finite2(grid.xy)) {
    outDiagnostics.w = 1.0;
    return;
  }
  ivec2 ownCell = ivec2(floor((grid.xy - uGridOrigin) / uCell));
  bool outOfGrid = any(lessThan(ownCell, ivec2(0))) || any(greaterThanEqual(ownCell, uGridSize));
  outDiagnostics.z = max(diagnostic.z, outOfGrid ? 1.0 : 0.0);
  float touched = p.w;
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
          if (q.z < 0.5) continue;
          vec2 separation = p.xy - q.xy;
          float distanceSquared = dot(separation, separation);
          float target = uDiameter + uContactSkin;
          if (distanceSquared >= target * target) continue;
          float distance = sqrt(max(0.0, distanceSquared));
          vec2 normal = distance > 1e-9 ? separation / distance : vec2(id < other ? -1.0 : 1.0, 0.0);
          bool neighborSleeping = texelFetch(uVelocity, otherAt, 0).z > 0.5;
          float dynamicWeight = uShock == 1 ? 1.0 / (1.0 + exp(separation.y * uShockHeightBias)) : 0.5;
          float weight = neighborSleeping ? 1.0 : dynamicWeight;
          float error = target - distance;
          vec2 relative = (p.xy - texelFetch(uPrevious, at, 0).xy) - (neighborSleeping ? vec2(0.0) : q.xy - texelFetch(uPrevious, otherAt, 0).xy);
          float tangent = -relative.x * normal.y + relative.y * normal.x;
          float friction = clamp(tangent, -uTangentialFriction * error, uTangentialFriction * error) * weight;
          correction += normal * weight * error + vec2(normal.y, -normal.x) * friction;
          contactCount += 1.0;
          touched = 1.0;
        }
      }
    }
  }
  correction /= max(1.0, contactCount * uContactDivisor);
  float magnitude = length(correction);
  if (magnitude > uIterationCap) correction *= uIterationCap / magnitude;
  vec2 next = p.xy + correction;
  vec2 bounded = vec2(clamp(next.x, uLeft + uRadius, uRight - uRadius), min(next.y, uFloor - uRadius));
  if (any(notEqual(next, bounded)) || bounded.y >= uFloor - uRadius - 1e-7) touched = 1.0;
  outPosition = vec4(bounded, p.z, touched);
  outDiagnostics.x = max(diagnostic.x, length(bounded - grid.xy));
  outDiagnostics.y = max(diagnostic.y, overflow ? 1.0 : 0.0);
  outDiagnostics.w = max(diagnostic.w, finite2(bounded) ? 0.0 : 1.0);
}
