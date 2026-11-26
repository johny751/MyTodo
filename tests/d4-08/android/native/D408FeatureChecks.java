package local.gxtodo.replica;

import android.app.Activity;
import android.app.AlarmManager;
import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.TextView;
import com.androidshared.feedback.*;
import local.gxtodo.d403preview.BuildInfo;
import org.json.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** New D408 suites. Old D403/D405 test files remain frozen and run in their own jobs. */
final class D408FeatureChecks {
    static void check(boolean value,String message){D408IntegrationInstrumentation.check(value,message);}
    static void run(D408IntegrationInstrumentation t)throws Exception {
        t.test("D408-F01-real-native-timer-controls-and-task-picker",()->timerUi(t));
        t.test("D408-F02-all-history-and-native-day-statistics",()->history(t));
        t.test("D408-F03-feedback-main-tools-list-editor-save",()->feedbackUi(t));
        t.test("D408-F04-feedback-real-image-draft-backup-restore-generation",()->feedbackStorage(t));
        t.test("D408-F05-feedback-delete-batch-undo-and-stale-generation",()->feedbackDelete(t));
        t.test("D408-F06-task-navigation-through-work-pages",()->navigation(t));
        t.test("D408-F07-version-history-and-copy-controls",()->version(t));
    }
    static void nativeTap(D408IntegrationInstrumentation t,Activity activity,int id)throws Exception{
        View view=activity.findViewById(id);check(view!=null,"Native control id="+id);t.runOnMainSync(()->view.requestRectangleOnScreen(new android.graphics.Rect(0,0,view.getWidth(),view.getHeight()),true));SystemClock.sleep(250);t.tap(view);SystemClock.sleep(300);
    }
    static void nativeText(D408IntegrationInstrumentation t,Activity activity,String text)throws Exception{
        View view=t.find(activity.getWindow().getDecorView(),TextView.class,text);check(view!=null,"Native text control "+text);t.runOnMainSync(()->view.requestRectangleOnScreen(new android.graphics.Rect(0,0,view.getWidth(),view.getHeight()),true));SystemClock.sleep(250);t.tap(view);SystemClock.sleep(300);
    }
    static void dismissIme(D408IntegrationInstrumentation t,Activity activity)throws Exception{
        boolean[] visible={false};t.runOnMainSync(()->{WindowInsets insets=activity.getWindow().getDecorView().getRootWindowInsets();visible[0]=insets!=null&&insets.isVisible(WindowInsets.Type.ime());});
        if(visible[0]){t.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);t.waitForIdleSync();SystemClock.sleep(250);}
    }
    static JSONObject timerUi(D408IntegrationInstrumentation t)throws Exception{
        t.foreground();WebView web=((D408Activity)t.current).previewWebView();t.until("authoritative candidate ready",15000,()->"true".equals(t.js(web,"!!window.D4Prototype&&document.documentElement.dataset.nativeReminders==='saved'")));
        String id="d408-timer-ui-task",title="D408_NATIVE_LINK_"+BuildInfo.RUN_ID;
        t.js(web,"if(!D4Prototype.repo.getTask('"+id+"'))D4Prototype.repo.createTask({id:'"+id+"',title:"+JSONObject.quote(title)+"})");
        t.until("task mirrored for native selection",10000,()->PomodoroTasks.search(t.target,title,100).getJSONArray("tasks").length()==1);
        t.configure("countup",25);t.js(web,"D4Prototype.navigate('pomodoro')");SystemClock.sleep(300);
        Instrumentation.ActivityMonitor monitor=t.addMonitor(D408TimerActivity.class.getName(),null,false);t.webTap(web,"[data-action=personal-native-timer]");
        Activity page=t.waitForMonitorWithTimeout(monitor,10000);t.removeMonitor(monitor);check(page!=null,"Real Web navigation opened native timer");t.current=page;t.awaitForeground(page);
        t.until("native ready",8000,()->page.findViewById(40302).isEnabled());nativeTap(t,page,40810);
        // Picker dialog uses actual native buttons; no direct configure call for the selection under test.
        check(tapWindowText(t,title,8000),"Native task selection exposes title");SystemClock.sleep(200);
        nativeTap(t,page,40310);t.until("selected task durably configured",8000,()->id.equals(t.state().optString("taskId")));
        nativeTap(t,page,40302);t.until("actual start button",5000,()->t.state().optBoolean("running"));String session=t.state().getString("sessionId");
        SystemClock.sleep(1200);nativeTap(t,page,40304);t.until("actual pause",5000,()->"paused".equals(t.state().optString("status")));
        long paused=t.state().getLong("elapsedMillis");SystemClock.sleep(1100);check(t.state().getLong("elapsedMillis")==paused,"Pause freezes earned time");
        nativeTap(t,page,40305);t.until("actual resume",5000,()->t.state().optBoolean("running"));SystemClock.sleep(500);
        nativeTap(t,page,40308);t.until("actual finish countup",5000,()->"completed".equals(t.state().optString("status")));
        JSONObject row=t.state().getJSONArray("history").getJSONObject(0);check(session.equals(row.getString("id"))&&id.equals(row.getString("taskId")),"Completed linked history persists");
        t.shot("d408-native-timer-full-controls");t.runOnMainSync(page::finish);t.foreground();
        return new JSONObject().put("sessionId",session).put("taskId",id).put("history",row).put("pausedMillis",paused).put("interaction","real entry, task picker and native controls");
    }
    static JSONObject history(D408IntegrationInstrumentation t)throws Exception{
        t.configure("countup",25);List<String> created=new ArrayList<>();
        for(int i=0;i<12;i++){JSONObject start=t.command("start",new JSONObject());created.add(start.getString("sessionId"));t.command("end",new JSONObject());}
        Activity page=t.launch(D408TimerActivity.class);t.until("history state loaded",8000,()->page.findViewById(40302).isEnabled());nativeTap(t,page,40821);
        String oldest=created.get(0);boolean reached=false;for(int i=0;i<30;i++){if(windowContains(t,oldest)){reached=true;break;}deviceSwipe(t,280,740,280,260,350);SystemClock.sleep(200);}
        check(reached,"Real history scroll reaches more than ten records");t.shot("d408-history-oldest");t.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);SystemClock.sleep(250);nativeTap(t,page,40822);
        check(windowContains(t,"专注统计"),"Native statistics dialog");t.shot("d408-native-statistics");t.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);t.runOnMainSync(page::finish);t.foreground();
        return new JSONObject().put("createdSessions",new JSONArray(created)).put("totalHistory",t.state().getJSONArray("history").length()).put("oldestReached",reached);
    }
    static JSONObject feedbackUi(D408IntegrationInstrumentation t)throws Exception{
        t.foreground();WebView web=((D408Activity)t.current).previewWebView();t.until("web ready",15000,()->"true".equals(t.js(web,"!!window.D4Prototype")));t.js(web,"D4Prototype.navigate('feedback')");SystemClock.sleep(300);
        Instrumentation.ActivityMonitor toolMonitor=t.addMonitor(FeedbackToolsActivity.class.getName(),null,false);t.webTap(web,"[data-d408-feedback]");Activity tools=t.waitForMonitorWithTimeout(toolMonitor,10000);t.removeMonitor(toolMonitor);check(tools!=null,"Feedback primary button opens original tools");t.current=tools;t.awaitForeground(tools);
        Instrumentation.ActivityMonitor listMonitor=t.addMonitor("com.androidshared.feedback.FeedbackActivity",null,false);nativeText(t,tools,"查看优化意见");Activity list=t.waitForMonitorWithTimeout(listMonitor,10000);t.removeMonitor(listMonitor);check(list!=null,"Original list reached");t.current=list;t.awaitForeground(list);t.shot("d408-feedback-original-list");t.runOnMainSync(list::finish);t.current=tools;t.awaitForeground(tools);
        Instrumentation.ActivityMonitor editorMonitor=t.addMonitor("com.androidshared.feedback.FeedbackActivity",null,false);nativeText(t,tools,"记个想法");Activity editor=t.waitForMonitorWithTimeout(editorMonitor,10000);t.removeMonitor(editorMonitor);check(editor!=null,"Original editor reached from tool button");t.current=editor;t.awaitForeground(editor);
        t.until("feedback editor",8000,()->t.find(editor.getWindow().getDecorView(),EditText.class,null)!=null);View input=t.find(editor.getWindow().getDecorView(),EditText.class,null);t.tap(input);String body="D408_REAL_ENTRY_"+BuildInfo.RUN_ID;t.sendStringSync(body);t.waitForIdleSync();dismissIme(t,editor);
        nativeText(t,editor,"保存意见");DefaultFeedbackStorage storage=new DefaultFeedbackStorage(t.target);t.until("actual original feedback storage",10000,()->storage.all(FeedbackStorage.NOTES).stream().anyMatch(n->body.equals(n.optString("body"))));t.shot("d408-feedback-saved-details");
        t.runOnMainSync(editor::finish);t.runOnMainSync(tools::finish);t.foreground();return new JSONObject().put("body",body).put("storage","original FeedbackKit default namespace").put("aarVersion",FeedbackKit.VERSION);
    }
    static JSONObject origin(Context context)throws Exception{return new JSONObject().put("appId",context.getPackageName()).put("appName","MyTodo D408 isolated QA").put("versionName",BuildInfo.VERSION_NAME).put("versionCode",BuildInfo.VERSION_CODE).put("pageLabel","D408 isolated storage regression");}
    static String hash(InputStream stream)throws Exception{MessageDigest md=MessageDigest.getInstance("SHA-256");try(InputStream input=stream){byte[] bytes=new byte[32768];int n;while((n=input.read(bytes))!=-1)md.update(bytes,0,n);}StringBuilder out=new StringBuilder();for(byte b:md.digest())out.append(String.format(Locale.ROOT,"%02x",b&255));return out.toString();}
    static JSONObject storageSnapshot(DefaultFeedbackStorage storage)throws Exception{JSONObject out=new JSONObject();for(String bucket:new String[]{FeedbackStorage.NOTES,FeedbackStorage.DRAFTS,FeedbackStorage.META})out.put(bucket,new JSONArray(storage.all(bucket)));return out;}
    static JSONObject feedbackStorage(D408IntegrationInstrumentation t)throws Exception{
        String ns="d408_image_"+BuildInfo.RUN_ID;DefaultFeedbackStorage storage=new DefaultFeedbackStorage(t.target,ns);FeedbackRepository repo=new FeedbackRepository(storage,storage);
        File image=new File(t.target.getCacheDir(),"d408-actual-image.png");Bitmap bitmap=Bitmap.createBitmap(32,24,Bitmap.Config.ARGB_8888);bitmap.eraseColor(Color.rgb(25,130,90));try(OutputStream output=new FileOutputStream(image)){check(bitmap.compress(Bitmap.CompressFormat.PNG,100,output),"Actual PNG");}bitmap.recycle();String imageHash=hash(new FileInputStream(image));
        JSONObject draft=repo.beginDraft(origin(t.target),null);String draftId=draft.getString("id");repo.updateDraft(draftId,new JSONObject().put("body","D408 actual image and draft").put("category","experience").put("status","pending"));repo.addImages(draftId,Collections.singletonList(Uri.fromFile(image)));
        FeedbackRepository reopened=new FeedbackRepository(new DefaultFeedbackStorage(t.target,ns),storage);JSONObject recovered=reopened.draft();check(recovered!=null&&draftId.equals(recovered.getString("id")),"Original draft recovered by new repository");String asset=recovered.getJSONObject("note").getJSONArray("assetIds").getString(0);check(imageHash.equals(hash(storage.openImage(asset))),"Actual image bytes preserved before save");
        JSONObject saved=reopened.saveDraft(draftId);check(storage.all(FeedbackStorage.DRAFTS).isEmpty(),"Save commits note and removes draft");JSONObject another=reopened.beginDraft(origin(t.target),null);reopened.updateDraft(another.getString("id"),new JSONObject().put("body","D408 unsaved draft survives backup"));
        JSONObject before=storageSnapshot(storage);long generation=storage.generation();File archive=new File(t.evidence,"feedback-full-backup.zip");storage.exportBackup(Uri.fromFile(archive));reopened.discardDraft(another.getString("id"));reopened.setStatus(saved.getString("id"),"done",saved.getLong("revision"));storage.restoreBackup(Uri.fromFile(archive));
        check(before.toString().equals(storageSnapshot(storage).toString()),"Notes drafts meta restore roundtrip");check(storage.generation()>generation,"Restore generation increases");check(imageHash.equals(hash(storage.openImage(asset))),"Restored image bytes hash matches");
        File corrupt=new File(t.evidence,"feedback-corrupt-backup.zip");try(FileOutputStream output=new FileOutputStream(corrupt)){output.write("invalid zip".getBytes(java.nio.charset.StandardCharsets.UTF_8));}String error="";JSONObject unchanged=storageSnapshot(storage);long stable=storage.generation();try{storage.restoreBackup(Uri.fromFile(corrupt));}catch(Exception failure){error=failure.getMessage();}check(!error.isEmpty(),"Corrupt backup visibly rejected");check(unchanged.toString().equals(storageSnapshot(storage).toString())&&stable==storage.generation(),"Corrupt restore preserves records and generation");check(imageHash.equals(hash(storage.openImage(asset))),"Corrupt restore preserves real image");
        return new JSONObject().put("namespace",ns).put("imageSha256",imageHash).put("assetId",asset).put("note",saved).put("generationBefore",generation).put("generationAfter",storage.generation()).put("corruptError",error).put("backupSha256",hash(new FileInputStream(archive)));
    }
    static JSONObject feedbackDelete(D408IntegrationInstrumentation t)throws Exception{
        String ns="d408_delete_"+BuildInfo.RUN_ID;DefaultFeedbackStorage storage=new DefaultFeedbackStorage(t.target,ns);FeedbackRepository repo=new FeedbackRepository(storage,storage);List<String> ids=new ArrayList<>();
        for(int i=0;i<2;i++){JSONObject draft=repo.beginDraft(origin(t.target),null);repo.updateDraft(draft.getString("id"),new JSONObject().put("body","D408 batch "+i));ids.add(repo.saveDraft(draft.getString("id")).getString("id"));}
        JSONObject edit=repo.beginDraft(origin(t.target),ids.get(0));repo.updateDraft(edit.getString("id"),new JSONObject().put("body","unsaved draft in deletion batch"));
        FeedbackRepository.DeletionPreview preview=repo.previewDelete(ids);JSONObject removed=repo.removeBatch(preview);check(storage.deletedNotes().size()==2,"Batch creates two tombstones");JSONObject tombstone=storage.get(FeedbackStorage.NOTES,ids.get(0));String token=tombstone.getString("deleteToken");
        repo.undoDelete(ids.get(0),token);check(storage.deletedNotes().isEmpty()&&repo.draft()!=null,"Undo restores whole batch and draft");repo.discardDraft(repo.draft().getString("id"));
        FeedbackRepository.DeletionPreview stale=repo.previewDelete(ids);JSONObject one=repo.get(ids.get(0));repo.setStatus(ids.get(0),"done",one.getLong("revision"));String staleError="";try{repo.removeBatch(stale);}catch(Exception expected){staleError=expected.getMessage();}check(!staleError.isEmpty()&&storage.deletedNotes().isEmpty(),"Stale preview rejected without partial delete");
        repo.removeBatch(repo.previewDelete(ids));String oldToken=storage.get(FeedbackStorage.NOTES,ids.get(0)).getString("deleteToken");File archive=new File(t.evidence,"feedback-deletion-backup.zip");storage.exportBackup(Uri.fromFile(archive));long before=storage.generation();storage.restoreBackup(Uri.fromFile(archive));FeedbackRepository current=new FeedbackRepository(storage,storage);String rotated=storage.get(FeedbackStorage.NOTES,ids.get(0)).getString("deleteToken");check(!oldToken.equals(rotated)&&storage.generation()>before,"Restore rotates batch token and generation");String oldError="";try{current.undoDelete(ids.get(0),oldToken);}catch(Exception expected){oldError=expected.getMessage();}check(!oldError.isEmpty()&&storage.deletedNotes().size()==2,"Old undo token cannot mutate restored batch");current.undoDelete(ids.get(0),rotated);check(storage.deletedNotes().isEmpty(),"Current token restores batch");
        return new JSONObject().put("namespace",ns).put("ids",new JSONArray(ids)).put("deletedReceipt",removed).put("stalePreviewError",staleError).put("oldTokenError",oldError).put("generation",storage.generation());
    }
    static JSONObject navigation(D408IntegrationInstrumentation t)throws Exception{
        t.foreground();WebView web=((D408Activity)t.current).previewWebView();t.until("navigation ready",15000,()->"true".equals(t.js(web,"!!window.DemoMobileControls&&!!window.D4Prototype")));JSONArray observations=new JSONArray();
        String[] routes={"tasks","notes","pomodoro","analytics","work-items","projects","templates","processes","contacts","archive","settings","feedback","dashboard"};
        for(String route:routes){t.js(web,"D4Prototype.navigate("+JSONObject.quote(route)+");DemoMobileControls.nav(false)");SystemClock.sleep(150);int[] xy=new int[2];t.runOnMainSync(()->web.getLocationOnScreen(xy));double width=Double.parseDouble(t.js(web,"innerWidth"));float scale=web.getWidth()/(float)width;int y=Integer.parseInt(t.js(web,"(()=>{for(let y=90;y<=260;y+=10){const e=document.elementFromPoint(32,y);if(e?.closest('main')&&!e.closest('input,textarea,select,button,a,summary,.task-row,.table-wrap,[contenteditable]'))return y;}throw Error('No eligible edge target');})()"));deviceSwipe(t,xy[0]+32*scale,xy[1]+y*scale,xy[0]+170*scale,xy[1]+(y+2)*scale,300);check("true".equals(t.js(web,"document.querySelector('.app-shell').classList.contains('nav-open')")),"Real wider edge navigation: "+route);t.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);SystemClock.sleep(180);check("false".equals(t.js(web,"document.querySelector('.app-shell').classList.contains('nav-open')")),"System back closes drawer: "+route);observations.put(new JSONObject().put("route",route).put("startCssX",32).put("startCssY",y).put("opened",true).put("backClosed",true));}
        t.shot("d408-navigation-final");return new JSONObject().put("observations",observations).put("scope","real injected touch in current emulator navigation mode; independent D408 navigation suite covers mode and width matrix");
    }
    static JSONObject version(D408IntegrationInstrumentation t)throws Exception{
        Activity page=t.launch(D408TimerActivity.class);t.until("version page ready",8000,()->page.findViewById(40302).isEnabled());nativeTap(t,page,40831);check(windowContains(t,BuildInfo.VERSION_NAME)&&windowContains(t,String.valueOf(BuildInfo.VERSION_CODE))&&windowContains(t,BuildInfo.BUILD_TIME_UTC),"Actual build identity appears in native version dialog");t.shot("d408-native-version");t.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);t.runOnMainSync(page::finish);t.foreground();return new JSONObject().put("versionName",BuildInfo.VERSION_NAME).put("versionCode",BuildInfo.VERSION_CODE).put("buildTimeUTC",BuildInfo.BUILD_TIME_UTC);
    }
    static void prepareBoot(D408IntegrationInstrumentation t){t.test("D408-B01-prepare-real-device-reboot",()->{t.configure("countup",25);JSONObject state=t.command("start",new JSONObject());JSONObject fixture=new JSONObject().put("state",state).put("bootCount",Settings.Global.getInt(t.target.getContentResolver(),Settings.Global.BOOT_COUNT,-1)).put("pid",android.os.Process.myPid());D408IntegrationInstrumentation.write(new File(t.evidence,"boot-fixture.json"),fixture.toString(2));return fixture;});}
    static void recoverBoot(D408IntegrationInstrumentation t){t.test("D408-B02-real-device-reboot-recovers-session",()->{JSONObject old=new JSONObject(D408IntegrationInstrumentation.read(new File(t.evidence,"boot-fixture.json"))),next=t.state();int boot=Settings.Global.getInt(t.target.getContentResolver(),Settings.Global.BOOT_COUNT,-1);check(boot>old.getInt("bootCount"),"Actual boot count changed");check(next.getString("sessionId").equals(old.getJSONObject("state").getString("sessionId"))&&next.optBoolean("running"),"Same session after real reboot");check(next.getLong("elapsedMillis")>=old.getJSONObject("state").getLong("elapsedMillis"),"Nonnegative elapsed recovery");t.until("native service after restart",10000,()->t.notice(8501)!=null);t.shot("d408-reboot-recovered");t.command("reset",new JSONObject());return new JSONObject().put("prior",old).put("newBootCount",boot).put("restored",next);});}
    static void notificationDenied(D408IntegrationInstrumentation t){t.test("D408-P01-denied-notification-keeps-completion",()->{check(!((NotificationManager)t.target.getSystemService(Context.NOTIFICATION_SERVICE)).areNotificationsEnabled(),"Notifications actually denied");t.configure("countup",25);t.command("start",new JSONObject());JSONObject done=t.command("finish",new JSONObject());CountDownLatch wake=new CountDownLatch(1);D408TimerCompanion.wake(t.target,wake::countDown);check(wake.await(10,TimeUnit.SECONDS),"Denied wake returns");check(t.state().optBoolean("completionPending"),"Denied notification never consumes completion");D408IntegrationInstrumentation.write(new File(t.evidence,"notification-denied-fixture.json"),done.toString(2));return done;});}
    static void notificationRestored(D408IntegrationInstrumentation t){t.test("D408-P02-restored-notification-delivers-pending",()->{JSONObject old=new JSONObject(D408IntegrationInstrumentation.read(new File(t.evidence,"notification-denied-fixture.json")));CountDownLatch wake=new CountDownLatch(1);D408TimerCompanion.wake(t.target,wake::countDown);check(wake.await(10,TimeUnit.SECONDS),"Restored wake returns");t.until("pending notice delivered",10000,()->!t.state().optBoolean("completionPending")&&t.notice(8502)!=null);check(old.getString("sessionId").equals(t.notice(8502).getTag()),"Correct pending session delivered");return new JSONObject().put("sessionId",old.getString("sessionId")).put("delivered",true);});}
    static void exactDenied(D408IntegrationInstrumentation t){t.test("D408-P03-inexact-fallback-completes-real-minute",()->{check(!((AlarmManager)t.target.getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms(),"Exact alarm actually denied");t.configure("countdown",1);JSONObject started=t.command("start",new JSONObject());t.runOnMainSync(()->t.current.moveTaskToBack(true));t.until("real minute with fallback",80000,()->t.notice(8502)!=null&&started.getString("sessionId").equals(t.notice(8502).getTag()));t.foreground();return new JSONObject().put("sessionId",started.getString("sessionId")).put("exactAllowed",false).put("state",t.state());});}
    static void deviceSwipe(D408IntegrationInstrumentation t,float sx,float sy,float ex,float ey,long duration)throws Exception{long down=SystemClock.uptimeMillis();MotionEvent first=MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,sx,sy,0);first.setSource(InputDevice.SOURCE_TOUCHSCREEN);t.sendPointerSync(first);first.recycle();for(int i=1;i<=18;i++){SystemClock.sleep(duration/18);MotionEvent e=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_MOVE,sx+(ex-sx)*i/18,sy+(ey-sy)*i/18,0);e.setSource(InputDevice.SOURCE_TOUCHSCREEN);t.sendPointerSync(e);e.recycle();}MotionEvent end=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,ex,ey,0);end.setSource(InputDevice.SOURCE_TOUCHSCREEN);t.sendPointerSync(end);end.recycle();t.waitForIdleSync();SystemClock.sleep(200);}
    static boolean windowContains(D408IntegrationInstrumentation t,String text){android.view.accessibility.AccessibilityNodeInfo root=t.getUiAutomation().getRootInActiveWindow();return contains(root,text);}
    static boolean contains(android.view.accessibility.AccessibilityNodeInfo n,String text){if(n==null)return false;if(n.isVisibleToUser()&&n.getText()!=null&&n.getText().toString().contains(text))return true;for(int i=0;i<n.getChildCount();i++)if(contains(n.getChild(i),text))return true;return false;}
    static boolean tapWindowText(D408IntegrationInstrumentation t,String text,long timeout)throws Exception{
        // Resolve the actual visible dialog node, then inject a real screen touch.
        long end=SystemClock.elapsedRealtime()+timeout;while(SystemClock.elapsedRealtime()<end){android.view.accessibility.AccessibilityNodeInfo root=t.getUiAutomation().getRootInActiveWindow();android.view.accessibility.AccessibilityNodeInfo node=findNode(root,text);if(node!=null){android.graphics.Rect r=new android.graphics.Rect();node.getBoundsInScreen(r);deviceSwipe(t,r.exactCenterX(),r.exactCenterY(),r.exactCenterX(),r.exactCenterY(),1);return true;}SystemClock.sleep(200);}return false;
    }
    static android.view.accessibility.AccessibilityNodeInfo findNode(android.view.accessibility.AccessibilityNodeInfo n,String text){if(n==null)return null;if(n.isVisibleToUser()&&n.getText()!=null&&n.getText().toString().equals(text))return n;for(int i=0;i<n.getChildCount();i++){android.view.accessibility.AccessibilityNodeInfo found=findNode(n.getChild(i),text);if(found!=null)return found;}return null;}
}
