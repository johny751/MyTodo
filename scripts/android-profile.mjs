import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';

export function createProfiler({adb, serial='emulator-5580', avd='GxTodo_QA', packageName='local.gxtodo.replica'}) {
  if (!/^emulator-\d+$/.test(serial) || serial==='emulator-5554') throw Error('Use a dedicated emulator; emulator-5554 is protected.');
  if (!/^[A-Za-z0-9_.]+$/.test(packageName)) throw Error('Invalid package name');
  const run = args => new Promise((resolve,reject)=>execFile(adb,['-s',serial,...args],{windowsHide:true,timeout:30000,maxBuffer:12*1024*1024},(error,stdout,stderr)=>error?reject(Error(String(stderr||stdout||error.message))):resolve(stdout)));
  async function verify() {
    const actual=(await run(['emu','avd','name'])).split(/\r?\n/).map(x=>x.trim()).find(Boolean);
    if(actual!==avd)throw Error('AVD identity differs: '+actual);
    if((await run(['shell','id','-u'])).trim()!=='0')throw Error('This profiler requires adb root on a dedicated debug emulator.');
  }
  async function discover() {
    const output=await run(['shell','ps','-A','-o','PID,PPID,UID,NAME,ARGS']);
    const ps=output.split(/\r?\n/).flatMap(line=>{const m=/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)/.exec(line);return m?[{pid:+m[1],ppid:+m[2],uid:+m[3],name:m[4]}]:[];});
    const mains=ps.filter(p=>p.name===packageName||p.name.startsWith(packageName+':'));
    if(!mains.length)throw Error('App is not running');
    const services=await run(['shell','dumpsys','activity','services',packageName]);
    const rendererIds=new Set();
    for(const block of services.split(/(?=  \* ServiceRecord\{)/)) {
      if(!block.includes('packageName='+packageName)||!block.includes('sandboxed_process'))continue;
      const found=/\n\s+app=ProcessRecord\{\S+\s+(\d+):/.exec(block);
      if(found)rendererIds.add(+found[1]);
    }
    return [...mains.map(p=>({...p,role:'app'})),...ps.filter(p=>rendererIds.has(p.pid)&&!mains.some(a=>a.pid===p.pid)).map(p=>({...p,role:'webview-renderer'}))];
  }
  async function memory(processes) {
    const rows=[];
    for(const p of processes) {
      const raw=await run(['shell','dumpsys','meminfo','--local',String(p.pid)]);
      const m=/TOTAL PSS:\s+(\d+)\s+TOTAL RSS:\s+(\d+)\s+TOTAL SWAP PSS:\s+(\d+)/.exec(raw);
      if(!m)throw Error('Unsupported meminfo output for PID '+p.pid);
      rows.push({...p,pssKiB:+m[1],rssKiB:+m[2],swapPssKiB:+m[3]});
    }
    return {processes:rows,pssKiB:rows.reduce((s,p)=>s+p.pssKiB,0),swapPssKiB:rows.reduce((s,p)=>s+p.swapPssKiB,0)};
  }
  async function cpu(processes) {
    const raw=await run(['exec-out','cat',...processes.map(p=>'/proc/'+p.pid+'/stat'),'/proc/uptime']);
    const rows=[];let uptimeSeconds;
    for(const line of raw.trim().split(/\r?\n/)) {
      const m=/^(\d+) \((.*)\) (.+)$/.exec(line);
      if(m){const f=m[3].split(/\s+/);rows.push({pid:+m[1],userTicks:+f[11],systemTicks:+f[12],startTicks:+f[19]});}
      else if(/^\d+\.\d+\s+\d+\.\d+$/.test(line))uptimeSeconds=+line.split(/\s+/)[0];
    }
    if(rows.length!==processes.length||!Number.isFinite(uptimeSeconds))throw Error('Process changed or /proc format not supported');
    return {uptimeSeconds,processes:rows};
  }
  async function network(uids) {
    const raw=await run(['shell','dumpsys','netstats']);
    const section=/\n\s+mAppUidStatsMap:\s*\r?\n([\s\S]*?)(?=\r?\n\s+mStatsMapA:)/.exec(raw)?.[1];
    if(!section||!section.includes('uid rxBytes rxPackets txBytes txPackets'))throw Error('Live BPF UID counters unavailable; do not substitute zero.');
    const rows=new Map();
    for(const line of section.split(/\r?\n/)){const m=/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(line);if(m)rows.set(+m[1],{uid:+m[1],rxBytes:+m[2],rxPackets:+m[3],txBytes:+m[4],txPackets:+m[5]});}
    return {at:new Date().toISOString(),source:'NetworkStatsService mAppUidStatsMap (live BPF counters)',uids:[...new Set(uids)].map(uid=>rows.get(uid)||{uid,rxBytes:0,rxPackets:0,txBytes:0,txPackets:0})};
  }
  async function snapshot() {
    await verify();const processes=await discover();
    return {at:new Date().toISOString(),serial,avd,packageName,memory:await memory(processes),cpu:await cpu(processes),network:await network(processes.map(p=>p.uid))};
  }
  async function sample(seconds=60,label='idle') {
    await verify();const processes=await discover(),ticksPerSecond=Number((await run(['shell','getconf','CLK_TCK'])).trim());
    if(!processes.some(p=>p.role==='webview-renderer'))throw Error('WebView renderer is not ready or cannot be attributed.');
    const memoryBefore=await memory(processes),networkBefore=await network(processes.map(p=>p.uid)),cpuBefore=await cpu(processes);
    console.log('Sampling '+label+' for '+seconds+' seconds; do not interact with the emulator.');
    await new Promise(resolve=>setTimeout(resolve,seconds*1000));
    const cpuAfter=await cpu(processes),networkAfter=await network(processes.map(p=>p.uid)),memoryAfter=await memory(processes),after=await discover();
    if(JSON.stringify(processes.map(p=>p.pid).sort())!==JSON.stringify(after.map(p=>p.pid).sort()))throw Error('Process group changed during sample');
    const elapsedSeconds=cpuAfter.uptimeSeconds-cpuBefore.uptimeSeconds;
    const cpuRows=cpuAfter.processes.map(end=>{const start=cpuBefore.processes.find(p=>p.pid===end.pid);if(!start||start.startTicks!==end.startTicks)throw Error('Process restarted during sample');return {...processes.find(p=>p.pid===end.pid),cpuMs:(end.userTicks+end.systemTicks-start.userTicks-start.systemTicks)/ticksPerSecond*1000};});
    const networkRows=networkAfter.uids.map(end=>{const start=networkBefore.uids.find(p=>p.uid===end.uid);const row={uid:end.uid};for(const key of ['rxBytes','txBytes','rxPackets','txPackets']){row[key]=end[key]-start[key];if(row[key]<0)throw Error('Network counter reset');}return row;});
    return {label,at:new Date().toISOString(),serial,avd,packageName,requestedSeconds:seconds,elapsedSeconds,ticksPerSecond,
      cpu:{processes:cpuRows,totalMs:cpuRows.reduce((s,p)=>s+p.cpuMs,0),percentOfOneCore:cpuRows.reduce((s,p)=>s+p.cpuMs,0)/1000/elapsedSeconds*100},
      network:{processes:networkRows,totalBytes:networkRows.reduce((s,p)=>s+p.rxBytes+p.txBytes,0),source:networkAfter.source},
      memoryBefore,memoryAfter,raw:{cpuBefore,cpuAfter,networkBefore,networkAfter}};
  }
  return {verify,discover,memory,cpu,network,snapshot,sample};
}

async function main() {
  const [command='help',...args]=process.argv.slice(2),options={};
  if(command==='help'){console.log('node scripts/android-profile.mjs snapshot|sample --sdk <SDK> --out <new JSON file> [--seconds 60] [--label name] [--serial emulator-5580] [--avd GxTodo_QA] [--package local.gxtodo.replica]\nRead-only profiler: requires adb root; includes app and attributed WebView renderer processes.');return;}
  for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('Use --name value');options[args[i].slice(2)]=args[i+1];}
  for(const key of Object.keys(options))if(!['sdk','out','seconds','label','serial','avd','package'].includes(key))throw Error('Unknown option '+key);
  const sdk=options.sdk||process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
  if(!sdk||!options.out)throw Error('SDK and --out are required');
  const seconds=Number(options.seconds||60);if(!Number.isFinite(seconds)||seconds<1||seconds>3600)throw Error('seconds must be 1–3600');
  const out=path.resolve(options.out);try{await fs.access(out);throw Error('Output already exists');}catch(e){if(e.code!=='ENOENT')throw e;}
  const profiler=createProfiler({adb:path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb'),serial:options.serial,avd:options.avd,packageName:options.package});
  const result=command==='snapshot'?await profiler.snapshot():command==='sample'?await profiler.sample(seconds,options.label):null;
  if(!result)throw Error('Unknown command');
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(result,null,2),{flag:'wx'});console.log('Saved '+out);
}
if(typeof process!=='undefined'&&process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
