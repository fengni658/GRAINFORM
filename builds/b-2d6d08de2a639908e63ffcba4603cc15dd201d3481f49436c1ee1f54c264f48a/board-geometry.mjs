// All simulation, wire paths, material contour and renderer tile coordinates are
// GRID units. Only the app camera converts to visible world pixels. Never mix
// grid bodies with world-pixel active blocks or paths.
export const VERSION='0.5.2';
export const WORLD_WIDTH=288,WORLD_HEIGHT=512,WORLD_BLOCK=24,GRAIN_PITCH=3;
export const GRID_ORIGIN_X=0,GRID_ORIGIN_Y=-1;
export const WIDTH=96,HEIGHT=171,BLOCK=8;
export const LEFT=0,RIGHT=WIDTH,FLOOR=HEIGHT,FIELD_WIDTH=WIDTH,FIELD_HEIGHT=HEIGHT;
// Bottom-aligned uniform lattice: 171*3=513 world px. The excess 1px is
// outside the TOP of the viewport. No bottom gap and no anisotropic stretching.
export const VIEW_GRID_TOP=-GRID_ORIGIN_Y/GRAIN_PITCH;
export const VIEW_GRID_HEIGHT=WORLD_HEIGHT/GRAIN_PITCH;
export const gridToWorldX=x=>x*GRAIN_PITCH+GRID_ORIGIN_X;
export const gridToWorldY=y=>y*GRAIN_PITCH+GRID_ORIGIN_Y;
export const worldToGridX=x=>(x-GRID_ORIGIN_X)/GRAIN_PITCH;
export const worldToGridY=y=>(y-GRID_ORIGIN_Y)/GRAIN_PITCH;
export const BOARD=Object.freeze({width:WORLD_WIDTH,height:WORLD_HEIGHT,left:0,right:WORLD_WIDTH,floor:WORLD_HEIGHT,fieldWidth:WORLD_WIDTH,fieldHeight:WORLD_HEIGHT,cell:GRAIN_PITCH,block:WORLD_BLOCK,grid:Object.freeze({width:WIDTH,height:HEIGHT,block:BLOCK,originX:GRID_ORIGIN_X,originY:GRID_ORIGIN_Y,coordinates:'grid',topVisible:VIEW_GRID_TOP})});
export const rigidWorldFallSpeed=(level,pieces)=>180*Math.min(1.45,.24*1.07+(level-1)*.065+Math.min(.4,pieces*.002));
export const rigidFallSpeed=(level,pieces)=>rigidWorldFallSpeed(level,pieces)/GRAIN_PITCH;
