import assert from 'node:assert/strict';

// Hosted Actions only. Repository/eval mutations construct explicitly synthetic
// historical fixtures; every behavior under test uses the real page controls.
// DOM input/change and browser pointer events are not Android hardware evidence.
export async function runLegacyCases(api) {
  const env=process.env;
  if(env.GITHUB_ACTIONS!=='true'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')||env.EXPECTED_SOURCE_SHA!==env.GITHUB_SHA||!/^\d+$/.test(env.GITHUB_RUN_ID||'')||!/^\d+$/.test(env.GITHUB_RUN_ATTEMPT||'')) throw Error('Legacy cases require exact hosted Actions identity');
  const read=api.eval, group=type=>({type,name:type==='tag'?'LegacyTag':'LegacyPlace',projectId:''});
  const encoded=value=>encodeURIComponent(JSON.stringify(value));
  const action=(name,value)=>'[data-action="'+name+'"][data-id="'+encoded(value)+'"]';
  const field=name=>'[data-form="legacy-catalog"] [name="'+name+'"]';
  const timeFilter=name=>'[data-form="legacy-timeline-filter"] [name="'+name+'"]';
  const settle=()=>read('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const ids=()=>read('[...document.querySelectorAll("[data-legacy-timeline] [data-task-id]")].map(el=>el.dataset.taskId)');
  const snapshot=()=>read('D4Prototype.repo.state');
  const flatten=state=>{const result=[];function visit(task){result.push(task);task.subtasks.forEach(visit);}state.tasks.forEach(visit);return result;};

  async function reset() {
    await api.configure(1440,960,false);
    await api.navigate('settings');await api.click('[data-action="reset-ask"]');await api.click('[data-action="reset-confirm"]');
    await read('DemoLegacyPages.reset()'); // Synthetic view-fixture reset, not a tested input.
  }
  async function fixture() {
    await read(`(()=>{
      const repo=D4Prototype.repo,today=DemoDomain.helpers.dayKey(),previous=DemoDomain.helpers.shiftDate(today,'day',-1),next=DemoDomain.helpers.shiftDate(today,'day',1);
      repo.transaction(state=>{
        const original=structuredClone(state.tasks[0]);
        const make=(id,title,start,done=false)=>({...structuredClone(original),id,title,start,done,quadrant:0,order:0,
          tags:['LegacyTag'],place:'LegacyPlace',project:'LegacyProject',repeat:null,reminder:null,subtasks:[],
          createdAt:'2026-01-01T00:00:00Z',completedAt:done?new Date().toISOString():''});
        const root=make('d4-legacy-root','旧分类 根任务',today+'T09:00');
        root.subtasks=[make('d4-legacy-child','旧分类 子任务',previous+'T10:00')];
        const expired=make('d4-legacy-expired','循环已到期',previous+'T11:00');
        expired.repeat={frequency:'daily',interval:1,weekdays:[],until:previous,anchor:previous+'T11:00'};
        state.tasks=[root,make('d4-legacy-future','明天的独立任务',next+'T09:00'),make('d4-legacy-completed','过去已完成任务',previous+'T08:00',true),expired];
        state.projects=[{id:'d4-legacy-project',name:'LegacyProject',description:'合成目录项目',archived:false}];
        state.tags=['LegacyTag'];state.places=['LegacyPlace'];
        state.notes=[{id:'d4-legacy-note',body:'分类操作不得改变独立便签'+String.fromCharCode(10)+'原值',createdAt:'2026-01-01T00:00:00Z'}];
      });
      repo.updateDemo(d=>{d.taskLinks={};d.archivedTaskIds=[];d.taskArchiveTimes={};d.projectMeta={};});
      return {kind:D4Prototype.kind,fixture:'isolated recursive historical classification/date boundaries'};
    })()`);
    await settle();
  }
  async function check(name,body) {await api.check(name,async()=>{await reset();await fixture();await body();});}

  await check('L01 Catalog CRUD updates nested exact-name associations and retains tasks/notes [synthetic fixture]',async()=>{
    await api.navigate('catalogs');
    const before=await snapshot();
    for(const type of ['tag','place']) {
      const original=group(type),renamed={...original,name:original.name+'Renamed'};
      await api.click(action('legacy-edit',original));
      await api.fill(field('name'),renamed.name);await api.submit('[data-form="legacy-catalog"]');
      let current=await snapshot();
      assert.ok(current[type==='tag'?'tags':'places'].includes(renamed.name));
      for(const task of flatten(current)) assert.equal(type==='tag'?task.tags.includes(renamed.name):task.place===renamed.name,true,task.id);
      await api.click(action('legacy-delete',renamed));await api.click(action('legacy-delete-confirm',renamed));
      current=await snapshot();
      assert.equal(current[type==='tag'?'tags':'places'].includes(renamed.name),false);
      for(const task of flatten(current)) assert.equal(type==='tag'?task.tags.length===0:task.place==='',true,task.id);
    }
    const after=await snapshot();
    assert.deepEqual(after.notes,before.notes);
    assert.deepEqual(flatten(after).map(t=>t.id),flatten(before).map(t=>t.id));
    for(const prior of flatten(before)) {
      const next=flatten(after).find(t=>t.id===prior.id);
      for(const key of Object.keys(prior).filter(key=>!['tags','place','subtasks'].includes(key))) assert.deepEqual(next[key],prior[key],prior.id+' '+key);
    }
    await api.reload();await api.navigate('catalogs');
    assert.deepEqual((await snapshot()).notes,before.notes);
    assert.equal(flatten(await snapshot()).length,5);
    await api.screenshot('legacy-catalog-associations');
  });

  await check('L02 Catalog creation rejects duplicates and stale rename without recreating data [synthetic fixture]',async()=>{
    await api.navigate('catalogs');
    await api.click('[data-action="legacy-new"][data-id="tag"]');
    await api.fill(field('name'),'新目录');await api.submit('[data-form="legacy-catalog"]');
    assert.equal((await snapshot()).tags.filter(name=>name==='新目录').length,1);
    const before=await snapshot();
    await api.click('[data-action="legacy-new"][data-id="tag"]');
    await api.fill(field('name'),'新目录');await api.submit('[data-form="legacy-catalog"]');
    assert.match(await read('document.querySelector("#toast").textContent'),/已经存在/);
    assert.deepEqual(await snapshot(),before);
    await api.click('[data-action="legacy-close"]');
    await api.click(action('legacy-edit',group('tag')));
    await api.fill(field('name'),'不应复活的目录');
    // Synthetic concurrent removal, deliberately not reported as a user action.
    await read('D4Prototype.repo.transaction(state=>{state.tags=state.tags.filter(name=>name!=="LegacyTag");})');
    await settle();
    const removed=await snapshot();
    await api.submit('[data-form="legacy-catalog"]');
    assert.match(await read('document.querySelector("#toast").textContent'),/已不存在/);
    assert.deepEqual(await snapshot(),removed);
    assert.equal(await read('document.querySelector('+JSON.stringify('[data-form="legacy-catalog"] [name="name"]')+').value'),'不应复活的目录');
  });

  await check('L03 Category opens quadrant filter and quick task inherits actual tag association [synthetic fixture]',async()=>{
    const selected=group('tag');
    await api.navigate('catalogs');await api.click(action('legacy-quadrants',selected));
    assert.equal(await read('D4Prototype.getRoute()'),'tasks');
    const visible=await read('[...document.querySelectorAll(".board .task-row")].map(el=>el.dataset.taskId)');
    assert.ok(visible.includes('d4-legacy-root'));
    for(const id of visible) assert.ok((await read('D4Prototype.repo.getTask('+JSON.stringify(id)+')')).tags.includes('LegacyTag'));
    await api.navigate('catalogs');await api.click(action('legacy-timeline',selected));
    assert.equal(await read('D4Prototype.getRoute()'),'timeline');
    await api.click(action('legacy-group-new-task',selected));
    assert.ok((await read('JSON.parse(document.querySelector("[data-form=task-edit] [name=tags]").value)')).includes('LegacyTag'));
    await api.fill('[data-form="task-edit"] [name="title"]','从分类快速创建');
    await api.submit('[data-form="task-edit"]');
    const created=flatten(await snapshot()).find(task=>task.title==='从分类快速创建');
    assert.ok(created);assert.ok(created.tags.includes('LegacyTag'));
    await api.screenshot('legacy-category-quick-task');
  });

  await check('L04 Timeline retains mature date boundaries, nested tasks and period controls [synthetic fixture]',async()=>{
    await api.navigate('timeline');
    assert.deepEqual(new Set(await ids()),new Set(['d4-legacy-root','d4-legacy-child','d4-legacy-future','d4-legacy-completed','d4-legacy-expired']));
    await api.fill(timeFilter('allDates'),false);await api.fill(timeFilter('status'),'all');await api.submit('[data-form="legacy-timeline-filter"]');
    // Past pending tasks remain visible. Past done, future, and expired until are hidden.
    assert.deepEqual(new Set(await ids()),new Set(['d4-legacy-root','d4-legacy-child']));
    await api.fill(timeFilter('allDates'),true);await api.fill(timeFilter('query'),'明天的独立任务');await api.submit('[data-form="legacy-timeline-filter"]');
    assert.deepEqual(await ids(),['d4-legacy-future']);
    await api.fill(timeFilter('query'),'');await api.fill(timeFilter('period'),'month');await api.submit('[data-form="legacy-timeline-filter"]');
    const original=await read('document.querySelector('+JSON.stringify(timeFilter('date'))+').value');
    const expected=await read('DemoDomain.helpers.shiftDate('+JSON.stringify(original)+',"month",1)');
    await api.click('[data-action="legacy-period"][data-id="1"]');
    assert.equal(await read('document.querySelector('+JSON.stringify(timeFilter('date'))+').value'),expected);
    await api.click('[data-action="legacy-period"][data-id="today"]');
    assert.equal(await read('document.querySelector('+JSON.stringify(timeFilter('date'))+').value'),await read('DemoDomain.helpers.dayKey()'));
    await api.screenshot('legacy-task-timeline');
  });

  await check('L05 Duplicate project names require explicit ID and expose unresolved history [synthetic fixture]',async()=>{
    await read(`(()=>{
      const repo=D4Prototype.repo;
      repo.transaction(state=>{
        state.projects=['a','b'].map(suffix=>({id:'d4-legacy-project-'+suffix,name:'同名项目',description:'合成重名边界',archived:false}));
        const original=structuredClone(state.tasks[0]);
        state.tasks=['a','b','unknown'].map(suffix=>({...structuredClone(original),id:'d4-legacy-project-task-'+suffix,project:'同名项目',title:'同名任务 '+suffix,subtasks:[]}));
      });
      repo.updateDemo(d=>{d.taskLinks={
        'd4-legacy-project-task-a':{projectId:'d4-legacy-project-a',workItemId:''},
        'd4-legacy-project-task-b':{projectId:'d4-legacy-project-b',workItemId:''}
      };});return true;
    })()`);
    await settle();
    const selected={type:'project',name:'同名项目',projectId:'d4-legacy-project-a'};
    const before=await snapshot();
    await api.navigate('catalogs');await api.click(action('legacy-timeline',selected));
    assert.deepEqual(await ids(),['d4-legacy-project-task-a']);
    assert.match(await read('document.querySelector("[data-legacy-blocker=ambiguous-project]").textContent'),/BLOCKER.*1/);
    assert.deepEqual(await snapshot(),before);
    await api.navigate('catalogs');await api.click(action('legacy-quadrants',selected));
    assert.deepEqual(await read('[...document.querySelectorAll(".board .task-row")].map(el=>el.dataset.taskId)'),['d4-legacy-project-task-a']);
    assert.deepEqual(await snapshot(),before);
    await api.navigate('timeline');await api.screenshot('legacy-project-id-boundary');
  });

  await check('L06 Explicit catalog clear removes unsaved search draft [synthetic fixture]',async()=>{
    await api.navigate('catalogs');
    await api.fill('[data-form="legacy-catalog-filter"] [name="query"]','尚未提交的目录搜索');
    await api.click('[data-action="legacy-catalog-clear"]');
    assert.equal(await read('document.querySelector("[data-form=legacy-catalog-filter] [name=query]").value'),'');
    assert.equal(await read('document.querySelectorAll("[data-legacy-group]").length'),3);
  });

  await check('L07 Timeline loads in original 100-row batches without changing data [synthetic fixture]',async()=>{
    await read(`(()=>{
      D4Prototype.repo.transaction(state=>{
        const original=structuredClone(state.tasks[0]);
        state.tasks=Array.from({length:125},(_,index)=>({...structuredClone(original),id:'d4-legacy-page-'+index,
          title:'分页任务 '+index,subtasks:[],order:index*1024}));
      });return true;
    })()`);
    await settle();
    const before=await snapshot();
    await api.navigate('timeline');
    assert.equal((await ids()).length,100);
    assert.match(await read('document.querySelector("[data-legacy-loaded]").textContent'),/100 \/ 125/);
    await api.click('[data-action="legacy-more-tasks"]');
    assert.equal((await ids()).length,125);
    assert.equal(new Set(await ids()).size,125);
    assert.deepEqual(await snapshot(),before);
    await api.fill(timeFilter('query'),'分页任务 124');await api.submit('[data-form="legacy-timeline-filter"]');
    assert.deepEqual(await ids(),['d4-legacy-page-124']);
    await api.fill(timeFilter('query'),'');await api.submit('[data-form="legacy-timeline-filter"]');
    assert.equal((await ids()).length,100);
    assert.deepEqual(await snapshot(),before);
  });

  await check('L08 Project ID and unique historical-name selection agree across task views and deletion never rebinds [synthetic fixture]',async()=>{
    await read(`(()=>{
      const repo=D4Prototype.repo;
      repo.transaction(state=>{
        const original=structuredClone(state.tasks[0]);
        state.projects=[{id:'d4-legacy-current-project',name:'当前唯一项目名',description:'合成历史关联边界',archived:false}];
        state.tasks=[
          {...structuredClone(original),id:'d4-legacy-explicit-stale-name',title:'明确ID保留旧名称',project:'旧项目名',subtasks:[]},
          {...structuredClone(original),id:'d4-legacy-unique-name',title:'唯一名称历史关联',project:'当前唯一项目名',subtasks:[]},
          {...structuredClone(original),id:'d4-legacy-unrelated-name',title:'没有ID且名称无关',project:'旧项目名',subtasks:[]}
        ];
      });
      repo.updateDemo(d=>{d.taskLinks={'d4-legacy-explicit-stale-name':{projectId:'d4-legacy-current-project',workItemId:''}};});
      return true;
    })()`);
    await settle();
    const selected={type:'project',name:'当前唯一项目名',projectId:'d4-legacy-current-project'};
    const before=await snapshot(),expected=new Set(['d4-legacy-explicit-stale-name','d4-legacy-unique-name']);
    await api.navigate('catalogs');await api.click(action('legacy-timeline',selected));
    assert.deepEqual(new Set(await ids()),expected);
    await api.navigate('catalogs');await api.click(action('legacy-quadrants',selected));
    assert.deepEqual(new Set(await read('[...document.querySelectorAll(".board .task-row")].map(el=>el.dataset.taskId)')),expected);
    assert.deepEqual(await snapshot(),before);
    // Synthetic concurrent deletion, not a production migration or user action.
    await read('D4Prototype.repo.transaction(state=>{state.projects=[];});true');
    await settle();await api.navigate('timeline');
    const removed=await snapshot();
    assert.deepEqual(await ids(),[]);
    assert.match(await read('document.querySelector("[data-legacy-blocker=missing-project]").textContent'),/BLOCKER.*已删除/);
    await api.click(action('legacy-group-new-task',selected));
    assert.match(await read('document.querySelector("#toast").textContent'),/项目已删除/);
    assert.equal(await read('!!document.querySelector("[data-form=task-edit]")'),false);
    assert.deepEqual(await snapshot(),removed);
  });

  await reset();
}
