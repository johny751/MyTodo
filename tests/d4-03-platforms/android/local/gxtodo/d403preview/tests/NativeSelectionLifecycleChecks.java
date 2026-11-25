package local.gxtodo.d403preview.tests;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Rect;
import android.os.Parcel;
import android.os.PersistableBundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.ViewConfiguration;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;
import local.gxtodo.d403preview.NativeTimerActivity;
import org.json.JSONArray;
import org.json.JSONObject;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/** Independent additive regression. Every Copy, Paste and Activity entry uses real input. */
final class NativeSelectionLifecycleChecks {
    private static final String HEADING="main[data-route=pomodoro] .page-heading h1";
    private static final String NATIVE="[data-action=personal-native-timer]";
    private static final String BODY="[data-form=personal-note] [name=body]";
    private static final String NAME="native-floating-selection-lifecycle-copy-paste";

    static void copyPasteAfterReturn(NativeDocumentChooserChecks.Host h) throws Exception {
        Case c=new Case(h);Throwable failure=null;
        try { c.setup();c.run(); }
        catch(Exception|Error error) {
            failure=error;
            try { c.receipt.put("failure",error.toString()).put("failureWindows",c.windows());c.save(); }
            catch(Exception|Error capture){error.addSuppressed(capture);}
            try {h.shot("failure-"+NAME+"-before-cleanup");}catch(Exception|Error capture){error.addSuppressed(capture);}
            throw error;
        } finally {
            try { c.cleanup(); } catch(Exception|Error cleanup){if(failure==null)throw cleanup;failure.addSuppressed(cleanup);}
        }
    }

    private static final class Case {
        final NativeDocumentChooserChecks.Host h;
        final JSONObject receipt=new JSONObject();final JSONArray actions=new JSONArray(),cleanupRows=new JSONArray();
        ClipData originalClip;String originalClipSignature,ownedClipSignature;
        String oldState,oldDemo,oldStorage,storageKey;int oldFlags;
        boolean savedState,changedClipboard,changedFlags;Activity nativeActivity;
        Instrumentation.ActivityMonitor monitor;
        Case(NativeDocumentChooserChecks.Host h){this.h=h;}

