import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {cloudOnly,confined,sha} from '../c006-harness/fixture-server.mjs';
cloudOnly();
const here=path.dirname(fileURLToPath(import.meta.url)),target=confined(process.argv[2]);
const base=path.resolve(here,'../c006-harness/prepare-android.mjs');
const prepared=await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[base,target],{cwd:process.cwd(),env:process.env,stdio:'inherit'});
 child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));
});
if(prepared.code!==0||prepared.signal)throw Error('Frozen C006 Android preparation failed');
const activity=path.join(target,'src/local/gxtodo/replica/ProtocolHarnessActivity.java');
let java=await fs.readFile(activity,'utf8'),original=java;
const replace=(old,next)=>{if(java.split(old).length!==2)throw Error('C006 kill observation anchor changed: '+old.slice(0,90));java=java.replace(old,next);};
replace('    private volatile boolean destroyed;',`    private volatile boolean destroyed;
    private void c006Save(String suffix, JSONObject value) throws Exception {
        if (!suffix.matches("[a-z-]{1,32}")) throw new IOException("Invalid C006 evidence suffix");
        File file = new File(output.getParentFile(), output.getName() + "." + suffix + ".json");
        if (!file.createNewFile()) throw new IOException("C006 immutable evidence already exists");
        try (FileOutputStream stream = new FileOutputStream(file, false)) {
            stream.write(value.toString().getBytes(StandardCharsets.UTF_8));
            stream.getFD().sync();
        }
    }
    private void c006Kill(String boundary, JSONObject observation) throws Exception {
        JSONObject spec = new JSONObject(input), state = audit();
        if (physicalDatabase().inTransaction()) throw new IOException("C006 gate observed an unfinished transaction");
        c006Save("gate", new JSONObject().put("boundary", boundary)
            .put("processId", android.os.Process.myPid()).put("deviceTimeMillis",System.currentTimeMillis())
            .put("caseId",spec.getString("caseId")).put("attemptId",spec.getString("attemptId"))
            .put("dbCase",spec.getString("dbCase")).put("sourceSha",spec.getString("sourceSha"))
            .put("observation",observation).put("audit",state));
        android.os.Process.killProcess(android.os.Process.myPid());
        System.exit(86);
    }
    private void c006AfterCommit(JSONObject request, Object result) throws Exception {
        JSONObject spec = new JSONObject(input);
        if (!spec.optString("operation").equals("sync") || !spec.optString("exitAt").equals("after-import") ||
            !request.optString("action").equals("commit") || !(result instanceof JSONObject) ||
            !((JSONObject)result).optBoolean("ok")) return;
        JSONArray rows = request.optJSONArray("rows");
        String key = spec.getString("importKey");
        if (rows == null) return;
        for (int i=0;i<rows.length();i++) if (key.equals(rows.getJSONObject(i).optString("key"))) {
            c006Kill("after-real-import-commit",new JSONObject().put("action","commit")
                .put("ok",true).put("importKey",key).put("rowCount",rows.length())
                .put("expectedRevision",request.getLong("expected")));
            return;
        }
    }
    private void c006AfterResponse(JSONObject request, int status) throws Exception {
        JSONObject spec = new JSONObject(input);
        if (!spec.optString("operation").equals("sync") || !spec.optString("exitAt").equals("after-manifest") ||
            !request.optString("method").equals("PUT") || !request.optString("path").equals("v2/manifest.json") ||
            (request.has("etag") && !request.isNull("etag")) || !(status==200 || status==201 || status==204)) return;
        c006Kill("after-real-manifest-success-response",new JSONObject().put("method","PUT")
            .put("path","v2/manifest.json").put("status",status)
            .put("manifest",new JSONObject(request.getString("body"))));
    }`);
replace('                    result.put("value", accounts.sync(request.getString("accountId"), request));',`                    Object actual = accounts.sync(request.getString("accountId"), request);
                    c006AfterCommit(request, actual);
                    result.put("value", actual);`);
replace('            int status = connection.getResponseCode();',`            int status = connection.getResponseCode();
            c006AfterResponse(request, status);`);
replace('                    else if ("audit".equals(operation)) value = audit();',`                    else if ("audit".equals(operation)) value = audit();
                    else if ("c006Save".equals(operation)) { c006Save(request.getString("suffix"),request.getJSONObject("value")); value=new JSONObject().put("saved",true); }`);
replace('.put("pid", android.os.Process.myPid()).put("meta", meta)', '.put("pid", android.os.Process.myPid()).put("deviceTimeMillis",System.currentTimeMillis()).put("meta", meta)');
await fs.writeFile(activity,java);
const entry=await fs.readFile(path.join(here,'android-kill-entry.mjs'));await fs.writeFile(path.join(target,'harness-entry.mjs'),entry);
await fs.writeFile(path.join(target,'c006-kill-adaptation.json'),JSON.stringify({status:'prepared-not-executed',
 originalC006ActivitySha256:sha(Buffer.from(original)),adaptedActivitySha256:sha(Buffer.from(java)),entrySha256:sha(entry),
 productionFilesModified:0,productionAlgorithmEdits:0,adaptations:['after actual AccountStore commit return, selected imported key only','after actual successful initial manifest HTTP response before JS delivery','fsynced immutable native boundary receipt then real killProcess','raw SQLite audit and actual device clock']},null,2)+'\n');
