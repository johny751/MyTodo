package local.gxtodo.replica;

import android.app.AppOpsManager;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Owns the two overlay windows; all window and lifecycle work runs on the main thread. */
public final class FloatingBallController {
    private static final String[] MENU_ORDER = {"add", "today", "done", "timer", "notes", "search", "settings", "hide"};
    private static final Set<String> DEFAULT_MENU = new HashSet<>(Arrays.asList("add", "today", "done", "timer", "notes", "settings", "hide"));
    private final Service service;
    private final SharedPreferences preferences;
    private final WindowManager windows;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final PowerManager power;
    private final AppOpsManager appOps;
    private final ForegroundTracker foreground = new ForegroundTracker();
    private final Rect safeBounds = new Rect();
    private final int touchSlop;
    private Set<String> hiddenApps = new HashSet<>(), menuActions = new HashSet<>(DEFAULT_MENU);
    private BallView ball;
    private FrameLayout menu;
    private WindowManager.LayoutParams ballParams;
    private volatile boolean shown;
    private boolean destroyed, enabled, contracted = true, leftSide, receiverRegistered, watchingOps;
    private boolean polling, usageAllowed, screenInteractive;
    private boolean edgeDot = true;
    private float yRatio;
    private long lastUsageQuery;
    private final Runnable idleCollapse = () -> { if (!destroyed && edgeDot && menu == null && ball != null) dock(true); };
    private final Runnable pollForeground = new Runnable() {
        @Override public void run() {
            polling = false;
            if (destroyed || !enabled || !interactive() || hiddenApps.isEmpty()) return;
            if (!Settings.canDrawOverlays(service)) { removeWindows(); return; }
            boolean allowed = hasUsageAccess();
            if (allowed != usageAllowed) { usageAllowed = allowed; foreground.reset(); lastUsageQuery = 0; }
            if (!allowed) { reconcile(); return; }
            sampleForeground();
            reconcile();
            scheduleForeground();
        }
    };
    private final BroadcastReceiver lifecycleReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) {
                screenInteractive = false;
                stopPolling();
                main.removeCallbacks(idleCollapse);
                removeWindows();
            } else {
                screenInteractive = interactive();
                if (Intent.ACTION_CONFIGURATION_CHANGED.equals(intent.getAction())) {
                    refreshBounds();
                    if (menu != null) closeMenu(false);
                    if (ball != null) dock(contracted);
                }
                if (screenInteractive) { lastUsageQuery = 0; foreground.reset(); }
                sync();
            }
        }
    };
    private final AppOpsManager.OnOpChangedListener opListener = (op, packageName) -> main.post(() -> {
        if (!destroyed) sync();
    });

    public FloatingBallController(Service service) {
        this.service = service;
        preferences = service.getSharedPreferences("android-tools", Context.MODE_PRIVATE);
        windows = (WindowManager) service.getSystemService(Context.WINDOW_SERVICE);
        power = (PowerManager) service.getSystemService(Context.POWER_SERVICE);
        appOps = (AppOpsManager) service.getSystemService(Context.APP_OPS_SERVICE);
        touchSlop = ViewConfiguration.get(service).getScaledTouchSlop();
        leftSide = "left".equals(preferences.getString("ballSide", "right"));
        yRatio = clamp(preferences.getFloat("ballYRatio", .55f), 0f, 1f);
        screenInteractive = interactive();
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        filter.addAction(Intent.ACTION_CONFIGURATION_CHANGED);
        try {
            if (Build.VERSION.SDK_INT >= 33) service.registerReceiver(lifecycleReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            else service.registerReceiver(lifecycleReceiver, filter);
            receiverRegistered = true;
        } catch (RuntimeException ignored) { }
        if (appOps != null) try {
            appOps.startWatchingMode(AppOpsManager.OPSTR_SYSTEM_ALERT_WINDOW, service.getPackageName(), opListener);
            watchingOps = true;
            appOps.startWatchingMode(AppOpsManager.OPSTR_GET_USAGE_STATS, service.getPackageName(), opListener);
            watchingOps = true;
        } catch (RuntimeException ignored) { }
    }

    /** Apply the current settings. Missing usage access keeps exclusions inactive and visible in settings. */
    public void sync() {
        if (Looper.myLooper() != Looper.getMainLooper()) { main.post(this::sync); return; }
        if (destroyed) return;
        enabled = preferences.getBoolean("ballEnabled", false);
        boolean nextEdgeDot = preferences.getBoolean("edgeDot", true);
        boolean edgeDotChanged = nextEdgeDot != edgeDot;
        edgeDot = nextEdgeDot;
        if (edgeDotChanged && menu != null) closeMenu(false);
        Set<String> savedHidden = preferences.getStringSet("hiddenApps", new HashSet<>());
        Set<String> nextHidden = new HashSet<>(savedHidden == null ? new HashSet<>() : savedHidden);
        Set<String> savedMenu = preferences.getStringSet("ballMenu", DEFAULT_MENU);
        Set<String> nextMenu = new HashSet<>(savedMenu == null ? DEFAULT_MENU : savedMenu);
        nextMenu.retainAll(Arrays.asList(MENU_ORDER));
        if (!nextMenu.equals(menuActions) && menu != null) closeMenu(false);
        menuActions = nextMenu;
        boolean access = hasUsageAccess();
        if (!nextHidden.equals(hiddenApps) || access != usageAllowed) { foreground.reset(); lastUsageQuery = 0; }
        hiddenApps = nextHidden;
        usageAllowed = access;
        screenInteractive = interactive();
        refreshBounds();
        stopPolling();
        if (enabled && screenInteractive && usageAllowed && !hiddenApps.isEmpty()) sampleForeground();
        reconcile();
        if (edgeDotChanged && ball != null) dock(edgeDot);
        scheduleForeground();
    }

    public boolean isShown() { return shown; }

    public void destroy() {
        if (Looper.myLooper() != Looper.getMainLooper()) { main.post(this::destroy); return; }
        if (destroyed) return;
        destroyed = true;
        stopPolling();
        main.removeCallbacksAndMessages(null);
        removeWindows();
        if (receiverRegistered) { try { service.unregisterReceiver(lifecycleReceiver); } catch (RuntimeException ignored) { } receiverRegistered = false; }
        if (watchingOps && appOps != null) { try { appOps.stopWatchingMode(opListener); } catch (RuntimeException ignored) { } watchingOps = false; }
    }

    private boolean interactive() {
        android.app.KeyguardManager keyguard = (android.app.KeyguardManager) service.getSystemService(Context.KEYGUARD_SERVICE);
        return (power == null || power.isInteractive()) && (keyguard == null || !keyguard.isKeyguardLocked());
    }
    private boolean hasUsageAccess() {
        if (appOps == null) return false;
        try {
            int mode = Build.VERSION.SDK_INT >= 29
                ? appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), service.getPackageName())
                : appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), service.getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED || (mode == AppOpsManager.MODE_DEFAULT && service.checkSelfPermission("android.permission.PACKAGE_USAGE_STATS") == PackageManager.PERMISSION_GRANTED);
        } catch (RuntimeException denied) { return false; }
    }
    private void sampleForeground() {
        UsageStatsManager usage = (UsageStatsManager) service.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usage == null) return;
        long now = System.currentTimeMillis();
        // Prime with a full day once; overlapping samples retain the foreground when no new event occurs.
        long begin = lastUsageQuery == 0 || lastUsageQuery > now ? now - 24L * 60 * 60 * 1000 : Math.max(now - 24L * 60 * 60 * 1000, lastUsageQuery - 5000);
        try {
            UsageEvents events = usage.queryEvents(begin, now);
            UsageEvents.Event event = new UsageEvents.Event();
            if (events != null) while (events.hasNextEvent()) {
                events.getNextEvent(event);
                foreground.accept(event.getPackageName(), event.getTimeStamp(), event.getEventType());
            }
            lastUsageQuery = now;
        } catch (RuntimeException denied) {
            // Do not retain an excluded foreground application after access has been revoked.
            foreground.reset();
            usageAllowed = hasUsageAccess();
        }
    }
    private void scheduleForeground() {
        if (!destroyed && enabled && interactive() && usageAllowed && !hiddenApps.isEmpty() && !polling) {
            polling = true;
            main.postDelayed(pollForeground, 1000);
        }
    }
    private void stopPolling() { polling = false; main.removeCallbacks(pollForeground); }
    private void reconcile() {
        boolean excluded = usageAllowed && !hiddenApps.isEmpty() && hiddenApps.contains(foreground.current());
        if (destroyed || !enabled || !screenInteractive || !Settings.canDrawOverlays(service) || excluded) {
            removeWindows();
            return;
        }
        if (ball == null) addBall();
    }

    private int dp(float value) { return Math.round(value * service.getResources().getDisplayMetrics().density); }
    private static float clamp(float value, float minimum, float maximum) { return Float.isNaN(value) ? minimum : Math.max(minimum, Math.min(maximum, value)); }
    private void refreshBounds() {
        if (windows == null) return;
        DisplayMetrics metrics = new DisplayMetrics();
        windows.getDefaultDisplay().getRealMetrics(metrics);
        safeBounds.set(0, 0, metrics.widthPixels, metrics.heightPixels);
        int top = dimension("status_bar_height"), bottom = dimension("navigation_bar_height");
        int left = 0, right = 0;
        if (Build.VERSION.SDK_INT >= 30) try {
            android.view.WindowMetrics windowMetrics = windows.getMaximumWindowMetrics();
            Rect bounds = windowMetrics.getBounds();
            android.graphics.Insets insets = windowMetrics.getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            safeBounds.set(bounds);
            left = insets.left; top = insets.top; right = insets.right; bottom = insets.bottom;
        } catch (RuntimeException ignored) { }
        else if (ball != null && ball.getRootWindowInsets() != null) {
            WindowInsets insets = ball.getRootWindowInsets();
            left = insets.getStableInsetLeft(); top = insets.getStableInsetTop(); right = insets.getStableInsetRight(); bottom = insets.getStableInsetBottom();
            if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                left = Math.max(left, insets.getDisplayCutout().getSafeInsetLeft());
                top = Math.max(top, insets.getDisplayCutout().getSafeInsetTop());
                right = Math.max(right, insets.getDisplayCutout().getSafeInsetRight());
                bottom = Math.max(bottom, insets.getDisplayCutout().getSafeInsetBottom());
            }
        }
        safeBounds.left += left; safeBounds.top += top; safeBounds.right -= right; safeBounds.bottom -= bottom;
        if (safeBounds.width() < dp(48) || safeBounds.height() < dp(48)) safeBounds.set(0, 0, metrics.widthPixels, metrics.heightPixels);
    }
    private int dimension(String name) {
        int id = service.getResources().getIdentifier(name, "dimen", "android");
        return id == 0 ? 0 : service.getResources().getDimensionPixelSize(id);
    }
    private WindowManager.LayoutParams params(int width, int height, boolean focusable) {
        int flags = WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;
        flags |= focusable ? WindowManager.LayoutParams.FLAG_ALT_FOCUSABLE_IM : WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
        WindowManager.LayoutParams result = new WindowManager.LayoutParams(width, height, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, flags, android.graphics.PixelFormat.TRANSLUCENT);
        result.gravity = Gravity.TOP | Gravity.LEFT;
        result.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING;
        if (Build.VERSION.SDK_INT >= 28) result.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_NEVER;
        return result;
    }
    private void addBall() {
        if (windows == null) return;
        contracted = edgeDot;
        BallView next = new BallView();
        next.setContentDescription(contracted ? "悬浮球小圆点，点击展开，按住可拖动" : "悬浮球，点击打开快捷菜单，按住可拖动");
        ballParams = params(dp(contracted ? 16 : 48), dp(48), false);
        ballParams.x = leftSide ? safeBounds.left : safeBounds.right - ballParams.width;
        ballParams.y = positionY(ballParams.height);
        try {
            windows.addView(next, ballParams);
            ball = next;
            shown = true;
            next.setOnApplyWindowInsetsListener((view, insets) -> {
                main.post(() -> { if (!destroyed && ball == view) { Rect previous = new Rect(safeBounds); refreshBounds(); if (!previous.equals(safeBounds)) dock(contracted); } });
                return insets;
            });
            next.requestApplyInsets();
        } catch (RuntimeException denied) { ballParams = null; shown = false; }
    }
    private int positionY(int height) { return Math.round(clamp(safeBounds.top + yRatio * safeBounds.height() - height / 2f, safeBounds.top, Math.max(safeBounds.top, safeBounds.bottom - height))); }
    private void dock(boolean small) {
        main.removeCallbacks(idleCollapse);
        if (ball == null || ballParams == null) return;
        contracted = small && edgeDot;
        ballParams.width = dp(contracted ? 16 : 48);
        // Keep a 48 dp accessible touch target vertically, while the visible dot remains 14 dp.
        ballParams.height = dp(48);
        ballParams.x = leftSide ? safeBounds.left : safeBounds.right - ballParams.width;
        ballParams.y = positionY(ballParams.height);
        ball.setContentDescription(contracted ? "悬浮球小圆点，点击展开，按住可拖动" : "悬浮球，点击打开快捷菜单，按住可拖动");
        ball.invalidate();
        updateBall();
        if (edgeDot && !contracted && menu == null) main.postDelayed(idleCollapse, 6000);
    }
    private void updateBall() {
        if (ball == null || windows == null || ballParams == null) return;
        try { windows.updateViewLayout(ball, ballParams); }
        catch (RuntimeException revoked) { removeWindows(); }
    }
    private void persistPosition() {
        preferences.edit().putString("ballSide", leftSide ? "left" : "right").putFloat("ballYRatio", yRatio).apply();
    }
    private void removeWindows() {
        closeMenu(false);
        main.removeCallbacks(idleCollapse);
        if (ball != null && windows != null) try { windows.removeViewImmediate(ball); } catch (RuntimeException ignored) { }
        ball = null; ballParams = null; shown = false;
    }

    private void openMenu() {
        if (ball == null || menu != null || !Settings.canDrawOverlays(service)) return;
        main.removeCallbacks(idleCollapse);
        FrameLayout root = new FrameLayout(service);
        root.setBackgroundColor(0x220D2320);
        root.setFocusableInTouchMode(true);
        root.setOnClickListener(view -> closeMenu(true));
        root.setOnKeyListener((view, code, event) -> {
            if (code == KeyEvent.KEYCODE_BACK) { if (event.getAction() == KeyEvent.ACTION_UP) closeMenu(false); return true; }
            return false;
        });
        LinearLayout panel = new LinearLayout(service);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(16), dp(14), dp(16), dp(12));
        panel.setElevation(dp(12));
        panel.setBackground(shape(0xFFF9FCFA, dp(22), 0xFFE2EBE5));
        panel.setOnClickListener(view -> { });
        LinearLayout heading = new LinearLayout(service);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = label("快捷工具", 19, 0xFF173D32);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        heading.addView(title, new LinearLayout.LayoutParams(0, dp(36), 1));
        Button close = button("×", 0xFFEDF3EF, 0xFF35594A);
        close.setTextSize(24); close.setContentDescription("关闭快捷菜单");
        close.setOnClickListener(view -> closeMenu(false));
        heading.addView(close, new LinearLayout.LayoutParams(dp(44), dp(40)));
        panel.addView(heading);
        TextView hint = label("轻点操作 · 拖动悬浮球可调整位置", 11, 0xFF6F8178);
        panel.addView(hint, new LinearLayout.LayoutParams(-1, dp(30)));
        ScrollView scroll = new ScrollView(service);
        scroll.setFillViewport(false);
        LinearLayout actions = new LinearLayout(service); actions.setOrientation(LinearLayout.VERTICAL);
        int count = 0;
        for (String action : MENU_ORDER) if (menuActions.contains(action)) {
            final String selected = action;
            Button item = button(actionLabel(action), "hide".equals(action) ? 0xFFF9EEE8 : 0xFFEDF5EF, "hide".equals(action) ? 0xFF956149 : 0xFF28553D);
            item.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
            item.setPadding(dp(16), 0, dp(12), 0);
            item.setContentDescription(actionLabel(action));
            item.setOnClickListener(view -> runAction(selected));
            LinearLayout.LayoutParams row = new LinearLayout.LayoutParams(-1, dp(46)); row.bottomMargin = dp(7);
            actions.addView(item, row); count++;
        }
        if (count == 0) {
            TextView empty = label("尚未选择快捷操作。\n可在应用设置中选择悬浮球菜单。", 14, 0xFF6F8178);
            empty.setPadding(0, dp(12), 0, dp(16)); actions.addView(empty);
        }
        scroll.addView(actions);
        int menuWidth = Math.min(dp(280), Math.max(dp(160), safeBounds.width() - dp(24)));
        int footerHeight = dp(136);
        int actionHeight = Math.min(Math.max(dp(55), count * dp(53)), Math.max(dp(48), safeBounds.height() - footerHeight - dp(36)));
        panel.addView(scroll, new LinearLayout.LayoutParams(-1, actionHeight));
        LinearLayout footer = new LinearLayout(service); footer.setGravity(Gravity.CENTER_VERTICAL);
        Button cancel = button("取消", 0xFFF0F2F0, 0xFF607467);
        cancel.setOnClickListener(view -> closeMenu(true));
        Button back = button("返回悬浮球", 0xFFDFECE3, 0xFF355C43);
        back.setOnClickListener(view -> closeMenu(false));
        LinearLayout.LayoutParams first = new LinearLayout.LayoutParams(0, dp(42), 1); first.rightMargin = dp(8);
        footer.addView(cancel, first); footer.addView(back, new LinearLayout.LayoutParams(0, dp(42), 1));
        panel.addView(footer);
        int estimatedHeight = actionHeight + footerHeight;
        FrameLayout.LayoutParams placement = new FrameLayout.LayoutParams(menuWidth, -2, Gravity.TOP | Gravity.LEFT);
        placement.leftMargin = leftSide ? safeBounds.left + dp(12) : safeBounds.right - menuWidth - dp(12);
        placement.topMargin = Math.round(clamp(ballParams.y + dp(24) - estimatedHeight / 2f, safeBounds.top + dp(8), Math.max(safeBounds.top + dp(8), safeBounds.bottom - estimatedHeight - dp(8))));
        root.addView(panel, placement);
        try { windows.addView(root, params(-1, -1, true)); menu = root; root.requestFocus(); }
        catch (RuntimeException denied) { dock(true); }
    }
    private void closeMenu(boolean collapse) {
        if (menu != null && windows != null) try { windows.removeViewImmediate(menu); } catch (RuntimeException ignored) { }
        boolean wasOpen = menu != null;
        menu = null;
        if (wasOpen && ball != null) {
            if (collapse) dock(true);
            else if (edgeDot) main.postDelayed(idleCollapse, 6000);
        }
    }
    private void runAction(String action) {
        closeMenu(true);
        if ("hide".equals(action)) {
            preferences.edit().putBoolean("ballEnabled", false).apply();
            enabled = false; stopPolling(); removeWindows();
            AndroidCompanionService.refresh(service);
            return;
        }
        Intent intent = new Intent();
        if ("timer".equals(action) || "settings".equals(action)) {
            intent.setClassName(service, service.getPackageName() + ".AndroidToolsActivity");
            intent.putExtra("section", action);
        } else {
            intent.setClassName(service, service.getPackageName() + ".MainActivity");
            intent.putExtra("toolAction", action);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try { service.startActivity(intent); }
        catch (RuntimeException unavailable) { Toast.makeText(service, "暂时无法打开，请从应用内进入该工具", Toast.LENGTH_SHORT).show(); }
    }
    private TextView label(String text, int size, int color) { TextView view = new TextView(service); view.setText(text); view.setTextSize(size); view.setTextColor(color); view.setGravity(Gravity.CENTER_VERTICAL); return view; }
    private Button button(String text, int background, int color) {
        Button view = new Button(service); view.setText(text); view.setTextSize(14); view.setTextColor(color); view.setAllCaps(false);
        view.setMinHeight(0); view.setMinimumHeight(0); view.setMinWidth(0); view.setMinimumWidth(0); view.setPadding(dp(8), 0, dp(8), 0);
        view.setBackground(shape(background, dp(13), 0x00000000)); return view;
    }
    private GradientDrawable shape(int color, int radius, int stroke) { GradientDrawable drawable = new GradientDrawable(); drawable.setColor(color); drawable.setCornerRadius(radius); if ((stroke >>> 24) != 0) drawable.setStroke(dp(1), stroke); return drawable; }
    private String actionLabel(String action) {
        switch (action) {
            case "add": return "＋  新建任务";
            case "today": return "☀  今日待办";
            case "done": return "✓  已完成";
            case "timer": return "◷  番茄计时";
            case "notes": return "▤  我的便签";
            case "search": return "⌕  搜索任务";
            case "settings": return "⚙  工具设置";
            case "hide": return "·  隐藏悬浮球";
            default: return action;
        }
    }

    private final class BallView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float downX, downY;
        private int originalX, originalY;
        private boolean dragging, cancelled;
        BallView() { super(service); setClickable(true); setFocusable(true); setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES); setContentDescription("悬浮球小圆点，点击展开，按住可拖动"); }
        @Override public boolean performClick() {
            super.performClick();
            if (contracted) dock(false);
            else openMenu();
            return true;
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float cx = getWidth() / 2f, cy = getHeight() / 2f;
            if (contracted) {
                paint.setShader(null); paint.setColor(0x4430513D); canvas.drawCircle(cx, cy + dp(1), dp(7), paint);
                paint.setColor(0xFF53735D); canvas.drawCircle(cx, cy, dp(6), paint);
                paint.setColor(0xFFD2E6D3); canvas.drawCircle(cx - dp(1), cy - dp(1), dp(2), paint);
                return;
            }
            paint.setShader(null); paint.setColor(0x28344E3B); canvas.drawCircle(cx, cy + dp(1), dp(23), paint);
            paint.setAlpha(255); paint.setShader(new RadialGradient(cx - dp(10), cy - dp(11), dp(40), new int[]{0xFFF3E4B9, 0xFFD5DEAE, 0xFF88B299}, null, Shader.TileMode.CLAMP));
            canvas.drawCircle(cx, cy, dp(21), paint); paint.setShader(null);
            paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(dp(1)); paint.setColor(0x99FFFFFF); canvas.drawCircle(cx, cy, dp(20), paint); paint.setStyle(Paint.Style.FILL);
            float gap = dp(1.5f), side = dp(7);
            int[] colors = {0xFFD79885, 0xFFE6C768, 0xFF82AF8E, 0xFF7CA3A2};
            for (int i = 0; i < 4; i++) { float x = cx + (i % 2 == 0 ? -side - gap : gap), y = cy + (i < 2 ? -side - gap : gap); paint.setColor(colors[i]); canvas.drawRoundRect(x, y, x + side, y + side, dp(2), dp(2), paint); }
        }
        @Override public boolean onTouchEvent(MotionEvent event) {
            if (ballParams == null) return false;
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    main.removeCallbacks(idleCollapse);
                    downX = event.getRawX(); downY = event.getRawY(); originalX = ballParams.x; originalY = ballParams.y;
                    dragging = false; cancelled = false; setPressed(true); return true;
                case MotionEvent.ACTION_POINTER_DOWN:
                    cancelled = true; setPressed(false); return true;
                case MotionEvent.ACTION_MOVE:
                    if (cancelled) return true;
                    float dx = event.getRawX() - downX, dy = event.getRawY() - downY;
                    if (!dragging && dx * dx + dy * dy > touchSlop * touchSlop) {
                        dragging = true; setPressed(false);
                        if (contracted) {
                            originalX += (ballParams.width - dp(48)) / 2;
                            contracted = false; ballParams.width = dp(48);
                            setContentDescription("悬浮球拖动中，松开后靠边收起"); invalidate();
                        }
                    }
                    if (dragging) {
                        ballParams.x = Math.round(clamp(originalX + dx, safeBounds.left, safeBounds.right - ballParams.width));
                        ballParams.y = Math.round(clamp(originalY + dy, safeBounds.top, safeBounds.bottom - ballParams.height));
                        updateBall();
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                    setPressed(false);
                    if (dragging && ballParams != null) {
                        leftSide = ballParams.x + ballParams.width / 2f < safeBounds.exactCenterX();
                        yRatio = clamp((ballParams.y + ballParams.height / 2f - safeBounds.top) / safeBounds.height(), 0f, 1f);
                        persistPosition(); dock(true);
                    } else if (!cancelled) performClick();
                    else dock(true);
                    return true;
                case MotionEvent.ACTION_CANCEL:
                    setPressed(false); cancelled = true; dock(true); return true;
                default: return true;
            }
        }
    }

    /** Package-visible for deterministic checks of resumed, paused and no-event foreground windows. */
    static final class ForegroundTracker {
        private String current = "";
        private long lastEventTime = Long.MIN_VALUE;
        String current() { return current; }
        void reset() { current = ""; lastEventTime = Long.MIN_VALUE; }
        void accept(String packageName, long time, int type) {
            if (time < lastEventTime) return;
            if (type == UsageEvents.Event.MOVE_TO_FOREGROUND && packageName != null && !packageName.isEmpty()) {
                current = packageName; lastEventTime = time;
            } else if (type == UsageEvents.Event.MOVE_TO_BACKGROUND && packageName != null && packageName.equals(current)) {
                current = ""; lastEventTime = time;
            }
        }
    }
}
