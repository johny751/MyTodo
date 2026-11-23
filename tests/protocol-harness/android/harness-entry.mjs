import {runAndroidEntry} from './tests/protocol-harness/android/android-adapter.mjs';
import {executeCase} from './tests/protocol-harness/shared-executor.mjs';
import {__c003Internals} from './src/c003-delta-adapter.mjs';

await runAndroidEntry(async (input, adapter) => {
  const metadata = await (await fetch('./build-metadata.json')).json();
  if (input.provenance?.sourceSha && input.provenance.sourceSha !== metadata.sourceSha) {
    throw new Error('Installed test APK source SHA differs from the case runner SHA');
  }
  const provenance = {...metadata, runtime: await adapter.describe()};
  if (input.mode === 'report') {
    return {
      schema: 'mytodo-protocol-harness-restart-report', version: 1,
      platform: 'android', caseId: input.caseId, mode: 'report',
      status: 'passed', raw: await adapter.audit(), provenance,
    };
  }
  return executeCase({
    ...input, ...adapter, platform: 'android', delta: __c003Internals,
    provenance,
  });
});
