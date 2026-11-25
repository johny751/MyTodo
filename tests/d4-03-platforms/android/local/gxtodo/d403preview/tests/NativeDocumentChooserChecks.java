package local.gxtodo.d403preview.tests;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Instrumentation;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import local.gxtodo.d403preview.MainActivity;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Real system DocumentsUI input only. No FileList assignment or injected ActivityResult. */
final class NativeDocumentChooserChecks {
    interface Host {
        Instrumentation instrumentation();
        MainActivity main();
        Object js(String expression) throws Exception;
        void tap(String selector) throws Exception;
        void typeText(String selector,String text) throws Exception;
        void openPage(String route) throws Exception;
        void home() throws Exception;
        void launch() throws Exception;
        void back();
        void settle();
        void shot(String name) throws Exception;
        void write(String name,String text) throws Exception;
    }
    private interface Body { void run(Case c) throws Exception; }
    private static final String FEEDBACK_INPUT="[data-form=personal-feedback] [name=images]";
    private static final String ATTACHMENT_INPUT="[data-form=work-attachment] [name=attachments]";
    private static final String FIXTURE_DIRECTORY="MyTodo-D403-Fixtures";
    private static final Set<String> IMAGE_TYPES=new HashSet<>(Arrays.asList("image/png","image/jpeg","image/webp","image/gif"));

    static void cancelPreservesDraft(Host h) throws Exception {
        run(h,"documentsui-cancel-draft",c->{
            c.feedbackDraft();
            String form=c.formDraft(),ideas=(String)h.js("JSON.stringify(D4Prototype.repo.demo.personal.feedback.ideas)");
            try(Picker p=c.open(FEEDBACK_INPUT,true)) { p.cancel(); }
            require(form.equals(c.formDraft()),"System picker cancellation retains exact title/body/status and zero selected files");
            require(ideas.equals(h.js("JSON.stringify(D4Prototype.repo.demo.personal.feedback.ideas)")),"Cancellation does not create or change any saved idea");
            // A fresh real request after cancellation establishes that the original callback was released.
            try(Picker p=c.open(FEEDBACK_INPUT,true)) { p.cancel(); }
            require(form.equals(c.formDraft()),"Second cancellation still preserves the exact draft");
            c.assertCore();c.receipt.put("cancelledDraft",new JSONObject(form)).put("freshPickerAfterCancel",true);
            c.save();h.shot("android-documentsui-cancel-draft");
        });
    }

    static void feedbackOriginalAndReload(Host h) throws Exception {
        run(h,"documentsui-feedback-original",c->{
            c.feedbackDraft();
            String protectedState=(String)h.js("JSON.stringify(D4Prototype.getState())");
            int count=((Number)h.js("D4Prototype.repo.demo.personal.feedback.ideas.length")).intValue();
            c.observeFiles(FEEDBACK_INPUT);
            try(Picker p=c.open(FEEDBACK_INPUT,true)) { p.selectFixture(); }
            c.assertSelected(FEEDBACK_INPUT);
            h.tap("[data-form=personal-feedback] button[type=submit]");
            await(h,"D4Prototype.repo.demo.personal.feedback.ideas.some(i=>i.title==="+JSONObject.quote(c.title)+")&&!DemoPersonalPages.isBusy()","Feedback asynchronous save completes");
            require(((Number)h.js("D4Prototype.repo.demo.personal.feedback.ideas.length")).intValue()==count+1,"One real submit creates exactly one idea");
            JSONObject idea=(JSONObject)h.js(c.ideaExpression());
            require(c.body.equals(idea.getString("body"))&&"pending".equals(idea.getString("status")),"Saved feedback text and status match actual form input");
            c.assertFile(idea.getJSONArray("images"),false);
            c.assertDurable();c.assertCore();
            require(protectedState.equals(h.js("JSON.stringify(D4Prototype.getState())")),"Feedback image save preserves all tasks, projects and work objects");
            String saved=idea.toString();c.receipt.put("savedIdea",idea);c.save();
            h.launch();
            c.assertDurable();require(Boolean.TRUE.equals(h.js("D4Prototype.repo.persistence().loaded")),"New Activity loads existing localStorage");
            JSONObject reopened=(JSONObject)h.js(c.ideaExpression());
            require(saved.equals(reopened.toString()),"Fresh Activity reload retains the exact saved feedback object");
            c.assertFile(reopened.getJSONArray("images"),false);c.assertCore();
            h.openPage("feedback");
            h.tap("[data-action=personal-feedback-edit][data-id="+JSONObject.quote(reopened.getString("id"))+"]");
            require(Boolean.TRUE.equals(h.js("document.querySelector('[data-form=personal-feedback]').textContent.includes("+JSONObject.quote(c.fileName)+")")),"Reopened feedback form displays the original image name");
            h.typeText("[data-form=personal-feedback] [name=body]",c.body+" retained image");
            h.tap("[data-form=personal-feedback] button[type=submit]");
            await(h,c.ideaExpression()+".body==="+JSONObject.quote(c.body+" retained image")+"&&!DemoPersonalPages.isBusy()","Body-only edit completes");
            c.assertFile(((JSONObject)h.js(c.ideaExpression())).getJSONArray("images"),false);
            c.assertDurable();c.assertCore();c.receipt.put("reloadVerified",true).put("bodyOnlyEditRetainsImage",true);c.save();
            h.shot("android-documentsui-feedback-original");
        });
    }

