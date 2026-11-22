import {normalizeState} from './model.mjs';
import {emptyState} from './sync-core.mjs';
import {accountId,accountHeaders} from './accounts.mjs';
import {syncCall} from './sync-client.mjs';
import {initializeReplica,buildState,diffState,editReplica} from './replica.mjs';
const cache=new Map();
export const currentVector=()=>structuredClone(cache.get(accountId())?.vector||{});
export const databaseCall=input=>syncCall({op:'replica',...input});
const legacyNative=()=>window.GxNative&&!window.GxNative.replicaVersion;
export async function readState(){
 if(legacyNative()){const value=window.GxNative.readStateFor(accountId());if(value)return normalizeState(JSON.parse(value));const initial=normalizeState(emptyState());const result=window.GxNative.writeStateFor(accountId(),JSON.stringify(initial));if(result!=='ok')throw Error(result||'首次保存失败');return initial;}
 const {meta}=await databaseCall({action:'inspect',keys:[]});
 if(!meta.initialized){const legacy=window.GxNative?.readStateFor(accountId());const state=legacy?normalizeState(JSON.parse(legacy)):emptyState();await initializeReplica(databaseCall,state);}
 const result=await databaseCall({action:'state'}),state=buildState(result.rows,result.meta.settings);cache.set(accountId(),{state,revision:result.meta.revision,vector:result.meta.vector});return state;
}
export async function writeState(input,{context=null}={}){
 const next=normalizeState(input);
 if(legacyNative()){const result=window.GxNative.writeStateFor(accountId(),JSON.stringify(next));if(result!=='ok')throw Error(result||'保存失败');return next;}
 if(!cache.has(accountId()))await readState();const before=cache.get(accountId()),diff=diffState(before.state,next,true);
 if(!diff.changes.length&&JSON.stringify(before.state.settings)===JSON.stringify(next.settings))return readState();
 const result=await editReplica(databaseCall,diff.changes,diff.settings,{context:context||before.vector});
 if(result.revision===before.revision+1){cache.set(accountId(),{state:next,revision:result.revision,vector:(await databaseCall({action:'inspect',keys:[]})).meta.vector});return next;}
 return readState();
}
export function exportState(){if(window.GxNative){window.GxNative.exportStateFor(accountId());return true;}return false;}
