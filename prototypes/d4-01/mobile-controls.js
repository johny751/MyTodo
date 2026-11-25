(function(){
 'use strict';
 let ctx,gesture,ghost,frame,suppressUntil=0;
 const editable=el=>el?.closest('input,textarea,select,[contenteditable=true]');
 function nav(open){document.querySelector('.app-shell')?.classList.toggle('nav-open',open);document.querySelector('.nav-shade')?.setAttribute('aria-hidden',String(!open));}
 function clear(){clearTimeout(gesture?.timer);cancelAnimationFrame(frame);ghost?.remove();ghost=null;document.querySelectorAll('.dragging,.drop-target').forEach(el=>el.classList.remove('dragging','drop-target'));gesture=null;}
 function hit(x,y){const g=gesture;if(!g?.active)return;g.x=x;g.y=y;ghost.style.left=Math.min(innerWidth-180,Math.max(8,x+10))+'px';ghost.style.top=(y+10)+'px';const zone=document.elementsFromPoint(x,y).map(el=>el.closest('[data-quadrant]')).find(Boolean);document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));g.zone=zone;if(zone)zone.classList.add('drop-target');}
 function scroll(){if(!gesture?.active)return;const g=gesture,list=g.zone?.querySelector('.quadrant-list');if(list){const r=list.getBoundingClientRect();if(g.y<r.top+42)list.scrollTop-=10;else if(g.y>r.bottom-42)list.scrollTop+=10;}else{const main=document.querySelector('main');if(g.y<100)main.scrollTop-=10;else if(g.y>innerHeight-75)main.scrollTop+=10;}hit(g.x,g.y);frame=requestAnimationFrame(scroll);}
 function activate(){const g=gesture;if(!g||g.edge||g.drawer||!g.row)return;g.active=true;g.row.classList.add('dragging');ghost=document.createElement('div');ghost.className='drag-ghost';ghost.textContent=g.row.querySelector('.task-title')?.textContent||'移动任务';document.body.append(ghost);hit(g.x,g.y);frame=requestAnimationFrame(scroll);if(navigator.vibrate)navigator.vibrate(25);}
 function start(target,x,y,touch){clear();if(editable(target))return;const drawer=!!document.querySelector('.app-shell.nav-open');const row=target.closest('.board .task-row');if(target.closest('.task-check,.task-row-menu,.drag-handle')&&!target.closest('.drag-handle'))return;gesture={startX:x,startY:y,x,y,edge:touch&&x<=22&&!drawer,drawer,touch,row,id:row?.dataset.taskId,active:false};if(row&&!gesture.edge&&!drawer)gesture.timer=setTimeout(activate,touch?(ctx.settings().longPressMs||3000):200);}
 function move(x,y,event){const g=gesture;if(!g)return;const dx=x-g.startX,dy=y-g.startY;g.x=x;g.y=y;
  if(g.edge){if(Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)){clear();return;}if(dx>55&&dx>Math.abs(dy)*1.6){event.preventDefault();nav(true);suppressUntil=Date.now()+400;clear();}return;}
  if(g.drawer){if(dx< -55&&-dx>Math.abs(dy)*1.6){event.preventDefault();nav(false);suppressUntil=Date.now()+400;clear();}return;}
  if(!g.active&&g.row){if(g.touch&&Math.abs(dx)>14&&Math.abs(dx)>Math.abs(dy)*1.6){clearTimeout(g.timer);event.preventDefault();if(Math.abs(dx)>90){const prefs=ctx.settings();if(dx>0&&prefs.swipeMenu)ctx.menu(g.id);else if(dx<0&&prefs.swipeComplete)ctx.complete(g.id);suppressUntil=Date.now()+500;clear();}return;}if(g.touch&&Math.abs(dy)>14){clear();return;}if(!g.touch&&Math.hypot(dx,dy)>6)activate();}
  if(g.active){event.preventDefault();hit(x,y);}
 }
 function end(){const g=gesture;if(g?.active){suppressUntil=Date.now()+500;const q=g.zone?.dataset.quadrant;if(q!==undefined){const rows=[...g.zone.querySelectorAll('.task-row')].filter(el=>el.dataset.taskId!==g.id);const before=rows.find(el=>{const r=el.getBoundingClientRect();return g.y<r.top+r.height/2;})?.dataset.taskId||null;try{ctx.move(g.id,Number(q),before);ctx.toast('已保存任务顺序与象限');}catch(e){ctx.toast(e.message);}}}clear();}
 document.addEventListener('touchstart',e=>{if(e.touches.length!==1)return clear();const p=e.touches[0];start(e.target,p.clientX,p.clientY,true);},{passive:true});
 document.addEventListener('touchmove',e=>{if(e.touches.length!==1)return clear();const p=e.touches[0];move(p.clientX,p.clientY,e);},{passive:false});
 document.addEventListener('touchend',end);document.addEventListener('touchcancel',clear);
 document.addEventListener('mousedown',e=>{if(e.button===0)start(e.target,e.clientX,e.clientY,false);});document.addEventListener('mousemove',e=>{if(gesture&&!gesture.touch)move(e.clientX,e.clientY,e);});document.addEventListener('mouseup',()=>{if(gesture&&!gesture.touch)end();});
 document.addEventListener('click',e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('.app-shell.nav-open')){nav(false);e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 window.addEventListener('gx-back',()=>{if(document.querySelector('.app-shell.nav-open'))nav(false);else ctx?.back();});
 window.DemoMobileControls={install(context){ctx=context;},nav,back(){if(document.querySelector('.app-shell.nav-open')){nav(false);return true;}return false;}};
}());