    static void attachmentOriginalAndReload(Host h) throws Exception {
        run(h,"documentsui-attachment-original",c->{
            String id="d403-doc-"+c.token;
            h.js("(function(){D4Prototype.repo.updateDemo(d=>{if(d.workItems.some(w=>w.id==="+JSONObject.quote(id)+"))throw Error('Fixture ID collision');d.workItems.push({id:"+JSONObject.quote(id)+",title:"+JSONObject.quote(c.title)+",status:'planned',projectId:'',priority:'normal',owner:'synthetic',plannedStart:'',dueDate:'',notes:'Retain exact work fields',archived:false,attachments:[],createdAt:new Date().toISOString(),nativeChooserSentinel:{nested:['unchanged',17]}});});return true;})()");
            String protectedWork=(String)h.js(workWithoutAttachmentChanges(id));
            h.openPage("work-items");h.tap("[data-action=work-work-detail][data-id="+JSONObject.quote(id)+"]");
            c.observeFiles(ATTACHMENT_INPUT);
            try(Picker p=c.open(ATTACHMENT_INPUT,false)) { p.selectFixture(); }
            c.assertSelected(ATTACHMENT_INPUT);
            h.tap("[data-form=work-attachment] button[type=submit]");
            String work="D4Prototype.repo.demo.workItems.find(w=>w.id==="+JSONObject.quote(id)+")";
            await(h,work+".attachments.length===1&&!DemoWorkPages.isBusy()","Attachment asynchronous save completes");
            JSONObject saved=(JSONObject)h.js(work);c.assertFile(saved.getJSONArray("attachments"),true);
            require(protectedWork.equals(h.js(workWithoutAttachmentChanges(id))),"Only target attachment/history/update timestamp change; all other work fields and work items remain exact");
            c.assertDurable();c.assertCore();c.receipt.put("savedWork",saved);c.save();
            String exact=saved.toString();h.launch();c.assertDurable();
            require(Boolean.TRUE.equals(h.js("D4Prototype.repo.persistence().loaded")),"New Activity loads the attachment from localStorage");
            JSONObject reopened=(JSONObject)h.js(work);require(exact.equals(reopened.toString()),"Fresh Activity reload retains the exact saved work object");
            c.assertFile(reopened.getJSONArray("attachments"),true);c.assertCore();
            h.openPage("work-items");h.tap("[data-action=work-work-detail][data-id="+JSONObject.quote(id)+"]");
            require(Boolean.TRUE.equals(h.js("document.querySelector('.modal').textContent.includes("+JSONObject.quote(c.fileName)+")")),"Reopened work details display the original attachment name");
            c.receipt.put("reloadVerified",true);c.save();h.shot("android-documentsui-attachment-original");
        });
    }

    private static String workWithoutAttachmentChanges(String id) {
        return "JSON.stringify(D4Prototype.repo.demo.workItems.map(w=>{var x=structuredClone(w);if(x.id==="+JSONObject.quote(id)+"){delete x.attachments;delete x.history;delete x.updatedAt;}return x;}))";
    }
    private static void run(Host h,String name,Body body) throws Exception {
        Case c=new Case(h,name);Throwable failure=null;
        try { c.setup();body.run(c); }
        catch(Exception|Error error) {
            failure=error;
            try { c.captureFailure(error); } catch(Exception|Error capture) { error.addSuppressed(capture); }
            throw error;
        } finally {
            try { c.cleanup(); }
            catch(Exception|Error cleanup) { if(failure!=null)failure.addSuppressed(cleanup);else throw cleanup; }
        }
    }

