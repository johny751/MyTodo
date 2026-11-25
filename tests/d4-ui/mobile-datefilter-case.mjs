import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';

const form='[data-form="work-filter"]';
const partNames=['month','day','year'];
const errorRecord=error=>({name:error?.name,message:String(error?.message||error),stack:error?.stack});
const rectIn=(rect,box,tolerance=.5)=>rect.width>0&&rect.height>0&&rect.left>=box.left-tolerance&&rect.top>=box.top-tolerance&&rect.right<=box.right+tolerance&&rect.bottom<=box.bottom+tolerance;

// Read the browser's actual native date editor, not an outer-width proxy or a
// synthetic text replacement. Missing UA geometry is an evidence failure.
async function nativeDateGeometry(cmd,selector,discovery){
 const {root}=await cmd('DOM.getDocument',{depth:0,pierce:true});
 const {nodeId}=await cmd('DOM.querySelector',{nodeId:root.nodeId,selector});
 assert.ok(nodeId,'The exact native date input exists');
 const {node}=await cmd('DOM.describeNode',{nodeId,depth:-1,pierce:true});
 const uaRoots=(node.shadowRoots||[]).filter(root=>root.shadowRootType==='user-agent');
 discovery.shadowRoots=(node.shadowRoots||[]).map(root=>({nodeName:root.nodeName,shadowRootType:root.shadowRootType,backendNodeId:root.backendNodeId}));discovery.elements=[];
 assert.equal(uaRoots.length,1,'One browser-owned date shadow tree is available');
 const nodes=[];
 function visit(node){
  const attrs=Object.fromEntries(Array.from({length:(node.attributes||[]).length/2},(_,i)=>[node.attributes[i*2],node.attributes[i*2+1]]));
  if(node.nodeType===1)discovery.elements.push({nodeName:node.nodeName,backendNodeId:node.backendNodeId,attributes:attrs});
  if(attrs.pseudo)nodes.push({node,pseudo:attrs.pseudo});
  for(const child of node.children||[])visit(child);
  for(const child of node.shadowRoots||[])visit(child);
 }
 visit(uaRoots[0]);
 async function observe(part){
  const matches=nodes.filter(row=>row.pseudo===part);
  assert.equal(matches.length,1,'One actual native date part: '+part);
  const {object}=await cmd('DOM.resolveNode',{backendNodeId:matches[0].node.backendNodeId});
  assert.ok(object?.objectId,'Native date part can be observed');
  try{
   const result=await cmd('Runtime.callFunctionOn',{objectId:object.objectId,returnByValue:true,functionDeclaration:`function(){
    const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const own=box(this),host=this.getRootNode().host,input=box(host),clip={left:input.left,top:input.top,right:input.right,bottom:input.bottom};
    const ancestors=[];
    for(let p=this;p&&p!==host;p=p.parentElement){const css=getComputedStyle(p),r=box(p),content={left:r.left+p.clientLeft,top:r.top+p.clientTop,right:r.left+p.clientLeft+p.clientWidth,bottom:r.top+p.clientTop+p.clientHeight};ancestors.push({tag:p.tagName,pseudo:p.getAttribute('pseudo'),rect:r,overflowX:css.overflowX,overflowY:css.overflowY,clientWidth:p.clientWidth,scrollWidth:p.scrollWidth});if(/^(auto|scroll|hidden|clip)$/.test(css.overflowX)){clip.left=Math.max(clip.left,content.left);clip.right=Math.min(clip.right,content.right);}if(/^(auto|scroll|hidden|clip)$/.test(css.overflowY)){clip.top=Math.max(clip.top,content.top);clip.bottom=Math.min(clip.bottom,content.bottom);}}
    const range=document.createRange();range.selectNodeContents(this);const text=box(range);range.detach();
    return {rect:own,textRect:text,text:this.textContent,clip,input,ancestors};
   }`});
   assert.equal(result.exceptionDetails,undefined,'Native part geometry read succeeds');
   return result.result.value;
  }finally{await cmd('Runtime.releaseObject',{objectId:object.objectId});}
 }
 const fields={};for(const name of partNames)fields[name]=await observe('-webkit-datetime-edit-'+name+'-field');
 return {selector,parts:fields,wrapper:await observe('-webkit-datetime-edit-fields-wrapper'),picker:await observe('-webkit-calendar-picker-indicator')};
}

function assertCompleteNativeDate(observation,expected){
 const {parts,wrapper,picker}=observation;
 assert.ok(picker.rect.width>0&&picker.rect.height>0,'Calendar affordance remains rendered');
 for(const name of partNames){
  const field=parts[name];
  assert.ok(field.text.trim().length>0,'Native '+name+' part retains text');
  assert.ok(rectIn(field.rect,wrapper.rect),'Native '+name+' field fits within its fields wrapper');
  assert.ok(rectIn(field.rect,field.clip),'Native '+name+' field is not clipped by a date-editor ancestor');
  assert.ok(rectIn(field.textRect,field.rect),'All rendered '+name+' glyphs fit inside their native part');
  assert.ok(rectIn(field.textRect,field.clip),'All rendered '+name+' glyphs fit inside the visible date editor');
  assert.ok(field.textRect.right<=picker.rect.left-.5,'The calendar icon does not cover '+name+' text');
 }
 if(expected){const [year,month,day]=expected.split('-').map(Number);assert.equal(Number(parts.year.text),year);assert.equal(Number(parts.month.text),month);assert.equal(Number(parts.day.text),day);}
}

