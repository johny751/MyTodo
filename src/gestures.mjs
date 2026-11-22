// Mouse/pen use Pointer Events; touch uses cancelable touchmove so vertical scrolling stays native.
export function installTaskGestures(root,{settings,enabled=()=>true,kind='board',onMove,onComplete,onMenu,onHint}){
  const rowSelector=kind==='subtask'?'#subtasks .subtask':'.board .task-row';
  let active=null,blockClickUntil=0,blockClickTaskId=null,frame=0;
  const position=event=>({x:event.clientX,y:event.clientY});
  const clearTargets=()=>root.querySelectorAll('.drop-before,.drop-after,.drop-target').forEach(e=>e.classList.remove('drop-before','drop-after','drop-target'));
  function cleanup(){if(!active)return;clearTimeout(active.timer);cancelAnimationFrame(frame);active.row.classList.remove('holding','drag-source','swiping');active.row.style.removeProperty('--swipe-x');active.row.style.removeProperty('--hold-ms');active.row.querySelector('.swipe-feedback')?.remove();active.ghost?.remove();clearTargets();document.body.classList.remove('task-dragging');active=null;}
  function targetAt(x,y){if(kind==='subtask'){const list=document.elementFromPoint(x,y)?.closest('#subtasks');if(!list)return null;const rows=[...list.querySelectorAll('.subtask')].filter(r=>r.dataset.taskId!==active.id),before=rows.find(row=>y<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2);return {quadrant:null,beforeId:before?.dataset.taskId??null,before,list:list.closest('form'),container:list,rows,peek:false};}const quadrant=document.elementFromPoint(x,y)?.closest('.quadrant');if(!quadrant)return null;const list=quadrant.querySelector('.tasks');if(!list)return null;const peek=quadrant.classList.contains('quadrant-peek');const rows=peek?[]:[...list.querySelectorAll('.task-row')].filter(r=>r.dataset.taskId!==active.id);const before=rows.find(row=>y<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2);return {quadrant:Number(quadrant.dataset.quadrant),beforeId:before?.dataset.taskId??null,before,list,container:quadrant,rows,peek};}
  function updateDrop(){if(!active?.drag)return;const {x,y}=active;active.ghost.style.transform='translate('+Math.round(x-active.offsetX)+'px,'+Math.round(y-active.offsetY)+'px)';clearTargets();active.target=targetAt(x,y);const target=active.target;if(target){target.container.classList.add('drop-target');if(target.before)target.before.classList.add('drop-before');else target.rows.at(-1)?.classList.add('drop-after');if(!target.peek){const rect=target.list.getBoundingClientRect();if(y<rect.top+36)target.list.scrollTop-=9;else if(y>rect.bottom-36)target.list.scrollTop+=9;}}frame=requestAnimationFrame(updateDrop);}
  function beginDrag(){if(!active)return;clearTimeout(active.timer);active.drag=true;active.row.classList.remove('holding');active.row.classList.add('drag-source');const rect=active.row.getBoundingClientRect();active.offsetX=Math.min(active.x-rect.left,rect.width-20);active.offsetY=active.y-rect.top;const ghost=active.row.cloneNode(true);ghost.className=active.row.className+' drag-ghost';ghost.classList.remove('drag-source','holding');ghost.removeAttribute('data-task-id');ghost.setAttribute('aria-hidden','true');ghost.querySelectorAll('button').forEach(b=>b.tabIndex=-1);ghost.style.width=rect.width+'px';document.body.append(ghost);active.ghost=ghost;document.body.classList.add('task-dragging');onHint('拖动中，松开保存位置；Esc 取消');updateDrop();}
  function start(target,pointer,touch=false){if(!enabled()||active||target.closest('button:not(.task-open):not(.drag-handle),input,textarea,select,a,summary'))return;const row=target.closest(rowSelector);if(!row)return;const config=settings();active={id:row.dataset.taskId,row,x:pointer.x,y:pointer.y,startX:pointer.x,startY:pointer.y,touch,config,drag:false,swipe:false,target:null};const handle=target.closest('.drag-handle');if(handle){beginDrag();return;}row.classList.add('holding');row.style.setProperty('--hold-ms',config.longPressMs+'ms');active.timer=setTimeout(beginDrag,config.longPressMs);}
  function move(pointer,event){if(!active)return;active.x=pointer.x;active.y=pointer.y;if(active.drag){if(event.cancelable)event.preventDefault();return;}const dx=pointer.x-active.startX,dy=pointer.y-active.startY;if(!active.swipe&&Math.hypot(dx,dy)<9)return;if(!active.swipe&&Math.abs(dy)>Math.abs(dx)*.85){cleanup();return;}clearTimeout(active.timer);active.row.classList.remove('holding');const enabled=dx<0?active.config.swipeMenu:active.config.swipeComplete;if(!enabled){blockClickTaskId=active.id;cleanup();blockClickUntil=Date.now()+400;return;}if(!active.swipe&&Math.abs(dx)<18)return;active.swipe=true;if(event.cancelable)event.preventDefault();active.row.classList.add('swiping');active.row.style.setProperty('--swipe-x',Math.max(-100,Math.min(100,dx))+'px');let feedback=active.row.querySelector('.swipe-feedback');if(!feedback){feedback=document.createElement('span');feedback.className='swipe-feedback';active.row.append(feedback);}feedback.textContent=dx>0?(dx>=80?'松开完成':'右滑完成'):(dx<=-80?'松开显示菜单':'左滑菜单');feedback.classList.toggle('complete-feedback',dx>0);}
  function end(){if(!active)return;const state=active;if(state.drag)state.target=targetAt(state.x,state.y);const dx=state.x-state.startX;const action=state.drag||state.swipe;if(action){blockClickTaskId=state.id;blockClickUntil=Date.now()+600;}cleanup();if(state.drag&&state.target)onMove(state.id,state.target.quadrant,state.target.beforeId);else if(state.swipe&&dx>=80&&state.config.swipeComplete)onComplete(state.id);else if(state.swipe&&dx<=-80&&state.config.swipeMenu)onMenu(state.id);}
  root.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0)return;start(e.target,position(e));});
  window.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'&&active&&!active.touch)move(position(e),e);},{passive:false});
  window.addEventListener('pointerup',e=>{if(e.pointerType!=='touch'&&active&&!active.touch)end();});
  window.addEventListener('pointercancel',e=>{if(e.pointerType!=='touch')cleanup();});
  root.addEventListener('touchstart',e=>{if(e.touches.length!==1){cleanup();return;}start(e.target,position(e.touches[0]),true);},{passive:true});
  window.addEventListener('touchmove',e=>{if(active?.touch&&e.touches.length===1)move(position(e.touches[0]),e);else if(e.touches.length>1)cleanup();},{passive:false});
  window.addEventListener('touchend',()=>{if(active?.touch)end();});
  window.addEventListener('touchcancel',cleanup);
  root.addEventListener('click',e=>{if(Date.now()<blockClickUntil&&e.target.closest(rowSelector)?.dataset.taskId===blockClickTaskId){e.preventDefault();e.stopImmediatePropagation();}},true);
  root.addEventListener('selectstart',e=>{if(e.target.closest(rowSelector))e.preventDefault();});
  root.addEventListener('contextmenu',e=>{if(e.target.closest(rowSelector))e.preventDefault();});
  root.addEventListener('dragstart',e=>{if(e.target.closest(rowSelector))e.preventDefault();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&active){e.preventDefault();e.stopImmediatePropagation();blockClickTaskId=active.id;blockClickUntil=Date.now()+400;cleanup();onHint('已取消拖动');}});
  window.addEventListener('blur',cleanup);
  return {cancel:cleanup};
}

