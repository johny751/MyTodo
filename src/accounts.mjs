let currentId='default';
export const accountId=()=>currentId;
export const accountHeaders=()=>({'X-Gx-Account':currentId});
export async function accountCall(input){
 if(window.GxNative){const result=JSON.parse(window.GxNative.accountCall(JSON.stringify(input)));if(result.error)throw new Error(result.error);return result.value;}
 const response=await fetch('/api/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const result=await response.json();if(!response.ok)throw new Error(result.error||'账号操作失败');return result;
}
export async function initAccounts(){const registry=await accountCall({op:'list'});currentId=registry.activeId;return registry;}