export async function runMobileDateFilterCase(a,cmd,out,identity){
 await a.check('Phone date filters expose complete native date parts at 360 and 412 pixels',async()=>{
  const receipt={kind:'d403-native-date-editor-browser-geometry',...identity,scope:'Cloud Chromium native date-editor geometry; programmatic date values, no native picker interaction claim',observations:[],cleanup:[]};
  const save=()=>writeFileSync(join(out,'mobile-datefilter-geometry.json'),JSON.stringify(receipt,null,2)+'\n');
  const previousRoute=await a.eval('D4Prototype.getRoute()');let primary;
  try{
   await cmd('DOM.enable');
   for(const width of [360,412])for(const route of ['archive','analytics']){
    await a.configure(width,915,true);await a.navigate(route);await a.eval('document.fonts.ready.then(()=>true)');
    const before=await a.eval(`(()=>{const f=document.querySelector(${JSON.stringify(form)});return {from:f.elements.namedItem('from').value,to:f.elements.namedItem('to').value,dirty:f.getAttribute('data-dirty'),scrollTop:document.querySelector('main').scrollTop};})()`);
    let routeFailure;
    try{
     for(const state of [{name:'empty',from:'',to:''},{name:'populated',from:'2032-05-07',to:'2032-12-31'}]){
      await a.fill(form+' [name="from"]',state.from);await a.fill(form+' [name="to"]',state.to);
      for(const name of ['from','to']){
       const selector=form+' input[type="date"][name="'+name+'"]';
       await a.eval(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'nearest'})`);
       await a.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
       const publicControl=await a.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),f=e.form,r=e.getBoundingClientRect(),v=visualViewport,labels=Array.from(e.labels||[]).map(l=>l.querySelector('span')?.textContent.trim()||''),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,type:e.type,value:e.value,disabled:e.disabled,labels,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},hitMatches:!!hit&&(hit===e||e.contains(hit)),viewportHeight:v?v.height:innerHeight,submitCount:f.querySelectorAll('button[type=submit]').length,resetCount:f.querySelectorAll('[data-action=work-reset-filter]').length,controlNames:Array.from(f.elements).map(x=>x.name).filter(Boolean)};})()`);
       const observation={width,route,state:state.name,name,publicControl};receipt.observations.push(observation);save();
       assert.equal(publicControl.width,width);assert.ok(publicControl.documentWidth<=width,'Phone date filters do not create sideways scrolling');assert.equal(publicControl.type,'date');assert.equal(publicControl.value,state[name]);assert.equal(publicControl.disabled,false);assert.deepEqual(publicControl.labels,[name==='from'?'从日期':'到日期']);assert.equal(publicControl.submitCount,1);assert.equal(publicControl.resetCount,1);assert.ok(publicControl.controlNames.includes('query')&&publicControl.controlNames.includes(route==='archive'?'kind':'projectId'),'Existing non-date filters remain present');assert.ok(publicControl.rect.left>=0&&publicControl.rect.right<=width&&publicControl.rect.top>=0&&publicControl.rect.bottom<=publicControl.viewportHeight,'Scrolled native date field stays wholly within phone viewport');assert.ok(publicControl.hitMatches,'Actual date field remains reachable without an overlay');
       observation.nativeDiscovery={};observation.native=await nativeDateGeometry(cmd,selector,observation.nativeDiscovery);save();assertCompleteNativeDate(observation.native,state[name]);
      }
      await a.eval('document.querySelector("main").scrollTop=0;true');
      await a.screenshot('mobile-datefilter-'+route+'-'+width+'-'+state.name);
     }
    }catch(error){routeFailure=error;throw error;}
    finally{
     try{await a.fill(form+' [name="from"]',before.from);await a.fill(form+' [name="to"]',before.to);const restored=await a.eval(`(()=>{const f=document.querySelector(${JSON.stringify(form)}),original=${JSON.stringify(before)};if(original.dirty===null)f.removeAttribute('data-dirty');else f.setAttribute('data-dirty',original.dirty);document.querySelector('main').scrollTop=original.scrollTop;return {from:f.elements.namedItem('from').value,to:f.elements.namedItem('to').value,dirty:f.getAttribute('data-dirty'),scrollTop:document.querySelector('main').scrollTop};})()`);assert.deepEqual(restored,before,'Restore the original unsaved date-filter values, dirty marker and scroll position');receipt.cleanup.push({width,route,originalDatesRestored:true,originalDirtyAndScrollRestored:true});}
     catch(error){receipt.cleanup.push({width,route,error:errorRecord(error)});if(routeFailure)routeFailure.cleanupError=errorRecord(error);else throw error;}
    }
   }
   receipt.bodyCompleted=true;
  }catch(error){primary=error;receipt.failure=errorRecord(error);throw error;}
  finally{
   try{await a.configure(412,915,true);await a.navigate(previousRoute);receipt.restoredRoute=previousRoute;receipt.restoredViewport={width:412,height:915,mobile:true};}
   catch(error){receipt.finalCleanupError=errorRecord(error);if(primary)primary.cleanupError=errorRecord(error);else{primary=error;throw error;}}
   finally{try{save();}catch(error){if(primary)primary.receiptWriteError=errorRecord(error);else throw error;}}
  }
 });
}
