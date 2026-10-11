// Shared logical dimensions. One material cell stays one logical pixel.
export const VERSION='0.4.11';
export const WIDTH=288, HEIGHT=512, BLOCK=24;
// The canvas content box is the playable field; its CSS border is outside it.
export const LEFT=0, RIGHT=WIDTH, FLOOR=HEIGHT;
export const FIELD_WIDTH=RIGHT-LEFT, FIELD_HEIGHT=FLOOR;
export const BOARD=Object.freeze({width:WIDTH,height:HEIGHT,left:LEFT,right:RIGHT,floor:FLOOR,fieldWidth:FIELD_WIDTH,fieldHeight:FIELD_HEIGHT,cell:1});
// Initial rigid speed: original 0.4.10 base +7%; unchanged level/piece ramp and cap.
export const rigidFallSpeed=(level,pieces)=>180*Math.min(1.45,.24*1.07+(level-1)*.065+Math.min(.4,pieces*.002));