    private static final class Case {
        final Host h;final String name,token,fileName,title,body;
        final JSONObject receipt=new JSONObject();final JSONArray requests=new JSONArray(),resolutionProbes=new JSONArray(),selectors=new JSONArray(),nativeInputs=new JSONArray(),selectionStages=new JSONArray(),cleanupRows=new JSONArray();
        String oldState,oldDemo,oldStorage,storageKey;byte[] bytes;String base64,sha;Uri fixtureUri;String pickerPackage;
        boolean snapshotReady,serviceFlagsChanged;int originalServiceFlags;
        Case(Host h,String name) {
            this.h=h;this.name=name;token=Long.toHexString(SystemClock.elapsedRealtimeNanos());
            fileName="d403-"+token+".png";title="Native picker "+token;body="Original synthetic PNG via real DocumentsUI "+token;
        }
        void setup() throws Exception {
            require(Build.VERSION.SDK_INT>=29,"MediaStore Downloads fixture requires API 29+");h.home();
            oldState=(String)h.js("JSON.stringify(D4Prototype.repo.state)");oldDemo=(String)h.js("JSON.stringify(D4Prototype.repo.demo)");
            storageKey=(String)h.js("D4Prototype.storageKey");Object raw=h.js("localStorage.getItem(D4Prototype.storageKey)");oldStorage=raw==JSONObject.NULL?null:(String)raw;snapshotReady=true;
            receipt.put("case",name).put("syntheticOnly",true).put("coreBeforeSha256",hash(oldState.getBytes(StandardCharsets.UTF_8)))
                .put("requests",requests).put("resolutionProbes",resolutionProbes).put("selectors",selectors).put("nativeInputs",nativeInputs).put("selectionStages",selectionStages).put("cleanup",cleanupRows);
            AccessibilityServiceInfo service=h.instrumentation().getUiAutomation().getServiceInfo();require(service!=null,"Observe existing accessibility service configuration");
            originalServiceFlags=service.flags;service.flags|=AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
            h.instrumentation().getUiAutomation().setServiceInfo(service);serviceFlagsChanged=true;
            verifyPermissions(h.instrumentation().getTargetContext());verifyPermissions(h.instrumentation().getContext());
            final boolean[] settings=new boolean[2];h.instrumentation().runOnMainSync(()->{settings[0]=h.main().previewWebView().getSettings().getAllowContentAccess();settings[1]=h.main().previewWebView().getSettings().getAllowFileAccess();});
            require(!settings[0]&&!settings[1],"File and content URL access remain disabled during real picker evidence");
            receipt.put("allowContentAccess",settings[0]).put("allowFileAccess",settings[1]);
            Bitmap bitmap=Bitmap.createBitmap(2,2,Bitmap.Config.ARGB_8888);ByteArrayOutputStream buffer=new ByteArrayOutputStream();
            try { bitmap.setPixels(new int[]{0xff1565c0,0xffef6c00,0xff2e7d32,0xff6a1b9a},0,2,0,0,2,2);require(bitmap.compress(Bitmap.CompressFormat.PNG,100,buffer),"Synthetic PNG encoding succeeds");bytes=buffer.toByteArray(); }
            finally { bitmap.recycle();buffer.close(); }
            base64=Base64.encodeToString(bytes,Base64.NO_WRAP);sha=hash(bytes);
            ContentValues pending=new ContentValues();pending.put(MediaStore.MediaColumns.DISPLAY_NAME,fileName);pending.put(MediaStore.MediaColumns.MIME_TYPE,"image/png");
            pending.put(MediaStore.MediaColumns.RELATIVE_PATH,"Download/"+FIXTURE_DIRECTORY+"/");pending.put(MediaStore.MediaColumns.IS_PENDING,1);
            ContentResolver resolver=h.instrumentation().getTargetContext().getContentResolver();
            fixtureUri=resolver.insert(MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY),pending);require(fixtureUri!=null,"Own synthetic MediaStore fixture created");
            try(OutputStream output=resolver.openOutputStream(fixtureUri,"w")) { require(output!=null,"Own fixture output stream exists");output.write(bytes); }
            ContentValues published=new ContentValues();published.put(MediaStore.MediaColumns.IS_PENDING,0);require(resolver.update(fixtureUri,published,null,null)==1,"Only the created fixture is made visible");
            try(Cursor cursor=resolver.query(fixtureUri,new String[]{MediaStore.MediaColumns.DISPLAY_NAME,MediaStore.MediaColumns.SIZE,MediaStore.MediaColumns.MIME_TYPE},null,null,null)) {
                require(cursor!=null&&cursor.moveToFirst()&&cursor.getCount()==1,"Exact fixture URI resolves to one owned row");
                require(fileName.equals(cursor.getString(0))&&cursor.getLong(1)==bytes.length&&"image/png".equals(cursor.getString(2)),"Provider fixture metadata matches exact synthetic bytes");
            }
            receipt.put("fixture",new JSONObject().put("uri",fixtureUri).put("name",fileName).put("mime","image/png").put("byteLength",bytes.length).put("sha256",sha));save();
        }
        void verifyPermissions(Context context) throws Exception {
            PackageInfo info=context.getPackageManager().getPackageInfo(context.getPackageName(),PackageManager.GET_PERMISSIONS);JSONArray names=new JSONArray();
            if(info.requestedPermissions!=null)for(String permission:info.requestedPermissions) {
                names.put(permission);
                require(!permission.contains("INTERNET")&&!permission.contains("STORAGE")&&!permission.contains("READ_MEDIA")&&!permission.contains("CAMERA")&&!permission.contains("ACCOUNTS"),"No network/storage/media/camera/account permission: "+permission);
            }
            receipt.put(context.getPackageName()+".requestedPermissions",names);
        }
        void feedbackDraft() throws Exception {
            h.openPage("feedback");h.tap("[data-action=personal-feedback-new]");
            h.typeText("[data-form=personal-feedback] [name=title]",title);h.typeText("[data-form=personal-feedback] [name=body]",body);
            require(Boolean.TRUE.equals(h.js("document.querySelector('"+FEEDBACK_INPUT+"').files.length===0")),"New real feedback draft has no files");
        }
        String formDraft() throws Exception {
            return (String)h.js("(function(){var f=document.querySelector('[data-form=personal-feedback]');return JSON.stringify({title:f.elements.title.value,body:f.elements.body.value,status:f.elements.status.value,files:f.elements.images.files.length});})()");
        }
        String ideaExpression() { return "D4Prototype.repo.demo.personal.feedback.ideas.find(i=>i.title==="+JSONObject.quote(title)+")"; }
        void observeFiles(String selector) throws Exception {
            h.js("(function(){var input=document.querySelector("+JSONObject.quote(selector)+");if(!input)throw Error('Missing file input');var events=[];function observe(e){if(e.target===input)events.push({type:e.type,trusted:e.isTrusted,files:Array.from(input.files).map(f=>({name:f.name,type:f.type,size:f.size}))});}var types=['click','change','cancel'];types.forEach(t=>window.addEventListener(t,observe,true));window.__d403DocumentProbe={read:()=>events,dispose:()=>types.forEach(t=>window.removeEventListener(t,observe,true))};return true;})()");
        }
        void assertSelected(String selector) throws Exception {
            await(h,"document.querySelector("+JSONObject.quote(selector)+").files.length===1","Real picker returns one selected File");
            JSONObject file=(JSONObject)h.js("(function(){var f=document.querySelector("+JSONObject.quote(selector)+").files[0];return {name:f.name,type:f.type,size:f.size};})()");
            require(fileName.equals(file.getString("name"))&&"image/png".equals(file.getString("type"))&&file.getInt("size")==bytes.length,"Real FileList metadata matches the selected system document");
            JSONArray events=(JSONArray)h.js("window.__d403DocumentProbe.read()");boolean click=false,change=false;
            for(int i=0;i<events.length();i++){JSONObject event=events.getJSONObject(i);if(event.getBoolean("trusted")){click|="click".equals(event.getString("type"));change|="change".equals(event.getString("type"));}}
            require(click&&change,"File input receives trusted native click and chooser change");receipt.put("fileEvents",events).put("selectedFile",file);save();
        }
        void assertFile(JSONArray files,boolean attachment) throws Exception {
            require(files.length()==1,"Exactly one original file is persisted");JSONObject file=files.getJSONObject(0);
            require(fileName.equals(file.getString("name"))&&"image/png".equals(file.getString(attachment?"type":"mime"))&&file.getInt(attachment?"byteLength":"size")==bytes.length,"Saved file name, MIME and byte length match");
            require(base64.equals(file.getString("base64"))&&sha.equals(file.getString("sha256"))&&sha.equals(hash(Base64.decode(file.getString("base64"),Base64.DEFAULT))),"Persisted original bytes and SHA-256 match the real selected file exactly");
        }
        void assertCore() throws Exception {
            String after=(String)h.js("JSON.stringify(D4Prototype.repo.state)");require(oldState.equals(after),"Core tasks/projects remain byte-exact throughout picker operations");receipt.put("coreAfterSha256",hash(after.getBytes(StandardCharsets.UTF_8)));
        }
        void assertDurable() throws Exception {
            require(Boolean.TRUE.equals(h.js("(function(){var p=D4Prototype.repo.persistence();if(p.mode!=='localStorage'||p.error)return false;var saved=JSON.parse(localStorage.getItem(D4Prototype.storageKey));return JSON.stringify(saved.state)===JSON.stringify(D4Prototype.repo.state)&&JSON.stringify(saved.demo)===JSON.stringify(D4Prototype.repo.demo);})()")),"Exact state and demo are durably stored, with no memory fallback");
        }
        Picker open(String selector,boolean images) throws Exception { Picker picker=new Picker(this);try{picker.open(selector,images);return picker;}catch(Exception|Error failure){picker.close();throw failure;} }
        void save() throws Exception { h.write(name+".json",receipt.toString(2)); }
        void captureFailure(Throwable error) throws Exception {
            receipt.put("failure",error.toString());receipt.put("failureUi",snapshot(h));save();h.shot("failure-"+name+"-before-cleanup");
        }
        void cleanup() throws Exception {
            Throwable failed=null;
            try {
                for(int i=0;i<6&&pickerPackage!=null&&pickerPackage.equals(activePackage(h));i++)h.back();
                require(pickerPackage==null||!pickerPackage.equals(activePackage(h)),"Owned chooser is dismissed before fixture cleanup");
            } catch(Exception|Error e){failed=e;cleanupRows.put(new JSONObject().put("pickerError",e.toString()));}
            if(fixtureUri!=null)try {
                ContentResolver resolver=h.instrumentation().getTargetContext().getContentResolver();int deleted=resolver.delete(fixtureUri,null,null);
                require(deleted==1,"Delete only the exact MediaStore row created by this check");
                try(Cursor cursor=resolver.query(fixtureUri,new String[]{MediaStore.MediaColumns._ID},null,null,null)) { require(cursor!=null&&cursor.getCount()==0,"Exact fixture URI is absent after deletion"); }
                cleanupRows.put(new JSONObject().put("uri",fixtureUri).put("deletedRows",deleted).put("absent",true));
            } catch(Exception|Error e){if(failed==null)failed=e;else failed.addSuppressed(e);cleanupRows.put(new JSONObject().put("fixtureError",e.toString()));}
            if(snapshotReady)try {
                h.launch();h.home();
                h.js("(function(){D4Prototype.repo.batch(()=>{D4Prototype.repo.replaceState(JSON.parse("+JSONObject.quote(oldState)+"));D4Prototype.repo.updateDemo(()=>JSON.parse("+JSONObject.quote(oldDemo)+"));});return true;})()");h.settle();
                require(oldState.equals(h.js("JSON.stringify(D4Prototype.repo.state)"))&&oldDemo.equals(h.js("JSON.stringify(D4Prototype.repo.demo)")),"Restore only the complete captured synthetic state/demo");
                h.js("(function(){"+(oldStorage==null?"localStorage.removeItem("+JSONObject.quote(storageKey)+");":"localStorage.setItem("+JSONObject.quote(storageKey)+","+JSONObject.quote(oldStorage)+");")+"return true;})()");
                Object actual=h.js("localStorage.getItem("+JSONObject.quote(storageKey)+")");require(oldStorage==null?actual==JSONObject.NULL:oldStorage.equals(actual),"Restore the exact captured synthetic storage entry");
                cleanupRows.put(new JSONObject().put("syntheticStateRestored",true).put("storageEntryRestored",true));
            } catch(Exception|Error e){if(failed==null)failed=e;else failed.addSuppressed(e);cleanupRows.put(new JSONObject().put("stateError",e.toString()));}
            if(serviceFlagsChanged)try {
                AccessibilityServiceInfo service=h.instrumentation().getUiAutomation().getServiceInfo();require(service!=null,"Accessibility configuration remains observable at cleanup");
                service.flags=originalServiceFlags;h.instrumentation().getUiAutomation().setServiceInfo(service);cleanupRows.put(new JSONObject().put("accessibilityFlagsRestored",true));
            } catch(Exception|Error e){if(failed==null)failed=e;else failed.addSuppressed(e);cleanupRows.put(new JSONObject().put("accessibilityError",e.toString()));}
            try { save(); } catch(Exception|Error e){if(failed==null)failed=e;else failed.addSuppressed(e);}
            if(failed instanceof Exception)throw (Exception)failed;if(failed instanceof Error)throw (Error)failed;
        }
    }

    /** Observes the real outgoing Intent; returning null never supplies or blocks a result. */
    private static final class Picker implements AutoCloseable {
        final Case c;final Host h;final AtomicReference<Intent> request=new AtomicReference<>();final AtomicInteger requestCount=new AtomicInteger();
        final Instrumentation.ActivityMonitor monitor;boolean installed;
        Picker(Case c) {
            this.c=c;h=c.h;monitor=new Instrumentation.ActivityMonitor(){
                @Override public Instrumentation.ActivityResult onStartActivity(Intent intent) {
                    if(Intent.ACTION_OPEN_DOCUMENT.equals(intent.getAction())){request.set(new Intent(intent));requestCount.incrementAndGet();}
                    return null;
                }
            };
        }
        void open(String selector,boolean images) throws Exception {
            h.instrumentation().addMonitor(monitor);installed=true;h.tap(selector);
            long end=SystemClock.elapsedRealtime()+10000;while(request.get()==null&&SystemClock.elapsedRealtime()<end)SystemClock.sleep(100);
            Intent intent=request.get();require(intent!=null&&requestCount.get()==1,"One actual file-input tap starts exactly one OPEN_DOCUMENT request");
            Context queryContext=h.instrumentation().getTargetContext();
            String[] observedMimeTypes=intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES);
            JSONObject resolution=new JSONObject().put("queryContextPackage",queryContext.getPackageName())
                .put("queryContextUid",queryContext.getApplicationInfo().uid).put("processUid",android.os.Process.myUid())
                .put("observedForegroundPackage",String.valueOf(activePackage(h))).put("requestCount",requestCount.get())
                .put("action",intent.getAction()).put("type",intent.getType()).put("flags",intent.getFlags())
                .put("component",String.valueOf(intent.getComponent())).put("openable",intent.hasCategory(Intent.CATEGORY_OPENABLE))
                .put("localOnly",intent.getBooleanExtra(Intent.EXTRA_LOCAL_ONLY,false)).put("multiple",intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE,false))
                .put("mimeTypes",new JSONArray(observedMimeTypes==null?new ArrayList<String>():Arrays.asList(observedMimeTypes)));
            c.resolutionProbes.put(resolution);c.save();
            ResolveInfo resolved=queryContext.getPackageManager().resolveActivity(intent,PackageManager.MATCH_DEFAULT_ONLY);
            resolution.put("resolved",resolved!=null&&resolved.activityInfo!=null);
            if(resolved!=null&&resolved.activityInfo!=null)resolution.put("resolvedPackage",resolved.activityInfo.packageName)
                .put("resolvedActivity",resolved.activityInfo.name).put("resolvedApplicationFlags",resolved.activityInfo.applicationInfo.flags);
            c.save();
            require(resolved!=null&&resolved.activityInfo!=null,"Actual chooser intent resolves to a system activity");
            require((resolved.activityInfo.applicationInfo.flags&(ApplicationInfo.FLAG_SYSTEM|ApplicationInfo.FLAG_UPDATED_SYSTEM_APP))!=0,"Document chooser belongs to the observed system package");
            c.pickerPackage=resolved.activityInfo.packageName;
            require(!c.pickerPackage.equals(h.instrumentation().getTargetContext().getPackageName()),"System chooser is separate from the isolated app");
            require(intent.hasCategory(Intent.CATEGORY_OPENABLE)&&intent.getBooleanExtra(Intent.EXTRA_LOCAL_ONLY,false)&&intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE,false),"Real chooser request is openable, local-only and multiple");
            require((intent.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0,"Real chooser request asks for selected-document read grant");
            require("*/*".equals(intent.getType()),"Multiple image MIME types and unrestricted attachments use a wildcard base type");
            String[] extra=intent.getStringArrayExtra(Intent.EXTRA_MIME_TYPES);Set<String> types=new HashSet<>(extra==null?new ArrayList<String>():Arrays.asList(extra));
            require(images?types.equals(IMAGE_TYPES):types.isEmpty(),"Observed accept MIME types exactly match the actual input");
            awaitPackage(h,c.pickerPackage,true);
            c.requests.put(new JSONObject().put("action",intent.getAction()).put("type",intent.getType()).put("mimeTypes",new JSONArray(types)).put("openable",true).put("localOnly",true).put("multiple",true)
                .put("flags",intent.getFlags()).put("resolvedPackage",c.pickerPackage).put("resolvedActivity",resolved.activityInfo.name).put("monitorResultInjected",false));
            c.receipt.put("pickerUi",snapshot(h));c.save();h.shot(c.name+"-picker");
        }
        void cancel() throws Exception { require(c.pickerPackage.equals(activePackage(h)),"Only the observed owned picker receives Back");h.back();awaitPackage(h,h.instrumentation().getTargetContext().getPackageName(),true);require(requestCount.get()==1,"Cancel does not create another request"); }
        void selectFixture() throws Exception {
            // Recent images may expose names only in a combined content description.
            // Use its actual List view control so the unchanged exact-text selector applies.
            Target listView=findAny(c,new String[]{"List view","列表视图"},true,false);
            if(listView!=null) {
                tap(c,listView);
                require(waitTarget(c,new String[]{"Grid view","网格视图"},true,false)!=null,"Actual list-view switch exposes its Grid view control");
                c.selectionStages.put(new JSONObject().put("stage","list-view-observed").put("ui",snapshot(h)));c.save();
            }
            Target file=find(c,c.fileName,false,false);
            if(file==null) {
                Target roots=findAny(c,new String[]{"Show roots","Show navigation drawer","Open navigation drawer","显示根目录","显示导航栏","打开导航栏"},true,false);
                require(roots!=null,"Observe DocumentsUI navigation control before opening Downloads");tap(c,roots);
                Target downloads=waitTarget(c,new String[]{"Downloads","下载"},false,false);
                tap(c,downloads);file=find(c,c.fileName,false,false);
                if(file==null){Target directory=waitTarget(c,new String[]{FIXTURE_DIRECTORY},false,false);tap(c,directory);file=waitTarget(c,new String[]{c.fileName},false,false);}
            }
            require(file!=null,"Exact unique fixture filename is visible in the actual system picker");tap(c,file);
            long end=SystemClock.elapsedRealtime()+10000;boolean returned=false;
            while(SystemClock.elapsedRealtime()<end) {
                String pkg=activePackage(h);
                if(h.instrumentation().getTargetContext().getPackageName().equals(pkg)){returned=true;break;}
                require(c.pickerPackage.equals(pkg),"Only the observed picker may remain foreground during document selection");
                Target confirm=findAny(c,new String[]{"Open","OPEN","Select","SELECT","打开","选择"},false,true);
                if(confirm!=null){tap(c,confirm);awaitPackage(h,h.instrumentation().getTargetContext().getPackageName(),true);returned=true;break;}
                SystemClock.sleep(150);
            }
            require(returned,"Actual document selection returns to the isolated app");require(requestCount.get()==1,"Actual chooser selection completes the original request only");
        }
        @Override public void close() { if(installed){h.instrumentation().removeMonitor(monitor);installed=false;} }
    }

    private static final class Target {
        final Rect bounds;final String text,description,id,kind;
        Target(Rect bounds,String text,String description,String id,String kind){this.bounds=new Rect(bounds);this.text=text;this.description=description;this.id=id;this.kind=kind;}
        JSONObject json() throws Exception{return new JSONObject().put("text",text).put("description",description).put("id",id).put("class",kind).put("bounds",bounds.toShortString());}
    }
    private static Target waitTarget(Case c,String[] labels,boolean description,boolean confirmation) throws Exception {
        long end=SystemClock.elapsedRealtime()+10000;while(SystemClock.elapsedRealtime()<end){Target target=findAny(c,labels,description,confirmation);if(target!=null)return target;SystemClock.sleep(150);}
        throw new AssertionError("No observed unique DocumentsUI target: "+Arrays.toString(labels));
    }
    private static Target findAny(Case c,String[] labels,boolean description,boolean confirmation) throws Exception {
        List<Target> found=new ArrayList<>();
        for(String label:labels){Target value=find(c,label,description,confirmation);if(value!=null&&!sameBounds(found,value.bounds))found.add(value);}
        require(found.size()<=1,"DocumentsUI selector is unambiguous across accepted labels: "+Arrays.toString(labels));return found.isEmpty()?null:found.get(0);
    }
    private static Target find(Case c,String label,boolean description,boolean confirmation) throws Exception {
        AccessibilityNodeInfo root=c.h.instrumentation().getUiAutomation().getRootInActiveWindow();require(root!=null,"Observed system accessibility root exists");
        try {
            require(c.pickerPackage.equals(String.valueOf(root.getPackageName())),"Observe the exact resolved system picker package before selecting a target");
            List<Target> found=new ArrayList<>();collect(root,label,description,confirmation,found,new int[]{0});
            require(found.size()<=1,"Exact system label must resolve to one visible clickable target: "+label);return found.isEmpty()?null:found.get(0);
        } finally {root.recycle();}
    }
    private static void collect(AccessibilityNodeInfo node,String label,boolean description,boolean confirmation,List<Target> result,int[] visited) {
        require(++visited[0]<=600,"Bounded picker accessibility traversal");
        String text=String.valueOf(node.getText()),desc=String.valueOf(node.getContentDescription()),id=String.valueOf(node.getViewIdResourceName()),kind=String.valueOf(node.getClassName());
        boolean match=label.equals(description?desc:text);
        if(match&&node.isVisibleToUser()&&node.isEnabled()) {
            AccessibilityNodeInfo clickable=AccessibilityNodeInfo.obtain(node);
            try {
                for(int level=0;level<5;level++) {
                    if(clickable.isClickable()&&clickable.isEnabled()&&clickable.isVisibleToUser()) {
                        String clickId=String.valueOf(clickable.getViewIdResourceName()),clickClass=String.valueOf(clickable.getClassName());
                        boolean confirmAllowed=!confirmation||clickClass.endsWith("Button")||clickId.endsWith("/action_menu_select")||clickId.equals("android:id/button1");
                        Rect bounds=new Rect();clickable.getBoundsInScreen(bounds);
                        if(confirmAllowed&&bounds.width()>2&&bounds.height()>2&&!sameBounds(result,bounds))result.add(new Target(bounds,text,desc,clickId,clickClass));
                        break;
                    }
                    AccessibilityNodeInfo parent=clickable.getParent();if(parent==null)break;clickable.recycle();clickable=parent;
                }
            } finally {clickable.recycle();}
        }
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null)try{collect(child,label,description,confirmation,result,visited);}finally{child.recycle();}}
    }
    private static boolean sameBounds(List<Target> targets,Rect bounds){for(Target target:targets)if(target.bounds.equals(bounds))return true;return false;}
    private static void tap(Case c,Target target) throws Exception {
        require(c.pickerPackage.equals(activePackage(c.h)),"Native system tap stays in the observed picker");
        c.selectors.put(target.json());c.save();long down=SystemClock.uptimeMillis();boolean released=false;Throwable failure=null;
        try {
            inject(c,down,MotionEvent.ACTION_DOWN,target.bounds.exactCenterX(),target.bounds.exactCenterY());
            inject(c,down,MotionEvent.ACTION_UP,target.bounds.exactCenterX(),target.bounds.exactCenterY());released=true;
        } catch(Exception|Error error){failure=error;throw error;}
        finally {
            if(!released)try{inject(c,down,MotionEvent.ACTION_CANCEL,target.bounds.exactCenterX(),target.bounds.exactCenterY());}
            catch(Exception|Error cancel){if(failure!=null)failure.addSuppressed(cancel);else throw cancel;}
        }
        c.h.settle();c.selectionStages.put(new JSONObject().put("stage","after-native-tap").put("target",target.json()).put("foregroundPackage",String.valueOf(activePackage(c.h))).put("ui",snapshot(c.h)));c.save();
    }
    private static void inject(Case c,long down,int action,float x,float y) throws Exception {
        MotionEvent.PointerProperties pointer=new MotionEvent.PointerProperties();pointer.id=0;pointer.toolType=MotionEvent.TOOL_TYPE_FINGER;
        MotionEvent.PointerCoords coordinates=new MotionEvent.PointerCoords();coordinates.x=x;coordinates.y=y;coordinates.size=1f;
        coordinates.pressure=action==MotionEvent.ACTION_UP||action==MotionEvent.ACTION_CANCEL?0f:1f;
        MotionEvent event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,1,new MotionEvent.PointerProperties[]{pointer},new MotionEvent.PointerCoords[]{coordinates},0,0,1f,1f,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
        require(event!=null,"Native finger MotionEvent is created");
        JSONObject row=new JSONObject().put("action",action).put("downTime",event.getDownTime()).put("eventTime",event.getEventTime()).put("source",event.getSource())
            .put("pointerCount",event.getPointerCount()).put("pointerId",event.getPointerId(0)).put("toolType",event.getToolType(0)).put("x",event.getX()).put("y",event.getY());
        c.nativeInputs.put(row);
        try {
            require(event.getToolType(0)==MotionEvent.TOOL_TYPE_FINGER&&event.getPointerCount()==1&&event.getSource()==InputDevice.SOURCE_TOUCHSCREEN,"Observed injected event has one explicit finger pointer and touchscreen source");
            boolean injected=c.h.instrumentation().getUiAutomation().injectInputEvent(event,true);row.put("injected",injected);c.save();require(injected,"Real system MotionEvent is injected");
        }finally{event.recycle();}
    }
    private static String activePackage(Host h) {
        AccessibilityNodeInfo root=h.instrumentation().getUiAutomation().getRootInActiveWindow();if(root==null)return null;
        try{return String.valueOf(root.getPackageName());}finally{root.recycle();}
    }
    private static void awaitPackage(Host h,String expected,boolean equal) {
        long end=SystemClock.elapsedRealtime()+10000;while(SystemClock.elapsedRealtime()<end){if(expected.equals(activePackage(h))==equal)return;SystemClock.sleep(100);}
        throw new AssertionError("Expected observed foreground package "+expected+", got "+activePackage(h));
    }
    private static JSONArray snapshot(Host h) throws Exception {
        JSONArray rows=new JSONArray();AccessibilityNodeInfo root=h.instrumentation().getUiAutomation().getRootInActiveWindow();if(root!=null)try{snapshotNode(root,rows,new int[]{0});}finally{root.recycle();}return rows;
    }
    private static void snapshotNode(AccessibilityNodeInfo node,JSONArray rows,int[] count) throws Exception {
        if(count[0]++>=250)return;Rect bounds=new Rect();node.getBoundsInScreen(bounds);
        rows.put(new JSONObject().put("package",String.valueOf(node.getPackageName())).put("id",String.valueOf(node.getViewIdResourceName())).put("class",String.valueOf(node.getClassName()))
            .put("text",String.valueOf(node.getText())).put("description",String.valueOf(node.getContentDescription())).put("visible",node.isVisibleToUser()).put("enabled",node.isEnabled()).put("clickable",node.isClickable()).put("bounds",bounds.toShortString()));
        for(int i=0;i<node.getChildCount()&&count[0]<250;i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null)try{snapshotNode(child,rows,count);}finally{child.recycle();}}
    }
    private static void await(Host h,String condition,String message) throws Exception {
        long end=SystemClock.elapsedRealtime()+15000;while(SystemClock.elapsedRealtime()<end){if(Boolean.TRUE.equals(h.js(condition)))return;SystemClock.sleep(150);}throw new AssertionError(message);
    }
    private static String hash(byte[] bytes) throws Exception {StringBuilder value=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))value.append(String.format(Locale.ROOT,"%02x",b&255));return value.toString();}
    private static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);}
}
