package local.gxtodo.replica;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Insets;
import android.os.Build;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.WindowInsets;
import android.view.inspector.WindowInspector;
import java.util.Map;
import java.util.WeakHashMap;

/** Candidate-only system-bar adaptation for the pinned library's image dialog. */
public final class D408FeedbackInsets {
    private static final Map<Activity, Attachment> attached = new WeakHashMap<>();

    public static void onActivityCreated(Activity activity) {
        // Edge-to-edge is enforced for this target on API 35+. Earlier releases
        // keep the original library layout and never load newer window APIs.
        if (Build.VERSION.SDK_INT < 35 ||
                !"com.androidshared.feedback.FeedbackActivity".equals(activity.getClass().getName()) ||
                attached.containsKey(activity)) return;
        Attachment attachment = new Attachment(activity);
        attached.put(activity, attachment);
        attachment.start();
    }

    public static void onActivityDestroyed(Activity activity) {
        Attachment attachment = attached.remove(activity);
        if (attachment != null) attachment.close();
    }

    private static Activity owner(Context context) {
        for (int depth = 0; context != null && depth < 12; depth++) {
            if (context instanceof Activity) return (Activity) context;
            if (!(context instanceof ContextWrapper)) return null;
            Context next = ((ContextWrapper) context).getBaseContext();
            if (next == context) return null;
            context = next;
        }
        return null;
    }

    private static final class Attachment implements ViewTreeObserver.OnWindowFocusChangeListener,
            View.OnAttachStateChangeListener, Runnable {
        final Activity activity;
        final View decor;
        final Map<View, int[]> adapted = new WeakHashMap<>();
        ViewTreeObserver observer;
        boolean closed;
        int remainingFrames;

        Attachment(Activity activity) {
            this.activity = activity;
            decor = activity.getWindow().getDecorView();
        }

        void start() {
            decor.addOnAttachStateChangeListener(this);
            observeFocus();
            schedule();
        }

        void observeFocus() {
            if (observer != null && observer.isAlive()) observer.removeOnWindowFocusChangeListener(this);
            observer = decor.getViewTreeObserver();
            if (observer.isAlive()) observer.addOnWindowFocusChangeListener(this);
        }

        void schedule() {
            decor.removeCallbacks(this);
            remainingFrames = 10;
            if (!closed) decor.post(this);
        }

        @Override public void onWindowFocusChanged(boolean focused) { schedule(); }
        @Override public void onViewAttachedToWindow(View view) { observeFocus(); schedule(); }
        @Override public void onViewDetachedFromWindow(View view) { decor.removeCallbacks(this); }

        @Override public void run() {
            if (closed || activity.isDestroyed() || activity.isFinishing()) return;
            boolean found = false;
            for (View root : WindowInspector.getGlobalWindowViews()) {
                if (root == decor || !root.isAttachedToWindow()) continue;
                View button = root.findViewWithTag("feedback_close_image");
                if (button == null || owner(button.getContext()) != activity) continue;
                View content = root.findViewById(android.R.id.content);
                if (!(content instanceof ViewGroup) || !inside(button, content)) continue;
                found = true;
                if (adapted.containsKey(content)) continue;
                int[] base = {content.getPaddingLeft(), content.getPaddingTop(),
                        content.getPaddingRight(), content.getPaddingBottom()};
                adapted.put(content, base);
                content.setOnApplyWindowInsetsListener((view, insets) -> {
                    Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    view.setPadding(base[0] + safe.left, base[1] + safe.top,
                            base[2] + safe.right, base[3] + safe.bottom);
                    return WindowInsets.CONSUMED;
                });
                WindowInsets initial = root.getRootWindowInsets();
                if (initial != null) content.dispatchApplyWindowInsets(initial);
                content.requestApplyInsets();
            }
            // Focus loss can precede the dialog's attach callback. Retry only
            // for a bounded few frames; external picker windows are never changed.
            if (!found && !decor.hasWindowFocus() && --remainingFrames > 0) decor.postOnAnimation(this);
        }

        boolean inside(View child, View parent) {
            for (View view = child; view != null; ) {
                if (view == parent) return true;
                view = view.getParent() instanceof View ? (View) view.getParent() : null;
            }
            return false;
        }

        void close() {
            closed = true;
            decor.removeCallbacks(this);
            decor.removeOnAttachStateChangeListener(this);
            if (observer != null && observer.isAlive()) observer.removeOnWindowFocusChangeListener(this);
            for (View content : adapted.keySet()) content.setOnApplyWindowInsetsListener(null);
            adapted.clear();
        }
    }

    private D408FeedbackInsets() {}
}
