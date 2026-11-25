package local.gxtodo.d403preview.tests;

import android.app.Instrumentation;
import android.graphics.Rect;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import local.gxtodo.d403preview.BuildInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.TreeSet;

/** Isolated work acceptance. Claimed mutations use native touch/key events only. */
final class NativeWorkLifecycleChecks {
    interface Host extends NativeDocumentChooserChecks.Host { void recreate() throws Exception; }
    private interface Body { void run(Case c) throws Exception; }
    private static final String PROJECT_FORM="[data-form=work-project]";
    private static final String WORK_FORM="[data-form=work-work-item]";

    static void projectAndWorkLifecycle(Host h) throws Exception {
        run(h,"work-project-item-lifecycle",c->{
            String projectTitle="Native project "+c.token,workTitle="Native work "+c.token;
            h.openPage("projects");h.tap("[data-action=work-new-project]");
            h.typeText(PROJECT_FORM+" [name=name]",projectTitle);
            h.typeText(PROJECT_FORM+" [name=description]","Created by actual Android form input");
            h.typeText(PROJECT_FORM+" [name=owner]","Native owner");
            h.typeText(PROJECT_FORM+" [name=memberLines]","Native member");c.submit(PROJECT_FORM);
            JSONObject project=(JSONObject)h.js("D4Prototype.getState().projects.find(p=>p.name==="+q(projectTitle)+")");
            c.projectId=project.getString("id");
            require(project.getJSONArray("members").length()==1&&"Native member".equals(project.getJSONArray("members").getString(0)),"Real project form saves the exact member");
            require("Native owner".equals(project.getString("owner"))&&"active".equals(project.getString("status"))&&!project.getBoolean("archived"),"Project owner/status/archive state match the real form");
            require("".equals(project.getString("dueDate")),"Blank project time remains blank without an invented date");
            c.created(project,"创建项目");c.assertProtected();c.stage("project-created");

            h.openPage("work-items");h.tap("[data-action=work-new-work-item]");
            h.typeText(WORK_FORM+" [name=title]",workTitle);
            c.select(WORK_FORM+" [name=projectId]",c.projectId);
            h.typeText(WORK_FORM+" [name=owner]","Work owner");
            h.typeText(WORK_FORM+" [name=description]","Actual native work form");
            h.typeText(WORK_FORM+" [name=notes]","Native notes before edit");c.submit(WORK_FORM);
            JSONObject work=(JSONObject)h.js("D4Prototype.repo.demo.workItems.find(w=>w.title==="+q(workTitle)+")");
            String id=work.getString("id");c.workIds.put(id);
            require(c.projectId.equals(work.getString("projectId"))&&"planned".equals(work.getString("status")),"Real native project option saves its exact ID and default work status");
            require("Work owner".equals(work.getString("owner"))&&"Native notes before edit".equals(work.getString("notes")),"Work text matches actual key input");
            require("".equals(work.getString("plannedStart"))&&"".equals(work.getString("dueDate"))&&work.getJSONArray("attachments").length()==0,"New work has blank times and no fabricated attachments");
            c.created(work,"创建工作事项");c.assertProtected();c.stage("work-created");

            h.openPage("projects");h.tap(action("work-edit-project",c.projectId));
            h.typeText(PROJECT_FORM+" [name=name]",projectTitle+" renamed");c.submit(PROJECT_FORM);
            JSONObject renamed=c.project();transition(project,renamed,"编辑项目","name");
            require((projectTitle+" renamed").equals(renamed.getString("name")),"Real project rename retains original project identity");
            require(canonical(work).equals(canonical(c.work(id))),"Renaming a project does not rewrite the associated work object");
            h.openPage("work-items");h.tap(action("work-work-detail",id));
            require(Boolean.TRUE.equals(h.js("document.querySelector('.modal').textContent.includes("+q(projectTitle+" renamed")+")")),"Work details resolve the renamed project through the unchanged exact ID");
            c.editWorkDetail(id);h.typeText(WORK_FORM+" [name=notes]","Native notes after edit");c.submit(WORK_FORM);
            JSONObject edited=c.work(id);transition(work,edited,"编辑工作事项","notes");
            require("Native notes after edit".equals(edited.getString("notes")),"Actual work edit saves the exact new note");c.assertProtected();c.stage("renamed-and-edited");
            h.tap(action("work-work-detail",id));h.shot("android-native-work-edited");h.tap(".modal-body > footer [data-action=work-close]");

            h.tap(action("work-archive-workItems",id));JSONObject archived=c.work(id);transition(edited,archived,"归档","archived","archivedAt");
            require(archived.getBoolean("archived")&&!archived.getString("archivedAt").isEmpty(),"Real archive records work archive state and time");
            require(Boolean.TRUE.equals(h.js("!document.querySelector("+q(action("work-work-detail",id))+")")),"Archived work leaves the active list");
            h.openPage("archive");h.tap(action("work-restore-workItems",id));JSONObject restored=c.work(id);transition(archived,restored,"恢复归档","archived","archivedAt");
            require(!restored.getBoolean("archived")&&restored.getString("archivedAt").isEmpty(),"Real restore clears work archive state and time");
            h.openPage("projects");h.tap(action("work-archive-projects",c.projectId));JSONObject archivedProject=c.project();transition(renamed,archivedProject,"归档","archived","archivedAt");
            require(archivedProject.getBoolean("archived"),"Project archive is observed");
            require(canonical(restored).equals(canonical(c.work(id))),"Project archive does not cascade to the associated work");
            h.openPage("archive");h.tap(action("work-restore-projects",c.projectId));JSONObject restoredProject=c.project();transition(archivedProject,restoredProject,"恢复归档","archived","archivedAt");
            require(!restoredProject.getBoolean("archived")&&restoredProject.getString("archivedAt").isEmpty(),"Project restore clears archive state and time");
            c.assertProtected();c.stage("archived-and-restored");c.recreateAndCompare();

            h.openPage("projects");h.tap(action("work-delete-projects",c.projectId));
            require(canonical(restoredProject).equals(canonical(c.project())),"Project delete prompt preserves the exact object before confirmation");
            h.tap(action("work-delete-confirm-projects",c.projectId));
            require(Boolean.TRUE.equals(h.js("!D4Prototype.repo.state.projects.some(p=>p.id==="+q(c.projectId)+")&&!Object.prototype.hasOwnProperty.call(D4Prototype.repo.demo.projectMeta,"+q(c.projectId)+")")),"Confirmed deletion removes exact core project and its metadata");
            JSONObject unlinked=c.work(id);transition(restored,unlinked,"项目删除后解除关联","projectId");
            require(unlinked.getString("projectId").isEmpty(),"Project deletion clears only the surviving work association");c.assertProtected();c.stage("project-deleted-work-retained");
            h.openPage("work-items");h.tap(action("work-delete-workItems",id));
            require(canonical(unlinked).equals(canonical(c.work(id))),"Work delete prompt preserves the exact object before confirmation");
            h.tap(action("work-delete-confirm-workItems",id));
            require(Boolean.TRUE.equals(h.js("!D4Prototype.repo.demo.workItems.some(w=>w.id==="+q(id)+")")),"Confirmed deletion removes only the created work entity");
            c.assertProtected();c.stage("work-deleted");h.shot("android-native-work-lifecycle-complete");
        });
    }

