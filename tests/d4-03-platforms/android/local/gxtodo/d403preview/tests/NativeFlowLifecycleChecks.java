package local.gxtodo.d403preview.tests;

import android.os.Build;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.WindowInsets;
import local.gxtodo.d403preview.BuildInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Iterator;
import java.util.Locale;
import java.util.TreeSet;

/** One additional isolated native case; no historical 57-case result is inherited. */
final class NativeFlowLifecycleChecks {
    private static final String TEMPLATE_FORM="[data-form=work-template]";
    private static final String PROCESS_FORM="[data-form=work-process]";

    static void snapshotProgressAndArchive(NativeWorkLifecycleChecks.Host h) throws Exception {
        Case c=new Case(h);Throwable failure=null;
        try {
            c.setup();String title="Native template "+c.token,runTitle="Native process "+c.token;
            h.tap("[data-action=work-new-template]");h.typeText(TEMPLATE_FORM+" [name=name]",title);
            h.typeText(TEMPLATE_FORM+" [name=description]","Original template definition");
            c.typeLines(TEMPLATE_FORM+" [name=stepLines]",new String[]{"Native first step","Native second step"});c.submit(TEMPLATE_FORM);
            JSONObject template=(JSONObject)h.js("D4Prototype.repo.demo.templates.find(t=>t.name==="+q(title)+")");c.templateId=template.getString("id");
            require(template.getInt("version")==1&&template.getBoolean("enabled")&&!template.getBoolean("archived"),"Actual template creation records enabled v1");
            require(template.getJSONArray("steps").length()==2,"Actual multiline key input creates exactly two steps");
            require("Native first step".equals(template.getJSONArray("steps").getJSONObject(0).getString("title"))&&"Native second step".equals(template.getJSONArray("steps").getJSONObject(1).getString("title")),"Template step titles and order match actual keyboard input");
            c.created(template);c.protect();c.stage("template-created");

            c.tap("work-process-from-template",c.templateId);h.typeText(PROCESS_FORM+" [name=name]",runTitle);c.submit(PROCESS_FORM);
            require("processes".equals(h.js("D4Prototype.getRoute()")),"Real create-and-start submit opens the process page");
            JSONObject process=(JSONObject)h.js("D4Prototype.repo.demo.processes.find(p=>p.name==="+q(runTitle)+")");c.processId=process.getString("id");
            require(c.templateId.equals(process.getString("templateId"))&&process.getInt("templateVersion")==1&&process.getString("projectId").isEmpty(),"Created instance preserves exact template identity/version and blank project");
            require("running".equals(process.getString("status"))&&process.getInt("currentStep")==0&&!process.getBoolean("archived")&&process.getString("completedAt").isEmpty(),"New instance starts at the first incomplete step");
            JSONObject snapshot=process.getJSONObject("templateSnapshot"),expected=new JSONObject().put("id",c.templateId).put("name",template.getString("name")).put("description",template.getString("description")).put("version",1).put("steps",template.getJSONArray("steps"));
            JSONObject actual=new JSONObject(snapshot.toString());require(!actual.getString("capturedAt").isEmpty(),"Instance snapshot records its creation-time capture timestamp");actual.remove("capturedAt");
            equal(expected,actual,"Creation snapshot contains exact template definition");
            JSONArray runSteps=process.getJSONArray("steps"),sourceSteps=template.getJSONArray("steps");require(runSteps.length()==sourceSteps.length(),"One instance step is created for each source step");
            for(int i=0;i<runSteps.length();i++) {
                JSONObject step=runSteps.getJSONObject(i),source=sourceSteps.getJSONObject(i);
                require(source.getString("id").equals(step.getString("sourceStepId"))&&!source.getString("id").equals(step.getString("id")),"Instance step has new identity and exact sourceStepId");
                require(source.getString("title").equals(step.getString("title"))&&source.getString("description").equals(step.getString("description"))&&!step.getBoolean("completed")&&step.getString("completedAt").isEmpty(),"Instance copies exact source definition with no invented completion");
            }
            require(!runSteps.getJSONObject(0).getString("id").equals(runSteps.getJSONObject(1).getString("id")),"Instance step identities are distinct");
            c.created(process);c.protect();c.stage("process-created-from-v1");h.shot("android-native-flow-initial-snapshot");

            h.openPage("templates");c.tap("work-edit-template",c.templateId);
            c.typeLines(TEMPLATE_FORM+" [name=stepLines]",new String[]{"Native first step","Native replacement step"});c.submit(TEMPLATE_FORM);
            JSONObject edited=c.template();transition(template,edited,"编辑","steps","version");
            require(edited.getInt("version")==2,"Actual step-definition edit increments the template version once");
            require(edited.getJSONArray("steps").length()==2,"Editing retains exactly two ordered template steps");
            equal(sourceSteps.getJSONObject(0),edited.getJSONArray("steps").getJSONObject(0),"Unchanged template step retains every original definition field and identity");
            require("Native replacement step".equals(edited.getJSONArray("steps").getJSONObject(1).getString("title"))&&!sourceSteps.getJSONObject(1).getString("id").equals(edited.getJSONArray("steps").getJSONObject(1).getString("id")),"Changed template step receives a new definition and identity");
            equal(process,c.process(),"Template editing leaves the whole existing instance and snapshot exact");
            c.tap("work-template-toggle",c.templateId);JSONObject disabled=c.template();transition(edited,disabled,"停用模板","enabled");
            require(!disabled.getBoolean("enabled")&&Boolean.TRUE.equals(h.js("document.querySelector("+q(action("work-process-from-template",c.templateId))+").disabled")),"Real disable stops the template creation control");
            equal(process,c.process(),"Template disable leaves the existing instance exact");
            c.tap("work-archive-templates",c.templateId);JSONObject archivedTemplate=c.template();transition(disabled,archivedTemplate,"归档","archived","archivedAt");
            require(archivedTemplate.getBoolean("archived")&&!archivedTemplate.getString("archivedAt").isEmpty(),"Template archive records state and timestamp");
            require(Boolean.TRUE.equals(h.js("!document.querySelector("+q(action("work-edit-template",c.templateId))+")")),"Archived template leaves the active list");
            h.openPage("archive");c.tap("work-restore-templates",c.templateId);JSONObject restoredTemplate=c.template();transition(archivedTemplate,restoredTemplate,"恢复归档","archived","archivedAt");
            require(!restoredTemplate.getBoolean("archived")&&restoredTemplate.getString("archivedAt").isEmpty()&&!restoredTemplate.getBoolean("enabled"),"Restore clears archive state without enabling a disabled template");
            equal(process,c.process(),"Template archive and restore leave the whole existing instance exact");c.protect();c.stage("template-v2-disabled-archived-restored");

            h.openPage("processes");c.tap("work-process-toggle",c.processId);JSONObject paused=c.process();transition(process,paused,"暂停流程","status");
            require("paused".equals(paused.getString("status"))&&Boolean.TRUE.equals(h.js("document.querySelector("+q(action("work-process-advance",c.processId))+").disabled")),"Actual pause disables advancing the unchanged current step");
            c.tap("work-process-toggle",c.processId);JSONObject resumed=c.process();transition(paused,resumed,"继续流程","status");require("running".equals(resumed.getString("status")),"Actual resume re-enables the same instance");
            JSONObject before=resumed;
            for(int i=0;i<2;i++) {
                c.tap("work-process-advance",c.processId);JSONObject after=c.process();
                transition(before,after,"完成流程步骤","steps","currentStep","status","completedAt");
                require(after.getInt("currentStep")==i+1,"One actual advance increments the step index exactly once");
                for(int j=0;j<2;j++) {
                    JSONObject previous=before.getJSONArray("steps").getJSONObject(j),step=after.getJSONArray("steps").getJSONObject(j);
                    if(j==i){JSONObject left=new JSONObject(previous.toString()),right=new JSONObject(step.toString());left.remove("completed");right.remove("completed");left.remove("completedAt");right.remove("completedAt");equal(left,right,"Advancing retains every raw current-step definition and identity");require(step.getBoolean("completed")&&!step.getString("completedAt").isEmpty(),"Current step records actual completion and time");}
                    else equal(previous,step,"Advancing preserves every other step exactly");
                }
                require((i==0?"running":"completed").equals(after.getString("status"))&&(i==0?after.getString("completedAt").isEmpty():!after.getString("completedAt").isEmpty()),"Instance completes only after the final original step");
                equal(snapshot,after.getJSONObject("templateSnapshot"),"Advancement does not rebuild the immutable v1 snapshot from v2");
                before=after;c.protect();c.stage("advanced-step-"+(i+1));
            }
            JSONObject completed=before;equal(restoredTemplate,c.template(),"Instance operations leave the edited template exact");
            require(Boolean.TRUE.equals(h.js("(function(){var card=document.querySelector("+q(action("work-edit-process",c.processId))+").closest('.process-card');return card.querySelectorAll('.process-steps li.done').length===2&&Number(card.querySelector('progress').value)===2&&!card.querySelector('[data-action=work-process-advance]')&&JSON.stringify(Array.from(card.querySelectorAll('.process-steps li>span')).map(s=>s.textContent))===JSON.stringify(['Native first step','Native second step']);})()")),"Completed native card displays both original steps, full progress and no further advance action");
            h.shot("android-native-flow-completed-original-steps");
            c.tap("work-archive-processes",c.processId);JSONObject archived=c.process();transition(completed,archived,"归档","archived","archivedAt");
            require(archived.getBoolean("archived")&&!archived.getString("archivedAt").isEmpty(),"Completed instance archive records state and time");
            require(Boolean.TRUE.equals(h.js("!document.querySelector("+q(action("work-edit-process",c.processId))+")")),"Archived instance leaves the active list");
            h.openPage("archive");c.tap("work-restore-processes",c.processId);JSONObject restored=c.process();transition(archived,restored,"恢复归档","archived","archivedAt");
            require(!restored.getBoolean("archived")&&restored.getString("archivedAt").isEmpty()&&"completed".equals(restored.getString("status")),"Restore retains completed status and clears only archive state/time");
            equal(snapshot,restored.getJSONObject("templateSnapshot"),"Archive and restore retain the exact creation snapshot");c.protect();c.stage("completed-instance-archived-restored");

            String exact=c.exactObjects();c.flushTrace();h.recreate();c.beginTrace();
            require(Boolean.TRUE.equals(h.js("D4Prototype.repo.persistence().loaded")),"Recreated Activity loaded existing isolated persistence");
            require(exact.equals(c.exactObjects()),"Activity recreation retains both exact template and instance including every history and raw timestamp");c.protect();
            h.openPage("processes");require(Boolean.TRUE.equals(h.js("!!document.querySelector("+q(action("work-edit-process",c.processId))+")")),"Restored completed instance remains reachable after Activity recreation");
            c.stage("activity-recreation-retains-flow");h.shot("android-native-flow-recreated");c.receipt.put("bodyCompleted",true);
        } catch(Exception|Error error){failure=error;try{c.receipt.put("failure",error.toString());c.flushTrace();c.save();h.shot("failure-native-flow-lifecycle-before-cleanup");}catch(Exception|Error capture){error.addSuppressed(capture);}throw error;}
        finally{try{c.cleanup();}catch(Exception|Error cleanup){if(failure!=null)failure.addSuppressed(cleanup);else throw cleanup;}}
    }

