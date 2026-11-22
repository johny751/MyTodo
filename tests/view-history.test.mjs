import test from 'node:test';
import assert from 'node:assert/strict';
import {ViewHistory} from '../src/view-history.mjs';
function harness(){
 let view={page:'task',layer:'board',navOpen:false},listener,position=0,states=[],allow=true;
 const host={addEventListener:(_,fn)=>listener=fn,history:{replaceState(s){states[position]=s;},pushState(s){states=states.slice(0,position+1);states[++position]=s;},go(delta){const next=position+delta;if(next>=0&&next<states.length){position=next;queueMicrotask(()=>listener({state:states[position]}));}},back(){this.go(-1);}}};
 const history=new ViewHistory({host,read:()=>({...view}),key:JSON.stringify,url:v=>'#/'+v.page,beforeApply:async()=>allow,apply:async target=>view={...target}});history.start();
 return {history,host,show(patch){view={...view,...patch};history.record();},get view(){return view;},get position(){return position;},deny(){allow=false;},permit(){allow=true;},async settle(){await new Promise(r=>setTimeout(r,0));}};
}
test('back and forward traverse picker, detail, quadrant, and board',async()=>{const h=harness();for(const layer of ['quadrant','detail','picker'])h.show({layer});for(const layer of ['detail','quadrant','board']){assert.equal(h.history.back(),true);await h.settle();assert.equal(h.view.layer,layer);}assert.equal(h.history.back(),false);h.host.history.go(1);await h.settle();assert.equal(h.view.layer,'quadrant');h.host.history.go(1);await h.settle();assert.equal(h.view.layer,'detail');});
test('closing a detail consumes its history entry without reopening it on Back',async()=>{const h=harness();h.show({layer:'quadrant'});h.show({layer:'detail'});h.show({layer:'quadrant'});await h.settle();assert.equal(h.position,1);h.history.back();await h.settle();assert.equal(h.view.layer,'board');});
test('failed save restores the browser position and keeps the editor',async()=>{const h=harness();h.show({layer:'detail'});h.deny();h.history.back();await h.settle();assert.equal(h.view.layer,'detail');assert.equal(h.position,1);assert.equal(h.history.busy,false);h.permit();h.history.back();await h.settle();assert.equal(h.view.layer,'board');});
test('choosing a destination replaces the open navigation menu',async()=>{const h=harness();h.show({navOpen:true});h.show({navOpen:false,page:'note'});assert.equal(h.position,1);h.history.back();await h.settle();assert.deepEqual(h.view,{page:'task',layer:'board',navOpen:false});});
test('repeated Back is absorbed while a save is pending',async()=>{const h=harness();h.show({layer:'detail'});let release;h.history.beforeApply=()=>new Promise(r=>release=r);h.history.back();await h.settle();assert.equal(h.history.back(),true);assert.equal(h.view.layer,'detail');release(true);await h.settle();assert.equal(h.view.layer,'board');assert.equal(h.history.busy,false);});
