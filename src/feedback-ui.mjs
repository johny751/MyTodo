import {FeedbackStore,FEEDBACK_KEY,parseFeedback,queryIdeas,withFeedbackWriteLock} from './feedback.mjs';
const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export class FeedbackUI{
 constructor({notify=()=>{}}={}){
  this.notify=notify;this.host=document.createElement('div');this.host.className='feedback-host';document.body.append(this.host);
  this.host.addEventListener('click',event=>this.click(event));
  this.host.addEventListener('input',event=>{if(event.target.name==='feedbackQuery'){this.query=event.target.value;this.renderList();}else if(this.editor)this.dirty=true;});
  this.host.addEventListener('change',event=>{if(event.target.name==='feedbackFilter'){this.status=event.target.value;this.renderList();}else if(this.editor)this.dirty=true;});
  this.host.addEventListener('submit',event=>{if(event.target.id==='feedback-form'){event.preventDefault();this.save();}});
  this.host.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();}});
  window.addEventListener('storage',event=>{if(event.key===FEEDBACK_KEY&&this.opened&&!this.editor)this.render();});
 }
 open(){this.store=new FeedbackStore(window.localStorage);this.opened=true;this.editor=null;this.query='';this.status='all';this.dirty=false;this.render();this.host.querySelector('input')?.focus();}
 message(text){const el=this.host.querySelector('.feedback-message');if(el)el.textContent=text;}
 close(){if(this.busy)return;if(this.dirty&&!window.confirm('放弃尚未保存的意见内容？'))return;this.opened=false;this.editor=null;this.host.replaceChildren();}
 list(){return queryIdeas(this.store.read().ideas,this.query,this.status).map(idea=>'<button type="button" class="feedback-item" data-feedback="edit" data-id="'+h(idea.id)+'"><strong>'+h(idea.title||'未命名意见')+'</strong><span class="feedback-status">'+(idea.status==='resolved'?'已解决':'待处理')+'</span><p>'+h(idea.body.slice(0,160))+'</p><small>'+h(new Date(idea.updatedAt).toLocaleString('zh-CN'))+'</small></button>').join('')||'<p class="empty">暂无匹配的意见，点击“记录意见”开始。</p>';}
 renderList(){try{this.host.querySelector('.feedback-list').innerHTML=this.list();}catch(error){this.message(error.message);}}
 render(){
  let content;
  if(this.editor){const idea=this.editor;content='<h2>'+(idea.id?'编辑意见':'记录意见')+'</h2><form id="feedback-form"><label>标题（可留空）<input name="feedbackTitle" maxlength="400" value="'+h(idea.title)+'" placeholder="一句话说明改进想法"></label><label>意见内容<textarea name="feedbackBody" rows="9" maxlength="100000" placeholder="哪里不方便？希望如何改进？">'+h(idea.body)+'</textarea></label><label>处理状态<select name="feedbackStatus"><option value="pending" '+(idea.status==='pending'?'selected':'')+'>待处理</option><option value="resolved" '+(idea.status==='resolved'?'selected':'')+'>已解决</option></select></label><footer><button type="button" class="secondary" data-feedback="back">返回列表</button><button type="button" class="secondary" data-feedback="copy">复制内容</button>'+(idea.id?'<button type="button" class="secondary feedback-delete" data-feedback="delete">删除</button>':'')+'<button class="primary" type="submit">保存意见</button></footer></form>';}
  else content='<h2>优化意见</h2><p class="help">随时记录对这个程序的改进想法，保存在当前浏览器中。</p><div class="feedback-toolbar"><button class="primary" data-feedback="new">记录意见</button><button class="secondary" data-feedback="export">导出备份</button><button class="secondary" data-feedback="import">导入备份</button><button class="secondary" data-feedback="previous">导出导入前备份</button></div><div class="feedback-search"><input name="feedbackQuery" value="'+h(this.query)+'" placeholder="查找意见，多个关键词用空格分隔" aria-label="查找优化意见"><select name="feedbackFilter" aria-label="意见状态">'+[['all','全部状态'],['pending','待处理'],['resolved','已解决']].map(([value,label])=>'<option value="'+value+'" '+(this.status===value?'selected':'')+'>'+label+'</option>').join('')+'</select></div><div class="feedback-list"></div>';
  this.host.innerHTML='<div class="feedback-shade"><section class="modal feedback-panel" role="dialog" aria-modal="true" aria-label="优化意见"><button class="feedback-close" data-feedback="close" aria-label="关闭优化意见">×</button>'+content+'<p class="feedback-message" role="status"></p></section></div>';
  if(!this.editor)this.renderList();
 }
 draft(){const form=this.host.querySelector('#feedback-form');return {...this.editor,title:form.feedbackTitle.value,body:form.feedbackBody.value,status:form.feedbackStatus.value};}
 async write(operation){if(this.busy)throw Error('正在保存，请稍候');this.busy=true;this.host.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true);try{return await withFeedbackWriteLock(operation);}finally{this.busy=false;this.host.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=false);}}
 async save(){if(this.busy)return;try{const draft=this.draft(),base=this.base;await this.write(()=>this.store.save(draft,base));this.dirty=false;this.editor=null;this.render();this.message('意见已保存');}catch(error){this.message('保存失败：'+error.message);}}
 async click(event){
  const button=event.target.closest('[data-feedback]');if(!button||this.busy)return;
  const action=button.dataset.feedback;
  try{
   if(action==='close')return this.close();
   if(action==='new'){this.editor={title:'',body:'',status:'pending'};this.base=null;this.dirty=false;this.render();this.host.querySelector('input')?.focus();}
   if(action==='edit'){const idea=this.store.read().ideas.find(x=>x.id===button.dataset.id);if(!idea)throw Error('意见已删除');this.editor={...idea};this.base={...idea};this.dirty=false;this.render();}
   if(action==='back'){if(this.dirty&&!window.confirm('放弃尚未保存的意见内容？'))return;this.editor=null;this.dirty=false;this.render();}
   if(action==='copy'){const d=this.draft(),text=(d.title?d.title+'\n\n':'')+d.body;if(!text.trim())throw Error('请先填写意见内容');if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);else{const textArea=document.createElement('textarea');textArea.value=text;this.host.append(textArea);textArea.select();const ok=document.execCommand('copy');textArea.remove();if(!ok)throw Error('复制失败，请手动选中内容复制');}this.message('已复制');}
   if(action==='delete'){if(!window.confirm('删除这条意见？'))return;await this.write(()=>this.store.remove(this.editor.id,this.base));this.editor=null;this.dirty=false;this.render();this.message('意见已删除');}
   if(action==='export')download(this.store.export(),'gxtodo-feedback.json');
   if(action==='previous')download(this.store.previousBackup(),'gxtodo-feedback-before-import.json');
   if(action==='import'){
    const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';picker.addEventListener('change',async()=>{
     if(!picker.files[0])return;try{if(picker.files[0].size>16*1024*1024)throw Error('备份最大为 16 MiB');const text=await picker.files[0].text(),data=parseFeedback(text);if(!window.confirm('导入并合并 '+data.ideas.length+' 条意见？同编号采用较新内容，同时修改的内容保留副本。'))return;if(!this.opened)return;const result=await this.write(()=>this.store.import(text));this.render();this.message('已新增 '+result.added+' 条、更新 '+result.updated+' 条、保留冲突副本 '+result.conflicts+' 条');}catch(error){this.message('导入失败：'+error.message);}});picker.click();
   }
  }catch(error){this.message(error.message);}
 }
}