// Android: right opens navigation; vertical board swipes change periods.
// A list owns scrolling for the whole touch
// unless the gesture starts at its edge and moves outwards.
export function installWorkspaceGestures(root,{enabled,onStep,onMenu,onCapture=()=>{}}){
  const host=root.ownerDocument.defaultView;
  let active=null,blockClickUntil=0;
  function cancel(){if(active?.captured)blockClickUntil=Date.now()+500;active=null;}
  function available(){return enabled()&&!root.ownerDocument.body.classList.contains('task-dragging');}
  root.addEventListener('touchstart',event=>{
    cancel();
    if(event.touches.length!==1||!available())return;
    const target=event.target,workspace=target.closest('.workspace'),board=target.closest('.board');
    if(!workspace||!root.contains(workspace)||target.closest('input,textarea,select,a,.drag-handle,button:not(.task-open):not(.quadrant-empty):not(.quadrant-title)'))return;
    const touch=event.touches[0],list=target.closest('.tasks');
    blockClickUntil=0;
    active={workspace,board,list,id:touch.identifier,x:touch.clientX,y:touch.clientY,
      atTop:!list||list.scrollTop<=1,atBottom:!list||list.scrollTop+list.clientHeight>=list.scrollHeight-1,
      scrollTop:list?.scrollTop??0,captured:false,axis:null,direction:0,dx:0,dy:0};
  },{passive:true});
  root.addEventListener('touchmove',event=>{
    if(!active)return;
    if(event.touches.length!==1||!available()||!active.workspace.isConnected){cancel();return;}
    const touch=event.touches[0];
    if(touch.identifier!==active.id){cancel();return;}
    active.dx=touch.clientX-active.x;active.dy=touch.clientY-active.y;
    if(!active.captured){
      if(Math.hypot(active.dx,active.dy)<8)return;
      if(!event.cancelable){cancel();return;}
      if(active.dx>0&&active.dx>=Math.abs(active.dy)*1.5)active.axis='x';
      else if(active.board&&Math.abs(active.dy)>=Math.abs(active.dx)*1.5&&
        (active.dy>0?active.atTop:active.atBottom)&&
        (!active.list||Math.abs(active.list.scrollTop-active.scrollTop)<=1))active.axis='y';
      else{cancel();return;}
      active.captured=true;active.direction=Math.sign(active.dy);onCapture();
    }
    if(event.cancelable)event.preventDefault();
  },{passive:false});
  host.addEventListener('touchend',event=>{
    if(!active)return;
    const state=active;active=null;
    if(!state.captured)return;
    if(event.cancelable)event.preventDefault();
    blockClickUntil=Date.now()+500;
    const touch=Array.from(event.changedTouches).find(t=>t.identifier===state.id);
    if(!touch||event.touches.length||!available()||!state.workspace.isConnected)return;
    const dx=touch.clientX-state.x,dy=touch.clientY-state.y;
    if(state.axis==='x'){if(dx>=72&&dx>=Math.abs(dy)*1.5)onMenu();}
    else if(Math.sign(dy)===state.direction&&Math.abs(dy)>=72&&Math.abs(dy)>=Math.abs(dx)*1.5)onStep(dy<0?1:-1);
  },{passive:false});
  host.addEventListener('touchcancel',cancel);
  host.addEventListener('blur',cancel);
  root.addEventListener('click',event=>{
    if(Date.now()<blockClickUntil&&event.target.closest('.workspace')){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  return {cancel};
}