    static void exactTimePreservation(Host h) throws Exception {
        run(h,"work-time-preservation-recreation",c->{
            c.projectId="d403-time-project-"+c.token;
            String minute="d403-minute-"+c.token,precise="d403-precise-"+c.token;c.workIds.put(minute).put(precise);
            String projectDue="2032-05-07T04:34:56.789+05:30";
            c.receipt.put("timeFixtureProvenance","Synthetic historical values installed in isolated repository; native date/time picker input is not claimed");
            JSONObject project=new JSONObject().put("id",c.projectId).put("name","Native historical times "+c.token).put("description","Historical project time").put("archived",false);
            JSONObject meta=new JSONObject().put("owner","Time owner").put("members",new JSONArray().put("Time member")).put("status","active").put("color","q1").put("dueDate",projectDue).put("createdAt","2030-01-02T03:04:05Z").put("history",new JSONArray()).put("nativeSentinel",new JSONObject().put("raw",new JSONArray().put("keep").put(17)));
            JSONArray fixtures=new JSONArray().put(timeWork(minute,c.projectId,"Minute fixture "+c.token,"2032-05-07T09:15","2032-05-07T17:45"))
                .put(timeWork(precise,c.projectId,"Precise fixture "+c.token,"2032-05-07T04:34:56.789+05:30","2032-05-07T12:30:59.007Z"));
            h.js("(function(){var s=D4Prototype.repo.state,d=D4Prototype.repo.demo,p="+project+",m="+meta+",w="+fixtures+";if(s.projects.some(x=>x.id===p.id)||d.workItems.some(x=>w.some(y=>x.id===y.id)))throw Error('Synthetic fixture ID collision');s.projects.push(p);d.projectMeta[p.id]=m;d.workItems.push(...w);D4Prototype.repo.batch(()=>{D4Prototype.repo.replaceState(s);D4Prototype.repo.updateDemo(()=>d);});return true;})()");h.settle();
            c.stage("synthetic-time-fixture-installed");JSONObject beforeProject=c.project();
            h.openPage("projects");h.tap(action("work-edit-project",c.projectId));
            c.timeField(PROJECT_FORM,"dueDate",projectDue,"2032-05-07","07:04",true);
            h.typeText(PROJECT_FORM+" [name=description]","Project description edited through Android keys");c.submit(PROJECT_FORM);
            transition(beforeProject,c.project(),"编辑项目","description");require(projectDue.equals(c.project().getString("dueDate")),"Unchanged project date/time preserves exact seconds, fraction and offset");
            for(String id:new String[]{minute,precise}) {
                JSONObject before=c.work(id);boolean historical=id.equals(precise);
                h.openPage("work-items");h.tap(action("work-work-detail",id));c.editWorkDetail(id);
                c.timeField(WORK_FORM,"plannedStart",before.getString("plannedStart"),"2032-05-07",historical?"07:04":"09:15",historical);
                c.timeField(WORK_FORM,"dueDate",before.getString("dueDate"),"2032-05-07",historical?"20:30":"17:45",historical);
                h.typeText(WORK_FORM+" [name=notes]","Unrelated native edit retains time "+id);c.submit(WORK_FORM);
                JSONObject after=c.work(id);transition(before,after,"编辑工作事项","notes");
                require(before.getString("plannedStart").equals(after.getString("plannedStart"))&&before.getString("dueDate").equals(after.getString("dueDate")),"Notes-only native save retains exact start/due timestamp strings");
                c.stage(historical?"precise-time-preserved":"minute-time-preserved");
            }
            c.assertProtected();c.recreateAndCompare();h.openPage("work-items");h.tap(action("work-work-detail",precise));
            require(Boolean.TRUE.equals(h.js("document.querySelector('.modal').textContent.includes('2032-05-07T04:34:56.789+05:30')&&document.querySelector('.modal').textContent.includes('2032-05-07T12:30:59.007Z')")),"Recreated work detail exposes both exact historical original strings");
            c.stage("recreated-time-detail");h.shot("android-native-work-time-preserved");
        });
    }

