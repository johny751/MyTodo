import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const probeScript = `file=$1
token=$2
report() { printf 'MYTODO_FILE_V1 %s %s %s %s %s\\n' "$token" "$1" "$2" "$3" "$4"; }
if [ -L "$file" ]; then report unavailable symbolic-link - -; exit 0; fi
if [ ! -e "$file" ]; then
  parent=\${file%/*}
  if [ -d "$parent" ] && [ -r "$parent" ] && [ -x "$parent" ]; then report unavailable missing - -
  else report unavailable parent-unavailable - -; fi
  exit 0
fi
if [ ! -f "$file" ]; then report unavailable not-regular - -; exit 0; fi
if [ ! -r "$file" ]; then report unavailable unreadable - -; exit 0; fi
size=$(wc -c < "$file")
size_rc=$?
if [ "$size_rc" -ne 0 ]; then report unavailable size-failed "$size_rc" -; exit 0; fi
digest=$(sha256sum "$file")
digest_rc=$?
if [ "$digest_rc" -ne 0 ]; then report unavailable hash-failed "$digest_rc" -; exit 0; fi
digest=\${digest%% *}
report available regular-readable "$size" "$digest"
`;

function validate(packageName, remote, name) {
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) throw Error('Invalid evidence package');
  if (!/^files\/[A-Za-z0-9_./-]{1,240}$/.test(remote) || remote.split('/').some(part => !part || part === '.' || part === '..')) {
    throw Error('Invalid app-private evidence path');
  }
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(name) || name === '.' || name === '..') throw Error('Invalid evidence filename');
}

export function probeCommand(packageName, remote, token) {
  validate(packageName, remote, 'probe');
  if (!/^[a-f0-9]{32}$/.test(token)) throw Error('Invalid evidence nonce');
  // One fixed script with separately quoted, constrained arguments. No case data is code.
  return ['shell', '-T', ['run-as', shellQuote(packageName), 'sh', '-c', shellQuote(probeScript),
    'mytodo-file-probe', shellQuote(remote), shellQuote(token)].join(' ')];
}

function completed(result) {
  return result && result.code === 0 && !result.signal && !result.timedOut && !result.hardKill &&
    !result.spawnError && !result.stdinError && result.processClosed !== false;
}

function commandReceipt(result) {
  if (!result) return {exitCode:null, transportCompleted:false};
  const bytes = result.bytes ?? Buffer.from(result.stdout || '');
  return {exitCode:result.code,signal:result.signal ?? null,timedOut:!!result.timedOut,hardKill:!!result.hardKill,
    spawnError:result.spawnError || null,stdinError:result.stdinError || null,processClosed:result.processClosed,
    transportCompleted:!!completed(result),stdoutBytes:bytes.length,stdoutSha256:sha256(bytes),
    stderr:result.stderr || '',stderrSha256:sha256(Buffer.from(result.stderr || '')),
    log:result.log,logSha256:result.logSha256};
}

function parseProbe(result, token) {
  const receipt = {command:commandReceipt(result),valid:false};
  if (!completed(result) || result.stderr?.trim()) return {...receipt,reason:'probe-command-failed'};
  const text = result.stdout ?? result.bytes?.toString('utf8') ?? '';
  const lines = text.trim().split(/\r?\n/);
  const fields = lines.length === 1 ? lines[0].trim().split(/\s+/) : [];
  if (fields.length !== 6 || fields[0] !== 'MYTODO_FILE_V1' || fields[1] !== token) return {...receipt,reason:'invalid-probe-receipt'};
  if (fields[2] === 'unavailable' && /^[a-z-]+$/.test(fields[3])) {
    return {...receipt,valid:true,state:'unavailable',reason:fields[3],detail:fields.slice(4)};
  }
  if (fields[2] !== 'available' || fields[3] !== 'regular-readable' || !/^(0|[1-9][0-9]*)$/.test(fields[4]) || !/^[a-f0-9]{64}$/.test(fields[5])) {
    return {...receipt,reason:'invalid-probe-receipt'};
  }
  const bytes = Number(fields[4]);
  if (!Number.isSafeInteger(bytes)) return {...receipt,reason:'invalid-remote-size'};
  return {...receipt,valid:true,state:'available',exists:true,regular:true,readable:true,bytes,sha256:fields[5]};
}

