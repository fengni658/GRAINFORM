#version 300 es
precision highp float;
flat in float vEncodedSlot;
layout(location=0) out vec4 outId;
void main() { outId = vec4(vEncodedSlot, 0.0, 0.0, 1.0); }