    private static JSONObject timeWork(String id,String projectId,String title,String start,String due) throws Exception {
        return new JSONObject().put("id",id).put("projectId",projectId).put("title",title).put("status","planned").put("owner","Time owner").put("description","Complete synthetic historical form fields")
            .put("notes","Original historical note").put("priority","normal").put("processId","").put("plannedStart",start).put("dueDate",due).put("archived",false).put("archivedAt","")
            .put("attachments",new JSONArray()).put("completedAt","").put("createdAt","2030-01-02T03:04:05Z").put("history",new JSONArray())
            .put("nativeSentinel",new JSONObject().put("nested",new JSONArray().put("raw retained").put(17)));
    }
    private static void run(Host h,String name,Body body) throws Exception {
        Case c=new Case(h,name);Throwable failure=null;
        try{c.setup();body.run(c);c.receipt.put("bodyCompleted",true);}
        catch(Exception|Error error){failure=error;try{c.receipt.put("failure",error.toString());c.flushTrace();c.receipt.put("failureUi",nativeTree(h));c.save();h.shot("failure-"+name);}catch(Exception|Error extra){error.addSuppressed(extra);}throw error;}
        finally{try{c.cleanup();}catch(Exception|Error error){if(failure!=null)failure.addSuppressed(error);else throw error;}}
    }
    private static final class Case {
        final Host h;final String name,token;final JSONObject receipt=new JSONObject();final JSONArray stages=new JSONArray(),segments=new JSONArray(),nativeSelections=new JSONArray(),workIds=new JSONArray();
        String oldState,oldDemo,storageKey,oldStorage,protectedBefore,projectId="";boolean snapshotReady,nativeSelectOpen;
        Case(Host h,String name){this.h=h;this.name=name;token=Long.toHexString(SystemClock.elapsedRealtimeNanos());}
        void setup() throws Exception {
            h.home();oldState=(String)h.js("JSON.stringify(D4Prototype.repo.state)");oldDemo=(String)h.js("JSON.stringify(D4Prototype.repo.demo)");storageKey=(String)h.js("D4Prototype.storageKey");
            Object raw=h.js("localStorage.getItem(D4Prototype.storageKey)");oldStorage=raw==JSONObject.NULL?null:(String)raw;snapshotReady=true;
            receipt.put("case",name).put("sourceSha",BuildInfo.SOURCE_SHA).put("runId",BuildInfo.RUN_ID).put("runAttempt",BuildInfo.RUN_ATTEMPT).put("syntheticOnly",true)
                .put("originalStateSha256",hash(oldState)).put("originalDemoSha256",hash(oldDemo)).put("stages",stages).put("eventSegments",segments).put("nativeSelections",nativeSelections);
            // The real Clear Filter action executes the existing work transaction, which
            // materializes task-link/archive bookkeeping before the tested CRUD baseline.
            h.openPage("projects");h.tap(action("work-reset-filter","projects"));
            JSONObject canonicalFixture=(JSONObject)h.js("({taskLinks:D4Prototype.repo.demo.taskLinks,archivedTaskIds:D4Prototype.repo.demo.archivedTaskIds,taskArchiveTimes:D4Prototype.repo.demo.taskArchiveTimes})");
            receipt.put("syntheticCanonicalFixture",canonicalFixture).put("fixturePreparation","Real projects Clear Filter action; original state/demo/raw storage captured before preparation");protectedBefore=protectedState();
            beginTrace();save();
        }
        JSONObject project() throws Exception{return (JSONObject)h.js("D4Prototype.getState().projects.find(p=>p.id==="+q(projectId)+")");}
        JSONObject work(String id) throws Exception{return (JSONObject)h.js("D4Prototype.repo.demo.workItems.find(w=>w.id==="+q(id)+")");}
        String protectedState() throws Exception {
            return canonical(h.js("(function(){var s=D4Prototype.repo.state,d=D4Prototype.repo.demo,p="+q(projectId)+",ids="+workIds+";s.projects=s.projects.filter(x=>x.id!==p);var m=structuredClone(d.projectMeta||{});delete m[p];return {state:s,projectMeta:m,workItems:d.workItems.filter(w=>!ids.includes(w.id)),taskLinks:d.taskLinks,archivedTaskIds:d.archivedTaskIds,taskArchiveTimes:d.taskArchiveTimes,templates:d.templates,processes:d.processes,contacts:d.contacts};})()"));
        }
        void assertProtected() throws Exception {require(protectedBefore.equals(protectedState()),"All pre-existing core fields, work objects, task associations and unrelated work modules remain exact");}
        void created(JSONObject object,String action) throws Exception {JSONArray history=object.getJSONArray("history");require(history.length()==1&&action.equals(history.getJSONObject(0).getString("action"))&&!object.getString("createdAt").isEmpty(),"Real create has one creation audit and recorded creation time");}
        void submit(String selector) throws Exception {
            String form=(String)h.js("document.querySelector("+q(selector)+").dataset.form");int before=countEvent("submit",form,null);
            h.tap(selector+" button[type=submit]");await(h,"!document.querySelector("+q(selector)+")","Real work form submit closes the editor");
            require(countEvent("submit",form,null)==before+1,"Exactly one trusted native form submit performs the save");
        }
        void editWorkDetail(String id) throws Exception {
            // The background list also has this action/ID. Select the current detail footer explicitly.
            String selector=".modal-body > footer "+action("work-edit-work-item",id);
            JSONObject target=(JSONObject)h.js("(function(){var selector="+q(selector)+",all=Array.from(document.querySelectorAll("+q(action("work-edit-work-item",id))+"));return {selector:selector,modalCount:document.querySelectorAll('.modal').length,scopedCount:document.querySelectorAll(selector).length,editorCount:document.querySelectorAll('[data-form=work-work-item]').length,candidates:all.map(e=>({text:e.textContent,inModal:!!e.closest('.modal'),inDetailFooter:!!e.closest('.modal-body > footer')}))};})()");
            stages.put(new JSONObject().put("stage","detail-edit-target").put("workItemId",id).put("observation",target));save();
            require(target.getInt("modalCount")==1&&target.getInt("scopedCount")==1&&target.getInt("editorCount")==0,"Exactly one current detail footer exposes the intended work edit action");
            int before=workEditClicks(id,false),beforeScoped=workEditClicks(id,true);
            h.tap(selector);
            await(h,"(function(){var f=document.querySelector('[data-form=work-work-item]');return !!f&&f.elements.namedItem('id').value==="+q(id)+";})()","One detail-footer tap opens the editor for the exact work item");
            int clicks=workEditClicks(id,false)-before,scopedClicks=workEditClicks(id,true)-beforeScoped;
            stages.put(new JSONObject().put("stage","detail-edit-opened").put("workItemId",id).put("selector",selector).put("trustedActionClickDelta",clicks).put("trustedDetailFooterClickDelta",scopedClicks));save();
            require(clicks==1&&scopedClicks==1,"Exactly one trusted current-detail footer click opens the work editor");
        }
        int workEditClicks(String id,boolean detailFooter) throws Exception {return ((Number)h.js("window.__d403NativeWorkTrace.events.filter(e=>e.type==='click'&&e.trusted&&e.action==='work-edit-work-item'&&e.id==="+q(id)+(detailFooter?"&&e.detailFooter":"")+").length")).intValue();}
        void select(String selector,String value) throws Exception {
            JSONObject option=(JSONObject)h.js("(function(){var e=document.querySelector("+q(selector)+"),a=Array.from(e.options).filter(o=>o.value==="+q(value)+");if(a.length!==1||a[0].disabled)throw Error('Expected one enabled exact project option');return {label:a[0].textContent,value:a[0].value,form:e.form.dataset.form,name:e.name};})()");
            int before=countEvent("change",option.getString("form"),option.getString("name"));
            Rect target=awaitNativeOption(selector,option);
            long down=SystemClock.uptimeMillis();boolean released=false;Throwable inputFailure=null;
            try{inject(h,down,MotionEvent.ACTION_DOWN,target.exactCenterX(),target.exactCenterY());inject(h,down,MotionEvent.ACTION_UP,target.exactCenterX(),target.exactCenterY());released=true;}
            catch(Exception|Error error){inputFailure=error;throw error;}
            finally{if(!released)try{inject(h,down,MotionEvent.ACTION_CANCEL,target.exactCenterX(),target.exactCenterY());}catch(Exception|Error cancel){if(inputFailure!=null)inputFailure.addSuppressed(cancel);else throw cancel;}}
            h.settle();require(value.equals(h.js("document.querySelector("+q(selector)+").value")),"One actual native option tap selects the exact project ID");
            require(nativeOptionCount(h)==0&&Boolean.TRUE.equals(h.js("document.hasFocus()")),"Native option popup closes and Web document regains focus");nativeSelectOpen=false;
            require(countEvent("change",option.getString("form"),option.getString("name"))==before+1,"Native project selection emits exactly one trusted change");
        }
        Rect awaitNativeOption(String selector,JSONObject option) throws Exception {
            String app=h.instrumentation().getTargetContext().getPackageName();
            JSONObject selection=new JSONObject().put("selector",selector).put("option",option);
            JSONArray observations=new JSONArray();selection.put("readinessObservations",observations);
            nativeSelections.put(selection);save();
            final Rect[] selected={null};final Throwable[] error={null};final int[] openingTaps={0};
            long started=SystemClock.uptimeMillis();
            android.view.accessibility.AccessibilityEvent ready=null;
            Throwable thrown=null;
            try {
                // Subscribe before the only opening tap. Readiness observes native content;
                // it never repeats the action, sleeps, selects by JavaScript or relaxes the target.
                ready=h.instrumentation().getUiAutomation().executeAndWaitForEvent(()->{
                    nativeSelectOpen=true;openingTaps[0]++;
                    try{h.tap(selector);}catch(Exception|Error failure){error[0]=failure;throw new IllegalStateException("Native select opening tap failed",failure);}
                },event->{
                    int type=event.getEventType();
                    if(type!=android.view.accessibility.AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                        &&type!=android.view.accessibility.AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
                        &&type!=android.view.accessibility.AccessibilityEvent.TYPE_WINDOWS_CHANGED)return false;
                    CharSequence eventPackage=event.getPackageName();
                    if(eventPackage!=null&&!app.equals(eventPackage.toString()))return false;
                    try {
                        require(observations.length()<64,"Native select readiness evidence remains bounded");
                        JSONObject observation=new JSONObject().put("eventType",type).put("eventTime",event.getEventTime())
                            .put("observedUptimeMillis",SystemClock.uptimeMillis()).put("eventPackage",eventPackage==null?JSONObject.NULL:eventPackage.toString());
                        observations.put(observation);
                        AccessibilityNodeInfo root=h.instrumentation().getUiAutomation().getRootInActiveWindow();
                        observation.put("rootPresent",root!=null);if(root==null)return false;
                        List<Rect> targets=new ArrayList<>();Rect window=new Rect();JSONArray tree=new JSONArray();
                        try {
                            observation.put("rootPackage",String.valueOf(root.getPackageName())).put("windowId",root.getWindowId());
                            require(app.equals(String.valueOf(root.getPackageName())),"Native select belongs to the isolated app");
                            root.getBoundsInScreen(window);collectOption(root,option.getString("label"),targets,tree,new int[]{0});
                        } finally {root.recycle();}
                        observation.put("window",window.toShortString()).put("tree",tree).put("exactVisibleEnabledMatches",targets.size());
                        selection.put("tree",tree);
                        require(targets.size()<=1,"Native project label must never be ambiguous");
                        if(targets.isEmpty())return false;
                        require(targets.size()==1,"One visible native CheckedTextView has the exact observed project label");
                        Rect target=targets.get(0);require(target.intersect(window)&&target.width()>2&&target.height()>2,"Native option has visible clipped bounds");
                        selected[0]=new Rect(target);selection.put("readyTarget",target.toShortString());return true;
                    } catch(Exception|Error failure){error[0]=failure;throw new IllegalStateException("Native select readiness observation failed",failure);}
                },10000L);
                require(selected[0]!=null,"Native select accessibility window exposes the exact option before touch");
                require(openingTaps[0]==1,"Native select is opened by exactly one tap invocation");
                selection.put("readinessWaitMs",SystemClock.uptimeMillis()-started);
                return selected[0];
            } catch(Exception|Error failure) {
                Throwable original=error[0]==null?failure:error[0];thrown=original;selection.put("readinessFailure",original.toString());
                if(original instanceof Exception)throw (Exception)original;throw (Error)original;
            } finally {
                if(ready!=null)ready.recycle();
                try{selection.put("openingTapInvocationCount",openingTaps[0]);save();}
                catch(Exception|Error saveFailure){if(thrown!=null)thrown.addSuppressed(saveFailure);else throw saveFailure;}
            }
        }
        void timeField(String form,String key,String raw,String date,String time,boolean precise) throws Exception {
            JSONObject shown=(JSONObject)h.js("(function(){var f=document.querySelector("+q(form)+");return {date:f.elements.namedItem("+q(key)+").value,time:f.elements.namedItem("+q(key+"Time")+").value,original:JSON.parse(f.elements.namedItem("+q(key+"Original")+").value),note:f.querySelector('[data-time-original="+key+"]').textContent};})()");
            require(date.equals(shown.getString("date"))&&time.equals(shown.getString("time")),"Actual form displays the expected Beijing date and minute");
            require(shown.getJSONObject("original").getBoolean("present")&&raw.equals(shown.getJSONObject("original").getString("value")),"Actual form retains the exact original time field");
            require(!precise||shown.getString("note").contains(raw),"Precise historical form explains the exact original timestamp");
            stages.put(new JSONObject().put("stage","observed-time-field").put("field",key).put("observation",shown));save();
        }
        void stage(String stage) throws Exception {
            JSONObject data=(JSONObject)h.js("(function(){var s=D4Prototype.getState(),ids="+workIds+",p=s.projects.find(x=>x.id==="+q(projectId)+");return {project:p||null,workItems:s.workItems.filter(w=>ids.includes(w.id)),persistence:D4Prototype.repo.persistence()};})()");
            stages.put(new JSONObject().put("stage",stage).put("wallMillis",System.currentTimeMillis()).put("data",data));save();
        }
        String exactObjects() throws Exception{return (String)h.js("JSON.stringify({project:D4Prototype.getState().projects.find(p=>p.id==="+q(projectId)+")||null,workItems:D4Prototype.repo.demo.workItems.filter(w=>"+workIds+".includes(w.id))})");}
        void recreateAndCompare() throws Exception {
            String expected=exactObjects();stage("before-activity-recreation");flushTrace();h.recreate();beginTrace();
            require(Boolean.TRUE.equals(h.js("D4Prototype.repo.persistence().loaded")),"Recreated Activity loaded persisted isolated state");
            require(expected.equals(exactObjects()),"Activity recreation retains the exact project, work items, histories and time strings");assertProtected();stage("after-activity-recreation");
        }
        void beginTrace() throws Exception {
            h.js("(function(){if(window.__d403NativeWorkTrace)throw Error('Work trace already installed');var events=[],dropped=0,types=['input','change','submit','click'];var listener=e=>{var f=e.target.closest?.('form[data-form]'),a=e.target.closest?.('[data-action]');if(!(f?.dataset.form.startsWith('work-')||a?.dataset.action.startsWith('work-')))return;if(events.length>=512){dropped++;return;}events.push({type:e.type,trusted:e.isTrusted,form:f?.dataset.form||'',name:e.target.name||'',action:a?.dataset.action||'',id:a?.dataset.id||'',detailFooter:!!a?.closest('.modal-body > footer'),wallMillis:Date.now()});};types.forEach(t=>document.addEventListener(t,listener,true));window.__d403NativeWorkTrace={events:events,read:()=>({events:events,dropped:dropped}),dispose:()=>types.forEach(t=>document.removeEventListener(t,listener,true))};return true;})()");
        }
        int countEvent(String type,String form,String name) throws Exception {return ((Number)h.js("window.__d403NativeWorkTrace.events.filter(e=>e.trusted&&e.type==="+q(type)+"&&e.form==="+q(form)+(name==null?"":"&&e.name==="+q(name))+").length")).intValue();}
        void flushTrace() throws Exception {
            Object trace=h.js("(function(){var t=window.__d403NativeWorkTrace;if(!t)return null;var x=t.read();t.dispose();delete window.__d403NativeWorkTrace;return x;})()");
            if(trace instanceof JSONObject){segments.put(trace);save();require(((JSONObject)trace).getInt("dropped")==0,"Native work evidence trace did not truncate");}
        }
        void save() throws Exception {h.write(name+".json",receipt.toString(2));}
        void cleanup() throws Exception {
            Throwable failed=null;
            try{flushTrace();}catch(Exception|Error error){failed=error;}
            if(snapshotReady)try{
                if(nativeSelectOpen){if(nativeOptionCount(h)>0)h.back();require(nativeOptionCount(h)==0,"Owned native select is dismissed before cleanup");nativeSelectOpen=false;}h.launch();h.home();
                JSONObject restored=(JSONObject)h.js("(function(){D4Prototype.repo.batch(()=>{D4Prototype.repo.replaceState(JSON.parse("+q(oldState)+"));D4Prototype.repo.updateDemo(()=>JSON.parse("+q(oldDemo)+"));});var state=JSON.stringify(D4Prototype.repo.state),demo=JSON.stringify(D4Prototype.repo.demo);"+(oldStorage==null?"localStorage.removeItem("+q(storageKey)+");":"localStorage.setItem("+q(storageKey)+","+q(oldStorage)+");")+"return {state:state,demo:demo,storage:localStorage.getItem("+q(storageKey)+")};})()");
                require(oldState.equals(restored.getString("state"))&&oldDemo.equals(restored.getString("demo")),"Cleanup restores exact captured synthetic state and demo");
                require(oldStorage==null?restored.isNull("storage"):oldStorage.equals(restored.getString("storage")),"Cleanup restores the exact captured raw storage entry");
                receipt.put("cleanup",new JSONObject().put("stateRestored",true).put("demoRestored",true).put("rawStorageRestored",true));
            }catch(Exception|Error error){if(failed==null)failed=error;else failed.addSuppressed(error);receipt.put("cleanupError",error.toString());}
            try{save();}catch(Exception|Error error){if(failed==null)failed=error;else failed.addSuppressed(error);}
            if(failed instanceof Exception)throw (Exception)failed;if(failed instanceof Error)throw (Error)failed;
        }
    }

