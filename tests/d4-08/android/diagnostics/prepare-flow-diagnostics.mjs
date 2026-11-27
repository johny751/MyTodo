import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function prepareFlowDiagnostics(root, work, build) {
  const relative = 'tests/d4-03-platforms/android/local/gxtodo/d403preview/tests/NativeFlowLifecycleChecks.java';
  const directory = 'tests/d4-08/android/diagnostics';
  const original = await fs.readFile(path.join(root, relative));
  let generated = original.toString('utf8');
  const insertions = [];
  function replaceOnce(before, after, reason) {
    if (generated.split(before).length !== 2) throw Error('Frozen flow diagnostic seam changed: ' + reason);
    generated = generated.replace(before, after);
    insertions.push({reason, occurrences: 1, before, after, beforeSHA256: hash(before), afterSHA256: hash(after)});
  }
  replaceOnce('Case(NativeWorkLifecycleChecks.Host h){this.h=h;}',
    'final D408FlowInputDiagnostics passiveInput;\n        Case(NativeWorkLifecycleChecks.Host h){this.h=h;this.passiveInput=new D408FlowInputDiagnostics(h);}', 'Case-local observer ownership');
  replaceOnce('void beginTrace() throws Exception{h.js(', 'void beginTrace() throws Exception{passiveInput.begin();h.js(', 'Install once per original trace segment');
  replaceOnce('void flushTrace() throws Exception{Object trace=', 'void flushTrace() throws Exception{passiveInput.flush();Object trace=', 'Dispose before original recreate and cleanup');
  replaceOnce('h.tap(action(action,id));require(events(',
    'passiveInput.sample("before-native-tap",action(action,id));try{h.tap(action(action,id));}finally{passiveInput.sample("after-native-tap",null);}require(events(', 'Bracket one original tap without changing assertion or input count');
  let restored = generated;
  for (const row of [...insertions].reverse()) {
    if (restored.split(row.after).length !== 2) throw Error('Generated diagnostic insertion is not reversible');
    restored = restored.replace(row.after, row.before);
  }
  if (!Buffer.from(restored).equals(original)) throw Error('Generated flow differs beyond declared insertions');
  const observerFile = directory + '/flow-input-observer.js', helperFile = directory + '/D408FlowInputDiagnostics.java';
  const observer = await fs.readFile(path.join(root, observerFile)), template = await fs.readFile(path.join(root, helperFile));
  const token = '__D408_FLOW_OBSERVER_SCRIPT__';
  if (template.toString('utf8').split(token).length !== 2) throw Error('Observer Java template token must occur once');
  const helper = template.toString('utf8').replace(token, JSON.stringify(observer.toString('utf8')));
  const generatedPath = path.join(work, 'NativeFlowLifecycleChecks.java'), helperPath = path.join(work, 'D408FlowInputDiagnostics.java');
  await fs.writeFile(generatedPath, generated); await fs.writeFile(helperPath, helper);
  const sourceList = path.join(work, 'flow-diagnostics-source-list.mjs');
  await fs.writeFile(sourceList, `import fs from 'node:fs/promises';\nconst file=process.argv[2], original=${JSON.stringify(relative)}, generated=${JSON.stringify(generatedPath)}, helper=${JSON.stringify(helperPath)};\nconst text=await fs.readFile(file,'utf8'), rows=text.trimEnd().split('\\n');\nif(rows.filter(x=>x===original).length!==1||rows.includes(generated)||rows.includes(helper))throw Error('D408 flow diagnostic source-list replacement must occur exactly once');\nawait fs.writeFile(file,rows.map(x=>x===original?generated:x).concat(helper).join('\\n')+'\\n');\nawait fs.writeFile(file+'.d408-flow-replacement.json',JSON.stringify({original,generated,helper,originalOccurrences:1,replacementOccurrences:1,originalInputCount:rows.length,generatedInputCount:rows.length+1},null,2)+'\\n');\n`);
  const seam = `find tests/d4-03-platforms/android -name '*.java' -print > "$out/test-java-sources.txt"`;
  if (build.split(seam).length !== 2) throw Error('Frozen build source-list seam changed');
  const quote = s => "'" + s.replace(/'/g, "'\\''") + "'";
  const replacement = seam + '\nnode ' + quote(sourceList) + ' "$out/test-java-sources.txt"';
  build = build.replace(seam, replacement);
  const receipt = {sourceSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    original: {path: relative, sha256: hash(original)}, generated: {path: generatedPath, sha256: hash(generated)},
    observer: {path: observerFile, sha256: hash(observer)}, helperTemplate: {path: helperFile, sha256: hash(template)},
    generatedHelper: {path: helperPath, sha256: hash(helper)}, sourceListAdapter: {path: sourceList, sha256: hash(await fs.readFile(sourceList))},
    insertions, buildInsertion: {before: seam, after: replacement, occurrences: 1}, reverseRestorationExact: true,
    originalFilesModified: false, originalAssertionsChanged: false, originalInputCallsChanged: false,
    retryAdded: false, originalWaitDurationsChanged: false, observerAddsRuntimeOverhead: true};
  await fs.writeFile(path.join(work, 'flow-diagnostics-generation-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  return {build, receipt};
}
