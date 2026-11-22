import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {normalizeState} from '../src/model.mjs';
import {flattenTasks} from '../src/task-tree.mjs';
import {formatTime} from '../src/schedule.mjs';

const check = (condition,message) => {if(!condition)throw new Error(message);};
const md5 = value => createHash('md5').update(value).digest('hex');
const first = value => Array.isArray(value) ? value[0] : value;
const sequence = value => {try{return BigInt(value||0);}catch{return 0n;}};
const bySequence = (a,b) => sequence(a.sequence)<sequence(b.sequence)?-1:sequence(a.sequence)>sequence(b.sequence)?1:0;
const localTime = value => Number(value)>0 ? formatTime(Number(value)*1000) : '';
const isoTime = value => {if(Number(value)>0)return new Date(Number(value)*1000).toISOString();if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(value))){const date=new Date(value.replace(' ','T')+'+08:00');if(Number.isFinite(date.getTime()))return date.toISOString();}return '';};
const responseData = (response,label) => {check(response?.status==='0',label+'读取失败');return response.data;};

export function officialRepeat(detail) {
  if(detail.is_repeat!=='1')return null;
  const r=detail.repeat_detail||{};
  let frequency,interval,weekdays=[];
  if(Number(r.repeat_start_day)>0){frequency='daily';interval=Number(r.day_interval)/86400;}
  else if(Number(r.repeat_start_week)>0){frequency='weekly';interval=Number(r.week_interval)/604800;weekdays=String(r.weekday).split('').flatMap((x,i)=>x!=='0'?[i]:[]);}
  else if(Number(r.repeat_start_month)>0){frequency='monthly';interval=Number(r.month_interval);}
  else if(Number(r.repeat_start_year)>0){frequency='yearly';interval=Number(r.year_interval);}
  check(frequency&&Number.isInteger(interval)&&interval>0&&interval<=365,'无法无损转换重复规则：'+detail.task_id);
  return {frequency,interval,weekdays,until:localTime(detail.repeat_end).slice(0,10),anchor:localTime(detail.start_at)};
}

function reminder(detail) {
  const value=Number(detail.alert_time);
  if(!Number.isFinite(value)||value<0)return null;
  if(value>259200)return {mode:'custom',at:localTime(value)};
  return detail.is_all_day==='1'?{mode:'day',days:value/86400}:{mode:'offset',minutes:value/60};
}

function checkLimits(state) {
  const tasks=flattenTasks(state.tasks);
  check(tasks.length<=10000,'导入后任务总数超过 10,000');
  check(state.notes.length<=10000&&state.projects.length<=1000&&state.tags.length<=1000&&state.places.length<=1000,'导入后分类或便签数量超限');
  for(const t of tasks){
    check(t.title.length<=2000&&t.notes.length<=50000&&t.review.length<=10000,'任务文字超长：'+t.id);
    check(t.subtasks.length<=100&&t.tags.length<=30,'子任务或标签超限：'+t.id);
    check(t.project.length<=100&&t.place.length<=100&&t.tags.every(x=>x.length<=100),'任务分类名称过长：'+t.id);
  }
  check(state.notes.every(x=>x.body.length<=50000),'便签正文超长');
  check(state.projects.every(x=>x.name.length<=100&&x.description.length<=10000),'项目文字超长');
  check([...state.tags,...state.places].every(x=>x.length<=100),'分类名称超长');
  const normalized=normalizeState(state);
  check(Buffer.byteLength(JSON.stringify(normalized))<=5*1024*1024,'导入后数据超过 5 MB');
  return normalized;
}

