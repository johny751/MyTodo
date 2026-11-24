import test from 'node:test';
import assert from 'node:assert/strict';
import {createSidecarProbe,shellQuote,verifySidecarProbe} from './sidecar-probe.mjs';

if(process.env.GITHUB_ACTIONS!=='true')throw new Error('D1 project unit tests run only in authorized GitHub Actions jobs');
const nonce='0123456789abcdef0123456789abcdef';
const probe=createSidecarProbe('android-source.sqlite-wal',nonce);
const frame=({state='ABSENT',stat='NA',size='NA',rc='0',token=nonce,path=probe.remotePath}={})=>
  `D1_SIDECAR_BEGIN:${token}\nPATH:${path}\nSTATE:${state}\nSTAT_RC:${stat}\nSIZE:${size}\nPROBE_RC:${rc}\nD1_SIDECAR_END:${token}\n`;
const result=(stdout,options={})=>({exitCode:0,signal:null,spawnError:null,timedOut:false,sizeLimit:false,stdout:Buffer.from(stdout),stderr:Buffer.alloc(0),...options});
const blocked=(packet,pattern=/BLOCKER/)=>assert.throws(()=>verifySidecarProbe(probe,packet),pattern);

test('framed absent proves remote classification independently of host stat rc',()=>{
  const evidence=verifySidecarProbe(probe,result(frame()));
  assert.equal(evidence.allowed,true);assert.equal(evidence.state,'ABSENT');assert.equal(evidence.size,null);
  assert.equal(evidence.remoteStatRc,null);assert.equal(evidence.remoteProbeRc,0);assert.equal(evidence.hostExitCode,0);
  assert.equal(evidence.stdoutBytes,Buffer.byteLength(frame()));assert.match(evidence.stdoutSha256,/^[a-f0-9]{64}$/);
});
test('framed regular present empty file is allowed',()=>{
  const evidence=verifySidecarProbe(probe,result(frame({state:'PRESENT',stat:'0',size:'0'})));
  assert.equal(evidence.allowed,true);assert.equal(evidence.size,0);assert.equal(evidence.remoteStatRc,0);
});
test('framed positive file size remains rejected with its exact evidence',()=>{
  assert.throws(()=>verifySidecarProbe(probe,result(frame({state:'PRESENT',stat:'0',size:'32768'}))),error=>{
    assert.match(error.message,/live nonempty sidecar/);assert.equal(error.evidence.allowed,false);
    assert.equal(error.evidence.size,32768);assert.equal(error.evidence.remoteStatRc,0);return true;
  });
});
test('old host-exit-zero No such file diagnostic has no trusted frame and is rejected',()=>{
  blocked(result("stat: 'files/d1-fixtures/android-source.sqlite-wal': No such file or directory\n"),/frame/);
});
test('missing end frame is rejected',()=>blocked(result(frame().split('D1_SIDECAR_END:')[0]),/frame/));
test('duplicate complete frames are rejected',()=>blocked(result(frame()+frame()),/frame/));
test('wrong nonce frame is rejected',()=>blocked(result(frame({token:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'})),/nonce/));
test('wrong private file path is rejected',()=>blocked(result(frame({path:'files/d1-fixtures/feedback-source.sqlite-wal'})),/path/));
test('remote probe nonzero or ERROR fails even if adb host status is zero',()=>{
  blocked(result(frame({state:'ERROR',stat:'1',size:'NA',rc:'2'})),/remote sidecar probe failed/);
  blocked(result(frame({rc:'1'})),/remote sidecar probe failed/);
});
test('present requires remote stat zero rather than adb host zero',()=>{
  blocked(result(frame({state:'PRESENT',stat:'1',size:'0'})),/successful numeric stat/);
  blocked(result(frame({state:'PRESENT',stat:'NA',size:'0'})),/successful numeric stat/);
});
test('invalid remote codes are rejected',()=>{
  for(const bad of ['-1','256','nope','00'])blocked(result(frame({stat:bad})),/return code/);
  blocked(result(frame({rc:'NA'})),/return code/);
});
test('invalid, fractional, negative and unsafe sizes are rejected',()=>{
  for(const bad of ['-1','1.5','unknown','9007199254740992','00'])blocked(result(frame({state:'PRESENT',stat:'0',size:bad})),/size/);
  blocked(result(frame({state:'PRESENT',stat:'0',size:'NA'})),/numeric stat/);
});
test('nonempty host stderr is retained and rejected despite a complete empty-file frame',()=>{
  assert.throws(()=>verifySidecarProbe(probe,result(frame({state:'PRESENT',stat:'0',size:'0'}),{stderr:Buffer.from('unexpected diagnostic\n')})),error=>{
    assert.match(error.message,/emitted stderr/);assert.equal(error.evidence.completeFrame,true);
    assert.equal(error.evidence.remoteStatRc,0);assert.equal(error.evidence.stderrBytes,22);return true;
  });
});
test('host transport failures cannot be accepted by a valid remote frame',()=>{
  blocked(result(frame(),{exitCode:1}),/host transport/);
  blocked(result(frame(),{exitCode:null,signal:'SIGKILL'}),/host transport/);
  assert.throws(()=>verifySidecarProbe(probe,result(frame(),{timedOut:true})),error=>{
    assert.match(error.message,/timed out/);assert.equal(error.evidence.hostExitCode,0);
    assert.equal(error.evidence.completeFrame,true);assert.equal(error.evidence.timedOut,true);
    assert.equal(error.evidence.allowed,false);return true;
  });
  assert.throws(()=>verifySidecarProbe(probe,result(frame(),{sizeLimit:true})),error=>{
    assert.match(error.message,/size limit/);assert.equal(error.evidence.hostExitCode,0);
    assert.equal(error.evidence.completeFrame,true);assert.equal(error.evidence.sizeLimit,true);
    assert.equal(error.evidence.allowed,false);return true;
  });
});
test('noise and inconsistent absent packets are rejected',()=>{
  blocked(result('unframed diagnostic\n'+frame()),/frame/);
  blocked(result(frame({stat:'0',size:'0'})),/inconsistent absent/);
});
test('fixed filename scope and single-quoted remote script prevent outer shell expansion',()=>{
  assert.throws(()=>createSidecarProbe('../production.sqlite-wal',nonce),/fixed sidecar/);
  assert.throws(()=>createSidecarProbe('android-source.sqlite-wal','bad nonce'),/hex nonce/);
  assert.equal(shellQuote("a'b"),"'a'\\''b'");
  assert.equal(probe.shellArgument,shellQuote(probe.script));
  assert.ok(probe.shellArgument.startsWith("'")&&probe.shellArgument.endsWith("'"));
  assert.ok(probe.script.includes('stat_rc=$?'));assert.ok(probe.script.includes('[ -L "$file" ]'));
  assert.ok(probe.script.includes('[ ! -f "$file" ]'));assert.ok(probe.script.includes('[ ! -d "$namespace" ]'));
});
