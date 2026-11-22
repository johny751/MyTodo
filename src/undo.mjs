const clone=v=>v===undefined?undefined:structuredClone(v);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keyed=a=>Array.isArray(a)&&a.every(v=>v&&typeof v==='object'&&typeof v.id==='string');
// Reverse only values that still match this operation. Later edits remain intact.
export function reverseChange(before,after,current){
 if(equal(before,after))return clone(current);
 if(equal(current,after))return clone(before);
 if(keyed(before)&&keyed(after)&&keyed(current)){
  const result=clone(current);
  for(const id of new Set([...before,...after].map(v=>v.id))){const b=before.find(v=>v.id===id),a=after.find(v=>v.id===id),i=result.findIndex(v=>v.id===id),c=result[i];if(equal(b,a))continue;const value=reverseChange(b,a,c);if(value===undefined){if(i>=0)result.splice(i,1);}else if(i>=0)result[i]=value;else result.splice(Math.min(before.findIndex(v=>v.id===id),result.length),0,value);}
  return result;
 }
 if(before&&after&&current&&!Array.isArray(before)&&!Array.isArray(after)&&!Array.isArray(current)&&typeof before==='object'&&typeof after==='object'&&typeof current==='object'){
  const result=clone(current);const stateChanged='completedAt' in after&&(!equal(before.done,after.done)||!equal(before.completedAt,after.completedAt));const newerState=stateChanged&&(!equal(current.done,after.done)||!equal(current.completedAt,after.completedAt));for(const key of new Set([...Object.keys(before),...Object.keys(after)])){if(newerState&&(key==='done'||key==='completedAt'))continue;const v=reverseChange(before[key],after[key],current[key]);if(v===undefined)delete result[key];else result[key]=v;}return result;
 }
 return clone(current);
}
export class UndoQueue{
 constructor({now=()=>Date.now(),duration=()=>8000}={}){this.now=now;this.duration=duration;this.items=[];this.nextId=0;}
 add(before,after,label){if(equal(before,after))return;const entry={id:String(++this.nextId),before:clone(before),after:clone(after),label,expires:this.now()+this.duration()};this.items.push(entry);this.prune();return entry;}
 prune(){this.items=this.items.filter(x=>x.expires>this.now());return this.items;}
 apply(id,current){this.prune();const item=this.items.find(x=>x.id===id);if(!item)return null;return reverseChange(item.before,item.after,current);}
 remove(id){this.items=this.items.filter(x=>x.id!==id);}
}