        void setup() throws Exception {
            h.home();oldState=(String)h.js("JSON.stringify(D4Prototype.repo.state)");oldDemo=(String)h.js("JSON.stringify(D4Prototype.repo.demo)");
            storageKey=(String)h.js("D4Prototype.storageKey");Object raw=h.js("localStorage.getItem(D4Prototype.storageKey)");oldStorage=raw==JSONObject.NULL?null:(String)raw;savedState=true;
            receipt.put("case",NAME).put("syntheticOnly",true).put("actions",actions).put("cleanup",cleanupRows)
                .put("selectionAssignedByScript",false).put("clipboardTextTypedIntoInput",false).put("activityResultInjected",false);
            AccessibilityServiceInfo info=h.instrumentation().getUiAutomation().getServiceInfo();require(info!=null,"Accessibility configuration is observable");oldFlags=info.flags;
            info.flags|=AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS|AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
            h.instrumentation().getUiAutomation().setServiceInfo(info);changedFlags=true;
            originalClip=readClip();originalClipSignature=signature(originalClip);
            ClipData sentinel=ClipData.newPlainText("D403 synthetic copy probe","d403-copy-sentinel-"+Long.toHexString(SystemClock.elapsedRealtimeNanos()));
            ownedClipSignature=signature(sentinel);changedClipboard=true;writeClip(sentinel);
            require(ownedClipSignature.equals(signature(readClip())),"Synthetic sentinel reaches the real clipboard");
            receipt.put("originalClipboardWasEmpty",originalClip==null).put("clipboardRestoreScope","Original ClipData object, all item payloads, label, MIME types and extras; platform-controlled timestamps/classification may be regenerated");save();
        }
        void run() throws Exception {
            h.openPage("pomodoro");String initial=selectHeading("before-native-entry");
            monitor=h.instrumentation().addMonitor(NativeTimerActivity.class.getName(),null,false);
            Target before=waitMenu("Copy");actions.put(new JSONObject().put("stage","entry-menu-visible").put("selectedText",initial).put("menu",before.json()));
            // The real existing button is hit at its freshly observed viewport coordinate.
            // If the platform consumes this tap to dismiss its toolbar, that is recorded.
            float[] button=domPoint(NATIVE,false);tapScreen(button[0],button[1]);
            nativeActivity=monitor.waitForActivityWithTimeout(3000);
            boolean enteredWithVisibleMenu=nativeActivity!=null;
            receipt.put("navigationAttemptWhileMenuVisible",true).put("nativeEntryFromFirstTap",enteredWithVisibleMenu);
            if(nativeActivity==null) {
                require(mainFocused(),"Menu-dismiss fallback remains in the original WebView Activity");
                require(Boolean.TRUE.equals(h.js("document.querySelector('main').dataset.route==='pomodoro'")),"Menu-dismiss fallback retains Pomodoro page");
                String copied=selectHeading("fallback-copy-before-entry");copy(copied);pasteIntoNote(copied,"fallback-before-native-entry");
                h.back();if(Boolean.TRUE.equals(h.js("!!document.querySelector('[data-form=personal-note]')")))h.tap("[data-form=personal-note] [data-action=personal-close]");
                h.openPage("pomodoro");h.tap(NATIVE);nativeActivity=monitor.waitForActivityWithTimeout(5000);
                receipt.put("fallback","First entry tap did not open Activity; completed real Copy/Paste in this Activity, discarded its note draft, then used the existing native-entry button");
            }
            require(nativeActivity instanceof NativeTimerActivity,"Actual page button opens the real NativeTimerActivity");
            receipt.put("nativeActivity",nativeActivity.getClass().getName());save();
            h.back();awaitMain();
            require(Boolean.TRUE.equals(h.js("document.querySelector('main').dataset.route==='pomodoro'")),"Android Back returns to the original Pomodoro page");
            require(findMenu("Copy")==null,"Returning from native Activity does not revive the old native Copy menu");
            receipt.put("staleCopyMenuAfterReturn",false).put("returnWindows",windows());
            String selected=selectHeading("fresh-selection-after-return");copy(selected);
            pasteIntoNote(selected,"after-native-return");
            require(oldState.equals(h.js("JSON.stringify(D4Prototype.repo.state)")),"Selection and unsaved note draft preserve all core tasks and projects");
            receipt.put("copiedText",selected).put("pastedTextExact",true).put("foregroundCopyAvailableAfterReturn",true).put("foregroundPasteAvailableAfterReturn",true);save();h.shot("android-"+NAME);
        }
        void pasteIntoNote(String selected,String stage) throws Exception {
            h.openPage("notes");h.tap("[data-action=personal-note-new]");
            require("".equals(h.js("document.querySelector('"+BODY+"').value")),"New note input starts empty without typing clipboard text");
            h.tap(BODY);longPress(domPoint(BODY,false));Target paste=waitMenu("Paste");
            actions.put(new JSONObject().put("stage",stage+"-paste-menu").put("menu",paste.json()));tapScreen(paste.bounds.exactCenterX(),paste.bounds.exactCenterY());h.settle();
            require(selected.equals(h.js("document.querySelector('"+BODY+"').value")),"Real native Paste inserts the exact observed selected text: "+stage);
            require(ownedClipSignature.equals(signature(readClip())),"Paste retains the copied clipboard payload");
            actions.put(new JSONObject().put("stage",stage+"-paste-result").put("exact",true).put("text",selected));save();
        }
        String selectHeading(String stage) throws Exception {
            // A detached Range only measures existing glyph bounds. It never changes DOM selection.
            float[] point=headingPoint();longPress(point);Target copy=waitMenu("Copy");
            String selected=(String)h.js("getSelection().toString()");String title=(String)h.js("document.querySelector('"+HEADING+"').textContent");
            require(!selected.isEmpty()&&title.contains(selected),"Actual native long press selects existing Pomodoro heading text");
            actions.put(new JSONObject().put("stage",stage).put("selectedText",selected).put("menu",copy.json()).put("windows",windows()));save();return selected;
        }
        void copy(String selected) throws Exception {
            Target copy=waitMenu("Copy");tapScreen(copy.bounds.exactCenterX(),copy.bounds.exactCenterY());h.settle();
            ClipData clip=readClip();require(clip!=null&&clip.getItemCount()==1&&clip.getItemAt(0).getText()!=null&&selected.contentEquals(clip.getItemAt(0).getText()),"Actual native Copy puts the observed selected string on the system clipboard");
            ownedClipSignature=signature(clip);actions.put(new JSONObject().put("stage","native-copy").put("selectedText",selected).put("menu",copy.json()));save();
        }
        float[] headingPoint() throws Exception {
            JSONArray p=(JSONArray)h.js("(function(){var el=document.querySelector('"+HEADING+"');if(!el)throw Error('Pomodoro h1 missing');el.scrollIntoView({block:'center'});var walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),n;while(n=walker.nextNode()){if(n.textContent.trim()){var r=document.createRange();r.selectNodeContents(n);var b=r.getBoundingClientRect();if(b.width&&b.height){var x=b.left+b.width/2,y=b.top+b.height/2,v=visualViewport;if(!v||x<0||x>=innerWidth||y<0||y>=innerHeight||!el.contains(document.elementFromPoint(x,y)))throw Error('Heading glyph point is not a visible hit target');return [x,y,innerWidth,v.scale,v.offsetLeft,v.offsetTop,v.width];}}}throw Error('Heading text bounds missing');})()");
            return screen(p);
        }
        float[] domPoint(String selector,boolean scroll) throws Exception {
            JSONArray p=(JSONArray)h.js("(function(){var el=document.querySelector("+JSONObject.quote(selector)+");if(!el)throw Error('Missing real control');"+(scroll?"el.scrollIntoView({block:'center'});":"")+"var r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,v=visualViewport;if(!v||!r.width||!r.height||x<0||x>=innerWidth||y<0||y>=innerHeight||!el.contains(document.elementFromPoint(x,y)))throw Error('Control is not an observed visible hit target');return [x,y,innerWidth,v.scale,v.offsetLeft,v.offsetTop,v.width];})()");return screen(p);
        }
        float[] screen(JSONArray p) throws Exception {
            require(Math.abs(p.getDouble(3)-1d)<.001&&Math.abs(p.getDouble(4))<.5&&Math.abs(p.getDouble(5))<.5&&Math.abs(p.getDouble(6)-p.getDouble(2))<.5,"Native text gesture requires the observed simple viewport, without zoom or visual offset");
            final int[] bounds=new int[3];h.instrumentation().runOnMainSync(()->{h.main().previewWebView().getLocationOnScreen(bounds);bounds[2]=h.main().previewWebView().getWidth();});
            float scale=(float)(bounds[2]/p.getDouble(2));require(scale>0,"Observed WebView viewport scale is positive");float[] result={bounds[0]+(float)p.getDouble(0)*scale,bounds[1]+(float)p.getDouble(1)*scale};
            actions.put(new JSONObject().put("stage","observed-touch-geometry").put("cssAndViewport",p).put("webScreenX",bounds[0]).put("webScreenY",bounds[1]).put("webWidth",bounds[2]).put("screenX",result[0]).put("screenY",result[1]));return result;
        }
        void longPress(float[] p) throws Exception {
            long down=SystemClock.uptimeMillis();boolean held=false;
            try { event(down,MotionEvent.ACTION_DOWN,p[0],p[1]);held=true;SystemClock.sleep(ViewConfiguration.getLongPressTimeout()+250);event(down,MotionEvent.ACTION_UP,p[0],p[1]);held=false; }
            finally {if(held)event(down,MotionEvent.ACTION_CANCEL,p[0],p[1]);}h.settle();
        }
        void tapScreen(float x,float y) throws Exception {
            long down=SystemClock.uptimeMillis();boolean held=false;
            try {event(down,MotionEvent.ACTION_DOWN,x,y);held=true;SystemClock.sleep(60);event(down,MotionEvent.ACTION_UP,x,y);held=false;}
            finally {if(held)event(down,MotionEvent.ACTION_CANCEL,x,y);}
        }
        void event(long down,int action,float x,float y) throws Exception {
            MotionEvent event=MotionEvent.obtain(down,SystemClock.uptimeMillis(),action,x,y,0);event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
            try {h.instrumentation().sendPointerSync(event);}finally{event.recycle();}
        }
        boolean mainFocused(){final boolean[] value={false};h.instrumentation().runOnMainSync(()->value[0]=h.main()!=null&&!h.main().isDestroyed()&&h.main().hasWindowFocus()&&h.main().previewWebView()!=null&&h.main().previewWebView().isShown());return value[0];}
        void awaitMain() throws Exception {long end=SystemClock.elapsedRealtime()+6000;while(SystemClock.elapsedRealtime()<end){if(mainFocused()){h.settle();return;}SystemClock.sleep(100);}throw new AssertionError("Original WebView Activity did not regain focus");}
        Target waitMenu(String action) throws Exception {long end=SystemClock.elapsedRealtime()+6000;while(SystemClock.elapsedRealtime()<end){Target t=findMenu(action);if(t!=null)return t;SystemClock.sleep(120);}throw new AssertionError("Actual native "+action+" menu is not observable outside WebView subtrees");}
        Target findMenu(String action) throws Exception {
            List<Target> found=new ArrayList<>();List<AccessibilityWindowInfo> list=h.instrumentation().getUiAutomation().getWindows();
            try {for(AccessibilityWindowInfo window:list){AccessibilityNodeInfo root=window.getRoot();try{if(root!=null&&h.instrumentation().getTargetContext().getPackageName().contentEquals(root.getPackageName()==null?"":root.getPackageName()))scan(root,window.getId(),action,found,0);}finally{if(root!=null)root.recycle();}}}
            finally {for(AccessibilityWindowInfo window:list)window.recycle();}
            require(found.size()<=1,"Native "+action+" menu target is unique across interactive windows");return found.isEmpty()?null:found.get(0);
        }
        void scan(AccessibilityNodeInfo node,int window,String action,List<Target> found,int depth) throws Exception {
            if(depth>30||"android.webkit.WebView".contentEquals(node.getClassName()==null?"":node.getClassName()))return;
            String text=String.valueOf(node.getText()),desc=String.valueOf(node.getContentDescription());String chinese="Copy".equals(action)?"复制":"粘贴";
            if(node.isVisibleToUser()&&node.isEnabled()&&(action.equalsIgnoreCase(text)||chinese.equals(text)||action.equalsIgnoreCase(desc)||chinese.equals(desc)){
                AccessibilityNodeInfo hit=AccessibilityNodeInfo.obtain(node);
                try {for(int i=0;i<4&&!hit.isClickable();i++){AccessibilityNodeInfo parent=hit.getParent();if(parent==null)break;hit.recycle();hit=parent;}
                    Rect rect=new Rect();hit.getBoundsInScreen(rect);
                    if(hit.isClickable()&&hit.isEnabled()&&hit.isVisibleToUser()&&!rect.isEmpty()){
                        boolean duplicate=false;for(Target existing:found)if(existing.window==window&&existing.bounds.equals(rect))duplicate=true;
                        if(!duplicate)found.add(new Target(window,rect,text,desc,String.valueOf(node.getViewIdResourceName()),String.valueOf(node.getClassName())));
                    }
                } finally {hit.recycle();}
            }
            for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);if(child!=null)try{scan(child,window,action,found,depth+1);}finally{child.recycle();}}
        }
        JSONArray windows() throws Exception {
            JSONArray result=new JSONArray();List<AccessibilityWindowInfo> list=h.instrumentation().getUiAutomation().getWindows();
            try{for(AccessibilityWindowInfo window:list){Rect rect=new Rect();window.getBoundsInScreen(rect);AccessibilityNodeInfo root=window.getRoot();try{result.put(new JSONObject().put("id",window.getId()).put("type",window.getType()).put("layer",window.getLayer()).put("active",window.isActive()).put("focused",window.isFocused()).put("bounds",rect.toShortString()).put("rootPackage",root==null?JSONObject.NULL:String.valueOf(root.getPackageName())).put("rootClass",root==null?JSONObject.NULL:String.valueOf(root.getClassName())));}finally{if(root!=null)root.recycle();}}}
            finally{for(AccessibilityWindowInfo window:list)window.recycle();}return result;
        }
        ClipData readClip(){AtomicReference<ClipData> value=new AtomicReference<>();h.instrumentation().runOnMainSync(()->value.set(((ClipboardManager)h.main().getSystemService(Context.CLIPBOARD_SERVICE)).getPrimaryClip()));return value.get();}
        void writeClip(ClipData clip){h.instrumentation().runOnMainSync(()->{ClipboardManager manager=(ClipboardManager)h.main().getSystemService(Context.CLIPBOARD_SERVICE);if(clip==null)manager.clearPrimaryClip();else manager.setPrimaryClip(clip);});}
        void save() throws Exception {h.write(NAME+".json",receipt.toString(2));}
        void cleanup() throws Exception {
            Throwable failed=null;
            try{if(monitor!=null)h.instrumentation().removeMonitor(monitor);}
            catch(Exception|Error e){failed=e;cleanupRows.put(new JSONObject().put("monitorError",e.toString()));}
            try{if(nativeActivity!=null&&!nativeActivity.isFinishing()&&!nativeActivity.isDestroyed())h.instrumentation().runOnMainSync(()->nativeActivity.finish());h.launch();h.home();}
            catch(Exception|Error e){if(failed==null)failed=e;else failed.addSuppressed(e);cleanupRows.put(new JSONObject().put("foregroundError",e.toString()));}
            if(changedClipboard)try {
                String current=signature(readClip());require(ownedClipSignature.equals(current)||originalClipSignature.equals(current),"Restore original clipboard only while current contents still belong to this check or remain original");
                if(!originalClipSignature.equals(current))writeClip(originalClip);
                require(originalClipSignature.equals(signature(readClip())),"Restore exact original clipboard item payloads and descriptor, including original null state");cleanupRows.put(new JSONObject().put("originalClipDataRestored",true));
            }catch(Exception|Error e){if(failed==null)failed=e;else failed.addSuppressed(e);cleanupRows.put(new JSONObject().put("clipboardError",e.toString()));}
            if(savedState)try{
                h.js("(function(){D4Prototype.repo.batch(()=>{D4Prototype.repo.replaceState(JSON.parse("+JSONObject.quote(oldState)+"));D4Prototype.repo.updateDemo(()=>JSON.parse("+JSONObject.quote(oldDemo)+"));});return true;})()");h.settle();
                require(oldState.equals(h.js("JSON.stringify(D4Prototype.repo.state)"))&&oldDemo.equals(h.js("JSON.stringify(D4Prototype.repo.demo)")),"Complete synthetic state and demo are restored");
                h.js("(function(){"+(oldStorage==null?"localStorage.removeItem("+JSONObject.quote(storageKey)+");":"localStorage.setItem("+JSONObject.quote(storageKey)+","+JSONObject.quote(oldStorage)+");")+"return true;})()");
                Object actual=h.js("localStorage.getItem("+JSONObject.quote(storageKey)+")");require(oldStorage==null?actual==JSONObject.NULL:oldStorage.equals(actual),"Exact original synthetic localStorage entry is restored");cleanupRows.put(new JSONObject().put("syntheticStateRestored",true).put("storageEntryRestored",true));
            }catch(Exception|Error e){if(failed==null)failed=e;else failed.addSuppressed(e);cleanupRows.put(new JSONObject().put("stateError",e.toString()));}
            if(changedFlags)try{AccessibilityServiceInfo info=h.instrumentation().getUiAutomation().getServiceInfo();require(info!=null,"Accessibility service remains observable");info.flags=oldFlags;h.instrumentation().getUiAutomation().setServiceInfo(info);cleanupRows.put(new JSONObject().put("accessibilityFlagsRestored",true));}
            catch(Exception|Error e){if(failed==null)failed=e;else failed.addSuppressed(e);cleanupRows.put(new JSONObject().put("flagsError",e.toString()));}
            try{save();}catch(Exception|Error e){if(failed==null)failed=e;else failed.addSuppressed(e);}
            if(failed instanceof Exception)throw (Exception)failed;if(failed instanceof Error)throw (Error)failed;
        }
    }
    private static final class Target {
        final int window;final Rect bounds;final String text,description,id,kind;
        Target(int window,Rect bounds,String text,String description,String id,String kind){this.window=window;this.bounds=new Rect(bounds);this.text=text;this.description=description;this.id=id;this.kind=kind;}
        JSONObject json() throws Exception{return new JSONObject().put("windowId",window).put("bounds",bounds.toShortString()).put("text",text).put("description",description).put("id",id).put("class",kind);}
    }
    /** Normalize only platform-owned description metadata, preserving every original item. Never written to evidence. */
    private static String signature(ClipData clip) throws Exception {
        if(clip==null)return "empty";ClipDescription source=clip.getDescription();String[] types=new String[source.getMimeTypeCount()];for(int i=0;i<types.length;i++)types[i]=source.getMimeType(i);
        ClipDescription description=new ClipDescription(source.getLabel(),types);if(source.getExtras()!=null)description.setExtras(new PersistableBundle(source.getExtras()));
        ClipData normalized=new ClipData(description,clip.getItemAt(0));for(int i=1;i<clip.getItemCount();i++)normalized.addItem(clip.getItemAt(i));
        Parcel parcel=Parcel.obtain();try{normalized.writeToParcel(parcel,0);byte[] digest=MessageDigest.getInstance("SHA-256").digest(parcel.marshall());StringBuilder out=new StringBuilder();for(byte b:digest)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();}finally{parcel.recycle();}
    }
    private static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
}
