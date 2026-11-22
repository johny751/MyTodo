import test from 'node:test';
import assert from 'node:assert/strict';
import {installWorkspaceGestures} from '../src/gestures.mjs';
import {dateRange,shiftDate} from '../src/model.mjs';

function harness({top=0,height=200,total=200,board=true,blocked=false}={}){
  let enabled=true,dragging=false,captures=0,menus=0;
  const steps=[],listeners=new Map(),workspace={isConnected:true},list={scrollTop:top,clientHeight:height,scrollHeight:total};
  const host={addEventListener(type,fn){(listeners.get('host:'+type)||listeners.set('host:'+type,[]).get('host:'+type)).push(fn);}};
  const root={ownerDocument:{defaultView:host,body:{classList:{contains:()=>dragging}}},contains:()=>true,addEventListener(type,fn){(listeners.get('root:'+type)||listeners.set('root:'+type,[]).get('root:'+type)).push(fn);}};
  const target={closest(selector){if(selector==='.workspace')return workspace;if(selector==='.board')return board?workspace:null;if(selector==='.tasks')return list;return blocked?this:null;}};
  const gesture=installWorkspaceGestures(root,{enabled:()=>enabled,onStep:s=>steps.push(s),onMenu:()=>menus++,onCapture:()=>captures++});
  function emit(where,type,x=100,y=100,extra={}){const touch={identifier:1,clientX:x,clientY:y};const event={target,touches:type==='touchend'?[]:[touch],changedTouches:[touch],cancelable:true,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const fn of listeners.get(where+':'+type)||[])fn(event);return event;}
  return {steps,list,workspace,gesture,get menus(){return menus;},get captures(){return captures;},set enabled(v){enabled=v;},set dragging(v){dragging=v;},start:(x=100,y=100,extra)=>emit('root','touchstart',x,y,extra),move:(x,y,extra)=>emit('root','touchmove',x,y,extra),end:(x,y,extra)=>emit('host','touchend',x,y,extra),cancel:()=>emit('host','touchcancel'),click:()=>emit('root','click'),blur:()=>emit('host','blur')};
}

test('empty board swipes change one period only after release, in both directions',()=>{
  const h=harness();h.start(100,200);assert.equal(h.move(102,110).prevented,true);assert.deepEqual(h.steps,[]);h.end(102,100);h.end(102,100);assert.deepEqual(h.steps,[1]);h.start(100,100);h.move(100,190);h.end(100,190);assert.deepEqual(h.steps,[1,-1]);
});
test('list scrolling owns the whole gesture even when it reaches an edge',()=>{
  const h=harness({top:0,height:200,total:1000});h.start(100,200);assert.equal(h.move(100,180).prevented,false);h.list.scrollTop=800;h.move(100,80);h.end(100,60);assert.deepEqual(h.steps,[]);h.start(100,200);h.move(100,110);h.end(100,110);assert.deepEqual(h.steps,[1]);
});
test('downwards gesture switches only when it starts at the top',()=>{
  const h=harness({top:200,height:200,total:1000});h.start();h.move(100,200);h.end(100,200);assert.deepEqual(h.steps,[]);h.list.scrollTop=0;h.start();h.move(100,200);h.end(100,200);assert.deepEqual(h.steps,[-1]);
});
test('right swipe opens the avatar menu and takes over task gestures',()=>{
  const h=harness({top:80,height:200,total:1000});h.start();assert.equal(h.move(200,103).prevented,true);h.end(210,104);assert.equal(h.menus,1);assert.equal(h.captures,1);assert.deepEqual(h.steps,[]);const click=h.click();assert.equal(click.prevented,true);assert.equal(click.stopped,true);h.start();h.end(100,100);assert.equal(h.click().prevented,false);
});
test('other primary pages support the right menu swipe but keep vertical scrolling',()=>{
  const h=harness({board:false});h.start();h.move(100,200);h.end(100,210);assert.deepEqual(h.steps,[]);h.start();h.move(200,100);h.end(200,100);assert.equal(h.menus,1);
});
test('leftward, diagonal, short and reversed gestures do not navigate',()=>{
  for(const points of [[[20,100],[10,100]],[[170,170],[190,190]],[[110,140],[110,160]],[[100,190],[100,0]],[[190,100],[0,100]]]){const h=harness();h.start();h.move(...points[0]);h.end(...points[1]);assert.deepEqual(h.steps,[]);assert.equal(h.menus,0);}
});
test('inputs, drag handles and action buttons are excluded',()=>{
  const h=harness({blocked:true});h.start();h.move(200,100);h.end(200,100);h.start();h.move(100,200);h.end(100,200);assert.equal(h.captures,0);assert.equal(h.menus,0);assert.deepEqual(h.steps,[]);
});
test('multi-touch, cancellation, overlays, dragging and detached views abort navigation',()=>{
  for(const abort of [h=>h.start(100,100,{touches:[{},{}]}),h=>h.cancel(),h=>h.blur(),h=>h.gesture.cancel(),h=>{h.enabled=false;},h=>{h.dragging=true;},h=>{h.workspace.isConnected=false;}]){const h=harness();h.start();h.move(100,190);abort(h);h.end(100,200);assert.deepEqual(h.steps,[]);}
});
test('a non-cancelable or already scrolling touch cannot become period navigation',()=>{
  const h=harness();h.start();assert.equal(h.move(100,190,{cancelable:false}).prevented,false);h.end(100,200);assert.deepEqual(h.steps,[]);h.start();h.list.scrollTop=20;h.move(100,190);h.end(100,200);assert.deepEqual(h.steps,[]);
});
test('period ranges and offsets retain week, year and month-end boundaries',()=>{
  assert.deepEqual(dateRange('2026-12-31','week'),['2026-12-28','2027-01-03']);assert.equal(shiftDate('2026-12-31','week',1),'2027-01-07');assert.equal(shiftDate('2026-01-31','month',1),'2026-02-28');assert.deepEqual(dateRange('2028-02-15','month'),['2028-02-01','2028-02-29']);
});
