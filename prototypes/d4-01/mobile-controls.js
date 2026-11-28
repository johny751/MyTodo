(function(){
 'use strict';
 let ctx,gesture,ghost,frame,suppressUntil=0,suppressTaskId='',suppressTarget;
 const editable=el=>el?.closest('input,textarea,select,[contenteditable=true]');
 // The content activation band is independent of Android's small, bounded
 // system-gesture exclusion rectangle. The extra 48..64px is ordinary content.
 const navigationEdge=64;
 function horizontalOwner(el){for(let node=el;node&&node!==document.body;node=node.parentElement){const css=getComputedStyle(node);if(/^(auto|scroll)$/.test(css.overflowX)&&node.scrollWidth>node.clientWidth+2)return true;}return false;}
 const clickTarget=el=>el?.closest('button,a,[data-action]')||el;
 // Match the frozen task gesture contract: only this task's trailing click is
 // suppressed. A close or navigation button remains usable immediately.
 function suppressClick(g,duration){suppressUntil=Date.now()+duration;suppressTaskId=g?.id||'';suppressTarget=clickTarget(g?.target);}
 function nav(open){const shell=document.querySelector('.app-shell'),wasOpen=!!shell?.classList.contains('nav-open');shell?.classList.toggle('nav-open',open);document.querySelector('.nav-shade')?.setAttribute('aria-hidden',String(!open));
  // The drawer covers the page's editing controls. End only the native text
  // toolbar owned by that page, without scripted focus, selection or draft changes.
  if(shell&&open&&!wasOpen)window.GxD4Preview?.navigationDrawerOpened?.();
 }
 function clear(){const hadGesture=!!gesture;clearTimeout(gesture?.timer);cancelAnimationFrame(frame);ghost?.remove();ghost=null;document.querySelectorAll('.dragging,.drop-target,.swiping').forEach(el=>{el.classList.remove('dragging','drop-target','swiping');el.style.removeProperty('--swipe-x');el.querySelector('.swipe-feedback')?.remove();});gesture=null;if(hadGesture)queueMicrotask(()=>ctx?.onGestureEnd?.());}
 function hit(x,y){const g=gesture;if(!g?.active)return;g.x=x;g.y=y;ghost.style.left=Math.min(innerWidth-180,Math.max(8,x+10))+'px';ghost.style.top=(y+10)+'px';const zone=document.elementsFromPoint(x,y).map(el=>el.closest(g.subtask?'[data-subtask-list]':'[data-quadrant]')).find(el=>el&&(!g.subtask||el.dataset.subtaskList===g.parentId));document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));g.zone=zone;if(zone)zone.classList.add('drop-target');}
 function scroll(){if(!gesture?.active)return;const g=gesture,list=g.subtask?g.zone:g.zone?.querySelector('.quadrant-list');if(list){const r=list.getBoundingClientRect(),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);if(g.y<top+42)list.scrollTop-=10;else if(g.y>bottom-42)list.scrollTop+=10;}else{const main=g.row.closest('.modal-body')||document.querySelector('main');if(g.y<100)main.scrollTop-=10;else if(g.y>innerHeight-75)main.scrollTop+=10;}hit(g.x,g.y);frame=requestAnimationFrame(scroll);}
 function activate(){const g=gesture;if(!g||g.edge||g.drawer||!g.row||!g.row.isConnected)return;g.active=true;g.row.classList.add('dragging');ghost=document.createElement('div');ghost.className='drag-ghost';ghost.textContent=g.row.querySelector('.task-title')?.textContent||'移动任务';document.body.append(ghost);hit(g.x,g.y);frame=requestAnimationFrame(scroll);if(navigator.vibrate)navigator.vibrate(25);}
 function start(target,x,y,touch,inputStamp){clear();if(!ctx||editable(target))return;const drawer=!!document.querySelector('.app-shell.nav-open'),modal=!!document.querySelector('#modal-root .modal,dialog[open]'),row=target.closest('.board .task-row,[data-subtask-list] .task-row');if(!drawer&&horizontalOwner(target))return;const edge=touch&&x>=0&&x<=navigationEdge&&!drawer&&!modal&&(x<=22||!target.closest('button:not(.task-title),a,summary,input,select,textarea,[role=slider]'));if(!drawer&&!edge&&target.closest('button:not(.task-title):not(.drag-handle),a,summary')&&!target.closest('.drag-handle'))return;const list=row?.closest('[data-subtask-list]');gesture={target,startX:x,startY:y,x,y,started:performance.now(),inputStarted:Number.isFinite(inputStamp)&&inputStamp>=0?inputStamp:null,edge,drawer,touch,row,id:row?.dataset.taskId,subtask:!!list,parentId:list?.dataset.subtaskList,active:false,swipe:false};if(row&&!gesture.edge&&!drawer){if(target.closest('.drag-handle'))activate();else gesture.timer=setTimeout(activate,ctx.settings().longPressMs||3000);}}
 function move(x,y,event){const g=gesture;if(!g)return;const dx=x-g.startX,dy=y-g.startY;g.x=x;g.y=y;
  if(g.edge||g.drawer){if(Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)){clear();return;}if((g.edge?dx>18:dx< -18)&&Math.abs(dx)>Math.abs(dy)*1.6&&event.cancelable)event.preventDefault();return;}
  if(!g.active&&g.row){if(!g.swipe&&Math.hypot(dx,dy)<9)return;if(!g.swipe&&Math.abs(dy)>Math.abs(dx)*.85){clear();return;}clearTimeout(g.timer);const prefs=ctx.settings(),enabled=dx<0?prefs.swipeMenu:prefs.swipeComplete;if(!enabled){suppressClick(g,400);clear();return;}if(!g.swipe&&Math.abs(dx)<18)return;g.swipe=true;if(event.cancelable)event.preventDefault();g.row.classList.add('swiping');g.row.style.setProperty('--swipe-x',Math.max(-100,Math.min(100,dx))+'px');let feedback=g.row.querySelector('.swipe-feedback');if(!feedback){feedback=document.createElement('span');feedback.className='swipe-feedback';g.row.append(feedback);}feedback.textContent=dx>0?(dx>=80?'松开完成':'右滑完成'):(dx<=-80?'松开显示菜单':'左滑菜单');return;}
  if(g.active){if(event.cancelable)event.preventDefault();hit(x,y);}
 }
 // Input timestamps measure the gesture even when rendering delays event handlers.
 // Invalid or backward stamps fall back to the monotonic handler clock.
 function end(x,y,inputStamp){const g=gesture;if(!g)return;if(Number.isFinite(x)&&Number.isFinite(y)){g.x=x;g.y=y;}const dx=g.x-g.startX,dy=g.y-g.startY;if(g.edge||g.drawer){const distance=g.edge?dx:-dx,elapsed=Math.max(1,g.inputStarted!==null&&Number.isFinite(inputStamp)&&inputStamp>=g.inputStarted?inputStamp-g.inputStarted:performance.now()-g.started),accepted=(distance>=55||(distance>=32&&distance/elapsed>=.45))&&Math.abs(dx)>Math.abs(dy)*1.6;clear();if(accepted){nav(g.edge);suppressClick(g,400);}return;}
  if(g.active){hit(g.x,g.y);suppressClick(g,500);const q=g.subtask?ctx.quadrant(g.id):g.zone?.dataset.quadrant;if(g.zone&&q!==undefined){const rows=[...g.zone.querySelectorAll('.task-row')].filter(el=>el.dataset.taskId!==g.id),before=rows.find(el=>{const r=el.getBoundingClientRect();return g.y<r.top+r.height/2;})?.dataset.taskId||null;clear();try{ctx.move(g.id,Number(q),before);ctx.toast('已保存任务顺序与象限');}catch(e){ctx.toast(e.message);}return;}}
  const swipe=g.swipe,prefs=ctx.settings();clear();if(swipe){suppressClick(g,500);if(dx>=80&&prefs.swipeComplete)ctx.complete(g.id);else if(dx<=-80&&prefs.swipeMenu)ctx.menu(g.id);}
 }
 document.addEventListener('touchstart',e=>{if(e.touches.length!==1)return clear();const p=e.touches[0];start(e.target,p.clientX,p.clientY,true,e.timeStamp);},{passive:true});
 document.addEventListener('touchmove',e=>{if(e.touches.length!==1)return clear();const p=e.touches[0];move(p.clientX,p.clientY,e);},{passive:false});
 document.addEventListener('touchend',e=>{if(e.touches.length)return clear();const p=e.changedTouches[0];end(p?.clientX,p?.clientY,e.timeStamp);});document.addEventListener('touchcancel',clear);
 // The target Chromium/WebView uses Pointer Events for mouse and pen. Touch
 // stays on its cancelable TouchEvent path; its compatibility mouse events
 // must never start a second drag or reorder after the touch has committed.
 document.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'&&e.button===0)start(e.target,e.clientX,e.clientY,false,e.timeStamp);});
 document.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'&&gesture&&!gesture.touch)move(e.clientX,e.clientY,e);},{passive:false});
 document.addEventListener('pointerup',e=>{if(e.pointerType!=='touch'&&gesture&&!gesture.touch)end(e.clientX,e.clientY,e.timeStamp);});
 document.addEventListener('pointercancel',e=>{if(e.pointerType!=='touch'&&gesture&&!gesture.touch)clear();});
 document.addEventListener('click',e=>{const sameTarget=suppressTaskId?e.target.closest('.task-row')?.dataset.taskId===suppressTaskId:!!suppressTarget&&clickTarget(e.target)===suppressTarget;if(Date.now()<suppressUntil&&sameTarget){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&gesture){suppressClick(gesture,400);clear();ctx?.toast('已取消拖动');e.preventDefault();e.stopImmediatePropagation();return;}if(e.key==='Escape'&&document.querySelector('.app-shell.nav-open')){nav(false);e.preventDefault();e.stopImmediatePropagation();return;}if(e.target.closest('.drag-handle')&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();ctx?.order(e.target.closest('.task-row').dataset.taskId,e.key==='ArrowUp'?-1:1);}},{capture:true});
 window.addEventListener('blur',clear);
 document.addEventListener('dragstart',e=>{if(e.target.closest('.task-row'))e.preventDefault();});
 document.addEventListener('contextmenu',e=>{if(e.target.closest('.task-row'))e.preventDefault();});
 window.addEventListener('gx-back',()=>{if(gesture){clear();return;}if(document.querySelector('.app-shell.nav-open'))nav(false);else ctx?.back();});
 window.DemoMobileControls={install(context){ctx=context;},navigationContract:Object.freeze({edgeCssPixels:navigationEdge,longDistance:55,quickDistance:32,quickVelocity:.45,directionRatio:1.6}),nav,cancel:clear,isInteracting(){return !!gesture;},back(){if(gesture){clear();return true;}if(document.querySelector('.app-shell.nav-open')){nav(false);return true;}return false;}};
}());
