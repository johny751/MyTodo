import {findTaskEntry,findTask} from './task-tree.mjs';
import {mergeStates,emptyState} from './sync-core.mjs';
// Resolve the containing array at save time, so saving a child never promotes it to a root task.
export function saveTaskRecord(state,updated,base,parentId=null){
 const entry=findTaskEntry(state.tasks,updated.id),parent=parentId?findTask(state.tasks,parentId):null;
 if(base&&!entry)throw new Error('任务已删除，请返回父任务或撤销删除');
 if(!entry&&parentId&&!parent)throw new Error('父任务已删除，未保存子任务');
 const siblings=entry?.siblings||(parent?parent.subtasks:state.tasks),index=siblings.findIndex(t=>t.id===updated.id),previous=siblings[index];
 let copies=[];if(base&&previous){const merged=mergeStates({...emptyState(),tasks:[base]},{...emptyState(),tasks:[updated]},{...emptyState(),tasks:[previous]});updated=merged.state.tasks.find(t=>t.id===updated.id);copies=merged.state.tasks.filter(t=>t.id!==updated.id);}
 if(!previous||!(entry?.parent||parent)&&previous.quadrant!==updated.quadrant)updated.order=Math.max(-1024,...siblings.filter(t=>t.id!==updated.id&&((entry?.parent||parent)||t.quadrant===updated.quadrant)).map(t=>t.order))+1024;
 if(index<0)siblings.push(updated);else siblings[index]=updated;
 for(const copy of copies)if(!findTask(state.tasks,copy.id))siblings.push(copy);
 return updated;
}

export function quickSubtask(parent,title,id,now=new Date().toISOString()){
 const value=String(title).trim();if(!value||value.length>2000)throw new Error('子任务内容请输入 1–2000 个字');
 if(parent.subtasks.length>=100)throw new Error('每条任务最多容纳 100 个直接子任务');
 return {id,title:value,order:Math.max(-1024,...parent.subtasks.map(t=>t.order||0))+1024,quadrant:parent.quadrant,done:false,start:new Date(Date.parse(now)+8*60*60*1000).toISOString().slice(0,16),end:'',allDay:false,repeat:null,reminder:null,weight:0,review:'',project:parent.project||'',place:parent.place||'',tags:[...(parent.tags||[])],notes:'',subtasks:[],createdAt:now,completedAt:''};
}

// Text editing never submits a task; only project/tag searches use Enter to confirm a choice.
export function handleTaskEditorEnter(event,{picker,onConfirmChoice}={}){
 const target=event.target,form=target?.closest?.('form');
 if(event.key!=='Enter'||event.isComposing||event.keyCode===229||form?.id!=='task-form'||target.closest('button,a'))return false;
 if(target.classList?.contains('picker-search')&&['project','tags'].includes(picker)&&!event.shiftKey){event.preventDefault();onConfirmChoice?.();}
 else if(target.tagName!=='TEXTAREA')event.preventDefault();
 return true;
}
export function blockTaskFormSubmit(event){
 if(event.target?.id!=='task-form')return false;
 event.preventDefault();return true;
}

export async function saveTaskEditorDraft({quickTitle,saveTask,addQuickSubtask}){
 return quickTitle?.trim()?addQuickSubtask(false):saveTask();
}

export function applyPlaceDraft(task,value,edited){
 if(!edited)return false;
 const place=String(value||'').trim();if(task.place===place)return false;
 task.place=place;return true;
}
