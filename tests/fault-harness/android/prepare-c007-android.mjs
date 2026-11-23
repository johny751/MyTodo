import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
if(process.env.GITHUB_ACTIONS!=='true')throw Error('C007 preparation only runs on GitHub');
const here=path.dirname(fileURLToPath(import.meta.url)),root=process.cwd(),base=path.resolve(process.env.RUNNER_TEMP||''),target=path.resolve(process.argv[2]||''),rel=path.relative(base,target);
if(!process.env.RUNNER_TEMP||!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('A new RUNNER_TEMP target is required');
await fs.cp(path.join(root,'tests/protocol-harness/android'),target,{recursive:true,errorOnExist:true,force:false});
const file=path.join(target,'src/local/gxtodo/replica/ProtocolHarnessActivity.java');
let java=await fs.readFile(file,'utf8'),original=java;
const replace=(old,next)=>{if(java.split(old).length!==2)throw Error('Android C007 exact adaptation anchor changed: '+old.slice(0,80));java=java.replace(old,next);};
replace('/** Isolated test shell using unchanged AccountStore and ReplicaDatabase classes. */','/** Isolated test shell using production AccountStore and a test-observed ReplicaDatabase source copy. */');
replace('    private volatile boolean destroyed;',`    private volatile boolean destroyed;
    private final C007Faults c007Faults = new C007Faults();
    private JSONObject c007LastError = new JSONObject();
    private void c007Save(String suffix, JSONObject value) throws Exception {
        File target = new File(output.getParentFile(), output.getName() + "." + suffix + ".json");
        if (!target.createNewFile()) throw new IOException("C007 immutable evidence already exists");
        try (FileOutputStream stream = new FileOutputStream(target, false)) {
            stream.write(value.toString().getBytes(StandardCharsets.UTF_8));
            stream.getFD().sync();
        }
    }
    private void c007AfterCommit(JSONObject request, Object value) throws Exception {
        if (!request.optString("action").equals("commit") || !request.has("ack") ||
            !(value instanceof JSONObject) || !((JSONObject)value).optBoolean("ok")) return;
        JSONObject spec = new JSONObject(input);
        if (!spec.optString("exitAt").equals("after-ack-commit")) return;
        c007Save("after-ack-commit", new JSONObject().put("boundary", "after-real-ack-return")
            .put("processId", android.os.Process.myPid()).put("caseId",spec.getString("caseId"))
            .put("attemptId",spec.getString("attemptId")).put("sourceSha",spec.getString("sourceSha"))
            .put("dbCase",spec.getString("dbCase"))
            .put("databaseFile",new File(physicalDatabase().getPath()).getCanonicalPath())
            .put("ackThrough",request.getLong("ack")));
        android.os.Process.killProcess(android.os.Process.myPid());
        System.exit(86);
    }`);
replace('                    result.put("value", accounts.sync(request.getString("accountId"), request));',`                    Object actual = accounts.sync(request.getString("accountId"), request);
                    c007AfterCommit(request, actual);
                    result.put("value", actual);`);
replace('                    try { result.put("error", error.getClass().getName() + ": " + error.getMessage()); } catch (Exception ignored) {}',`                    try {
                        JSONArray stack = new JSONArray();
                        for (StackTraceElement frame : error.getStackTrace()) stack.put(frame.toString());
                        c007LastError = new JSONObject().put("class",error.getClass().getName()).put("message",String.valueOf(error.getMessage())).put("stack",stack);
                        result.put("error", error.getClass().getName() + ": " + error.getMessage());
                    } catch (Exception ignored) {}`);
replace('                    else if ("audit".equals(operation)) value = audit();',`                    else if ("audit".equals(operation)) value = audit();
                    else if ("c007Fault".equals(operation)) { c007LastError = new JSONObject(); value = c007Faults.arm(physicalDatabase(),request.getJSONObject("fault")); C007CommitObserver.arm(new JSONObject(input),output); }
                    else if ("c007ClearFault".equals(operation)) { C007CommitObserver.disarm(); c007Faults.clear(physicalDatabase()); value = new JSONObject().put("cleared",true); }
                    else if ("c007Diagnostics".equals(operation)) value = c007LastError;
                    else if ("c007Save".equals(operation)) { String suffix=request.getString("suffix"); if(!suffix.matches("[a-z-]{1,40}"))throw new IOException("Invalid C007 evidence suffix"); c007Save(suffix,request.getJSONObject("value")); value=new JSONObject().put("saved",true); }`);
replace('        HttpURLConnection connection = (HttpURLConnection)new URL(base.replaceAll("/$", "") + "/dav/C003/" + path).openConnection();',`        String folder = new JSONObject(input).getString("folder");
        if (!folder.matches("[A-Za-z0-9_-]{1,60}")) throw new IOException("Invalid C007 fixture folder");
        HttpURLConnection connection = (HttpURLConnection)new URL(base.replaceAll("/$", "") + "/dav/" + folder + "/" + path).openConnection();`);
const runtimePid='.put("processId", android.os.Process.myPid())';
// C004 already adds runtime PID; an older C003 shell gets the same one-line observation.
const runtimeAnchor='.put("supportedAbis", new JSONArray(java.util.Arrays.asList(android.os.Build.SUPPORTED_ABIS)))';
if(!original.includes(runtimePid))replace(runtimeAnchor,runtimePid+runtimeAnchor);
await fs.writeFile(file,java);
await fs.copyFile(path.join(here,'C007Faults.java'),path.join(target,'src/local/gxtodo/replica/C007Faults.java'));
await fs.copyFile(path.join(here,'C007CommitObserver.java'),path.join(target,'src/local/gxtodo/replica/C007CommitObserver.java'));
await fs.copyFile(path.join(here,'c007-android-entry.mjs'),path.join(target,'harness-entry.mjs'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const productionPath=path.join(root,'android/src/local/gxtodo/replica/ReplicaDatabase.java'),production=await fs.readFile(productionPath,'utf8');
let observedProduction=production;
const observe=(old,next)=>{if(observedProduction.split(old).length!==2)throw Error('Android transaction observation anchor changed: '+old);observedProduction=observedProduction.replace(old,next);};
observe('db.beginTransaction();try{','db.beginTransaction();boolean c007CommitReady=false;try{');
observe('db.setTransactionSuccessful();return new JSONObject().put("ok",true)', 'db.setTransactionSuccessful();c007CommitReady=true;return new JSONObject().put("ok",true)');
observe('}finally{db.endTransaction();}', '}finally{if(c007CommitReady)C007CommitObserver.beforeCommit(input,db);db.endTransaction();}');
await fs.mkdir(path.join(target,'observed-production'),{recursive:false});
await fs.writeFile(path.join(target,'observed-production/ReplicaDatabase.java'),observedProduction,{flag:'wx'});
const builderPath=path.join(target,'build-android.mjs'),builder=await fs.readFile(builderPath,'utf8');
const sourceAnchor="const nativeSources = packageFiles.map(name => path.join(root, 'android/src/local/gxtodo/replica', name));";
if(builder.split(sourceAnchor).length!==2)throw Error('Android builder native-source mapping changed');
const observedBuilder=builder.replace(sourceAnchor,"const nativeSources = packageFiles.map(name => name === 'ReplicaDatabase.java' ? path.join(here, 'observed-production', name) : path.join(root, 'android/src/local/gxtodo/replica', name));");
await fs.writeFile(builderPath,observedBuilder);
await fs.writeFile(path.join(target,'c007-adaptation.json'),JSON.stringify({originalActivitySha256:sha(original),adaptedActivitySha256:sha(java),
 originalDatabaseSha256:sha(production),observedDatabaseSha256:sha(observedProduction),originalBuilderSha256:sha(builder),observedBuilderSha256:sha(observedBuilder),
 repositoryProductionFilesModified:0,productionCopyObservationInsertions:3,originalSqlAndTransactionOrderPreserved:true,
 adaptations:['test control arms real SQLite faults','actual AccountStore sync return observer after ACK','test-only source-copy hook after setTransactionSuccessful and before endTransaction','durable immutable checkpoint before kill','native exception class/message/stack capture','validated loopback folder']},null,2));
process.stdout.write(JSON.stringify({target,buildCommand:['node',path.join(target,'build-android.mjs'),'--root',root,'--output-dir',path.join(path.dirname(target),'c007-android-build')]})+'\n');
