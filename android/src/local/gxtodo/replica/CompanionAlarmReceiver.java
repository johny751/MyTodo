package local.gxtodo.replica;
import android.content.*;
public final class CompanionAlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        AndroidCompanionService.wake(context);
    }
}
