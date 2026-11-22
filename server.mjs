import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createAccountStore} from './src/account-store.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4173);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT 必须是 1024–65535 的整数');
const packageVersion=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const controlToken=process.env.GXTODO_STOP_TOKEN||'';
const localRoot=process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share');
const dataDir=path.resolve(process.env.GXTODO_DATA_DIR||path.join(localRoot,'GxTodoWeb','data'));
const accounts=await createAccountStore(dataDir);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.md':'text/plain; charset=utf-8'};
const staticFiles=new Set(['/','/index.html','/styles.css','/interaction.css','/src/app.mjs','/src/feedback.mjs','/src/feedback-ui.mjs','/src/accounts.mjs','/src/view-history.mjs','/src/model.mjs','/src/task-tree.mjs','/src/task-editor.mjs','/src/storage.mjs','/src/gestures.mjs','/src/compat.mjs','/src/undo.mjs','/src/sync-core.mjs','/src/replica.mjs','/src/delta-sync.mjs','/src/sync-client.mjs','/src/schedule.mjs','/src/personal-ui.mjs','/src/reminders.mjs','/README.md']);
const server=http.createServer(async(req,res)=>{
 const send=(code,data,type='application/json; charset=utf-8')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));};
 async function body(limit){
  if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))throw new Error('来源不允许');
  if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('需要 JSON 数据');
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('数据超过容量限制');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }
 try{
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host))return send(403,{error:'仅允许本机访问'});
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  if(url.pathname==='/api/health'&&req.method==='GET')return send(200,{app:'gxtodo-local',version:packageVersion,pid:process.pid,installRoot:root,dataDir});
  if(url.pathname==='/api/local-control/stop'){
   if(req.method!=='POST')return send(405,{error:'不支持此方法'});
   const token=req.headers['x-gx-control']||'',provided=Buffer.from(typeof token==='string'?token:''),expected=Buffer.from(controlToken);if(!controlToken||provided.length!==expected.length||!crypto.timingSafeEqual(provided,expected))return send(403,{error:'无效的本机控制请求'});
   await body(1024);send(200,{stopped:true});
   const forceClose=setTimeout(()=>server.closeAllConnections(),3000);forceClose.unref();
   server.close(async()=>{clearTimeout(forceClose);try{await accounts.close();process.exit(0);}catch(error){console.error('关闭数据存储失败：'+error.message);process.exit(1);}});server.closeIdleConnections();return;
  }
  if(url.pathname==='/api/accounts'){
   if(req.method==='GET')return send(200,await accounts.manage({op:'list'}));
   if(req.method!=='POST')return send(405,{error:'不支持此方法'});
   try{return send(200,await accounts.manage(await body(16384)));}catch(e){return send(400,{error:e.message});}
  }
  if(['/api/state','/api/sync','/api/reminder-receipts','/api/export'].includes(url.pathname)){
   // Unqualified legacy clients remain bound to A; switching another tab never redirects their writes.
   const id=req.headers['x-gx-account']||url.searchParams.get('account')||'default';
   let account;try{account=await accounts.open(id);}catch(e){return send(400,{error:e.message});}
   if(url.pathname==='/api/state'){
    if(req.method==='GET')return send(200,account.read());
    if(req.method!=='PUT')return send(405,{error:'不支持此方法'});
    if(req.headers['x-gx-storage']!=='2')return send(409,{error:'本地数据已升级为 SQLite，请刷新网页后再编辑'});
    try{return send(200,await account.save(await body(64*1024*1024)));}catch(e){return send(400,{error:e.message});}
   }
   if(url.pathname==='/api/sync'){
    if(req.method!=='POST')return send(405,{error:'不支持此方法'});
    try{return send(200,await accounts.sync(id,await body(64*1024*1024)));}catch(e){return send(400,{error:/fetch|network|timeout|abort/i.test(e.message)?'无法连接坚果云，请检查网络后重试':e.message});}
   }
   if(req.method!=='GET')return send(405,{error:'不支持此方法'});
   if(url.pathname==='/api/reminder-receipts')return send(200,await account.receipts());
   res.setHeader('Content-Disposition','attachment; filename="gxtodo-'+id+'.json"');return send(200,JSON.stringify(account.read(),null,2));
  }
  if(req.method!=='GET'||!staticFiles.has(url.pathname))return send(404,{error:'页面不存在'});
  const file=url.pathname==='/'?'/index.html':url.pathname;return send(200,await fs.readFile(path.join(root,file)),mime[path.extname(file)]||'application/octet-stream');
 }catch(error){console.error(error.message);send(500,{error:'保存或读取失败，请检查数据目录和磁盘空间'});}
});
server.listen(port,'127.0.0.1',()=>console.log('本地版已启动：http://127.0.0.1:'+port+'\n数据目录：'+dataDir));
