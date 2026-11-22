const fs = require('node:fs/promises');
const {existsSync} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const {spawn} = require('node:child_process');
const root = path.resolve(existsSync(path.join(__dirname, 'server.mjs')) ? __dirname : path.join(__dirname, '..'));
const isWindows = process.platform === 'win32';
const localRoot = process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), '.local', 'share');
const dataDir = path.resolve(process.env.GXTODO_DATA_DIR || path.join(localRoot, 'GxTodoWeb', 'data'));
const runtimeDir = path.resolve(process.env.GXTODO_RUNTIME_DIR || path.join(localRoot, 'GxTodoWeb', 'runtime'));
const key = crypto.createHash('sha256').update(isWindows ? root.toLowerCase() : root).digest('hex').slice(0, 16);
const stateFile = path.join(runtimeDir, 'server-' + key + '.json');
const dataKey = crypto.createHash('sha256').update(isWindows ? dataDir.toLowerCase() : dataDir).digest('hex').slice(0, 16);
const lockFile = path.join(runtimeDir, 'data-' + dataKey + '.lock');
const samePath = (a, b) => typeof a === 'string' && typeof b === 'string' && (isWindows ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));
const validPort = port => Number.isInteger(port) && port >= 1024 && port <= 65535;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function running(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; } }
async function health(port) {
 if (!validPort(port)) return null;
 try {
  const response = await fetch('http://127.0.0.1:' + port + '/api/health', {signal: AbortSignal.timeout(700)});
  if (!response.ok) { await response.body?.cancel(); return null; }
  const result = await response.json();
  return result.app === 'gxtodo-local' && Number.isInteger(result.pid) && result.pid > 0 && typeof result.dataDir === 'string' ? result : null;
 } catch { return null; }
}
async function stored() { try { return JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch { return null; } }
function owns(state, current) { return state && current && samePath(state.installRoot, root) && current.pid === state.pid && samePath(current.dataDir, state.dataDir) && (!current.installRoot || samePath(current.installRoot, root)); }
async function withLock(action) {
 await fs.mkdir(runtimeDir, {recursive: true});
 let handle;
 for (let attempt = 0; attempt < 300; attempt++) {
  try { handle = await fs.open(lockFile, 'wx', 0o600); await handle.writeFile(JSON.stringify({pid: process.pid})); break; }
  catch (error) {
   if (error.code !== 'EEXIST') throw error;
   try {
    const lock = JSON.parse(await fs.readFile(lockFile, 'utf8'));
    if (Number.isInteger(lock.pid) && lock.pid > 0) {
     try { process.kill(lock.pid, 0); }
     catch (probe) { if (probe.code === 'ESRCH') { await fs.unlink(lockFile).catch(() => {}); continue; } }
    }
   } catch {}
   await pause(100);
  }
 }
 if (!handle) throw Error('另一个启动或停止操作尚未完成，请稍后重试');
 try { return await action(); }
 finally { await handle.close(); await fs.unlink(lockFile).catch(() => {}); }
}
function browser(port) {
 if (process.argv.includes('--no-browser')) return;
 const url = 'http://127.0.0.1:' + port;
 const child = isWindows ? spawn(path.join(process.env.SystemRoot || 'C:/Windows', 'explorer.exe'), [url], {detached: true, stdio: 'ignore', windowsHide: true}) : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {detached: true, stdio: 'ignore'});
 child.on('error', () => console.log('请在浏览器中打开 ' + url)); child.unref();
}
function available(port) {
 return new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', error => error.code === 'EADDRINUSE' || error.code === 'EACCES' ? resolve(false) : reject(error));
  probe.listen({port, host: '127.0.0.1', exclusive: true}, () => probe.close(() => resolve(true)));
 });
}
async function start() {
 const previous = await stored();
 const preferred = Number(process.env.PORT || 4173);
 if (!validPort(preferred)) throw Error('PORT 必须是 1024–65535 的整数');
 const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
 const knownPorts = [];
 for (const file of await fs.readdir(runtimeDir)) {
  if (!/^server-[a-f0-9]{16}\.json$/.test(file)) continue;
  try { const state = JSON.parse(await fs.readFile(path.join(runtimeDir, file), 'utf8')); if (samePath(state.dataDir, dataDir) && validPort(state.port)) knownPorts.push(state.port); } catch {}
 }
 const ports = [...new Set([samePath(previous?.installRoot, root) ? previous?.port : null, ...knownPorts, ...Array.from({length: 11}, (_, i) => preferred + i)].filter(validPort))];
 const log = path.join(runtimeDir, 'server-' + key + '.log'), errorLog = path.join(runtimeDir, 'server-' + key + '-error.log');
 for (const port of ports) {
  const current = await health(port);
  if (current && samePath(current.dataDir, dataDir)) {
   if (current.version !== version) throw Error('此数据目录正在由其他版本使用，请先停止原发布包再启动新版');
   if (!owns(previous, current) || !previous.token) throw Error('此数据目录已有服务，请先使用原启动方式停止服务后重试');
   console.log('已在运行：http://127.0.0.1:' + port + '\n数据目录：' + dataDir); browser(port); return;
  }
  if (!await available(port)) continue;
  const token = crypto.randomBytes(32).toString('hex');
  const output = await fs.open(log, 'w'), errors = await fs.open(errorLog, 'w');
  let child, exitCode;
  try {
   child = spawn(process.execPath, [path.join(root, 'server.mjs')], {cwd: root, env: {...process.env, GXTODO_DATA_DIR: dataDir, PORT: String(port), GXTODO_STOP_TOKEN: token}, detached: true, windowsHide: true, stdio: ['ignore', output.fd, errors.fd]});
   child.once('exit', code => { exitCode = code ?? 1; });
   await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
   child.unref();
  } finally { await output.close(); await errors.close(); }
  for (let attempt = 0; attempt < 100; attempt++) {
   const ready = await health(port);
   if (ready?.pid === child.pid && samePath(ready.installRoot, root) && samePath(ready.dataDir, dataDir)) {
    try {
     await fs.writeFile(stateFile + '.tmp', JSON.stringify({installRoot: root, pid: child.pid, port, token, dataDir}, null, 2), {mode: 0o600});
     await fs.rename(stateFile + '.tmp', stateFile);
    } catch (error) { child.kill(); throw error; }
    console.log('已启动：http://127.0.0.1:' + port + '\n数据目录：' + dataDir); browser(port); return;
   }
   if (exitCode !== undefined) break;
   await pause(100);
  }
  if (exitCode === undefined) child.kill();
  if ((await fs.readFile(errorLog, 'utf8').catch(() => '')).includes('EADDRINUSE')) continue;
  throw Error('启动失败，请查看 ' + errorLog);
 }
 throw Error('可用端口已被占用，请设置 PORT 后重试');
}
async function stop() {
 const state = await stored();
 if (!state || !samePath(state.installRoot, root)) { console.log('没有此发布包的运行记录。'); return; }
 const current = await health(state.port);
 if (!owns(state, current)) { await fs.unlink(stateFile).catch(() => {}); console.log('此服务已经停止；没有关闭其他程序。'); return; }
 const response = await fetch('http://127.0.0.1:' + state.port + '/api/local-control/stop', {method: 'POST', headers: {'Content-Type': 'application/json', 'x-gx-control': state.token || ''}, body: '{}', signal: AbortSignal.timeout(5000)});
 if (!response.ok) { await response.body?.cancel(); throw Error('无法验证本机服务，未停止任何进程'); }
 await response.body?.cancel();
 for (let attempt = 0; attempt < 50; attempt++) {
  if (!(await health(state.port)) && !running(state.pid)) { await fs.unlink(stateFile).catch(() => {}); console.log('本地网页服务已停止，数据已保留。'); return; }
  await pause(100);
 }
 throw Error('服务仍在处理请求，请稍后重试');
}
async function main() {
 const action = process.argv[2] || 'start';
 if (action === 'start') await withLock(start);
 else if (action === 'stop') await withLock(stop);
 else if (action === 'status') { const state = await stored(); console.log(owns(state, state && await health(state.port)) ? '正在运行：http://127.0.0.1:' + state.port : '未运行'); }
 else throw Error('用法：launcher.cjs start | stop | status [--no-browser]');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
