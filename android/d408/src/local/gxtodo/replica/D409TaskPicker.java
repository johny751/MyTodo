package local.gxtodo.replica;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Bounded read-only presentation over the original search/resolve API. Selection is still a draft. */
final class D409TaskPicker {
    interface Selection { void selected(String id,String title); }
    private final Activity activity;
    private final String selectedId;
    private final Selection selection;
    private final Set<String> expanded=new HashSet<>();
    private final EditText search;
    private final TextView notice;
    private final LinearLayout list;
    private final ScrollView scroll;
    private final AlertDialog dialog;
    private volatile long generation;
    private volatile boolean open;
    private boolean working;
    private String latestQuery="";
    private JSONObject result;
    private Map<String,JSONObject> context=new LinkedHashMap<>();
    private final Set<String> unavailable=new HashSet<>();
    private static final int MAX_MATCHES=100,MAX_ANCESTORS=32,MAX_DEPTH=8;

    static void show(Activity activity,String selectedId,Selection selection){new D409TaskPicker(activity,selectedId,selection).show();}
    private D409TaskPicker(Activity activity,String selectedId,Selection selection){
        this.activity=activity;this.selectedId=selectedId;this.selection=selection;
        LinearLayout root=D409TimerViews.column(activity);root.setPadding(dp(16),dp(8),dp(16),dp(8));
        search=new EditText(activity);search.setId(40812);search.setSingleLine(true);search.setHint("搜索任务标题");search.setTextSize(16);search.setMinHeight(dp(52));search.setPadding(dp(12),dp(8),dp(12),dp(8));search.setBackground(D409TimerViews.surface(activity,Color.WHITE,D409TimerViews.LINE,12));root.addView(search,new LinearLayout.LayoutParams(-1,-2));
        notice=D409TimerViews.text(root,"正在读取隔离任务",12,D409TimerViews.MUTED);notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        scroll=new ScrollView(activity);scroll.setFillViewport(false);list=D409TimerViews.column(activity);scroll.addView(list);int height=Math.max(180,Math.min(380,(int)(activity.getResources().getDisplayMetrics().heightPixels/activity.getResources().getDisplayMetrics().density*.42)));root.addView(scroll,new LinearLayout.LayoutParams(-1,dp(height)));
        dialog=new AlertDialog.Builder(activity).setTitle("选择关联任务").setView(root).setNegativeButton("取消",null).create();
        search.addTextChangedListener(new TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){latestQuery=s.toString();generation++;request();}public void afterTextChanged(Editable value){}});
        dialog.setOnDismissListener(ignored->{open=false;generation++;});
        dialog.setOnShowListener(ignored->{open=true;generation++;request();dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setMinHeight(dp(48));});
    }
    private void show(){dialog.show();dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE|WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);}
    private int dp(float value){return D409TimerViews.dp(activity,value);}
    private boolean alive(long token){return open&&!activity.isDestroyed()&&token==generation;}
    private void request(){
        if(!open||working)return;working=true;final long token=generation;final String query=latestQuery;
        notice.setText("正在搜索任务…");
        try{D408Bridge.IO.execute(()->{
            try{
                JSONObject found=PomodoroTasks.search(activity,query,MAX_MATCHES);if(!alive(token))return;
                Map<String,JSONObject> initial=nodes(found.optJSONArray("tasks"));
                activity.runOnUiThread(()->{if(!alive(token))return;result=found;context=initial;unavailable.clear();render(false);});
                // Search matches are shown immediately. Ancestors remain bounded, read-only context.
                Map<String,JSONObject> enriched=new LinkedHashMap<>(initial);Set<String> missing=new HashSet<>();Set<String> attempted=new HashSet<>();int reads=0;JSONArray rows=found.optJSONArray("tasks");
                if(rows!=null)for(int i=0;i<Math.min(MAX_MATCHES,rows.length())&&alive(token);i++){
                    JSONObject row=rows.optJSONObject(i);if(row==null)continue;String parent=parent(row);Set<String> visited=new HashSet<>();visited.add(row.optString("id"));
                    for(int depth=0;!parent.isEmpty()&&depth<MAX_DEPTH&&alive(token);depth++){
                        if(!visited.add(parent)){missing.add(parent);break;}
                        JSONObject ancestor=enriched.get(parent);
                        if(ancestor==null){if(reads>=MAX_ANCESTORS||!attempted.add(parent)){missing.add(parent);break;}reads++;
                            try{ancestor=PomodoroTasks.resolve(activity,found.optString("accountId"),parent);}catch(Exception failure){ancestor=null;}
                            if(ancestor==null){missing.add(parent);break;}enriched.put(parent,ancestor);
                        }
                        parent=parent(ancestor);if(depth==MAX_DEPTH-1&&!parent.isEmpty())missing.add(parent);
                    }
                }
                activity.runOnUiThread(()->{if(!alive(token))return;context=enriched;unavailable.clear();unavailable.addAll(missing);refreshContext();});
            }catch(Exception failure){activity.runOnUiThread(()->{if(alive(token))notice.setText("读取失败，可重新输入重试："+failure.getMessage());});}
            finally{activity.runOnUiThread(()->{working=false;if(open&&token!=generation)request();});}
        });}catch(RuntimeException full){working=false;if(alive(token))notice.setText("读取队列忙，请稍后重新输入重试。");}
    }
    private static Map<String,JSONObject> nodes(JSONArray rows){Map<String,JSONObject> result=new LinkedHashMap<>();if(rows!=null)for(int i=0;i<Math.min(MAX_MATCHES,rows.length());i++){JSONObject row=rows.optJSONObject(i);if(row!=null&&!row.optString("id").isEmpty())result.put(row.optString("id"),row);}return result;}
    private static String parent(JSONObject row){return row==null||row.isNull("parentId")?"":row.optString("parentId","");}
    private void updateNotice(Map<String,JSONObject> matches){boolean searching=!latestQuery.trim().isEmpty(),more=result.optBoolean("hasMore");notice.setText(matches.isEmpty()?"没有匹配任务":matches.size()+" 项"+(more?" · 结果超过100条，请缩小搜索范围":"")+"\n"+(searching?"显示匹配任务与父级上下文":"箭头展开本次返回子项；标题选择关联")+"，保存计时设置后生效。"+(unavailable.isEmpty()?"":" 部分父级未返回或暂不可用。"));}
    private String contextLabel(JSONObject task,Map<String,JSONObject> matches){int children=0;String id=task.optString("id");for(JSONObject child:matches.values())if(id.equals(parent(child))&&child.optBoolean("done")==task.optBoolean("done"))children++;return trail(task)+(children==0?"":" · 本次返回 "+children+" 个子项")+(id.equals(selectedId)?" · 当前关联":"");}
    private void refreshContext(){
        // Enrichment updates only text; never replace a pressed/focused row or reset scroll.
        if(result==null)return;Map<String,JSONObject> matches=nodes(result.optJSONArray("tasks"));updateNotice(matches);
        for(JSONObject task:matches.values()){TextView trail=list.findViewWithTag("d409-task-context:"+task.optString("id"));if(trail!=null)trail.setText(contextLabel(task,matches));}
    }
    private void render(boolean preserveScroll){
        if(result==null)return;final int scrollY=preserveScroll?scroll.getScrollY():0;final long token=generation;list.removeAllViews();Map<String,JSONObject> matches=nodes(result.optJSONArray("tasks"));
        boolean searching=!latestQuery.trim().isEmpty();updateNotice(matches);
        if(matches.isEmpty()){D409TimerViews.text(list,"试试更短的标题关键词",15,D409TimerViews.MUTED);scroll.scrollTo(0,0);return;}
        Set<String> rendered=new HashSet<>();
        for(boolean done:new boolean[]{false,true}){
            boolean heading=false;
            for(JSONObject task:matches.values())if(task.optBoolean("done")==done){
                if(!heading){D409TimerViews.text(list,done?"已完成任务":"未完成任务",12,D409TimerViews.MUTED);heading=true;}
                JSONObject parent=matches.get(parent(task));
                if(searching||parent==null||parent.optBoolean("done")!=done)append(task,0,matches,rendered,searching,new HashSet<>());
            }
            // A malformed cycle has no root: show one bounded context row instead of hiding it.
            for(JSONObject task:matches.values())if(task.optBoolean("done")==done&&!rendered.contains(task.optString("id"))&&inCycle(task,matches))append(task,0,matches,rendered,searching,new HashSet<>());
        }
        scroll.post(()->{if(alive(token))scroll.scrollTo(0,scrollY);});
    }
    private boolean inCycle(JSONObject task,Map<String,JSONObject> matches){Set<String> visited=new HashSet<>();JSONObject at=task;for(int i=0;at!=null&&i<MAX_MATCHES;i++){if(!visited.add(at.optString("id")))return true;at=matches.get(parent(at));}return false;}
    private void append(JSONObject task,int depth,Map<String,JSONObject> matches,Set<String> rendered,boolean searching,Set<String> ancestors){
        String id=task.optString("id");if(depth>=MAX_MATCHES||!rendered.add(id)||!ancestors.add(id))return;
        List<JSONObject> children=new ArrayList<>();for(JSONObject child:matches.values())if(id.equals(parent(child))&&child.optBoolean("done")==task.optBoolean("done"))children.add(child);
        LinearLayout row=D409TimerViews.row(list);row.setPadding(dp(Math.min(depth,3)*14),dp(3),0,dp(3));row.setGravity(Gravity.TOP);
        if(!searching&&!children.isEmpty()){
            Button toggle=new Button(activity);toggle.setText(expanded.contains(id)?"⌄":"›");toggle.setTextSize(22);toggle.setAllCaps(false);toggle.setMinWidth(dp(48));toggle.setMinimumWidth(dp(48));toggle.setMinHeight(dp(52));toggle.setMinimumHeight(dp(52));toggle.setPadding(0,0,0,0);toggle.setBackgroundColor(Color.TRANSPARENT);toggle.setTextColor(D409TimerViews.MUTED);toggle.setTag("d409-task-toggle:"+id);toggle.setContentDescription((expanded.contains(id)?"折叠":"展开")+task.optString("title"));row.addView(toggle,new LinearLayout.LayoutParams(dp(48),dp(52)));toggle.setOnClickListener(v->{if(!expanded.add(id))expanded.remove(id);render(true);});
        }else{View gap=new View(activity);row.addView(gap,new LinearLayout.LayoutParams(dp(searching?0:48),dp(48)));}
        LinearLayout select=D409TimerViews.column(activity);select.setTag("d409-task-select:"+id);select.setClickable(true);select.setFocusable(true);select.setMinimumHeight(dp(64));select.setPadding(dp(8),dp(6),dp(8),dp(8));select.setBackground(D409TimerViews.surface(activity,id.equals(selectedId)?D409TimerViews.SELECTED:Color.WHITE,0,8));row.addView(select,new LinearLayout.LayoutParams(0,-2,1));
        // Keep the exact original title in its own TextView for accessibility and frozen F01.
        D409TimerViews.text(select,(task.optBoolean("done")?"已完成 · ":"")+task.optString("title"),15,D409TimerViews.INK);
        TextView trail=D409TimerViews.text(select,contextLabel(task,matches),11,D409TimerViews.MUTED);trail.setTag("d409-task-context:"+id);
        select.setOnClickListener(v->{selection.selected(id,task.optString("title"));dialog.dismiss();});
        if(!searching&&expanded.contains(id))for(JSONObject child:children)append(child,depth+1,matches,rendered,false,new HashSet<>(ancestors));
    }
    private String trail(JSONObject task){
        String parent=parent(task);if(parent.isEmpty())return "根任务";List<String> names=new ArrayList<>();Set<String> seen=new HashSet<>();seen.add(task.optString("id"));
        for(int depth=0;!parent.isEmpty()&&depth<MAX_DEPTH;depth++){
            if(!seen.add(parent)){names.add(0,"父级关系循环");parent="";break;}JSONObject ancestor=context.get(parent);
            if(ancestor==null){names.add(0,"父级未返回");parent="";break;}names.add(0,ancestor.optString("title",parent));parent=parent(ancestor);
        }
        if(!parent.isEmpty())names.add(0,"更上级暂未展开");return String.join(" › ",names);
    }
}
