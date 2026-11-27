package local.gxtodo.replica;

import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.WindowInsets;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Injected device input across the observed Android navigation overlay and screen width. */
final class D408NavigationChecks {
    final D408IntegrationInstrumentation t;
    final String phase;
    WebView web;
    int gestureSequence;
    D408NavigationChecks(D408IntegrationInstrumentation t,String phase){this.t=t;this.phase=phase;}
    static void run(D408IntegrationInstrumentation t,String phase){
        D408NavigationChecks s=new D408NavigationChecks(t,phase);
        s.test("N01-thirteen-routes-real-wider-edge",s::routes);
        s.test("N02-edges-distance-velocity-and-direction",s::edges);
        s.test("N03-task-note-input-and-real-keyboard",s::editors);
        s.test("N04-horizontal-scroll-retains-touch",s::horizontal);
        s.test("N05-work-note-native-selection-and-system-back",s::selection);
    }
    void test(String name,D408IntegrationInstrumentation.Check action){t.test("D408-"+phase+"-"+name,()->{try{return action.run();}catch(Exception|AssertionError failure){try{t.shot("failure-"+phase+"-"+name);}catch(Exception diagnostic){failure.addSuppressed(diagnostic);}throw failure;}});}
    void ready()throws Exception{t.foreground();web=((D408Activity)t.current).previewWebView();t.until("navigation candidate ready",15000,()->"true".equals(t.js(web,"!!window.D4Prototype&&!!window.DemoMobileControls")));int width=Integer.parseInt(phase.split("-")[1]);check(Integer.parseInt(t.js(web,"innerWidth"))==width,"exact CSS width "+width);}
    void route(String value)throws Exception{t.js(web,"D4Prototype.navigate("+JSONObject.quote(value)+");DemoMobileControls.nav(false)");SystemClock.sleep(220);}
    boolean opened()throws Exception{return "true".equals(t.js(web,"document.querySelector('.app-shell').classList.contains('nav-open')"));}
    void backClose()throws Exception{t.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);SystemClock.sleep(220);check(!opened(),"real system Back closes drawer");}
    double[] blank(int x)throws Exception{
        JSONArray a=new JSONArray(t.js(web,"(()=>{for(let y=90;y<=260;y+=10){let e=document.elementFromPoint("+x+",y);if(e?.closest('main')&&!e.closest('input,textarea,select,button,a,summary,.task-row,.table-wrap,[contenteditable]'))return ["+x+",y];}throw Error('No eligible in-exclusion start at x='+"+x+");})()"));return new double[]{a.getDouble(0),a.getDouble(1)};
    }
    void swipe(double x,double y,double dx,double dy,long duration)throws Exception{
        int[] location=new int[2];t.runOnMainSync(()->web.getLocationOnScreen(location));float scale=web.getWidth()/(float)Double.parseDouble(t.js(web,"innerWidth"));
        float sx=location[0]+(float)x*scale,sy=location[1]+(float)y*scale,ex=sx+(float)dx*scale,ey=sy+(float)dy*scale;
        // Observe trusted browser events without dispatching or changing the UI.
        t.js(web,"(()=>{window.__d408GestureEvents=[];if(!window.__d408GestureObserver){window.__d408GestureObserver=true;for(const type of ['touchstart','touchmove','touchend','touchcancel'])document.addEventListener(type,e=>{const p=e.touches[0]||e.changedTouches[0];window.__d408GestureEvents.push({type:e.type,timeStamp:e.timeStamp,trusted:e.isTrusted,x:p?.clientX,y:p?.clientY});},{capture:true,passive:true});}return true;})()");
        JSONArray events=new JSONArray();long down=SystemClock.uptimeMillis();inject(down,MotionEvent.ACTION_DOWN,sx,sy,events);int steps=duration<100?4:12;
        // Schedule against a single clock. Synchronous per-event waits previously
        // accumulated dispatch latency on top of every nominal 10 ms interval.
        for(int i=1;i<=steps;i++){long wait=down+duration*i/steps-SystemClock.uptimeMillis();if(wait>0)SystemClock.sleep(wait);inject(down,MotionEvent.ACTION_MOVE,sx+(ex-sx)*i/steps,sy+(ey-sy)*i/steps,events);}
        inject(down,MotionEvent.ACTION_UP,ex,ey,events);t.waitForIdleSync();SystemClock.sleep(220);
        JSONObject evidence=new JSONObject().put("phase",phase).put("startCssX",x).put("startCssY",y).put("dx",dx).put("dy",dy).put("requestedDurationMs",duration).put("actualInputDurationMs",events.getJSONObject(events.length()-1).getLong("eventTime")-down).put("events",events).put("trustedDomEvents",new JSONArray(t.js(web,"window.__d408GestureEvents")));
        D408IntegrationInstrumentation.write(new java.io.File(t.evidence,String.format(java.util.Locale.ROOT,"%s-gesture-%03d.json",phase,++gestureSequence)),evidence.toString(2));
    }
    void inject(long down,int action,float x,float y,JSONArray events)throws Exception{long at=SystemClock.uptimeMillis();MotionEvent event=MotionEvent.obtain(down,at,action,x,y,0);event.setSource(InputDevice.SOURCE_TOUCHSCREEN);boolean accepted;try{accepted=t.getUiAutomation().injectInputEvent(event,false);}finally{event.recycle();}events.put(new JSONObject().put("action",action).put("eventTime",at).put("dispatchReturnedAt",SystemClock.uptimeMillis()).put("x",x).put("y",y).put("accepted",accepted));check(accepted,"real device gesture event accepted");}
    JSONObject routes()throws Exception{
        ready();JSONArray rows=new JSONArray();for(String value:new String[]{"tasks","notes","pomodoro","feedback","analytics","dashboard","work-items","projects","templates","processes","contacts","archive","settings"}){
            route(value);double[] p=blank(32);String before=t.js(web,"JSON.stringify(D4Prototype.repo.state)");swipe(p[0],p[1],115,2,280);check(opened(),"real edge opens route "+value);check(JSONObject.quote(value).equals(t.js(web,"D4Prototype.getRoute()")),"navigation preserves route "+value);check(before.equals(t.js(web,"JSON.stringify(D4Prototype.repo.state)")),"navigation preserves tasks "+value);backClose();rows.put(new JSONObject().put("route",value).put("x",p[0]).put("y",p[1]).put("opened",true).put("backClosed",true));}
        t.shot(phase+"-routes");return new JSONObject().put("phase",phase).put("routes",rows);
    }
    JSONObject edges()throws Exception{
        ready();route("notes");JSONArray rows=new JSONArray();for(int x:new int[]{3,16,32,47}){double[] p=blank(x);swipe(p[0],p[1],80,2,450);check(opened(),"edge width "+x);backClose();rows.put(new JSONObject().put("x",x).put("slowOpen",true));}
        double[] p=blank(32);swipe(p[0],p[1],42,0,40);check(opened(),"short fast intent opens");backClose();
        double[][] attempts={{32,18,0,450},{32,8,100,260},{32,60,55,260},{100,100,0,260}};for(double[] a:attempts){p=blank((int)a[0]);swipe(p[0],p[1],a[1],a[2],(long)a[3]);check(!opened(),"reject ambiguous gesture "+new JSONArray(a).toString());}
        t.shot(phase+"-direction");return new JSONObject().put("edges",rows).put("shortFastOpened",true).put("rejected",new JSONArray(attempts));
    }
    double[] controlPoint(String selector)throws Exception{
        JSONArray a=new JSONArray(t.js(web,"(()=>{const e=document.querySelector("+JSONObject.quote(selector)+");e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return [r.left+Math.min(12,r.width/4),r.top+r.height/2];})()"));SystemClock.sleep(200);return new double[]{a.getDouble(0),a.getDouble(1)};
    }
    JSONObject editors()throws Exception{
        ready();route("tasks");t.webTap(web,"[data-action=task-new]");String task="[data-form=task-edit] [name=title]",text="D408_NAV_TASK_"+phase;t.webType(web,task,text);t.webTap(web,task);t.until("real task keyboard",5000,()->imeVisible());double[] p=controlPoint(task);swipe(p[0],p[1],100,1,350);check(!opened(),"task editor retains gesture");check(JSONObject.quote(text).equals(t.js(web,"document.querySelector('"+task+"').value")),"task input preserved");t.dismissKeyboard(web);t.shot(phase+"-task-input");
        ready();route("notes");t.webTap(web,"[data-action=personal-note-new]");String note="[data-form=personal-note] textarea",draft="D408_NAV_NOTE_"+phase;t.webType(web,note,draft);t.webTap(web,note);t.until("real note keyboard",5000,()->imeVisible());p=controlPoint(note);swipe(p[0],p[1],100,1,350);check(!opened(),"note editor retains gesture");check(JSONObject.quote(draft).equals(t.js(web,"document.querySelector('"+note+"').value")),"note draft preserved");t.dismissKeyboard(web);t.shot(phase+"-note-input");
        return new JSONObject().put("taskDraft",text).put("noteDraft",draft).put("keyboardObserved",true).put("opened",false);
    }
    boolean imeVisible(){boolean[] value={false};t.runOnMainSync(()->{WindowInsets insets=web.getRootWindowInsets();value[0]=insets!=null&&insets.isVisible(WindowInsets.Type.ime());});return value[0];}
    JSONObject horizontal()throws Exception{
        ready();route("notes");t.js(web,"(()=>{const h=document.createElement('div');h.dataset.d408Horizontal='true';h.style.cssText='position:fixed;left:0;top:150px;width:200px;height:100px;overflow-x:auto;touch-action:pan-x;z-index:30;background:white';const c=document.createElement('div');c.style.cssText='width:700px;height:80px;background:linear-gradient(to right,#eee,#247)';c.textContent='Synthetic horizontal scroll arbitration';h.append(c);document.body.append(h);h.scrollLeft=200;return true;})()");double before=Double.parseDouble(t.js(web,"document.querySelector('[data-d408-horizontal]').scrollLeft"));swipe(16,190,110,0,400);double after=Double.parseDouble(t.js(web,"document.querySelector('[data-d408-horizontal]').scrollLeft"));check(after<before,"real horizontal content scroll");check(!opened(),"horizontal owner retains gesture");t.shot(phase+"-horizontal-fixture");t.js(web,"document.querySelector('[data-d408-horizontal]').remove()");return new JSONObject().put("scope","explicit synthetic arbitration fixture with real MotionEvents").put("beforeScrollLeft",before).put("afterScrollLeft",after);
    }
    JSONObject selection()throws Exception{
        ready();route("work-items");t.webTap(web,"[data-action=work-new-work-item]");String form="[data-form=work-work-item]",title="D408_NAV_SELECTION_"+phase,notes="Selection retained in native note "+phase+" without editing read only text";t.webType(web,form+" [name=title]",title);t.webType(web,form+" [name=notes]",notes);t.webTap(web,form+" button[type=submit]");t.until("work note UI save",8000,()->"false".equals(t.js(web,"!!document.querySelector('[data-form=work-work-item]')")));String id=(String)new JSONTokener(t.js(web,"D4Prototype.repo.demo.workItems.find(w=>w.title==="+JSONObject.quote(title)+").id")).nextValue();t.webTap(web,"[data-action=work-work-detail][data-id='"+id+"']");
        double[] p=controlPoint(".work-note-content");int[] loc=new int[2];t.runOnMainSync(()->web.getLocationOnScreen(loc));float scale=web.getWidth()/(float)Double.parseDouble(t.js(web,"innerWidth"));float x=loc[0]+(float)p[0]*scale,y=loc[1]+(float)p[1]*scale;long down=SystemClock.uptimeMillis();MotionEvent e=MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,x,y,0);e.setSource(InputDevice.SOURCE_TOUCHSCREEN);t.sendPointerSync(e);e.recycle();SystemClock.sleep(950);e=MotionEvent.obtain(down,SystemClock.uptimeMillis(),MotionEvent.ACTION_UP,x,y,0);e.setSource(InputDevice.SOURCE_TOUCHSCREEN);t.sendPointerSync(e);e.recycle();
        t.until("actual native text selection",5000,()->Integer.parseInt(t.js(web,"String(getSelection()).length"))>0);check(!opened(),"native text selection does not open navigation");String selected=t.js(web,"String(getSelection())");t.shot(phase+"-work-note-selection");check(JSONObject.quote(notes).equals(t.js(web,"document.querySelector('.work-note-content').textContent")),"readonly note unchanged after real selection");t.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);SystemClock.sleep(250);check(!opened(),"normal system Back remains available");return new JSONObject().put("selectedText",new JSONTokener(selected).nextValue()).put("note",notes).put("systemBackInjected",true);
    }
    static void check(boolean value,String message){D408IntegrationInstrumentation.check(value,message);}
}
