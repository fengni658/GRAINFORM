import {CONTRACT as C} from './rank-grid.mjs';
const p=(slot,x,y,extra={})=>({slot,x,y,...extra});
export function mergeFixture(count) {
  // Up to 9 old cells, each <=16; all new anchors share cell (28,79).
  const old=[],next=[];
  const near=[139.9,142,144.1], ys=[299.9,302,304.1];
  for(let i=0;i<count;i++) {
    const group=Math.floor(i/16), slot=count-1-i;
    old.push(p(slot,near[group%3],ys[Math.floor(group/3)],{id:`business-${i}`}));
    next.push({...old.at(-1),x:142,y:302});
  }
  return {old,next};
}
export function randomFixture(seed,count=180) {
  let state=seed>>>0;
  const rng=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
  const old=[],next=[];
  for(let i=0;i<count;i++) {
    const slot=count-1-i,x=C.originX+.01+rng()*(C.cols*C.cell-.02),y=C.originY+.01+rng()*(C.rows*C.cell-.02);
    old.push(p(slot,x,y));
    next.push({...old.at(-1),alive:rng()>.12,x:Math.max(C.originX+.001,Math.min(C.originX+C.cols*C.cell-.001,x+(rng()*2-1)*3.999)),y:Math.max(C.originY+.001,Math.min(C.originY+C.rows*C.cell-.001,y+(rng()*2-1)*3.999))});
  }
  return {old,next};
}
export function namedScenarios() {
  return [
    {name:'boundary-crossing',old:[p(30,31.999,3.999),p(1,32.001,4.001)],next:[p(30,32.001,4.001),p(1,31.999,3.999)]},
    {name:'negative-world-y',old:[p(7,140,-15.99),p(2,140,-12.01)],next:[p(7,140,-12.01),p(2,140,-15.99)]},
    {name:'explicit-deletion',old:[p(7,140,300),p(2,140.1,300),p(3,140.2,300)],next:[p(7,140,300),p(2,140.1,300,{alive:false}),p(3,140.2,300)]},
    {name:'sixteen-merge',...mergeFixture(16)},
    {name:'seventeenth-overflow',...mergeFixture(17)},
    {name:'nine-old-cells-144-merge',...mergeFixture(144)},
  ];
}
