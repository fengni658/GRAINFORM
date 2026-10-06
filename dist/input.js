export class InputState {
  constructor(){this.held=new Map();this.axisTicks=0;this.axisDirection=0;}
  direction(){return Number(this.has('right'))-Number(this.has('left'));}
  syncAxis(){const direction=this.direction();if(direction!==this.axisDirection){this.axisDirection=direction;this.axisTicks=0;}return direction;}
  press(id,action){
    if(this.held.has(id))return false;
    const existed=this.has(action),before=this.direction();this.held.set(id,{action});
    const after=this.syncAxis();
    // Duplicate sources never accelerate movement; opposing directions cancel.
    if(action==='left'||action==='right')return after!==0&&after!==before;
    return !existed;
  }
  release(id){this.held.delete(id);this.syncAxis();}
  clear(){this.held.clear();this.axisTicks=0;this.axisDirection=0;}
  has(action){for(const h of this.held.values())if(h.action===action)return true;return false;}
  step(move){
    const direction=this.syncAxis();if(!direction)return;
    this.axisTicks++;
    if(this.axisTicks>=10&&(this.axisTicks-10)%3===0)move(direction*4);
  }
}
