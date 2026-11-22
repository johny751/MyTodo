// Data is JSON-only; keep older Android System WebView installations usable.
if(!globalThis.structuredClone)globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value));
if(!Array.prototype.at)Object.defineProperty(Array.prototype,'at',{value:function(index){return this[index<0?this.length+index:index];},configurable:true,writable:true});
if(!crypto.randomUUID)crypto.randomUUID=()=>{const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(b=>b.toString(16).padStart(2,'0'));return [hex.slice(0,4),hex.slice(4,6),hex.slice(6,8),hex.slice(8,10),hex.slice(10)].map(p=>p.join('')).join('-');};