async function saveRejectedCapture(directory, name, result) {
  if (!result) return null;
  const diagnostics = path.join(directory, 'diagnostics');
  await fs.mkdir(diagnostics, {recursive:true});
  const bytes = result.bytes ?? Buffer.from(result.stdout || '');
  const stdoutPath = path.join(diagnostics, name + '.stdout.bin');
  const stderrPath = path.join(diagnostics, name + '.stderr.txt');
  await fs.writeFile(stdoutPath, bytes, {flag:'wx'});
  await fs.writeFile(stderrPath, result.stderr || '', {flag:'wx'});
  return {stdoutPath,stdoutBytes:bytes.length,stdoutSha256:sha256(bytes),stderrPath,
    stderrSha256:sha256(Buffer.from(result.stderr || '')),semantics:'Unverified transport bytes; not a preserved database or sidecar'};
}

export async function captureRemoteFile({packageName, remote, name, directory, observe, selected,
  sqlite = false, maximumBytes = 128 * 1024 * 1024}) {
  validate(packageName, remote, name);
  const item = {remote,state:'unavailable',verification:'remote-before/transfer/remote-after',sqliteHeaderRequired:sqlite};
  let captured;
  try {
    const beforeToken = crypto.randomBytes(16).toString('hex');
    const before = await observe('probe-before-' + name, selected(...probeCommand(packageName, remote, beforeToken)));
    item.before = parseProbe(before, beforeToken);
    if (!item.before.valid || item.before.state !== 'available') {
      item.reason = item.before.reason;
      return item;
    }
    if (item.before.bytes > maximumBytes) { item.reason = 'evidence-size-limit'; return item; }
    captured = await observe('file-' + name, selected('exec-out','run-as',packageName,'cat',remote), {binary:true});
    item.transfer = commandReceipt(captured);
    const afterToken = crypto.randomBytes(16).toString('hex');
    const after = await observe('probe-after-' + name, selected(...probeCommand(packageName, remote, afterToken)));
    item.after = parseProbe(after, afterToken);
    const bytes = captured?.bytes;
    const stable = item.after.valid && item.after.state === 'available' &&
      item.after.bytes === item.before.bytes && item.after.sha256 === item.before.sha256;
    const matches = Buffer.isBuffer(bytes) && bytes.length === item.before.bytes && sha256(bytes) === item.before.sha256;
    item.sourceStable = !!stable; item.transferMatchesRemote = !!matches;
    if (!completed(captured) || captured.stderr?.trim()) item.reason = 'copy-command-failed';
    else if (!stable) item.reason = 'remote-source-changed-or-unavailable';
    else if (!matches) item.reason = 'copy-size-or-sha256-mismatch';
    else if (sqlite && (bytes.length < 100 || !bytes.subarray(0,16).equals(Buffer.from('SQLite format 3\0')))) item.reason = 'invalid-sqlite-header';
    if (item.reason) { item.diagnostic = await saveRejectedCapture(directory, name, captured); return item; }
    const destination = path.join(directory,name);
    await fs.writeFile(destination,bytes,{flag:'wx'});
    const stored = await fs.readFile(destination);
    if (stored.length !== bytes.length || sha256(stored) !== item.before.sha256) throw Error('Local evidence file differs after write');
    Object.assign(item,{state:'preserved',path:destination,bytes:stored.length,sha256:sha256(stored),
      localReadbackVerified:true,sqliteHeaderValid:sqlite ? true : undefined});
    return item;
  } catch (error) {
    item.reason = 'capture-error'; item.error = String(error);
    if (captured && !item.diagnostic) {
      try { item.diagnostic = await saveRejectedCapture(directory,name,captured); }
      catch (diagnosticError) { item.diagnosticError = String(diagnosticError); }
    }
    return item;
  }
}
