import {runAndroidEntry} from './tests/protocol-harness/android/android-adapter.mjs';
import {executeCase, normalizeAudit} from './tests/protocol-harness/shared-executor.mjs';
import {__c003Internals} from './src/.c003-delta-adapter.mjs';

await runAndroidEntry(async (input, adapter) => {
  const metadata = await (await fetch('./build-metadata.json')).json();
  if (input.mode === 'report') {
    return {
      schema: 'mytodo-protocol-harness-restart-report', version: 1,
      platform: 'android', caseId: input.caseId, mode: 'report',
      status: 'passed', raw: normalizeAudit(await adapter.audit()),
      provenance: {...metadata, ...input.provenance, runtime: await adapter.describe()},
    };
  }
  return executeCase({
    ...input, ...adapter, platform: 'android', delta: __c003Internals,
    provenance: {...metadata, ...input.provenance, runtime: await adapter.describe()},
  });
});
