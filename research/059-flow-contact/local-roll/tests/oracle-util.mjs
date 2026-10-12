import {createCanvas,G,candidate} from './probe-util.mjs';
import {pathToFileURL} from 'node:url';import path from 'node:path';const {GRAIN_SHAPE}=await import(pathToFileURL(path.join(candidate,'grain-material.mjs')));
const colors=['','#eac370','#4fc0b3','#d378a3','#789fef'];
function unit(id,salt){let h=Math.imul((id>>>0)^salt,0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);return ((h^(h>>>16))>>>0)/4294967295;}
function fill(id,color){const brightness=.84+Math.min(11,Math.floor(unit(id,0x1b56c4e9)*12))*.22/11,n=parseInt(colors[color].slice(1),16);return `rgb(${[16,8,0].map(s=>Math.min(255,Math.round(((n>>>s)&255)*brightness))).join(',')})`;}
// Independent material oracle: no CALayerRenderer.paint, materialStyle, grain
// path, tile cache or activity group. Flash-selection mask is production code
// and separately covered by the inherited lifecycle/occlusion regression suite.
export function fullDraw(r,W=288,H=512,selection=null){const c=createCanvas(W,H),x=c.getContext('2d');x.setTransform(W/G.WIDTH,0,0,H/G.VIEW_GRID_HEIGHT,0,-G.VIEW_GRID_TOP*H/G.VIEW_GRID_HEIGHT);x.fillStyle='#0d1315';x.fillRect(0,G.VIEW_GRID_TOP,G.WIDTH,G.VIEW_GRID_HEIGHT);if(GRAIN_SHAPE!=='square'){r.paint(x,[...r.bodies.keys()].sort((a,b)=>a-b),r.positions,true);}else for(const id of [...r.bodies.keys()].sort((a,b)=>a-b)){const b=r.bodies.get(id),p=r.positions.get(id)||[b.x,b.y];x.fillStyle=fill(id,b.color);x.fillRect(p[0]-.5,p[1]-.5,1,1);}if(selection){x.globalAlpha=selection.alpha;x.fillStyle=selection.fillStyle;r.drawSelection(x,selection.ids);}return {c,data:x.getImageData(0,0,W,H).data};}
