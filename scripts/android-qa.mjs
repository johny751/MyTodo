import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile, spawn} from 'node:child_process';

// ADB is always bound to an explicitly verified, dedicated emulator.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [requestedCommand = 'help', ...args] = process.argv.slice(2);
const command = requestedCommand === '--help' ? 'help' : requestedCommand;
const projectPackage = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(projectPackage.version)) throw new Error('package.json 版本格式无效。');
const defaultApkRelative = 'dist/gxtodo-local-' + projectPackage.version + '.apk';
const options = {};
for (let i = 0; i < args.length; i++) {
  if (!/^--[a-z-]+$/.test(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
    throw new Error('参数格式：--name value');
  }
  const key = args[i].slice(2);
  if (Object.hasOwn(options, key)) throw new Error('重复参数：' + key);
  options[key] = args[++i];
}
const known = new Set(['sdk', 'serial', 'avd', 'avd-home', 'emulator', 'port', 'apk', 'out', 'label', 'account', 'vulkan']);
for (const key of Object.keys(options)) if (!known.has(key)) throw new Error('未知参数：' + key);
const sdk = options.sdk || process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const avd = options.avd || 'GxTodo_QA';
const serial = options.serial || 'emulator-5580';
const pkg = 'local.gxtodo.replica';
const win = process.platform === 'win32';
const adb = sdk && path.join(sdk, 'platform-tools', win ? 'adb.exe' : 'adb');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function run(exe, argv, binary = false) {
  return new Promise((resolve, reject) => execFile(exe, argv, {
    windowsHide: true, timeout: 45000, maxBuffer: 16 * 1024 * 1024,
    encoding: binary ? 'buffer' : 'utf8'
  }, (error, stdout, stderr) => {
    if (error) reject(new Error(path.basename(exe) + ': ' + String(stderr || stdout || error.message).trim()));
    else resolve(stdout);
  }));
}
const adbRun = (argv, binary = false) => run(adb, ['-s', serial, ...argv], binary);
async function verifyDevice() {
  if (!/^emulator-\d+$/.test(serial) || serial === 'emulator-5554') {
    throw new Error('仅允许专用模拟器；此项目保护 emulator-5554，不在它上面测试。');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(avd)) throw new Error('AVD 名称只能包含字母、数字、下划线和短横线。');
  const actual = (await adbRun(['emu', 'avd', 'name'])).split(/\r?\n/).map(x => x.trim()).find(Boolean);
  if (actual !== avd) throw new Error('设备身份不符：期望 ' + avd + '，实际 ' + actual);
}
function help() {
  console.log('用法：node scripts/android-qa.mjs <命令> --sdk <Android SDK> [参数]\n' +
    '  doctor    检查专用模拟器、系统版本和 APK 版本\n' +
    '  start     启动已有专用 AVD，并保持此终端运行\n' +
    '            --avd-home <目录> [--emulator <程序路径>] [--port 5580] [--vulkan off]\n' +
    '  install   覆盖安装 --apk <路径>（默认 ' + defaultApkRelative + '，来自 package.json）\n' +
    '  restart   强制停止并重新打开本应用，检验落盘持久性\n' +
    '  capture   保存 PNG、界面 XML、版本信息和进程内存 --out <新目录>\n' +
    '  tap       按当前 XML 中唯一的可见名称点击 --label <名称>\n' +
    '  database  只读完整性及数量检查 --account default（需要已开启 adb root）\n' +
    '  stop      只关闭经过身份核对的专用模拟器\n' +
    '共同参数：--serial emulator-5580 --avd GxTodo_QA\n' +
    '不清除应用数据、不卸载、不关闭 ADB 服务；真机验收按 docs/android-testing.md 操作。');
}
async function main() {
  if (command === 'help') return help();
  if (!sdk) throw new Error('请设置 ANDROID_HOME 或传入 --sdk。');
  await fs.access(adb);
  if (command === 'start') {
    if (options.vulkan !== undefined && options.vulkan !== 'off') throw new Error('--vulkan 仅接受 off；不指定则使用模拟器默认行为。');
    const port = Number(options.port || 5580);
    if (port < 5556 || port > 5682 || port % 2) throw new Error('请使用 5556–5682 范围内空闲的偶数端口。');
    if (serial !== 'emulator-' + port) throw new Error('--serial 必须与 --port 一致。');
    if (!/^[A-Za-z0-9_-]+$/.test(avd)) throw new Error('AVD 名称无效。');
    const avdHome = options['avd-home'] || process.env.ANDROID_AVD_HOME;
    if (!avdHome) throw new Error('必须指定隔离的 --avd-home 或 ANDROID_AVD_HOME。');
    await fs.access(path.join(avdHome, avd + '.ini'));
    const devices = await run(adb, ['devices']);
    if (devices.split(/\r?\n/).some(line => line.split(/\s+/)[0] === serial)) {
      await verifyDevice();
      console.log('专用模拟器已运行：' + serial); return;
    }
    const emulator = options.emulator || path.join(sdk, 'emulator', win ? 'emulator.exe' : 'emulator');
    await fs.access(emulator);
    console.log('启动 ' + avd + '；请保持本终端运行。其他终端使用 --serial ' + serial + '。');
    const child = spawn(emulator, ['-avd', avd, '-port', String(port), '-no-window', '-no-audio',
      '-no-boot-anim', '-no-snapshot', '-gpu', 'swiftshader_indirect', '-memory', '2048', '-cores', '2',
      ...(options.vulkan === 'off' ? ['-feature', '-Vulkan'] : [])], {
      windowsHide: true, env: {...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, ANDROID_AVD_HOME: avdHome},
      stdio: 'inherit'
    });
    // Retaining the parent avoids premature child cleanup in IDE terminal sessions.
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => code === 0 || signal === 'SIGINT' ? resolve() : reject(new Error('模拟器退出：' + code)));
    });
    return;
  }
  if (!['doctor', 'install', 'restart', 'capture', 'tap', 'database', 'stop'].includes(command)) throw new Error('未知命令：' + command);
  await verifyDevice();
  if (command === 'doctor') {
    console.log('专用设备：' + serial + ' / ' + avd);
    console.log('Android：' + (await adbRun(['shell', 'getprop', 'ro.build.version.release'])).trim());
    console.log('启动完成：' + (await adbRun(['shell', 'getprop', 'sys.boot_completed'])).trim());
    console.log((await adbRun(['shell', 'dumpsys', 'package', pkg])).split(/\r?\n/).filter(x => /versionCode=|versionName=/.test(x)).join('\n') || '尚未安装 APK');
  } else if (command === 'install') {
    const apk = path.resolve(options.apk || path.join(root, defaultApkRelative));
    await fs.access(apk);
    const result = await adbRun(['install', '-r', apk]);
    if (!/\bSuccess\b/.test(result)) throw new Error(result);
    console.log(result.trim());
    console.log((await adbRun(['shell', 'am', 'start', '-W', '-n', pkg + '/.MainActivity'])).trim());
  } else if (command === 'restart') {
    await adbRun(['shell', 'am', 'force-stop', pkg]);
    console.log((await adbRun(['shell', 'am', 'start', '-W', '-n', pkg + '/.MainActivity'])).trim());
  } else if (command === 'capture') {
    if (!options.out) throw new Error('capture 必须指定 --out <新的证据目录>。');
    const out = path.resolve(options.out);
    await fs.mkdir(path.dirname(out), {recursive: true});
    await fs.mkdir(out); // Deliberately refuse to overwrite prior evidence.
    const xml = await readUi();
    const png = await adbRun(['exec-out', 'screencap', '-p'], true);
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('截图不是有效 PNG。');
    await fs.writeFile(path.join(out, 'screen.png'), png);
    await fs.writeFile(path.join(out, 'ui.xml'), xml);
    await fs.writeFile(path.join(out, 'meminfo.txt'), await adbRun(['shell', 'dumpsys', 'meminfo', '--local', pkg]));
    const info = (await adbRun(['shell', 'dumpsys', 'package', pkg])).split(/\r?\n/).filter(x => /versionCode=|versionName=/.test(x));
    await fs.writeFile(path.join(out, 'capture.json'), JSON.stringify({at: new Date().toISOString(), serial, avd, package: pkg, version: info}, null, 2));
    console.log('证据已保存：' + out);
  } else if (command === 'tap') {
    if (!options.label) throw new Error('tap 必须指定 --label。');
    const xml = await readUi();
    const matches = [...xml.matchAll(/<node\b[^>]*>/g)].map(match => {
      const attrs = {};
      for (const item of match[0].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[item[1]] = decodeXml(item[2]);
      return attrs;
    }).filter(a => a.text === options.label || a['content-desc'] === options.label);
    if (matches.length !== 1) throw new Error('名称匹配 ' + matches.length + ' 个控件；请检查最新 XML，避免误点。');
    const box = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(matches[0].bounds || '');
    if (!box || Number(box[3]) <= Number(box[1]) || Number(box[4]) <= Number(box[2])) throw new Error('控件没有可点击区域。');
    const x = Math.floor((Number(box[1]) + Number(box[3])) / 2), y = Math.floor((Number(box[2]) + Number(box[4])) / 2);
    const viewport = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(xml);
    if (!viewport || x < Number(viewport[1]) || x >= Number(viewport[3]) || y < Number(viewport[2]) || y >= Number(viewport[4])) throw new Error('控件不在当前屏幕内，请先滚动并重新观察。');
    if (matches[0].enabled === 'false') throw new Error('控件当前不可用。');
    await adbRun(['shell', 'input', 'tap', String(x), String(y)]);
    console.log('已点击；请重新 capture 验证结果。');
  } else if (command === 'database') {
    const account = options.account || 'default';
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(account)) throw new Error('账号 ID 无效。');
    const dir = '/data/user/0/' + pkg + '/files/';
    const db = dir + (account === 'default' ? '' : 'accounts/' + account + '/') + 'tasks.sqlite';
    const sql = 'PRAGMA query_only=ON; PRAGMA integrity_check; SELECT kind, count(*) AS total_rows, sum(deleted=0) AS live_rows FROM entities GROUP BY kind; SELECT count(*) AS outbox_rows FROM outbox;';
    console.log((await adbRun(['shell', 'sqlite3', '-readonly', '-header', '-column', db, "'" + sql + "'"])).trim());
    console.log('entities 数量包含删除标记；不等同于界面活动任务数。');
  } else if (command === 'stop') {
    console.log((await adbRun(['emu', 'kill'])).trim());
  }
}
function decodeXml(value) {
  return value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
async function readUi() {
  for (let i = 0; i < 8; i++) {
    try {
      await adbRun(['shell', 'uiautomator', 'dump', '/sdcard/gxtodo-qa-ui.xml']);
      const xml = await adbRun(['exec-out', 'cat', '/sdcard/gxtodo-qa-ui.xml']);
      if (xml.includes('package="' + pkg + '"') && /(?:text|content-desc)="[^"]+"/.test(xml)) return xml;
    } catch (error) {
      // UIAutomation can briefly disconnect while a replaced Activity settles.
      if (i === 7) throw error;
    }
    await delay(500);
  }
  throw new Error('界面尚未就绪或应用不在前台，请检查设备。');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
