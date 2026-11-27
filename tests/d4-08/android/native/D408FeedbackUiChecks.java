package local.gxtodo.replica;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ContentValues;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Rect;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.view.KeyEvent;
import android.view.KeyCharacterMap;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import android.view.inspector.WindowInspector;
import android.widget.EditText;
import android.widget.ImageView;
import com.androidshared.feedback.DefaultFeedbackStorage;
import com.androidshared.feedback.FeedbackRepository;
import com.androidshared.feedback.FeedbackStorage;
import local.gxtodo.d403preview.BuildInfo;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.function.Predicate;

/** Actual FeedbackKit and Android picker UI. Fixtures and assertions use only isolated CI data. */
final class D408FeedbackUiChecks {
    final D408IntegrationInstrumentation t;
    final DefaultFeedbackStorage storage;
    final String body="D408_UI_PHOTO_"+BuildInfo.RUN_ID;
    final String backupName="d408-feedback-ui-"+BuildInfo.RUN_ID+".zip";
    final String corruptName="d408-corrupt-ui-"+BuildInfo.RUN_ID+".zip";
    Activity tools,page;
    String assetId,imageHash,noteId,backupHash;
    JSONObject exported;
    long exportedGeneration;
    int dumpSequence,documentsSequence;
    Uri imageUri;
    D408FeedbackUiChecks(D408IntegrationInstrumentation t){this.t=t;storage=new DefaultFeedbackStorage(t.target);android.accessibilityservice.AccessibilityServiceInfo info=t.getUiAutomation().getServiceInfo();info.flags|=android.accessibilityservice.AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS|android.accessibilityservice.AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;t.getUiAutomation().setServiceInfo(info);}
    static void run(D408IntegrationInstrumentation t){
        D408FeedbackUiChecks s=new D408FeedbackUiChecks(t);
        s.test("D408-U01-system-photo-picker-preview-remove-and-draft",s::photoDraft);
        s.test("D408-U02-resume-recreate-save-category-status-image",s::resumeDraft);
        s.test("D408-U03-delete-confirm-cancel-and-real-undo",s::deleteUndo);
        s.test("D408-U04-SAF-export-cancel-and-real-archive",s::exportUi);
        s.test("D408-U05-SAF-restore-cancel-confirm-and-image",s::restoreUi);
        s.test("D408-U06-corrupt-restore-visible-error-and-retry",s::failedRestore);
        s.test("D408-U07-empty-body-validation-and-corrected-save",s::validationRetry);
    }
    void test(String name,D408IntegrationInstrumentation.Check action){
        t.test(name,()->{try{return action.run();}catch(Exception|AssertionError failure){
            try{dump(name+"-failed");t.shot(name+"-failed");}catch(Exception diagnostic){failure.addSuppressed(diagnostic);}
            // Preserve the failure before dismissing an external picker that
            // would otherwise hide all later independent cases.
            try{for(int i=0;i<3;i++){AccessibilityNodeInfo root=t.getUiAutomation().getRootInActiveWindow();if(root==null||t.target.getPackageName().contentEquals(root.getPackageName()==null?"":root.getPackageName()))break;systemKey(KeyEvent.KEYCODE_BACK,0);SystemClock.sleep(300);}}catch(Exception|AssertionError cleanup){failure.addSuppressed(cleanup);}throw failure;
        }});
    }
    static void check(boolean value,String message){D408IntegrationInstrumentation.check(value,message);}
    View tag(Activity activity,String name){final View[] found={null};t.runOnMainSync(()->found[0]=activity.getWindow().getDecorView().findViewWithTag(name));return found[0];}
    View waitTag(Activity activity,String name)throws Exception{t.until("actual FeedbackKit view "+name,10000,()->tag(activity,name)!=null);return tag(activity,name);}
    void tapTag(Activity activity,String name)throws Exception{
        View view=waitTag(activity,name);t.until("enabled FeedbackKit view "+name,10000,view::isEnabled);
        t.runOnMainSync(()->view.requestRectangleOnScreen(new Rect(0,0,view.getWidth(),view.getHeight()),true));SystemClock.sleep(250);t.tap(view);SystemClock.sleep(250);
    }
    void text(String value)throws Exception{
        View view=waitTag(page,"feedback_body");t.runOnMainSync(()->view.requestRectangleOnScreen(new Rect(0,0,view.getWidth(),view.getHeight()),true));SystemClock.sleep(200);t.tap(view);t.sendStringSync(value);t.waitForIdleSync();D408FeatureChecks.dismissIme(t,page);
    }
    Activity open(String label)throws Exception{
        tools=t.launch(FeedbackToolsActivity.class);
        Instrumentation.ActivityMonitor monitor=t.addMonitor("com.androidshared.feedback.FeedbackActivity",null,false);
        D408FeatureChecks.nativeText(t,tools,label);page=t.waitForMonitorWithTimeout(monitor,10000);t.removeMonitor(monitor);check(page!=null,"Actual original FeedbackKit Activity opened by "+label);t.current=page;t.awaitForeground(page);return page;
    }
    void openDetail()throws Exception{check(noteId!=null,"prior UI-created note exists");open("查看优化意见");t.until("UI-created record visible",10000,()->D408FeatureChecks.windowContains(t,body));D408FeatureChecks.nativeText(t,page,body);waitTag(page,"feedback_detail_body");}
    JSONObject note()throws Exception{for(JSONObject value:storage.all(FeedbackStorage.NOTES))if(body.equals(value.optString("body")))return value;return null;}
    JSONObject draft()throws Exception{return new FeedbackRepository(storage,storage).draft();}
    void waitDraftAssets(int count)throws Exception{t.until("persisted original draft image count "+count,10000,()->{JSONObject d=draft();return d!=null&&d.getJSONObject("note").getJSONArray("assetIds").length()==count;});}
    JSONObject photoDraft()throws Exception{
        Bitmap bitmap=Bitmap.createBitmap(64,48,Bitmap.Config.ARGB_8888);bitmap.eraseColor(Color.rgb(27,142,95));
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();check(bitmap.compress(Bitmap.CompressFormat.PNG,100,bytes),"real fixture PNG");bitmap.recycle();byte[] png=bytes.toByteArray();
        imageHash=D408FeatureChecks.hash(new ByteArrayInputStream(png));ContentValues values=new ContentValues();values.put(MediaStore.MediaColumns.DISPLAY_NAME,"d408-ui-image-"+BuildInfo.RUN_ID+".png");values.put(MediaStore.MediaColumns.MIME_TYPE,"image/png");values.put(MediaStore.MediaColumns.RELATIVE_PATH,"Pictures/D408/");values.put(MediaStore.MediaColumns.IS_PENDING,1);
        imageUri=t.target.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);check(imageUri!=null,"synthetic image inserted into real MediaStore");
        try(OutputStream output=t.target.getContentResolver().openOutputStream(imageUri)){check(output!=null,"real MediaStore output");output.write(png);}ContentValues ready=new ContentValues();ready.put(MediaStore.MediaColumns.IS_PENDING,0);t.target.getContentResolver().update(imageUri,ready,null,null);
        open("记个想法");text(body);tapTag(page,"feedback_category_experience");tapTag(page,"feedback_editor_status_pending");
        pickImage();waitDraftAssets(1);assetId=draft().getJSONObject("note").getJSONArray("assetIds").getString(0);check(imageHash.equals(D408FeatureChecks.hash(storage.openImage(assetId))),"system-selected actual bytes stored");
        t.until("decoded original image thumbnail",10000,()->{View view=tag(page,"feedback_image_0");return view instanceof ImageView&&((ImageView)view).getDrawable()!=null;});tapTag(page,"feedback_image_0");
        t.until("original screenshot preview",5000,()->find(n->"截图 1".contentEquals(n.getContentDescription()==null?"":n.getContentDescription()))!=null);
        t.until("entire preview close control outside system bars and cutout",5000,()->{Rect[] r=previewRects();return r[0]!=null&&r[1].equals(r[0])&&r[2].contains(r[0]);});
        Rect[] preview=previewRects();JSONObject previewGeometry=new JSONObject().put("buttonBounds",preview[0].toShortString()).put("visibleBounds",preview[1].toShortString()).put("safeBounds",preview[2].toShortString()).put("windowBounds",preview[3].toShortString());
        D408IntegrationInstrumentation.write(new File(t.evidence,"feedback-preview-safe-bounds.json"),previewGeometry.toString(2));dump("feedback-image-preview-safe");t.shot("feedback-ui-image-preview");
        AccessibilityNodeInfo closePreview=waitNode("real close-preview button",n->"关闭截图".contentEquals(n.getText()==null?"":n.getText()),5000);Rect accessibleClose=new Rect();closePreview.getBoundsInScreen(accessibleClose);check(accessibleClose.equals(preview[0]),"actual accessibility close bounds match fully visible native control");touch(closePreview);
        t.until("preview closed and original editor focused",10000,()->page.hasWindowFocus()&&find(n->"截图 1".contentEquals(n.getContentDescription()==null?"":n.getContentDescription()))==null);dump("feedback-image-preview-closed");
        tapTag(page,"feedback_remove_image_0");waitDraftAssets(0);check(tag(page,"feedback_image_0")==null,"remove updates UI");
        pickImage();waitDraftAssets(1);assetId=draft().getJSONObject("note").getJSONArray("assetIds").getString(0);check(imageHash.equals(D408FeatureChecks.hash(storage.openImage(assetId))),"reselected image retains actual bytes");
        tapTag(page,"feedback_keep_draft");t.until("quick compose finishes after keep",10000,page::isFinishing);t.current=tools;t.awaitForeground(tools);JSONObject kept=draft();check(kept!=null&&body.equals(kept.getJSONObject("note").getString("body")),"keep preserves actual draft");
        return new JSONObject().put("sourceUri",imageUri.toString()).put("imageSha256",imageHash).put("assetId",assetId).put("draftId",kept.getString("id")).put("previewGeometry",previewGeometry).put("pickerResultInjected",false);
    }
    void pickImage()throws Exception{
        tapTag(page,"feedback_add_image");t.until("real system image picker",10000,()->find(n->{String p=String.valueOf(n.getPackageName());return !p.equals(t.target.getPackageName())&&(p.contains("photopicker")||p.contains("providers.media")||p.contains("documentsui"));})!=null);dump("feedback-system-picker-before");
        AccessibilityNodeInfo thumbnail=waitNode("seeded image in system picker",n->{String id=String.valueOf(n.getViewIdResourceName());return id.endsWith(":id/icon_thumbnail")||id.endsWith(":id/icon_photo")||id.endsWith(":id/image_view");},10000);
        touch(thumbnail);
        // Photo Picker populates its selected-count bottom bar asynchronously.
        // A one-shot lookup can miss Add (1) even though the photo was selected.
        t.until("actual picker confirmation or direct return",10000,()->(page.hasWindowFocus()&&tag(page,"feedback_image_0")!=null)||pickerAdd()!=null);
        dump("feedback-system-picker-selected");
        AccessibilityNodeInfo add=pickerAdd();if(add!=null)touch(add);
        t.until("system picker returned actual image",15000,()->page.hasWindowFocus()&&tag(page,"feedback_image_0")!=null);dump("feedback-system-picker-after");
    }
    AccessibilityNodeInfo pickerAdd(){return find(n->{String value=String.valueOf(n.getText()),id=String.valueOf(n.getViewIdResourceName()),pkg=String.valueOf(n.getPackageName());return !pkg.equals(t.target.getPackageName())&&n.isEnabled()&&clickTarget(n)!=null&&(id.endsWith(":id/button_add")||value.matches("(?i)add(?: \\(.*\\))?")||value.matches("添加(?:[（(].*[）)])?"));});}
    JSONObject resumeDraft()throws Exception{
        check(assetId!=null,"prior actual image draft exists");open("查看优化意见");tapTag(page,"feedback_resume_draft");waitTag(page,"feedback_body");
        check(body.equals(((EditText)tag(page,"feedback_body")).getText().toString()),"actual draft banner restores body");check(tag(page,"feedback_image_0")!=null,"actual draft banner restores image");
        Instrumentation.ActivityMonitor monitor=t.addMonitor(page.getClass().getName(),null,false);Activity prior=page;t.runOnMainSync(prior::recreate);Activity restored=t.waitForMonitorWithTimeout(monitor,10000);t.removeMonitor(monitor);check(restored!=null&&restored!=prior,"actual editor Activity recreated");page=restored;t.current=page;t.awaitForeground(page);waitTag(page,"feedback_body");
        check(body.equals(((EditText)tag(page,"feedback_body")).getText().toString()),"recreation restores draft body");check(imageHash.equals(D408FeatureChecks.hash(storage.openImage(assetId))),"recreation retains original image bytes");t.shot("feedback-ui-recreated-draft");
        tapTag(page,"feedback_save");t.until("UI save persists real note",10000,()->note()!=null);JSONObject saved=note();noteId=saved.getString("id");check("experience".equals(saved.getString("category"))&&"pending".equals(saved.getString("status")),"category and status persisted from UI");check(draft()==null,"successful save consumes draft");waitTag(page,"feedback_detail_body");t.shot("feedback-ui-saved-detail");
        return new JSONObject().put("noteId",noteId).put("category",saved.getString("category")).put("status",saved.getString("status")).put("assetId",assetId).put("imageSha256",imageHash);
    }
    JSONObject deleteUndo()throws Exception{
        openDetail();String before=storage.get(FeedbackStorage.NOTES,noteId).toString();tapTag(page,"feedback_delete");check(D408FeatureChecks.tapWindowText(t,"保留",10000),"real cancel deletion confirmation");check(before.equals(storage.get(FeedbackStorage.NOTES,noteId).toString()),"cancel preserves exact record");
        tapTag(page,"feedback_delete");check(D408FeatureChecks.tapWindowText(t,"删除 1 条",10000),"real confirm deletion");t.until("deleted record and undo bar",10000,()->storage.deletedNotes().stream().anyMatch(n->noteId.equals(n.optString("id")))&&tag(page,"feedback_undo")!=null);t.shot("feedback-ui-delete-undo");
        tapTag(page,"feedback_undo");t.until("real undo restores note",10000,()->storage.deletedNotes().stream().noneMatch(n->noteId.equals(n.optString("id"))));check(imageHash.equals(D408FeatureChecks.hash(storage.openImage(assetId))),"undo preserves original image");
        return new JSONObject().put("noteId",noteId).put("cancelPreserved",true).put("deletedAndUndone",true).put("imageSha256",imageHash);
    }
    JSONObject exportUi()throws Exception{
        check(noteId!=null,"prior UI note exists");tools=t.launch(FeedbackToolsActivity.class);D408FeatureChecks.nativeText(t,tools,"导出意见备份");JSONObject canceled=cancelDocuments();t.until("visible export cancel",5000,()->D408FeatureChecks.windowContains(t,"已取消选择文件"));
        D408FeatureChecks.nativeText(t,tools,"导出意见备份");downloads();AccessibilityNodeInfo filename=waitNode("SAF filename input",n->"android.widget.EditText".contentEquals(n.getClassName()),8000);touch(filename);waitNode("actual SAF filename focus",n->"android.widget.EditText".contentEquals(n.getClassName())&&n.isFocused(),5000);systemKey(KeyEvent.KEYCODE_A,KeyEvent.META_CTRL_ON);systemText(backupName);
        t.until("real system filename entry matches requested archive",5000,()->find(n->"android.widget.EditText".contentEquals(n.getClassName())&&backupName.contentEquals(n.getText()==null?"":n.getText()))!=null);dump("feedback-documents-filename-entered");
        touch(waitNode("SAF save button",n->String.valueOf(n.getText()).matches("(?i)save|保存|存储"),8000));t.awaitForeground(tools);t.until("visible export success",15000,()->D408FeatureChecks.windowContains(t,"意见备份已保存"));
        File archive=new File(t.evidence,backupName);try(ParcelFileDescriptor fd=t.getUiAutomation().executeShellCommand("cat /sdcard/Download/"+backupName);InputStream input=new ParcelFileDescriptor.AutoCloseInputStream(fd);OutputStream output=new FileOutputStream(archive)){byte[] buffer=new byte[32768];int n;while((n=input.read(buffer))!=-1)output.write(buffer,0,n);}
        check(archive.length()>100,"actual SAF ZIP exists");try(InputStream input=new java.io.FileInputStream(archive)){check(input.read()=='P'&&input.read()=='K',"actual exported ZIP header");}backupHash=D408FeatureChecks.hash(new java.io.FileInputStream(archive));exported=D408FeatureChecks.storageSnapshot(storage);exportedGeneration=storage.generation();t.shot("feedback-ui-export-success");
        return new JSONObject().put("file",backupName).put("bytes",archive.length()).put("sha256",backupHash).put("exportCanceledThenSaved",true).put("cancelInteraction",canceled);
    }
    JSONObject restoreUi()throws Exception{
        check(exported!=null,"prior actual SAF backup exists");openDetail();tapTag(page,"feedback_status_done");t.until("real detail status mutation",10000,()->"done".equals(storage.get(FeedbackStorage.NOTES,noteId).optString("status")));tools=t.launch(FeedbackToolsActivity.class);String changed=D408FeatureChecks.storageSnapshot(storage).toString();long generation=storage.generation();
        chooseRestore(backupName);check(D408FeatureChecks.tapWindowText(t,"取消",5000),"actual replacement cancel");t.until("visible restore cancel",5000,()->D408FeatureChecks.windowContains(t,"已取消恢复"));check(changed.equals(D408FeatureChecks.storageSnapshot(storage).toString())&&generation==storage.generation(),"cancel leaves exact data and generation");
        chooseRestore(backupName);check(D408FeatureChecks.tapWindowText(t,"检查并恢复",5000),"actual replacement confirmation");t.until("visible restore success",15000,()->D408FeatureChecks.windowContains(t,"恢复完成"));check(exported.toString().equals(D408FeatureChecks.storageSnapshot(storage).toString()),"SAF restore returns exact notes draft and meta");check(storage.generation()>generation,"UI restore increments generation");check(imageHash.equals(D408FeatureChecks.hash(storage.openImage(assetId))),"UI restore restores actual image bytes");t.shot("feedback-ui-restore-success");
        return new JSONObject().put("backupSha256",backupHash).put("generationBefore",generation).put("generationAfter",storage.generation()).put("imageSha256",imageHash);
    }
    JSONObject failedRestore()throws Exception{
        check(exported!=null,"prior successful UI export required");ContentValues values=new ContentValues();values.put(MediaStore.MediaColumns.DISPLAY_NAME,corruptName);values.put(MediaStore.MediaColumns.MIME_TYPE,"application/zip");values.put(MediaStore.MediaColumns.RELATIVE_PATH,"Download/");Uri corrupt=t.target.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values);check(corrupt!=null,"real invalid archive fixture");try(OutputStream output=t.target.getContentResolver().openOutputStream(corrupt)){output.write("D408 invalid ZIP".getBytes(StandardCharsets.UTF_8));}
        tools=t.launch(FeedbackToolsActivity.class);String before=D408FeatureChecks.storageSnapshot(storage).toString();long generation=storage.generation();chooseRestore(corruptName);check(D408FeatureChecks.tapWindowText(t,"检查并恢复",5000),"confirm actual invalid-file restore");t.until("visible failed restore",15000,()->D408FeatureChecks.windowContains(t,"恢复失败，当前意见未替换"));check(before.equals(D408FeatureChecks.storageSnapshot(storage).toString())&&generation==storage.generation(),"UI restore failure preserves data and generation");check(imageHash.equals(D408FeatureChecks.hash(storage.openImage(assetId))),"failed UI restore preserves image");dump("feedback-ui-visible-restore-error");t.shot("feedback-ui-visible-restore-error");
        chooseRestore(backupName);check(D408FeatureChecks.tapWindowText(t,"检查并恢复",5000),"real corrected restore retry");t.until("retry success",15000,()->D408FeatureChecks.windowContains(t,"恢复完成"));check(exported.toString().equals(D408FeatureChecks.storageSnapshot(storage).toString()),"retry restores complete snapshot");
        return new JSONObject().put("invalidFile",corruptName).put("visibleFailure",true).put("preservedGeneration",generation).put("retryGeneration",storage.generation()).put("scope","local restore failure; FeedbackKit has no remote submission service");
    }
    JSONObject validationRetry()throws Exception{
        // This independent validation case must still run when a preceding UI
        // case leaves its synthetic draft behind. Keep the draft as evidence.
        JSONObject prior=draft();if(prior!=null){D408IntegrationInstrumentation.write(new File(t.evidence,"feedback-u07-prior-incomplete-fixture.json"),prior.toString(2));new FeedbackRepository(storage,storage).discardDraft(prior.getString("id"));}
        open("记个想法");int before=storage.all(FeedbackStorage.NOTES).size();tapTag(page,"feedback_save");EditText bodyInput=(EditText)waitTag(page,"feedback_body");t.until("visible field validation",5000,()->bodyInput.getError()!=null);check(storage.all(FeedbackStorage.NOTES).size()==before,"invalid empty save creates no note");t.shot("feedback-ui-empty-save-error");String corrected="D408_UI_CORRECTED_"+BuildInfo.RUN_ID;text(corrected);tapTag(page,"feedback_save");t.until("corrected save succeeds",10000,()->storage.all(FeedbackStorage.NOTES).stream().anyMatch(n->corrected.equals(n.optString("body"))));
        return new JSONObject().put("emptySaveRejected",true).put("correctedSaveBody",corrected).put("operation","local note save; no network submission claimed");
    }
    void chooseRestore(String filename)throws Exception{
        t.current=tools;t.awaitForeground(tools);D408FeatureChecks.nativeText(t,tools,"从备份恢复");downloads();
        t.until("unique actual SAF backup row "+filename,10000,()->count(t.getUiAutomation().getRootInActiveWindow(),n->documentRow(n,filename))==1);
        AccessibilityNodeInfo row=waitNode("actual SAF directory backup row "+filename,n->documentRow(n,filename),5000);dump("feedback-documents-file-selected-before");touch(documentClickTarget(row));
        t.until("original host replacement confirmation",10000,()->D408FeatureChecks.windowContains(t,"替换当前优化意见"));
    }
    void waitDocuments()throws Exception{t.until("actual system DocumentsUI",10000,()->find(n->String.valueOf(n.getPackageName()).contains("documentsui"))!=null);}
    Rect[] previewRects(){
        final Rect[] result={null,null,null,null};t.runOnMainSync(()->{for(View root:WindowInspector.getGlobalWindowViews()){
            View button=root.findViewWithTag("feedback_close_image");if(button==null||!button.isShown()||!ownedByPage(button))continue;WindowInsets insets=root.getRootWindowInsets();if(insets==null)continue;
            int[] point=new int[2];button.getLocationOnScreen(point);Rect bounds=new Rect(point[0],point[1],point[0]+button.getWidth(),point[1]+button.getHeight()),visible=new Rect();if(!button.getGlobalVisibleRect(visible))continue;
            root.getLocationOnScreen(point);Rect window=new Rect(point[0],point[1],point[0]+root.getWidth(),point[1]+root.getHeight());Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
            result[0]=bounds;result[1]=visible;result[2]=new Rect(window.left+safe.left,window.top+safe.top,window.right-safe.right,window.bottom-safe.bottom);result[3]=window;break;
        }});return result;
    }
    boolean ownedByPage(View view){android.content.Context context=view.getContext();for(int depth=0;context!=null&&depth<12;depth++){if(context instanceof Activity)return context==page;if(!(context instanceof android.content.ContextWrapper))return false;android.content.Context next=((android.content.ContextWrapper)context).getBaseContext();if(next==context)return false;context=next;}return false;}
    String activePackage(){AccessibilityNodeInfo root=t.getUiAutomation().getRootInActiveWindow();return root==null||root.getPackageName()==null?"":root.getPackageName().toString();}
    boolean systemImeVisible(){for(AccessibilityWindowInfo window:t.getUiAutomation().getWindows())if(window.getType()==AccessibilityWindowInfo.TYPE_INPUT_METHOD)return true;return false;}
    JSONObject cancelDocuments()throws Exception{
        waitDocuments();t.waitForIdleSync();dump("feedback-documents-cancel-before");int keys=0;boolean ime=systemImeVisible();
        Activity priorTools=tools;Instrumentation.ActivityMonitor monitor=t.addMonitor(FeedbackToolsActivity.class.getName(),null,false);
        try{
            if(ime){check(activePackage().contains("documentsui"),"IME cancellation belongs to active DocumentsUI");systemKey(KeyEvent.KEYCODE_BACK,0);keys++;t.until("SAF IME closes or picker returns",10000,()->!systemImeVisible()||t.target.getPackageName().equals(activePackage()));}
            t.until("observed picker or host after IME",10000,()->activePackage().contains("documentsui")||t.target.getPackageName().equals(activePackage()));
            t.getUiAutomation().waitForIdle(500,10000);
            // Send one cancel only while the picker is actually active. A stale
            // Activity focus flag never authorizes another BACK after it leaves.
            if(activePackage().contains("documentsui")){systemKey(KeyEvent.KEYCODE_BACK,0);keys++;}
            t.until("SAF cancellation returns to target package",15000,()->t.target.getPackageName().equals(activePackage()));
            Activity recreated=monitor.getLastActivity();if(recreated!=null)tools=recreated;t.current=tools;t.awaitForeground(tools);dump("feedback-documents-cancel-after");
            JSONObject result=new JSONObject().put("imeInitiallyVisible",ime).put("backKeyPairs",keys).put("returnedPackage",activePackage()).put("hostRecreated",recreated!=null&&recreated!=priorTools);
            D408IntegrationInstrumentation.write(new File(t.evidence,"feedback-saf-cancel-interaction.json"),result.toString(2));return result;
        }finally{t.removeMonitor(monitor);}
    }
    boolean documentsDrawerVisible(){return find(n->{String id=String.valueOf(n.getViewIdResourceName());return id.endsWith(":id/roots_list")||id.endsWith(":id/drawer_roots");})!=null;}
    boolean inDownloadsDirectory(){return activePackage().contains("documentsui")&&!documentsDrawerVisible()
        &&count(t.getUiAutomation().getRootInActiveWindow(),n->String.valueOf(n.getViewIdResourceName()).endsWith(":id/breadcrumb_text"))==1
        &&find(n->String.valueOf(n.getViewIdResourceName()).endsWith(":id/breadcrumb_text")&&String.valueOf(n.getText()).matches("(?i)downloads|下载"))!=null
        &&find(n->String.valueOf(n.getViewIdResourceName()).endsWith(":id/dir_list"))!=null;}
    AccessibilityNodeInfo documentClickTarget(AccessibilityNodeInfo node){
        if(!withinId(node,":id/dir_list"))return null;
        for(int depth=0;node!=null&&depth<12;depth++,node=node.getParent()){
            if(String.valueOf(node.getViewIdResourceName()).endsWith(":id/dir_list"))return null;
            if(node.isVisibleToUser()&&node.isEnabled()&&node.isClickable())return node;
        }
        return null;
    }
    boolean documentRow(AccessibilityNodeInfo n,String filename){return String.valueOf(n.getPackageName()).contains("documentsui")&&filename.contentEquals(n.getText()==null?"":n.getText())&&withinId(n,":id/dir_list")&&!withinId(n,":id/roots_list")&&documentClickTarget(n)!=null;}
    int count(AccessibilityNodeInfo n,Predicate<AccessibilityNodeInfo> predicate){if(n==null)return 0;int result=n.isVisibleToUser()&&predicate.test(n)?1:0;for(int i=0;i<n.getChildCount();i++)result+=count(n.getChild(i),predicate);return result;}
    JSONObject documentsState()throws Exception{
        AccessibilityNodeInfo breadcrumb=find(n->String.valueOf(n.getViewIdResourceName()).endsWith(":id/breadcrumb_text"));
        return new JSONObject().put("activePackage",activePackage()).put("breadcrumbText",breadcrumb==null?JSONObject.NULL:String.valueOf(breadcrumb.getText()))
            .put("breadcrumbCount",count(t.getUiAutomation().getRootInActiveWindow(),n->String.valueOf(n.getViewIdResourceName()).endsWith(":id/breadcrumb_text")))
            .put("directoryListVisible",find(n->String.valueOf(n.getViewIdResourceName()).endsWith(":id/dir_list"))!=null).put("rootsDrawerVisible",documentsDrawerVisible()).put("downloadsDirectoryObserved",inDownloadsDirectory());
    }
    void downloads()throws Exception{
        waitDocuments();t.getUiAutomation().waitForIdle(500,10000);dump("feedback-documents-before");JSONObject before=documentsState();boolean alreadyDownloads=inDownloadsDirectory();
        // OPEN_DOCUMENT can already resume Downloads. Reopening its drawer is
        // redundant; the actual file selection and confirmation still follow.
        if(!alreadyDownloads){
            if(!documentsDrawerVisible()){
                touch(waitNode("actual DocumentsUI roots control",n->String.valueOf(n.getContentDescription()).matches("(?i)show roots|show navigation drawer|open navigation drawer|显示根目录|显示导航栏|打开导航栏|打开导航抽屉|显示根目录菜单"),5000));
            }
            t.getUiAutomation().waitForIdle(500,10000);dump("feedback-documents-roots-open");
            touch(waitNode("Downloads root inside actual navigation drawer",n->String.valueOf(n.getText()).matches("(?i)downloads|下载")&&withinId(n,":id/roots_list")&&clickTarget(n)!=null,5000));
            t.until("actual DocumentsUI roots drawer closes",5000,()->!documentsDrawerVisible());
        }
        t.until("actual unobscured Downloads directory",10000,this::inDownloadsDirectory);dump("feedback-documents-downloads");
        JSONObject navigation=new JSONObject().put("sourceSHA",BuildInfo.SOURCE_SHA).put("runId",BuildInfo.RUN_ID).put("runAttempt",BuildInfo.RUN_ATTEMPT)
            .put("sequence",++documentsSequence).put("before",before).put("after",documentsState()).put("redundantDirectorySwitchSkipped",alreadyDownloads)
            .put("decision",alreadyDownloads?"Observed Downloads breadcrumb and directory with no drawer; continue actual file operation":"Selected actual Downloads root and observed drawer closure");
        D408IntegrationInstrumentation.write(new File(t.evidence,String.format(java.util.Locale.ROOT,"feedback-documents-navigation-%02d.json",documentsSequence)),navigation.toString(2));
    }
    void systemKey(int code,int modifiers){long now=SystemClock.uptimeMillis();check(t.getUiAutomation().injectInputEvent(new KeyEvent(now,now,KeyEvent.ACTION_DOWN,code,0,modifiers,KeyCharacterMap.VIRTUAL_KEYBOARD,0,0,InputDevice.SOURCE_KEYBOARD),true),"system key down accepted");check(t.getUiAutomation().injectInputEvent(new KeyEvent(now,SystemClock.uptimeMillis(),KeyEvent.ACTION_UP,code,0,modifiers,KeyCharacterMap.VIRTUAL_KEYBOARD,0,0,InputDevice.SOURCE_KEYBOARD),true),"system key up accepted");}
    void systemText(String value){KeyEvent[] events=KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD).getEvents(value.toCharArray());check(events!=null,"system filename has real key events");for(KeyEvent event:events)check(t.getUiAutomation().injectInputEvent(KeyEvent.changeTimeRepeat(event,SystemClock.uptimeMillis(),0),true),"system filename key accepted");}
    AccessibilityNodeInfo find(Predicate<AccessibilityNodeInfo> predicate){return find(t.getUiAutomation().getRootInActiveWindow(),predicate);}
    AccessibilityNodeInfo find(AccessibilityNodeInfo n,Predicate<AccessibilityNodeInfo> predicate){if(n==null)return null;if(n.isVisibleToUser()&&predicate.test(n))return n;for(int i=0;i<n.getChildCount();i++){AccessibilityNodeInfo result=find(n.getChild(i),predicate);if(result!=null)return result;}return null;}
    AccessibilityNodeInfo waitNode(String label,Predicate<AccessibilityNodeInfo> predicate,long timeout)throws Exception{t.until(label,timeout,()->find(predicate)!=null);return find(predicate);}
    boolean withinId(AccessibilityNodeInfo node,String suffix){for(int i=0;i<12&&node!=null;i++,node=node.getParent())if(String.valueOf(node.getViewIdResourceName()).endsWith(suffix))return true;return false;}
    AccessibilityNodeInfo clickTarget(AccessibilityNodeInfo node){for(int i=0;i<5&&node!=null;i++,node=node.getParent())if(node.isVisibleToUser()&&node.isEnabled()&&node.isClickable())return node;return null;}
    void touch(AccessibilityNodeInfo n)throws Exception{
        check(n!=null,"actual accessible target");AccessibilityNodeInfo clickable=clickTarget(n);check(clickable!=null,"observed enabled clickable system target");Rect r=new Rect();clickable.getBoundsInScreen(r);check(!r.isEmpty(),"visible system target bounds");long now=SystemClock.uptimeMillis();
        MotionEvent down=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,r.exactCenterX(),r.exactCenterY(),0),up=MotionEvent.obtain(now,now+35,MotionEvent.ACTION_UP,r.exactCenterX(),r.exactCenterY(),0);
        down.setSource(InputDevice.SOURCE_TOUCHSCREEN);up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        try{check(t.getUiAutomation().injectInputEvent(down,true),"system pointer down accepted");SystemClock.sleep(35);check(t.getUiAutomation().injectInputEvent(up,true),"system pointer up accepted");}finally{down.recycle();up.recycle();}SystemClock.sleep(250);
    }
    void dump(String name)throws Exception{JSONArray rows=new JSONArray();collect(t.getUiAutomation().getRootInActiveWindow(),rows);D408IntegrationInstrumentation.write(new File(t.evidence,String.format(java.util.Locale.ROOT,"%03d-",++dumpSequence)+name+".json"),rows.toString(2));}
    void collect(AccessibilityNodeInfo n,JSONArray rows)throws Exception{if(n==null||rows.length()>600)return;if(n.isVisibleToUser()){Rect r=new Rect();n.getBoundsInScreen(r);rows.put(new JSONObject().put("package",String.valueOf(n.getPackageName())).put("class",String.valueOf(n.getClassName())).put("id",String.valueOf(n.getViewIdResourceName())).put("text",String.valueOf(n.getText())).put("description",String.valueOf(n.getContentDescription())).put("bounds",r.toShortString()).put("clickable",n.isClickable()));}for(int i=0;i<n.getChildCount();i++)collect(n.getChild(i),rows);}
}
