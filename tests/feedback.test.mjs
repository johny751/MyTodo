import test from 'node:test';
import assert from 'node:assert/strict';
import {FeedbackStore,FEEDBACK_KEY,FEEDBACK_BACKUP_KEY,parseFeedback,mergeFeedback,queryIdeas,withFeedbackWriteLock} from '../src/feedback.mjs';
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const stamp='2026-11-13T02:00:00.000Z';
const idea=(id,body='意见内容',updatedAt=stamp)=>({id,title:'标题',body,status:'pending',createdAt:stamp,updatedAt});
const backup=ideas=>({format:'gxtodo.feedback',version:1,ideas});
test('反馈独立持久化，重新打开可检索并按状态整理，不触碰任务存储',()=>{
 const storage=memory(),store=new FeedbackStore(storage,{makeId:()=> 'idea-1',now:()=>stamp});
 storage.setItem('tasks','existing-tasks');store.save({title:'触摸操作',body:'Android 长按拖动更方便',status:'pending'});
 const reopened=new FeedbackStore(storage,{now:()=> '2026-11-13T02:01:00.000Z'}),record=reopened.read().ideas[0];
 assert.equal(queryIdeas(reopened.read().ideas,'android 拖动','pending').length,1);
 reopened.save({...record,status:'resolved'},record);assert.equal(queryIdeas(reopened.read().ideas,'','pending').length,0);
 assert.equal(storage.getItem('tasks'),'existing-tasks');assert.equal(new FeedbackStore(storage).read().ideas[0].status,'resolved');
});
test('损坏/超限/重复编号备份拒绝，现有意见及导入前备份不变',()=>{
 const storage=memory(),store=new FeedbackStore(storage);storage.setItem(FEEDBACK_KEY,JSON.stringify(backup([idea('safe')])));
 const original=store.export();
 for(const value of ['{',JSON.stringify({format:'wrong',version:1,ideas:[]}),JSON.stringify(backup([idea('x'),idea('x')])),JSON.stringify(backup([{...idea('x'),status:'unknown'}])),JSON.stringify(backup([{...idea('x'),createdAt:'2026-02-30T00:00:00Z'}])),JSON.stringify(backup([{...idea('x'),title:'长'.repeat(201)}]))]){
  assert.throws(()=>store.import(value));assert.equal(store.export(),original);assert.equal(storage.getItem(FEEDBACK_BACKUP_KEY),null);
 }
});
test('导入较新更新、较旧跳过、同时间冲突保留副本，保留原导入前快照',()=>{
 const storage=memory(),store=new FeedbackStore(storage,{makeId:()=> 'conflict-copy',now:()=> '2026-11-13T03:00:00.000Z'});
 storage.setItem(FEEDBACK_KEY,JSON.stringify(backup([idea('newer'),idea('older'),idea('conflict')])));
 const before=store.export(),result=store.import(JSON.stringify(backup([idea('newer','新版','2026-11-13T02:01:00Z'),idea('older','旧版','2026-11-13T01:00:00Z'),idea('conflict','另一份内容'),idea('added')])));
 assert.deepEqual([result.added,result.updated,result.conflicts],[1,1,1]);assert.equal(store.read().ideas.find(x=>x.id==='newer').body,'新版');assert.equal(store.read().ideas.find(x=>x.id==='older').body,'意见内容');
 assert.equal(store.read().ideas.filter(x=>x.id==='conflict'||x.id==='conflict-copy').length,2);assert.deepEqual(JSON.parse(store.previousBackup()),JSON.parse(before));
 const again=store.import(JSON.stringify(backup([idea('conflict','另一份内容')])));assert.equal(again.conflicts,0);assert.equal(store.read().ideas.length,5);
});
test('浏览器配额失败保留当前意见，跨窗口修改和删除不会被旧编辑器覆盖',()=>{
 const storage=memory(),store=new FeedbackStore(storage,{now:()=>stamp});storage.setItem(FEEDBACK_KEY,JSON.stringify(backup([idea('safe')])));
 const base=store.read().ideas[0],other=new FeedbackStore(storage,{now:()=> '2026-11-13T02:02:00.000Z'});other.save({...base,body:'另一个窗口'},base);
 assert.throws(()=>store.save({...base,body:'旧窗口'},base),/其他窗口/);
 const stable=store.export(),set=storage.setItem;storage.setItem=(key,value)=>{if(key===FEEDBACK_KEY)throw Error('quota');set(key,value);};
 assert.throws(()=>store.import(JSON.stringify(backup([idea('incoming')]))),/quota/);assert.equal(store.export(),stable);
 storage.setItem=set;store.remove('safe');assert.throws(()=>store.save(base,base),/已删除/);
});
test('Windows UTC 秒格式可导入并导出为统一毫秒格式',()=>{
 const data=parseFeedback(JSON.stringify(backup([idea('windows','跨平台内容','2026-11-13T02:00:00Z')])));
 assert.equal(data.ideas[0].updatedAt,stamp);assert.equal(mergeFeedback(data,data).conflicts,0);
});

test('导入未来时间后手动编辑保持单调，重复旧备份不能覆盖刚编辑的内容',()=>{
 const storage=memory(),store=new FeedbackStore(storage,{now:()=>stamp});store.import(JSON.stringify(backup([idea('future','旧内容','2027-01-01T00:00:00.000Z')])));const old=store.read().ideas[0];const edited=store.save({...old,body:'手动修订'},old);assert.equal(edited.updatedAt,'2027-01-01T00:00:00.001Z');store.import(JSON.stringify(backup([old])));assert.equal(store.read().ideas[0].body,'手动修订');
});

test('同源写锁串行处理两个窗口的写入，等待期间不使用旧快照覆盖新意见',async()=>{
 const storage=memory();let tail=Promise.resolve(),release;const barrier=new Promise(resolve=>release=resolve),locks={request(name,action){assert.equal(name,'gxtodo.feedback.v1.write');const result=tail.then(action);tail=result.catch(()=>{});return result;}};const a=new FeedbackStore(storage,{makeId:()=> 'from-a',now:()=>stamp}),b=new FeedbackStore(storage,{makeId:()=> 'from-b',now:()=>stamp});let enteredA=false,enteredB=false;const first=withFeedbackWriteLock(async()=>{enteredA=true;await barrier;a.save({body:'窗口 A'});},{locks});const second=withFeedbackWriteLock(()=>{enteredB=true;b.save({body:'窗口 B'});},{locks});await Promise.resolve();assert.equal(enteredA,true);assert.equal(enteredB,false);release();await Promise.all([first,second]);assert.deepEqual(new Set(a.read().ideas.map(x=>x.id)),new Set(['from-a','from-b']));await assert.rejects(withFeedbackWriteLock(()=>assert.fail('不支持锁时不能无保护写入'),{locks:null}),/浏览器/);
});
