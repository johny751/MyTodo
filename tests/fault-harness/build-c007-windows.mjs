import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
if(process.env.GITHUB_ACTIONS!=='true'||process.platform!=='win32')throw Error('C007 build only on GitHub Windows');
const originalPath=path.resolve('tests/protocol-harness/build-windows-protocol.mjs');
const original=await fs.readFile(originalPath,'utf8');
const old='tests/protocol-harness/windows-protocol.c',next='tests/fault-harness/c007-windows-worker.c';
if(original.split(old).length!==4)throw Error('Expected exactly three C0-03 harness path references');
const syncAnchor="const fixtureSync = originalSync.replace(securityMarker, 'WINHTTP_DEFAULT_ACCEPT_TYPES,0');";
if(original.split(syncAnchor).length!==2)throw Error('Reviewed sync-copy anchor changed');
const syncReplacement=`let fixtureSync = originalSync.replace(securityMarker, 'WINHTTP_DEFAULT_ACCEPT_TYPES,0');
const publishAnchor='static int publish(Sync*s,J**m,char**etag,J*p)';
if(fixtureSync.split(publishAnchor).length!==2 || fixtureSync.split('ack(s,p)').length!==3)throw Error('ACK observation seam changed');
fixtureSync=fixtureSync.replaceAll('ack(s,p)','c007_ack_observer(s,p)');
fixtureSync=fixtureSync.replace(publishAnchor,'static int c007_ack_observer(Sync*s,J*p){c007_before_ack_commit();int result=ack(s,p);if(result)c007_after_ack_commit();return result;}\\n'+publishAnchor);
const hostAnchor='WinHttpConnect(s.session,L"dav.jianguoyun.com",INTERNET_DEFAULT_HTTPS_PORT,0)';
if(fixtureSync.split(hostAnchor).length!==2)throw Error('Full sync loopback connection seam changed');
fixtureSync=fixtureSync.replace(hostAnchor,'WinHttpConnect(s.session,L"127.0.0.1",c007_fixture_port(),0)');
fixtureSync='static void c007_before_ack_commit(void);\\nstatic void c007_after_ack_commit(void);\\nstatic unsigned short c007_fixture_port(void);\\n'+fixtureSync;`;
const adapted=original.replaceAll(old,next).replace(syncAnchor,syncReplacement)
 .replace("fixtureTransportDifference:'Only the test copy changes WINHTTP_FLAG_SECURE to 0; native WinHTTP connects to the harness-supplied loopback HTTP fixture.'", "fixtureTransportDifference:'Test copy changes secure transport and the full-sync target to validated loopback, and observes actual ACK return; production SQL and ACK body are unchanged.'"),temporary=path.resolve('tests/protocol-harness/.c007-build-'+randomUUID()+'.mjs');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await fs.writeFile(temporary,adapted,{flag:'wx'});
let code=null;
try{code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[temporary,...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('close',resolve);});}
finally{await fs.unlink(temporary);}
console.log(JSON.stringify({kind:'c007-build-adaptation',originalSha256:sha(original),adaptedSha256:sha(adapted),harnessPathReplacements:3,ackCallObservations:2,ackBodyChanges:0,fullSyncLoopbackHostReplacements:1,exitCode:code}));
process.exitCode=Number.isInteger(code)?code:1;
