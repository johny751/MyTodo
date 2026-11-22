// Every descendant uses the same task fields; arrays contain only direct children.
export function* taskEntries(tasks){
 const stack=tasks.map(task=>({task,siblings:tasks,parent:null,ancestors:[]})).reverse();
 while(stack.length){const entry=stack.pop();yield entry;const children=entry.task.subtasks||[];for(let i=children.length-1;i>=0;i--)stack.push({task:children[i],siblings:children,parent:entry.task,ancestors:[...entry.ancestors,entry.task]});}
}
export const flattenTasks=tasks=>[...taskEntries(tasks)].map(e=>e.task);
export function findTaskEntry(tasks,id){for(const entry of taskEntries(tasks))if(entry.task.id===id)return entry;return null;}
export const findTask=(tasks,id)=>findTaskEntry(tasks,id)?.task;
export function moveSubtask(tasks,parentId,id,beforeId=null){
 const parent=findTask(tasks,parentId);if(!parent)throw new Error('父任务不存在');
 const list=parent.subtasks,from=list.findIndex(t=>t.id===id);if(from<0)throw new Error('子任务不存在');if(beforeId===id)return false;
 const ordered=[...list].sort((a,b)=>a.order-b.order),task=ordered.find(t=>t.id===id),target=ordered.filter(t=>t.id!==id),index=beforeId===null?target.length:target.findIndex(t=>t.id===beforeId);
 if(index<0)throw new Error('排序目标不存在');target.splice(index,0,task);if(ordered.every((t,i)=>t.id===target[i].id))return false;
 target.forEach((t,i)=>t.order=i*1024);parent.subtasks=target;return true;
}
export function rekeyDescendants(task,makeId){let index=0;for(const child of flattenTasks(task.subtasks||[]))child.id=makeId(child,++index);return task;}
