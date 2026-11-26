package local.gxtodo.replica;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import local.gxtodo.d403preview.BuildInfo;
import local.gxtodo.d403preview.NativeTimerStore;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Complete native presentation over the existing isolated durable session; never creates PomodoroTimer. */
public final class D408TimerActivity extends Activity {
    private final Handler main = new Handler(Looper.getMainLooper());
    private JSONObject state;
    private boolean resumed, reading, writing, dirty, binding, taskLoading;
    private String draftMode="countdown", draftTask="", pendingRequest="", taskTitle="", lastTitleId="";
    private TextView clock, status, task, summary, error;
    private EditText focusMinutes, breakMinutes;
    private Button mode, retry;
    private final List<Button> mutationControls=new ArrayList<>();
    private long taskReadGeneration;
    private final Runnable poll=new Runnable(){@Override public void run(){if(resumed){refresh();main.postDelayed(this,1000);}}};

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        if(!"local.gxtodo.d408candidate".equals(getPackageName()))throw new SecurityException("Isolated D408 identity required");
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(Color.rgb(245,248,246));
        LinearLayout root=column();root.setPadding(dp(20),dp(24),dp(20),dp(24));scroll.addView(root);
        text(root,"MYTODO · 专注",13,Color.rgb(68,105,87));text(root,"番茄钟",30,Color.rgb(26,50,39));
        text(root,"把注意力留给当前这一件事",15,Color.rgb(91,110,100));
        LinearLayout session=card(root);
        clock=text(session,"25:00",52,Color.rgb(32,97,65));clock.setId(40301);clock.setContentDescription("当前计时时间");
        status=text(session,"正在恢复计时状态",16,Color.rgb(50,72,61));status.setId(40801);
        task=text(session,"未关联任务",16,Color.rgb(50,72,61));task.setId(40802);
        button(session,40302,"开始专注",()->send("start",new JSONObject(),false),true);
        LinearLayout actions=row(session);
        button(actions,40304,"暂停",()->send("pause",new JSONObject(),false),true);
        button(actions,40305,"继续",()->send("resume",new JSONObject(),false),true);
        button(session,40307,"提前结束（保留耗时）",()->confirm("提前结束当前计时？","已投入的时间和关联任务会保留在历史中。",()->send("end",new JSONObject(),false)),true);
        button(session,40308,"完成正计时",()->send("finish",new JSONObject(),false),true);
        button(session,40309,"开始休息",()->send("break",new JSONObject(),false),true);
        button(session,40306,"重置计时",()->confirm("重置当前计时？","活动会话会作为提前结束记录保存，已结束历史不会删除。",()->send("reset",new JSONObject(),false)),true);
        error=text(root,"",14,Color.rgb(156,54,43));error.setId(40803);error.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        retry=button(root,40804,"重试未确认操作",this::retryPending,false);retry.setVisibility(View.GONE);
        button(root,40805,"刷新状态",()->{pendingRequest="";retry.setVisibility(View.GONE);refresh();},false);

