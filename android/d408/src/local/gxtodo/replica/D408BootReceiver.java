package local.gxtodo.replica;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Only the separate D408 application can restore its own persisted synthetic session after boot. */
public final class D408BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!"local.gxtodo.d408candidate".equals(context.getPackageName()) || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        PendingResult pending = goAsync();
        try {
            D408TimerCompanion.wake(context, () -> {
                try { new D408Integration().command(context, "refresh"); }
                finally { pending.finish(); }
            });
        } catch (RuntimeException failure) { pending.finish(); android.util.Log.e("D408Boot", "restore failed; data retained", failure); }
    }
}
