import assert from 'node:assert/strict';

const opened=a=>a.eval('document.querySelector(".app-shell").classList.contains("nav-open")');
async function blank(a,x=32){
 return a.eval(`(()=>{for(let y=90;y<innerHeight-60;y+=16){const e=document.elementFromPoint(${x},y);if(e?.closest('main')&&!e.closest('input,textarea,select,button,a,summary,.task-row,.table-wrap,[contenteditable]'))return [${x},y];}throw Error('No eligible visible page start at x='+${x});})()`);
}
async function close(a){await a.key(null,'Escape');assert.equal(await opened(a),false);}
export const navigationCases=[
 {id:'N1',name:'All primary routes open navigation from a reasonable 32px start at 360 and 412 widths',async run(a){
  const failures=[];
  for(const width of [360,412]){
   await a.configure(width,915,true);
   for(const route of ['tasks','notes','pomodoro','feedback','analytics','dashboard','work-items','projects','templates','processes','contacts','archive','settings']){
    await a.navigate(route);const point=await blank(a),before=await a.eval('JSON.stringify(D4Prototype.repo.state)');await a.swipe(point,[point[0]+115,point[1]+3]);const open=await opened(a);a.observe({width,route,point,open});if(!open)failures.push(width+':'+route);assert.equal(await a.eval('D4Prototype.getRoute()'),route);assert.equal(await a.eval('JSON.stringify(D4Prototype.repo.state)'),before);if(open)await close(a);
   }
   await a.screenshot('routes-'+width);
  }
  assert.deepEqual(failures,[],'Reasonable edge must work on every primary route');
 }},
 {id:'N2',name:'Navigation distinguishes slow distance, fast intent, vertical motion and out-of-region gestures',async run(a){
  await a.configure(412,915,true);await a.navigate('notes');let p=await blank(a,16);
  await a.swipe(p,[p[0]+80,p[1]+2],{duration:450});assert.equal(await opened(a),true);await close(a);
  p=await blank(a,32);await a.swipe(p,[p[0]+42,p[1]],{duration:45});assert.equal(await opened(a),true,'Short fast horizontal intent should open');await close(a);
  for(const attempt of [{x:16,dx:18,dy:0,duration:500},{x:16,dx:8,dy:100,duration:260},{x:16,dx:-10,dy:0,duration:260},{x:16,dx:60,dy:55,duration:260},{x:100,dx:100,dy:0,duration:260}]){p=await blank(a,attempt.x);await a.swipe(p,[p[0]+attempt.dx,p[1]+attempt.dy],attempt);assert.equal(await opened(a),false,JSON.stringify(attempt));}
 }},
 {id:'N3',name:'Drawer swipe, shade, Escape and candidate Back close once while route remains intact',async run(a){
  await a.configure(412,915,true);await a.navigate('notes');await a.click('[data-action="nav-toggle"]');await a.swipe([230,100],[140,100]);assert.equal(await opened(a),false);
  await a.click('[data-action="nav-toggle"]');await a.click('.nav-shade');assert.equal(await opened(a),false);await a.click('[data-action="nav-toggle"]');await close(a);
  await a.click('[data-action="nav-toggle"]');await a.eval('window.dispatchEvent(new Event("gx-back"))');await a.settle();assert.equal(await opened(a),false);assert.equal(await a.eval('D4Prototype.getRoute()'),'notes');await a.eval('window.dispatchEvent(new Event("gx-back"))');await a.settle();assert.equal(await a.eval('D4Prototype.getRoute()'),'tasks');
  await a.click('[data-action="nav-toggle"]');await a.click('nav [data-action="go"][data-id="feedback"]');assert.equal(await a.eval('D4Prototype.getRoute()'),'feedback');assert.equal(await opened(a),false);
 }},
 {id:'N4',name:'Editing controls and horizontal scroll keep their gesture and unsaved contents',async run(a){
  await a.configure(412,915,true);await a.navigate('notes');await a.click('[data-action="personal-note-new"]');await a.fill('[data-form="personal-note"] [name=body]','未保存便签草稿');const point=await a.eval(`(()=>{const e=document.querySelector('[data-form=personal-note] textarea');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.left+Math.min(15,r.width/3),r.top+r.height/2];})()`);await a.swipe(point,[point[0]+100,point[1]]);assert.equal(await opened(a),false);assert.equal(await a.eval('document.querySelector("[data-form=personal-note] textarea").value'),'未保存便签草稿');await a.click('[data-action="personal-close"]');
  // This fixed, visibly scrollable fixture tests arbitration only; real editor above tests product controls.
  await a.eval(`(()=>{const host=document.createElement('div');host.dataset.d408Horizontal='true';host.style.cssText='position:fixed;left:0;top:300px;width:200px;height:100px;overflow-x:auto;touch-action:pan-x;z-index:30;background:white';const child=document.createElement('div');child.style.cssText='width:700px;height:80px;background:linear-gradient(to right,#eee,#247)';child.textContent='synthetic horizontal scroll fixture';host.append(child);document.body.append(host);host.scrollLeft=200;return true;})()`);const before=await a.eval('document.querySelector("[data-d408-horizontal]").scrollLeft');await a.swipe([16,340],[126,340],{duration:400});assert.equal(await opened(a),false,'A scrollable content container must retain its horizontal gesture');assert.ok(await a.eval('document.querySelector("[data-d408-horizontal]").scrollLeft')<before,'Real scrollLeft changes');await a.screenshot('horizontal-scroll');
 }},
 {id:'N5',name:'Canceled and multi-touch edge gestures leave no active state and do not complete tasks',async run(a){
  await a.configure(412,915,true);await a.navigate('tasks');const before=await a.eval('JSON.stringify(D4Prototype.repo.state)');let p=await blank(a,16);await a.swipe(p,[p[0]+100,p[1]],{cancel:true});assert.equal(await opened(a),false);assert.equal(await a.eval('DemoMobileControls.isInteracting()'),false);p=await blank(a,16);await a.swipe(p,[p[0]+100,p[1]],{multi:true});assert.equal(await opened(a),false);assert.equal(await a.eval('DemoMobileControls.isInteracting()'),false);assert.equal(await a.eval('JSON.stringify(D4Prototype.repo.state)'),before);p=await blank(a,16);await a.swipe(p,[p[0]+100,p[1]]);assert.equal(await opened(a),true);await close(a);assert.equal(await a.eval('JSON.stringify(D4Prototype.repo.state)'),before);
 }}
];
