// Read-only private fixture probe. Host adb status is never remote stat status.
import crypto from 'node:crypto';

const DATABASES=['android-source.sqlite','feedback-source.sqlite','feedback-validation.sqlite'];
const ALLOWED=new Set(DATABASES.flatMap(name=>['-wal','-shm','-journal'].map(suffix=>name+suffix)));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const buffer=value=>Buffer.isBuffer(value)?value:Buffer.from(value??'','utf8');

export function shellQuote(value) {
  if(typeof value!=='string'||value.includes('\0'))throw new Error('BLOCKER: invalid shell argument');
  return "'"+value.replaceAll("'","'\\''")+"'";
}

export function createSidecarProbe(fileName,nonce=crypto.randomBytes(16).toString('hex')) {
  if(!ALLOWED.has(fileName)||!/^[a-f0-9]{32}$/.test(nonce))throw new Error('BLOCKER: fixed sidecar name and hex nonce required');
  const remotePath='files/d1-fixtures/'+fileName;
  // This entire script is passed as one single-quoted sh -c argument because
  // adb exec-out joins argv into an outer Android shell command.
  const script=[
    'namespace=files/d1-fixtures',
    'file='+shellQuote(remotePath),
    'nonce='+shellQuote(nonce),
    'state=ERROR', 'stat_rc=NA', 'size=NA', 'probe_rc=2',
    'printf \'%s\\n\' "D1_SIDECAR_BEGIN:$nonce"',
    'if [ ! -d files ] || [ -L files ] || [ ! -x files ] || [ ! -d "$namespace" ] || [ -L "$namespace" ] || [ ! -x "$namespace" ]; then',
    '  state=ERROR',
    'elif [ -L "$file" ]; then',
    '  state=ERROR',
    'elif [ ! -e "$file" ]; then',
    '  state=ABSENT; probe_rc=0',
    'elif [ ! -f "$file" ]; then',
    '  state=ERROR',
    'else',
    '  size=$(stat -c %s "$file")',
    '  stat_rc=$?',
    '  if [ "$stat_rc" -eq 0 ]; then',
    '    case "$size" in',
    '      \'\'|*[!0-9]*) printf \'unexpected stat stdout: %s\\n\' "$size" >&2; size=NA ;;',
    '      *) state=PRESENT; probe_rc=0 ;;',
    '    esac',
    '  else',
    '    if [ -n "$size" ]; then printf \'failed stat stdout: %s\\n\' "$size" >&2; fi',
    '    size=NA',
    '  fi',
    'fi',
    'printf \'%s\\n\' "PATH:$file" "STATE:$state" "STAT_RC:$stat_rc" "SIZE:$size" "PROBE_RC:$probe_rc" "D1_SIDECAR_END:$nonce"',
    'exit "$probe_rc"',
  ].join('\n');
  return {fileName,remotePath,nonce,script,shellArgument:shellQuote(script),scriptSha256:digest(Buffer.from(script,'utf8'))};
}

function reject(reason,evidence) {
  evidence.allowed=false;evidence.rejectionReason=reason;
  const error=new Error('BLOCKER: '+reason);error.evidence=evidence;throw error;
}
function remoteRc(text,allowNA=false) {
  if(allowNA&&text==='NA')return null;
  if(!/^(?:0|[1-9][0-9]{0,2})$/.test(text)||Number(text)>255)return undefined;
  return Number(text);
}

export function verifySidecarProbe(probe,result) {
  if(!probe||!ALLOWED.has(probe.fileName)||probe.remotePath!=='files/d1-fixtures/'+probe.fileName||!/^[a-f0-9]{32}$/.test(probe.nonce))
    throw new Error('BLOCKER: invalid expected sidecar probe identity');
  const stdout=buffer(result.stdout),stderr=buffer(result.stderr);
  const evidence={fileName:probe.fileName,remotePath:probe.remotePath,nonce:probe.nonce,scriptSha256:probe.scriptSha256,
    hostExitCode:result.exitCode??null,hostSignal:result.signal??null,spawnError:result.spawnError??null,
    timedOut:!!result.timedOut,sizeLimit:!!result.sizeLimit,
    stdoutBytes:stdout.length,stderrBytes:stderr.length,stdoutSha256:digest(stdout),stderrSha256:digest(stderr),
    completeFrame:false,state:null,remoteStatRc:null,remoteProbeRc:null,size:null,allowed:false};
  // Parsing never changes the saved raw output; CRLF normalization is only for
  // the framed text decoder. Noise, duplicate packets and diagnostics fail closed.
  let text=stdout.toString('utf8').replaceAll('\r\n','\n');
  if(text.endsWith('\n'))text=text.slice(0,-1);
  const lines=text.split('\n');
  if(lines.length!==7||lines[0]!=='D1_SIDECAR_BEGIN:'+probe.nonce||lines[6]!=='D1_SIDECAR_END:'+probe.nonce)
    reject('missing, duplicate, noisy or wrong-nonce sidecar frame',evidence);
  const prefixes=['PATH:','STATE:','STAT_RC:','SIZE:','PROBE_RC:'];
  const values=[];
  for(let i=0;i<prefixes.length;i++) {
    if(!lines[i+1].startsWith(prefixes[i]))reject('malformed sidecar frame field',evidence);
    values.push(lines[i+1].slice(prefixes[i].length));
  }
  const [remotePath,state,statText,sizeText,probeText]=values;
  Object.assign(evidence,{stateText:state,statRcText:statText,sizeText,probeRcText:probeText});
  if(remotePath!==probe.remotePath)reject('sidecar frame path identity mismatch',evidence);
  if(!['ABSENT','PRESENT','ERROR'].includes(state))reject('unknown remote sidecar state',evidence);
  const statRc=remoteRc(statText,true),probeRc=remoteRc(probeText);
  if(statRc===undefined||probeRc===undefined)reject('invalid remote sidecar return code',evidence);
  Object.assign(evidence,{completeFrame:true,state,remoteStatRc:statRc,remoteProbeRc:probeRc});
  if(sizeText!=='NA') {
    if(!/^(?:0|[1-9][0-9]*)$/.test(sizeText)||!Number.isSafeInteger(Number(sizeText)))reject('invalid or unsafe remote sidecar size',evidence);
    evidence.size=Number(sizeText);
  }
  if(evidence.timedOut)reject('sidecar probe timed out',evidence);
  if(evidence.sizeLimit)reject('sidecar probe exceeded stdout size limit',evidence);
  if(result.exitCode!==0||result.signal||result.spawnError)reject('sidecar probe host transport failed',evidence);
  if(stderr.length)reject('sidecar probe emitted stderr',evidence);
  if(probeRc!==0||state==='ERROR')reject('remote sidecar probe failed',evidence);
  if(state==='ABSENT') {
    if(statText!=='NA'||sizeText!=='NA')reject('inconsistent absent sidecar frame',evidence);
  } else {
    if(statRc!==0||sizeText==='NA')reject('present sidecar has no successful numeric stat result',evidence);
    if(evidence.size!==0)reject('live nonempty sidecar at capture',evidence);
  }
  evidence.allowed=true;return evidence;
}
