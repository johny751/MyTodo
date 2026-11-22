import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {convertOfficialArchive,mergeOfficialState,officialRepeat} from '../scripts/import-official.mjs';
import {normalizeState,visibleTasks} from '../src/model.mjs';

const wrap=data=>({status:'0',data});
const hash=s=>createHash('md5').update(s).digest('hex');
function fixture(){
  const start=Date.parse('2023-04-03T09:00:00+08:00')/1000;
  const detail=(id,repeating=false)=>({task_id:id,team_id:'test',user_id:'user',uid:'schedule-'+id,name:'任务 '+id,rank:'2',
    start_at:String(start),end_at:String(start+3600),is_all_day:'0',is_repeat:repeating?'1':'0',
    repeat_start:String(start-32400),repeat_end:String(start+10*86400),repeat_detail:{repeat_start_day:'0',repeat_start_week:'1',week_interval:'604800',weekday:'0234560'},
    alert_time:'300',weight:'20',project_id:'p',project_name:'项目',position_id:'place',position_name:'地点',tag_name:{tag:'标签'},
    attached_content:{t_1:{content:'总结'},t_2:{content:'第一行\n第二行 <保留文字>'}},
    schedule_check:{user:{status:repeating?'0':'1'}},child_tasks:[{uid:'child',name:'子任务',checked:'1',sequence:'999999999999999999'}]});
  const normal=detail('normal'),repeat=detail('repeat',true),historical=structuredClone(repeat);
  historical.schedule_check.user.status='1';historical.child_tasks[0].checked='0';
  const record=(d,at=start)=>({request:{taskId:d.task_id,start_at:String(at),role:'7680'},payload:wrap(d)});
  const checks={};
  checks[hash('76|user|schedule-normal')]='1';
  checks[hash('76|user|schedule-repeat|'+start)]='0';
  checks[hash('76|user|schedule-repeat|'+(start+86400))]='1';
  return {taskList:wrap({normal:{task:{normal:[{}],repeat:[{}]},task_user_map:{normal:[{sequence:'200000000000000001'}],repeat:[{sequence:'200000000000000000'}]},schedule_check:checks},repeat:{}}),
    projectsActive:wrap({p:{name:'项目',intro:'项目说明',status:'0',task_total:'2'}}),projectsArchived:wrap({}),
    notes:wrap({n:{name:'原始便签\n下一行',created_at:'2023-04-03 08:15:30'}}),tags:wrap({tag:{name:'标签'}}),places:wrap({place:{name:'地点',latitude:'0',longitude:'0'}}),
    details:[record(normal),record(repeat)],history:[record(historical,start+86400)]};
}

test('官网字段、历史日期、子任务状态与完成记录均完整转换',()=>{
  const r=convertOfficialArchive(fixture()),normal=r.state.tasks[0],history=r.state.tasks[2];
  assert.equal(r.report.verifiedCompletionRecords,3);
  assert.equal(r.report.totalTaskRecords,6);
  assert.equal(normal.notes,'第一行\n第二行 <保留文字>');
  assert.equal(normal.review,'总结');
  assert.equal(normal.weight,2);
  assert.equal(normal.reminder.minutes,5);
  assert.equal(normal.createdAt,'');
  assert.equal(normal.completedAt,'');
  assert.equal(r.state.notes[0].createdAt,'2023-04-03T00:15:30.000Z');
  assert.equal(history.start,'2023-04-04T09:00');
  assert.equal(history.end,'2023-04-04T10:00');
  assert.equal(history.done,true);
  assert.equal(history.subtasks[0].done,false);
  assert.notEqual(history.subtasks[0].id,r.state.tasks[1].subtasks[0].id);
  assert.deepEqual(history.repeat.weekdays,[1,2,3,4,5]);
  assert.ok(r.state.tasks[1].order<normal.order);
  assert.deepEqual(normalizeState(r.state),r.state);
});

test('缺失历史、重复详情及超长正文会阻止导入',()=>{
  const a=fixture();a.history=[];assert.throws(()=>convertOfficialArchive(a),/历史勾选/);
  const b=fixture();b.details[1]=b.details[0];assert.throws(()=>convertOfficialArchive(b),/重复/);
  const c=fixture();c.notes.data.n.name='长'.repeat(50001);assert.throws(()=>convertOfficialArchive(c),/便签正文超长/);
});

test('再次导入不增加副本，也不覆盖用户已修改的任务和设置',()=>{
  const incoming=convertOfficialArchive(fixture()).state;
  const empty={version:2,tasks:[],notes:[],projects:[],tags:[],places:[],settings:{longPressMs:1200}};
  const initial=mergeOfficialState(empty,incoming).state;
  initial.tasks[0].title='本地编辑内容';
  const second=mergeOfficialState(initial,incoming);
  assert.deepEqual(second.state,initial);
  assert.equal(second.skippedExisting,5);
  assert.equal(second.state.settings.longPressMs,1200);
});

test('已结束的循环任务保留在历史搜索中，当前日期不显示过期待办',()=>{
  const t=convertOfficialArchive(fixture()).state.tasks[1];
  assert.equal(visibleTasks([t],{date:'2026-10-17',status:'all'}).length,0);
  assert.equal(visibleTasks([t],{date:'2023-04-03',status:'all'}).length,1);
  assert.equal(visibleTasks([t],{date:'2026-10-17',status:'all',allDates:true}).length,1);
});
