// Exact encoded payload credit, not a claim about JS heap/decoded-object overhead.
export const SNAPSHOT_WIRE_BUDGET=64*1024*1024;
export const SNAPSHOT_MAX_INFLIGHT=1;
export function decodeSnapshotWire(message){
 if(message?.type!=='snapshot-wire')return message;
 if(!Number.isSafeInteger(message.transportId)||message.transportId<1||!Number.isSafeInteger(message.epoch)||!(message.buffer instanceof ArrayBuffer)||message.byteLength!==message.buffer.byteLength||message.byteLength>SNAPSHOT_WIRE_BUDGET)throw Error('Invalid snapshot wire envelope');
 const packet=JSON.parse(new TextDecoder().decode(new Uint8Array(message.buffer)));
 if(packet?.type!=='snapshot'||packet.epoch!==message.epoch)throw Error('Snapshot wire identity mismatch');
 return packet;
}