    private static void transition(JSONObject before,JSONObject after,String action,String... changed) throws Exception {
        JSONObject left=new JSONObject(before.toString()),right=new JSONObject(after.toString());
        for(String key:changed){left.remove(key);right.remove(key);}left.remove("history");right.remove("history");left.remove("updatedAt");right.remove("updatedAt");
        require(canonical(left).equals(canonical(right)),"Only explicit fields, audit history and updatedAt change for "+action);
        JSONArray previous=before.getJSONArray("history"),next=after.getJSONArray("history");require(next.length()==previous.length()+1,"Exactly one audit is appended for "+action);
        for(int i=0;i<previous.length();i++)require(canonical(previous.get(i)).equals(canonical(next.get(i))),"Prior audit rows remain exact");
        JSONObject audit=next.getJSONObject(next.length()-1),snapshot=new JSONObject(before.toString());snapshot.remove("history");
        require(action.equals(audit.getString("action"))&&after.getString("updatedAt").equals(audit.getString("at")),"New audit action and modification time agree");
        require(canonical(snapshot).equals(canonical(audit.getJSONObject("before"))),"Audit before snapshot retains every prior raw field");
    }
    private static String canonical(Object value) throws Exception {
        if(value instanceof JSONObject){JSONObject row=(JSONObject)value;TreeSet<String> keys=new TreeSet<>();Iterator<String> iterator=row.keys();while(iterator.hasNext())keys.add(iterator.next());StringBuilder result=new StringBuilder("{");boolean first=true;for(String key:keys){if(!first)result.append(',');first=false;result.append(q(key)).append(':').append(canonical(row.get(key)));}return result.append('}').toString();}
        if(value instanceof JSONArray){JSONArray list=(JSONArray)value;StringBuilder result=new StringBuilder("[");for(int i=0;i<list.length();i++){if(i>0)result.append(',');result.append(canonical(list.get(i)));}return result.append(']').toString();}
        return value instanceof String?q((String)value):String.valueOf(value);
    }
    private static void collectOption(AccessibilityNodeInfo node,String label,List<Rect> matches,JSONArray rows,int[] count) throws Exception {
        require(++count[0]<=400,"Bounded native select accessibility traversal");Rect bounds=new Rect();node.getBoundsInScreen(bounds);
        rows.put(new JSONObject().put("class",String.valueOf(node.getClassName())).put("text",String.valueOf(node.getText())).put("visible",node.isVisibleToUser()).put("enabled",node.isEnabled()).put("bounds",bounds.toShortString()));
        if("android.widget.CheckedTextView".equals(String.valueOf(node.getClassName()))&&label.equals(String.valueOf(node.getText()))&&node.isVisibleToUser()&&node.isEnabled()&&bounds.width()>2&&bounds.height()>2)matches.add(bounds);
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null)try{collectOption(child,label,matches,rows,count);}finally{child.recycle();}}
    }
    private static JSONArray nativeTree(Host h) throws Exception {JSONArray rows=new JSONArray();AccessibilityNodeInfo root=h.instrumentation().getUiAutomation().getRootInActiveWindow();if(root!=null)try{collectOption(root,"",new ArrayList<>(),rows,new int[]{0});}finally{root.recycle();}return rows;}
    private static int nativeOptionCount(Host h) throws Exception {JSONArray rows=nativeTree(h);require(rows.length()>0,"Observe foreground accessibility tree when checking native select dismissal");int count=0;for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);if(row.getBoolean("visible")&&"android.widget.CheckedTextView".equals(row.getString("class")))count++;}return count;}
    private static void inject(Host h,long down,int action,float x,float y){
        MotionEvent.PointerProperties pointer=new MotionEvent.PointerProperties();pointer.id=0;pointer.toolType=MotionEvent.TOOL_TYPE_FINGER;
        MotionEvent.PointerCoords position=new MotionEvent.PointerCoords();position.x=x;position.y=y;position.size=1f;position.pressure=action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL?0f:1f;
        MotionEvent event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,1,new MotionEvent.PointerProperties[]{pointer},new MotionEvent.PointerCoords[]{position},0,0,1f,1f,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
        require(event!=null,"Native option finger event is created");
        try{require(event.getToolType(0)==MotionEvent.TOOL_TYPE_FINGER&&event.getSource()==InputDevice.SOURCE_TOUCHSCREEN,"Native option uses an explicit finger touchscreen event");require(h.instrumentation().getUiAutomation().injectInputEvent(event,true),"Actual native option MotionEvent is injected");}finally{event.recycle();}
    }
    private static void await(Host h,String condition,String message) throws Exception {long end=SystemClock.elapsedRealtime()+10000;while(SystemClock.elapsedRealtime()<end){if(Boolean.TRUE.equals(h.js(condition)))return;SystemClock.sleep(100);}throw new AssertionError(message);}
    private static String action(String name,String id){return "[data-action="+name+"][data-id="+q(id)+"]";}
    private static String q(String value){return JSONObject.quote(value);}
    private static String hash(String text) throws Exception {StringBuilder result=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)))result.append(String.format(Locale.ROOT,"%02x",b&255));return result.toString();}
    private static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);}
}
