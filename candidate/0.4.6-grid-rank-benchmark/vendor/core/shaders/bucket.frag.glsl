#version 300 es
precision highp float;
flat in float vEncodedId;
layout(location=0) out vec4 outId;
void main() { outId = vec4(vEncodedId, 0.0, 0.0, 1.0); }