        LinearLayout config=card(root);text(config,"计时设置",21,Color.rgb(26,50,39));
        mode=button(config,40311,"专注模式：倒计时",()->{draftMode="countup".equals(draftMode)?"countdown":"countup";dirty=true;showDraft();},true);
        text(config,"专注分钟（1–180）",14,Color.DKGRAY);focusMinutes=number(config,40312);
        text(config,"休息分钟（1–180）",14,Color.DKGRAY);breakMinutes=number(config,40313);
        TextWatcher watcher=new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){if(!binding)dirty=true;}public void afterTextChanged(Editable value){}};
        focusMinutes.addTextChangedListener(watcher);breakMinutes.addTextChangedListener(watcher);
        button(config,40810,"选择关联任务",this::chooseTask,true);
        button(config,40811,"清除关联任务",()->{draftTask="";taskTitle="";dirty=true;showTask();},true);
        button(config,40310,"保存计时设置",this::saveConfiguration,true);
        text(config,"任务选择来自本候选的隔离任务仓库。保存设置会更新当前会话关联；正在计时时不能切换正计时/倒计时模式，已结束历史保持原关联。",13,Color.GRAY);

        LinearLayout history=card(root);text(history,"记录与统计",21,Color.rgb(26,50,39));
        summary=text(history,"正在读取今日统计",16,Color.DKGRAY);summary.setId(40820);
        button(history,40821,"全部计时记录",this::showHistory,false);
        button(history,40822,"专注统计",this::showStatistics,false);
        text(history,"时间按北京时间显示。每日完成轮次沿用原版口径，仅计正常结束的专注倒计时；休息单独记录。",13,Color.GRAY);
        LinearLayout help=card(root);text(help,"后台与恢复",19,Color.rgb(26,50,39));
        text(help,"返回任务或关闭此页面不会暂停。通知可暂停/继续；进程重建和设备重启后读取同一份计时状态。系统强行停止应用后，请重新打开应用恢复提醒。通知和准时提醒受系统授权约束。",14,Color.DKGRAY);
        button(help,40830,"通知与准时提醒设置",()->{startActivity(new android.content.Intent(this,D408Activity.class).putExtra("nativeRoute","settings").addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP|android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP));finish();},false);
        button(root,40315,"返回工作空间",this::finish,false);
        button(root,40831,"版本信息与历史",this::showVersion,false);
        setContentView(scroll);
        if(saved!=null){dirty=saved.getBoolean("dirty");draftMode=saved.getString("mode","countdown");draftTask=saved.getString("task","");taskTitle=saved.getString("taskTitle","");pendingRequest=saved.getString("pending","");binding=true;focusMinutes.setText(saved.getString("focus","25"));breakMinutes.setText(saved.getString("break","5"));binding=false;showDraft();showTask();retry.setVisibility(pendingRequest.isEmpty()?View.GONE:View.VISIBLE);}
        controls();
    }
    @Override protected void onResume(){super.onResume();resumed=true;main.post(poll);AndroidCompanionService.refresh(this);}
    @Override protected void onPause(){resumed=false;main.removeCallbacks(poll);super.onPause();}
    @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);out.putBoolean("dirty",dirty);out.putString("mode",draftMode);out.putString("task",draftTask);out.putString("taskTitle",taskTitle);out.putString("focus",focusMinutes.getText().toString());out.putString("break",breakMinutes.getText().toString());out.putString("pending",pendingRequest);}
    private void refresh(){
        if(reading||writing)return;reading=true;controls();
        NativeTimerStore.request(this,"{\"op\":\"snapshot\"}",(value,failure)->runOnUiThread(()->{if(isDestroyed())return;reading=false;if(failure!=null){error.setText("计时状态未确认，已保留原数据："+failure);controls();return;}accept(value);controls();}));
    }
    private void accept(JSONObject next){
        if(state!=null&&next.optLong("revision")<state.optLong("revision")){error.setText("读到较旧状态，请刷新后再操作。");return;}
        state=next;String phase="break".equals(next.optString("phase"))?"休息":"专注";
        clock.setText(clockText(next.optLong("countup".equals(next.optString("mode"))?"elapsedMillis":"remainingMillis")));
        status.setText(phase+" · "+("countup".equals(next.optString("mode"))?"正计时":"倒计时")+" · "+statusLabel(next.optString("status")));
        JSONArray rows=next.optJSONArray("history");summary.setText(String.format(Locale.ROOT,"今日专注 %.1f 分钟 · 完成 %d 轮\n已记录 %d 次计时",next.optLong("focusedMillisToday")/60000d,next.optInt("completedSessionsToday"),rows==null?0:rows.length()));
        if(!dirty){binding=true;draftMode=next.optString("focusMode","countdown");draftTask=next.optString("taskId","");focusMinutes.setText(String.valueOf(next.optInt("durationMinutes",25)));breakMinutes.setText(String.valueOf(next.optInt("breakMinutes",5)));binding=false;showDraft();}
        showTask();resolveTaskTitle();
    }
    private void showDraft(){mode.setText("专注模式："+("countup".equals(draftMode)?"正计时":"倒计时"));}
    private void showTask(){task.setText(draftTask.isEmpty()?"未关联任务":(dirty?"待保存关联：":"关联任务：")+(taskTitle.isEmpty()?draftTask:taskTitle));}
    private void resolveTaskTitle(){
        String id=draftTask;if(id.isEmpty()||id.equals(lastTitleId)||taskLoading)return;taskLoading=true;lastTitleId=id;
        try{D408Bridge.IO.execute(()->{String title;try{AccountStore accounts=AccountStore.get(this);JSONObject found=PomodoroTasks.resolve(this,accounts.active(),id);title=found==null?"关联任务已删除（历史保留）":found.optString("title",id);}catch(Exception failure){title="任务名称暂不可用 · "+id;}String text=title;runOnUiThread(()->{taskLoading=false;if(!isDestroyed()&&id.equals(draftTask)){taskTitle=text;showTask();}});});}catch(RuntimeException busy){taskLoading=false;lastTitleId="";}
    }
    private void send(String action,JSONObject values,boolean clearDraft){
        if(state==null||writing||!pendingRequest.isEmpty())return;
        try{pendingRequest=new JSONObject().put("op","command").put("action",action).put("values",values).put("commandId","d408-ui:"+UUID.randomUUID()).put("expectedRevision",state.getLong("revision")).toString();executePending(clearDraft);}catch(Exception failure){error.setText("操作未发送："+failure.getMessage());}
    }
    private void retryPending(){if(!pendingRequest.isEmpty()&&!writing)executePending(false);}
    private void executePending(boolean clearDraft){
        writing=true;controls();String request=pendingRequest;
        NativeTimerStore.request(this,request,(value,failure)->runOnUiThread(()->{if(isDestroyed())return;writing=false;if(failure!=null){error.setText("操作未确认："+failure+"\n可用同一请求重试；刷新状态可放弃重试并查看已保存结果。");retry.setVisibility(View.VISIBLE);controls();return;}pendingRequest="";retry.setVisibility(View.GONE);error.setText("");if(clearDraft||request.contains("\"action\":\"configure\""))dirty=false;accept(value);controls();}));
    }
    private void saveConfiguration(){
        try{int focus=Integer.parseInt(focusMinutes.getText().toString()),rest=Integer.parseInt(breakMinutes.getText().toString());if(focus<1||focus>180||rest<1||rest>180)throw new IllegalArgumentException();
            JSONObject values=new JSONObject().put("mode",draftMode).put("durationMinutes",focus).put("breakMinutes",rest).put("taskId",draftTask);
            if(draftTask.isEmpty()){send("configure",values,true);return;}
            String selected=draftTask,selectedMode=draftMode,selectedFocus=focusMinutes.getText().toString(),selectedBreak=breakMinutes.getText().toString();
            D408Bridge.IO.execute(()->{try{AccountStore accounts=AccountStore.get(this);JSONObject found=PomodoroTasks.resolve(this,accounts.active(),selected);runOnUiThread(()->{if(isDestroyed())return;if(found==null){error.setText("关联任务已不存在，请重新选择或清除关联。");return;}
                if(!selected.equals(draftTask)||!selectedMode.equals(draftMode)||!selectedFocus.equals(focusMinutes.getText().toString())||!selectedBreak.equals(breakMinutes.getText().toString())){error.setText("校验期间设置已修改，请再次保存当前设置。");return;}
                send("configure",values,true);});}catch(Exception failure){runOnUiThread(()->error.setText("任务校验未完成，设置未保存："+failure.getMessage()));}});
        }catch(Exception invalid){error.setText("设置未保存：专注和休息分钟均需为 1–180 的整数。");}
    }
    private void controls(){boolean ready=state!=null&&!writing&&pendingRequest.isEmpty();for(Button b:mutationControls)b.setEnabled(ready);focusMinutes.setEnabled(ready);breakMinutes.setEnabled(ready);retry.setEnabled(!writing);if(!ready)return;String phase=state.optString("status");boolean active=phase.equals("running")||phase.equals("paused");mode.setEnabled(!active);findViewById(40302).setEnabled(!active);findViewById(40304).setEnabled(phase.equals("running"));findViewById(40305).setEnabled(phase.equals("paused"));findViewById(40307).setEnabled(active);findViewById(40308).setEnabled(active&&"countup".equals(state.optString("mode")));findViewById(40309).setEnabled(!active);}

    private void chooseTask(){
        LinearLayout root=column();root.setPadding(dp(20),dp(8),dp(20),dp(8));EditText search=new EditText(this);search.setSingleLine(true);search.setHint("搜索任务标题");search.setId(40812);root.addView(search);
        TextView notice=text(root,"正在读取隔离任务",14,Color.GRAY);ScrollView scroll=new ScrollView(this);LinearLayout list=column();scroll.addView(list);root.addView(scroll,new LinearLayout.LayoutParams(-1,dp(340)));
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("选择关联任务").setView(root).setNegativeButton("取消",null).create();
        Runnable query=()->{
            final long generation=++taskReadGeneration;String value=search.getText().toString();
            try{D408Bridge.IO.execute(()->{try{JSONObject found=PomodoroTasks.search(this,value,100);runOnUiThread(()->{if(isDestroyed()||!dialog.isShowing()||generation!=taskReadGeneration)return;list.removeAllViews();JSONArray rows=found.optJSONArray("tasks");notice.setText(rows==null||rows.length()==0?"没有匹配任务":found.optBoolean("hasMore")?"结果超过100条，请缩小搜索范围":"点击关联任务；保存计时设置后生效");if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject t=rows.optJSONObject(i);if(t==null)continue;button(list,View.NO_ID,(t.optBoolean("done")?"已完成 · ":"")+t.optString("title"),()->{draftTask=t.optString("id");taskTitle=t.optString("title");lastTitleId=draftTask;dirty=true;showTask();dialog.dismiss();},false);}});}catch(Exception failure){runOnUiThread(()->notice.setText("读取失败，可重新输入重试："+failure.getMessage()));}});}catch(RuntimeException full){notice.setText("读取队列忙，请稍后重试。");}
        };
        search.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int a,int c,int f){}public void onTextChanged(CharSequence s,int a,int b,int c){query.run();}public void afterTextChanged(Editable e){}});
        dialog.setOnShowListener(d->query.run());dialog.setOnDismissListener(d->taskReadGeneration++);dialog.show();
    }
    private void showHistory(){
        if(state==null){refresh();return;}JSONArray rows=state.optJSONArray("history");LinearLayout root=column();root.setPadding(dp(18),dp(12),dp(18),dp(12));
        text(root,"全部计时记录 · 北京时间",21,Color.rgb(26,50,39));text(root,"记录按结束时间从新到旧。任务标识保留；已删除任务不删除其计时历史。",13,Color.GRAY);
        ScrollView scroll=new ScrollView(this);scroll.addView(root);AlertDialog dialog=new AlertDialog.Builder(this).setView(scroll).setPositiveButton("关闭",null).create();
        if(rows==null||rows.length()==0)text(root,"还没有已结束记录。",16,Color.GRAY);
        else{final int[] shown={0};Button more=new Button(this);more.setText("加载更多记录");Runnable append=new Runnable(){public void run(){root.removeView(more);int end=Math.min(rows.length(),shown[0]+50);for(;shown[0]<end;shown[0]++){JSONObject r=rows.optJSONObject(shown[0]);if(r==null)continue;LinearLayout card=card(root);text(card,("break".equals(r.optString("phase"))?"休息":"专注")+" · "+("completed".equals(r.optString("outcome"))?"已完成":"提前结束"),17,Color.rgb(26,50,39));TextView detail=text(card,formatTime(r.optString("startedAt"))+" → "+formatTime(r.optString("finishedAt"))+"\n"+("countup".equals(r.optString("mode"))?"正计时":"倒计时")+" · "+clockText(r.optLong("elapsedMillis"))+"\n任务："+(r.optString("taskId").isEmpty()?"未关联":r.optString("taskId"))+"\n会话："+r.optString("id"),14,Color.DKGRAY);detail.setTextIsSelectable(true);}if(shown[0]<rows.length()){more.setText("加载更多记录（"+shown[0]+" / "+rows.length()+"）");root.addView(more);}else text(root,"已显示全部 "+rows.length()+" 条记录",14,Color.GRAY);}};more.setOnClickListener(v->append.run());append.run();}
        dialog.show();dialog.getWindow().setLayout(-1,(int)(getResources().getDisplayMetrics().heightPixels*.86));
    }
    private void showStatistics(){
        if(state==null){refresh();return;}LinearLayout root=column();root.setPadding(dp(20),dp(16),dp(20),dp(16));text(root,"专注统计 · 北京时间",21,Color.rgb(26,50,39));
        text(root,"每日统计保留今天及前31天。提前结束保留已投入时间；休息不计入专注，完成轮次仅计倒计时。完整逐次记录仍可在计时历史查看。",14,Color.GRAY);
        JSONObject focused=state.optJSONObject("focusedMillisByDay"),completed=state.optJSONObject("completedSessionsByDay");List<String> days=new ArrayList<>();if(focused!=null)for(Iterator<String> it=focused.keys();it.hasNext();)days.add(it.next());if(completed!=null)for(Iterator<String> it=completed.keys();it.hasNext();){String d=it.next();if(!days.contains(d))days.add(d);}days.sort(Collections.reverseOrder());
        long total=0;int sessions=0;for(String day:days){long millis=focused==null?0:focused.optLong(day);int count=completed==null?0:completed.optInt(day);total+=millis;sessions+=count;text(root,LocalDate.ofEpochDay(Long.parseLong(day))+" · "+String.format(Locale.ROOT,"%.1f",millis/60000d)+" 分钟 · "+count+" 轮",16,Color.DKGRAY);}
        if(days.isEmpty())text(root,"还没有专注统计。",16,Color.GRAY);text(root,String.format(Locale.ROOT,"记录期合计 %.1f 分钟 · %d 轮",total/60000d,sessions),18,Color.rgb(32,97,65));ScrollView scroll=new ScrollView(this);scroll.addView(root);new AlertDialog.Builder(this).setView(scroll).setPositiveButton("关闭",null).show();
    }
    private void showVersion(){String info=BuildInfo.VERSION_NAME+" / versionCode "+BuildInfo.VERSION_CODE+"\nby codex · "+BuildInfo.SOURCE_SHA.substring(0,5)+"\nAPK 编译时间："+BuildInfo.BUILD_TIME_UTC+" (UTC)\n独立合成候选；临时 CI 签名";new AlertDialog.Builder(this).setTitle("版本信息").setMessage(info).setPositiveButton("版本历史",(d,w)->{TextView text=new TextView(this);text.setPadding(dp(20),dp(20),dp(20),dp(20));text.setText(BuildInfo.HISTORY_TEXT);text.setTextIsSelectable(true);ScrollView scroll=new ScrollView(this);scroll.addView(text);new AlertDialog.Builder(this).setTitle("版本历史").setView(scroll).setPositiveButton("关闭",null).show();}).setNeutralButton("复制版本信息",(d,w)->{((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("版本信息",info));Toast.makeText(this,"已复制",Toast.LENGTH_SHORT).show();}).setNegativeButton("关闭",null).show();}
    private void confirm(String title,String message,Runnable yes){new AlertDialog.Builder(this).setTitle(title).setMessage(message).setPositiveButton("确认",(d,w)->yes.run()).setNegativeButton("取消",null).show();}
    private static String statusLabel(String status){switch(status){case "running":return "计时中";case "paused":return "已暂停";case "completed":return "本轮已完成";case "ended":return "提前结束";default:return "待开始";}}
    private static String clockText(long millis){long seconds=Math.max(0,millis)/1000;return String.format(Locale.ROOT,"%02d:%02d",seconds/60,seconds%60);}
    private static String formatTime(String value){try{return DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.of("Asia/Shanghai")).format(Instant.parse(value));}catch(Exception invalid){return value;}}
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private LinearLayout column(){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private LinearLayout row(LinearLayout parent){LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.HORIZONTAL);parent.addView(l);return l;}
    private LinearLayout card(LinearLayout parent){LinearLayout l=column();l.setPadding(dp(16),dp(16),dp(16),dp(16));l.setBackgroundColor(Color.WHITE);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.topMargin=dp(16);parent.addView(l,p);return l;}
    private TextView text(LinearLayout parent,String value,int size,int color){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setPadding(0,dp(4),0,dp(8));parent.addView(t,new LinearLayout.LayoutParams(-1,-2));return t;}
    private Button button(LinearLayout parent,int id,String label,Runnable action,boolean mutation){Button b=new Button(this);b.setId(id);b.setText(label);b.setAllCaps(false);b.setOnClickListener(v->action.run());parent.addView(b,new LinearLayout.LayoutParams(parent.getOrientation()==LinearLayout.HORIZONTAL?0:-1,-2,parent.getOrientation()==LinearLayout.HORIZONTAL?1:0));if(mutation)mutationControls.add(b);return b;}
    private EditText number(LinearLayout parent,int id){EditText e=new EditText(this);e.setId(id);e.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);e.setSingleLine(true);parent.addView(e,new LinearLayout.LayoutParams(-1,-2));return e;}
}
