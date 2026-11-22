import test from 'node:test';
import assert from 'node:assert/strict';
import {handleTaskEditorEnter,blockTaskFormSubmit,saveTaskEditorDraft,quickSubtask,saveTaskRecord,applyPlaceDraft} from '../src/task-editor.mjs';
import {emptyState} from '../src/sync-core.mjs';
// Simulate the browser defaults after a cancellable DOM event, including implicit form submit.
function fixture({picker=null,tagName='TEXTAREA',search=false,type='text',name='title'}={}){
 const form=new EventTarget();form.id='task-form';let submits=0,saves=0,choices=0;
 const control=new EventTarget();Object.assign(control,{tagName,type,name,value:'第一行',closest:selector=>selector==='form'?form:null,classList:{contains:value=>search&&value==='picker-search'}});
 control.addEventListener('keydown',event=>handleTaskEditorEnter(event,{picker,onConfirmChoice:()=>{choices++;}}));
 form.addEventListener('submit',event=>{submits++;if(!blockTaskFormSubmit(event))saves++;});
 const submit=()=>{const event=new Event('submit',{cancelable:true});form.dispatchEvent(event);return event;};
 const press=(options={})=>{const event=new Event('keydown',{cancelable:true});for(const [key,value] of Object.entries({key:'Enter',isComposing:false,keyCode:13,shiftKey:false,...options}))Object.defineProperty(event,key,{value});control.dispatchEvent(event);if(!event.defaultPrevented&&!event.isComposing&&event.keyCode!==229){if(control.tagName==='TEXTAREA')control.value+='\n';else submit();}return event;};
 return {control,form,press,submit,result:()=>({submits,saves,choices})};
}
test('任务标题、备注、复盘、快速子任务和地点的Enter保留浏览器换行默认动作，不保存任务',()=>{
 for(const name of ['title','notes','review','quick-subtask','place']){const f=fixture({name,picker:name==='place'?'place':null,search:name==='place'}),event=f.press();assert.equal(event.defaultPrevented,false,name);assert.equal(f.control.value,'第一行\n',name);assert.deepEqual(f.result(),{submits:0,saves:0,choices:0});}
});
test('日期、时间、数值、单选和下拉控件Enter不改格式值，也不隐式提交任务',()=>{
 for(const type of ['date','time','datetime-local','number','radio','checkbox','select']){const f=fixture({tagName:type==='select'?'SELECT':'INPUT',type}),event=f.press();assert.equal(event.defaultPrevented,true,type);assert.equal(f.control.value,'第一行');assert.deepEqual(f.result(),{submits:0,saves:0,choices:0});}
});
test('只有项目和标签搜索Enter确认选择，Shift+Enter仍可输入多行且不保存任务',()=>{
 for(const picker of ['project','tags']){const f=fixture({picker,search:true}),event=f.press();assert.equal(event.defaultPrevented,true);assert.equal(f.control.value,'第一行');assert.deepEqual(f.result(),{submits:0,saves:0,choices:1});const shifted=f.press({shiftKey:true});assert.equal(shifted.defaultPrevented,false);assert.equal(f.control.value,'第一行\n');assert.equal(f.result().choices,1);}
 const unrelated=fixture({picker:'tags',name:'notes'});unrelated.press();assert.equal(unrelated.control.value,'第一行\n');assert.equal(unrelated.result().choices,0);
});
test('IME组合Enter及229确认留给输入法，意外form submit仍不能保存任务',()=>{
 for(const options of [{isComposing:true},{keyCode:229}]){const f=fixture({picker:'tags',search:true}),event=f.press(options);assert.equal(event.defaultPrevented,false);assert.equal(f.control.value,'第一行');assert.equal(f.result().choices,0);assert.equal(f.submit().defaultPrevented,true);assert.equal(f.result().saves,0);}
 const ordinary=fixture({tagName:'INPUT'});assert.equal(ordinary.submit().defaultPrevented,true);assert.equal(ordinary.result().saves,0);
});
test('任务表单拒绝requestSubmit式入口，独立保存按钮显式保存多行草稿且保持详情打开',async()=>{
 const f=fixture(),state=emptyState(),parent={id:'parent',title:'标题\n第二行',order:0,quadrant:1,done:false,start:'',end:'',allDay:false,repeat:null,reminder:null,weight:0,review:'复盘\n第二行',project:'',place:'楼层\n房间',tags:[],notes:'备注\n第二行',subtasks:[],createdAt:'2026-10-30T00:00',completedAt:''};let open=true,saved=0,added=0;
 const persist=async()=>{saved++;saveTaskRecord(state,structuredClone(parent),null);return true;};
 const button=new EventTarget();let pending;button.addEventListener('click',()=>{pending=saveTaskEditorDraft({quickTitle:'子任务\n第二行',saveTask:persist,addQuickSubtask:async focus=>{assert.equal(focus,false);if(!await persist())return false;const child=quickSubtask(parent,'子任务\n第二行','child');state.tasks[0].subtasks.push(child);added++;return true;}});});
 f.submit();assert.equal(saved,0);button.dispatchEvent(new Event('click'));assert.equal(await pending,true);assert.equal(saved,1);assert.equal(added,1);assert.equal(state.tasks[0].title,parent.title);assert.equal(state.tasks[0].notes,parent.notes);assert.equal(state.tasks[0].review,parent.review);assert.equal(state.tasks[0].place,parent.place);assert.equal(state.tasks[0].subtasks[0].title,'子任务\n第二行');assert.equal(open,true);
 assert.equal(await saveTaskEditorDraft({quickTitle:'  ',saveTask:persist,addQuickSubtask:()=>{throw Error('empty quick draft must not add');}}),true);assert.equal(saved,2);
});
test('显式保存失败时保留子任务草稿和详情，按钮的Enter不被文本处理器拦截',async()=>{
 let draft='待添加\n第二行';const result=await saveTaskEditorDraft({quickTitle:draft,saveTask:()=>{throw Error('wrong save path');},addQuickSubtask:async()=>false});assert.equal(result,false);assert.equal(draft,'待添加\n第二行');
 const form={id:'task-form'},event={key:'Enter',target:{tagName:'BUTTON',closest:selector=>selector==='form'?form:selector==='button,a'?{}:null},preventDefault:()=>{throw Error('explicit button activation must be preserved');}};assert.equal(handleTaskEditorEnter(event),false);
 const unrelated=new Event('submit',{cancelable:true});Object.defineProperty(unrelated,'target',{value:{id:'entity-form'}});assert.equal(blockTaskFormSubmit(unrelated),false);assert.equal(unrelated.defaultPrevented,false);
});

