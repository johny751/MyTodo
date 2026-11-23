package local.gxtodo.replica;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Bundle;
import org.json.JSONObject;

/** Framework-only instrumentation; no JUnit, Robolectric or SQLite shadow. */
public final class ProtocolHarnessInstrumentation extends Instrumentation {
    private Bundle arguments;

    @Override public void onCreate(Bundle input) {
        arguments = input == null ? new Bundle() : new Bundle(input);
        start();
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            String packageName = getTargetContext().getPackageName();
            if (!"local.gxtodo.protocolharness".equals(packageName)) {
                throw new IllegalStateException("Refusing to run in the production package");
            }
            Intent intent = new Intent(Intent.ACTION_MAIN)
                .setComponent(new ComponentName(packageName, ProtocolHarnessActivity.class.getName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            for (String key : new String[]{"caseId", "requestName", "resultName"}) {
                String value = arguments.getString(key);
                if (value != null) intent.putExtra(key, value);
            }
            ProtocolHarnessActivity.prepareResult();
            Activity activity = startActivitySync(intent);
            JSONObject output = ProtocolHarnessActivity.awaitResult(180000);
            // Keep bulk audit data in the existing atomic result file to avoid
            // Android's Binder transaction size limit for instrumentation bundles.
            result.putString("status", output.optString("status"));
            result.putString("resultFile", ((ProtocolHarnessActivity)activity).resultFile());
            finish("passed".equals(output.optString("status")) ? Activity.RESULT_OK : 1, result);
        } catch (Throwable error) {
            result.putString("error", error.getClass().getName() + ": " + error.getMessage());
            finish(1, result);
        }
    }
}
