package local.gxtodo.replica;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;

/** Presentation only: no clock, commands, storage, services, or scheduled completion. */
final class D409TimerViews {
    static final int INK=Color.rgb(32,52,65), MUTED=Color.rgb(96,116,129), CANVAS=Color.rgb(242,246,248);
    static final int ACCENT=Color.rgb(23,107,135), FOCUS=Color.rgb(22,119,109), LINE=Color.rgb(216,226,232), SELECTED=Color.rgb(228,241,245), DANGER=Color.rgb(182,67,67);
    static int dp(Context c,float value){return Math.round(value*c.getResources().getDisplayMetrics().density);}
    static GradientDrawable surface(Context c,int color,int stroke,float radius){GradientDrawable shape=new GradientDrawable();shape.setColor(color);shape.setCornerRadius(dp(c,radius));if(stroke!=0)shape.setStroke(dp(c,1),stroke);return shape;}
    static LinearLayout column(Context c){LinearLayout view=new LinearLayout(c);view.setOrientation(LinearLayout.VERTICAL);return view;}
    static LinearLayout row(LinearLayout parent){LinearLayout view=new LinearLayout(parent.getContext());view.setOrientation(LinearLayout.HORIZONTAL);view.setGravity(Gravity.CENTER_VERTICAL);parent.addView(view,new LinearLayout.LayoutParams(-1,-2));return view;}
    static LinearLayout card(LinearLayout parent){Context c=parent.getContext();LinearLayout view=column(c);view.setPadding(dp(c,16),dp(c,16),dp(c,16),dp(c,16));view.setBackground(surface(c,Color.WHITE,LINE,14));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(c,16);parent.addView(view,lp);return view;}
    static TextView text(LinearLayout parent,String value,int size,int color){Context c=parent.getContext();TextView view=new TextView(c);view.setText(value);view.setTextSize(size);view.setTextColor(color);view.setLineSpacing(dp(c,3),1f);view.setPadding(0,dp(c,4),0,dp(c,5));if(size>=18)view.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));parent.addView(view,new LinearLayout.LayoutParams(-1,-2));return view;}
    static Button button(LinearLayout parent,int id,String title,Runnable action){Context c=parent.getContext();Button view=new Button(c);view.setId(id);view.setText(title);view.setAllCaps(false);view.setTextSize(14);view.setMinWidth(dp(c,48));view.setMinimumWidth(dp(c,48));view.setMinHeight(dp(c,48));view.setMinimumHeight(dp(c,48));view.setPadding(dp(c,12),dp(c,12),dp(c,12),dp(c,12));view.setOnClickListener(v->action.run());LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(parent.getOrientation()==LinearLayout.HORIZONTAL?0:-1,-2,parent.getOrientation()==LinearLayout.HORIZONTAL?1:0);lp.topMargin=dp(c,8);if(parent.getOrientation()==LinearLayout.HORIZONTAL){lp.leftMargin=dp(c,3);lp.rightMargin=dp(c,3);lp.bottomMargin=lp.topMargin;}parent.addView(view,lp);styleButton(view,false,false);return view;}
    static void styleButton(Button button,boolean primary,boolean danger){Context c=button.getContext();int ink=primary?Color.WHITE:danger?DANGER:INK;button.setTextColor(new ColorStateList(new int[][]{new int[]{-android.R.attr.state_enabled},new int[]{}},new int[]{MUTED,ink}));button.setBackground(surface(c,primary?FOCUS:Color.WHITE,primary?0:danger?DANGER:LINE,12));button.setAlpha(button.isEnabled()?1f:.5f);}
    static EditText number(LinearLayout parent,int id){Context c=parent.getContext();EditText view=new EditText(c);view.setId(id);view.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);view.setSingleLine(true);view.setTextSize(18);view.setTextColor(INK);view.setPadding(dp(c,12),dp(c,10),dp(c,12),dp(c,10));view.setMinHeight(dp(c,52));view.setBackground(surface(c,Color.WHITE,LINE,10));parent.addView(view,new LinearLayout.LayoutParams(-1,-2));return view;}
    static void install(Activity activity,View child){
        activity.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        activity.getWindow().setStatusBarColor(Color.WHITE);activity.getWindow().setNavigationBarColor(Color.WHITE);
        activity.getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if(Build.VERSION.SDK_INT<35){activity.setContentView(child);return;}
        activity.getWindow().setDecorFitsSystemWindows(false);
        FrameLayout frame=new FrameLayout(activity);frame.setBackgroundColor(CANVAS);frame.addView(child,new FrameLayout.LayoutParams(-1,-1));
        frame.setOnApplyWindowInsetsListener((view,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()),ime=insets.getInsets(WindowInsets.Type.ime()),mandatory=insets.getInsets(WindowInsets.Type.mandatorySystemGestures());int bottom=Math.max(Math.max(bars.bottom,ime.bottom),mandatory.bottom);if(view.getPaddingLeft()!=bars.left||view.getPaddingTop()!=bars.top||view.getPaddingRight()!=bars.right||view.getPaddingBottom()!=bottom)view.setPadding(bars.left,bars.top,bars.right,bottom);return WindowInsets.CONSUMED;});
        activity.setContentView(frame);frame.requestApplyInsets();
    }
    static final class ProgressRing extends View {
        final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);double fraction;boolean countup;int color=FOCUS;
        ProgressRing(Context context){super(context);setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);}
        void snapshot(JSONObject state){countup="countup".equals(state.optString("mode"));long elapsed=Math.max(0,state.optLong("elapsedMillis")),remaining=Math.max(0,state.optLong("remainingMillis"));long total=elapsed+remaining;fraction=countup?0:total>0?Math.max(0,Math.min(1,elapsed/(double)total)):"completed".equals(state.optString("status"))?1:0;color="break".equals(state.optString("phase"))?ACCENT:FOCUS;invalidate();}
        @Override protected void onDraw(Canvas canvas){super.onDraw(canvas);float stroke=dp(getContext(),9),padding=stroke/2+dp(getContext(),3);RectF ring=new RectF(padding,padding,getWidth()-padding,getHeight()-padding);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(stroke);paint.setStrokeCap(Paint.Cap.ROUND);paint.setColor(LINE);canvas.drawOval(ring,paint);paint.setColor(color);if(countup){paint.setStrokeWidth(dp(getContext(),3));canvas.drawOval(ring,paint);}else if(fraction>0)canvas.drawArc(ring,-90,(float)(360*fraction),false,paint);}
    }
}
