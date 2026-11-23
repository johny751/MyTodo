import '../../../src/compat.mjs';
import {initAccounts} from '../../../src/accounts.mjs';
import {syncCall} from '../../../src/sync-client.mjs';

// Only RPC marshalling lives here. Event creation/merge and persistence are the
// unchanged production modules and AccountStore/ReplicaDatabase respectively.
const pending = new Map();
let sequence = 0;
document.addEventListener('c003-control-result', event => {
  const result = event.detail;
  const entry = pending.get(result.id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(result.id);
  result.error ? entry.reject(new Error(result.error)) : entry.resolve(result.value);
});

export function nativeControl(input) {
  return new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Android fixture control timed out; no rollback or pass is inferred'));
    }, 90000);
    pending.set(id, {resolve, reject, timer});
    window.ProtocolNative.control(id, JSON.stringify(input));
  });
}

export async function createAndroidAdapter() {
  await initAccounts();
  return {
    platform: 'android',
    call: input => syncCall({op: 'replica', ...input}),
    seed: input => nativeControl({op: 'seed', actor: input.actor}),
    reopen: () => nativeControl({op: 'reopen'}),
    audit: () => nativeControl({op: 'audit'}),
    fault: spec => nativeControl({op: 'fault', mode: !spec.enabled ? 'none' : spec.table === 'entities' ? 'entity-insert' : 'commit-meta', id: spec.id}),
    request: input => nativeControl({op: 'request', request: input}),
    describe: () => nativeControl({op: 'describe'}),
    control: nativeControl,
  };
}

export async function runAndroidEntry(execute) {
  let result;
  try {
    const input = await nativeControl({op: 'input'});
    const adapter = await createAndroidAdapter();
    result = await execute(input, adapter);
  } catch (error) {
    result = {platform: 'android', status: 'failed', error: String(error?.stack || error)};
  }
  await nativeControl({op: 'complete', result});
}
