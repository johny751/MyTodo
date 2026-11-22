import {accountId,accountHeaders} from './accounts.mjs';
import {syncDelta} from './delta-sync.mjs';
const pending=new Map();let sequence=0;
if(typeof document!=='undefined')document.addEventListener('gx-sync-result',event=>{const result=event.detail,entry=pending.get(result.id);if(!entry)return;clearTimeout(entry.timer);pending.delete(result.id);result.error?entry.reject(new Error(result.error)):entry.resolve(result.value);});
export async function syncCall(input){
 if(window.GxNative){return new Promise((resolve,reject)=>{const id=String(++sequence),timer=setTimeout(()=>{pending.delete(id);reject(new Error('同步请求超时，本地数据已保留'));},90000);pending.set(id,{resolve,reject,timer});window.GxNative.syncCall(id,JSON.stringify({...input,accountId:accountId()}));});}
 const response=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json',...accountHeaders()},body:JSON.stringify(input)});const result=await response.json();if(!response.ok)throw new Error(result.error||'同步失败');return result;
}
export async function exchange(local,{shouldContinue=()=>true}={}){const config=await syncCall({op:'config-get'}),scope=config.scope;const call=input=>syncCall({op:'replica',...input});const meta=(await call({action:'inspect',keys:[]})).meta;const base=meta.scope==null?await syncCall({op:'base-get',scope}):null;return {...await syncDelta({call,scope,legacyBase:base,request:input=>syncCall({op:'request',...input,scope}),shouldContinue}),scope};}
