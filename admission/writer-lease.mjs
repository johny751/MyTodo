import {hash} from './guard.mjs';
const leases=new WeakMap();
function acquisitionFailure(errors){const cause=errors[0],primary=new Error(cause?.message||String(cause),{cause});primary.name=cause?.name||'Error';if(cause?.code!==undefined)primary.code=cause.code;primary.cleanupErrors=errors.slice(1);return primary;}
export class WriterRegistry {
 #expected;#writers=new Map();#state='open';#generation=0;#unknown=[];#operationErrors=[];
 constructor(expected){if(!Array.isArray(expected)||!expected.length||new Set(expected.map(x=>x.id)).size!==expected.length)throw Error('Complete fixed writer inventory required');this.#expected=Object.freeze(expected.map(x=>Object.freeze({...x})));}
 get state(){return this.#state;}
 register(writer){const expected=this.#expected.find(x=>x.id===writer.id);if(this.#state!=='open'){this.#unknown.push(writer.id);this.#state='blocked';this.#generation++;throw Error('Late writer registration invalidated the fence');}if(!expected||expected.kind!==writer.kind){this.#unknown.push(writer.id);throw Error('Unknown writer registration');}if(this.#writers.has(writer.id))throw Error('Duplicate writer registration');if(typeof writer.close!=='function'||typeof writer.closed!=='function')throw Error('Actual checked close callback required');this.#writers.set(writer.id,{...writer,pending:new Set(),errors:[]});}
 async operation(id,fn){if(this.#state!=='open')throw Error('Writer operation blocked while fenced');const w=this.#writers.get(id);if(!w)throw Error('Unregistered writer');const pending=Promise.resolve().then(fn);w.pending.add(pending);try{return await pending;}catch(e){w.errors.push(e);this.#operationErrors.push(e);throw e;}finally{w.pending.delete(pending);}}
 async acquire(){
  if(this.#state!=='open')throw Error('Registry is not open');this.#state='draining';const generation=++this.#generation,errors=[];
  if(this.#unknown.length||this.#writers.size!==this.#expected.length){this.#state='blocked';throw Error('Unknown or missing writer; barrier cannot be certified');}
  for(const w of this.#writers.values())await Promise.allSettled([...w.pending]);errors.push(...this.#operationErrors);
  if(this.#state!=='draining'||this.#generation!==generation)errors.push(new Error('Writer inventory changed while draining'));
  if(errors.length){this.#state='blocked';throw acquisitionFailure(errors);}
  for(const w of this.#writers.values()){try{if(w.drain)await w.drain();await w.close();if(await w.closed()!==true)throw Error('Close outcome unknown for '+w.id);}catch(e){errors.push(e);}}
  if(this.#state!=='draining'||this.#generation!==generation)errors.push(new Error('Writer inventory changed while closing'));
  if(errors.length){this.#state='blocked';throw acquisitionFailure(errors);}
  this.#state='sealed';const lease=Object.freeze({generation,inventoryDigest:hash(Buffer.from(JSON.stringify(this.#expected))),kind:'registered-closed-fixture-writers',writerIds:Object.freeze(this.#expected.map(x=>x.id))});leases.set(lease,{registry:this,generation,active:true});return lease;
 }
 verify(lease){const known=leases.get(lease);if(!known||known.registry!==this||!known.active||known.generation!==this.#generation||this.#state!=='sealed')throw Error('Missing, forged or stale writer lease');return {generation:lease.generation,inventoryDigest:lease.inventoryDigest,writerIds:[...lease.writerIds]};}
 revoke(lease){this.verify(lease);leases.get(lease).active=false;this.#state='revoked';this.#generation++;}
}
export function verifyClosedLease(registry,lease){if(!(registry instanceof WriterRegistry))throw Error('Actual writer registry required');return WriterRegistry.prototype.verify.call(registry,lease);}
