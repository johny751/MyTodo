package local.gxtodo.replica;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import local.gxtodo.d403preview.NativeTimerStore;

/** Only the separate D408 application can restore its own persisted synthetic session after boot. */
public final class D408BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!"local.gxtodo.d408candidate".equals(context.getPackageName()) || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        PendingResult pending = goAsync();
        try {
            Context app=context.getApplicationContext();
            NativeTimerStore.request(app,"{\"op\":\"snapshot\"}",(state,error)->{
                if(error!=null){android.util.Log.e("D408Boot",error);pending.finish();return;}
                try {
                    D408TimerCompanion.schedule(app,state);
                    if(state.optBoolean("running")||"paused".equals(state.optString("status")))
                        app.startForegroundService(new Intent(app,AndroidCompanionService.class).putExtra("command","refresh"));
                    // Keep the broadcast alive until service startup was requested and any
                    // pending completion delivery/claim returned, rather than merely queued.
                    D408TimerCompanion.deliver(app,state,pending::finish);
                }catch(RuntimeException failure){pending.finish();android.util.Log.e("D408Boot","restore failed; data retained",failure);}
            });
        } catch (RuntimeException failure) { pending.finish(); android.util.Log.e("D408Boot", "restore failed; data retained", failure); }
    }
}
