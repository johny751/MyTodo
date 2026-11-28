(function () {
  'use strict';
  // This explicit candidate composition does not replace the accepted demo store.
  // Its only port is a separately named local synthetic V2 envelope, never HTTP.
  const key='mytodo-d408-v2-isolated-v1', identity={scope:'isolated-synthetic',storageId:key};
  let service=null, state=null, busy=false, error='', selected='', log=[],panelHost=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const field=(label,name,value='',area=false)=>'<label class="field"><span>'+esc(label)+'</span>'+(area?'<textarea name="'+name+'">'+esc(value)+'</textarea>':'<input name="'+name+'" value="'+esc(value)+'" required maxlength="2000">')+'</label>';
  const button=(label,action,id='')=>'<button type="button" class="button" data-v2-action="'+action+'" data-id="'+esc(id)+'">'+label+'</button>';
  const form=(name,title,fields)=>'<form data-v2-form="'+name+'"><h3>'+title+'</h3>'+fields+'<button type="submit" class="button primary">保存到隔离存储</button></form>';
  const seed=()=>({version:2,settings:{swipeMenu:true,swipeComplete:true,longPressMs:3000,undoMs:5000},tasks:[],notes:[],projects:[],tags:[],places:[]});
  function readEnvelope(){
    const raw=localStorage.getItem(key);
    if(raw===null)return seed();
    const value=JSON.parse(raw);
    if(value?.kind!=='mytodo.d408.isolated-v2'||value.storageId!==key||value.scope!=='isolated-synthetic'||value.version!==1)throw Error('隔离存储身份不符；原始内容保留，未覆盖');
    return value.state;
  }
  function bind(){
    if(service)return service;
    const storage=window.D4V2Service.bindExistingV2Storage({
      async readState(){const value=readEnvelope();log.push({operation:'read',storageId:key,at:new Date().toISOString()});return value;},
      async writeState(next){
        const payload={kind:'mytodo.d408.isolated-v2',version:1,...identity,state:next};
        localStorage.setItem(key,JSON.stringify(payload));
        log.push({operation:'write',storageId:key,at:new Date().toISOString(),tasks:next.tasks.length,notes:next.notes.length,projects:next.projects.length});
        return readEnvelope();
      }
    },identity);
    service=window.D4V2Service.createV2Service({storage});return service;
  }
  function content(){
    const intro='<header class="d409-v2-heading"><p class="eyebrow">EXISTING WORKSPACE</p><h2>现有模型隔离工作区</h2><p>使用现有任务、便签和项目规则，单独保存到本浏览器的候选存储。这里的内容与四象限合成体验分别保存，可关闭页面后重新打开继续编辑。</p><p class="help-text">仅隔离候选；不会连接远端、迁移正式数据库或写入工作事项、流程、番茄钟、反馈等新实体。</p></header>';
    if(!state)return intro+button('打开隔离工作区','open')+'<p data-v2-status role="status">'+esc(error||'尚未打开；没有读写该隔离存储。')+'</p>';
    const task=state.tasks.find(t=>t.id===selected),projectOptions='<option value="">未分类</option>'+state.projects.map(p=>'<option value="'+esc(p.name)+'">'+esc(p.name)+'</option>').join('');
    const list=state.tasks.map(t=>'<article class="panel'+(t.id===selected?' d409-v2-selected':'')+'" data-v2-task="'+esc(t.id)+'" aria-current="'+(t.id===selected?'true':'false')+'"><strong>'+esc(t.title)+'</strong><p>'+esc(t.project||'未分类')+' · 象限 '+(t.quadrant+1)+' · '+(t.done?'已完成':'未完成')+'</p><p class="note-body">'+esc(t.notes)+'</p><ul>'+t.subtasks.map(c=>'<li data-v2-child="'+esc(c.id)+'">'+esc(c.title)+'</li>').join('')+'</ul><div class="page-actions">'+button('编辑 / 子任务','select',t.id)+button(t.done?'取消完成':'完成','done',t.id)+button('下一象限','move',t.id)+'</div></article>').join('');
    const editor=task?form('edit','编辑任务',field('标题','title',task.title)+field('任务备注','notes',task.notes,true)) + form('child','快速子任务',field('子任务内容','title')):'';
    return intro+'<p data-v2-status role="status">'+esc(error||'已连接独立本地存储；保存成功后才更新列表。')+'</p><div class="page-actions">'+button('重新读取','refresh')+button('导出隔离数据','export')+'</div><div class="card-grid d409-v2-create">'+form('project','新建项目',field('项目名称','name')+field('项目说明','description','',true))+form('task','新建任务',field('标题','title')+'<label class="field"><span>项目</span><select name="project">'+projectOptions+'</select></label>'+field('任务备注','notes','',true))+form('note','新建便签',field('便签内容','body','',true))+'</div><h3>任务（'+state.tasks.length+'）</h3><div class="d409-v2-task-layout"><div class="d409-v2-task-list">'+(list||'<div class="empty-state">还没有任务。先记录一项要推进的工作。</div>')+'</div><div class="d409-v2-editor">'+(editor||'<div class="empty-state">选择任务，继续编辑备注或添加子任务。</div>')+'</div></div><h3>便签（'+state.notes.length+'）</h3><div class="d409-v2-notes">'+state.notes.map(n=>'<form data-v2-form="note-edit" data-id="'+esc(n.id)+'" class="panel">'+field('便签内容','body',n.body,true)+'<button type="submit" class="button">保存便签修改</button></form>').join('')+'</div><details><summary>隔离存储标识与调用记录</summary><p>'+esc(key)+'</p><pre data-v2-log>'+esc(JSON.stringify(log,null,2))+'</pre></details>';
  }
  function mount(){
    const main=document.querySelector('main[data-route="settings"]');if(!main)return;
    if(!panelHost){panelHost=document.createElement('section');panelHost.className='panel';panelHost.dataset.v2Candidate='';draw(panelHost);}
    if(panelHost.parentElement!==main)main.insertBefore(panelHost,main.querySelector('.footer-meta'));
  }
  function draw(host=panelHost){if(!host)return;host.innerHTML=content();host.setAttribute('aria-busy',String(busy));host.querySelectorAll('button,input,textarea,select').forEach(e=>e.disabled=busy);}
  async function run(action,formElement){
    if(busy)return;busy=true;error='';
    const host=panelHost;if(host){host.setAttribute('aria-busy','true');host.querySelectorAll('button,input,textarea,select').forEach(e=>e.disabled=true);}
    try{state=await action();draw();}
    catch(e){error='保存或读取失败，当前输入与原始存储保留：'+String(e.message||e);const status=host?.querySelector('[data-v2-status]');if(status)status.textContent=error;}
    finally{busy=false;if(host){host.setAttribute('aria-busy','false');host.querySelectorAll('button,input,textarea,select').forEach(e=>e.disabled=false);}if(!formElement)mount();}
  }
  document.addEventListener('click',event=>{
    const el=event.target.closest('[data-v2-action]');if(!el)return;event.preventDefault();
    const id=el.dataset.id,task=state?.tasks.find(t=>t.id===id),action=el.dataset.v2Action;
    if(action==='export'&&state){const blob=new Blob([JSON.stringify({kind:'mytodo.d408.isolated-v2',version:1,...identity,state},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='mytodo-d408-isolated-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
    if(action==='select'){selected=id;draw();return;}
    if(action==='open'||action==='refresh')run(()=>bind().read());
    if(action==='done'&&task)run(()=>bind().setTaskDone(id,!task.done));
    if(action==='move'&&task)run(()=>bind().moveTask(id,(task.quadrant+1)%4));
  });
  document.addEventListener('submit',event=>{
    const f=event.target.closest('form[data-v2-form]');if(!f)return;event.preventDefault();if(busy)return;
    const data=new FormData(f),v=n=>String(data.get(n)||''),kind=f.dataset.v2Form;
    const actions={project:()=>bind().createProject({name:v('name'),description:v('description')}),task:()=>bind().createTask({title:v('title'),notes:v('notes'),project:v('project')}),note:()=>bind().createNote(v('body')),edit:()=>bind().editTask(selected,{title:v('title'),notes:v('notes')},state.tasks.find(t=>t.id===selected)),child:()=>bind().addSubtask(selected,v('title')),'note-edit':()=>bind().editNote(f.dataset.id,v('body'))};
    if(actions[kind])run(actions[kind],f);
  });
  new MutationObserver(mount).observe(document.querySelector('#app'),{subtree:true,childList:true});mount();
  window.D408V2Candidate=Object.freeze({storageKey:key,identity:Object.freeze(identity),isBusy:()=>busy,snapshot:()=>({state:state?structuredClone(state):null,log:structuredClone(log),error,selected})});
}());