    private static final class Case {
        final NativeWorkLifecycleChecks.Host h;final String token=Long.toHexString(SystemClock.elapsedRealtimeNanos());
        final JSONObject receipt=new JSONObject();final JSONArray stages=new JSONArray(),segments=new JSONArray(),keys=new JSONArray();
        String oldState,oldDemo,oldStorage,storageKey,protectedBefore,templateId="",processId="";boolean snapshotReady;
        Case(NativeWorkLifecycleChecks.Host h){this.h=h;}
        void setup() throws Exception {
            h.home();oldState=(String)h.js("JSON.stringify(D4Prototype.repo.state)");oldDemo=(String)h.js("JSON.stringify(D4Prototype.repo.demo)");storageKey=(String)h.js("D4Prototype.storageKey");Object raw=h.js("localStorage.getItem(D4Prototype.storageKey)");oldStorage=raw==JSONObject.NULL?null:(String)raw;snapshotReady=true;
            receipt.put("case","flow-template-snapshot-progress-archive").put("sourceSha",BuildInfo.SOURCE_SHA).put("runId",BuildInfo.RUN_ID).put("runAttempt",BuildInfo.RUN_ATTEMPT).put("syntheticOnly",true)
                .put("fixturePreparation","Real templates Clear Filter action after original state/demo/storage backups; no template or process objects injected")
                .put("stateBeforeSha256",hash(oldState)).put("demoBeforeSha256",hash(oldDemo)).put("stages",stages).put("eventSegments",segments).put("nativeKeys",keys);
            h.openPage("templates");h.tap(action("work-reset-filter","templates"));protectedBefore=protectedState();beginTrace();save();
        }
        JSONObject template() throws Exception{return (JSONObject)h.js("D4Prototype.repo.demo.templates.find(t=>t.id==="+q(templateId)+")");}
        JSONObject process() throws Exception{return (JSONObject)h.js("D4Prototype.repo.demo.processes.find(p=>p.id==="+q(processId)+")");}
        String protectedState() throws Exception{return canonical(h.js("(function(){var d=D4Prototype.repo.demo;return {state:D4Prototype.repo.state,projectMeta:d.projectMeta,taskLinks:d.taskLinks,archivedTaskIds:d.archivedTaskIds,taskArchiveTimes:d.taskArchiveTimes,workItems:d.workItems,contacts:d.contacts,templates:d.templates.filter(t=>t.id!=="+q(templateId)+"),processes:d.processes.filter(p=>p.id!=="+q(processId)+")};})()"));}
        void protect() throws Exception{require(protectedBefore.equals(protectedState()),"All pre-existing core/work records, links, unrelated templates and instances remain exact");}
        void created(JSONObject row) throws Exception{JSONArray history=row.getJSONArray("history");require(history.length()==1&&"创建".equals(history.getJSONObject(0).getString("action"))&&!row.getString("createdAt").isEmpty(),"Real creation records one creation audit and original creation time");}
        void tap(String action,String id) throws Exception{int count=events("click",action,null);h.tap(action(action,id));require(events("click",action,null)==count+1,"Exactly one trusted native click performs "+action);}
        void submit(String selector) throws Exception{String form=(String)h.js("document.querySelector("+q(selector)+").dataset.form");int count=events("submit",null,form);h.tap(selector+" button[type=submit]");require(Boolean.TRUE.equals(h.js("!document.querySelector("+q(selector)+")")),"Actual native form submission closes the flow editor");require(events("submit",null,form)==count+1,"Exactly one trusted native submit saves "+form);}
        void typeLines(String selector,String[] lines) throws Exception {
            for(String line:lines)require(line.matches("[ -~]+"),"Native multiline fixture contains nonempty deterministic ASCII lines");
            dismissIme();h.tap(selector);require(Boolean.TRUE.equals(h.js("document.activeElement===document.querySelector("+q(selector)+")")),"Actual tap focuses the template step textarea");
            int before=events("input",null,"work-template");key(KeyEvent.KEYCODE_A,KeyEvent.META_CTRL_ON);key(KeyEvent.KEYCODE_DEL,0);
            StringBuilder expected=new StringBuilder();for(int i=0;i<lines.length;i++){if(i>0){key(KeyEvent.KEYCODE_ENTER,0);expected.append('\n');}h.instrumentation().sendStringSync(lines[i]);expected.append(lines[i]);}h.settle();
            require(expected.toString().equals(h.js("document.querySelector("+q(selector)+").value")),"Actual key and Enter events create exact multiline step text");require(events("input",null,"work-template")>before,"Actual multiline keyboard editing emits trusted input events");
            dismissIme();require(expected.toString().equals(h.js("document.querySelector("+q(selector)+").value")),"IME dismissal retains exact multiline draft");save();
        }
        void key(int code,int meta) throws Exception{
            long down=SystemClock.uptimeMillis();boolean released=false;Throwable failure=null;
            JSONObject receipt=new JSONObject().put("keyCode",code).put("metaState",meta).put("uptimeMillis",down);keys.put(receipt);
            try{h.instrumentation().sendKeySync(new KeyEvent(down,down,KeyEvent.ACTION_DOWN,code,0,meta));receipt.put("downDispatched",true);h.instrumentation().sendKeySync(new KeyEvent(down,SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,code,0,meta));released=true;receipt.put("upDispatched",true);}
            catch(Exception|Error error){failure=error;receipt.put("failure",error.toString());throw error;}
            finally{if(!released)try{KeyEvent release=new KeyEvent(down,SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,code,0,meta);h.instrumentation().sendKeySync(KeyEvent.changeFlags(release,release.getFlags()|KeyEvent.FLAG_CANCELED));receipt.put("cancelledUpDispatched",true);}catch(Exception|Error cleanup){if(failure!=null)failure.addSuppressed(cleanup);else throw cleanup;}}
        }
        void dismissIme() throws Exception {
            require(Build.VERSION.SDK_INT>=30,"Multiline native input observes API30+ IME visibility");final boolean[] known=new boolean[1],visible=new boolean[1];
            h.instrumentation().runOnMainSync(()->{WindowInsets insets=h.main().previewWebView().getRootWindowInsets();known[0]=insets!=null;visible[0]=insets!=null&&insets.isVisible(WindowInsets.Type.ime());});require(known[0],"Native IME visibility is observable");
            if(visible[0]){h.back();h.instrumentation().runOnMainSync(()->{WindowInsets insets=h.main().previewWebView().getRootWindowInsets();known[0]=insets!=null;visible[0]=insets!=null&&insets.isVisible(WindowInsets.Type.ime());});require(known[0]&&!visible[0],"Real Back dismisses only the observed visible keyboard");}
        }
        void stage(String stage) throws Exception{stages.put(new JSONObject().put("stage",stage).put("wallMillis",System.currentTimeMillis()).put("objects",new JSONObject(exactObjects())));save();}
        String exactObjects() throws Exception{return canonical(h.js("({template:D4Prototype.repo.demo.templates.find(t=>t.id==="+q(templateId)+")||null,process:D4Prototype.repo.demo.processes.find(p=>p.id==="+q(processId)+")||null})"));}
        void beginTrace() throws Exception{h.js("(function(){if(window.__d403NativeFlowTrace)throw Error('Flow trace already installed');var events=[],dropped=0,types=['input','change','submit','click'],listener=e=>{var f=e.target.closest?.('form[data-form]'),a=e.target.closest?.('[data-action]');if(!(f?.dataset.form.startsWith('work-')||a?.dataset.action.startsWith('work-')))return;if(events.length>=768){dropped++;return;}events.push({type:e.type,trusted:e.isTrusted,form:f?.dataset.form||'',action:a?.dataset.action||'',name:e.target.name||'',wallMillis:Date.now()});};types.forEach(t=>document.addEventListener(t,listener,true));window.__d403NativeFlowTrace={events:events,read:()=>({events:events,dropped:dropped}),dispose:()=>types.forEach(t=>document.removeEventListener(t,listener,true))};return true;})()");}
        int events(String type,String action,String form) throws Exception{return ((Number)h.js("window.__d403NativeFlowTrace.events.filter(e=>e.trusted&&e.type==="+q(type)+(action==null?"":"&&e.action==="+q(action))+(form==null?"":"&&e.form==="+q(form))+").length")).intValue();}
        void flushTrace() throws Exception{Object trace=h.js("(function(){var t=window.__d403NativeFlowTrace;if(!t)return null;var x=t.read();t.dispose();delete window.__d403NativeFlowTrace;return x;})()");if(trace instanceof JSONObject){segments.put(trace);save();require(((JSONObject)trace).getInt("dropped")==0,"Flow evidence trace remains complete");}}
        void save() throws Exception{h.write("flow-template-snapshot-progress-archive.json",receipt.toString(2));}
        void cleanup() throws Exception {
            Throwable failure=null;try{flushTrace();}catch(Exception|Error error){failure=error;}
            if(snapshotReady)try{h.launch();h.home();JSONObject restored=(JSONObject)h.js("(function(){D4Prototype.repo.batch(()=>{D4Prototype.repo.replaceState(JSON.parse("+q(oldState)+"));D4Prototype.repo.updateDemo(()=>JSON.parse("+q(oldDemo)+"));});var s=JSON.stringify(D4Prototype.repo.state),d=JSON.stringify(D4Prototype.repo.demo);"+(oldStorage==null?"localStorage.removeItem("+q(storageKey)+");":"localStorage.setItem("+q(storageKey)+","+q(oldStorage)+");")+"return {state:s,demo:d,storage:localStorage.getItem("+q(storageKey)+")};})()");require(oldState.equals(restored.getString("state"))&&oldDemo.equals(restored.getString("demo")),"Flow cleanup restores exact captured state and demo");require(oldStorage==null?restored.isNull("storage"):oldStorage.equals(restored.getString("storage")),"Flow cleanup restores exact captured raw localStorage");receipt.put("cleanup",new JSONObject().put("stateRestored",true).put("demoRestored",true).put("rawStorageRestored",true));}
            catch(Exception|Error error){if(failure==null)failure=error;else failure.addSuppressed(error);receipt.put("cleanupError",error.toString());}
            try{save();}catch(Exception|Error error){if(failure==null)failure=error;else failure.addSuppressed(error);}if(failure instanceof Exception)throw (Exception)failure;if(failure instanceof Error)throw (Error)failure;
        }
    }
    private static void transition(JSONObject before,JSONObject after,String action,String... changed) throws Exception {
        JSONObject left=new JSONObject(before.toString()),right=new JSONObject(after.toString());for(String key:changed){left.remove(key);right.remove(key);}left.remove("history");right.remove("history");left.remove("updatedAt");right.remove("updatedAt");equal(left,right,"Only explicit fields and audit metadata change for "+action);
        JSONArray prior=before.getJSONArray("history"),next=after.getJSONArray("history");require(next.length()==prior.length()+1,"Exactly one audit is appended for "+action);for(int i=0;i<prior.length();i++)equal(prior.get(i),next.get(i),"Existing flow history remains exact");
        JSONObject audit=next.getJSONObject(next.length()-1),snapshot=new JSONObject(before.toString());snapshot.remove("history");require(action.equals(audit.getString("action"))&&after.getString("updatedAt").equals(audit.getString("at")),"Audit action and modification time agree");equal(snapshot,audit.getJSONObject("before"),"Audit retains the exact prior flow object");
    }
    private static String canonical(Object value) throws Exception{if(value instanceof JSONObject){JSONObject row=(JSONObject)value;TreeSet<String> keys=new TreeSet<>();Iterator<String> iterator=row.keys();while(iterator.hasNext())keys.add(iterator.next());StringBuilder result=new StringBuilder("{");boolean first=true;for(String key:keys){if(!first)result.append(',');first=false;result.append(q(key)).append(':').append(canonical(row.get(key)));}return result.append('}').toString();}if(value instanceof JSONArray){JSONArray rows=(JSONArray)value;StringBuilder result=new StringBuilder("[");for(int i=0;i<rows.length();i++){if(i>0)result.append(',');result.append(canonical(rows.get(i)));}return result.append(']').toString();}return value instanceof String?q((String)value):String.valueOf(value);}
    private static void equal(Object before,Object after,String message) throws Exception{require(canonical(before).equals(canonical(after)),message);}
    private static String action(String name,String id){return "[data-action="+name+"][data-id="+q(id)+"]";}
    private static String q(String value){return JSONObject.quote(value);}
    private static String hash(String text) throws Exception{StringBuilder result=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)))result.append(String.format(Locale.ROOT,"%02x",b&255));return result.toString();}
    private static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);}
}
