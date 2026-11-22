import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const win = process.platform === 'win32';
const javaHome = process.env.JAVA_HOME || (win ? 'C:/Program Files/Android/Android Studio panda4/jbr' : '');
const executable = name => javaHome ? path.join(javaHome, 'bin', name + (win ? '.exe' : '')) : name;
const temporaryRoot = path.resolve(os.tmpdir());
const classes = await fs.mkdtemp(path.join(temporaryRoot, 'gxtodo-pomodoro-tests-'));
const run = promisify(execFile);
try {
  await run(executable('javac'), [
    '-encoding', 'UTF-8', '--release', '8', '-d', classes,
    path.join(root, 'android/src/local/gxtodo/replica/PomodoroClock.java'),
    path.join(root, 'tests/android/PomodoroClockTest.java'),
  ], {windowsHide: true, timeout: 60000});
  const result = await run(executable('java'), ['-cp', classes, 'local.gxtodo.replica.PomodoroClockTest'],
    {windowsHide: true, timeout: 30000});
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
} finally {
  const resolved = path.resolve(classes);
  if (path.dirname(resolved) !== temporaryRoot || !path.basename(resolved).startsWith('gxtodo-pomodoro-tests-')) {
    throw Error('Unexpected test output directory');
  }
  await fs.rm(resolved, {recursive: true, force: true});
}
