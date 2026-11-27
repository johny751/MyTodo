package local.gxtodo.replica;

import android.os.SystemClock;
import android.webkit.WebView;
import local.gxtodo.d403preview.BuildInfo;
import org.json.JSONObject;
import java.io.File;

/** Separate actual WebView UI suite. Only fixture setup and read-only assertions use JavaScript. */
final class D408WorkPreservationChecks {
    final D408IntegrationInstrumentation t;
    final String phase;
    final int width;
    int observedWidth=-1;
    WebView web;
    D408WorkPreservationChecks(D408IntegrationInstrumentation t,String phase){this.t=t;this.phase=phase;this.width=Integer.parseInt(phase.substring("work-preservation-".length()));}
    static void run(D408IntegrationInstrumentation t,String phase){
        D408WorkPreservationChecks s=new D408WorkPreservationChecks(t,phase);
        s.test("W01-template-noop-rich-steps-and-instance-snapshot",s::template);
        s.test("W02-missing-relations-unknown-fields-and-exact-time",s::relations);
    }
    void test(String name,D408IntegrationInstrumentation.Check action){
        t.test("D408-"+phase+"-"+name,()->{try{return action.run();}catch(Exception|AssertionError failure){try{t.shot("failure-"+phase+"-"+name);if(web!=null)D408IntegrationInstrumentation.write(new File(t.evidence,"failure-"+phase+"-"+name+"-dom.txt"),t.js(web,"document.body.innerText"));}catch(Exception diagnostic){failure.addSuppressed(diagnostic);}throw failure;}});
        try{t.cases.getJSONObject(t.cases.length()-1).put("phase",phase).put("width",width).put("observedWidth",observedWidth<0?JSONObject.NULL:observedWidth).put("sourceSHA",BuildInfo.SOURCE_SHA).put("runId",BuildInfo.RUN_ID).put("runAttempt",BuildInfo.RUN_ATTEMPT);}catch(Exception error){throw new IllegalStateException("work-preservation case identity unavailable",error);}
    }
    void ready()throws Exception{
        observedWidth=-1;web=null;t.foreground();web=((D408Activity)t.current).previewWebView();
        t.until("work preservation WebView ready",15000,()->"true".equals(t.js(web,"!!window.D4Prototype&&!!window.DemoMobileControls")));
        observedWidth=Integer.parseInt(t.js(web,"innerWidth"));D408IntegrationInstrumentation.check(observedWidth==width,"observed work-preservation CSS width "+observedWidth+" equals target "+width);
    }
    void route(String route)throws Exception{t.js(web,"D4Prototype.navigate("+JSONObject.quote(route)+");DemoMobileControls.nav(false)");SystemClock.sleep(200);}
    void check(String expression,String label)throws Exception{D408IntegrationInstrumentation.check("true".equals(t.js(web,"!!("+expression+")")),label);}
    void action(String action,String id)throws Exception{t.webTap(web,"[data-action='"+action+"'][data-id='"+id+"']");}
    String field(String form,String name){return "[data-form='"+form+"'] [name='"+name+"']";}
    void submit(String form)throws Exception{t.webTap(web,"[data-form='"+form+"'] button[type=submit]");t.until("actual work form saved: "+form,10000,()->"false".equals(t.js(web,"!!document.querySelector("+JSONObject.quote("[data-form='"+form+"']")+")")));}
    String entity(String kind,String id){return "D4Prototype.getState()."+kind+".find(x=>x.id==="+JSONObject.quote(id)+")";}
    JSONObject read(String expression)throws Exception{return new JSONObject(t.js(web,expression));}
    void same(String actual,String expected,String label)throws Exception{
        // Compare all keys, primitive types and array positions, independent of object-key serialization order.
        check("((a,b)=>{const eq=(x,y)=>{if(Object.is(x,y))return true;if(!x||!y||typeof x!=='object'||typeof y!=='object'||Array.isArray(x)!==Array.isArray(y))return false;const xk=Object.keys(x).sort(),yk=Object.keys(y).sort();return xk.length===yk.length&&xk.every((k,i)=>k===yk[i]&&eq(x[k],y[k]));};return eq(a,b);})("+actual+","+expected+")",label);
    }
    void retained(String expression,JSONObject before,String... fields)throws Exception{for(String field:fields){String key=JSONObject.quote(field);same("("+expression+")["+key+"]","("+before+")["+key+"]","retained exact historical field "+field);}}
    JSONObject template()throws Exception{
        ready();String id="d408-rich-template-"+width;
        JSONObject original=new JSONObject("""
          {"name":"D408 rich original","version":7,"enabled":true,"archived":false,"history":[],"extension":{"owner":"retained","nullField":null},"steps":[{"id":"step-a","title":"Repeated","description":"full original description","extra":{"bytes":[0,255,1]}},{"id":"step-b","title":"Repeated","description":null,"extra":"second same-name step"},{"id":"step-c","title":"Tail","optional":false}]}
          """).put("id",id).put("name","D408 rich original "+width);
        t.js(web,"D4Prototype.repo.updateDemo(d=>{d.templates.push("+original+");});true");String selected=entity("templates",id);
        route("templates");action("work-edit-template",id);submit("work-template");
        check(selected+".version===7&&!Object.hasOwn("+selected+",'description')","native no-op keeps version and absent description");retained(selected,original,"steps","extension");
        action("work-edit-template",id);t.webType(web,field("work-template","stepLines"),"Tail\nRepeated\nRepeated");submit("work-template");
        check(selected+".version===8","actual reorder increments version once");
        same(selected+".steps","[("+original+").steps[2],("+original+").steps[0],("+original+").steps[1]]","duplicate step titles keep distinct exact original objects");
        JSONObject reordered=read(selected);String processName="D408 rich snapshot "+width;
        action("work-process-from-template",id);t.webType(web,field("work-process","name"),processName);submit("work-process");
        String instance="D4Prototype.getState().processes.find(x=>x.name==="+JSONObject.quote(processName)+")";
        check(instance+".templateVersion===8","actual create captures template version8");same(instance+".templateSnapshot.steps",selected+".steps","actual create preserves complete template step snapshot");JSONObject snapshot=read(instance);
        route("templates");action("work-edit-template",id);t.webType(web,field("work-template","stepLines"),"Tail\nRepeated\nRepeated\nNew step");submit("work-template");
        check(selected+".version===9","later template change increments version once");same(selected+".steps.slice(0,3)","("+reordered+").steps","later template change retains all old step metadata");
        same(instance,snapshot.toString(),"editing template never rewrites existing instance");
        action("work-edit-template",id);submit("work-template");check(selected+".version===9","second no-op keeps version9");JSONObject saved=read(selected);t.shot(phase+"-rich-template-saved");
        ready();same(selected,saved.toString(),"Activity reopen retains every rich template field");same(instance,snapshot.toString(),"Activity reopen retains original instance snapshot");
        return new JSONObject().put("width",width).put("templateBefore",original).put("templateAfter",saved).put("instance",snapshot).put("versions","7,8,9,9").put("uiInput","real WebView taps and key events; synthetic repository setup only").put("reopened",true);
    }
    JSONObject relations()throws Exception{
        ready();String workId="d408-missing-work-"+width,processId="d408-missing-process-"+width,contactId="d408-missing-contact-"+width,followupId="d408-missing-followup-"+width;
        JSONObject work=new JSONObject("""
          {"title":"D408 missing relations","projectId":"historical-missing-project","processId":"historical-missing-process","status":"waiting","owner":"Original owner","priority":"high","description":"Original description","notes":"Original notes","plannedStart":"2032-05-07T04:34:56.789+05:30","dueDate":"2032-05-07T12:30:59.007Z","attachments":[],"history":[],"archived":false,"extension":{"nullField":null,"nested":[1,{"raw":"00"}]}}
          """).put("id",workId);
        JSONObject process=new JSONObject("""
          {"name":"D408 missing project process","projectId":"historical-missing-project","templateId":"original-template","templateVersion":3,"templateSnapshot":{"id":"original-template","version":3,"name":"Snapshot","steps":[{"id":"source-step","title":"Retained step","extra":"original"}]},"steps":[{"id":"run-step","sourceStepId":"source-step","title":"Retained step","completed":false}],"status":"paused","currentStep":0,"history":[],"archived":false,"extension":{"original":true}}
          """).put("id",processId);
        JSONObject followup=new JSONObject("""
          {"title":"D408 missing followup","projectId":"historical-missing-project","workItemId":"historical-missing-item","occurredOn":"2032-05-07T04:34:56.789+05:30","dueDate":{"legacy":"unrecognised, preserve exactly"},"notes":"Original followup","status":"pending","history":[],"extension":{"bytes":[0,255],"missingDate":null}}
          """).put("id",followupId);
        JSONObject contact=new JSONObject().put("id",contactId).put("name","D408 retained contact "+width).put("phone","000123").put("email","synthetic@example.invalid").put("role","Reviewer").put("followups",new org.json.JSONArray().put(followup)).put("history",new org.json.JSONArray()).put("archived",false);
        t.js(web,"D4Prototype.repo.updateDemo(d=>{d.workItems.push("+work+");d.processes.push("+process+");d.contacts.push("+contact+");});true");
        String selectedWork=entity("workItems",workId),selectedProcess=entity("processes",processId),selectedFollowup=entity("contacts",contactId)+".followups.find(f=>f.id==="+JSONObject.quote(followupId)+")";
        route("work-items");action("work-edit-work-item",workId);
        check("document.querySelector("+JSONObject.quote(field("work-work-item","projectId"))+").value==='historical-missing-project'&&document.querySelector("+JSONObject.quote(field("work-work-item","processId"))+").value==='historical-missing-process'","actual missing relations remain selected");
        check("/缺失.*原关联保留/.test(document.querySelector('.modal').textContent)","missing-relation preservation is visible");
        t.webType(web,field("work-work-item","notes"),"Edited notes retain relations");submit("work-work-item");
        retained(selectedWork,work,"projectId","processId","plannedStart","dueDate","owner","status","priority","extension");check(selectedWork+".notes==='Edited notes retain relations'","actual note edit persisted");
        route("processes");action("work-edit-process",processId);t.webType(web,field("work-process","name"),"D408 renamed retained process "+width);submit("work-process");retained(selectedProcess,process,"projectId","templateSnapshot","steps","extension");
        route("contacts");action("work-contact-detail",contactId);action("work-edit-followup",contactId+"|"+followupId);
        check("document.querySelector("+JSONObject.quote(field("work-followup","projectId"))+").value==='historical-missing-project'&&document.querySelector("+JSONObject.quote(field("work-followup","workItemId"))+").value==='historical-missing-item'","followup missing selections preserved in actual form");
        t.webType(web,field("work-followup","notes"),"Edited followup retains exact time");submit("work-followup");retained(selectedFollowup,followup,"projectId","workItemId","occurredOn","dueDate","extension");
        JSONObject savedWork=read(selectedWork),savedProcess=read(selectedProcess),savedFollowup=read(selectedFollowup);t.shot(phase+"-missing-relations-saved");
        ready();same(selectedWork,savedWork.toString(),"reopened work item preserves exact saved record");same(selectedProcess,savedProcess.toString(),"reopened process preserves exact saved record");same(selectedFollowup,savedFollowup.toString(),"reopened followup preserves exact offset, precision, unrecognised time and extension");
        return new JSONObject().put("width",width).put("workBefore",work).put("workAfter",savedWork).put("processBefore",process).put("processAfter",savedProcess).put("followupBefore",followup).put("followupAfter",savedFollowup).put("reopened",true).put("uiInput","real WebView edit/save and Activity reopen; no input value assignment or synthetic submit event");
    }
}
