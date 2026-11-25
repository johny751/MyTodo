"""Evidence collection only; never imports or executes MyTodo project code."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

p = argparse.ArgumentParser()
p.add_argument('--out', required=True)
p.add_argument('--runs', nargs='+', required=True)
p.add_argument('--download-runs', nargs='*', default=[])
a = p.parse_args()
out = Path(a.out).resolve()
if not str(out).startswith('/workspaces/') or out.exists():
    raise SystemExit('Fresh dedicated Codespaces evidence directory required')
out.mkdir(parents=True)
repo = 'johny751/MyTodo'
receipts = []

def capture(argv, relative):
    target = out / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    target.write_bytes(r.stdout)
    target.with_name(target.name + '.stderr.txt').write_bytes(r.stderr)
    receipts.append({'argv': argv, 'path': relative, 'exit': r.returncode,
                     'stdoutBytes': len(r.stdout), 'stderrBytes': len(r.stderr)})
    return json.loads(r.stdout) if r.returncode == 0 and relative.endswith('.json') else None

capture(['gh', 'api', 'repos/' + repo], 'repository.json')
for run in a.runs:
    if not run.isdigit():
        raise SystemExit('Numeric run ID required')
    prefix = run + '/'
    data = capture(['gh', 'api', 'repos/' + repo + '/actions/runs/' + run], prefix + 'run.json')
    if not data or data.get('status') != 'completed':
        raise SystemExit('Only completed runs may be collected: ' + run)
    attempt = str(data['run_attempt'])
    jobs = capture(['gh', 'api', 'repos/' + repo + '/actions/runs/' + run + '/attempts/' + attempt + '/jobs?per_page=100'], prefix + 'jobs.json')
    capture(['gh', 'api', 'repos/' + repo + '/actions/runs/' + run + '/artifacts?per_page=100'], prefix + 'artifacts.json')
    capture(['gh', 'run', 'view', run, '-R', repo, '--log'], prefix + 'complete-log.txt')
    capture(['gh', 'run', 'view', run, '-R', repo, '--log-failed'], prefix + 'failed-log.txt')
    for job in (jobs or {}).get('jobs', []):
        check = job.get('check_run_url', '').rsplit('/', 1)[-1]
        if check.isdigit():
            capture(['gh', 'api', 'repos/' + repo + '/check-runs/' + check + '/annotations?per_page=100'], prefix + 'annotations-' + str(job['id']) + '.json')
    if run in a.download_runs:
        target = out / prefix / 'downloaded-artifacts'
        capture(['gh', 'run', 'download', run, '-R', repo, '--dir', str(target)], prefix + 'download.txt')

capture(['gh', 'api', 'repos/' + repo + '/branches/master'], 'master.json')
capture(['gh', 'api', 'repos/' + repo + '/issues/1'], 'android-issue-1.json')
capture(['gh', 'api', 'repos/' + repo + '/compare/d4c5af4cbbb9192c19276dd371bd142c2b835534...d4/mobile-integrated-candidate-1'], 'compare.json')
(out / 'collection-receipts.json').write_text(json.dumps(receipts, indent=2) + '\n', encoding='utf-8')
files = [{'path': str(f.relative_to(out)), 'bytes': f.stat().st_size,
          'sha256': hashlib.sha256(f.read_bytes()).hexdigest()}
         for f in sorted(out.rglob('*')) if f.is_file()]
(out / 'sha256-manifest.json').write_text(json.dumps({'kind': 'original GitHub evidence, no project execution', 'files': files}, indent=2) + '\n', encoding='utf-8')
archive = out.with_suffix('.zip')
with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(out.rglob('*')):
        if f.is_file():
            z.write(f, str(f.relative_to(out)))
print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size,
                  'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
                  'collectionErrors': [r for r in receipts if r['exit'] != 0]}))
