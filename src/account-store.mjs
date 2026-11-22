import {createSQLiteStore} from './sqlite-store.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {normalizeState} from './model.mjs';
import {emptyState} from './sync-core.mjs';
import {createSyncStore,validateConfig} from './sync-server.mjs';

export const validAccountId=id=>typeof id==='string'&&/^(default|account-[a-z0-9-]{1,60})$/.test(id);
const folderName=value=>{const s=String(value||'').trim();if(!/^[A-Za-z0-9_-]{1,60}$/.test(s))throw new Error('同步目录请使用 1–60 位字母、数字、下划线或短横线');return s;};
const accountName=value=>{const s=String(value||'').trim();if(!s||s.length>32)throw new Error('账号名称请输入 1–32 个字');return s;};
export async function createAccountStore(directory,{syncOptions={}}={}) {
 await fs.mkdir(directory,{recursive:true});
 const registryFile=path.join(directory,'accounts.json'),opened=new Map();
 let registry,registryQueue=Promise.resolve();
 const atomic=async(file,text)=>{await fs.writeFile(file+'.tmp',text,{mode:0o600});await fs.rename(file+'.tmp',file);};
 function validate(value){
  if(value?.version!==1||!Array.isArray(value.accounts)||!value.accounts.length||value.accounts.length>30)throw new Error('账号清单格式错误，原数据已保留');
  const ids=new Set(),names=new Set();
  for(const a of value.accounts){if(!validAccountId(a.id)||ids.has(a.id)||names.has(a.name))throw new Error('账号清单包含重复或无效账号');ids.add(a.id);names.add(a.name);accountName(a.name);folderName(a.defaultFolder);}
  if(!ids.has('default')||!ids.has(value.activeId))throw new Error('当前账号不存在');
  return value;
 }
 try{registry=validate(JSON.parse(await fs.readFile(registryFile,'utf8')));}
 catch(e){if(e.code!=='ENOENT')throw e;const now=new Date().toISOString();registry={version:1,activeId:'default',accounts:[{id:'default',name:'账号 A',defaultFolder:'GxTodo',createdAt:now},{id:'account-b',name:'账号 B',defaultFolder:'GxTodo-B',createdAt:now}]};await atomic(registryFile,JSON.stringify(registry,null,2));}
 const info=id=>{if(!validAccountId(id))throw new Error('无效账号');const a=registry.accounts.find(a=>a.id===id);if(!a)throw new Error('账号不存在，请重新选择');return a;};
 const accountDirectory=id=>{info(id);return id==='default'?directory:path.join(directory,'accounts',id);};
 async function open(id){
  const account=info(id);
  if(!opened.has(id))opened.set(id,(async()=>{
   const dir=accountDirectory(id),file=path.join(dir,'state.json');await fs.mkdir(dir,{recursive:true});
   let state,queue=Promise.resolve();
   try{state=normalizeState(JSON.parse(await fs.readFile(file,'utf8')));}
   catch(e){if(e.code!=='ENOENT')throw new Error('无法读取账号数据，已停止以避免覆盖');state=normalizeState(emptyState());await atomic(file,JSON.stringify(state,null,2));}
   const database=createSQLiteStore(dir);await database.initialize(state);
   const sync=await createSyncStore(dir,{...syncOptions,defaultFolder:account.defaultFolder});
   return {
    read:()=>database.read(),
    database,
    save(next){const normalized=normalizeState(next);const job=queue.then(()=>database.save(normalized));queue=job.catch(()=>{});return job;},
    sync,
    async receipts(){try{const list=JSON.parse(await fs.readFile(path.join(dir,'reminder-receipts.json'),'utf8'));if(!Array.isArray(list))throw new Error('提醒记录格式错误');return list.filter(x=>typeof x==='string');}catch(e){if(e.code==='ENOENT')return [];throw e;}}
   };
  })().catch(e=>{opened.delete(id);throw e;}));
  return opened.get(id);
 }
 async function invoke(input){
  if(input.op==='list')return structuredClone(registry);
  const next=structuredClone(registry);
  if(input.op==='create'){
   if(next.accounts.length>=30)throw new Error('最多支持 30 个账号');
   const name=accountName(input.name);if(next.accounts.some(a=>a.name===name))throw new Error('已有同名账号');
   const id='account-'+crypto.randomUUID(),defaultFolder=folderName(input.folder||'GxTodo-'+id.slice(8,16));
   if(next.accounts.some(a=>a.defaultFolder===defaultFolder))throw new Error('请为新账号选择独立的同步目录');
   const dir=path.join(directory,'accounts',id);await fs.mkdir(dir,{recursive:true});await atomic(path.join(dir,'state.json'),JSON.stringify(normalizeState(emptyState()),null,2));
   next.accounts.push({id,name,defaultFolder,createdAt:new Date().toISOString()});
  }else if(input.op==='rename'){
   const account=info(input.id),name=accountName(input.name);if(next.accounts.some(a=>a.id!==account.id&&a.name===name))throw new Error('已有同名账号');next.accounts.find(a=>a.id===account.id).name=name;
  }else if(input.op==='activate'){info(input.id);await open(input.id);next.activeId=input.id;}
  else throw new Error('不支持的账号操作');
  await atomic(registryFile,JSON.stringify(next,null,2));registry=next;return structuredClone(registry);
 }
 const manage=input=>{const job=registryQueue.then(()=>invoke(input));registryQueue=job.catch(()=>{});return job;};
 // Serialize configuration changes across accounts so two simultaneous saves cannot bind one cloud folder twice.
 let syncConfigQueue=Promise.resolve();
 async function sync(id,input){
  const account=await open(id);
  if(input.op==='replica')return account.database.call(input);
  if(input.op!=='config-save')return account.sync(input);
  const work=syncConfigQueue.then(async()=>{
   const previous=await account.sync({op:'config-get'}),candidate=validateConfig({...input.config,password:input.config?.password|| (previous.configured?'stored':'')});
   const user=candidate.username.toLowerCase(),folder=candidate.folder;
   if(user&&folder)for(const other of registry.accounts){if(other.id===id)continue;const c=await (await open(other.id)).sync({op:'config-get'});if(c.username.toLowerCase()===user&&c.folder===folder)throw new Error('这个坚果云目录已绑定“'+other.name+'”，请为当前账号使用不同目录');}
   return account.sync(input);
  });syncConfigQueue=work.catch(()=>{});return work;
 }
 await open('default');
 return {manage,info,open,sync,accountDirectory,async close(){for(const entry of opened.values())(await entry).database.close();opened.clear();}};
}
