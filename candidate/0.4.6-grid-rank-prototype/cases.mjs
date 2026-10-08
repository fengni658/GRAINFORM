import { namedScenarios } from './contract/scenarios.mjs';
const p=(slot,x,y,extra={})=>({slot,x,y,...extra});
export function probeCases(){return[
 ...namedScenarios().map(s=>({...s,expectedMode:'gpu-rank',expectedOverflow:s.name.includes('overflow')||s.name.includes('144'),expectedGeneration:s.name.includes('overflow')||s.name.includes('144')?0:1})),
 {name:'new-live-slot',old:[p(9,140,300)],next:[p(9,140,300),p(1,140,300)],expectedMode:'stopped',expectedReason:'rank-proof-unavailable'},
 {name:'resurrected-slot',old:[p(9,140,300),p(1,140,300,{alive:false})],next:[p(9,140,300),p(1,140,300)],expectedMode:'stopped',expectedReason:'rank-proof-unavailable'},
 {name:'reused-identity',old:[p(9,140,300,{id:'original'})],next:[p(9,140,300,{id:'replacement'})],expectedMode:'stopped',expectedReason:'rank-proof-unavailable'},
 {name:'strict-four-stop',old:[p(0,140,300),p(4,148,300)],next:[p(0,144,300),p(4,148,300)],expectedMode:'stopped',expectedReason:'rank-proof-unavailable'},
 {name:'far-move-stop',old:[p(0,140,300),p(4,148,300)],next:[p(0,148,300),p(4,148,300)],expectedMode:'stopped',expectedReason:'rank-proof-unavailable'},
 {name:'duplicate-input-slot',old:[p(0,140,300)],next:[p(0,140,300),p(0,141,300)],expectedMode:'stopped',expectedReason:'duplicate-slot'},
 {name:'missing-tombstone',old:[p(0,140,300),p(1,141,300)],next:[p(0,140,300)],expectedMode:'stopped',expectedReason:'missing-slot-tombstone'},
 {name:'next-domain-escape',old:[p(0,28.1,-15.9)],next:[p(0,27.9,-15.9)],expectedMode:'stopped',expectedReason:'next-out-of-grid'},
 {name:'old-overflow-cannot-clear',old:Array.from({length:17},(_,slot)=>p(slot,140,300)),next:Array.from({length:17},(_,slot)=>p(slot,140,300,{alive:slot<16})),expectedMode:'stopped',expectedReason:'old-invalid'},
 {name:'old-drift-invalid',old:[p(0,140,300)],next:[p(0,140,300)],inheritedDiagnostics:{overflow:false,outOfGrid:false,nonfinite:false,driftExceeded:true,invalid:true},expectedMode:'stopped',expectedReason:'old-invalid'},
 {name:'duplicate-old-bucket',old:[p(0,140,300),p(1,140.1,300)],next:[p(0,140,300),p(1,140.1,300)],corrupt:{cellX:28,cellY:79,layer:1,encodedSlot:1},expectedMode:'stopped',expectedReason:'old-duplicate-slot'},
 {name:'two-generations-delete',old:[p(3,140,300),p(1,140.2,300),p(9,140.4,300)],next:[p(3,141,301),p(1,141.2,301),p(9,141.4,301)],second:[p(3,142,302),p(1,141.2,301,{alive:false}),p(9,142.4,302)],expectedMode:'gpu-rank',expectedOverflow:false,expectedGeneration:2},
 {name:'empty-generation',old:[],next:[],expectedMode:'gpu-rank',expectedOverflow:false,expectedGeneration:1},
];}
export const DEFAULT_CASES=Object.freeze(['boundary-crossing','negative-world-y','explicit-deletion','sixteen-merge','seventeenth-overflow','nine-old-cells-144-merge']);
