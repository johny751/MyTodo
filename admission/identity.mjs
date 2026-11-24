import fs from 'node:fs/promises';
import path from 'node:path';
import {requireContext,hash,ALGORITHM,CONTRACT,writeFresh,json} from './guard.mjs';
const identities=new WeakSet();
export const TOOL_FILES=['admission/guard.mjs','admission/audit.mjs','admission/identity.mjs','admission/writer-lease.mjs','admission/snapshot.mjs','admission/preflight.mjs'];
const field=b=>Buffer.concat([Buffer.from('S'+b.length+':'),b]);
export async function bindToolIdentity(context,packageRoot){
 requireContext(context);const files=[],chunks=['mytodo-a-admission-source-v1',ALGORITHM,CONTRACT,String(TOOL_FILES.length)].map(s=>field(Buffer.from(s)));
 for(const name of TOOL_FILES){const bytes=await fs.readFile(path.join(packageRoot,name));chunks.push(field(Buffer.from(name)),field(bytes));files.push({file:name,bytes:bytes.length,sha256:hash(bytes)});}
 const identity=Object.freeze({framework:'mytodo-a-admission-source-v1',fingerprintAlgorithm:ALGORITHM,contractId:CONTRACT,toolChecksum:hash(Buffer.concat(chunks)),sourceSha:context.sourceSha,runId:context.runId,runAttempt:context.runAttempt,files,nodeVersion:process.version,sqliteCertification:'Node prototype only; not three-platform production admission'});
 identities.add(identity);await writeFresh(context,'admission-build-identity.json',json(identity));return identity;
}
export function requireIdentity(context,identity){requireContext(context);if(!identities.has(identity)||identity.sourceSha!==context.sourceSha||identity.runId!==context.runId||identity.runAttempt!==context.runAttempt)throw Error('Missing or unrecorded tool build identity');return identity;}