export function convertOfficialArchive(archive) {
  const taskList=responseData(archive.taskList,'任务列表');
  const projects={...responseData(archive.projectsActive,'活动项目'),...responseData(archive.projectsArchived,'归档项目')};
  const notes=responseData(archive.notes,'便签'),tags=responseData(archive.tags,'标签'),places=responseData(archive.places,'地点');
  const base=archive.details,history=archive.history||[];
  check(base.length===Object.keys(taskList.normal.task).length,'主任务详情不完整');
  const seenBase=new Set(),seenOccurrences=new Set(),coveredChecks=new Set(),checks=taskList.normal.schedule_check||{};
  const teams=new Set(base.map(x=>x.payload?.data?.team_id));check(teams.size===1,'本次归档必须来自同一个工作区');
  const team=String([...teams][0]);
  const prefix='gx-'+team+'-';
  const records=[...base,...history];
  const orderedBase=[...base].sort((a,b)=>bySequence(first(taskList.normal.task_user_map[a.request.taskId])||{},first(taskList.normal.task_user_map[b.request.taskId])||{}));
  const order=new Map(orderedBase.map((x,i)=>[x.request.taskId,i*1024]));
  const ledger=[];
  const tasks=records.map((record,index)=>{
    const d=responseData(record.payload,'任务详情');
    const taskId=record.request.taskId,at=Number(record.request.start_at),isHistory=index>=base.length;
    check(taskId===d.task_id&&String(d.team_id)===team&&Number.isFinite(at),'详情身份或日期不一致');
    check(taskList.normal.task[taskId],'详情不属于本次任务列表');
    if(!isHistory){check(!seenBase.has(taskId),'主任务详情重复');seenBase.add(taskId);}
    const occurrence=taskId+'|'+at;check(!seenOccurrences.has(occurrence),'同一任务日期重复');seenOccurrences.add(occurrence);
    const checkId=md5('76|'+d.user_id+'|'+d.uid+(d.is_repeat==='1'?'|'+at:''));
    const done=(d.schedule_check?.[d.user_id]?.status||'0')==='1';
    if(Object.hasOwn(checks,checkId)){
      coveredChecks.add(checkId);check(done===(checks[checkId]==='1'),'完成状态与总表不符');
    }else check(!done,'详情完成状态未出现在总表');
    const id=prefix+'task-'+taskId+(isHistory?'-'+at:'');
    const task={id,order:order.get(taskId)+(isHistory?(at/1e12):0),title:d.name,quadrant:Number(d.rank)-1,done,
      start:localTime(at),end:localTime(Number(d.end_at)+at-Number(d.start_at)),allDay:d.is_all_day==='1',
      repeat:officialRepeat(d),reminder:reminder(d),seriesId:d.is_repeat==='1'?prefix+'series-'+taskId:'',generatedFrom:'',
      review:d.attached_content?.t_1?.content||'',weight:Number(d.weight)/10,
      project:d.project_name||projects[d.project_id]?.name||'',place:d.position_name||places[d.position_id]?.name||'',
      tags:Object.values(d.tag_name||{}),notes:d.attached_content?.t_2?.content||'',createdAt:'',completedAt:'',subtasks:[]};
    check(Number.isInteger(task.quadrant)&&task.quadrant>=0&&task.quadrant<=3,'无效象限');
    task.subtasks=[...(d.child_tasks||[])].sort(bySequence).map((child,i)=>({
      id:prefix+'sub-'+taskId+'-'+child.uid+(isHistory?'-'+at:''),order:i*1024,title:child.name,quadrant:task.quadrant,done:child.checked==='1',
      start:'',end:'',allDay:false,repeat:null,reminder:null,seriesId:'',generatedFrom:'',review:'',weight:0,
      project:task.project,place:task.place,tags:[...task.tags],notes:'',createdAt:'',completedAt:'',subtasks:[]}));
    ledger.push({id,sourceTaskId:taskId,sourceScheduleId:d.uid,sourceStartAt:at,sourceCheckId:checkId,history:isHistory,children:task.subtasks.length});
    return task;
  });
  check(Object.keys(checks).every(id=>coveredChecks.has(id)),'历史勾选记录尚未全部读取，拒绝不完整导入');
  for(const [id,project] of Object.entries(projects)){
    check(base.filter(x=>x.payload.data.project_id===id).length===Number(project.task_total),'项目任务计数不符：'+id);
  }
  const incoming=checkLimits({version:2,tasks,settings:{},
    notes:Object.entries(notes).map(([id,n])=>({id:prefix+'note-'+id,body:n.name,createdAt:isoTime(n.created_at)})),
    projects:Object.entries(projects).map(([id,p])=>({id:prefix+'project-'+id,name:p.name,description:p.intro||'',archived:p.status==='1'})),
    tags:Object.values(tags).map(x=>x.name),places:Object.values(places).map(x=>x.name)});
  const flat=flattenTasks(incoming.tasks);
  return {state:incoming,ledger,report:{
    workspaceId:team,sourceMainTasks:base.length,sourceSubtasks:base.reduce((n,x)=>n+x.payload.data.child_tasks.length,0),
    recurringSeries:base.filter(x=>x.payload.data.is_repeat==='1').length,historyOccurrences:history.length,
    historySubtasks:history.reduce((n,x)=>n+x.payload.data.child_tasks.length,0),sourceCompletionRecords:Object.keys(checks).length,verifiedCompletionRecords:coveredChecks.size,
    importedTopLevelTasks:incoming.tasks.length,importedSubtasks:flat.length-incoming.tasks.length,totalTaskRecords:flat.length,
    completedTopLevelTasks:incoming.tasks.filter(t=>t.done).length,notes:incoming.notes.length,projects:incoming.projects.length,
    archivedProjects:incoming.projects.filter(p=>p.archived).length,tags:incoming.tags.length,places:incoming.places.length,
    limitations:['官网接口未返回任务创建时间和实际完成时间，这些字段留空；原始秒级计划时间保存在归档。','地点坐标、来源 ID、参与者等本地版没有对应字段的信息保留在原始 JSON 归档。','循环规则和已有历史勾选记录已迁移；未操作过的历史自动重复日期不展开为额外任务。']
  }};
}

