import assert from 'node:assert/strict';

// Append to the accepted suite. The existing 158 checks are retained verbatim.
export async function runWebIntegrationCases(a){
 const observations=[];
 const before=await a.eval('({state:D4Prototype.repo.state,demo:D4Prototype.repo.demo})');
 const notes='  Native notes after edit\nUnrelated native edit retains time d403-precise-'+
  '2032-05-07T04:34:56.789+05:30/'.repeat(6)+'\n末尾原样保留  ';
 const key='d406-visual-notes';
  await a.eval(`D4Prototype.repo.updateDemo(d=>{d.workItems.push({id:${JSON.stringify(key)},title:'历史时间与工作备注',description:'合成隔离视觉回归',owner:'Work owner',status:'planned',projectId:'project-product',plannedStart:'2032-05-07T04:34:56.789+05:30',dueDate:'2032-05-07T12:30:59.007Z',notes:${JSON.stringify(notes)},attachments:[],history:[],archived:false});});true`);
  for(const [width,height,mobile] of [[360,800,true],[412,915,true],[1440,960,false]]){
   await a.check(`D4-06 original historical notes wrap and remain selectable at ${width}px`,async()=>{
    await a.configure(width,height,mobile);await a.navigate('work-items');await a.click('[data-action=work-reset-filter][data-id=work-items]');
    await a.click(`[data-action=work-work-detail][data-id=${key}]`);
    const layout=await a.eval(`(()=>{const el=document.querySelector('.modal-body > pre'),r=el.getBoundingClientRect(),m=document.querySelector('.modal'),style=getComputedStyle(el);const range=document.createRange();range.selectNodeContents(el);return {text:el.textContent,whiteSpace:style.whiteSpace,userSelect:style.userSelect,client:el.clientWidth,scroll:el.scrollWidth,modalClient:m.clientWidth,modalScroll:m.scrollWidth,rects:[...range.getClientRects()].map(x=>({left:x.left,right:x.right})),left:r.left,right:r.right,viewport:innerWidth};})()`);
    assert.equal(layout.text,notes);assert.equal(layout.whiteSpace,'pre-wrap');assert.notEqual(layout.userSelect,'none');
    assert.ok(layout.scroll<=layout.client+1,JSON.stringify(layout));assert.ok(layout.modalScroll<=layout.modalClient+1,JSON.stringify(layout));
    assert.ok(layout.rects.every(r=>r.left>=layout.left-1&&r.right<=layout.right+1),JSON.stringify(layout));
    observations.push({width,kind:'wrapped-notes',layout});
    const raw=await a.eval(`D4Prototype.getState().workItems.find(w=>w.id==='${key}')`);
    assert.equal(raw.plannedStart,'2032-05-07T04:34:56.789+05:30');assert.equal(raw.dueDate,'2032-05-07T12:30:59.007Z');
    await a.eval("document.querySelector('.modal-body > pre').scrollIntoView({block:'center'});true");
    await a.screenshot(`d406-notes-wrapped-${width}`);await a.click('[data-action=work-close]');
   });
   await a.check(`D4-06 work editor releases focus before removal and keeps note selection at ${width}px`,async()=>{
    await a.click(`[data-action=work-edit-work-item][data-id=${key}]`);
    await a.eval(`(()=>{const field=document.querySelector('[data-form=work-work-item] [name=notes]');window.__d406Blur={seen:false,connected:null};field.addEventListener('blur',()=>{window.__d406Blur={seen:true,connected:field.isConnected};},{once:true});field.focus();return document.activeElement===field;})()`);
    await a.fill('[data-form=work-work-item] [name=notes]',notes);
    // A touch save may leave a textarea focused. Desktop requestSubmit exercises
    // the same keyboard submit route without first moving focus to a button.
    if(mobile)await a.tap('[data-form=work-work-item] button[type=submit]');else await a.submit('[data-form=work-work-item]');
    const focus=await a.eval('window.__d406Blur');observations.push({width,kind:'work-editor-focus-release',focus});assert.equal(focus.seen,true,JSON.stringify(focus));assert.equal(focus.connected,true,JSON.stringify(focus));
    await a.click(`[data-action=work-work-detail][data-id=${key}]`);
    assert.equal(await a.eval('String(getSelection())'),'','Saving must not transfer the editor selection to displayed notes');
    await a.eval("document.querySelector('.modal-body > pre').scrollIntoView({block:'center'});true");
    await a.screenshot(`d406-notes-after-edit-${width}`);
    // Select the actual rendered text. Closing/reopening is the normal lifecycle;
    // neither the application nor this case clears the Selection as a workaround.
    const selection=await a.eval(`(()=>{const el=document.querySelector('.work-note-content');getSelection().setBaseAndExtent(el.firstChild,0,el.lastChild,el.lastChild.textContent.length);return String(getSelection());})()`);
    assert.equal(selection,notes);await a.screenshot(`d406-notes-selection-${width}`);
    await a.click('[data-action=work-close]');
   });
  }
 // Restore only after success; a failure keeps its exact live form/fixture for
 // the harness first-failure screenshot and follow-up read-only diagnostics.
  await a.eval(`D4Prototype.repo.batch(()=>{D4Prototype.repo.replaceState(${JSON.stringify(before.state)});D4Prototype.repo.updateDemo(()=>(${JSON.stringify(before.demo)}));});delete window.__d406Blur;true`);
  await a.configure(1440,960,false);await a.navigate('tasks');
 return observations;
}
