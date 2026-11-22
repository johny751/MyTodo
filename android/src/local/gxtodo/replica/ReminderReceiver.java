package local.gxtodo.replica;
import android.content.*;
public final class ReminderReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context context,Intent intent){try{String action=intent.getAction();if("local.gxtodo.SNOOZE".equals(action)){if(!AccountStore.get(context).active().equals(intent.getStringExtra("accountId")))return;String key=intent.getStringExtra("key");if(key!=null){context.getSharedPreferences(AccountStore.reminderPrefs(context),Context.MODE_PRIVATE).edit().putLong(key,System.currentTimeMillis()+600000).commit();ReminderScheduler.manager(context).cancel(intent.getStringExtra("taskId"),1);}ReminderScheduler.refresh(context);}else if("local.gxtodo.REMIND".equals(action))ReminderScheduler.fire(context);else ReminderScheduler.refresh(context);TodoWidget.refresh(context);AndroidCompanionService.refresh(context);}catch(Exception e){android.util.Log.e("GxTodoReminder","Cannot read account",e);}}
}
