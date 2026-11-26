package local.gxtodo.replica;
import android.content.*;
public final class CompanionAlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (NativeIntegration.enabled(context)) {
            final PendingResult pending = goAsync();
            try { NativeIntegration.adapter(context).wake(context, pending::finish); }
            catch (RuntimeException failure) { pending.finish(); throw failure; }
            return;
        }
        AndroidCompanionService.wake(context);
    }
}