test('地点多行输入、全选清空、保存和返回保留草稿；未编辑的空搜索不清除已选地点',()=>{
 const task={place:'原地点'},field=fixture({name:'place',picker:'place',search:true});let edited=false;
 field.control.addEventListener('input',()=>{edited=true;applyPlaceDraft(task,field.control.value,edited);});
 assert.equal(applyPlaceDraft(task,'',edited),false);assert.equal(task.place,'原地点');
 field.control.value='楼层\n房间';field.control.dispatchEvent(new Event('input'));assert.equal(task.place,'楼层\n房间');
 field.control.value='';field.control.dispatchEvent(new Event('input'));assert.equal(task.place,'');assert.equal(applyPlaceDraft(task,field.control.value,edited),false);
});
test('深层子任务的独立保存保持原父子层级和多行内容',async()=>{
 const state=emptyState(),child=quickSubtask({subtasks:[],quadrant:0},'原子任务','nested-child'),parent=quickSubtask({subtasks:[],quadrant:0},'父任务','parent');parent.subtasks=[child];state.tasks=[parent];const before=structuredClone(child),draft=structuredClone(child);draft.title='深层标题\n第二行';draft.notes='深层备注\n第二行';draft.review='深层复盘\n第二行';draft.place='楼层\n房间';
 assert.equal(await saveTaskEditorDraft({quickTitle:'',saveTask:async()=>{saveTaskRecord(state,draft,before,parent.id);return true;},addQuickSubtask:()=>{throw Error('unexpected addition');}}),true);assert.equal(state.tasks.length,1);assert.equal(state.tasks[0].id,parent.id);for(const field of ['id','title','notes','review','place'])assert.equal(state.tasks[0].subtasks[0][field],draft[field],field);
});
