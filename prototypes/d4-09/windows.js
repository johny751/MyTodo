'use strict';

// Isolated design prototype. Synthetic state stays in this document's memory.
// This file does not import product modules, use product storage, or call a network.
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = (value = '') => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const TODAY = '2026-11-28';
  const statusNames = {pending:'待处理',running:'进行中',paused:'已暂停',waiting:'等待中',completed:'已完成',cancelled:'已取消'};
  const kindNames = {task:'个人任务',item:'工作事项',project:'项目',template:'流程模板',instance:'流程实例',contact:'往来对象',followup:'跟进记录'};
  const qNames = ['重要且紧急','重要不紧急','紧急不重要','不重要不紧急'];
  const paths = {
    quadrants:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    dashboard:'M3 11l9-8 9 8 M5 10v11h14V10 M9 21v-7h6v7',
    items:'M9 5h12 M9 12h12 M9 19h12 M3 5l1 1 2-2 M3 12l1 1 2-2 M3 19l1 1 2-2',
    projects:'M3 7h7l2-3h9v16H3z M3 7V4h7l2 3',
    templates:'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5',
    instances:'M4 4h6v6H4z M14 14h6v6h-6z M10 7h7v7 M4 17h6 M7 14v6',
    contacts:'M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M5 21v-3a7 7 0 0 1 14 0v3 M19 6h3 M20 11h2',
    followups:'M4 4h16v13H9l-5 4z M8 8h8 M8 12h5',
    archive:'M3 4h18v4H3z M5 8v13h14V8 M9 12h6',
    timer:'M8 2h8 M12 6v7l4 2 M20 4l-2 2 M21 14a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    statistics:'M4 21V12h4v9 M10 21V7h4v14 M16 21V3h4v18',
    settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    feedback:'M3 4h18v13H8l-5 4z M8 8h8 M8 12h5'
  };
  const pages = [
    {id:'quadrants',name:'四象限',group:'个人效率',eyebrow:'PERSONAL WORKSPACE',subtitle:'先把注意力留给重要的事。拖动任务调整象限。',kind:'task'},
    {id:'timer',name:'番茄专注',group:'个人效率',eyebrow:'FOCUS SESSION',subtitle:'一次只推进一件事，让专注留下记录。'},
    {id:'dashboard',name:'工作台',group:'工作管理',eyebrow:'YOUR WORK, CONNECTED',subtitle:'今天的待办、项目和流程，放在同一个视野里。'},
    {id:'items',name:'工作事项',group:'工作管理',eyebrow:'WORK QUEUE',subtitle:'每项工作都关联到清楚的项目、负责人和下一步。',kind:'item'},
    {id:'projects',name:'项目管理',group:'工作管理',eyebrow:'PROJECTS',subtitle:'从工作事项看到项目的进展与脉络。',kind:'project'},
    {id:'templates',name:'流程模板',group:'工作管理',eyebrow:'REUSABLE PROCESSES',subtitle:'把成熟的工作方法整理成可复用的步骤。',kind:'template'},
    {id:'instances',name:'流程实例',group:'工作管理',eyebrow:'PROCESS IN MOTION',subtitle:'看清当前阶段，推进每一个明确的下一步。',kind:'instance'},
    {id:'contacts',name:'往来管理',group:'工作管理',eyebrow:'PEOPLE & CONTEXT',subtitle:'保留联系信息，以及与工作相关的上下文。',kind:'contact'},
    {id:'followups',name:'跟进管理',group:'工作管理',eyebrow:'FOLLOW THROUGH',subtitle:'一次沟通，一条记录，一个约定好的下一步。',kind:'followup'},
    {id:'archive',name:'工作归档',group:'工作管理',eyebrow:'COMPLETED CHAPTERS',subtitle:'已归档的工作仍可查阅，需要时可恢复。'},
    {id:'statistics',name:'统计分析',group:'观察与设置',eyebrow:'WORK INSIGHTS',subtitle:'按事项到期日查看工作分布；取消事项不计入完成率。'},
    {id:'settings',name:'系统设置',group:'观察与设置',eyebrow:'YOUR WORKSPACE',subtitle:'调整阅读密度，查看来源与原型边界。'},
    {id:'feedback',name:'想法与反馈',group:'观察与设置',eyebrow:'IDEAS & FEEDBACK',subtitle:'先把想法记下来。本页仅保存本次会话的演示草稿。'}
  ];
  const seed = [
    {id:'p1',kind:'project',name:'客户工作台改版',status:'running',color:'#176B87',owner:'林舟',members:'林舟、陈昕、周然',dueDate:'2026-12-12',description:'梳理客户进入工作台后的关键路径，减少来回切换，让每日工作有明确的下一步。',notes:'本周完成交互方案；下周进入走查。',next:'确认工作台交互方案',progress:62},
    {id:'p2',kind:'project',name:'冬季产品发布',status:'running',color:'#A47D36',owner:'陈昕',members:'陈昕、林舟',dueDate:'2026-12-05',description:'准备产品介绍、发布检查和交接材料。',notes:'发布清单与负责人保持同步。',next:'核对发布清单',progress:38},
    {id:'p3',kind:'project',name:'团队知识库',status:'waiting',color:'#438275',owner:'周然',members:'周然、林舟',dueDate:'2026-12-18',description:'整理项目复盘和常用工作流程，降低重复沟通。',notes:'先从最近两个项目开始。',next:'收集项目复盘',progress:24},
    {id:'i1',kind:'item',name:'确认工作台交互方案',status:'running',projectId:'p1',owner:'林舟',priority:'high',plannedStart:'2026-11-28 09:00',dueDate:'2026-11-28 16:00',description:'核对工作台中的待处理队列、项目进展与流程入口。确认信息优先级，并完成桌面布局走查。',notes:'长备注演示：项目状态、关联流程和当前负责人需要在同一个阅读区域中完整呈现。选择文字后，选区应清楚可见；窄窗口允许自动换行，不截断原始内容。\n历史时间原文：2026-11-26T23:15:47.123-05:00。',next:'完成工作台和事项详情走查',processId:'in1',tags:'设计, 本周',attachments:[{name:'工作台范围说明.pdf',size:'268 KB（合成条目）'}]},
    {id:'i2',kind:'item',name:'核对发布素材与文案',status:'pending',projectId:'p2',owner:'陈昕',priority:'normal',dueDate:'2026-11-28',description:'检查产品截图、功能说明与更新公告。',notes:'先确认内容，再统一导出。',next:'等待第一版文案'},
    {id:'i3',kind:'item',name:'整理客户访谈问题',status:'waiting',projectId:'p1',owner:'周然',priority:'normal',dueDate:'2026-11-29',description:'围绕近期反馈整理访谈提纲。',notes:'等待两位使用者补充时间。',next:'确认访谈时间'},
    {id:'i4',kind:'item',name:'完成发布前检查清单',status:'completed',projectId:'p2',owner:'林舟',priority:'high',dueDate:'2026-11-27',description:'逐项确认发布准备情况。',notes:'已完成初次检查。',next:'已完成'},
    {id:'i5',kind:'item',name:'补充组件使用示例',status:'pending',projectId:'p3',owner:'周然',priority:'low',dueDate:'2026-11-27',description:'为常用组件补充实际使用场景。',notes:'',next:'整理已有示例'},
    {id:'i6',kind:'item',name:'旧活动页素材整理',status:'cancelled',projectId:'p2',owner:'陈昕',priority:'low',dueDate:'2026-11-30',description:'本轮范围已取消。',notes:'保留记录用于回看。',next:'无需继续'},
    {id:'tm1',kind:'template',name:'设计评审与交付',status:'pending',owner:'林舟',enabled:true,description:'从范围确认到交付，帮助团队对齐每一步。',notes:'每个步骤完成后再推进下一步。',steps:['确认需求范围','完成交互评审','校验视觉与状态','整理交付说明'],revision:3,next:'可建立流程实例'},
    {id:'tm2',kind:'template',name:'产品发布检查',status:'pending',owner:'陈昕',enabled:true,description:'发布前确认内容、验证结果与交接信息。',notes:'',steps:['核对发布范围','检查验收记录','准备发布材料','确认交接'],revision:2,next:'可建立流程实例'},
    {id:'in1',kind:'instance',name:'工作台改版 · 设计评审',status:'running',projectId:'p1',owner:'林舟',templateId:'tm1',steps:['确认需求范围','完成交互评审','校验视觉与状态','整理交付说明'],currentStep:1,dueDate:'2026-11-30',description:'本实例使用设计评审与交付模板第3版。',notes:'先确认交互，再做视觉走查。',next:'完成交互评审'},
    {id:'in2',kind:'instance',name:'冬季发布 · 上线检查',status:'paused',projectId:'p2',owner:'陈昕',templateId:'tm2',steps:['核对发布范围','检查验收记录','准备发布材料','确认交接'],currentStep:2,dueDate:'2026-12-04',description:'等待素材补齐后继续。',notes:'暂停不会丢失当前进度。',next:'准备发布材料'},
    {id:'c1',kind:'contact',name:'陈昕',status:'pending',organization:'产品协作组',role:'产品负责人',email:'chenxin@example.invalid',phone:'演示号码 000-0000',description:'负责产品范围与发布准备。',notes:'沟通前先同步当前材料。',next:'确认发布文案'},
    {id:'c2',kind:'contact',name:'周然',status:'pending',organization:'体验设计组',role:'设计协作',email:'zhouran@example.invalid',phone:'演示号码 000-0001',description:'负责访谈与知识沉淀。',notes:'',next:'同步访谈安排'},
    {id:'f1',kind:'followup',name:'确认发布文案交付时间',status:'waiting',projectId:'p2',owner:'林舟',contactId:'c1',workItemId:'i2',occurredOn:'2026-11-28 10:30',dueDate:'2026-11-30',description:'沟通第一版文案范围，约定周一上午完成。',notes:'收到材料后安排一次校对。',next:'周一查看首版文案'},
    {id:'ar1',kind:'item',name:'秋季体验复盘',status:'completed',projectId:'p3',owner:'林舟',archived:true,dueDate:'2026-11-20',description:'已完成并整理为知识库素材。',notes:'归档后仍保留内容与历史。',next:'已归档'},
    {id:'t1',kind:'task',name:'准备下午的方案评审',status:'pending',quadrant:0,projectId:'p1',dueDate:'2026-11-28',tags:'设计, 今天',description:'准备交互方案、待讨论问题和下一步建议。',notes:'优先检查工作台与事项详情。',next:'补齐两处状态示例',children:[{id:'tc1',name:'整理评审目标',done:true},{id:'tc2',name:'补齐空态与错误示例',done:false},{id:'tc3',name:'发送评审材料',done:false}]},
    {id:'t2',kind:'task',name:'跟进发布素材确认',status:'pending',quadrant:0,projectId:'p2',dueDate:'2026-11-28',tags:'沟通',description:'向协作者确认素材范围。',notes:'',next:'查看陈昕反馈',children:[]},
    {id:'t3',kind:'task',name:'阅读并整理访谈记录',status:'pending',quadrant:1,projectId:'p1',dueDate:'2026-11-30',tags:'研究',description:'提取重复出现的体验问题。',notes:'',next:'阅读第二份记录',children:[{id:'tc4',name:'阅读第一份记录',done:true},{id:'tc5',name:'阅读第二份记录',done:false}]},
    {id:'t4',kind:'task',name:'规划下周的专注时间',status:'pending',quadrant:1,dueDate:'2026-11-29',tags:'计划',description:'为重要工作预留连续时间。',notes:'',next:'确认可用时间',children:[]},
    {id:'t5',kind:'task',name:'回复协作日程邀请',status:'pending',quadrant:2,dueDate:'2026-11-28',tags:'沟通',description:'确认下周会议时间。',notes:'',next:'查看日程邀请',children:[]},
    {id:'t6',kind:'task',name:'整理灵感收藏夹',status:'pending',quadrant:3,tags:'灵感',description:'把有用参考归类。',notes:'不占用今天主要精力。',next:'有空时整理',children:[]}
  ].map(record => ({history:[{time:'2026-11-28 09:00',text:'创建演示记录'}],attachments:[],archived:false,...record}));
  const feedbackSeed = [
    {id:'fb1',title:'让项目颜色贯穿工作列表',category:'体验优化',status:'pending',body:'希望在工作事项和流程详情里看到一致的项目色标，方便判断归属。',images:[],submitted:true,updated:'10:42'},
    {id:'fb2',title:'给长备注保留更多阅读空间',category:'功能建议',status:'pending',body:'阅读详情时先展示完整备注，编辑时再进入表单。',images:[],submitted:false,updated:'09:18'}
  ];
  let records = clone(seed), feedback = clone(feedbackSeed), deletedFeedback = [];
  let pageId = 'quadrants', demoState = 'populated', menuTrigger = null, toastHandle, loadingHandle;
  let sequence = 100, editorRecord = null, editorInitial = '', editorOrigin = null, confirmCallback = null;
  let feedbackSelected = 'fb1', feedbackSaveHandle, feedbackDirty = false;
  const views = Object.fromEntries(pages.map(page => [page.id,{query:'',status:'all',project:'all',selected:null,scroll:0,showDetail:false,boardMode:'board',zoom:null,expanded:new Set(),from:'',to:''}]));
  views.quadrants.selected = 't1'; views.items.selected = 'i1'; views.projects.selected = 'p1'; views.templates.selected = 'tm1'; views.instances.selected = 'in1'; views.contacts.selected = 'c1'; views.followups.selected = 'f1'; views.archive.selected = 'ar1';
  let timer = {state:'idle',phase:'focus',mode:'countdown',minutes:25,elapsed:0,startedAt:0,taskId:'t1',historyFilter:'all',history:[{id:'h1',task:'确认工作台交互方案',minutes:25,phase:'focus',state:'completed',time:'10:30',day:TODAY},{id:'h2',task:'阅读并整理访谈记录',minutes:25,phase:'focus',state:'completed',time:'09:50',day:TODAY},{id:'h3',task:'休息',minutes:5,phase:'break',state:'completed',time:'09:20',day:TODAY},{id:'h4',task:'整理昨日工作记录',minutes:18,phase:'focus',state:'ended',time:'18:10',day:'2026-11-27'}]};
  const currentPage = () => pages.find(page => page.id === pageId);
  const currentView = () => views[pageId];
  const byId = id => records.find(record => record.id === id);
  const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#176B87';
  const projectOf = record => record.kind === 'project' ? record : byId(record.projectId);
  const projectStyle = record => `--project-color:${color(projectOf(record)?.color)}`;
  const icon = name => `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${paths[name] || paths.items}"/></svg></span>`;
  const badge = status => `<span class="status-pill ${esc(status)}">${esc(statusNames[status] || status)}</span>`;
  const action = (name, label, extra = '', className = 'secondary-button') => `<button type="button" class="${className}" data-action="${name}" ${extra}>${label}</button>`;
  const recordButton = (name, label, record, className) => action(name,label,`data-id="${esc(record.id)}"`,className);
  function notify(message) {
    clearTimeout(toastHandle); $('#toast').textContent = message; $('#toast').hidden = false;
    $('#status-context').textContent = message;
    toastHandle = setTimeout(() => {$('#toast').hidden = true;},4000);
  }
  function log(record, text) { record.history = [...(record.history || []),{time:`${TODAY} · 本次演示`,text}]; }
  function renderNav() {
    let group = '';
    $('#main-nav').innerHTML = pages.map(page => {
      const heading = page.group !== group ? `<div class="nav-group">${esc(page.group)}</div>` : ''; group = page.group;
      const count = page.id === 'items' ? records.filter(record => record.kind === 'item' && !record.archived && !['completed','cancelled'].includes(record.status)).length : null;
      return `${heading}<button class="nav-button" data-page="${page.id}" title="${page.name}" ${pageId === page.id ? 'aria-current="page"' : ''}>${icon(page.id)}<span class="nav-label">${page.name}</span>${count !== null ? `<span class="nav-count">${count}</span>` : ''}</button>`;
    }).join('');
  }
  function headerActions() {
    const page = currentPage();
    if (page.kind) return action('page-menu','更多 <span aria-hidden="true">⌄</span>','aria-haspopup="menu"') + action('new',`<span aria-hidden="true">＋</span> 新建${kindNames[page.kind]}`, '', 'primary-button');
    if (pageId === 'dashboard') return action('goto','查看工作事项','data-target="items"') + action('new','＋ 新建工作事项','data-kind="item"','primary-button');
    if (pageId === 'timer') return action('timer-settings','计时说明') + action('timer-history','查看历史','', 'secondary-button');
    if (pageId === 'statistics') return action('stats-info','统计口径') + action('export','导出演示快照');
    if (pageId === 'feedback') return action('feedback-menu','更多 <span aria-hidden="true">⌄</span>','aria-haspopup="menu"') + action('feedback-new','＋ 记个想法','','primary-button');
    if (pageId === 'archive') return action('page-menu','归档操作 <span aria-hidden="true">⌄</span>','aria-haspopup="menu"');
    return action('version','版本与来源');
  }
  function renderToolbar() {
    const view = currentView();
    if (!currentPage().kind && !['archive','statistics'].includes(pageId)) {$('#page-toolbar').innerHTML = ''; return;}
    const projectOptions = records.filter(record => record.kind === 'project' && !record.archived).map(record => `<option value="${esc(record.id)}" ${view.project === record.id ? 'selected' : ''}>${esc(record.name)}</option>`).join('');
    $('#page-toolbar').innerHTML = `<div class="toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><span class="visually-hidden">搜索当前页面</span><input id="page-search" data-filter="query" value="${esc(view.query)}" placeholder="${pageId === 'quadrants' ? '搜索任务、标签或子任务' : '搜索名称、负责人或内容'}" autocomplete="off"></label><label>状态<select id="status-filter" data-filter="status"><option value="all">全部状态</option>${Object.entries(statusNames).map(([key,label]) => `<option value="${key}" ${view.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>项目<select id="project-filter" data-filter="project"><option value="all">全部项目</option>${projectOptions}</select></label><span class="toolbar-spacer"></span>${pageId === 'quadrants' ? `<div class="segmented-control" aria-label="任务视图">${action('board-mode','四象限',`data-mode="board" aria-pressed="${view.boardMode === 'board'}"`,'')}${action('board-mode','列表',`data-mode="list" aria-pressed="${view.boardMode === 'list'}"`,'')}</div>` : action('clear-filters','清除筛选','','quiet-button')}</div>${pageId === 'statistics' ? `<div class="toolbar"><label>到期起日<input type="date" id="stats-from" value="${esc(view.from)}" data-filter="from"></label><label>到期止日<input type="date" id="stats-to" value="${esc(view.to)}" data-filter="to"></label><span class="muted small">北京时间 · 含起止两日</span></div>` : ''}`;
  }
  function matches(record, view = currentView()) {
    const query = view.query.toLocaleLowerCase().trim();
    const text = [record.name,record.owner,record.description,record.notes,record.tags,record.organization,record.email,record.phone,...(record.steps || []),...(record.children || []).map(child => child.name)].filter(Boolean).join(' ').toLocaleLowerCase();
    return (!query || text.includes(query)) && (view.status === 'all' || record.status === view.status) && (view.project === 'all' || (record.kind === 'project' ? record.id : record.projectId) === view.project);
  }
  function filteredRecords() {
    if (demoState === 'empty') return [];
    const kind = currentPage().kind;
    return records.filter(record => (pageId === 'archive' ? record.archived && record.kind !== 'task' : !record.archived && record.kind === kind) && matches(record));
  }
  function emptyState(title = '还没有符合条件的记录', message = '清除筛选，或创建一条新记录开始整理工作。', create = true) {
    return `<div class="empty-state" data-state="empty"><div><div class="empty-symbol" aria-hidden="true">▤</div><h2>${title}</h2><p>${message}</p>${create ? action('empty-create','＋ 创建第一条记录','','primary-button') : action('clear-filters','清除筛选','','primary-button')}</div></div>`;
  }
  function recordMeta(record) {
    const project = projectOf(record);
    if (record.kind === 'contact') return esc([record.organization,record.role].filter(Boolean).join(' · '));
    if (record.kind === 'template') return `${record.steps.length} 个步骤 · 第 ${record.revision || 1} 版 · ${record.enabled ? '可用' : '已停用'}`;
    if (record.kind === 'instance') return `步骤 ${Math.min((record.currentStep || 0)+1,record.steps.length)} / ${record.steps.length} · ${esc(project?.name || '未关联项目')}`;
    return `${project ? `<span class="project-dot" style="${projectStyle(record)}"></span>${esc(project.name)}` : '未关联项目'}${record.tags ? ` · ${esc(record.tags)}` : ''}`;
  }
  function renderList() {
    const rows = filteredRecords(), view = currentView();
    const selected = rows.find(record => record.id === view.selected);
    const list = rows.length ? `<div class="list-caption"><strong>${pageId === 'archive' ? '已归档记录' : currentPage().name}</strong><span>${rows.length} 条 · 选择记录查看详情</span></div><table class="work-table" aria-label="${currentPage().name}列表"><thead><tr><th>名称与关联</th><th class="status-col">状态</th><th class="date-col">到期</th><th class="person-col">负责人</th><th class="more-col"><span class="visually-hidden">操作</span></th></tr></thead><tbody>${rows.map(record => `<tr tabindex="0" data-row-id="${esc(record.id)}" ${view.selected === record.id ? 'class="is-selected" aria-selected="true"' : 'aria-selected="false"'}><td><span class="record-name">${esc(record.name)}</span><span class="record-meta">${recordMeta(record)}</span></td><td>${badge(record.status)}</td><td class="date-cell"><span class="${record.dueDate && record.dueDate.slice(0,10) < TODAY && !['completed','cancelled'].includes(record.status) ? 'danger-text' : 'muted'}">${esc(record.dueDate?.slice(5,10) || '—')}</span></td><td class="person-cell">${esc(record.owner || '—')}</td><td class="more-cell">${recordButton('record-menu','⋯',record,'icon-button')}</td></tr>`).join('')}</tbody></table><div class="list-footer">Enter 查看详情 · 双击编辑 · 数据仅为设计演示</div>` : emptyState();
    return `<section class="workspace-grid ${view.showDetail ? 'show-detail' : ''}" aria-label="列表与详情"><div class="work-list">${list}</div>${detailHTML(selected)}</section>`;
  }
  function detailHTML(record) {
    if (!record) return '<aside class="detail-panel"><div class="detail-empty"><span class="empty-glyph" aria-hidden="true">▥</span><strong>工作脉络，从这里展开</strong><p>选择一条记录，查看项目、下一步和完整内容。</p></div></aside>';
    const project = projectOf(record);
    let fields = [['负责人',record.owner || '未指定'],['到期时间',record.dueDate || '未设置']];
    if (record.kind === 'task') fields = [['所属象限',qNames[record.quadrant]],['到期时间',record.dueDate || '未设置'],['标签',record.tags || '未设置']];
    if (record.kind === 'contact') fields = [['单位 / 组织',record.organization || '—'],['角色 / 职务',record.role || '—'],['邮箱',record.email || '—'],['电话',record.phone || '—']];
    if (record.kind === 'followup') fields.push(['往来对象',byId(record.contactId)?.name || '未关联'],['工作事项',byId(record.workItemId)?.name || '未关联'],['实际跟进',record.occurredOn || '未设置']);
    if (record.kind === 'project') fields.push(['成员',record.members || '未指定'],['项目颜色',record.color || '默认']);
    if (record.kind === 'item') fields.push(['优先级',({high:'高',normal:'普通',low:'低'})[record.priority] || record.priority || '普通'],['计划开始',record.plannedStart || '未设置']);
    let primary = recordButton('toggle-complete',record.status === 'completed' ? '设为待处理' : '标记完成',record,'primary-button');
    if (record.kind === 'template') primary = recordButton('create-instance','建立实例',record,'primary-button');
    if (record.kind === 'instance') primary = record.status === 'completed' ? '<span class="status-pill completed">流程已完成</span>' : recordButton(record.status === 'paused' ? 'instance-resume' : 'instance-advance',record.status === 'paused' ? '继续流程' : '完成当前步骤',record,'primary-button');
    if (record.archived) primary = recordButton('archive','恢复归档',record,'primary-button');
    return `<aside class="detail-panel" data-detail-id="${esc(record.id)}" style="${projectStyle(record)}"><div class="detail-topline"><span>${esc(kindNames[record.kind])}详情</span><div>${action('close-detail','← 列表','','quiet-button back-to-list')}${recordButton('record-menu','⋯',record,'icon-button')}</div></div><h2>${esc(record.name)}</h2><div class="detail-project">${project ? `<span class="project-dot"></span>${esc(project.name)}` : '独立工作记录'} ${badge(record.status)}</div><div class="next-action"><small>下一步</small><strong>${esc(record.kind === 'instance' ? record.steps[record.currentStep] || '所有步骤已完成' : record.next || '确认下一步行动')}</strong></div><div class="detail-actions">${primary}${recordButton('edit','编辑',record,'secondary-button')}${record.kind === 'instance' && record.status === 'running' ? recordButton('instance-pause','暂停',record,'quiet-button') : ''}</div><section class="detail-section"><h3>工作信息</h3><dl class="detail-fields">${fields.map(([label,value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join('')}</dl></section>${record.steps ? `<section class="detail-section"><h3>${record.kind === 'template' ? '模板步骤' : '流程进度'}</h3><ol class="step-list">${record.steps.map((step,index) => `<li class="${record.kind === 'instance' && (index < record.currentStep || record.status === 'completed') ? 'done' : record.kind === 'instance' && index === record.currentStep ? 'current' : ''}"><span class="step-dot">${record.kind === 'instance' && index < record.currentStep ? '✓' : ''}</span>${esc(step)}<small>${record.kind === 'template' ? `第 ${index+1} 步` : index < record.currentStep ? '已完成' : index === record.currentStep ? record.status === 'paused' ? '已暂停，等待继续' : '当前步骤' : '等待前序步骤'}</small></li>`).join('')}</ol></section>` : ''}<section class="detail-section"><h3>说明</h3><p>${esc(record.description || '暂无说明。')}</p></section><section class="detail-section"><h3>备注</h3><p>${esc(record.notes || '暂无备注。')}</p></section>${record.attachments?.length ? `<section class="detail-section"><h3>附件</h3>${record.attachments.map(file => `<div class="attachment-row"><span aria-hidden="true">▧</span><strong>${esc(file.name)}</strong><small>${esc(file.size)}</small></div>`).join('')}<small class="muted">原型中的合成附件仅展示信息，无真实文件。</small></section>` : ''}<div class="detail-footer"><span>本次会话 · ${esc(record.id)}</span>${recordButton('history','查看操作历史',record,'text-button')}</div></aside>`;
  }
  function renderBoard() {
    const view = currentView();
    if (view.boardMode === 'list') return renderList();
    const rows = filteredRecords();
    return `<div class="board-and-detail ${view.showDetail ? 'show-detail' : ''}"><section class="quadrant-board" aria-label="四象限任务看板">${qNames.map((name,index) => {
      if (view.zoom !== null && view.zoom !== index) return '';
      const tasks = rows.filter(record => record.quadrant === index), remaining = tasks.filter(record => record.status !== 'completed').length;
      return `<section class="quadrant q${index} ${view.zoom === index ? 'zoomed' : ''}" data-drop-quadrant="${index}" aria-label="${name}"><header class="quadrant-header"><div class="quadrant-heading"><h2>${name}</h2><small>${remaining}</small></div><div class="quadrant-tools">${action('new','＋',`data-kind="task" data-quadrant="${index}" aria-label="在${name}新建任务"`,'icon-button')}${action('zoom',view.zoom === index ? '↙' : '↗',`data-quadrant="${index}" aria-label="${view.zoom === index ? '还原四象限' : `放大${name}`}" aria-pressed="${view.zoom === index}"`,'icon-button')}</div></header>${tasks.length ? tasks.map(task => {
        const expanded = view.expanded.has(task.id) || Boolean(view.query && task.children?.some(child => child.name.includes(view.query)));
        const incomplete = task.children?.filter(child => !child.done).length || 0;
        return `<article class="task-card ${view.selected === task.id ? 'is-selected' : ''} ${task.status === 'completed' ? 'is-done' : ''}" draggable="true" data-task-id="${esc(task.id)}"><div class="task-line">${recordButton('toggle-complete',task.status === 'completed' ? '✓' : '',task,'task-check '+(task.status === 'completed' ? 'is-done' : ''))}<button class="task-title" data-action="select" data-id="${esc(task.id)}">${esc(task.name)}</button>${recordButton('record-menu','⋯',task,'icon-button')}</div><div class="task-meta">${task.projectId ? `<span class="project-dot" style="${projectStyle(task)}"></span><span>${esc(byId(task.projectId)?.name || '未关联')}</span>` : ''}${task.dueDate ? `<span>${task.dueDate === TODAY ? '今天' : esc(task.dueDate.slice(5))}</span>` : ''}${task.children?.length ? `<button class="subtask-toggle" data-action="expand-task" data-id="${task.id}" aria-expanded="${expanded}">${expanded ? '⌄' : '›'} ${incomplete} 项未完成子任务</button>` : ''}</div>${expanded ? `<ul class="subtask-list">${task.children.map(child => `<li><input type="checkbox" data-child-id="${child.id}" data-parent-id="${task.id}" aria-label="完成子任务：${esc(child.name)}" ${child.done ? 'checked' : ''}><span class="${child.done ? 'is-done' : ''}">${esc(child.name)}</span></li>`).join('')}</ul>` : ''}</article>`;
      }).join('') : '<div class="board-empty">这里暂时没有任务</div>'}${action('new','＋ 添加任务',`data-kind="task" data-quadrant="${index}"`,'quadrant-add')}</section>`;
    }).join('')}</section>${detailHTML(rows.find(record => record.id === view.selected))}</div>`;
  }
  function renderDashboard() {
    if (demoState === 'empty') return emptyState('开始整理你的工作','创建工作事项，或先建立一个项目，把相关工作放在一起。');
    const items = records.filter(record => record.kind === 'item' && !record.archived), active = items.filter(record => !['completed','cancelled'].includes(record.status));
    const overdue = active.filter(record => record.dueDate?.slice(0,10) < TODAY), projects = records.filter(record => record.kind === 'project' && !record.archived);
    return `<div class="overview-strip"><div class="overview-metric"><small>待推进事项</small><strong>${active.length}</strong><em>把下一步安排好</em></div><div class="overview-metric"><small>今天到期</small><strong>${active.filter(record => record.dueDate?.slice(0,10) === TODAY).length}</strong><em>留意当天安排</em></div><div class="overview-metric"><small>等待跟进</small><strong>${items.filter(record => record.status === 'waiting').length}</strong><em>保持协作同步</em></div><div class="overview-metric"><small>逾期事项</small><strong class="warning">${overdue.length}</strong><em>重新确认时间</em></div></div><div class="dashboard-layout"><section><div class="section-heading"><h2>接下来要推进的工作</h2>${action('goto','查看全部 →','data-target="items"','text-button')}</div><div class="queue-list">${active.map(record => `<div class="queue-row"><span class="project-dot" style="${projectStyle(record)}"></span><div class="row-main"><span class="record-name">${esc(record.name)}</span><span class="record-meta">${esc(byId(record.projectId)?.name || '未关联')} · ${esc(record.owner)} · ${esc(record.dueDate?.slice(0,10) === TODAY ? '今天' : record.dueDate || '未设到期')}</span></div>${badge(record.status)}${recordButton('open-record','查看 →',record,'text-button')}</div>`).join('')}</div><div class="section-heading" style="margin-top:26px"><h2>正在推进的流程</h2>${action('goto','流程实例 →','data-target="instances"','text-button')}</div><div class="queue-list">${records.filter(record => record.kind === 'instance' && !record.archived).map(record => `<div class="queue-row"><div class="row-main"><span class="record-name">${esc(record.name)}</span><span class="record-meta">${esc(record.steps[record.currentStep] || '已完成所有步骤')} · 第 ${Math.min(record.currentStep+1,record.steps.length)} / ${record.steps.length} 步</span></div>${badge(record.status)}${recordButton('open-record','查看 →',record,'text-button')}</div>`).join('')}</div></section><aside><div class="section-heading"><h2>项目进展</h2>${action('goto','项目 →','data-target="projects"','text-button')}</div>${projects.map(record => `<div class="project-summary" style="${projectStyle(record)}"><div class="project-summary-title"><span class="project-dot"></span>${recordButton('open-record',esc(record.name),record,'text-button')}</div><p>${esc(record.next)}</p><div class="progress-track"><span style="width:${record.progress || 0}%"></span></div><div class="progress-caption"><span>${esc(record.owner)} · ${esc(record.dueDate)}</span><span>${record.progress || 0}%（演示）</span></div></div>`).join('')}<div class="section-heading" style="margin-top:22px"><h2>最近动态</h2></div><ul class="activity-list"><li><time>10:42</time><span><strong>工作台改版</strong><br>进入交互评审阶段</span></li><li><time>09:30</time><span><strong>发布前检查清单</strong><br>已完成，保留工作记录</span></li><li><time>09:00</time><span><strong>团队知识库</strong><br>补充了下一步行动</span></li></ul></aside></div>`;
  }
  function elapsed() {return timer.elapsed + (timer.state === 'running' ? (performance.now() - timer.startedAt) / 1000 : 0);}
  function timerText() {
    const seconds = Math.max(0,Math.floor(timer.mode === 'countdown' ? timer.minutes*60 - elapsed() : elapsed()));
    return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }
  const timerStateName = () => ({idle:'准备好了，开始一段专注',running:'专注进行中',paused:'已暂停，按自己的节奏继续',completed:'本轮已完成，请确认',ended:'本次已结束，记录已保留'})[timer.state];
  function timerButtons() {
    if (timer.state === 'running') return action('timer-pause','Ⅱ 暂停','','primary-button') + action('timer-end','结束本次') + (timer.mode === 'countup' ? action('timer-finish','完成专注') : '');
    if (timer.state === 'paused') return action('timer-resume','▶ 继续专注','','primary-button') + action('timer-end','结束本次');
    if (timer.state === 'completed') return action('timer-ack','确认完成','','primary-button');
    return action('timer-start',timer.phase === 'break' ? '▶ 开始休息' : '▶ 开始专注','','primary-button') + action('timer-phase',timer.phase === 'break' ? '切回专注' : '休息一下');
  }
  function renderTimer() {
    const busy = ['running','paused'].includes(timer.state), today = demoState === 'empty' ? [] : timer.history.filter(entry => entry.day === TODAY && entry.phase === 'focus');
    const history = demoState === 'empty' ? [] : timer.history.filter(entry => timer.historyFilter === 'all' || entry.phase === timer.historyFilter);
    return `<div class="timer-layout"><section class="focus-panel"><div class="focus-context"><div><small>当前关联任务</small><strong id="timer-task-title">${esc(byId(timer.taskId)?.name || '未关联任务')}</strong></div>${action('timer-task','更换','','quiet-button')}</div><div class="timer-visual"><div class="timer-phase" id="timer-phase">${timer.phase === 'break' ? '休息 · 恢复精力' : '专注 · 推进重要工作'}</div><div class="timer-digits" id="timer-clock" role="timer" aria-label="计时显示">${timerText()}</div><div class="timer-state" id="timer-state" aria-live="polite">${timerStateName()}</div><div class="timer-track" aria-hidden="true"><span id="timer-progress" style="width:${Math.min(100,elapsed() / (timer.minutes*60)*100)}%"></span></div></div><div class="timer-actions" id="timer-actions">${timerButtons()}</div><div class="timer-config"><label>计时模式<select id="timer-mode" ${busy || timer.state === 'completed' ? 'disabled' : ''}><option value="countdown" ${timer.mode === 'countdown' ? 'selected' : ''}>倒计时</option><option value="countup" ${timer.mode === 'countup' ? 'selected' : ''}>正计时</option></select></label><label>${timer.phase === 'break' ? '休息' : '专注'}时长（分钟）<input id="timer-minutes" type="number" min="1" max="180" step="1" value="${timer.minutes}" ${busy || timer.state === 'completed' ? 'disabled' : ''}></label><p class="timer-config-note">原型计时在当前页面会话内演示。切页继续；刷新重置；不代表原生后台计时验证。</p></div></section><aside class="timer-history" id="timer-history"><div class="timer-totals"><div><small>今日专注</small><strong>${Math.round(today.reduce((sum,entry) => sum+entry.minutes,0))}</strong><em>分钟</em></div><div><small>完成番茄</small><strong>${today.filter(entry => entry.state === 'completed' && (entry.mode || 'countdown') === 'countdown').length}</strong><em>轮</em></div></div><div class="section-heading"><h2>专注历史</h2><div class="segmented-control" aria-label="历史筛选">${[['all','全部'],['focus','专注'],['break','休息']].map(([value,label]) => action('timer-filter',label,`data-filter-value="${value}" aria-pressed="${timer.historyFilter === value}"`,'')).join('')}</div></div>${history.length ? history.map(entry => `<div class="history-item"><span class="history-icon" aria-hidden="true">${entry.phase === 'break' ? '☕' : entry.state === 'completed' ? '✓' : '◷'}</span><div><strong>${esc(entry.task)}</strong><small>${entry.day === TODAY ? '今天' : esc(entry.day.slice(5))} ${esc(entry.time)} · ${entry.state === 'completed' ? '已完成' : '提前结束'} · ${entry.phase === 'break' ? '休息' : '专注'}</small></div><span class="history-duration">${entry.minutes}<small> min</small></span></div>`).join('') : '<div class="detail-empty"><strong>还没有专注记录</strong><p>完成或结束一轮后，记录会出现在这里。</p></div>'}<p class="chart-note" style="margin-top:16px">日期与初始历史均为合成示例。原生统计口径以已验收的计时内核为准。</p></aside></div>`;
  }
  function statsItems() {
    const view = currentView();
    return demoState === 'empty' ? [] : records.filter(record => record.kind === 'item' && !record.archived && matches(record) && (!view.from || (record.dueDate && record.dueDate.slice(0,10) >= view.from)) && (!view.to || (record.dueDate && record.dueDate.slice(0,10) <= view.to)));
  }
  function renderStatistics() {
    const items = statsItems(), completed = items.filter(record => record.status === 'completed').length, cancelled = items.filter(record => record.status === 'cancelled').length;
    const eligible = items.length-cancelled, rate = eligible ? Math.round(completed/eligible*100) : 0;
    const overdue = items.filter(record => record.dueDate?.slice(0,10) < TODAY && !['completed','cancelled'].includes(record.status)).length;
    const projects = records.filter(record => record.kind === 'project' && !record.archived && (currentView().project === 'all' || record.id === currentView().project));
    const days = ['11-25','11-26','11-27','11-28','11-29','11-30','12-01'];
    const values = days.map(day => items.filter(record => record.dueDate?.slice(5,10) === day).length), maximum = Math.max(1,...values);
    return `<div class="overview-strip"><div class="overview-metric"><small>筛选事项</small><strong>${items.length}</strong><em>未归档事项</em></div><div class="overview-metric"><small>已完成</small><strong>${completed}</strong><em>共 ${eligible} 项有效事项</em></div><div class="overview-metric"><small>完成率</small><strong>${rate}%</strong><em>排除 ${cancelled} 项取消</em></div><div class="overview-metric"><small>已逾期</small><strong class="warning">${overdue}</strong><em>需要重新安排</em></div></div><div class="chart-layout"><section class="chart-section"><div class="section-heading"><h2>到期事项分布</h2><span class="muted small">按到期日 · 合成数据</span></div><div class="bar-chart" role="img" aria-label="到期事项分布：${days.map((day,index) => `${day} ${values[index]}项`).join('，')}">${days.map((day,index) => `<div class="chart-column ${day === '11-28' ? 'current' : ''}"><span>${values[index]}</span><div class="bar" style="height:${values[index]/maximum*140}px"></div><small>${day === '11-28' ? '今天' : day}</small></div>`).join('')}</div><p class="chart-note">筛选按北京时间的到期日期，含起止两日。图表仅展示上述七日窗口；无有效到期日的事项不进入日期区间。图表不能用作跨平台统计一致性证明。</p></section><section class="chart-section"><h2 style="font-size:15px">工作完成情况</h2><div class="donut-wrap"><div class="donut" style="background:conic-gradient(var(--focus) 0 ${rate}%,#d8e5ec ${rate}% 100%)" role="img" aria-label="完成率${rate}%"><div class="donut-label"><strong>${rate}%</strong><small>事项完成率</small></div></div><ul class="legend"><li><span></span>已完成 ${completed}</li><li><span class="remaining"></span>未完成 ${Math.max(0,eligible-completed)}</li><li>已取消 ${cancelled}（不计入）</li></ul></div><p class="chart-note">当前筛选下无有效事项时，完成率显示为0%。</p></section></div><section style="margin-top:26px"><div class="section-heading"><h2>项目进度</h2><span class="muted small">与上方使用相同事项筛选</span></div><div class="queue-list">${projects.map(project => {const rows=items.filter(record=>record.projectId===project.id), valid=rows.filter(record=>record.status!=='cancelled'), done=valid.filter(record=>record.status==='completed').length;const percent=valid.length?Math.round(done/valid.length*100):0;return `<div class="queue-row" style="${projectStyle(project)}"><span class="project-dot"></span><div class="row-main"><span class="record-name">${esc(project.name)}</span><span class="record-meta">${rows.length} 项 · 完成 ${done} 项</span></div><div style="width:140px"><div class="progress-track"><span style="width:${percent}%"></span></div></div><span class="number small">${percent}%</span></div>`;}).join('')}</div></section>`;
  }
  function renderSettings() {
    return `<div class="settings-layout"><section class="settings-section"><h2>阅读与显示</h2><div class="setting-row"><div><strong>紧凑列表</strong><p>减小列表行间距，在桌面上同时查看更多工作。</p></div><button class="switch-button" role="switch" aria-checked="${document.body.classList.contains('is-compact')}" aria-label="紧凑列表" data-action="density"><span></span></button></div><div class="setting-row"><div><strong>减少动态效果</strong><p>关闭原型中的短暂状态过渡；系统减少动态效果设置也会生效。</p></div><button class="switch-button" role="switch" aria-checked="${document.body.classList.contains('reduced-motion')}" aria-label="减少动态效果" data-action="motion"><span></span></button></div></section><section class="settings-section"><h2>本机演示数据</h2><div class="setting-row"><div><strong>数据只保留在当前页面内存</strong><p>不读取产品数据库，不连接账号服务。刷新页面将恢复初始合成数据。</p></div>${action('export','导出演示快照')}</div><div class="setting-row"><div><strong>恢复初始演示</strong><p>重置本页创建、编辑、计时与反馈的临时状态。</p></div>${action('reset-demo','恢复初始数据')}</div></section><section class="settings-section"><h2>版本与来源</h2><div class="version-block"><strong>MyTodo · D4-09 Windows 设计原型</strong><br>设计版本 D4-09.1 · by codex<br>业务参考源码 7c217 · 日期 2026-11-28 Asia/Shanghai<br>这是浏览器设计演示，不是 Win32 可执行包。没有 APK / EXE 编译时间。</div><div class="version-actions">${action('version-copy','复制来源信息','','text-button')}${action('version','查看版本说明','','text-button')}${action('boundaries','数据与实现边界','','text-button')}</div></section></div>`;
  }
  function renderFeedback() {
    const idea = feedback.find(record => record.id === feedbackSelected);
    const list = demoState === 'empty' ? [] : feedback;
    return `<div class="feedback-layout"><aside class="feedback-list" aria-label="反馈记录">${list.length ? list.map(record => `<button class="feedback-card ${record.id === feedbackSelected ? 'is-selected' : ''}" data-action="feedback-select" data-id="${record.id}"><strong>${esc(record.title || '未命名草稿')}</strong><small>${esc(record.category)} · ${record.submitted ? '本机已记录' : '草稿'} · ${esc(record.updated)}</small></button>`).join('') : '<p class="muted small">这里还没有想法。点击“记个想法”开始。</p>'}</aside><section class="feedback-editor">${idea && demoState !== 'empty' ? `<h2>${idea.submitted ? '想法详情' : '记录一个想法'}</h2><div class="form-grid"><label class="field full"><span class="field-label">标题</span><input id="feedback-title" value="${esc(idea.title)}" placeholder="一句话描述你的想法" maxlength="300"></label><label class="field"><span class="field-label">类型</span><select id="feedback-category">${['功能建议','问题反馈','体验优化','其他'].map(value => `<option ${value === idea.category ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label class="field"><span class="field-label">本机状态</span><select id="feedback-status"><option value="pending" ${idea.status === 'pending' ? 'selected' : ''}>待处理</option><option value="resolved" ${idea.status === 'resolved' ? 'selected' : ''}>已处理</option></select></label><label class="field full"><span class="field-label">详细说明</span><textarea id="feedback-body" placeholder="描述场景、期待的变化或复现步骤">${esc(idea.body)}</textarea></label><div class="field full"><span class="field-label">参考图片</span><div class="image-strip">${idea.images.map((file,index) => `<figure class="feedback-image"><img src="${esc(file.url)}" alt="${esc(file.name)}"><button data-action="feedback-remove-image" data-index="${index}" aria-label="移除图片：${esc(file.name)}">×</button><figcaption>${esc(file.name)}</figcaption></figure>`).join('')}</div><div>${action('feedback-add-image','＋ 添加图片','','secondary-button')}<input type="file" id="feedback-images" accept="image/png,image/jpeg,image/gif,image/bmp" multiple hidden></div><span class="field-hint">浏览器临时图片预览，最多20张、每张10MiB。刷新后释放，不上传。</span></div></div><div class="feedback-footer"><span id="feedback-save-status" aria-live="polite">已保存在本次会话 · 不发送到远程服务</span><div>${action('feedback-save','保存草稿')}${action('feedback-submit','记录到本机列表','','primary-button')}</div></div>` : emptyState('把想法先记下来','它可以是一处需要优化的细节，也可以是下一次改进的起点。',false).replace('data-action="clear-filters"','data-action="feedback-new"').replace('清除筛选','记个想法')}</section></div>`;
  }
  function renderContent() {
    $('#notice-region').innerHTML = '';
    if (demoState === 'loading') {$('#page-content').innerHTML = '<div class="skeleton" role="status" data-state="loading"><p class="skeleton-label">正在载入演示视图…</p><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>'; return;}
    $('#notice-region').innerHTML = demoState === 'error' ? `<div class="notice error" role="alert" data-state="error"><p><strong>模拟保存未完成</strong>当前演示内容仍在，点击重试恢复。此状态不代表真实存储错误。</p>${action('retry','重试','','secondary-button')}</div>` : '';
    let content;
    if (pageId === 'quadrants') content = renderBoard();
    else if (pageId === 'dashboard') content = renderDashboard();
    else if (pageId === 'timer') content = renderTimer();
    else if (pageId === 'statistics') content = renderStatistics();
    else if (pageId === 'settings') content = renderSettings();
    else if (pageId === 'feedback') content = renderFeedback();
    else content = renderList();
    $('#page-content').innerHTML = content;
    $$('.task-check').forEach(button => {const record=byId(button.dataset.id);button.setAttribute('aria-label',`${record?.status === 'completed' ? '设为待处理' : '完成任务'}：${record?.name || ''}`);});
    $$('.more-cell .icon-button,.task-line .icon-button,.detail-topline .icon-button').forEach(button => {button.setAttribute('aria-label',`更多操作：${byId(button.dataset.id)?.name || '记录'}`);button.setAttribute('aria-haspopup','menu');});
  }
  function renderPage() {
    const page = currentPage(); renderNav();
    $('#breadcrumb').textContent = `${page.group} / ${page.name}`;
    $('#page-eyebrow').textContent = page.eyebrow;
    $('#page-title').textContent = page.name;
    $('#page-subtitle').textContent = page.subtitle;
    $('#page-actions').innerHTML = headerActions();
    renderToolbar(); renderContent();
  }
  function navigate(target, selected) {
    if (!pages.some(page => page.id === target)) return;
    flushFeedback(); closeMenu(false);
    currentView().scroll = $('#workspace').scrollTop;
    pageId = target;
    if (selected) {currentView().selected=selected;currentView().showDetail=true;}
    renderPage(); $('#workspace').scrollTop = currentView().scroll;
    history.replaceState(null,'',`#${target}`);
    $('#page-title').focus({preventScroll:true});
  }
  function openRecord(id) {
    const record = byId(id); if (!record) return;
    const target = record.archived ? 'archive' : pages.find(page => page.kind === record.kind)?.id || 'items';
    navigate(target,id);
  }
  function closeMenu(restoreFocus = true) {$('#context-menu').hidden=true;if(restoreFocus && menuTrigger?.isConnected)menuTrigger.focus();menuTrigger=null;}
  function openMenu(trigger, items) {
    closeMenu(false);menuTrigger=trigger;
    const menu=$('#context-menu');menu.innerHTML=items.map(item=>item.divider?'<div class="menu-divider" role="separator"></div>':`<button role="menuitem" data-action="${item.action}" ${item.id?`data-id="${esc(item.id)}"`:''} ${item.value!==undefined?`data-value="${esc(item.value)}"`:''} ${item.target?`data-target="${item.target}"`:''} class="${item.danger?'danger-text':''}">${esc(item.label)}${item.shortcut?`<small>${esc(item.shortcut)}</small>`:''}</button>`).join('');menu.hidden=false;
    const bounds=trigger.getBoundingClientRect();menu.style.left=`${Math.max(12,Math.min(bounds.right-menu.offsetWidth,innerWidth-menu.offsetWidth-12))}px`;menu.style.top=`${Math.max(12,Math.min(bounds.bottom+6,innerHeight-menu.offsetHeight-12))}px`;menu.querySelector('button')?.focus();
  }
  function showInfo(title, html) {$('#info-title').textContent=title;$('#info-content').innerHTML=html;if(!$('#info-dialog').open)$('#info-dialog').showModal();}
  function confirm(title, message, callback, label='确认', destructive=false, alternate) {
    $('#confirm-title').textContent=title;$('#confirm-message').textContent=message;confirmCallback=callback;
    $('#confirm-actions').innerHTML=`${action('confirm-cancel','取消')}${alternate? action('confirm-alternate',esc(alternate.label),'','secondary-button'):''}${action('confirm-accept',esc(label),'',destructive?'danger-button':'primary-button')}`;
    $('#confirm-dialog')._alternate=alternate?.callback || null;$('#confirm-dialog').showModal();$('#confirm-actions [data-action="confirm-cancel"]').focus();
  }
  function showHistory(record) {showInfo('操作历史',`<p class="muted">${esc(record.name)} · 本次会话的合成记录</p><ol class="history-timeline">${[...(record.history || [])].reverse().map(event=>`<li><time>${esc(event.time)}</time>${esc(event.text)}</li>`).join('')}</ol>`);}
  function field(label, name, value='', options={}) {
    const {type='text',full=false,hint='',choices,required=false,rows=4}=options;
    const control=choices?`<select name="${name}" id="edit-${name}">${choices.map(choice=>`<option value="${esc(choice.value)}" ${String(value)===String(choice.value)?'selected':''}>${esc(choice.label)}</option>`).join('')}</select>`:type==='textarea'?`<textarea name="${name}" id="edit-${name}" rows="${rows}">${esc(value)}</textarea>`:`<input name="${name}" id="edit-${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${name==='name'?'maxlength="300"':''} ${name==='tags'?'list="tag-options"':''}>`;
    return `<label class="field ${full?'full':''}"><span class="field-label">${label}${required?' <span class="danger-text">*</span>':''}</span>${control}${hint?`<span class="field-hint">${hint}</span>`:''}</label>`;
  }
  function relationChoices(kind) {return [{value:'',label:'未关联'},...records.filter(record=>record.kind===kind&&!record.archived).map(record=>({value:record.id,label:record.name}))];}
  function beginNew(kind, quadrant=0) {
    if(kind==='instance'){
      const templates=records.filter(record=>record.kind==='template'&&!record.archived&&record.enabled);
      showInfo('从模板建立流程实例',templates.length?`<p class="muted">实例保留建立时的步骤副本。选择一个可用模板开始。</p>${templates.map(record=>`<div class="queue-row"><div class="row-main"><strong class="record-name">${esc(record.name)}</strong><span class="record-meta">${record.steps.length} 个步骤 · 第 ${record.revision||1} 版</span></div>${recordButton('create-instance','建立实例',record,'text-button')}</div>`).join(''):`<p>目前没有可用模板。先建立并启用一个流程模板。</p>${action('goto-from-info','前往流程模板','data-target="templates"','primary-button')}`);
      return;
    }
    openEditor(null,kind,quadrant);
  }
  function openEditor(record, kind, quadrant=0) {
    editorOrigin=document.activeElement;editorRecord=record?clone(record):{id:'',kind:kind||'item',name:'',status:'pending',owner:'林舟',priority:'normal',quadrant,projectId:currentView().project==='all'?'':currentView().project,description:'',notes:'',next:'',steps:['确认范围','执行工作','检查结果'],children:[],enabled:true};
    const item=editorRecord;
    $('#editor-title').textContent=`${record?'编辑':'新建'}${kindNames[item.kind]}`;
    let html=field('名称','name',item.name,{full:true,required:true});
    if(item.kind==='task') html+=field('所属象限','quadrant',item.quadrant,{choices:qNames.map((label,value)=>({label,value}))});
    if(item.kind!=='instance')html+=field('状态','status',item.status,{choices:Object.entries(statusNames).filter(([key])=>key!=='paused').map(([value,label])=>({value,label}))});
    if(['item','instance','followup','task'].includes(item.kind))html+=`<label class="field"><span class="field-label">关联项目</span><input name="projectLabel" id="edit-projectLabel" value="${esc(byId(item.projectId)?.name||'')}" list="project-options" autocomplete="off" placeholder="输入项目名称查找"><input name="projectId" id="edit-projectId" type="hidden" value="${esc(item.projectId||'')}"><span class="field-hint">选择已有项目；清空可解除关联。候选值映射到稳定ID。</span></label><datalist id="project-options">${records.filter(record=>record.kind==='project'&&!record.archived).map(record=>`<option value="${esc(record.name)}" data-project-id="${esc(record.id)}"></option>`).join('')}</datalist>`;
    if(['item','project','instance','template'].includes(item.kind))html+=field('负责人','owner',item.owner);
    if(item.kind==='project')html+=field('成员','members',item.members||'',{hint:'用逗号分隔成员。'})+`<label class="field"><span class="field-label">项目颜色</span><div class="color-input-row"><input name="color" id="edit-color" value="${esc(item.color||'#176B87')}" pattern="#[0-9a-fA-F]{6}" aria-describedby="color-hint"><span class="color-preview" id="edit-color-preview" style="--project-color:${color(item.color)}" aria-hidden="true"></span></div><span class="field-hint" id="color-hint">输入 #RRGGBB，保留原始值。</span></label>`;
    if(item.kind==='item')html+=field('优先级','priority',item.priority,{choices:[{value:'high',label:'高'},{value:'normal',label:'普通'},{value:'low',label:'低'}]})+field('计划开始','plannedStart',item.plannedStart||'',{hint:'日期、北京时间到分钟，或保留已有历史时间。'});
    if(!['contact','template'].includes(item.kind))html+=field('到期时间','dueDate',item.dueDate||'',{hint:'例如 2026-11-28 或 2026-11-28 16:00；历史秒与时区原文保持可读。'});
    if(item.kind==='contact')html+=field('单位 / 组织','organization',item.organization||'')+field('角色 / 职务','role',item.role||'')+field('邮箱','email',item.email||'')+field('电话','phone',item.phone||'');
    if(item.kind==='followup')html+=field('往来对象','contactId',item.contactId||'',{choices:relationChoices('contact')})+field('关联工作事项','workItemId',item.workItemId||'',{choices:relationChoices('item')})+field('实际跟进时间','occurredOn',item.occurredOn||'');
    if(item.kind==='template')html+=field('模板状态','enabled',item.enabled?'true':'false',{choices:[{value:'true',label:'启用'},{value:'false',label:'停用'}]})+field('步骤','steps',(item.steps||[]).join('\n'),{type:'textarea',full:true,hint:'每行一步，1–20步。实例使用创建时的步骤副本。'});
    html+=field('下一步','next',item.next||'',{full:true})+field('说明','description',item.description||'',{type:'textarea',full:true,rows:3})+field('备注','notes',item.notes||'',{type:'textarea',full:true,hint:'长文本可换行与选择，不截短历史时间。'});
    if(item.kind==='task')html+=field('标签','tags',item.tags||'',{full:true,hint:'输入时可选择已有标签；用逗号分隔。'})+field('子任务','children',(item.children||[]).map(child=>child.name).join('\n'),{type:'textarea',full:true,hint:'每行一个子任务；已存在且同名的完成状态保留。'});
    $('#editor-fields').innerHTML=`<div class="form-grid">${html}</div><datalist id="tag-options"><option value="设计"><option value="本周"><option value="沟通"><option value="研究"><option value="计划"></datalist>`;
    $('#editor-error').hidden=true;$('#editor-dialog').showModal();$('#edit-name').focus();editorInitial=formSnapshot();
  }
  function formSnapshot() {return JSON.stringify(Array.from(new FormData($('#editor-form')).entries()));}
  function closeEditor(force=false) {
    if(!$('#editor-dialog').open)return;
    if(!force && formSnapshot()!==editorInitial){confirm('保存这次编辑？','你修改了演示记录。保存后保留在本次页面会话中，放弃则返回原内容。',()=>{if(saveEditor())closeEditor(true);},'保存并关闭',false,{label:'放弃修改',callback:()=>closeEditor(true)});return;}
    $('#editor-dialog').close();editorRecord=null;if(editorOrigin?.isConnected)editorOrigin.focus();
  }
  function saveEditor() {
    if(!editorRecord)return false;
    const values=Object.fromEntries(new FormData($('#editor-form'))), fail=message=>{$('#editor-error').textContent=message;$('#editor-error').hidden=false;return false;};
    if(!values.name?.trim()){$('#edit-name').focus();return fail('请填写名称。已输入的其他内容保持不变。');}
    if(values.color && !/^#[0-9a-fA-F]{6}$/.test(values.color))return fail('项目颜色须为 #RRGGBB，例如 #176B87。');
    for(const key of ['dueDate','plannedStart','occurredOn'])if(values[key] && values[key]!==editorRecord[key] && !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(values[key]))return fail('时间请使用日期、北京时间到分钟，或保留原有历史格式。');
    if(values.plannedStart && values.dueDate && /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/.test(values.plannedStart) && /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/.test(values.dueDate) && values.plannedStart>values.dueDate)return fail('计划开始不能晚于到期时间，请调整后保存。');
    const next={...editorRecord,...values};
    if(Object.hasOwn(values,'projectLabel')){const project=records.find(record=>record.kind==='project'&&!record.archived&&record.name===values.projectLabel);if(values.projectLabel&&!project)return fail('请选择候选中的已有项目，或清空项目输入。当前草稿保持不变。');next.projectId=project?.id||'';delete next.projectLabel;}
    if(next.kind==='task'){next.quadrant=Number(values.quadrant);next.children=(values.children||'').split('\n').map(value=>value.trim()).filter(Boolean).map(name=>editorRecord.children?.find(child=>child.name===name)||{id:`child-${++sequence}`,name,done:false});}
    if(next.kind==='template'){next.enabled=values.enabled==='true';next.steps=(values.steps||'').split('\n').map(value=>value.trim()).filter(Boolean);if(!next.steps.length||next.steps.length>20)return fail('流程模板需要1–20个步骤。');next.revision=(editorRecord.revision||0)+1;}
    if(demoState==='error'){fail('这是模拟保存失败。草稿已保留，可点击重试保存。');$('#editor-error').insertAdjacentHTML('beforeend',` <button type="button" class="text-button" data-action="retry-editor">重试保存</button>`);return false;}
    const isNew=!next.id;if(isNew){next.id=`demo-${++sequence}`;next.history=[];next.archived=false;next.attachments=[];records.push(next);}else records=records.map(record=>record.id===next.id?next:record);
    log(next,isNew?'创建了演示记录':'更新了演示记录');currentView().selected=next.id;currentView().showDetail=true;demoState='populated';
    editorInitial=formSnapshot();closeEditor(true);renderNav();renderToolbar();renderContent();notify('已保存到本次演示会话');return true;
  }
  function recordMenu(trigger, record) {
    const items=[{action:'edit',label:'编辑记录',id:record.id,shortcut:'双击'},{action:'history',label:'查看操作历史',id:record.id}];
    if(record.kind==='task'){items.push({divider:true});qNames.forEach((name,index)=>items.push({action:'move-task',label:`移到 · ${name}`,id:record.id,value:index}));}
    if(record.kind==='template')items.push({action:'create-instance',label:'从模板建立实例',id:record.id},{action:'template-copy',label:'复制模板',id:record.id},{action:'template-toggle',label:record.enabled?'停用模板':'启用模板',id:record.id});
    if(record.kind==='instance'&&record.status==='running')items.push({action:'instance-pause',label:'暂停流程',id:record.id});
    if(record.kind==='instance'&&record.status==='paused')items.push({action:'instance-resume',label:'继续流程',id:record.id});
    items.push({divider:true},{action:'archive',label:record.archived?'恢复归档':'归档记录',id:record.id},{action:'delete',label:'删除演示记录',id:record.id,danger:true});
    openMenu(trigger,items);
  }
  function createInstance(template) {
    if(!template.enabled){notify('模板已停用，请先启用模板');return;}
    if($('#info-dialog').open)$('#info-dialog').close();
    const instance={id:`demo-${++sequence}`,kind:'instance',name:`${template.name} · 新实例`,status:'running',templateId:template.id,steps:[...template.steps],currentStep:0,owner:'林舟',projectId:'',description:`使用“${template.name}”第${template.revision||1}版创建的演示步骤副本。`,notes:'',next:template.steps[0],archived:false,history:[],attachments:[]};
    log(instance,'从模板创建演示实例');records.push(instance);navigate('instances',instance.id);notify('已建立演示流程实例');
  }
  function archiveRecord(record) {record.archived=!record.archived;log(record,record.archived?'归档了记录':'恢复了归档');currentView().showDetail=false;renderNav();renderContent();notify(record.archived?'已归档，可在工作归档中恢复':'已恢复到原模块');}
  function deleteRecord(record) {
    const suffix=record.kind==='project'?'其余演示记录会保留，并解除项目关联。':record.kind==='contact'?'对应演示跟进记录也会删除。':'此操作只影响当前页面内存。';
    confirm('删除这条演示记录？',`“${record.name}”将从本次演示中移除。${suffix}`,()=>{records=records.filter(row=>row.id!==record.id && !(record.kind==='contact'&&row.kind==='followup'&&row.contactId===record.id));if(record.kind==='project')records.forEach(row=>{if(row.projectId===record.id){row.projectId='';log(row,'删除项目后解除关联');}});renderNav();renderToolbar();renderContent();notify('演示记录已删除');},'删除记录',true);
  }
  function timerRecord(status) {
    const duration=Math.min(timer.mode==='countdown'?timer.minutes*60:Infinity,elapsed());
    timer.elapsed=duration;timer.state=status;timer.startedAt=0;
    timer.history.unshift({id:`h-${++sequence}`,task:timer.phase==='break'?'休息':byId(timer.taskId)?.name||'未关联任务',minutes:Math.round(duration/6)/10,phase:timer.phase,mode:timer.mode,state:status,time:'本次演示',day:TODAY});
    if(pageId==='timer')renderContent();notify(status==='completed'?'本轮已完成，记录已加入历史':'本次计时已结束，记录已保留');
  }
  function timerTaskPicker() {
    showInfo('选择当前专注任务',`<label class="field"><span class="field-label">搜索任务或子任务</span><input id="task-picker-search" placeholder="输入关键词" autocomplete="off"></label><div id="task-picker-results" style="margin-top:16px"></div>`);renderTaskChoices('');
  }
  function renderTaskChoices(query) {
    const matches=records.filter(record=>record.kind==='task'&&!record.archived && [record.name,...(record.children||[]).map(child=>child.name)].some(name=>name.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
    $('#task-picker-results').innerHTML=matches.length?matches.map(record=>`<div class="queue-row"><div class="row-main"><strong class="record-name">${esc(record.name)}</strong><span class="record-meta">${record.children?.filter(child=>!child.done).length||0} 项未完成子任务 · ${esc(byId(record.projectId)?.name||'未关联项目')}</span>${query?`<ul class="checklist">${(record.children||[]).filter(child=>child.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(child=>`<li>${esc(child.name)}</li>`).join('')}</ul>`:''}</div>${recordButton('choose-timer-task',timer.taskId===record.id?'当前任务':'选择',record,'text-button')}</div>`).join(''):'<p class="muted">没有找到匹配任务。试试更短的关键词。</p>';
  }
  function flushFeedback() {
    clearTimeout(feedbackSaveHandle);if(!feedbackDirty || pageId!=='feedback')return;
    const idea=feedback.find(record=>record.id===feedbackSelected);if(!idea||!$('#feedback-title'))return;
    idea.title=$('#feedback-title').value;idea.body=$('#feedback-body').value;idea.category=$('#feedback-category').value;idea.status=$('#feedback-status').value;idea.updated='本次会话';feedbackDirty=false;
    const status=$('#feedback-save-status');if(status)status.textContent='已保存在本次会话 · 不发送到远程服务';
    const card=$(`.feedback-card[data-id="${idea.id}"] strong`);if(card)card.textContent=idea.title||'未命名草稿';
  }
  function newFeedback() {
    flushFeedback();const idea={id:`fb-${++sequence}`,title:'',category:'功能建议',status:'pending',body:'',images:[],submitted:false,updated:'刚刚'};feedback.unshift(idea);feedbackSelected=idea.id;demoState='populated';if(pageId!=='feedback')navigate('feedback');else renderContent();$('#feedback-title')?.focus();
  }
  function exportDemo() {
    flushFeedback();const data={format:'mytodo.d409.windows.design-demo',version:1,note:'Synthetic browser prototype only. This is not a product backup or cross-platform interchange format.',records,timer:{...timer,elapsed:elapsed(),startedAt:0},feedback:feedback.map(record=>({...record,images:record.images.map(image=>({name:image.name,size:image.size,note:'Preview bytes are not included.'}))}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='MyTodo-D409-Windows-演示快照.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('已导出演示快照；它不是产品备份');
  }
  function resetDemo() {confirm('恢复初始演示数据？','这会清除本页会话中新建、编辑、计时与反馈的临时改动。产品数据不受影响。',()=>{feedback.forEach(record=>record.images.forEach(image=>URL.revokeObjectURL(image.url)));records=clone(seed);feedback=clone(feedbackSeed);feedbackSelected='fb1';deletedFeedback=[];timer.state='idle';timer.elapsed=0;timer.startedAt=0;timer.taskId='t1';timer.mode='countdown';timer.minutes=25;timer.phase='focus';timer.history=timer.history.filter(entry=>!entry.id.startsWith('h-'));demoState='populated';renderPage();notify('已恢复初始演示数据');},'恢复初始数据',true);}
  async function copyText(value) {
    try {if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);}else{const input=document.createElement('textarea');input.value=value;input.style.position='fixed';input.style.left='-10000px';document.body.append(input);input.select();const copied=document.execCommand('copy');input.remove();if(!copied)throw new Error('copy unavailable');}notify('已复制来源信息');}
    catch {showInfo('复制来源信息',`<p>浏览器未提供复制权限，可选择下面的内容手动复制。</p><textarea readonly style="width:100%;min-height:130px">${esc(value)}</textarea>`);}
  }
  const versionText='MyTodo D4-09 Windows 设计原型\n设计版本 D4-09.1 · by codex\n参考源码 7c217d8779ccf21e13733b28868e015e9cfd693a\n设计日期 2026-11-28 Asia/Shanghai\n浏览器合成数据原型，无 EXE/APK 编译时间；非原生运行证明。';
  function setDemoState(value) {
    flushFeedback();clearTimeout(loadingHandle);demoState=value;renderContent();
    if(value==='loading')loadingHandle=setTimeout(()=>{demoState='populated';renderContent();notify('演示内容已载入');},1400);
    else notify(({populated:'已恢复正常演示内容',empty:'正在展示空状态，原合成数据保持在内存中',error:'正在展示模拟错误，可点击重试'})[value]);
  }
  const handlers = {
    'new':button=>beginNew(button.dataset.kind||currentPage().kind||'item',Number(button.dataset.quadrant||0)),
    'edit':button=>openEditor(byId(button.dataset.id)),
    'select':button=>{currentView().selected=button.dataset.id;currentView().showDetail=true;renderContent();},
    'open-record':button=>openRecord(button.dataset.id),
    'goto':button=>navigate(button.dataset.target),
    'goto-from-info':button=>{$('#info-dialog').close();navigate(button.dataset.target);},
    'close-detail':()=>{currentView().showDetail=false;renderContent();},
    'record-menu':button=>recordMenu(button,byId(button.dataset.id)),
    'history':button=>showHistory(byId(button.dataset.id)),
    'archive':button=>archiveRecord(byId(button.dataset.id)),
    'delete':button=>deleteRecord(byId(button.dataset.id)),
    'toggle-complete':button=>{const record=byId(button.dataset.id);record.status=record.status==='completed'?'pending':'completed';log(record,`状态变为${statusNames[record.status]}`);renderNav();renderContent();notify(record.status==='completed'?'已标记完成':'已设为待处理');},
    'move-task':button=>{const record=byId(button.dataset.id);record.quadrant=Number(button.dataset.value);log(record,`移到${qNames[record.quadrant]}`);renderContent();notify(`已移到${qNames[record.quadrant]}`);},
    'expand-task':button=>{const set=currentView().expanded;set.has(button.dataset.id)?set.delete(button.dataset.id):set.add(button.dataset.id);renderContent();},
    'zoom':button=>{const view=currentView();view.zoom=view.zoom===Number(button.dataset.quadrant)?null:Number(button.dataset.quadrant);renderContent();},
    'board-mode':button=>{currentView().boardMode=button.dataset.mode;renderToolbar();renderContent();},
    'clear-filters':()=>{Object.assign(currentView(),{query:'',status:'all',project:'all',from:'',to:''});renderToolbar();renderContent();},
    'empty-create':()=>{demoState='populated';beginNew(currentPage().kind||'item');},
    'page-menu':button=>openMenu(button,[{action:'clear-filters',label:'清除当前筛选'},{action:'export',label:'导出演示快照'},{divider:true},{action:'goto',label:'查看归档记录',target:'archive'},{action:'help',label:'查看快捷键'}]),
    'demo-menu':button=>openMenu(button,[{action:'demo-state',label:'正常内容',value:'populated'},{action:'demo-state',label:'空状态',value:'empty'},{action:'demo-state',label:'加载状态（1.4秒）',value:'loading'},{action:'demo-state',label:'模拟保存错误',value:'error'},{divider:true},{action:'reset-demo',label:'恢复初始演示数据',danger:true}]),
    'demo-state':button=>setDemoState(button.dataset.value),
    'retry':()=>{demoState='populated';renderContent();notify('已恢复演示视图，内容保持不变');},
    'retry-editor':()=>{demoState='populated';saveEditor();},
    'account-menu':button=>openMenu(button,[{action:'account-info',label:'林舟 · 本机演示账号'},{action:'boundaries',label:'查看数据边界'}]),
    'account-info':()=>showInfo('本机演示账号','<p>当前显示“林舟的工作空间”。这是合成数据账号，不连接账号服务，也不读取真实用户资料。</p><p>正式应用的账号隔离与切换语义继续沿用既有实现。</p>'),
    'help':()=>showInfo('快捷键与原型说明','<p>此原型用于讨论 Windows 信息结构与交互；所有数据只保留在页面内存中。</p><table><tr><td><span class="kbd">Ctrl+N</span></td><td>在当前工作上下文新建记录</td></tr><tr><td><span class="kbd">Ctrl+F</span></td><td>聚焦当前页搜索</td></tr><tr><td><span class="kbd">Ctrl+Enter</span></td><td>保存正在编辑的记录</td></tr><tr><td><span class="kbd">Esc</span></td><td>关闭菜单或弹窗；未保存内容先确认</td></tr><tr><td><span class="kbd">Enter</span></td><td>在已聚焦列表行上打开详情</td></tr></table><p>四象限支持鼠标拖动与三点菜单移动；子任务默认折叠，搜索命中时展开。计时切页继续，刷新重置。菜单可使用上下方向键、Home/End选择。</p><p class="muted">设计原型不是 Win32 应用运行证明，不代表后台生命周期、同步、真实备份或正式签名已验证。</p>'),
    'close-editor':()=>closeEditor(),
    'close-info':()=>$('#info-dialog').close(),
    'confirm-cancel':()=>{$('#confirm-dialog').close();confirmCallback=null;},
    'confirm-accept':()=>{const callback=confirmCallback;confirmCallback=null;$('#confirm-dialog').close();callback?.();},
    'confirm-alternate':()=>{const callback=$('#confirm-dialog')._alternate;confirmCallback=null;$('#confirm-dialog').close();callback?.();},
    'create-instance':button=>createInstance(byId(button.dataset.id)),
    'template-copy':button=>{const original=byId(button.dataset.id),copy={...clone(original),id:`demo-${++sequence}`,name:`${original.name}（副本）`,revision:1,history:[]};log(copy,'复制演示模板');records.push(copy);currentView().selected=copy.id;renderContent();notify('已复制模板');},
    'template-toggle':button=>{const record=byId(button.dataset.id);record.enabled=!record.enabled;log(record,record.enabled?'启用模板':'停用模板');renderContent();notify(record.enabled?'模板已启用':'模板已停用');},
    'instance-pause':button=>{const record=byId(button.dataset.id);if(record.status!=='running')return;record.status='paused';log(record,'暂停流程');renderContent();notify('流程已暂停，当前步骤已保留');},
    'instance-resume':button=>{const record=byId(button.dataset.id);if(record.status!=='paused')return;record.status='running';log(record,'继续流程');renderContent();notify('流程已继续');},
    'instance-advance':button=>{const record=byId(button.dataset.id);if(record.status!=='running')return;log(record,`完成步骤：${record.steps[record.currentStep]}`);record.currentStep++;if(record.currentStep>=record.steps.length)record.status='completed';record.next=record.steps[record.currentStep]||'所有步骤已完成';renderContent();notify(record.status==='completed'?'流程已完成':'当前步骤完成，已进入下一步');},
    'timer-start':()=>{if(['running','paused','completed'].includes(timer.state))return;timer.elapsed=0;timer.startedAt=performance.now();timer.state='running';renderContent();notify(timer.phase==='break'?'休息计时已开始':'专注计时已开始');},
    'timer-pause':()=>{if(timer.state!=='running')return;timer.elapsed=elapsed();timer.startedAt=0;timer.state='paused';renderContent();notify('计时已暂停');},
    'timer-resume':()=>{if(timer.state!=='paused')return;timer.startedAt=performance.now();timer.state='running';renderContent();notify('计时已继续');},
    'timer-end':()=>confirm('结束本次计时？','已投入的时间会作为“提前结束”记录保留在演示历史中。',()=>timerRecord('ended'),'结束并保留记录'),
    'timer-finish':()=>{if(timer.mode==='countup'&&['running','paused'].includes(timer.state))timerRecord('completed');},
    'timer-ack':()=>{if(timer.state!=='completed')return;timer.state='idle';timer.elapsed=0;renderContent();notify('已确认完成，可以开始下一轮');},
    'timer-phase':()=>{if(['running','paused','completed'].includes(timer.state))return;timer.phase=timer.phase==='focus'?'break':'focus';timer.minutes=timer.phase==='break'?5:25;timer.state='idle';timer.elapsed=0;renderContent();},
    'timer-filter':button=>{timer.historyFilter=button.dataset.filterValue;renderContent();},
    'timer-history':()=>{document.getElementById('timer-history')?.scrollIntoView({block:'start',behavior:'smooth'});notify('历史在右侧；窄窗口显示在计时区下方');},
    'timer-task':()=>timerTaskPicker(),
    'choose-timer-task':button=>{timer.taskId=button.dataset.id;$('#info-dialog').close();renderContent();notify('当前任务已关联');},
    'timer-settings':()=>showInfo('计时说明','<p>本原型支持倒计时与正计时、专注与休息、开始、暂停、继续、提前结束、正计时完成，以及历史筛选。</p><p>倒计时到零后只记录一次历史，并等待明确确认，不自动进入下一轮。运行中不切换模式或时长。</p><p class="muted">计时仅用于浏览器界面演示。真实原生计时内核、检查点、账号、生命周期与统计合同不由此原型代替。</p>'),
    'stats-info':()=>showInfo('统计口径','<ul><li>只统计当前页面合成数据中的未归档工作事项。</li><li>项目、状态和关键词与日期筛选同时生效。</li><li>日期按到期日比较，包含起止两日；没有到期日的记录不进入日期区间。</li><li>完成率 = 已完成 ÷（总事项 − 已取消）。</li><li>完成与取消事项不计为逾期。</li></ul><p class="muted">这是设计示例，不证明正式三端统计口径已经统一。</p>'),
    'density':()=>{document.body.classList.toggle('is-compact');renderContent();notify('列表密度已调整');},
    'motion':()=>{document.body.classList.toggle('reduced-motion');renderContent();notify('动态效果设置已更新');},
    'version-copy':()=>copyText(versionText),
    'version':()=>showInfo('版本说明与来源',`<p><strong>D4-09.1 · 2026-11-28</strong></p><ul><li>统一侧栏、工作队列与详情分栏。</li><li>保留四象限、子任务、流程、计时与本地反馈的可见交互入口。</li><li>增加空态、加载、错误与保存确认的演示。</li></ul><p><strong>D4-08 参考基线</strong><br>7c217d8779ccf21e13733b28868e015e9cfd693a</p><p>正式应用版本和编译时间仍由正式构建提供。此页面没有伪造 EXE/APK 构建身份。</p>${action('version-copy','复制来源信息','','secondary-button')}`),
    'boundaries':()=>showInfo('数据与实现边界','<p>此页面只使用脚本内的合成数据。没有网络请求、产品模块导入、localStorage、IndexedDB、SQLite 或真实账号读写。</p><p>导出的演示快照只能说明界面会话，不是工作备份格式；参考附件没有真实文件，选择的反馈图片只创建浏览器临时预览。</p><p>正式 UI 集成保留既有业务、原始字段、稳定 ID、计时与保存失败处理。生产数据、同步与签名权限不会因为原型而扩大。</p>'),
    'export':()=>exportDemo(),
    'reset-demo':()=>resetDemo(),
    'feedback-new':()=>newFeedback(),
    'feedback-select':button=>{flushFeedback();feedbackSelected=button.dataset.id;renderContent();},
    'feedback-save':()=>{feedbackDirty=true;flushFeedback();notify('草稿已保存在本次页面会话');},
    'feedback-submit':()=>{feedbackDirty=true;flushFeedback();const idea=feedback.find(record=>record.id===feedbackSelected);if(!idea?.title.trim()||!idea?.body.trim()){notify('请填写标题和详细说明；草稿已保留');$('#feedback-title')?.focus();return;}idea.submitted=true;renderContent();notify('已记录到本机演示列表，没有发送到远程服务');},
    'feedback-menu':button=>openMenu(button,[{action:'feedback-delete',label:'删除当前反馈',danger:true},{action:'feedback-undo',label:'撤销最近一次删除'},{divider:true},{action:'export',label:'导出演示快照'}]),
    'feedback-delete':()=>{flushFeedback();const idea=feedback.find(record=>record.id===feedbackSelected);if(!idea){notify('没有可删除的反馈');return;}confirm('删除当前反馈？','记录和临时图片会保留在本次演示的删除批次中，可以撤销最近一次删除。',()=>{feedback=feedback.filter(record=>record.id!==idea.id);deletedFeedback.push(idea);feedbackSelected=feedback[0]?.id||'';renderContent();notify('已删除，可通过更多菜单撤销');},'删除反馈',true);},
    'feedback-undo':()=>{flushFeedback();const idea=deletedFeedback.pop();if(!idea){notify('没有可以撤销的删除');return;}feedback.unshift(idea);feedbackSelected=idea.id;demoState='populated';renderContent();notify('已恢复反馈与临时图片');},
    'feedback-add-image':()=>$('#feedback-images').click(),
    'feedback-remove-image':button=>{flushFeedback();const idea=feedback.find(record=>record.id===feedbackSelected);const index=Number(button.dataset.index);confirm('移除这张临时图片？','仅移除原型中的临时预览，不删除你选择的原文件。',()=>{const [removed]=idea.images.splice(index,1);if(removed)URL.revokeObjectURL(removed.url);renderContent();notify('已移除临时图片');},'移除图片');}
  };
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-page]');if(nav){navigate(nav.dataset.page);return;}
    const button=event.target.closest('[data-action]');
    if(button){const name=button.dataset.action;if($('#context-menu').contains(button))closeMenu(false);handlers[name]?.(button);return;}
    const row=event.target.closest('[data-row-id]');if(row){currentView().selected=row.dataset.rowId;currentView().showDetail=true;renderContent();return;}
    if(!$('#context-menu').hidden&&!$('#context-menu').contains(event.target))closeMenu(false);
  });
  document.addEventListener('dblclick',event=>{const row=event.target.closest('[data-row-id]');if(row&&!event.target.closest('button'))openEditor(byId(row.dataset.rowId));});
  document.addEventListener('input',event=>{
    const input=event.target;
    if(input.dataset.filter==='query'){currentView().query=input.value;renderContent();}
    if(input.id==='edit-color')$('#edit-color-preview').style.setProperty('--project-color',color(input.value));
    if(input.id==='edit-projectLabel'){$('#edit-projectId').value=records.find(record=>record.kind==='project'&&!record.archived&&record.name===input.value)?.id||'';}
    if(input.id==='task-picker-search')renderTaskChoices(input.value);
    if(input.id.startsWith('feedback-')&&['feedback-title','feedback-body','feedback-category','feedback-status'].includes(input.id)){feedbackDirty=true;$('#feedback-save-status').textContent='正在保存演示草稿…';clearTimeout(feedbackSaveHandle);feedbackSaveHandle=setTimeout(flushFeedback,650);}
  });
  document.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset.filter && input.dataset.filter!=='query'){currentView()[input.dataset.filter]=input.value;if(currentView().from&&currentView().to&&currentView().from>currentView().to){notify('起日不能晚于止日；请调整日期');return;}renderContent();}
    if(input.dataset.childId){const record=byId(input.dataset.parentId),child=record.children.find(child=>child.id===input.dataset.childId);child.done=input.checked;log(record,`${child.done?'完成':'恢复'}子任务：${child.name}`);renderContent();}
    if(input.id==='timer-mode'){timer.mode=input.value;timer.elapsed=0;timer.state='idle';renderContent();notify('计时模式已更新');}
    if(input.id==='timer-minutes'){const minutes=Number(input.value);if(!Number.isInteger(minutes)||minutes<1||minutes>180){input.value=timer.minutes;notify('请输入1–180之间的整数分钟');return;}timer.minutes=minutes;timer.elapsed=0;renderContent();}
    if(input.id==='feedback-category'||input.id==='feedback-status'){feedbackDirty=true;flushFeedback();}
    if(input.id==='feedback-images'){flushFeedback();const idea=feedback.find(record=>record.id===feedbackSelected);let accepted=0;for(const file of Array.from(input.files||[])){if(idea.images.length>=20||file.size>10*1024*1024||!['image/png','image/jpeg','image/gif','image/bmp','image/x-ms-bmp'].includes(file.type)){notify('部分图片未添加：仅支持PNG/JPEG/GIF/BMP，每张10MiB以内，最多20张');continue;}idea.images.push({name:file.name,size:file.size,url:URL.createObjectURL(file)});accepted++;}renderContent();if(accepted)notify(`已添加${accepted}张临时图片，未上传`);}
  });
  $('#editor-form').addEventListener('submit',event=>{event.preventDefault();saveEditor();});
  $('#editor-dialog').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
  $('#confirm-dialog').addEventListener('cancel',()=>{confirmCallback=null;});
  document.addEventListener('keydown',event=>{
    if(!$('#context-menu').hidden){const buttons=$$('button',$('#context-menu')),index=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();return;}if(event.key==='Escape'){event.preventDefault();closeMenu();return;}}
    if($('#confirm-dialog').open||$('#info-dialog').open)return;
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&$('#editor-dialog').open){event.preventDefault();saveEditor();return;}
    if($('#editor-dialog').open)return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='n'){event.preventDefault();if(pageId==='feedback')newFeedback();else beginNew(currentPage().kind||'item');return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&$('#page-search')){event.preventDefault();$('#page-search').focus();$('#page-search').select();return;}
    const row=event.target.closest('[data-row-id]');if(row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();currentView().selected=row.dataset.rowId;currentView().showDetail=true;renderContent();}
  });
  let draggedId=null;
  document.addEventListener('dragstart',event=>{const card=event.target.closest('[data-task-id]');if(!card||event.target.closest('button,input,textarea,select')){event.preventDefault();return;}draggedId=card.dataset.taskId;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',draggedId);card.classList.add('dragging');});
  document.addEventListener('dragover',event=>{const zone=event.target.closest('[data-drop-quadrant]');if(zone&&draggedId){event.preventDefault();event.dataTransfer.dropEffect='move';zone.classList.add('drag-over');}});
  document.addEventListener('dragleave',event=>{const zone=event.target.closest('[data-drop-quadrant]');if(zone&&!zone.contains(event.relatedTarget))zone.classList.remove('drag-over');});
  document.addEventListener('drop',event=>{const zone=event.target.closest('[data-drop-quadrant]');if(!zone||!draggedId)return;event.preventDefault();const record=byId(draggedId);record.quadrant=Number(zone.dataset.dropQuadrant);log(record,`拖动到${qNames[record.quadrant]}`);draggedId=null;renderContent();notify(`已移到${qNames[record.quadrant]}`);});
  document.addEventListener('dragend',()=>{draggedId=null;$$('.dragging,.drag-over').forEach(element=>element.classList.remove('dragging','drag-over'));});
  $('.brand').addEventListener('click',event=>{event.preventDefault();navigate('quadrants');});
  window.addEventListener('hashchange',()=>{const target=location.hash.slice(1);if(target!==pageId&&pages.some(page=>page.id===target))navigate(target);});
  window.addEventListener('resize',()=>{if(!$('#context-menu').hidden)closeMenu(false);});
  window.addEventListener('beforeunload',event=>{if($('#editor-dialog').open&&formSnapshot()!==editorInitial){event.preventDefault();event.returnValue='';}});
  setInterval(()=>{
    if(timer.state==='running'&&timer.mode==='countdown'&&elapsed()>=timer.minutes*60){timerRecord('completed');return;}
    if(pageId==='timer'&&$('#timer-clock')){$('#timer-clock').textContent=timerText();$('#timer-progress').style.width=`${Math.min(100,elapsed()/(timer.minutes*60)*100)}%`;}
  },250);
  const initial=location.hash.slice(1);if(pages.some(page=>page.id===initial))pageId=initial;
  renderPage();
  // Read-only readiness metadata for the cloud browser harness, not a state API.
  window.D409WindowsPrototype=Object.freeze({ready:true,kind:'design-prototype',pageCount:13,storage:'memory-only',baseline:'7c217d8779ccf21e13733b28868e015e9cfd693a'});
})();
