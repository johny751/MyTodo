package local.gxtodo.replica;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.AppOpsManager;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import org.json.JSONArray;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native controls for the Android companion and the persistent focus timer. */
public final class AndroidToolsActivity extends Activity {
    private static final int NOTIFICATION_REQUEST = 1201;
    private static final int OVERLAY_REQUEST = 1202;
    private static final int INK = Color.rgb(37, 53, 64);
    private static final int MUTED = Color.rgb(103, 120, 132);
    private static final int ACCENT = Color.rgb(38, 144, 170);
    private static final int BACKGROUND = Color.rgb(245, 247, 249);
    private static final String[] MENU_KEYS = {"add", "today", "done", "timer", "notes", "settings", "hide", "search"};
    private static final String[] MENU_LABELS = {"新增待办", "今日待办", "已完成待办", "番茄 / 计时", "笔记", "Android 设置", "隐藏悬浮球", "搜索待办"};
    private static final Set<String> DEFAULT_MENU = new HashSet<>(Arrays.asList("add", "today", "done", "timer", "notes", "settings", "hide"));
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService appLoader = Executors.newSingleThreadExecutor();
    private SharedPreferences preferences;
    private boolean bindingViews, resumed, pendingOverlay;
    private volatile boolean destroyed;
    private boolean durationDirty;
    private String selectedMode = "countdown";
    private String section = "settings";
    private ScrollView settingsPage, timerPage;
    private Button settingsTab, timerTab, notificationPermissionButton, usagePermissionButton;
    private Switch notificationSwitch, overlaySwitch, edgeDotSwitch;
    private TextView exactAlarmInfo;
    private TextView notificationInfo, overlayInfo, usageInfo, excludedAppsInfo, menuInfo, feedback;
    private TextView timerTime, timerCaption, timerStatus, timerModeHint, sessionsToday, focusToday;
    private RadioGroup modeGroup;
    private RadioButton countdownMode, countupMode;
    private EditText durationInput;
    private LinearLayout durationRow;
    private Button applyDurationButton, timerAction, timerReset;
    private AlertDialog appDialog;
    private LinearLayout currentAppList;
    private EditText currentAppSearch;
    private Set<String> currentHiddenSelection;
    private List<AppEntry> launchableApps;
    private boolean appsLoading;
    private TextView linkedTaskTitle, linkedTaskAccount, linkedTaskHelp;
    private Button chooseTaskButton, clearTaskButton;
    private AlertDialog taskDialog;
    private EditText taskSearchInput;
    private TextView taskPickerAccount, taskPickerStatus;
    private LinearLayout taskPickerList;
    private final List<RadioButton> taskChoiceButtons = new ArrayList<>();
    private String taskPickerAccountId = "", taskPickerAccountName = "", pickerSelectedTaskId = "";
    private volatile int taskSearchGeneration;
    private int taskLinkGeneration;
    private Runnable pendingTaskSearch;
    private boolean taskUpdateBusy;
    private String deferredTaskMessage = "";
    private String resolvedTaskKey = "";
    private JSONObject resolvedTask;
    private boolean linkedTaskMissing;
    private final Runnable clockTick = new Runnable() {
        @Override public void run() {
            if (!resumed || destroyed) return;
            refreshTimer();
            handler.postDelayed(this, 1000);
        }
    };

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences("android-tools", MODE_PRIVATE);
        if (savedInstanceState != null) {
            pendingOverlay = savedInstanceState.getBoolean("pendingOverlay", false);
            selectedMode = savedInstanceState.getString("selectedMode", "countdown");
            section = savedInstanceState.getString("section", "settings");
        } else {
            section = "timer".equals(getIntent().getStringExtra("section")) ? "timer" : "settings";
            selectedMode = snapshot().optString("mode", "countdown");
        }
        Window window = getWindow();
        window.setStatusBarColor(BACKGROUND);
        window.setNavigationBarColor(BACKGROUND);
        window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        buildPage();
        showSection(section);
        refreshPermissions();
        refreshTimer();
    }

    private void buildPage() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BACKGROUND);
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(12), dp(6), dp(18), dp(6));
        Button back = button("‹ 返回", false);
        back.setContentDescription("返回待办");
        back.setOnClickListener(v -> finish());
        header.addView(back, new LinearLayout.LayoutParams(dp(92), dp(48)));
        TextView title = text("Android 工具", 19, INK, true);
        title.setPadding(dp(12), 0, 0, 0);
        header.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(header);
        LinearLayout tabs = new LinearLayout(this);
        tabs.setPadding(dp(18), dp(4), dp(18), dp(12));
        settingsTab = button("设置", false);
        timerTab = button("番茄 / 计时", false);
        settingsTab.setOnClickListener(v -> showSection("settings"));
        timerTab.setOnClickListener(v -> showSection("timer"));
        tabs.addView(settingsTab, weightedButton());
        LinearLayout.LayoutParams timerTabParams = weightedButton();
        timerTabParams.leftMargin = dp(10);
        tabs.addView(timerTab, timerTabParams);
        root.addView(tabs);
        FrameLayout pages = new FrameLayout(this);
        settingsPage = new ScrollView(this);
        timerPage = new ScrollView(this);
        settingsPage.setFillViewport(true);
        timerPage.setFillViewport(true);
        settingsPage.setClipToPadding(false);
        timerPage.setClipToPadding(false);
        settingsPage.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        timerPage.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
        settingsPage.addView(pageContainer(buildSettings()));
        timerPage.addView(pageContainer(buildTimer()));
        pages.addView(settingsPage, new FrameLayout.LayoutParams(-1, -1));
        pages.addView(timerPage, new FrameLayout.LayoutParams(-1, -1));
        root.addView(pages, new LinearLayout.LayoutParams(-1, 0, 1));
        feedback = text("", 13, MUTED, false);
        feedback.setPadding(dp(18), dp(8), dp(18), dp(10));
        feedback.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        feedback.setVisibility(View.GONE);
        root.addView(feedback);
        setContentView(root);
    }

    private FrameLayout pageContainer(LinearLayout content) {
        FrameLayout frame = new FrameLayout(this);
        int width = Math.min(getResources().getDisplayMetrics().widthPixels - dp(36), dp(680));
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(Math.max(dp(240), width), -2, Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        params.bottomMargin = dp(24);
        frame.addView(content, params);
        return frame;
    }

    private LinearLayout buildSettings() {
        LinearLayout page = vertical();
        TextView intro = text("让待办与专注随手可达", 14, MUTED, false);
        intro.setPadding(dp(2), dp(2), dp(2), dp(16));
        page.addView(intro);

        LinearLayout notifications = card(page);
        notificationSwitch = switchRow(notifications, "状态栏通知", "显示状态栏通知");
        notifications.addView(paragraph("在通知栏显示待办快捷入口与正在进行的计时。"));
        notificationInfo = paragraph("");
        notificationInfo.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        notifications.addView(notificationInfo);
        notificationPermissionButton = actionRow(notifications, "开启通知权限", this::requestNotifications);
        notificationSwitch.setOnCheckedChangeListener((view, checked) -> {
            if (bindingViews) return;
            preferences.edit().putBoolean("statusEnabled", checked).apply();
            refreshPermissions();
            refreshCompanion();
            if (checked && !notificationsAllowed()) requestNotifications();
        });

        LinearLayout overlay = card(page);
        overlaySwitch = switchRow(overlay, "跨应用悬浮球", "显示跨应用悬浮球");
        overlay.addView(paragraph("在其他应用上方保留一个小入口，点击即可使用你选择的菜单。"));
        overlayInfo = paragraph("");
        overlayInfo.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        overlay.addView(overlayInfo);
        actionRow(overlay, "管理悬浮窗权限", this::requestOverlay);
        overlaySwitch.setOnCheckedChangeListener((view, checked) -> {
            if (bindingViews) return;
            if (checked && !Settings.canDrawOverlays(this)) {
                bindingViews = true;
                overlaySwitch.setChecked(false);
                bindingViews = false;
                preferences.edit().putBoolean("ballEnabled", false).apply();
                pendingOverlay = true;
                requestOverlay();
                return;
            }
            pendingOverlay = false;
            preferences.edit().putBoolean("ballEnabled", checked).apply();
            refreshPermissions();
            refreshCompanion();
        });

        edgeDotSwitch = switchRow(overlay, "贴边缩为小圆点", "悬浮球贴边自动缩小");
        edgeDotSwitch.setOnCheckedChangeListener((view, checked) -> {
            if (bindingViews) return;
            preferences.edit().putBoolean("edgeDot", checked).apply();
            refreshCompanion();
        });
        LinearLayout exclusions = card(page);
        exclusions.addView(text("在指定应用中隐藏", 17, INK, true));
        excludedAppsInfo = paragraph("");
        exclusions.addView(excludedAppsInfo);
        actionRow(exclusions, "选择应用", this::showAppPicker);
        TextView permissionTitle = text("使用情况访问权限", 14, INK, true);
        permissionTitle.setPadding(0, dp(14), 0, 0);
        exclusions.addView(permissionTitle);
        usageInfo = paragraph("");
        exclusions.addView(usageInfo);
        usagePermissionButton = actionRow(exclusions, "开启使用情况访问", this::requestUsageAccess);

        LinearLayout menus = card(page);
        menus.addView(text("悬浮球点击菜单", 17, INK, true));
        menuInfo = paragraph("");
        menus.addView(menuInfo);
        actionRow(menus, "自定义菜单", this::showMenuPicker);
        menus.addView(paragraph("可选择任意数量的项目。未选择项目时，菜单仍保留关闭入口。"));
        return page;
    }

    private LinearLayout buildTimer() {
        LinearLayout page = vertical();
        TextView intro = text("一次只专注眼前的一件事", 14, MUTED, false);
        intro.setPadding(dp(2), dp(2), dp(2), dp(16));
        page.addView(intro);
        LinearLayout association = card(page);
        association.addView(text("本轮关联任务", 14, MUTED, true));
        linkedTaskTitle = text("未关联任务", 17, INK, true);
        linkedTaskTitle.setPadding(0, dp(12), 0, 0);
        linkedTaskTitle.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        association.addView(linkedTaskTitle);
        linkedTaskAccount = paragraph("");
        association.addView(linkedTaskAccount);
        LinearLayout taskActions = new LinearLayout(this);
        taskActions.setPadding(0, dp(10), 0, 0);
        chooseTaskButton = button("关联任务", false);
        clearTaskButton = button("取消关联", false);
        chooseTaskButton.setOnClickListener(v -> showTaskPicker());
        clearTaskButton.setOnClickListener(v -> clearTaskAssociation());
        taskActions.addView(chooseTaskButton, weightedButton());
        LinearLayout.LayoutParams clearParams = weightedButton();
        clearParams.leftMargin = dp(10);
        taskActions.addView(clearTaskButton, clearParams);
        association.addView(taskActions);
        linkedTaskHelp = paragraph("可独立计时，也可以关联当前账号中的任务。");
        association.addView(linkedTaskHelp);
        LinearLayout clock = card(page);
        modeGroup = new RadioGroup(this);
        modeGroup.setOrientation(RadioGroup.HORIZONTAL);
        modeGroup.setGravity(Gravity.CENTER);
        countdownMode = new RadioButton(this);
        countupMode = new RadioButton(this);
        countdownMode.setId(View.generateViewId());
        countupMode.setId(View.generateViewId());
        countdownMode.setText("倒计时");
        countupMode.setText("正计时");
        countdownMode.setTextSize(16);
        countupMode.setTextSize(16);
        countdownMode.setButtonTintList(ColorStateList.valueOf(ACCENT));
        countupMode.setButtonTintList(ColorStateList.valueOf(ACCENT));
        countdownMode.setContentDescription("倒计时模式");
        countupMode.setContentDescription("正计时模式");
        modeGroup.addView(countdownMode, new RadioGroup.LayoutParams(0, dp(48), 1));
        modeGroup.addView(countupMode, new RadioGroup.LayoutParams(0, dp(48), 1));
        clock.addView(modeGroup);
        modeGroup.setOnCheckedChangeListener((group, id) -> {
            if (bindingViews) return;
            selectedMode = id == countupMode.getId() ? "countup" : "countdown";
            durationRow.setVisibility("countdown".equals(selectedMode) ? View.VISIBLE : View.GONE);
            refreshTimer();
        });
        durationRow = new LinearLayout(this);
        durationRow.setGravity(Gravity.CENTER_VERTICAL);
        durationRow.setPadding(0, dp(12), 0, 0);
        TextView durationLabel = text("本轮时长", 14, MUTED, false);
        durationRow.addView(durationLabel);
        durationInput = new EditText(this);
        durationInput.setSingleLine(true);
        durationInput.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        durationInput.setSelectAllOnFocus(true);
        durationInput.setTextSize(16);
        durationInput.setGravity(Gravity.CENTER);
        durationInput.setContentDescription("倒计时时长，1 到 180 分钟");
        durationInput.setHint("25");
        int minutes = 25;
        try { minutes = PomodoroTimer.get(this).durationMinutes(); } catch (Exception ignored) { }
        durationInput.setText(String.valueOf(minutes));
        LinearLayout.LayoutParams inputParams = new LinearLayout.LayoutParams(0, dp(48), 1);
        inputParams.leftMargin = dp(10);
        inputParams.rightMargin = dp(8);
        durationRow.addView(durationInput, inputParams);
        durationRow.addView(text("分钟", 14, MUTED, false));
        applyDurationButton = button("设置", false);
        applyDurationButton.setOnClickListener(v -> applyDuration(true));
        LinearLayout.LayoutParams applyParams = new LinearLayout.LayoutParams(dp(68), dp(48));
        applyParams.leftMargin = dp(8);
        durationRow.addView(applyDurationButton, applyParams);
        durationInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence value, int start, int before, int count) { if (!bindingViews) durationDirty = true; }
            @Override public void afterTextChanged(Editable value) { }
        });
        clock.addView(durationRow);
        timerCaption = text("", 14, MUTED, false);
        timerCaption.setGravity(Gravity.CENTER);
        timerCaption.setPadding(0, dp(26), 0, 0);
        clock.addView(timerCaption);
        timerTime = text("25:00", getResources().getDisplayMetrics().widthPixels >= dp(380) ? 56 : 46, INK, true);
        timerTime.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        timerTime.setGravity(Gravity.CENTER);
        timerTime.setPadding(0, dp(10), 0, dp(4));
        timerTime.setFontFeatureSettings("tnum");
        clock.addView(timerTime);
        timerStatus = text("准备开始", 15, ACCENT, true);
        timerStatus.setGravity(Gravity.CENTER);
        timerStatus.setPadding(0, dp(2), 0, dp(24));
        timerStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        clock.addView(timerStatus);
        LinearLayout actions = new LinearLayout(this);
        timerAction = button("开始", true);
        timerReset = button("重置", false);
        actions.addView(timerAction, weightedButton());
        LinearLayout.LayoutParams resetParams = weightedButton();
        resetParams.leftMargin = dp(12);
        actions.addView(timerReset, resetParams);
        clock.addView(actions);
        timerAction.setOnClickListener(v -> performTimerAction());
        timerReset.setOnClickListener(v -> {
            durationDirty = false;
            sendTimerCommand("timer-reset");
        });
        timerModeHint = paragraph("");
        timerModeHint.setGravity(Gravity.CENTER);
        clock.addView(timerModeHint);

        LinearLayout stats = card(page);
        stats.addView(text("今日专注", 17, INK, true));
        LinearLayout numbers = new LinearLayout(this);
        numbers.setPadding(0, dp(18), 0, dp(6));
        LinearLayout completedColumn = vertical();
        LinearLayout focusColumn = vertical();
        sessionsToday = text("0", 27, INK, true);
        focusToday = text("0 分钟", 24, INK, true);
        completedColumn.addView(sessionsToday);
        completedColumn.addView(paragraph("完成番茄"));
        focusColumn.addView(focusToday);
        focusColumn.addView(paragraph("累计专注"));
        numbers.addView(completedColumn, new LinearLayout.LayoutParams(0, -2, 1));
        numbers.addView(focusColumn, new LinearLayout.LayoutParams(0, -2, 1));
        stats.addView(numbers);
        LinearLayout help = card(page);
        help.addView(text("离开页面，计时继续", 16, INK, true));
        help.addView(paragraph("计时在后台继续运行；暂停与重置不会清除今日统计。倒计时完成提醒需要开启系统通知权限。"));
        actionRow(help, "管理通知权限", this::requestNotifications);
        exactAlarmInfo = paragraph("");
        help.addView(exactAlarmInfo);
        actionRow(help, "管理准时提醒权限", this::requestExactAlarms);
        return page;
    }

    private void showSection(String next) {
        section = "timer".equals(next) ? "timer" : "settings";
        boolean timer = "timer".equals(section);
        timerPage.setVisibility(timer ? View.VISIBLE : View.GONE);
        settingsPage.setVisibility(timer ? View.GONE : View.VISIBLE);
        styleButton(settingsTab, !timer);
        styleButton(timerTab, timer);
        settingsTab.setSelected(!timer);
        timerTab.setSelected(timer);
    }

    private void refreshPermissions() {
        if (preferences == null || notificationSwitch == null) return;
        boolean overlayAllowed = Settings.canDrawOverlays(this);
        boolean enabledOverlay = preferences.getBoolean("ballEnabled", false);
        if (pendingOverlay && overlayAllowed) {
            preferences.edit().putBoolean("ballEnabled", true).apply();
            pendingOverlay = false;
            enabledOverlay = true;
        }
        if (enabledOverlay && !overlayAllowed) {
            preferences.edit().putBoolean("ballEnabled", false).apply();
            enabledOverlay = false;
        }
        boolean statusEnabled = preferences.getBoolean("statusEnabled", true);
        bindingViews = true;
        notificationSwitch.setChecked(statusEnabled);
        overlaySwitch.setChecked(enabledOverlay);
        edgeDotSwitch.setChecked(preferences.getBoolean("edgeDot", true));
        bindingViews = false;
        boolean notifications = notificationsAllowed();
        exactAlarmInfo.setText(exactAlarmsAllowed() ? "准时提醒权限已开启，倒计时可在休眠时准时提醒。" : "准时提醒权限未开启。计时仍然准确，休眠时完成通知可能被系统延后。");
        notificationInfo.setText(!statusEnabled ? "状态栏快捷通知已关闭。悬浮球或计时运行时，Android 仍要求保留简洁的后台通知；计时结束提醒仍可显示。" : notifications ? "系统通知权限已开启，状态栏快捷通知已启用。" : "系统通知权限未开启。开启偏好已保存，授权后才能显示状态栏通知与完成提醒。");
        notificationPermissionButton.setText(notifications ? "管理通知权限" : "开启通知权限");
        overlayInfo.setText(!overlayAllowed ? "需要允许显示在其他应用上层。授权后才会启用悬浮球。" : enabledOverlay ? "悬浮球已开启。可拖动调整位置，点击打开菜单。" : "悬浮窗权限已开启，悬浮球当前关闭。");
        Set<String> hidden = readSet("hiddenApps", new HashSet<>());
        excludedAppsInfo.setText(hidden.isEmpty() ? "尚未选择应用。你可以在阅读、游戏或全屏应用中自动隐藏悬浮球。" : "已选择 " + hidden.size() + " 个应用。悬浮球会在这些应用位于前台时隐藏。");
        boolean usage = usageAccessAllowed();
        usageInfo.setText(usage ? "已授权，可识别前台应用并应用隐藏规则。" : "尚未授权，无法识别前台应用；已选应用的隐藏规则当前不生效。此权限只用于判断何时隐藏悬浮球。");
        usagePermissionButton.setText(usage ? "管理使用情况访问" : "开启使用情况访问");
        Set<String> menu = readSet("ballMenu", DEFAULT_MENU);
        List<String> names = new ArrayList<>();
        for (int i = 0; i < MENU_KEYS.length; i++) if (menu.contains(MENU_KEYS[i])) names.add(MENU_LABELS[i]);
        menuInfo.setText(names.isEmpty() ? "未选择菜单项目；点击悬浮球仍可关闭菜单。" : android.text.TextUtils.join(" · ", names));
    }

    private boolean notificationsAllowed() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        return manager != null && manager.areNotificationsEnabled();
    }

    private boolean usageAccessAllowed() {
        try {
            AppOpsManager manager = (AppOpsManager) getSystemService(APP_OPS_SERVICE);
            if (manager == null) return false;
            int mode = manager.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getPackageName());
            return mode == AppOpsManager.MODE_ALLOWED || (mode == AppOpsManager.MODE_DEFAULT && checkSelfPermission(Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED);
        } catch (RuntimeException error) { return false; }
    }

    private void requestNotifications() {
        try {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
                return;
            }
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            try { startActivity(intent); }
            catch (RuntimeException error) { startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()))); }
        } catch (RuntimeException error) { showMessage("无法打开通知设置，请在系统设置中为本应用开启通知。"); }
    }

    private boolean exactAlarmsAllowed() {
        return Build.VERSION.SDK_INT < 31 || ((android.app.AlarmManager)getSystemService(ALARM_SERVICE)).canScheduleExactAlarms();
    }
    private void requestExactAlarms() {
        try {
            if (Build.VERSION.SDK_INT >= 31) startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName())));
            else showMessage("当前系统支持准时提醒。");
        } catch (RuntimeException error) { showMessage("请在系统特殊应用权限中管理闹钟和提醒权限。"); }
    }
    private void requestOverlay() {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()));
            try { startActivityForResult(intent, OVERLAY_REQUEST); }
            catch (RuntimeException error) { startActivityForResult(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION), OVERLAY_REQUEST); }
        } catch (RuntimeException error) {
            pendingOverlay = false;
            refreshPermissions();
            showMessage("无法打开悬浮窗授权页面，请在系统设置中允许本应用显示在其他应用上层。");
        }
    }

    private void requestUsageAccess() {
        try { startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)); }
        catch (RuntimeException error) { showMessage("无法打开使用情况访问设置；当前应用隐藏规则不会生效。"); }
    }

    private void showMenuPicker() {
        Set<String> selected = readSet("ballMenu", DEFAULT_MENU);
        boolean[] checked = new boolean[MENU_KEYS.length];
        for (int i = 0; i < checked.length; i++) checked[i] = selected.contains(MENU_KEYS[i]);
        new AlertDialog.Builder(this)
            .setTitle("悬浮球点击菜单")
            .setMultiChoiceItems(MENU_LABELS, checked, (dialog, index, value) -> {
                if (value) selected.add(MENU_KEYS[index]); else selected.remove(MENU_KEYS[index]);
            })
            .setNegativeButton("取消", null)
            .setPositiveButton("保存", (dialog, which) -> {
                preferences.edit().putStringSet("ballMenu", new HashSet<>(selected)).apply();
                refreshPermissions();
                refreshCompanion();
            }).show();
    }

    private void showAppPicker() {
        if (appDialog != null && appDialog.isShowing()) return;
        Set<String> selected = readSet("hiddenApps", new HashSet<>());
        LinearLayout panel = vertical();
        panel.setPadding(dp(20), dp(4), dp(20), 0);
        TextView description = paragraph("选中的应用位于前台时隐藏悬浮球。需要授予使用情况访问权限。仅列出具有启动入口的应用。");
        panel.addView(description);
        EditText search = new EditText(this);
        search.setSingleLine(true);
        search.setTextSize(15);
        search.setHint("搜索应用名称或包名");
        search.setContentDescription("搜索要隐藏悬浮球的应用");
        search.setInputType(android.text.InputType.TYPE_CLASS_TEXT);
        panel.addView(search, new LinearLayout.LayoutParams(-1, dp(52)));
        ScrollView scroll = new ScrollView(this);
        LinearLayout list = vertical();
        scroll.addView(list);
        int pickerHeight = Math.max(dp(180), Math.min(dp(380), getResources().getDisplayMetrics().heightPixels / 2));
        panel.addView(scroll, new LinearLayout.LayoutParams(-1, pickerHeight));
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence value, int start, int before, int count) { populateApps(list, selected, value.toString()); }
            @Override public void afterTextChanged(Editable value) { }
        });
        appDialog = new AlertDialog.Builder(this).setTitle("在这些应用中隐藏").setView(panel)
            .setNegativeButton("取消", null)
            .setPositiveButton("保存", (dialog, which) -> {
                preferences.edit().putStringSet("hiddenApps", new HashSet<>(selected)).apply();
                refreshPermissions();
                refreshCompanion();
            }).create();
        appDialog.setOnShowListener(dialog -> {
            if (appDialog.getWindow() != null) {
                appDialog.getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
                int width = Math.min(getResources().getDisplayMetrics().widthPixels - dp(24), dp(620));
                appDialog.getWindow().setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
            }
        });
        currentAppList = list;
        currentAppSearch = search;
        currentHiddenSelection = selected;
        appDialog.show();
        populateApps(list, selected, "");
        if (launchableApps != null || appsLoading) return;
        appsLoading = true;
        appLoader.execute(() -> {
            List<AppEntry> apps = new ArrayList<>();
            String loadError = null;
            try {
                PackageManager manager = getPackageManager();
                Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
                List<ResolveInfo> matches = manager.queryIntentActivities(launcher, 0);
                LinkedHashMap<String, AppEntry> distinct = new LinkedHashMap<>();
                for (ResolveInfo item : matches) {
                    if (item.activityInfo == null) continue;
                    String packageName = item.activityInfo.packageName;
                    if (distinct.containsKey(packageName)) continue;
                    String label = item.loadLabel(manager).toString();
                    Drawable icon = null;
                    try { icon = item.loadIcon(manager); } catch (RuntimeException ignored) { }
                    distinct.put(packageName, new AppEntry(label, packageName, icon));
                }
                apps.addAll(distinct.values());
                Collator collator = Collator.getInstance(Locale.CHINA);
                apps.sort((left, right) -> collator.compare(left.label, right.label));
            } catch (RuntimeException error) { loadError = "无法读取应用列表，请稍后重新打开。"; }
            final String errorMessage = loadError;
            runOnUiThread(() -> {
                appsLoading = false;
                if (destroyed || isFinishing()) return;
                launchableApps = errorMessage == null ? apps : null;
                if (appDialog != null && appDialog.isShowing()) {
                    populateApps(currentAppList, currentHiddenSelection, currentAppSearch.getText().toString());
                    if (errorMessage != null) {
                        currentAppList.removeAllViews();
                        currentAppList.addView(paragraph(errorMessage));
                    }
                }
            });
        });
    }

    private void populateApps(LinearLayout list, Set<String> selected, String query) {
        list.removeAllViews();
        if (launchableApps == null) {
            list.addView(paragraph("正在读取应用列表…"));
            return;
        }
        String filter = query.trim().toLowerCase(Locale.ROOT);
        int shown = 0;
        for (AppEntry app : launchableApps) {
            if (!filter.isEmpty() && !app.label.toLowerCase(Locale.ROOT).contains(filter) && !app.packageName.toLowerCase(Locale.ROOT).contains(filter)) continue;
            LinearLayout row = new LinearLayout(this);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(0, dp(8), 0, dp(8));
            row.setMinimumHeight(dp(64));
            ImageView icon = new ImageView(this);
            if (app.icon != null) icon.setImageDrawable(app.icon);
            icon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            row.addView(icon, new LinearLayout.LayoutParams(dp(34), dp(34)));
            LinearLayout labels = vertical();
            labels.setPadding(dp(12), 0, dp(6), 0);
            labels.addView(text(app.label, 15, INK, false));
            TextView packageLabel = text(app.packageName, 11, MUTED, false);
            packageLabel.setMaxLines(2);
            labels.addView(packageLabel);
            row.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
            CheckBox checkbox = new CheckBox(this);
            checkbox.setChecked(selected.contains(app.packageName));
            checkbox.setButtonTintList(ColorStateList.valueOf(ACCENT));
            checkbox.setContentDescription(app.label + "，隐藏悬浮球");
            checkbox.setOnCheckedChangeListener((view, checked) -> {
                if (checked) selected.add(app.packageName); else selected.remove(app.packageName);
            });
            row.addView(checkbox, new LinearLayout.LayoutParams(dp(48), dp(48)));
            row.setOnClickListener(v -> checkbox.setChecked(!checkbox.isChecked()));
            list.addView(row);
            shown++;
        }
        if (shown == 0) list.addView(paragraph(filter.isEmpty() ? "未找到具有启动入口的应用。" : "没有匹配的应用。"));
    }

    private void renderTaskAssociation(JSONObject state) {
        if (linkedTaskTitle == null) return;
        JSONObject stored = state.optJSONObject("task");
        boolean linked = stored != null;
        JSONObject display = linked && taskKey(stored).equals(resolvedTaskKey) && resolvedTask != null ? resolvedTask : stored;
        linkedTaskTitle.setText(display == null ? "未关联任务" : display.optString("title", "未命名任务"));
        linkedTaskAccount.setText(display == null ? "可独立计时，或选择当前账号中的任务。" : "账号：" + display.optString("accountName", "本地账号") + " · " + (display.optBoolean("done", false) ? "已完成" : "待完成"));
        boolean missing = linked && taskKey(stored).equals(resolvedTaskKey) && linkedTaskMissing;
        linkedTaskHelp.setText(missing ? "关联任务已删除。你可以重新选择任务或取消关联。" : linked ? "关联可随时更换，暂停与重置后仍保留所选任务。" : "支持关联子任务；也可以保持不关联。");
        chooseTaskButton.setText(taskUpdateBusy ? "正在保存…" : linked ? "更换任务" : "关联任务");
        chooseTaskButton.setEnabled(!taskUpdateBusy);
        clearTaskButton.setVisibility(linked ? View.VISIBLE : View.GONE);
        clearTaskButton.setEnabled(!taskUpdateBusy);
    }

    private String taskKey(JSONObject link) {
        return link == null ? "" : link.optString("accountId") + "|" + link.optString("id");
    }

    private void queueTaskResolution() {
        final JSONObject link = snapshot().optJSONObject("task");
        final int generation = ++taskLinkGeneration;
        if (link == null) {
            resolvedTaskKey = "";
            resolvedTask = null;
            linkedTaskMissing = false;
            return;
        }
        final String key = taskKey(link);
        appLoader.execute(() -> {
            JSONObject latest = null;
            boolean checked = false;
            try {
                latest = PomodoroTasks.resolve(getApplicationContext(), link.optString("accountId"), link.optString("id"));
                checked = true;
            } catch (Exception ignored) { }
            final JSONObject result = latest;
            final boolean resolved = checked;
            runOnUiThread(() -> {
                if (destroyed || !resumed || generation != taskLinkGeneration || !key.equals(taskKey(snapshot().optJSONObject("task")))) return;
                if (resolved) {
                    resolvedTaskKey = key;
                    resolvedTask = result;
                    linkedTaskMissing = result == null;
                    renderTaskAssociation(snapshot());
                }
            });
        });
    }

    private void showTaskPicker() {
        if (taskUpdateBusy || (taskDialog != null && taskDialog.isShowing())) return;
        taskPickerAccountId = "";
        taskPickerAccountName = "";
        pickerSelectedTaskId = "";
        taskChoiceButtons.clear();
        LinearLayout panel = vertical();
        panel.setPadding(dp(20), dp(4), dp(20), 0);
        taskPickerAccount = paragraph("正在读取当前账号…");
        panel.addView(taskPickerAccount);
        taskSearchInput = new EditText(this);
        taskSearchInput.setSingleLine(true);
        taskSearchInput.setTextSize(15);
        taskSearchInput.setHint("搜索任务或子任务");
        taskSearchInput.setContentDescription("搜索当前账号的任务与子任务");
        taskSearchInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT);
        panel.addView(taskSearchInput, new LinearLayout.LayoutParams(-1, dp(52)));
        taskPickerStatus = paragraph("请选择要关联的任务。已完成任务也可选择。");
        taskPickerStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        panel.addView(taskPickerStatus);
        ScrollView scroll = new ScrollView(this);
        taskPickerList = vertical();
        scroll.addView(taskPickerList);
        int height = Math.max(dp(160), Math.min(dp(330), getResources().getDisplayMetrics().heightPixels / 2));
        panel.addView(scroll, new LinearLayout.LayoutParams(-1, height));
        final AlertDialog picker = new AlertDialog.Builder(this).setTitle("关联当前账号任务").setView(panel)
            .setNegativeButton("取消", null).setPositiveButton("关联", null).create();
        taskDialog = picker;
        picker.setOnShowListener(dialog -> {
            picker.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            picker.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> savePickedTask(picker));
            if (picker.getWindow() != null) {
                picker.getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
                picker.getWindow().setLayout(Math.min(getResources().getDisplayMetrics().widthPixels - dp(24), dp(620)), ViewGroup.LayoutParams.WRAP_CONTENT);
            }
        });
        picker.setOnDismissListener(dialog -> {
            taskSearchGeneration++;
            if (pendingTaskSearch != null) handler.removeCallbacks(pendingTaskSearch);
            pendingTaskSearch = null;
            if (taskDialog == picker) taskDialog = null;
        });
        taskSearchInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence value, int start, int before, int count) { queueTaskSearch(value.toString()); }
            @Override public void afterTextChanged(Editable value) { }
        });
        picker.show();
        queueTaskSearch("");
    }

    private void queueTaskSearch(String query) {
        final AlertDialog picker = taskDialog;
        if (picker == null || !picker.isShowing() || taskUpdateBusy) return;
        final int generation = ++taskSearchGeneration;
        if (pendingTaskSearch != null) handler.removeCallbacks(pendingTaskSearch);
        pickerSelectedTaskId = "";
        taskChoiceButtons.clear();
        picker.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
        taskPickerList.removeAllViews();
        taskPickerStatus.setText("正在搜索任务…");
        pendingTaskSearch = () -> appLoader.execute(() -> {
            JSONObject result = null;
            String failure = null;
            try { result = PomodoroTasks.search(getApplicationContext(), query, 100); }
            catch (Exception error) { failure = taskFailure(error); }
            final JSONObject found = result;
            final String errorMessage = failure;
            runOnUiThread(() -> {
                if (destroyed || !resumed || generation != taskSearchGeneration || taskDialog != picker || !picker.isShowing()) return;
                if (errorMessage != null || found == null) {
                    taskPickerStatus.setText(errorMessage == null ? "无法读取任务，请重新搜索。" : errorMessage + " 请重新搜索。");
                    return;
                }
                populateTasks(found, query);
            });
        });
        handler.postDelayed(pendingTaskSearch, 180);
    }

    private void populateTasks(JSONObject found, String query) {
        String account = found.optString("accountId");
        if (account.isEmpty()) {
            taskPickerStatus.setText("无法确定当前账号，请重新打开任务选择。");
            return;
        }
        boolean accountChanged = !taskPickerAccountId.isEmpty() && !taskPickerAccountId.equals(account);
        taskPickerAccountId = account;
        taskPickerAccountName = found.optString("accountName", "本地账号");
        taskPickerAccount.setText("当前账号：" + taskPickerAccountName + " · 含子任务与已完成任务");
        pickerSelectedTaskId = "";
        taskChoiceButtons.clear();
        taskPickerList.removeAllViews();
        JSONArray tasks = found.optJSONArray("tasks");
        int count = tasks == null ? 0 : tasks.length();
        for (int i = 0; i < count; i++) {
            JSONObject task = tasks.optJSONObject(i);
            if (task == null || task.optString("id").isEmpty()) continue;
            final String id = task.optString("id");
            final String title = task.optString("title", "未命名任务");
            String status = task.optBoolean("done", false) ? "已完成" : "待完成";
            if (!task.isNull("parentId") && !task.optString("parentId").isEmpty()) status = "子任务 · " + status;
            LinearLayout row = new LinearLayout(this);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(0, dp(8), 0, dp(8));
            row.setMinimumHeight(dp(64));
            RadioButton choice = new RadioButton(this);
            choice.setButtonTintList(ColorStateList.valueOf(ACCENT));
            choice.setTag(id);
            choice.setContentDescription(title + "，" + status);
            taskChoiceButtons.add(choice);
            row.addView(choice, new LinearLayout.LayoutParams(dp(48), dp(48)));
            LinearLayout labels = vertical();
            TextView taskTitle = text(title, 15, INK, false);
            taskTitle.setMaxLines(3);
            labels.addView(taskTitle);
            TextView taskState = text(status, 12, MUTED, false);
            taskState.setPadding(0, dp(5), 0, 0);
            labels.addView(taskState);
            row.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
            View.OnClickListener select = v -> {
                if (taskUpdateBusy) return;
                pickerSelectedTaskId = id;
                for (RadioButton option : taskChoiceButtons) option.setChecked(id.equals(option.getTag()));
                taskPickerStatus.setText("已选择：" + title);
                if (taskDialog != null) taskDialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(!taskUpdateBusy);
            };
            choice.setOnClickListener(select);
            row.setOnClickListener(select);
            taskPickerList.addView(row);
        }
        if (count == 0) taskPickerList.addView(paragraph(query.trim().isEmpty() ? "当前账号暂无任务。可以先独立计时。" : "没有找到匹配的任务，请尝试其他关键词。"));
        taskPickerStatus.setText(accountChanged ? "账号已切换，列表已更新，请重新选择任务。" : found.optBoolean("hasMore", false) ? "仅显示前 100 个结果，请输入更具体的关键词。" : "请选择要关联的任务。已完成任务也可选择。");
    }

    private void savePickedTask(AlertDialog picker) {
        if (taskUpdateBusy || taskDialog != picker || pickerSelectedTaskId.isEmpty() || taskPickerAccountId.isEmpty()) return;
        final String account = taskPickerAccountId;
        final String taskId = pickerSelectedTaskId;
        taskSearchGeneration++;
        if (pendingTaskSearch != null) handler.removeCallbacks(pendingTaskSearch);
        taskUpdateBusy = true;
        picker.setCancelable(false);
        picker.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
        picker.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(false);
        taskSearchInput.setEnabled(false);
        for (RadioButton choice : taskChoiceButtons) choice.setEnabled(false);
        taskPickerStatus.setText("正在核对账号与任务…");
        refreshTimer();
        appLoader.execute(() -> {
            String failure = null;
            try {
                if (destroyed) return;
                PomodoroTimer.setTaskFromSelection(getApplicationContext(), account, taskId);
            } catch (Exception error) { failure = taskFailure(error); }
            final String errorMessage = failure;
            runOnUiThread(() -> {
                if (destroyed) return;
                taskUpdateBusy = false;
                resolvedTaskKey = "";
                refreshTimer();
                if (errorMessage == null) {
                    if (taskDialog == picker && picker.isShowing()) picker.dismiss();
                    refreshCompanion();
                    if (resumed) queueTaskResolution();
                } else if (resumed && taskDialog == picker && picker.isShowing()) {
                    picker.setCancelable(true);
                    picker.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true);
                    taskSearchInput.setEnabled(true);
                    pickerSelectedTaskId = "";
                    taskPickerAccountId = "";
                    taskPickerAccount.setText("请重新读取当前账号");
                    taskPickerStatus.setText(errorMessage + " 请重新选择。");
                    taskPickerList.removeAllViews();
                    Button reload = button("重新加载任务", false);
                    reload.setOnClickListener(v -> queueTaskSearch(taskSearchInput.getText().toString()));
                    taskPickerList.addView(reload, new LinearLayout.LayoutParams(-1, dp(48)));
                } else {
                    deferredTaskMessage = errorMessage + " 请重新选择任务。";
                }
            });
        });
    }

    private void clearTaskAssociation() {
        if (taskUpdateBusy) return;
        taskUpdateBusy = true;
        refreshTimer();
        appLoader.execute(() -> {
            String failure = null;
            try {
                if (destroyed) return;
                JSONObject current = PomodoroTasks.search(getApplicationContext(), "", 1);
                String account = current.optString("accountId");
                if (account.isEmpty()) throw new IllegalStateException("无法确定当前账号");
                PomodoroTimer.setTaskFromSelection(getApplicationContext(), account, null);
            } catch (Exception error) { failure = taskFailure(error); }
            final String errorMessage = failure;
            runOnUiThread(() -> {
                if (destroyed) return;
                taskUpdateBusy = false;
                resolvedTaskKey = "";
                refreshTimer();
                if (errorMessage == null) {
                    refreshCompanion();
                    if (resumed) queueTaskResolution();
                } else if (resumed) showMessage(errorMessage + " 请重试。");
                else deferredTaskMessage = errorMessage + " 请重试。";
            });
        });
    }

    private String taskFailure(Exception error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty() ? "任务关联未保存" : message;
    }

    private void performTimerAction() {
        JSONObject state = snapshot();
        if (state.optBoolean("running", false)) {
            sendTimerCommand("timer-pause");
            return;
        }
        if (state.optBoolean("sessionActive", false) && !state.optBoolean("completed", false)) {
            sendTimerCommand("timer-resume");
            return;
        }
        if ("countdown".equals(selectedMode) && !applyDuration(false)) return;
        hideKeyboard();
        sendTimerCommand("countup".equals(selectedMode) ? "timer-countup" : "timer-countdown");
    }

    private boolean applyDuration(boolean announce) {
        int minutes;
        try { minutes = Integer.parseInt(durationInput.getText().toString().trim()); }
        catch (NumberFormatException error) {
            durationInput.setError("请输入 1 到 180 分钟");
            durationInput.requestFocus();
            return false;
        }
        if (minutes < 1 || minutes > 180) {
            durationInput.setError("时长需为 1 到 180 分钟");
            durationInput.requestFocus();
            return false;
        }
        try {
            PomodoroTimer.get(this).setDurationMinutes(minutes);
            durationDirty = false;
            hideKeyboard();
            refreshTimer();
            if (announce) showMessage("倒计时时长已设为 " + minutes + " 分钟。");
            return true;
        } catch (RuntimeException error) {
            showMessage("无法保存计时时长，请重试。");
            return false;
        }
    }

    private void refreshTimer() {
        if (timerTime == null) return;
        JSONObject state = snapshot();
        boolean running = state.optBoolean("running", false);
        boolean completed = state.optBoolean("completed", false);
        long elapsed = Math.max(0, state.optLong("elapsedMillis", 0));
        boolean hasSession = state.optBoolean("sessionActive", false) || running || completed;
        if (hasSession) selectedMode = state.optString("mode", "countdown");
        int duration = Math.max(1, state.optInt("durationMinutes", 25));
        bindingViews = true;
        modeGroup.check("countup".equals(selectedMode) ? countupMode.getId() : countdownMode.getId());
        if (!durationDirty && !durationInput.hasFocus()) durationInput.setText(String.valueOf(duration));
        bindingViews = false;
        boolean countup = "countup".equals(selectedMode);
        durationRow.setVisibility(countup ? View.GONE : View.VISIBLE);
        countdownMode.setEnabled(!hasSession);
        countupMode.setEnabled(!hasSession);
        durationInput.setEnabled(!hasSession);
        applyDurationButton.setEnabled(!hasSession);
        timerCaption.setText(countup ? "正计时 · 积累专注时间" : "倒计时 · " + duration + " 分钟");
        long display = countup ? elapsed : hasSession ? Math.max(0, state.optLong("remainingMillis", duration * 60000L)) : duration * 60000L;
        timerTime.setText(formatClock(display, !countup));
        timerTime.setContentDescription((countup ? "已专注 " : "剩余 ") + formatSpokenTime(display));
        timerStatus.setText(completed ? "本轮已完成" : running ? "正在专注" : hasSession ? "已暂停" : "准备开始");
        timerAction.setText(running ? "暂停" : completed ? "重新开始" : hasSession ? "继续" : "开始");
        timerReset.setEnabled(hasSession);
        timerReset.setAlpha(hasSession ? 1f : .5f);
        timerModeHint.setText(hasSession ? "重置本轮后，可切换模式或修改时长。" : countup ? "从零开始计时，随时暂停或重置。" : "设置 1–180 分钟，然后开始本轮专注。");
        sessionsToday.setText(String.valueOf(Math.max(0, state.optInt("completedSessionsToday", 0))));
        focusToday.setText(formatFocus(Math.max(0, state.optLong("focusedMillisToday", 0))));
        renderTaskAssociation(state);
    }

    private JSONObject snapshot() {
        try { return PomodoroTimer.get(this).snapshot(); }
        catch (RuntimeException error) { return new JSONObject(); }
    }

    private void sendTimerCommand(String command) {
        try {
            AndroidCompanionService.command(this, command);
            refreshTimer();
            if (resumed) handler.postDelayed(() -> { if (resumed && !destroyed) refreshTimer(); }, 150);
        } catch (RuntimeException error) { showMessage("无法启动或更新后台计时，请重试。"); }
    }

    private void refreshCompanion() {
        try { AndroidCompanionService.refresh(this); }
        catch (RuntimeException error) { showMessage("后台工具暂未启动，请检查系统权限后重试。"); }
    }

    private Set<String> readSet(String key, Set<String> defaults) {
        Set<String> value = preferences.getStringSet(key, defaults);
        return value == null ? new HashSet<>() : new HashSet<>(value);
    }

    private String formatClock(long millis, boolean roundUp) {
        long seconds = roundUp ? (millis + 999) / 1000 : millis / 1000;
        if (seconds >= 3600) return String.format(Locale.ROOT, "%d:%02d:%02d", seconds / 3600, seconds / 60 % 60, seconds % 60);
        return String.format(Locale.ROOT, "%02d:%02d", seconds / 60, seconds % 60);
    }

    private String formatSpokenTime(long millis) {
        long seconds = (millis + 999) / 1000;
        return (seconds / 60) + " 分 " + (seconds % 60) + " 秒";
    }

    private String formatFocus(long millis) {
        long minutes = millis / 60000;
        if (minutes < 60) return minutes + " 分钟";
        return minutes / 60 + " 小时 " + minutes % 60 + " 分";
    }

    private void hideKeyboard() {
        durationInput.clearFocus();
        InputMethodManager manager = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (manager != null) manager.hideSoftInputFromWindow(durationInput.getWindowToken(), 0);
    }

    private LinearLayout vertical() {
        LinearLayout result = new LinearLayout(this);
        result.setOrientation(LinearLayout.VERTICAL);
        return result;
    }

    private LinearLayout card(LinearLayout page) {
        LinearLayout result = vertical();
        result.setPadding(dp(18), dp(18), dp(18), dp(16));
        result.setBackground(surface(Color.WHITE, 18));
        result.setElevation(dp(1));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.bottomMargin = dp(14);
        page.addView(result, params);
        return result;
    }

    private TextView text(String value, float size, int color, boolean bold) {
        TextView result = new TextView(this);
        result.setText(value);
        result.setTextSize(size);
        result.setTextColor(color);
        result.setIncludeFontPadding(false);
        if (bold) result.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return result;
    }

    private TextView paragraph(String value) {
        TextView result = text(value, 13, MUTED, false);
        result.setLineSpacing(dp(3), 1f);
        result.setPadding(0, dp(9), 0, dp(3));
        return result;
    }

    private Switch switchRow(LinearLayout card, String title, String description) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(text(title, 17, INK, true), new LinearLayout.LayoutParams(0, -2, 1));
        Switch result = new Switch(this);
        result.setContentDescription(description);
        result.setMinimumHeight(dp(48));
        result.setMinimumWidth(dp(52));
        row.addView(result, new LinearLayout.LayoutParams(-2, dp(48)));
        card.addView(row);
        row.setOnClickListener(v -> result.setChecked(!result.isChecked()));
        return result;
    }

    private Button actionRow(LinearLayout card, String label, Runnable action) {
        Button result = button(label, false);
        result.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        result.setOnClickListener(v -> action.run());
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, dp(48));
        params.topMargin = dp(10);
        card.addView(result, params);
        return result;
    }

    private Button button(String label, boolean active) {
        Button result = new Button(this);
        result.setText(label);
        result.setTextSize(15);
        result.setAllCaps(false);
        result.setMinimumWidth(0);
        result.setMinWidth(0);
        result.setMinimumHeight(dp(48));
        result.setMinHeight(dp(48));
        result.setPadding(dp(14), dp(6), dp(14), dp(6));
        styleButton(result, active);
        return result;
    }

    private void styleButton(Button button, boolean active) {
        button.setTextColor(active ? Color.WHITE : ACCENT);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(active ? 0x30ffffff : 0x18309bbb), surface(active ? ACCENT : Color.rgb(234, 243, 246), 12), null));
    }

    private GradientDrawable surface(int color, int radius) {
        GradientDrawable result = new GradientDrawable();
        result.setColor(color);
        result.setCornerRadius(dp(radius));
        return result;
    }

    private LinearLayout.LayoutParams weightedButton() { return new LinearLayout.LayoutParams(0, dp(48), 1); }
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void showMessage(String value) {
        if (destroyed) return;
        if (feedback != null) {
            feedback.setText(value);
            feedback.setVisibility(View.VISIBLE);
        }
        Toast.makeText(this, value, Toast.LENGTH_LONG).show();
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        refreshPermissions();
        refreshCompanion();
        handler.removeCallbacks(clockTick);
        handler.post(clockTick);
        queueTaskResolution();
        if (!deferredTaskMessage.isEmpty()) {
            showMessage(deferredTaskMessage);
            deferredTaskMessage = "";
        }
    }

    @Override protected void onPause() {
        resumed = false;
        taskSearchGeneration++;
        taskLinkGeneration++;
        pendingTaskSearch = null;
        if (taskDialog != null) taskDialog.dismiss();
        handler.removeCallbacksAndMessages(null);
        super.onPause();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        showSection("timer".equals(intent.getStringExtra("section")) ? "timer" : "settings");
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        state.putBoolean("pendingOverlay", pendingOverlay);
        state.putString("selectedMode", selectedMode);
        state.putString("section", section);
        super.onSaveInstanceState(state);
    }

    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == NOTIFICATION_REQUEST) {
            refreshPermissions();
            refreshCompanion();
            if (!notificationsAllowed()) showMessage("通知权限尚未开启。计时仍可使用，状态栏通知与完成提醒暂不可见。");
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == OVERLAY_REQUEST) {
            boolean requestedEnable = pendingOverlay;
            boolean granted = Settings.canDrawOverlays(this);
            pendingOverlay = false;
            if (requestedEnable) preferences.edit().putBoolean("ballEnabled", granted).apply();
            refreshPermissions();
            refreshCompanion();
            if (requestedEnable && !granted) showMessage("悬浮窗权限未开启，悬浮球保持关闭。");
        }
    }

    @Override protected void onDestroy() {
        destroyed = true;
        resumed = false;
        handler.removeCallbacksAndMessages(null);
        appLoader.shutdownNow();
        if (appDialog != null) appDialog.dismiss();
        if (taskDialog != null) taskDialog.dismiss();
        super.onDestroy();
    }

    private static final class AppEntry {
        final String label, packageName;
        final Drawable icon;
        AppEntry(String label, String packageName, Drawable icon) {
            this.label = label;
            this.packageName = packageName;
            this.icon = icon;
        }
    }
}
