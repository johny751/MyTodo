(function () {
  'use strict';
  // Synthetic UI adapter. Production storage, migration and sync are never called.
  const H = window.DemoDomain.helpers;
  const labels = {project:'项目', tag:'标签', place:'地点'};
  let catalog = {query:'', archived:'active'};
  let timeline = {group:null, query:'', status:'all', allDates:true, date:'', period:'day', sort:'time', limit:100};
  const esc = (ctx, value) => ctx.esc(String(value ?? ''));
  const token = group => encodeURIComponent(JSON.stringify(group));
  function decode(value) {
    const group = JSON.parse(decodeURIComponent(value));
    if (!group || !Object.hasOwn(labels, group.type) || typeof group.name !== 'string' ||
        (group.type === 'project' && typeof group.projectId !== 'string')) throw Error('分类选择无效');
    return group;
  }
  function button(ctx, title, action, id = '', style = '') {
    return '<button type="button" class="button ' + style + '" data-action="' + action +
      '" data-id="' + esc(ctx,id) + '">' + esc(ctx,title) + '</button>';
  }
  function select(ctx, name, value, rows, label) {
    return '<label class="field"><span>' + esc(ctx,label) + '</span><select name="' + name + '">' +
      rows.map(([id,title])=>'<option value="' + esc(ctx,id) + '"' + (String(id)===String(value)?' selected':'') + '>' + esc(ctx,title) + '</option>').join('') + '</select></label>';
  }
  function heading(ctx, title, text, actions = '') {
    return '<header class="page-heading"><div><h2>' + esc(ctx,title) + '</h2><p>' + esc(ctx,text) + '</p></div><div class="page-actions">' + actions + '</div></header>';
  }
  function clearDraftForm(name) {
    const form=document.querySelector('[data-form="'+name+'"]');
    if(form) form.dataset.dirty='';
  }
  function currentGroup(ctx, group) {
    if(!group) return null;
    const state=ctx.getState();
    if(group.type==='project') {
      const project=state.projects.find(row=>row.id===group.projectId);
      if(!project) throw Error('项目已删除，未重新匹配同名项目');
      return {...group,name:project.name};
    }
    const key=group.type==='tag'?'tags':'places';
    if(!state[key].includes(group.name)) throw Error('分类已不存在，未重新创建');
    return group;
  }
  function groupTasks(state, group) {
    const all = H.flattenTasks(state.tasks).filter(task=>!task.archived);
    if (!group) return {tasks:all, unresolved:[], missing:false};
    if (group.type !== 'project') return {tasks:all.filter(task=>group.type==='tag'?task.tags.includes(group.name):task.place===group.name), unresolved:[], missing:false};
    const project = state.projects.find(row=>row.id===group.projectId);
    if (!project) return {tasks:[], unresolved:[], missing:true};
    const unique = state.projects.filter(row=>row.name===project.name).length===1;
    // Same unique-name fallback as work-pages.taskProject. Never install a guessed ID.
    return {
      tasks:all.filter(task=>task.projectId===project.id || (!task.projectId && unique && task.project===project.name)),
      unresolved:unique?[]:all.filter(task=>!task.projectId && task.project===project.name),
      missing:false
    };
  }
  function groupCard(ctx, state, group) {
    const match = groupTasks(state,group), encoded = token(group);
    const project = group.type==='project'?state.projects.find(row=>row.id===group.projectId):null;
    return '<article class="panel" data-legacy-group="' + esc(ctx,encoded) + '"><h3>' +
      button(ctx,group.name,'legacy-timeline',encoded,'text') + '</h3><p>' + match.tasks.length + ' 项活动任务' +
      (project?' · ' + esc(ctx,project.id) + (project.archived?' · 已归档':''):'') + '</p>' +
      (match.unresolved.length?'<p class="help-text" data-legacy-blocker="ambiguous-project">BLOCKER：' + match.unresolved.length + ' 项历史名称关联无法确定项目 ID，未计入本项目。</p>':'') +
      '<div class="row-actions">' + button(ctx,'四象限筛选','legacy-quadrants',encoded) + button(ctx,'时间轴','legacy-timeline',encoded) +
      (project?button(ctx,'编辑项目','work-edit-project',project.id):button(ctx,'编辑','legacy-edit',encoded) + button(ctx,'删除','legacy-delete',encoded,'danger')) + '</div></article>';
  }
  function catalogsPage(ctx) {
    const state = ctx.getState();
    const projectRows = state.projects.filter(row=>catalog.archived==='all' || row.archived===(catalog.archived==='archived')).filter(row=>H.matchesQuery(catalog.query,row.name,row.description));
    const sections = [
      ['项目',projectRows.map(row=>({type:'project',name:row.name,projectId:row.id})),button(ctx,'新建项目','work-new-project')],
      ['标签',state.tags.filter(name=>H.matchesQuery(catalog.query,name)).map(name=>({type:'tag',name,projectId:''})),button(ctx,'新建标签','legacy-new','tag')],
      ['地点',state.places.filter(name=>H.matchesQuery(catalog.query,name)).map(name=>({type:'place',name,projectId:''})),button(ctx,'新建地点','legacy-new','place')]
    ];
    return heading(ctx,'分类管理','原标签、地点名称键与项目关联保持；名称打开时间轴，快捷按钮进入四象限。',button(ctx,'全部任务时间轴','legacy-all-timeline')) +
      '<form data-form="legacy-catalog-filter" class="panel work-filters"><label class="field"><span>搜索目录</span><input name="query" type="search" value="' + esc(ctx,catalog.query) + '"></label>' +
      select(ctx,'archived',catalog.archived,[['active','活动项目'],['archived','归档项目'],['all','全部项目']],'项目范围') +
      '<button class="button" type="submit">应用筛选</button>' + button(ctx,'清除','legacy-catalog-clear') + '</form>' +
      sections.map(([name,groups,actions])=>'<section class="form-section"><header class="panel-head"><h3>' + name + ' · ' + groups.length + '</h3>' + actions + '</header><div class="project-grid">' +
        (groups.length?groups.map(group=>groupCard(ctx,state,group)).join(''):'<p class="empty-state">没有匹配目录。</p>') + '</div></section>').join('');
  }
  function row(ctx, task) {
    return '<article class="panel" data-task-id="' + esc(ctx,task.id) + '"><div class="row-actions"><time>' + esc(ctx,task.start?.slice(11)||'未安排时间') + '</time>' +
      button(ctx,task.title,'task-open',task.id,'text') + button(ctx,'三点菜单','task-menu',task.id) + '</div><p class="help-text">' +
      esc(ctx,task.done?'已完成':'未完成') + ' · ' + esc(ctx,task.project||'无项目') + ' · ' + esc(ctx,task.place||'无地点') +
      (task.end?' · 结束 ' + esc(ctx,task.end.replace('T',' ')):'') + (task.subtasks.length?' · 子任务 ' + task.subtasks.filter(t=>t.done).length + '/' + task.subtasks.length:'') + '</p></article>';
  }
  function timelinePage(ctx) {
    if (!timeline.date) timeline.date = ctx.today;
    const state = ctx.getState();
    if(timeline.group?.type==='project') {
      const project=state.projects.find(row=>row.id===timeline.group.projectId);
      if(project) timeline.group={...timeline.group,name:project.name};
    }
    const result = groupTasks(state,timeline.group);
    const tasks = H.visibleTasks(result.tasks,{...timeline,group:null});
    const shown = tasks.slice(0,timeline.limit);
    const dates = new Map();
    for (const task of shown) {
      const date = task.start?.slice(0,10)||'未安排日期';
      if (!dates.has(date)) dates.set(date,[]);
      dates.get(date).push(task);
    }
    const name = timeline.group?labels[timeline.group.type] + '“' + timeline.group.name + '”':'全部活动任务';
    return heading(ctx,'任务时间轴',name + ' · 原开始时间、日期筛选和未完成历史显示规则。',
      button(ctx,'分类管理','legacy-catalogs') + button(ctx,'新增任务','legacy-group-new-task',timeline.group?token(timeline.group):'','primary')) +
      (result.missing?'<p data-legacy-blocker="missing-project">BLOCKER：项目已删除，未重新匹配同名项目。</p>':'') +
      (result.unresolved.length?'<p data-legacy-blocker="ambiguous-project">BLOCKER：' + result.unresolved.length + ' 项同名历史任务缺少明确项目 ID，原值保留，未猜测归属。</p>':'') +
      '<form data-form="legacy-timeline-filter" class="panel work-filters"><label class="field"><span>搜索任务</span><input name="query" type="search" value="' + esc(ctx,timeline.query) + '"></label>' +
      select(ctx,'status',timeline.status,[['all','全部状态'],['pending','未完成'],['done','已完成']],'任务状态') +
      '<label class="field"><span>基准日期</span><input name="date" type="date" value="' + esc(ctx,timeline.date) + '"></label>' +
      select(ctx,'period',timeline.period,[['day','当日'],['week','本周'],['month','本月']],'日期范围') +
      select(ctx,'sort',timeline.sort,[['time','按时间'],['manual','手动顺序']],'排序') +
      '<label><input name="allDates" type="checkbox"' + (timeline.allDates?' checked':'') + '> 所有日期</label><button class="button" type="submit">应用筛选</button>' +
      button(ctx,'上一周期','legacy-period','-1') + button(ctx,'今天','legacy-period','today') + button(ctx,'下一周期','legacy-period','1') + button(ctx,'全部分类','legacy-all-timeline') + '</form>' +
      '<p data-legacy-count>' + tasks.length + ' 项任务（含子任务，归档内容在工作归档查询）</p><div data-legacy-timeline>' +
      ([...dates].map(([date,items])=>'<section data-legacy-date="' + esc(ctx,date) + '"><h3>' + esc(ctx,date) + '</h3>' + items.map(task=>row(ctx,task)).join('') + '</section>').join('')||'<p class="empty-state">没有符合条件的任务。</p>') + '</div>' +
      (shown.length<tasks.length?button(ctx,'继续加载（剩余 '+(tasks.length-shown.length)+' 项）','legacy-more-tasks'):'') +
      '<p class="help-text" data-legacy-loaded>已加载 '+shown.length+' / '+tasks.length+' 项</p>';
  }
  function entityForm(ctx, group) {
    if (!['tag','place'].includes(group.type)) throw Error('项目编辑请使用项目管理');
    ctx.modal('<h2>' + (group.name?'编辑':'新建') + labels[group.type] + '</h2><form data-form="legacy-catalog"><input type="hidden" name="type" value="' + group.type + '"><input type="hidden" name="originalName" value="' + esc(ctx,group.name) + '"><label class="field"><span>名称</span><textarea name="name" rows="2" required maxlength="100">' + esc(ctx,group.name) + '</textarea></label><p class="help-text">原名称键同步更新任务及子任务关联；不会删除任务。</p><footer class="form-actions">' + button(ctx,'取消','legacy-close') + '<button class="button primary" type="submit">保存</button></footer></form>');
  }
  function changedGroup(old, next) {
    if (timeline.group?.type===old.type && timeline.group.name===old.name) timeline.group = next;
  }
  function act(action, id, ctx) {
    if (action==='legacy-close') {ctx.closeModal();return true;}
    if (action==='legacy-catalogs') {ctx.navigate('catalogs');return true;}
    if (action==='legacy-catalog-clear') {clearDraftForm('legacy-catalog-filter');catalog={query:'',archived:'active'};ctx.navigate('catalogs');return true;}
    if (action==='legacy-all-timeline') {timeline.group=null;timeline.limit=100;ctx.navigate('timeline');return true;}
    if (action==='legacy-timeline') {timeline.group=currentGroup(ctx,decode(id));timeline.limit=100;ctx.navigate('timeline');return true;}
    if (action==='legacy-quadrants') {ctx.openTaskGroup(currentGroup(ctx,decode(id)));return true;}
    if (action==='legacy-group-new-task') {ctx.newTaskForGroup(id?currentGroup(ctx,decode(id)):null);return true;}
    if (action==='legacy-period') {clearDraftForm('legacy-timeline-filter');timeline.date=id==='today'?ctx.today:H.shiftDate(timeline.date||ctx.today,timeline.period,Number(id));timeline.limit=100;ctx.navigate('timeline');return true;}
    if (action==='legacy-more-tasks') {timeline.limit+=100;ctx.navigate('timeline');return true;}
    if (action==='legacy-new') {if (!['tag','place'].includes(id)) throw Error('分类类型无效');entityForm(ctx,{type:id,name:'',projectId:''});return true;}
    if (action==='legacy-edit') {entityForm(ctx,decode(id));return true;}
    if (action==='legacy-delete') {
      const group=decode(id);
      if (!['tag','place'].includes(group.type)) throw Error('项目删除请使用项目管理');
      ctx.modal('<h2>删除' + labels[group.type] + '“' + esc(ctx,group.name) + '”？</h2><p>任务和子任务保留，仅清除这个精确名称的关联。</p><footer class="form-actions">' + button(ctx,'取消','legacy-close') + button(ctx,'确认删除','legacy-delete-confirm',id,'danger') + '</footer>');
      return true;
    }
    if (action==='legacy-delete-confirm') {
      const group=decode(id), key=group.type==='tag'?'tags':group.type==='place'?'places':null;
      if (!key) throw Error('项目删除请使用项目管理');
      ctx.transaction(state=>{
        if (!state[key].includes(group.name)) throw Error('分类已不存在');
        state[key]=state[key].filter(name=>name!==group.name);
        for (const task of H.flattenTasks(state.tasks)) {
          if (group.type==='tag') task.tags=task.tags.filter(name=>name!==group.name);
          else if (task.place===group.name) task.place='';
        }
      });
      changedGroup(group,null);ctx.closeModal();ctx.toast('已删除分类，任务保留');return true;
    }
    return false;
  }
  function submit(name, values, ctx) {
    if (name==='legacy-catalog-filter') {catalog={query:String(values.get('query')||''),archived:String(values.get('archived')||'active')};ctx.navigate('catalogs');return true;}
    if (name==='legacy-timeline-filter') {
      Object.assign(timeline,{query:String(values.get('query')||''),status:String(values.get('status')||'all'),date:String(values.get('date')||ctx.today),period:String(values.get('period')||'day'),sort:String(values.get('sort')||'time'),allDates:values.has('allDates'),limit:100});
      ctx.navigate('timeline');return true;
    }
    if (name!=='legacy-catalog') return false;
    const type=String(values.get('type')), original=String(values.get('originalName')||''), newName=String(values.get('name')||'').trim();
    if (!['tag','place'].includes(type)) throw Error('分类类型无效');
    if (!newName || newName.length>100) throw Error('名称请输入 1–100 字');
    const key=type==='tag'?'tags':'places';
    ctx.transaction(state=>{
      if (original && !state[key].includes(original)) throw Error('分类已不存在，未重新创建');
      if (state[key].some(existing=>existing!==original && existing===newName)) throw Error('这个名称已经存在');
      if (!original) state[key].push(newName);
      else {
        state[key]=state[key].map(existing=>existing===original?newName:existing);
        for (const task of H.flattenTasks(state.tasks)) {
          if (type==='tag') task.tags=task.tags.map(existing=>existing===original?newName:existing);
          else if (task.place===original) task.place=newName;
        }
      }
    });
    changedGroup({type,name:original},{type,name:newName,projectId:''});ctx.closeModal();ctx.toast('已保存分类');return true;
  }
  window.DemoLegacyPages = Object.freeze({
    render(route,ctx) {return route==='catalogs'?catalogsPage(ctx):route==='timeline'?timelinePage(ctx):null;},
    act, submit, groupTasks,
    reset() {catalog={query:'',archived:'active'};timeline={group:null,query:'',status:'all',allDates:true,date:'',period:'day',sort:'time',limit:100};}
  });
}());
