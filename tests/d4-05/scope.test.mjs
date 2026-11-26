import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.EXPECTED_SOURCE_SHA!==process.env.GITHUB_SHA||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==process.env.GITHUB_SHA)throw Error('Actions-only exact source checks');
test('D4-03 native source/test identity and formal storage/sync implementations remain exact',async()=>{
  const frozen=JSON.parse(await fs.readFile('tests/d4-05/frozen-baseline.json','utf8'));
  assert.equal(frozen.sourceSHA,'9fe8824754af4e8b541f3550e677564183fa7c1f');
  for(const item of frozen.files)assert.equal(crypto.createHash('sha256').update(await fs.readFile(item.path)).digest('hex'),item.sha256,item.path);
});
test('D4-05 has separate identity and explicit native-only permissions',async()=>{
  const manifest=await fs.readFile('android/d405/AndroidManifest.xml','utf8');
  assert.match(manifest,/package="local\.gxtodo\.d405candidate"/);
  const actual=[...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(x=>x[1]).sort();
  assert.deepEqual(actual,['POST_NOTIFICATIONS','FOREGROUND_SERVICE','FOREGROUND_SERVICE_SPECIAL_USE','SCHEDULE_EXACT_ALARM'].map(x=>'android.permission.'+x).sort());
  assert.match(manifest,/android:name="local\.gxtodo\.replica\.AndroidCompanionService"/);
  assert.doesNotMatch(manifest,/INTERNET|BOOT_COMPLETED|READ_EXTERNAL_STORAGE|SYSTEM_ALERT_WINDOW|PACKAGE_USAGE_STATS/);
});
