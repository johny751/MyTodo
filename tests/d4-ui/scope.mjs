import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const git=args=>execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/d4/mobile-integrated-candidate-1'||process.env.EXPECTED_SOURCE_SHA!==process.env.GITHUB_SHA||git(['rev-parse','HEAD'])!==process.env.GITHUB_SHA)throw Error('Wrong UI candidate identity');
const base=git(['rev-parse','origin/master']);
git(['diff','--check','origin/master...HEAD']);
const files=git(['diff','--name-only','origin/master...HEAD']).split('\n').filter(Boolean);
const allowed=/^(?:prototypes\/(?:d4-01|d4-03-platforms)\/|tests\/(?:d4-ui|d4-03-platforms)\/|docs\/upgrade\/(?:d4-01|d4-03)\/|\.github\/workflows\/d4-(?:ui-candidate|03-candidate)\.yml$)/;
if(files.some(f=>!allowed.test(f)))throw Error('Unauthorized scope: '+files.filter(f=>!allowed.test(f)).join(','));
git(['diff','--exit-code','origin/master...HEAD','--','src','windows','android','package.json']);
let evidenceFiles=0;
for(const name of ['evidence','evidence-font']){
 const directory=path.resolve('docs/upgrade/d4-01',name),manifestPath=path.join(directory,'sha256-manifest.json');
 if(!existsSync(manifestPath))continue;
 const manifestBytes=readFileSync(manifestPath);if(name==='evidence'&&createHash('sha256').update(manifestBytes).digest('hex')!=='6d836331b0be1fb395f068446ebeb3f58c8a691404f9dc9d7a808fdfd8328c65')throw Error('Frozen CI1-3 evidence manifest changed');const manifest=JSON.parse(manifestBytes.toString('utf8'));
 for(const record of manifest.files){const file=path.resolve(record.path),rel=path.relative(directory,file);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('Evidence path outside dedicated directory');const bytes=readFileSync(file);if(bytes.length!==record.bytes||createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw Error('Original evidence changed: '+record.path);evidenceFiles++;}
}
console.log(JSON.stringify({status:'passed',base,sourceSHA:process.env.GITHUB_SHA,files,productionDiff:0,immutableEvidenceFilesVerified:evidenceFiles}));
