# Prototype engineering references

No third-party particle solver is copied. This is a new bounded WebGL2 Jacobi circle prototype; it is not a port of the prior serial PBD or CUDA code.

- NVIDIA GPU Gems3 Chapter32, broad-phase spatial subdivision and safe handling of shared-object collision work: https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-32-broad-phase-collision-detection-cuda
- NVIDIA GPU Gems3 Chapter29, GPU particle-based rigid-body simulation and GPU grid representation: https://developer.nvidia.com/gpugems/gpugems3/part-v-physics-simulation/chapter-29-real-time-rigid-body-simulation-gpus
- Khronos WebGL2 specification, framebuffer feedback and format/API requirements: https://registry.khronos.org/webgl/specs/latest/2.0/

Our WebGL2 bucket builder uses deterministic depth peeling because this available consumer lacks WebGPU. It is not CUDA prefix-sum construction and must be benchmarked including all peeling passes. None of those sources proves the performance of this implementation.
