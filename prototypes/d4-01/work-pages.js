(function () {
  'use strict';

  // Synthetic demo pages. This module has no storage, network or native bridge access.
  var routes = ['projects', 'work-items', 'templates', 'processes', 'contacts', 'archive', 'analytics'];
  var views = {};
  var sequence = 0;
  var pendingAttachment = null;
  var labels = {
    active: '进行中', paused: '已暂停', completed: '已完成', planned: '待开始',
    doing: '进行中', waiting: '待反馈', done: '已完成', running: '运行中', pending: '待跟进'
  };
  var kinds = {
    tasks: ['任务', 'tasks'], projects: ['项目', 'projects'], workItems: ['工作事项', 'work-items'],
    templates: ['流程模板', 'templates'], processes: ['流程实例', 'processes'], contacts: ['往来', 'contacts']
  };
  var priorityLabels = {normal:'普通',high:'高',low:'低'};
  var attachmentLimit = 1024 * 1024;
  function validVersion(t) { return !!t && Number.isSafeInteger(t.version) && t.version > 0; }
  function versionLabel(t) { return validVersion(t) ? String(t.version) : '未记录'; }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function raw(values, key) { var value = values && typeof values.get === 'function' ? values.get(key) : values && values[key]; return typeof value === 'string' ? value : ''; }
  function dateValue(values, key) {
    var value = get(values, key);
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value)) throw new Error('请选择有效日期');
    return value;
  }
  function timeParts(value) {
    var empty={kind:'empty',date:'',time:'',stamp:NaN};
    if(value==null || value==='')return empty;
    if(typeof value!=='string')return {kind:'unknown',date:'',time:'',stamp:NaN};
    if(/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      var dateStamp=Date.parse(value+'T00:00:00Z');
      return value.slice(0,4)!=='0000' && Number.isFinite(dateStamp) && new Date(dateStamp).toISOString().slice(0,10)===value ? {kind:'date',date:value,time:'',stamp:NaN} : {kind:'unknown',date:'',time:'',stamp:NaN};
    }
    var helpers=window.DemoDomain && window.DemoDomain.helpers;
    if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      var minuteStamp=helpers && helpers.parseTime(value);
      return timeParts(value.slice(0,10)).kind==='date' && Number.isFinite(minuteStamp) ? {kind:'minute',date:value.slice(0,10),time:value.slice(11),stamp:minuteStamp} : {kind:'unknown',date:'',time:'',stamp:NaN};
    }
    // Existing seconds/offsets are readable evidence, never a new save format.
    var parts=value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/);
    if(!parts || !parts[4] && !parts[6] || timeParts(parts[1]).kind!=='date' || Number(parts[2])>23 || Number(parts[3])>59 || Number(parts[4] || 0)>59)return {kind:'unknown',date:'',time:'',stamp:NaN};
    if(parts[6] && parts[6]!=='Z' && (Number(parts[6].slice(1,3))>23 || Number(parts[6].slice(4,6))>59))return {kind:'unknown',date:'',time:'',stamp:NaN};
    var stamp=Date.parse(value+(parts[6] ? '' : '+08:00'));
    if(!Number.isFinite(stamp) || !helpers)return {kind:'unknown',date:'',time:'',stamp:NaN};
    var minute=helpers.formatTime(stamp);
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(minute) || timeParts(minute.slice(0,10)).kind!=='date')return {kind:'unknown',date:'',time:'',stamp:NaN};
    return {kind:'precise',date:minute.slice(0,10),time:minute.slice(11),stamp:stamp};
  }
  function timeOriginal(row,key) { return Object.prototype.hasOwnProperty.call(row || {},key) ? {present:true,value:row[key]} : {present:false}; }
  function timeRawLabel(value) { return typeof value==='string' ? value : JSON.stringify(value); }
  function timeField(ctx,label,key,row) {
    var original=timeOriginal(row,key),parts=timeParts(original.value),note='时间可留空；只填日期时不补造具体时刻。';
    if(parts.kind==='precise')note='保留原始值：'+timeRawLabel(original.value)+'。下方按北京时间显示到分钟；不修改日期/时间就保留原精度和时区。修改后按北京时间保存到分钟。';
    if(parts.kind==='unknown')note='未识别的原始值：'+timeRawLabel(original.value)+'。未修改下方日期/时间时保留原值；输入新值会明确替换。';
    return '<fieldset class="work-time-field" data-work-time="'+key+'"><legend>'+esc(ctx,label)+' · 北京时间</legend>'+hidden(ctx,key+'Original',JSON.stringify(original))+field(ctx,'日期',key,parts.date,'date')+field(ctx,'时间（可留空）',key+'Time',parts.time,'time').replace('type="time"','type="time" step="60"')+'<p class="form-help" data-time-original="'+key+'">'+esc(ctx,note)+'</p>'+(parts.kind==='unknown' ? '<label class="inline-setting"><input type="checkbox" name="'+key+'Clear">明确清除这个未识别的原始值</label>' : '')+'</fieldset>';
  }
  function timePatch(values,keys,row,isNew) {
    var patch={};
    keys.forEach(function(key){
      var original=timeOriginal(row,key),encoded=raw(values,key+'Original');
      if(encoded && encoded!==JSON.stringify(original))throw new Error('时间原值已改变，请重新打开表单后保存；当前输入仍保留');
      var parts=timeParts(original.value),date=raw(values,key),clock=raw(values,key+'Time'),clear=!!get(values,key+'Clear');
      if(clear && (date || clock))throw new Error('清除原值时请先留空日期和时间');
      if(!clear && date===parts.date && clock===parts.time) { if(isNew)patch[key]='';return; }
      if(!date && clock)throw new Error('填写时间时也需要选择日期');
      if(!date) { patch[key]='';return; }
      var validDate=dateValue({[key]:date},key);
      if(date!==validDate || timeParts(date).kind!=='date')throw new Error('请选择有效日期');
      if(clock && (!/^\d{2}:\d{2}$/.test(clock) || !window.DemoDomain || !Number.isFinite(window.DemoDomain.helpers.parseTime(date+'T'+clock))))throw new Error('时间请输入有效的小时和分钟（北京时间）');
      patch[key]=date+(clock ? 'T'+clock : '');
    });
    return patch;
  }
  function timeLabel(value) {
    var parts=timeParts(value);
    if(parts.kind==='empty')return '';
    if(parts.kind==='unknown')return '未识别，原值保留：'+timeRawLabel(value);
    if(parts.kind==='date')return parts.date+'（仅日期）';
    if(parts.kind==='minute')return value.replace('T',' ')+'（北京时间）';
    return new Date(parts.stamp+8*3600000).toISOString().slice(0,23).replace('T',' ')+'（北京时间；原值 '+value+'）';
  }
  function timeDay(value) { return timeParts(value).date; }
  function timeOverdue(value,ctx) { var parts=timeParts(value),current=Date.now();return parts.kind==='date' ? parts.date<localDay(new Date(current)) : Number.isFinite(parts.stamp) && parts.stamp<current; }
  function timeOrder(left,right) {
    var a=timeParts(left),b=timeParts(right);
    if(!a.date || !b.date)return a.date ? -1 : b.date ? 1 : 0;
    var byDay=a.date.localeCompare(b.date);if(byDay)return byDay;
    if(Number.isFinite(a.stamp) && Number.isFinite(b.stamp))return a.stamp-b.stamp;
    return a.kind==='date' ? b.kind==='date' ? 0 : -1 : b.kind==='date' ? 1 : 0;
  }
  function timeRangeReversed(start,end) {
    var a=timeParts(start),b=timeParts(end);if(!a.date || !b.date)return false;
    if(a.date!==b.date)return a.date>b.date;
    return Number.isFinite(a.stamp) && Number.isFinite(b.stamp) && a.stamp>b.stamp;
  }
  function snapshot(row) { var value = copy(row); delete value.history; if(value.attachments) value.attachments=value.attachments.map(attachmentSummary); return value; }
  function audit(row, action, before, details) {
    if (!Array.isArray(row.history)) row.history = [];
    var record = {id:uid('audit'),at:now(),action:action,details:details || ''};
    if (before) record.before = before;
    row.history.push(record); row.updatedAt = record.at;
  }
  function historyHtml(ctx, row) {
    var records = (row.history || []).slice().reverse();
    return '<details class="panel"><summary>操作历史（' + records.length + '）</summary>' + (records.length ? '<ol>' + records.map(function (r) { return '<li><strong>' + esc(ctx, r.action) + '</strong> <time datetime="' + esc(ctx,r.at) + '">' + esc(ctx,r.at) + '</time><p>' + esc(ctx,r.details || '') + '</p>' + (r.before ? '<details><summary>操作前原值</summary><pre class="work-raw-text">' + esc(ctx,JSON.stringify(r.before,null,2)) + '</pre></details>' : '') + '</li>'; }).join('') + '</ol>' : '<p>尚无本体验包记录的操作；不补造历史。</p>') + '</details>';
  }
  function attachmentSummary(a) { return {id:a.id,name:a.name,type:a.type,byteLength:a.byteLength,sha256:a.sha256,lastModified:a.lastModified}; }
  function bytesToBase64(bytes) { var text = ''; for (var i=0;i<bytes.length;i+=8192) text += String.fromCharCode.apply(null, bytes.subarray(i,i+8192)); return btoa(text); }
  function base64ToBytes(value) { return Uint8Array.from(atob(value),function(c){return c.charCodeAt(0);}); }
  async function hashBytes(bytes) { if (!window.crypto || !window.crypto.subtle) throw new Error('当前浏览器不能进行 SHA-256 校验，请使用支持本地安全上下文的浏览器'); var hash = await window.crypto.subtle.digest('SHA-256',bytes); return Array.from(new Uint8Array(hash)).map(function(n){return n.toString(16).padStart(2,'0');}).join(''); }
  async function prepareAttachments(files) {
    var attachments = [];
    if (!files.length || files.length > 3) throw new Error('每次请选择 1–3 个隔离体验附件');
    for (var file of files) {
      if (!file || typeof file.arrayBuffer !== 'function' || !file.name || file.size > attachmentLimit) throw new Error('每个附件最多 1 MiB，请只选择隔离体验文件');
      var bytes = new Uint8Array(await file.arrayBuffer());
      attachments.push({id:uid('attachment'),name:file.name,type:file.type,byteLength:bytes.byteLength,base64:bytesToBase64(bytes),sha256:await hashBytes(bytes),lastModified:file.lastModified,capturedAt:now()});
    }
    return attachments;
  }
  function attachmentHtml(ctx, w) {
    var files = w.attachments || [];
    return '<h3>事项附件（' + files.length + '）</h3>' + (files.length ? '<ul>' + files.map(function(a){var key=w.id+'|'+a.id;return '<li>' + esc(ctx,a.name) + ' · ' + a.byteLength + ' 字节 <small>SHA-256 ' + esc(ctx,a.sha256) + '</small>' + button(ctx,'校验并下载','work-download-attachment',key) + button(ctx,'移除','work-remove-attachment',key,'text danger') + '</li>';}).join('') + '</ul>' : '<p>尚无附件。</p>') + form(ctx,'work-attachment','添加隔离附件',hidden(ctx,'workItemId',w.id)+'<label class="field"><span>文件 · 仅合成体验文件</span><input type="file" name="attachments" multiple required></label><p class="form-help">保留原始字节，不压缩或转码；每个最多 1 MiB、每事项共 3 MiB。保存在独立体验工作域，下载前校验字节数与 SHA-256。</p>','保存原始附件');
  }
  function state(ctx) { return typeof ctx.getState === 'function' ? ctx.getState() : ctx.state || (ctx.repo && ctx.repo.state) || {}; }
  function items(s, key) { return Array.isArray(s[key]) ? s[key] : []; }
  function collection(s, key) { if (!Array.isArray(s[key])) s[key] = []; return s[key]; }
  function uid(prefix) { return prefix + '-' + (window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + (++sequence)); }
  function now() { return new Date().toISOString(); }
  function today(ctx) { return ctx.today || localDay(new Date()); }
  function localDay(d) { return new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d); }
  function day(value) { var text=String(value || '');if(/[zZ]$|[+-]\d{2}:\d{2}$/.test(text)){var instant=new Date(text);return !isNaN(instant.getTime()) ? localDay(instant) : '';}return text.slice(0,10); }
  function completionDay(value) { if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(String(value || '')))return day(value);var stamp = new Date(value);return value && !isNaN(stamp.getTime()) ? localDay(stamp) : ''; }
  function done(t) { return !!(t.done || t.completed || t.status === 'completed' || t.status === 'done'); }
  function due(t) { return day(t.start || t.dueDate || t.end); }
  function esc(ctx, value) { return ctx.esc ? ctx.esc(String(value == null ? '' : value)) : String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
  function flatten(tasks) {
    var all = [], seen = new Set(), direct = new Map((tasks || []).map(function (task) { return [task.id, task]; }));
    function visit(task) {
      if (!task || seen.has(task.id)) return;
      task = direct.get(task.id) || task;
      seen.add(task.id); all.push(task); (task.subtasks || []).forEach(visit);
    }
    (tasks || []).forEach(visit); return all;
  }
  function find(s, key, id) { return items(s, key).find(function (x) { return x.id === id; }); }
  function taskById(s, id) { return flatten(items(s, 'tasks')).find(function (t) { return t.id === id; }); }
  function view(route, ctx) { var saved = views[route] || (views[route] = {query: '', status: '', projectId: '', kind: ''}); return Object.assign({}, saved, {globalQuery:ctx && ctx.view && ctx.view.query || ''}); }
  function get(values, key) { return String(values && typeof values.get === 'function' ? values.get(key) || '' : values && values[key] || '').trim(); }
  function active(s, key) { return items(s, key).filter(function (x) { return !x.archived; }); }
  function projectName(s, id) { var p = find(s, 'projects', id); return p ? p.name + (p.archived ? '（已归档）' : '') : '未关联项目'; }
  function taskProject(t, p, s) { return t.projectId === p.id || (!t.projectId && t.project === p.name && items(s,'projects').filter(function(x){return x.name === p.name;}).length === 1); }
  function projectTasks(s, p) { return flatten(items(s, 'tasks')).filter(function (t) { return !t.archived && taskProject(t, p, s); }); }
  function workTasks(s, id) { return flatten(items(s, 'tasks')).filter(function (t) { return !t.archived && t.workItemId === id; }); }
  function matches(x, query) {
    if (!query) return true;
    var text = [x.title,x.name,x.description,x.notes,x.owner,x.members,x.organization,x.role,x.email,x.phone,x.project,x.start,x.end,x.plannedStart,x.dueDate,x.occurredOn,priorityLabels[x.priority],labels[x.status],(x.steps || []).map(function(step){return step.title;}),(x.followups || []).map(function(f){return [f.title,f.notes,f.occurredOn,f.dueDate];})].flat(Infinity).filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
    return query.normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean).every(function (part) { return text.includes(part); });
  }
  function filtered(s, key, route, ctx) {
    var v = view(route, ctx);
    return active(s, key).filter(function (x) { return matches(x, v.query) && matches(x, v.globalQuery) && (!v.status || x.status === v.status) && (!v.projectId || x.projectId === v.projectId); });
  }
  function button(ctx, label, action, id, extra) { return '<button type="button" class="button ' + (extra || '') + '" data-action="' + action + '" data-id="' + esc(ctx, id || '') + '"' + (extra && extra.split(' ').includes('disabled') ? ' disabled aria-disabled="true"' : '') + '>' + esc(ctx, label) + '</button>'; }
  function pill(ctx, status) { return '<span class="pill status-' + esc(ctx, status) + '">' + esc(ctx, labels[status] || status || '未设置') + '</span>'; }
  function heading(ctx, title, description, actions) { return '<header class="page-heading"><div><h1>' + title + '</h1><p>' + description + '</p></div><div class="page-actions">' + (actions || '') + '</div></header>'; }
  function empty(ctx, title, description, action, label) { return '<div class="empty-state"><h3>' + title + '</h3><p>' + description + '</p>' + (action ? button(ctx, label, action, '', 'primary') : '') + '</div>'; }
  function options(ctx, values, selected, first) {
    return (first == null ? '' : '<option value="">' + esc(ctx, first) + '</option>') + values.map(function (pair) { return '<option value="' + esc(ctx, pair[0]) + '"' + (String(pair[0]) === String(selected || '') ? ' selected' : '') + '>' + esc(ctx, pair[1]) + '</option>'; }).join('');
  }
  function field(ctx, label, name, value, type, required) { return '<label class="field"><span>' + esc(ctx, label) + '</span><input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(ctx, value || '') + '"' + (required ? ' required' : '') + (type === 'text' || !type ? ' maxlength="160"' : '') + '></label>'; }
  function textarea(ctx, label, name, value, required) { return '<label class="field"><span>' + esc(ctx, label) + '</span><textarea name="' + name + '" rows="4" maxlength="10000"' + (required ? ' required' : '') + '>' + esc(ctx, value || '') + '</textarea></label>'; }
  function select(ctx, label, name, choices, selected, first) { return '<label class="field"><span>' + esc(ctx, label) + '</span><select name="' + name + '">' + options(ctx, choices, selected, first) + '</select></label>'; }
  function projectOptions(s, includeId) { return items(s, 'projects').filter(function (p) { return !p.archived || p.id === includeId; }).map(function (p) { var ambiguous=items(s,'projects').filter(function(x){return x.name===p.name;}).length>1;return [p.id, p.name + (ambiguous ? ' · '+p.id : '') + (p.archived ? '（已归档）' : '')]; }); }
  function hidden(ctx, name, value) { return '<input type="hidden" name="' + name + '" value="' + esc(ctx, value || '') + '">'; }
  function form(ctx, name, title, body, submitLabel) { return '<h2>' + title + '</h2><form data-form="' + name + '" class="work-form">' + body + '<footer class="form-actions">' + button(ctx, '取消', 'work-close') + '<button class="button primary" type="submit">' + (submitLabel || '保存') + '</button></footer></form>'; }
  function toolbar(ctx, s, route, statuses, projectFilter, kindFilter) {
    var v = view(route, ctx);
    return '<form data-form="work-filter" class="panel work-filters">' + hidden(ctx, 'route', route) + field(ctx, '搜索', 'query', v.query, 'search') +
      (statuses ? select(ctx, '状态', 'status', statuses.map(function (x) { return [x, labels[x]]; }), v.status, '全部状态') : '') +
      (projectFilter ? select(ctx, '项目', 'projectId', projectOptions(s), v.projectId, '全部项目') : '') +
      (kindFilter ? select(ctx, '类型', 'kind', Object.keys(kinds).map(function (key) { return [key, kinds[key][0]]; }), v.kind, '全部类型') : '') +
      (route === 'analytics' || route === 'archive' ? field(ctx,'从日期','from',v.from,'date') + field(ctx,'到日期','to',v.to,'date') : '') +
      '<button class="button" type="submit">应用筛选</button>' + button(ctx, '清除', 'work-reset-filter', route) + '</form>';
  }
  function table(headers, rows) {
    // Keep one set of cells and actions for desktop tables and phone records.
    // Labels are fixed presentation text from the table definition, never data.
    var records=rows.map(function(row){var column=0;return row.replace(/<td(\s[^>]*)?>/g,function(tag,attributes){var label=String(headers[column++] || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');return '<td'+(attributes || '')+' data-label="'+label+'">';});});
    return '<div class="table-wrap work-record-wrap"><table class="data-table work-record-table"><thead><tr>' + headers.map(function (h) { return '<th scope="col">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + records.join('') + '</tbody></table></div>';
  }
  function taskRows(ctx, tasks, unlinkAction, ownerId) {
    return tasks.map(function (t) { return '<li class="linked-task">' + button(ctx, t.title, 'work-open-task', t.id, 'text') + ' ' + pill(ctx, done(t) ? 'done' : 'pending') + (unlinkAction ? ' ' + button(ctx, '移除关联', unlinkAction, ownerId + '|' + t.id, 'text') : '') + '</li>'; }).join('');
  }
  function error(ctx, message) { ctx.toast(message); return true; }
  function change(ctx, update, message, after) {
    var result;
    try { result = ctx.transaction(update); } catch (e) { return error(ctx, e.message || '保存失败，请重试'); }
    function complete() { if (ctx.closeModal) ctx.closeModal(); if (message) ctx.toast(message); if (after) after(); }
    if (result && typeof result.then === 'function') result.then(complete).catch(function (e) { ctx.toast(e.message || '保存失败，请重试'); });
    else if (result !== false) complete();
    return true;
  }
  function open(ctx, html) { ctx.modal(html); return true; }
  function close(ctx) { ctx.closeModal(); return true; }
  function unique(s, key, name, id) { return !items(s, key).some(function (x) { return x.id !== id && String(x.name || x.title).toLocaleLowerCase() === name.toLocaleLowerCase(); }); }
  function saveObject(ctx, key, id, fields, message, after) {
    return change(ctx, function (s) {
      var existing = find(s, key, id);
      if (id && !existing) throw new Error('该条目已不存在，请关闭后重试');
      if (existing) { var before=snapshot(existing);Object.assign(existing, fields);audit(existing,'编辑',before); }
      else { var row=Object.assign({id: uid(key), archived: false, createdAt: now()}, fields);audit(row,'创建');collection(s, key).push(row); }
    }, message, after);
  }
  function entityForm(ctx, type, id) {
    var s = state(ctx), key = type === 'work-item' ? 'workItems' : type === 'template' ? 'templates' : type === 'contact' ? 'contacts' : 'projects';
    var x = find(s, key, id) || {}, body = hidden(ctx, 'id', id);
    if (type === 'project') body += field(ctx, '项目名称', 'name', x.name, 'text', true).replace('maxlength="160"','maxlength="100"') + textarea(ctx, '项目描述', 'description', x.description) + field(ctx,'项目负责人','owner',x.owner) + textarea(ctx,'项目成员 · 每行一位','memberLines',(x.members || []).join('\n')) + select(ctx, '项目状态', 'status', ['active','paused','completed'].map(function (v) { return [v, labels[v]]; }), x.status || 'active') + select(ctx, '项目颜色', 'color', [['q0','红 · 重要且紧急'],['q1','橙 · 重要不紧急'],['q2','蓝 · 紧急不重要'],['q3','绿 · 不重要不紧急']], x.color || 'q1') + timeField(ctx,'截止时间','dueDate',x);
    if (type === 'work-item') body += field(ctx, '工作事项', 'title', x.title, 'text', true) + select(ctx, '所属项目', 'projectId', projectOptions(s, x.projectId), x.projectId, '未关联项目') + select(ctx, '状态', 'status', ['planned','doing','waiting','done'].map(function (v) { return [v, labels[v]]; }), x.status || 'planned') + field(ctx, '负责人', 'owner', x.owner) + timeField(ctx,'计划开始','plannedStart',x) + timeField(ctx,'截止时间','dueDate',x) + select(ctx,'优先级','priority',Object.entries(priorityLabels),x.priority || 'normal') + select(ctx,'关联流程实例','processId',items(s,'processes').filter(function(p){return !p.archived || p.id===x.processId;}).map(function(p){return [p.id,p.name];}),x.processId,'未关联流程') + textarea(ctx, '事项说明', 'description', x.description) + textarea(ctx,'事项备注','notes',x.notes);
    if (type === 'template') body += field(ctx, '模板名称', 'name', x.name, 'text', true) + textarea(ctx, '适用说明', 'description', x.description) + textarea(ctx, '流程步骤 · 每行一步，按行顺序执行', 'stepLines', (x.steps || []).map(function (step) { return step.title; }).join('\n'), true) + '<p class="form-help">当前版本 ' + versionLabel(x) + '；修改名称、说明或步骤后递增版本。最多 20 步，已创建实例的版本快照不变。</p>';
    if (type === 'contact') body += field(ctx, '联系人', 'name', x.name, 'text', true) + field(ctx, '单位 / 团队', 'organization', x.organization) + field(ctx, '角色', 'role', x.role) + field(ctx, '邮箱', 'email', x.email, 'email') + field(ctx, '电话', 'phone', x.phone, 'tel') + textarea(ctx, '往来备注', 'notes', x.notes);
    return open(ctx, form(ctx, 'work-' + type, (id ? '编辑' : '新建') + kinds[key][0], body));
  }
  function projectsPage(ctx) {
    var s = state(ctx), list = filtered(s, 'projects', 'projects', ctx);
    var cards = list.map(function (p) {
      var tasks = projectTasks(s, p), count = tasks.filter(done).length, percent = tasks.length ? Math.round(count / tasks.length * 100) : 0;
      return '<article class="panel project-card ' + (/^q[0-3]$/.test(p.color) ? p.color : 'q1') + '"><header><h2>' + button(ctx, p.name, 'work-project-detail', p.id, 'text') + '</h2>' + pill(ctx, p.status || 'active') + '</header><p>' + esc(ctx, p.description || '添加说明，记录项目的目标与范围。') + '</p><p class="muted">负责人：' + esc(ctx,p.owner || '未设置') + ' · 成员 ' + (p.members || []).length + '</p><div class="project-progress"><strong>' + count + ' / ' + tasks.length + ' 项任务完成</strong><span>' + percent + '%</span><progress max="100" value="' + percent + '" aria-label="项目任务完成率"></progress></div><p class="muted">截止：' + esc(ctx, timeLabel(p.dueDate) || '未设置') + ' · 工作事项 ' + active(s, 'workItems').filter(function (w) { return w.projectId === p.id; }).length + '</p><footer class="row-actions">' + button(ctx, '查看任务', 'work-project-detail', p.id) + button(ctx, '编辑', 'work-edit-project', p.id) + button(ctx, '归档', 'work-archive-projects', p.id, 'text') + button(ctx, '删除', 'work-delete-projects', p.id, 'text danger') + '</footer></article>';
    }).join('');
    return heading(ctx, '项目', '把任务、工作事项和流程放到同一个项目里。', button(ctx, '新建项目', 'work-new-project', '', 'primary')) + toolbar(ctx, s, 'projects', ['active','paused','completed']) + '<div class="project-grid">' + (cards || empty(ctx, '没有符合条件的项目', '调整筛选，或创建一个新项目。', 'work-new-project', '新建项目')) + '</div>';
  }
  function projectDetail(ctx, id) {
    var s = state(ctx), p = find(s, 'projects', id);
    if (!p) return error(ctx, '项目已不存在');
    var tasks = projectTasks(s, p), available = flatten(items(s, 'tasks')).filter(function (t) { return !t.archived && !taskProject(t, p, s); });
    var relatedWork=active(s,'workItems').filter(function(w){return w.projectId===id;}),relatedProcesses=active(s,'processes').filter(function(run){return run.projectId===id;});
    return open(ctx, '<h2>' + esc(ctx, p.name) + '</h2><p>' + esc(ctx, p.description || '未填写项目描述') + '</p>' + pill(ctx, p.status || 'active') + '<p>负责人：' + esc(ctx,p.owner || '未设置') + ' · 成员：' + esc(ctx,(p.members || []).join('、') || '未设置') + '</p><p>截止时间：' + esc(ctx,timeLabel(p.dueDate) || '未设置') + '</p><h3>关联任务（' + tasks.length + '）</h3>' + (tasks.length ? '<ul class="linked-tasks">' + taskRows(ctx, tasks, 'work-unlink-project-task', id) + '</ul>' : '<p class="empty-state">还没有关联任务。</p>') + (available.length ? form(ctx, 'work-link-project', '关联已有任务', hidden(ctx, 'projectId', id) + select(ctx, '任务', 'taskId', available.map(function (t) { return [t.id, t.title]; }), available[0].id), '关联任务') : '<p>所有活动任务均已关联到此项目。</p>') + '<h3>工作事项（' + relatedWork.length + '）</h3><ul>' + relatedWork.map(function(w){return '<li>' + button(ctx,w.title,'work-work-detail',w.id,'text') + pill(ctx,w.status) + '</li>';}).join('') + '</ul><h3>关联流程（' + relatedProcesses.length + '）</h3><ul>' + relatedProcesses.map(function(run){return '<li>' + esc(ctx,run.name) + ' ' + pill(ctx,run.status) + '</li>';}).join('') + '</ul>' + historyHtml(ctx,p) + '<footer class="row-actions">' + button(ctx, '编辑项目', 'work-edit-project', id) + button(ctx, '前往任务列表', 'work-go', 'tasks') + button(ctx, '关闭', 'work-close') + '</footer>');
  }
  function workItemsPage(ctx) {
    var s = state(ctx), list = filtered(s, 'workItems', 'work-items', ctx);
    var rows = list.map(function (w) { var tasks = workTasks(s, w.id); return '<tr><td>' + button(ctx, w.title, 'work-work-detail', w.id, 'text') + '<small>' + esc(ctx, w.owner || '未设置负责人') + ' · ' + esc(ctx,priorityLabels[w.priority] || '普通') + '</small></td><td>' + esc(ctx, projectName(s, w.projectId)) + '</td><td>' + pill(ctx, w.status) + '</td><td>' + esc(ctx, timeLabel(w.plannedStart) || '—') + ' → ' + esc(ctx, timeLabel(w.dueDate) || '—') + '</td><td>' + tasks.filter(done).length + ' / ' + tasks.length + '</td><td class="row-actions">' + button(ctx, '编辑', 'work-edit-work-item', w.id) + button(ctx, '归档', 'work-archive-workItems', w.id, 'text') + button(ctx, '删除', 'work-delete-workItems', w.id, 'text danger') + '</td></tr>'; });
    return heading(ctx, '工作事项', '记录需要推进的工作，关联项目与执行任务。', button(ctx, '新建工作事项', 'work-new-work-item', '', 'primary')) + toolbar(ctx, s, 'work-items', ['planned','doing','waiting','done'], true) + '<section class="panel">' + (rows.length ? table(['工作事项 / 负责人','项目','状态','计划 / 截止时间','任务完成','操作'], rows) : empty(ctx, '没有符合条件的工作事项', '调整筛选，或记录下一件需要推进的工作。', 'work-new-work-item', '新建工作事项')) + '</section>';
  }
  function workDetail(ctx, id) {
    var s = state(ctx), w = find(s, 'workItems', id);
    if (!w) return error(ctx, '工作事项已不存在');
    var tasks = workTasks(s, id), available = flatten(items(s, 'tasks')).filter(function (t) { return !t.archived && t.workItemId !== id; });
    var process=find(s,'processes',w.processId);
    return open(ctx, '<h2>' + esc(ctx, w.title) + '</h2><p>' + esc(ctx, w.description || '未填写说明') + '</p><p>' + esc(ctx, projectName(s, w.projectId)) + ' · ' + esc(ctx, w.owner || '未设置负责人') + '</p>' + pill(ctx, w.status) + '<p>计划：' + esc(ctx,timeLabel(w.plannedStart) || '未设置') + ' → ' + esc(ctx,timeLabel(w.dueDate) || '未设置') + ' · 优先级：' + esc(ctx,priorityLabels[w.priority] || '普通') + '</p><p>关联流程：' + esc(ctx,process ? process.name : w.processId ? '关联已缺失 · '+w.processId : '未关联') + '</p><h3>事项备注</h3><pre class="work-raw-text work-note-content">' + esc(ctx,w.notes || '未填写') + '</pre><h3>执行任务（' + tasks.length + '）</h3>' + (tasks.length ? '<ul class="linked-tasks">' + taskRows(ctx, tasks, 'work-unlink-work-task', id) + '</ul>' : '<p>还没有关联任务。</p>') + (available.length ? form(ctx, 'work-link-work', '关联已有任务', hidden(ctx, 'workItemId', id) + select(ctx, '任务', 'taskId', available.map(function (t) { return [t.id, t.title]; }), available[0].id), '关联任务') : '') + '<p class="form-help">关联后任务归入此事项的项目；事项状态与任务完成状态分别管理。</p>' + attachmentHtml(ctx,w) + historyHtml(ctx,w) + '<footer class="row-actions">' + button(ctx, '编辑事项', 'work-edit-work-item', id) + button(ctx, '前往任务列表', 'work-go', 'tasks') + button(ctx, '关闭', 'work-close') + '</footer>');
  }
  function templatesPage(ctx) {
    var s = state(ctx), list = filtered(s, 'templates', 'templates', ctx);
    return heading(ctx, '流程模板', '把重复开展的工作整理成可调整的步骤。', button(ctx, '新建模板', 'work-new-template', '', 'primary')) + toolbar(ctx, s, 'templates') + '<div class="project-grid">' + (list.map(function (t) { return '<article class="panel"><header><h2>' + esc(ctx, t.name) + '</h2><span class="pill">v' + versionLabel(t) + ' · ' + (t.steps || []).length + ' 步 · ' + (t.enabled === false ? '已停用' : '启用') + '</span></header><p>' + esc(ctx, t.description || '未填写适用说明') + '</p><ol class="process-steps">' + (t.steps || []).map(function (step) { return '<li>' + esc(ctx, step.title) + '</li>'; }).join('') + '</ol>' + historyHtml(ctx,t) + '<footer class="row-actions">' + button(ctx, '创建流程', 'work-process-from-template', t.id, 'primary' + (t.enabled === false ? ' disabled' : '')) + button(ctx, '编辑步骤', 'work-edit-template', t.id) + button(ctx,'复制','work-copy-template',t.id) + button(ctx,t.enabled === false ? '启用' : '停用','work-template-toggle',t.id) + button(ctx, '归档', 'work-archive-templates', t.id, 'text') + button(ctx, '删除', 'work-delete-templates', t.id, 'text danger') + '</footer></article>'; }).join('') || empty(ctx, '还没有流程模板', '例如将“资料准备、审核、执行、复盘”保存为一个模板。', 'work-new-template', '新建模板')) + '</div>';
  }
  function processForm(ctx, templateId, id) {
    var s = state(ctx), p = find(s, 'processes', id) || {}, template = find(s, 'templates', templateId || p.templateId);
    if (!id && (!template || template.archived || template.enabled === false || !(template.steps || []).length)) return error(ctx, '请选择包含步骤的启用模板');
    if (!id && !validVersion(template)) return error(ctx,'BLOCKER：历史体验模板未记录版本；先保存为当前候选 v1，不反推历史版本');
    var body = hidden(ctx, 'id', id) + hidden(ctx, 'templateId', templateId || p.templateId) + field(ctx, '流程名称', 'name', p.name || (template ? template.name : ''), 'text', true) + select(ctx, '关联项目', 'projectId', projectOptions(s, p.projectId), p.projectId, '未关联项目');
    if (!id) body += '<p class="form-help">从“' + esc(ctx, template.name) + '”v' + versionLabel(template) + ' 复制 ' + template.steps.length + ' 个步骤；后续模板修改、停用或删除不会改变该实例。</p>';
    return open(ctx, form(ctx, 'work-process', id ? '编辑流程' : '从模板创建流程', body, id ? '保存' : '创建并开始'));
  }
  function stepList(ctx, p) { return '<ol class="process-steps">' + (p.steps || []).map(function (step, i) { return '<li class="' + (step.completed ? 'done' : i === p.currentStep ? 'current' : '') + '"><span>' + esc(ctx, step.title) + '</span><small>' + (step.completed ? '已完成' : i === p.currentStep ? (p.status === 'paused' ? '当前 · 已暂停' : '当前步骤') : '待执行') + '</small></li>'; }).join('') + '</ol>'; }
  function processControls(ctx, p) { return (p.status !== 'completed' ? button(ctx, p.currentStep === p.steps.length - 1 ? '完成最后一步' : '完成当前步', 'work-process-advance', p.id, 'primary' + (p.status === 'paused' ? ' disabled' : '')) + button(ctx, p.status === 'paused' ? '继续流程' : '暂停流程', 'work-process-toggle', p.id) : '<span class="pill status-completed">全部步骤已完成</span>') + button(ctx, '编辑', 'work-edit-process', p.id) + button(ctx, '归档', 'work-archive-processes', p.id, 'text') + button(ctx, '删除', 'work-delete-processes', p.id, 'text danger'); }
  function processesPage(ctx) {
    var s = state(ctx), list = filtered(s, 'processes', 'processes', ctx);
    return heading(ctx, '流程实例', '按当前步骤推进工作，随时暂停与继续。', button(ctx, '选择模板创建', 'work-go', 'templates', 'primary')) + toolbar(ctx, s, 'processes', ['running','paused','completed'], true) + '<div class="project-grid">' + (list.map(function (p) { var steps = p.steps || [], count = steps.filter(function (x) { return x.completed; }).length; return '<article class="panel process-card"><header><h2>' + esc(ctx, p.name) + '</h2>' + pill(ctx, p.status) + '</header><p class="muted">' + esc(ctx, projectName(s, p.projectId)) + ' · 已完成 ' + count + ' / ' + steps.length + ' 步 · 模板版本 ' + (p.templateVersion || '未记录') + '</p>' + (p.templateSnapshot ? '<details><summary>创建时模板快照</summary><pre>' + esc(ctx,JSON.stringify(p.templateSnapshot,null,2)) + '</pre></details>' : '<p class="form-help">旧体验数据没有显式版本证据；现有步骤仍保留，不反推历史模板版本。</p>') + '<progress max="' + (steps.length || 1) + '" value="' + count + '" aria-label="流程步骤进度"></progress>' + stepList(ctx, p) + historyHtml(ctx,p) + '<footer class="row-actions">' + processControls(ctx, p) + '</footer></article>'; }).join('') || empty(ctx, '没有符合条件的流程实例', '先选择一个模板，再开始执行它。', 'work-go', '打开流程模板')) + '</div>';
  }
  function followupSummary(ctx, contact) {
    var pending = (contact.followups || []).filter(function (f) { return f.status !== 'done'; }).sort(function (a, b) { return timeOrder(a.dueDate,b.dueDate); });
    if (!pending.length) return '<span class="muted">暂无待跟进</span>';
    return '<span class="' + (timeOverdue(pending[0].dueDate,ctx) ? 'overdue' : '') + '">' + esc(ctx, pending[0].title) + '</span><small>' + esc(ctx, timeLabel(pending[0].dueDate) || '未设置时间') + ' · 共 ' + pending.length + ' 项</small>';
  }
  function contactsPage(ctx) {
    var s = state(ctx), list = filtered(s, 'contacts', 'contacts', ctx);
    var rows = list.map(function (c) { return '<tr><td>' + button(ctx, c.name, 'work-contact-detail', c.id, 'text') + '<small>' + esc(ctx, c.role || '') + '</small></td><td>' + esc(ctx, c.organization || '—') + '</td><td>' + esc(ctx, c.phone || c.email || '未填写') + '</td><td>' + followupSummary(ctx, c) + '</td><td class="row-actions">' + button(ctx, '记录跟进', 'work-new-followup', c.id) + button(ctx, '编辑', 'work-edit-contact', c.id) + button(ctx, '归档', 'work-archive-contacts', c.id, 'text') + button(ctx, '删除', 'work-delete-contacts', c.id, 'text danger') + '</td></tr>'; });
    return heading(ctx, '往来', '记录联系人与待跟进事项。', button(ctx, '新建联系人', 'work-new-contact', '', 'primary')) + toolbar(ctx, s, 'contacts') + '<section class="panel">' + (rows.length ? table(['联系人','单位 / 团队','联系方式','下一次跟进','操作'], rows) : empty(ctx, '没有符合条件的联系人', '记录一位联系人，再添加需要跟进的事项。', 'work-new-contact', '新建联系人')) + '</section>';
  }
  function contactDetail(ctx, id) {
    var s=state(ctx), c = find(s, 'contacts', id); if (!c) return error(ctx, '联系人已不存在');
    var rows = (c.followups || []).map(function (f) { var key = id + '|' + f.id,work=find(s,'workItems',f.workItemId); return '<tr><td>' + esc(ctx, f.title) + '<small>' + esc(ctx, f.notes || '') + '</small><small>' + esc(ctx,projectName(s,f.projectId)) + ' · ' + esc(ctx,work ? work.title : f.workItemId ? '缺失事项 · '+f.workItemId : '未关联事项') + '</small>' + historyHtml(ctx,f) + '</td><td>' + esc(ctx,timeLabel(f.occurredOn) || '未记录沟通时间') + ' → ' + esc(ctx, timeLabel(f.dueDate) || '—') + '</td><td>' + pill(ctx, f.status || 'pending') + '</td><td class="row-actions">' + button(ctx, f.status === 'done' ? '重新跟进' : '标记完成', 'work-followup-toggle', key) + button(ctx, '编辑', 'work-edit-followup', key) + button(ctx, '删除', 'work-delete-followup', key, 'text danger') + '</td></tr>'; });
    return open(ctx, '<h2>' + esc(ctx, c.name) + '</h2><p>' + esc(ctx, [c.organization, c.role, c.phone, c.email].filter(Boolean).join(' · ')) + '</p><p>' + esc(ctx, c.notes || '未填写往来备注') + '</p><h3>跟进事项</h3>' + (rows.length ? table(['事项 / 关联','沟通 / 下次跟进时间','状态','操作'], rows) : '<p class="empty-state">暂无跟进事项。</p>') + historyHtml(ctx,c) + '<footer class="row-actions">' + button(ctx, '添加跟进', 'work-new-followup', id, 'primary') + button(ctx, '编辑联系人', 'work-edit-contact', id) + button(ctx, '关闭', 'work-close') + '</footer>');
  }
  function followupForm(ctx, contactId, id) {
    var s=state(ctx), c = find(s, 'contacts', contactId); if (!c) return error(ctx, '联系人已不存在');
    var f = (c.followups || []).find(function (x) { return x.id === id; }) || {};
    return open(ctx, form(ctx, 'work-followup', (id ? '编辑跟进 · ' : '添加跟进 · ') + esc(ctx, c.name), hidden(ctx, 'contactId', contactId) + hidden(ctx, 'id', id) + field(ctx, '跟进事项', 'title', f.title, 'text', true) + timeField(ctx,'沟通时间','occurredOn',f) + timeField(ctx,'下次跟进','dueDate',f) + select(ctx,'关联项目','projectId',projectOptions(s,f.projectId),f.projectId,'未关联项目') + select(ctx,'关联工作事项','workItemId',items(s,'workItems').filter(function(w){return !w.archived || w.id===f.workItemId;}).map(function(w){return [w.id,w.title];}),f.workItemId,'未关联事项') + select(ctx, '状态', 'status', [['pending','待跟进'],['done','已完成']], f.status || 'pending') + textarea(ctx, '沟通内容与跟进记录', 'notes', f.notes)));
  }
  function archived(s) {
    var all = [];
    Object.keys(kinds).forEach(function (key) { (key === 'tasks' ? flatten(items(s, key)) : items(s, key)).filter(function (x) { return x.archived; }).forEach(function (x) { all.push({kind: key, value: x}); }); });
    return all;
  }
  function archivePage(ctx) {
    var s = state(ctx), v = view('archive', ctx), all = archived(s), list = all.filter(function (r) { var date=day(r.value.archivedAt);return (!v.kind || r.kind === v.kind) && matches(r.value, v.query) && matches(r.value, v.globalQuery) && dateMatches(date,v); });
    var rows = list.map(function (r) { var x = r.value; return '<tr><td>' + esc(ctx, kinds[r.kind][0]) + '</td><td>' + esc(ctx, x.title || x.name) + '<small>' + esc(ctx, x.description || x.notes || '') + '</small></td><td>' + esc(ctx, day(x.archivedAt) || '未记录') + '</td><td>' + button(ctx, '恢复', 'work-restore-' + r.kind, x.id) + '</td></tr>'; });
    var finished=[];['tasks','workItems','projects','processes'].forEach(function(key){(key==='tasks' ? flatten(items(s,key)) : active(s,key)).filter(function(x){return !x.archived && done(x);}).forEach(function(x){finished.push([key+'|'+x.id,kinds[key][0]+' · '+(x.title || x.name)]);});});
    return heading(ctx, '归档', '检索已归档内容，恢复后会回到对应页面。共 ' + all.length + ' 项。') + toolbar(ctx, s, 'archive', null, false, true) + (finished.length ? '<section class="panel">' + form(ctx,'work-archive-finished','归档已完成内容',select(ctx,'已完成任务 / 项目 / 事项 / 流程','target',finished,finished[0][0]),'归档所选内容') + '</section>' : '') + '<p class="form-help">日期筛选按归档日期；缺少归档日期的历史条目在日期筛选时排除，不补造日期。</p><section class="panel">' + (rows.length ? table(['类型','内容','归档日期','操作'], rows) : empty(ctx, '没有符合条件的归档内容', '调整筛选；项目、事项、模板、流程和联系人均可归档后恢复。')) + '</section>';
  }
  function dateMatches(value,v) { return (!v.from && !v.to) || !!value && (!v.from || value >= v.from) && (!v.to || value <= v.to); }
  function metric(ctx, title, number, note) { return '<article class="panel metric-card"><span>' + title + '</span><strong>' + esc(ctx, number) + '</strong><small>' + (note || '') + '</small></article>'; }
  function analyticsPage(ctx) {
    var s = state(ctx), v = view('analytics', ctx), project=find(s,'projects',v.projectId), tasks = flatten(items(s, 'tasks')).filter(function (t) { return !t.archived && matches(t, v.query) && matches(t, v.globalQuery) && (!v.projectId || project && taskProject(t,project,s)) && dateMatches(day(t.start),v); });
    var completed = tasks.filter(done), matureStats=window.DemoDomain && window.DemoDomain.helpers.taskStats(tasks), overdue={length:matureStats ? matureStats.overdue : 0};
    var percent = tasks.length ? Math.round(completed.length / tasks.length * 100) : 0, qlabels = ['重要且紧急','重要不紧急','紧急不重要','不重要不紧急'];
    var days = [], end = new Date(today(ctx) + 'T04:00:00Z');
    for (var i = 6; i >= 0; i--) { var d = new Date(end); d.setUTCDate(d.getUTCDate() - i); var key = localDay(d); days.push({day: key, count: completed.filter(function (t) { return completionDay(t.completedAt) === key; }).length}); }
    var max = Math.max.apply(null, [1].concat(days.map(function (d) { return d.count; })));
    var projects = active(s, 'projects').filter(function (p) { return (!v.projectId || p.id === v.projectId) && matches(p,v.query) && matches(p,v.globalQuery) && dateMatches(timeDay(p.dueDate || p.createdAt),v); });
    var projectRows = projects.map(function (p) { var group = tasks.filter(function (t) { return taskProject(t, p, s); }), count = group.filter(done).length; return '<tr><td>' + button(ctx, p.name, 'work-project-detail', p.id, 'text') + '</td><td>' + group.length + '</td><td>' + count + '</td><td>' + (group.length ? Math.round(count / group.length * 100) : 0) + '%</td></tr>'; });
    var followups = active(s, 'contacts').reduce(function (list, c) { return list.concat((c.followups || []).filter(function(f){return (!v.projectId || f.projectId===v.projectId) && (matches(f,v.query) || matches(c,v.query)) && (matches(f,v.globalQuery) || matches(c,v.globalQuery)) && dateMatches(timeDay(f.occurredOn || f.createdAt),v);}).map(function (f) { return {contact: c, followup: f}; })); }, []), late = followups.filter(function (r) { return r.followup.status !== 'done' && timeOverdue(r.followup.dueDate,ctx); });
    var processes = active(s, 'processes').filter(function (p) { return (!v.projectId || p.projectId === v.projectId) && matches(p,v.query) && matches(p,v.globalQuery) && dateMatches(day(p.createdAt),v); });
    var works=active(s,'workItems').filter(function(w){return (!v.projectId || w.projectId===v.projectId) && matches(w,v.query) && matches(w,v.globalQuery) && dateMatches(timeDay(w.plannedStart || w.dueDate || w.createdAt),v);}),workDone=works.filter(done),workLate=works.filter(function(w){return !done(w) && timeOverdue(w.dueDate,ctx);});
    var workRows=works.map(function(w){return '<tr><td>' + button(ctx,w.title,'work-work-detail',w.id,'text') + '</td><td>' + esc(ctx,w.owner || '未设置') + '</td><td>' + pill(ctx,w.status) + '</td><td>' + esc(ctx,timeLabel(w.dueDate) || '未设置') + '</td></tr>';});
    var scoped = v.projectId ? '所选项目的活动任务，含子任务' : '全部活动任务，含子任务';
    return heading(ctx, '统计', '根据当前隔离体验内容计算；个人任务与工作管理分别计数。') + toolbar(ctx, s, 'analytics', null, true) + '<p class="form-help">日期口径：任务按开始日期，事项按计划开始（缺失时截止 / 创建日期），项目按截止（缺失时创建日期），实例按创建日期，往来按沟通（缺失时创建日期）。日期缺失时不补造历史。</p><h2>个人任务统计</h2><div class="metric-grid" data-stat-group="personal">' + metric(ctx, '任务总数', tasks.length, scoped) + metric(ctx, '已完成', completed.length, '完成率 ' + percent + '%') + metric(ctx, '待完成', tasks.length - completed.length, '当前尚未完成的任务') + metric(ctx, '已逾期', overdue.length, '复用原任务统计：结束 / 开始时刻已过') + '</div><h2>工作管理统计</h2><div class="metric-grid" data-stat-group="work">' + metric(ctx,'工作事项',works.length,'已完成 ' + workDone.length + ' · 完成率 ' + (works.length ? Math.round(workDone.length/works.length*100) : 0) + '%') + metric(ctx,'事项逾期',workLate.length,'有时分按北京时间；仅日期按整日') + metric(ctx,'项目',projects.length,'项目与任务分别计数') + metric(ctx,'流程实例',processes.length,'已完成 ' + processes.filter(done).length) + '</div><div class="analytics-grid"><section class="panel"><h2>四象限完成情况</h2>' + qlabels.map(function (label, q) { var list = tasks.filter(function (t) { return Number(t.quadrant) === q; }), count = list.filter(done).length; return '<div class="quadrant-stat q' + q + '"><span>' + label + '</span><progress value="' + count + '" max="' + (list.length || 1) + '" aria-label="' + label + '完成情况"></progress><strong>' + count + ' / ' + list.length + '</strong></div>'; }).join('') + '</section><section class="panel"><h2>最近 7 天任务完成记录</h2><div class="week-chart">' + days.map(function (d) { return '<div><strong>' + d.count + '</strong><meter min="0" max="' + max + '" value="' + d.count + '" aria-label="' + d.day + '完成' + d.count + '项"></meter><time datetime="' + d.day + '">' + d.day.slice(5) + '</time></div>'; }).join('') + '</div><p class="form-help">只按已记录的完成日期计数；未记录日期的完成任务不补造历史。</p></section><section class="panel"><h2>项目任务进度</h2>' + (projectRows.length ? table(['项目','任务','完成','完成率'], projectRows) : '<p class="empty-state">尚无项目数据。</p>') + '</section><section class="panel"><h2>工作事项明细</h2>' + (workRows.length ? table(['事项','负责人','状态','截止'],workRows) : '<p>没有符合筛选的事项。</p>') + '</section><section class="panel"><h2>流程与往来</h2><dl class="summary-list"><div><dt>运行中的流程</dt><dd>' + processes.filter(function (p) { return p.status === 'running'; }).length + '</dd></div><div><dt>已暂停的流程</dt><dd>' + processes.filter(function (p) { return p.status === 'paused'; }).length + '</dd></div><div><dt>已完成的流程</dt><dd>' + processes.filter(function (p) { return p.status === 'completed'; }).length + '</dd></div><div><dt>待跟进事项</dt><dd>' + followups.filter(function (r) { return r.followup.status !== 'done'; }).length + '</dd></div><div><dt>逾期跟进</dt><dd>' + late.length + '</dd></div></dl>' + (late.length ? '<ul class="linked-tasks">' + late.slice(0, 5).map(function (r) { return '<li>' + button(ctx, r.contact.name + ' · ' + r.followup.title, 'work-contact-detail', r.contact.id, 'text') + '</li>'; }).join('') + '</ul>' : '<p class="muted">没有逾期跟进事项。</p>') + '</section></div>';
  }
  function deletion(ctx, key, id) {
    var x = find(state(ctx), key, id); if (!x) return error(ctx, '该条目已不存在');
    if(key === 'templates' && items(state(ctx),'processes').some(function(p){return p.templateId===id && !p.templateSnapshot;})) return error(ctx,'BLOCKER：历史实例缺少模板快照，先保留模板；可停用以禁止新建');
    var note = key === 'projects' ? '项目会删除；任务、工作事项、往来和流程保留，解除项目关联。' : key === 'workItems' ? '事项及其独立附件会删除；执行任务和往来保留，解除事项关联。' : key === 'templates' ? '模板会删除；已有实例的版本快照、步骤和历史全部保留。' : key === 'contacts' ? '联系人和其中的跟进记录会一同删除。' : '此流程实例会删除；模板、关联项目和工作事项保留，解除实例关联。';
    return open(ctx, '<h2>删除' + kinds[key][0] + '？</h2><p>' + esc(ctx, x.title || x.name) + '</p><p>' + note + '</p><footer class="form-actions">' + button(ctx, '取消', 'work-close') + button(ctx, '确认删除', 'work-delete-confirm-' + key, id, 'danger') + '</footer>');
  }
  function erase(ctx, key, id) {
    return change(ctx, function (s) {
      var x = find(s, key, id); if (!x) throw new Error('该条目已不存在');
      if (key === 'projects') {
        flatten(items(s, 'tasks')).forEach(function (t) { if (taskProject(t, x, s)) { t.projectId = ''; t.project = ''; } });
        ['workItems','processes'].forEach(function (type) { items(s, type).forEach(function (row) { if (row.projectId === id) { var before=snapshot(row);row.projectId = '';audit(row,'项目删除后解除关联',before,x.name); } }); });
        items(s,'contacts').forEach(function(c){(c.followups || []).forEach(function(f){if(f.projectId===id){var before=snapshot(f);f.projectId='';audit(f,'项目删除后解除关联',before,x.name);}});});
      }
      if (key === 'workItems') flatten(items(s, 'tasks')).forEach(function (t) { if (t.workItemId === id) t.workItemId = ''; });
      if (key === 'workItems') items(s,'contacts').forEach(function(c){(c.followups || []).forEach(function(f){if(f.workItemId===id){var before=snapshot(f);f.workItemId='';audit(f,'事项删除后解除关联',before,x.title);}});});
      if (key === 'processes') items(s,'workItems').forEach(function(w){if(w.processId===id){var before=snapshot(w);w.processId='';audit(w,'实例删除后解除关联',before,x.name);}});
      if (key === 'templates' && items(s,'processes').some(function(p){return p.templateId===id && !p.templateSnapshot;})) throw new Error('BLOCKER：关联实例缺少模板快照，禁止删除');
      s[key] = items(s, key).filter(function (row) { return row.id !== id; });
    }, '已删除' + kinds[key][0]);
  }
  function act(action, id, ctx) {
    if (!action.startsWith('work-')) return false;
    if (pendingAttachment) throw new Error('正在校验并保存附件，请等待完成');
    var s = state(ctx), key, x, pair;
    if (action === 'work-close') return close(ctx);
    if (action === 'work-go') { close(ctx); ctx.navigate(id || 'templates'); return true; }
    if (action === 'work-open-task') { close(ctx); ctx.openTask(id); return true; }
    if (action === 'work-reset-filter') {
      if (!routes.includes(id)) throw new Error('筛选页面无效');
      var filterForm = document.querySelector('[data-form="work-filter"]');
      if (filterForm && filterForm.querySelector('[name="route"]')?.value === id) filterForm.dataset.dirty = '';
      views[id] = {query:'',status:'',projectId:'',kind:'',from:'',to:''};
      return change(ctx, function () {}, '已清除筛选');
    }
    var entities = ['project','work-item','template','contact'];
    for (var i = 0; i < entities.length; i++) {
      if (action === 'work-new-' + entities[i]) return entityForm(ctx, entities[i], '');
      if (action === 'work-edit-' + entities[i]) return entityForm(ctx, entities[i], id);
    }
    if (action === 'work-project-detail') return projectDetail(ctx, id);
    if (action === 'work-work-detail') return workDetail(ctx, id);
    if (action === 'work-contact-detail') return contactDetail(ctx, id);
    if (action === 'work-process-from-template') return processForm(ctx, id, '');
    if (action === 'work-edit-process') return processForm(ctx, '', id);
    if (action === 'work-copy-template') return change(ctx,function(next){var source=find(next,'templates',id);if(!source)throw new Error('模板已不存在');var title=source.name+' 副本',index=2;while(!unique(next,'templates',title,''))title=source.name+' 副本 '+index++;var row={id:uid('template'),name:title,description:source.description,version:1,enabled:true,archived:false,createdAt:now(),copiedFrom:{id:source.id,version:validVersion(source) ? source.version : null},steps:(source.steps || []).map(function(step){return {id:uid('step'),title:step.title,description:step.description || ''};})};audit(row,'复制模板',null,'来源 '+source.id+' v'+versionLabel(source));collection(next,'templates').push(row);},'已复制模板');
    if (action === 'work-template-toggle') return change(ctx,function(next){var t=find(next,'templates',id);if(!t)throw new Error('模板已不存在');var before=snapshot(t);t.enabled=t.enabled===false;audit(t,t.enabled ? '启用模板' : '停用模板',before);},'已更新模板状态');
    if (action === 'work-download-attachment') {
      pair=id.split('|');var work=find(s,'workItems',pair[0]),attachment=work && (work.attachments || []).find(function(a){return a.id===pair[1];});if(!attachment)return error(ctx,'附件已不存在');
      (async function(){var bytes=base64ToBytes(attachment.base64);if(bytes.length!==attachment.byteLength || await hashBytes(bytes)!==attachment.sha256)throw new Error('附件完整性校验失败，禁止下载');var url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),link=document.createElement('a');link.href=url;link.download=attachment.name;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);ctx.toast('附件原始字节校验通过，已开始下载');}()).catch(function(e){ctx.toast(e.message || '附件校验失败');});return true;
    }
    if (action === 'work-remove-attachment') { pair=id.split('|');return open(ctx,'<h2>移除这个事项附件？</h2><p>只影响独立体验工作域；其他附件和任务保留。</p><footer class="form-actions">'+button(ctx,'取消','work-work-detail',pair[0])+button(ctx,'确认移除','work-remove-attachment-confirm',id,'danger')+'</footer>'); }
    if (action === 'work-remove-attachment-confirm') { pair=id.split('|');return change(ctx,function(next){var w=find(next,'workItems',pair[0]),a=w && (w.attachments || []).find(function(file){return file.id===pair[1];});if(!a)throw new Error('附件已不存在');audit(w,'移除附件',null,JSON.stringify(attachmentSummary(a)));w.attachments=w.attachments.filter(function(file){return file.id!==pair[1];});},'已移除附件',function(){workDetail(ctx,pair[0]);}); }
    if (action === 'work-new-followup') return followupForm(ctx, id, '');
    if (action === 'work-edit-followup') { pair = id.split('|'); return followupForm(ctx, pair[0], pair[1]); }
    if (action === 'work-followup-toggle') {
      pair = id.split('|');
      return change(ctx, function (next) { var c = find(next, 'contacts', pair[0]), f = c && (c.followups || []).find(function (row) { return row.id === pair[1]; }); if (!f) throw new Error('跟进记录已不存在'); var before=snapshot(f);f.status = f.status === 'done' ? 'pending' : 'done'; f.completedAt = f.status === 'done' ? now() : '';audit(f,'更新跟进状态',before); }, '已更新跟进状态', function () { contactDetail(ctx, pair[0]); });
    }
    if (action === 'work-delete-followup') { pair = id.split('|'); return open(ctx, '<h2>删除这条跟进记录？</h2><p>联系人与其他跟进记录保留。</p><footer class="form-actions">' + button(ctx, '取消', 'work-close') + button(ctx, '确认删除', 'work-delete-followup-confirm', id, 'danger') + '</footer>'); }
    if (action === 'work-delete-followup-confirm') { pair = id.split('|'); return change(ctx, function (next) { var c = find(next, 'contacts', pair[0]); if (!c) throw new Error('联系人已不存在');var f=(c.followups || []).find(function(row){return row.id===pair[1];});if(!f)throw new Error('跟进记录已不存在');audit(c,'删除跟进记录',snapshot(f),f.title);c.followups = (c.followups || []).filter(function (row) { return row.id !== pair[1]; }); }, '已删除跟进记录', function () { contactDetail(ctx, pair[0]); }); }
    if (action === 'work-process-toggle' || action === 'work-process-advance') {
      x = find(s, 'processes', id); if (!x || x.archived) return error(ctx, '该流程已不存在或已归档');
      if (x.status === 'completed') return error(ctx, '流程已完成');
      if (action === 'work-process-advance' && x.status === 'paused') return error(ctx, '先继续流程，再完成当前步骤');
      return change(ctx, function (next) {
        var p = find(next, 'processes', id); if (!p || p.archived || p.status === 'completed') throw new Error('流程状态已改变，请重试');
        var before=snapshot(p);
        if (action === 'work-process-toggle') p.status = p.status === 'paused' ? 'running' : 'paused';
        else {
          if (p.status !== 'running' || !p.steps[p.currentStep]) throw new Error('没有可推进的当前步骤');
          p.steps[p.currentStep].completed = true; p.steps[p.currentStep].completedAt = now(); p.currentStep++;
          if (p.currentStep >= p.steps.length) { p.status = 'completed'; p.completedAt = now(); }
        }
        audit(p,action === 'work-process-toggle' ? (p.status === 'paused' ? '暂停流程' : '继续流程') : '完成流程步骤',before);
      }, action === 'work-process-toggle' ? (x.status === 'paused' ? '已继续流程' : '已暂停流程') : (x.currentStep === x.steps.length - 1 ? '流程已完成' : '已完成当前步骤'));
    }
    if (action === 'work-unlink-project-task' || action === 'work-unlink-work-task') {
      pair = id.split('|');
      return change(ctx, function (next) { var t = taskById(next, pair[1]); if (!t) throw new Error('任务已不存在'); if (action === 'work-unlink-project-task') { t.projectId = ''; t.project = ''; t.workItemId=''; } else t.workItemId = '';var owner=find(next,action==='work-unlink-project-task' ? 'projects' : 'workItems',pair[0]);if(owner)audit(owner,'移除任务关联',null,t.id+' · '+t.title); }, '已移除任务关联', function () { if (action === 'work-unlink-project-task') projectDetail(ctx, pair[0]); else workDetail(ctx, pair[0]); });
    }
    if (action.startsWith('work-delete-confirm-')) { key = action.slice('work-delete-confirm-'.length); return kinds[key] && key !== 'tasks' ? erase(ctx, key, id) : false; }
    if (action.startsWith('work-delete-')) { key = action.slice('work-delete-'.length); return kinds[key] && key !== 'tasks' ? deletion(ctx, key, id) : false; }
    if (action.startsWith('work-archive-') || action.startsWith('work-restore-')) {
      var restore = action.startsWith('work-restore-'); key = action.slice(restore ? 'work-restore-'.length : 'work-archive-'.length);
      if (!kinds[key]) return false;
      return change(ctx, function (next) { var row = key === 'tasks' ? taskById(next, id) : find(next, key, id); if (!row) throw new Error('该条目已不存在');var before=key==='tasks' ? null : snapshot(row);row.archived = !restore; row.archivedAt = restore ? '' : now();if(key!=='tasks')audit(row,restore ? '恢复归档' : '归档',before); }, restore ? '已恢复到' + kinds[key][0] + '页面' : '已归档' + kinds[key][0]);
    }
    return false;
  }
  function submit(name, values, ctx) {
    name = ({project:'work-project',workitem:'work-work-item',template:'work-template',process:'work-process',contact:'work-contact',followup:'work-followup'})[name] || name;
    if (!name.startsWith('work-')) return false;
    if (pendingAttachment) throw new Error('正在校验并保存附件，请等待完成');
    var s = state(ctx), id = get(values, 'id'), title, fields, key;
    if (name === 'work-filter') { var route = get(values, 'route'); if (!routes.includes(route)) return false;var from=dateValue(values,'from'),to=dateValue(values,'to');if(from && to && from>to)return error(ctx,'起始日期不能晚于结束日期');views[route] = {query:get(values,'query'),status:get(values,'status'),projectId:get(values,'projectId'),kind:get(values,'kind'),from:from,to:to}; return change(ctx, function () {}); }
    if (name === 'work-archive-finished') { var target=get(values,'target').split('|');var row=target[0]==='tasks' ? taskById(s,target[1]) : find(s,target[0],target[1]);if(!['tasks','workItems','projects','processes'].includes(target[0]) || !row || !done(row) || row.archived)return error(ctx,'请选择尚未归档的已完成内容');return act('work-archive-'+target[0],target[1],ctx); }
    if (name === 'work-attachment') {
      var attachmentWorkId=get(values,'workItemId'),files=typeof values.getAll==='function' ? values.getAll('attachments') : [];
      if(!find(s,'workItems',attachmentWorkId))return error(ctx,'工作事项已不存在');
      var submittedForm=document.querySelector('[data-form="work-attachment"]'),submittedModal=submittedForm?.closest('.modal');
      var controls=submittedForm ? Array.from(submittedForm.querySelectorAll('input,textarea,select,button')).map(function(control){return {element:control,disabled:control.disabled};}) : [];
      var submission={form:submittedForm,workItemId:attachmentWorkId};
      function releaseSubmission(){if(pendingAttachment===submission)pendingAttachment=null;controls.forEach(function(saved){if(saved.element.isConnected)saved.element.disabled=saved.disabled;});}
      pendingAttachment=submission;controls.forEach(function(saved){saved.element.disabled=true;});
      return prepareAttachments(files).then(async function(prepared){
        var accepted=await ctx.transaction(function(next){var w=find(next,'workItems',attachmentWorkId);if(!w || w.archived)throw new Error('事项已不存在或已归档');var current=w.attachments || [];if(current.reduce(function(total,a){return total+a.byteLength;},0)+prepared.reduce(function(total,a){return total+a.byteLength;},0)>3*attachmentLimit)throw new Error('每事项附件总量最多 3 MiB');w.attachments=current.concat(prepared);audit(w,'添加原始附件',null,prepared.map(function(a){return JSON.stringify(attachmentSummary(a));}).join('\n'));});
        if(accepted===false)throw new Error('附件未保存，请重试');
        var reopen=!!submittedForm && !!submittedModal && document.contains(submittedForm) && document.querySelector('.modal')===submittedModal && document.querySelector('[data-form="work-attachment"]')===submittedForm;
        releaseSubmission();
        if(reopen){ctx.closeModal();workDetail(ctx,attachmentWorkId);}
        ctx.toast('附件原始字节已保存');return true;
      }).catch(function(e){if(submittedForm?.isConnected)submittedForm.dataset.dirty='true';throw e;}).finally(releaseSubmission);
    }
    if (name === 'work-project') {
      title = get(values, 'name'); if (!title) return error(ctx, '请输入项目名称');if(title.length>100)return error(ctx,'项目名称最多 100 字，避免 V2 存储截断导致关联歧义');var existingProject=find(s,'projects',id);if ((!existingProject || existingProject.name!==title) && !unique(s, 'projects', title, id)) return error(ctx, '已有同名项目，请选择已有项目或使用另一个名称');
      fields = {name:title,description:raw(values,'description'),owner:get(values,'owner'),members:Array.from(new Set(raw(values,'memberLines').split(/\r?\n/).map(function(line){return line.trim();}).filter(Boolean))),status:get(values,'status') || 'active',color:get(values,'color') || 'q1'};
      Object.assign(fields,timePatch(values,['dueDate'],existingProject,!id));
      if (!['active','paused','completed'].includes(fields.status) || !/^q[0-3]$/.test(fields.color)) return error(ctx, '请选择有效的项目状态和颜色');
      return change(ctx, function (next) { var p = find(next, 'projects', id); if (id && !p) throw new Error('项目已不存在'); if (p) { var before=snapshot(p);flatten(items(next, 'tasks')).forEach(function (t) { if (taskProject(t,p,next)) { t.projectId = id; t.project = title; } });Object.assign(p, fields);audit(p,'编辑项目',before); } else {var added=Object.assign({id:uid('project'),archived:false,createdAt:now()}, fields);audit(added,'创建项目');collection(next,'projects').push(added);} }, '已保存项目');
    }
    if (name === 'work-work-item') {
      title = get(values,'title'); if (!title) return error(ctx,'请输入工作事项'); var projectId = get(values,'projectId'); if (projectId && !find(s,'projects',projectId)) return error(ctx,'关联项目已不存在');
      var existingWork=find(s,'workItems',id);
      fields = {title:title,projectId:projectId,status:get(values,'status') || 'planned',owner:get(values,'owner'),description:raw(values,'description'),notes:raw(values,'notes'),priority:get(values,'priority') || 'normal',processId:get(values,'processId')};
      Object.assign(fields,timePatch(values,['plannedStart','dueDate'],existingWork,!id));
      var scheduledWork=Object.assign({},existingWork || {},fields);
      if (!['planned','doing','waiting','done'].includes(fields.status)) return error(ctx,'请选择有效的事项状态');
      if(!priorityLabels[fields.priority])return error(ctx,'请选择有效优先级');if((!id || Object.prototype.hasOwnProperty.call(fields,'plannedStart') || Object.prototype.hasOwnProperty.call(fields,'dueDate')) && timeRangeReversed(scheduledWork.plannedStart,scheduledWork.dueDate))throw new Error('计划开始不能晚于截止时间；输入仍保留');if(fields.processId && !find(s,'processes',fields.processId))return error(ctx,'关联流程已不存在');
      return change(ctx,function(next) { var w = find(next,'workItems',id); if(id && !w) throw new Error('工作事项已不存在'); if(w) { var before=snapshot(w);if(w.projectId !== fields.projectId) flatten(items(next,'tasks')).forEach(function(t) { if(t.workItemId === id) { t.projectId = fields.projectId; t.project = fields.projectId ? find(next,'projects',fields.projectId).name : ''; } }); Object.assign(w,fields);w.completedAt=w.status==='done' ? w.completedAt || now() : '';audit(w,'编辑工作事项',before); } else {var added=Object.assign({id:uid('work'),archived:false,createdAt:now(),attachments:[],completedAt:fields.status==='done' ? now() : ''},fields);audit(added,'创建工作事项');collection(next,'workItems').push(added);} },'已保存工作事项');
    }
    if (name === 'work-template') {
      title = get(values,'name'); var lines = get(values,'stepLines').split(/\r?\n/).map(function(line){return line.trim();}).filter(Boolean);
      if(!title) return error(ctx,'请输入模板名称'); if(!unique(s,'templates',title,id)) return error(ctx,'已有同名模板'); if(!lines.length || lines.length > 20 || lines.some(function(line){return line.length > 160;})) return error(ctx,'请填写 1–20 个步骤，每步不超过 160 字');
      var original = find(s,'templates',id), pool = original ? (original.steps || []).slice() : [];
      fields = {name:title,description:raw(values,'description'),steps:lines.map(function(line){var index = pool.findIndex(function(step){return step.title === line;});var step = index >= 0 ? pool.splice(index,1)[0] : {id:uid('step'),description:''};return {id:step.id,title:line,description:step.description || ''};})};
      var changed=!original || original.name!==fields.name || original.description!==fields.description || JSON.stringify(original.steps)!==JSON.stringify(fields.steps);fields.version=validVersion(original) ? original.version+(changed ? 1 : 0) : 1;fields.enabled=original ? original.enabled!==false : true;
      return saveObject(ctx,'templates',id,fields,'已保存流程模板');
    }
    if (name === 'work-process') {
      title = get(values,'name'); if(!title) return error(ctx,'请输入流程名称'); var templateId = get(values,'templateId'), targetProject = get(values,'projectId'); if(targetProject && !find(s,'projects',targetProject)) return error(ctx,'关联项目已不存在');
      if(id) return saveObject(ctx,'processes',id,{name:title,projectId:targetProject},'已保存流程');
      var template = find(s,'templates',templateId); if(!template || template.archived || template.enabled===false || !(template.steps || []).length) return error(ctx,'模板已不存在、停用、归档或没有步骤');
      if(!validVersion(template))return error(ctx,'BLOCKER：模板未记录版本，先保存当前候选定义');
      return saveObject(ctx,'processes','',{name:title,templateId:templateId,templateVersion:template.version || 1,templateSnapshot:{id:template.id,name:template.name,description:template.description,version:template.version || 1,steps:copy(template.steps),capturedAt:now()},projectId:targetProject,status:'running',currentStep:0,steps:template.steps.map(function(step){return {id:uid('run-step'),sourceStepId:step.id,title:step.title,description:step.description || '',completed:false,completedAt:''};}),completedAt:''},'已创建并开始流程',function(){ctx.navigate('processes');});
    }
    if (name === 'work-contact') { title = get(values,'name'); if(!title) return error(ctx,'请输入联系人姓名'); fields = {name:title,organization:get(values,'organization'),role:get(values,'role'),email:get(values,'email'),phone:get(values,'phone'),notes:raw(values,'notes')}; if(!id) fields.followups=[]; return saveObject(ctx,'contacts',id,fields,'已保存联系人'); }
    if (name === 'work-followup') {
      title = get(values,'title'); var contactId = get(values,'contactId'); if(!title) return error(ctx,'请输入跟进事项'); if(!find(s,'contacts',contactId)) return error(ctx,'联系人已不存在'); var status = get(values,'status') || 'pending'; if(!['pending','done'].includes(status)) return error(ctx,'请选择有效跟进状态');
      var existingFollowup=(find(s,'contacts',contactId).followups || []).find(function(f){return f.id===id;});
      var followupFields={title:title,projectId:get(values,'projectId'),workItemId:get(values,'workItemId'),notes:raw(values,'notes'),status:status};
      Object.assign(followupFields,timePatch(values,['occurredOn','dueDate'],existingFollowup,!id));
      if(followupFields.projectId && !find(s,'projects',followupFields.projectId))return error(ctx,'关联项目已不存在');if(followupFields.workItemId && !find(s,'workItems',followupFields.workItemId))return error(ctx,'关联事项已不存在');
      return change(ctx,function(next) { var c=find(next,'contacts',contactId), list=c.followups || (c.followups=[]), f=list.find(function(row){return row.id===id;}); if(id && !f) throw new Error('跟进记录已不存在');var before=f ? snapshot(f) : null,patch=copy(followupFields);patch.completedAt=status==='done' ? (f && f.completedAt || now()) : '';if(f) Object.assign(f,patch);else {f=Object.assign({id:uid('followup'),createdAt:now()},patch);list.push(f);}audit(f,id ? '编辑沟通跟进' : '记录沟通跟进',before);audit(c,'保存跟进事项',null,f.id+' · '+f.title); },'已保存跟进事项',function(){contactDetail(ctx,contactId);});
    }
    if (name === 'work-link-project' || name === 'work-link-work') {
      var taskId=get(values,'taskId'), ownerId=get(values,name==='work-link-project'?'projectId':'workItemId'); if(!taskById(s,taskId)) return error(ctx,'任务已不存在'); key=name==='work-link-project'?'projects':'workItems'; if(!find(s,key,ownerId)) return error(ctx,'关联条目已不存在');
      return change(ctx,function(next) { var t=taskById(next,taskId), owner=find(next,key,ownerId); if(!t || t.archived || !owner || owner.archived) throw new Error('关联条目已改变，请重试'); var p = key==='projects' ? owner : find(next,'projects',owner.projectId); t.projectId=p ? p.id : ''; t.project=p ? p.name : ''; if(key==='workItems') t.workItemId=ownerId; else if(t.workItemId) { var current=find(next,'workItems',t.workItemId); if(current && current.projectId!==ownerId) t.workItemId=''; }audit(owner,'关联任务',null,t.id+' · '+t.title); },'已关联任务',function(){if(key==='projects') projectDetail(ctx,ownerId);else workDetail(ctx,ownerId);});
    }
    return false;
  }
  function render(route, ctx) {
    var renderers = {projects:projectsPage,'work-items':workItemsPage,templates:templatesPage,processes:processesPage,contacts:contactsPage,archive:archivePage,analytics:analyticsPage};
    return renderers[route] ? renderers[route](ctx) : '';
  }
  function seed(date) {
    date = date || localDay(new Date());
    function shift(offset) { var d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0,10); }
    function steps(prefix, titles, completedCount) { return titles.map(function(title,i) { return {id:prefix+'-'+i,title:title,description:'',completed:i<completedCount,completedAt:i<completedCount ? shift(-1)+'T03:00:00Z' : ''}; }); }
    var result = {
      projectMeta: {
        'project-delivery':{status:'active',owner:'林晓',members:['林晓','陈晨'],color:'q0',dueDate:shift(7)},
        'project-product':{status:'active',owner:'陈晨',members:['陈晨'],color:'q1',dueDate:shift(14)},
        'project-operations':{status:'paused',owner:'周宁',members:['周宁'],color:'q3',dueDate:shift(21)}
      },
      workItems: [
        {id:'work-delivery-plan',title:'交付材料与里程碑',projectId:'project-delivery',status:'doing',owner:'林晓',description:'核对本次交付清单与验收材料。',dueDate:shift(3),archived:false},
        {id:'work-product-review',title:'新界面评审准备',projectId:'project-product',status:'waiting',owner:'陈晨',description:'收集页面反馈，整理需要确认的交互。',dueDate:shift(5),archived:false},
        {id:'work-operations-training',title:'团队资料整理',projectId:'project-operations',status:'planned',owner:'周宁',description:'整理新人可复用的工作资料。',dueDate:shift(9),archived:false},
        {id:'work-archived-retro',title:'上周例会复盘',projectId:'project-operations',status:'done',owner:'周宁',description:'演示用的归档事项，可以恢复。',dueDate:shift(-7),archived:true,archivedAt:shift(-2)+'T03:00:00Z'}
      ],
      templates: [
        {id:'template-delivery',name:'交付检查',description:'交付前按顺序准备材料、核对内容并完成验收。',steps:steps('delivery-step',['准备材料','核对交付清单','确认验收'],0),archived:false},
        {id:'template-weekly',name:'每周工作复盘',description:'梳理进展，把问题变成下一步行动。',steps:steps('weekly-step',['整理本周完成项','分析阻塞','安排下周行动','记录复盘'],0),archived:false},
        {id:'template-archived',name:'旧版发布检查',description:'演示已归档模板。恢复后可以重新使用。',steps:steps('old-step',['检查版本','保存发布记录'],0),archived:true,archivedAt:shift(-3)+'T03:00:00Z'}
      ],
      processes: [
        {id:'process-delivery',name:'本周交付检查',templateId:'template-delivery',projectId:'project-delivery',status:'running',currentStep:1,steps:steps('delivery-run',['准备材料','核对交付清单','确认验收'],1),archived:false,createdAt:shift(-2)+'T03:00:00Z',completedAt:''},
        {id:'process-weekly',name:'产品迭代复盘',templateId:'template-weekly',projectId:'project-product',status:'paused',currentStep:0,steps:steps('weekly-run',['整理本周完成项','分析阻塞','安排下周行动','记录复盘'],0),archived:false,createdAt:shift(-1)+'T03:00:00Z',completedAt:''},
        {id:'process-completed',name:'上次交付检查',templateId:'template-delivery',projectId:'project-delivery',status:'completed',currentStep:3,steps:steps('past-run',['准备材料','核对交付清单','确认验收'],3),archived:false,createdAt:shift(-8)+'T03:00:00Z',completedAt:shift(-1)+'T03:00:00Z'}
      ],
      contacts: [
        {id:'contact-partner',name:'林晓',organization:'交付协作组',role:'项目联络',email:'',phone:'',notes:'核对材料后记录确认结果。',archived:false,followups:[{id:'followup-material',title:'确认交付材料',dueDate:shift(-1),status:'pending',notes:'待确认最终清单。',completedAt:''},{id:'followup-review',title:'回收评审反馈',dueDate:shift(2),status:'pending',notes:'',completedAt:''}]},
        {id:'contact-team',name:'陈晨',organization:'产品团队',role:'设计协作',email:'',phone:'',notes:'记录原型评审的下一步行动。',archived:false,followups:[{id:'followup-ui',title:'安排界面评审',dueDate:date,status:'done',notes:'已确认本次讨论范围。',completedAt:date+'T03:00:00Z'}]},
        {id:'contact-archived',name:'周宁',organization:'历史协作组',role:'资料联系人',email:'',phone:'',notes:'演示归档联系人。',archived:true,archivedAt:shift(-2)+'T03:00:00Z',followups:[]}
      ]
    };
    // Fresh synthetic fixture definitions are known. Existing saved workspaces are
    // never patched here: missing historical versions remain explicitly unknown.
    result.templates.forEach(function(t){t.version=1;t.enabled=true;});
    result.processes.forEach(function(p){var t=result.templates.find(function(t){return t.id===p.templateId;});p.templateVersion=1;p.templateSnapshot={id:t.id,name:t.name,description:t.description,version:1,steps:copy(t.steps),capturedAt:p.createdAt};});
    result.workItems.forEach(function(w){w.priority='normal';w.plannedStart='';w.processId='';w.notes='';w.attachments=[];});
    return result;
  }
  window.DemoWorkPages = {render:render,act:act,submit:submit,seed:seed,isBusy:function(){return pendingAttachment!==null;}};
}());
