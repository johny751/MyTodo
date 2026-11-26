package local.gxtodo.replica;

import android.app.Activity;
import android.app.Service;
import android.content.Context;
import android.content.Intent;

/** Optional candidate seam. The released application id never loads this profile. */
final class NativeIntegration {
    interface Companion {
        int start(Intent intent, int flags, int startId);
        boolean isClosed();
        void close();
    }
    interface Adapter {
        void open(Activity activity);
        void command(Context context, String command);
        void wake(Context context, Runnable finished);
        void execute(Runnable operation);
        Companion create(Service service);
    }
    private static Adapter adapter;
    static boolean enabled(Context context) {
        return "local.gxtodo.d405candidate".equals(context.getPackageName());
    }
    static synchronized Adapter adapter(Context context) {
        if (!enabled(context)) return null;
        if (adapter == null) {
            try {
                adapter = (Adapter) Class.forName("local.gxtodo.replica.D405Integration")
                    .getDeclaredConstructor().newInstance();
            } catch (ReflectiveOperationException failure) {
                // Never fall back to the old timer and create a second authority.
                throw new IllegalStateException("D4-05 native profile is incomplete", failure);
            }
        }
        return adapter;
    }
    private NativeIntegration() {}
}