export function mergeOfficialState(current,incoming) {
  const existing=normalizeState(current),ids=new Set([...flattenTasks(existing.tasks),...existing.notes,...existing.projects].map(x=>x.id));
  let skippedExisting=0;
  const merge=(old,list)=>[...old,...list.filter(x=>{if(ids.has(x.id)){skippedExisting++;return false;}ids.add(x.id);return true;})];
  const state=checkLimits({...existing,tasks:merge(existing.tasks,incoming.tasks),notes:merge(existing.notes,incoming.notes),
    projects:merge(existing.projects,incoming.projects),tags:[...new Set([...existing.tags,...incoming.tags])],places:[...new Set([...existing.places,...incoming.places])]});
  return {state,skippedExisting};
}

export async function readOfficialArchive(directory) {
  const read=async name=>JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
  const batch=async folder=>(await Promise.all((await fs.readdir(path.join(directory,folder))).filter(f=>/^batch-.*\.json$/.test(f)).sort().map(f=>read(folder+'/'+f)))).flat();
  const [taskList,projectsActive,projectsArchived,notes,tags,places,details,history]=await Promise.all([
    read('all-task-list.json'),read('projects-active.json'),read('projects-archived.json'),read('notes.json'),read('tags.json'),read('places.json'),batch('details'),batch('history')]);
  return {taskList,projectsActive,projectsArchived,notes,tags,places,details,history};
}

if(typeof process!=='undefined'&&process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const [directory,currentFile]=process.argv.slice(2);
  check(directory&&currentFile,'用法：node scripts/import-official.mjs <官网归档目录> <本地备份 JSON>');
  const result=convertOfficialArchive(await readOfficialArchive(directory));
  const merged=mergeOfficialState(JSON.parse(await fs.readFile(currentFile,'utf8')),result.state);
  await fs.writeFile(path.join(directory,'converted-official.json'),JSON.stringify(result.state,null,2));
  await fs.writeFile(path.join(directory,'merged-preview.json'),JSON.stringify(merged.state,null,2));
  await fs.writeFile(path.join(directory,'import-ledger.json'),JSON.stringify(result.ledger,null,2));
  await fs.writeFile(path.join(directory,'import-report.json'),JSON.stringify({...result.report,skippedExisting:merged.skippedExisting},null,2));
  console.log(JSON.stringify({...result.report,skippedExisting:merged.skippedExisting},null,2));
}
