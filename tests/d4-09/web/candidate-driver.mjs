// D409-only CDP adapter, derived from the frozen D408 browser runner.
// Browser execution belongs to GitHub Actions; do not import this on the host.
import assert from 'node:assert/strict';
import {writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

export function createDriver({evaluate, cmd, trace, result, write, out, sha, spec, pause, variant}) {
  const log = value => { result.observations.push(value); write(); };
  const a = {
    eval: evaluate, cmd, variant, observe: log,
    async fixture(name, expression) {
      trace({case: spec.id, kind: 'synthetic-fixture', name, expression});
      const value = await evaluate(expression);
      log({fixture: name, value});
      await a.settle();
      return value;
    },
    async until(expression, message = 'condition', timeout = 5000) {
      const begin = performance.now();
      while (performance.now() - begin < timeout) {
        if (await evaluate(expression)) return;
        await pause(40);
      }
      throw Error('Timed out: ' + message);
    },
    async settle() {
      await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');
      await a.until('!window.DemoPersonalPages?.isBusy?.()&&!window.DemoWorkPages?.isBusy?.()&&!window.D408V2Candidate?.isBusy?.()', 'async UI settled');
      await evaluate('Promise.race([Promise.all((document.querySelector(".app-shell")?.getAnimations({subtree:true})||[]).map(a=>a.finished.catch(()=>{}))),new Promise((_,reject)=>setTimeout(()=>reject(Error("UI animation deadline")),2000))]).then(()=>true)');
    },
    async configureRaw(width = 1440, height = 960, mobile = false) {
      trace({case: spec.id, kind: 'viewport', width, height, mobile, settled: false});
      await cmd('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile});
      await cmd('Emulation.setTouchEmulationEnabled', {enabled: mobile, maxTouchPoints: 2});
    },
    async configure(width = 1440, height = 960, mobile = false) {
      await a.configureRaw(width, height, mobile);
      if (await evaluate('!!window.D4Prototype')) await a.settle();
    },
    async reload() {
      await cmd('Page.reload');
      await a.until('!!window.D4Prototype', 'reload ready', 15000);
      await a.settle();
    },
    async hit(selector, {scroll = true} = {}) {
      const hit = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return {ok:false,reason:'missing'};if(${scroll})e.scrollIntoView({block:'center',inline:'nearest'});const r=e.getBoundingClientRect(),s=getComputedStyle(e),points=[];for(const xr of [.5,.9,.1])for(const yr of [.5,.9,.1]){const x=r.left+r.width*xr,y=r.top+r.height*yr,h=document.elementFromPoint(x,y),ok=!!h&&(e===h||e.contains(h));points.push({x,y,ok,hit:h?{tag:h.tagName,id:h.id,className:String(h.className),action:h.dataset?.action}:null});}return {ok:!e.disabled&&r.width>0&&r.height>0&&points.some(p=>p.ok),disabled:!!e.disabled,rect:{x:r.x,y:r.y,width:r.width,height:r.height},style:{visibility:s.visibility,pointerEvents:s.pointerEvents,display:s.display},points};})()`);
      trace({case: spec.id, kind: 'hit-test', selector, ...hit});
      return hit;
    },
    async click(selector) {
      const hit = await a.hit(selector);
      assert.equal(hit.ok, true, 'Missing, disabled or obscured control: ' + selector + ' ' + JSON.stringify(hit));
      const {x, y} = hit.points.find(p => p.ok);
      trace({case: spec.id, kind: 'mouse', selector, x, y});
      await cmd('Input.dispatchMouseEvent', {type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1});
      await cmd('Input.dispatchMouseEvent', {type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1});
      await a.settle();
    },
    async fill(selector, value) {
      // Selects and date/number fields use DOM value + native bubbling events.
      // Keyboard-specific cases use text()/key() instead; reports distinguish both.
      await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing/disabled field');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
      trace({case: spec.id, kind: 'field-input', selector, value});
      await a.settle();
    },
    async text(selector, text) {
      if (selector) await a.click(selector);
      trace({case: spec.id, kind: 'insert-text', selector, text});
      await cmd('Input.insertText', {text});
      await a.settle();
    },
    async key(selector, key, modifiers = 0) {
      if (selector) await a.click(selector);
      const codes = {Enter: 13, Escape: 27, Tab: 9, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, Backspace: 8, Delete: 46, ' ': 32};
      const virtual = codes[key] || (/^[a-z]$/i.test(key) ? key.toUpperCase().charCodeAt(0) : 0);
      if (!virtual) throw Error('Unsupported CDP test key: ' + key);
      const code = /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : key === ' ' ? 'Space' : key;
      trace({case: spec.id, kind: 'key', selector, key, code, modifiers});
      await cmd('Input.dispatchKeyEvent', {type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual, ...(key === 'Enter' && !(modifiers & 6) ? {text: '\r', unmodifiedText: '\r'} : {})});
      await cmd('Input.dispatchKeyEvent', {type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual});
      await a.settle();
    },
    async submit(selector) { await a.click(selector + ' button[type=submit]'); },
    async navigate(route) {
      if (await evaluate('innerWidth<=650&&!document.querySelector(".app-shell").classList.contains("nav-open")')) await a.click('[data-action="nav-toggle"]');
      await a.click('nav [data-action="go"][data-id="' + route + '"]');
      await a.until('D4Prototype.getRoute()===' + JSON.stringify(route), 'route ' + route);
    },
    async visible(selector) {
      return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';})()`);
    },
    async box(selector) {
      return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing geometry '+${JSON.stringify(selector)});const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,overflowX:s.overflowX,overflowY:s.overflowY,whiteSpace:s.whiteSpace,wordBreak:s.wordBreak,overflowWrap:s.overflowWrap,userSelect:s.userSelect,lineClamp:s.webkitLineClamp};})()`);
    },
    async noOverflow(label) {
      const data = await evaluate(`(()=>{const selectors=['html','body','.workspace','main', '.modal', '[data-d409-work-layout]','[data-d409-work-preview]','[data-v2-candidate]'];return {width:innerWidth,nodes:selectors.flatMap(selector=>[...document.querySelectorAll(selector)].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {selector,width:r.width,left:r.left,right:r.right,clientWidth:e.clientWidth,scrollWidth:e.scrollWidth};}))};})()`);
      log({overflow: label, ...data});
      for (const n of data.nodes) {
        assert.ok(n.scrollWidth <= n.clientWidth + 2, label + ' horizontal overflow: ' + JSON.stringify(n));
        assert.ok(n.left >= -2 && n.right <= data.width + 2, label + ' outside viewport: ' + JSON.stringify(n));
      }
    },
    async stores() {
      const data = await evaluate('({mainKey:D4Prototype.storageKey,main:localStorage.getItem(D4Prototype.storageKey),v2Key:window.D408V2Candidate?.storageKey||"mytodo-d408-v2-isolated-v1",v2:localStorage.getItem(window.D408V2Candidate?.storageKey||"mytodo-d408-v2-isolated-v1")})');
      return {...data, mainSha256: data.main === null ? null : sha(data.main), v2Sha256: data.v2 === null ? null : sha(data.v2)};
    },
    async screenshot(label) {
      if (!/^[a-zA-Z0-9-]+$/.test(label)) throw Error('Unsafe screenshot label');
      await evaluate('document.fonts.ready.then(()=>true)');
      const geometry = await evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollX,scrollY,mainScrollTop:document.querySelector("main")?.scrollTop,route:D4Prototype.getRoute(),modal:!!document.querySelector(".modal")})');
      const r = await cmd('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
      const bytes = Buffer.from(r.data, 'base64'), file = 'screenshots/' + spec.id + '-' + label + '.png';
      assert.equal(bytes.toString('ascii', 1, 4), 'PNG');
      writeFileSync(join(out, file), bytes);
      log({screenshot: file, sha256: sha(bytes), bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), geometry, preview: 'Derived thumbnail by collector; original retained; no inline base64'});
    },
    async snapshot(label) {
      const data = await evaluate(`(async()=>{const active=document.activeElement,selection=getSelection(),digest=async file=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');return {route:D4Prototype.getRoute(),build:window.D4_BUILD,core:D4Prototype.repo.state,demo:D4Prototype.repo.demo,persistence:D4Prototype.repo.persistence(),v2Candidate:window.D408V2Candidate?.snapshot?.(),forms:await Promise.all([...document.querySelectorAll('form[data-form],form[data-v2-form]')].map(async f=>({name:f.dataset.form||f.dataset.v2Form,taskId:f.dataset.taskId,dirty:f.dataset.dirty,baseline:f.dataset.baseline,taskBase:f.dataset.taskBase,memoryOnly:f.dataset.memoryOnly,fields:await Promise.all([...f.elements].filter(e=>e.name).map(async e=>({name:e.name,type:e.type,value:e.type==='file'?undefined:e.value,checked:e.checked,files:e.type==='file'?await Promise.all([...e.files].map(async x=>({name:x.name,size:x.size,type:x.type,sha256:await digest(x)}))):undefined})))}))),focus:{tag:active?.tagName,name:active?.name,id:active?.id,action:active?.dataset?.action,start:active?.selectionStart,end:active?.selectionEnd,direction:active?.selectionDirection},selection:{text:String(selection||''),rangeCount:selection?.rangeCount||0},scroll:{x:scrollX,y:scrollY,main:document.querySelector('main')?.scrollTop,quadrants:[...document.querySelectorAll('.quadrant-list')].map(e=>({quadrant:e.closest('[data-quadrant]')?.dataset.quadrant,top:e.scrollTop,left:e.scrollLeft}))},preview:[...document.querySelectorAll('[data-d409-work-preview]')].map(e=>({id:e.dataset.previewId,visible:!!e.getBoundingClientRect().width,text:e.textContent})),toast:document.querySelector('#toast')?.textContent};})()`);
      data.stores = await a.stores();
      const file = 'snapshots/' + spec.id + '-' + label + '.json';
      writeFileSync(join(out, file), JSON.stringify(data, null, 2) + '\n');
      log({snapshot: file, sha256: sha(readFileSync(join(out, file)))});
      return data;
    }
  };
  return a;
}
