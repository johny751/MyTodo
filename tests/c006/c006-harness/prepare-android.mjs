import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cloudOnly,confined,sha} from './fixture-server.mjs';
cloudOnly();
const root=process.cwd(),target=confined(process.argv[2]),here=path.dirname(fileURLToPath(import.meta.url));
const original=path.join(root,'tests/protocol-harness/android');
await fs.cp(original,target,{recursive:true,errorOnExist:true,force:false});
const activity=path.join(target,'src/local/gxtodo/replica/ProtocolHarnessActivity.java');
let java=await fs.readFile(activity,'utf8'),before=java;
function replaceOnce(old,next){if(java.split(old).length!==2)throw Error('Android shell adaptation anchor changed: '+old.slice(0,100));java=java.replace(old,next);}
replaceOnce('if (!method.equals("GET") && !method.equals("PUT")) {','if (!method.equals("GET") && !method.equals("PUT") && !method.equals("MKCOL")) {');
replaceOnce('        HttpURLConnection connection = (HttpURLConnection)new URL(base.replaceAll("/$", "") + "/dav/C003/" + path).openConnection();',
`        String folder = new JSONObject(input).getString("folder");
        if (!folder.matches("[A-Za-z0-9_-]{1,60}")) throw new IOException("Invalid C006 fixture folder");
        if (method.equals("MKCOL")) return fixtureCollection(uri, folder, path);
        HttpURLConnection connection = (HttpURLConnection)new URL(base.replaceAll("/$", "") + "/dav/" + folder + "/" + path).openConnection();`);
replaceOnce('    /** Real TCP/HTTP fixture I/O, limited to adb-reversed emulator loopback. */',
`    /** Raw loopback transport for the extension method HttpURLConnection rejects. */
    private JSONObject fixtureCollection(Uri uri, String folder, String relative) throws Exception {
        if (!relative.equals("v2/")) throw new IOException("Unexpected fixture collection path");
        try (java.net.Socket socket = new java.net.Socket()) {
            socket.connect(new java.net.InetSocketAddress("127.0.0.1", uri.getPort()), 15000);
            socket.setSoTimeout(15000);
            String request = "MKCOL /dav/" + folder + "/" + relative + " HTTP/1.1\\r\\nHost: 127.0.0.1\\r\\nContent-Length: 0\\r\\nConnection: close\\r\\n\\r\\n";
            socket.getOutputStream().write(request.getBytes(StandardCharsets.US_ASCII));
            socket.getOutputStream().flush();
            java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
            String line = reader.readLine();
            if (line == null || !line.matches("HTTP/1\\\\.[01] [0-9]{3}.*")) throw new IOException("Invalid MKCOL HTTP status");
            return new JSONObject().put("status", Integer.parseInt(line.substring(9,12))).put("body", "").put("etag", JSONObject.NULL);
        }
    }

    /** Real TCP/HTTP fixture I/O, limited to adb-reversed emulator loopback. */`);
replaceOnce('        return new JSONObject().put("meta", meta).put("metaJSON", metaJSON).put("rows", rows).put("outbox", outbox)',
`        JSONArray rawEntities = new JSONArray(), rawOutbox = new JSONArray();
        try (Cursor cursor = database.rawQuery("SELECT * FROM entities ORDER BY key", null)) {
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                for (int i=0;i<cursor.getColumnCount();i++) row.put(cursor.getColumnName(i), cursor.isNull(i) ? JSONObject.NULL : cursor.getString(i));
                rawEntities.put(row);
            }
        }
        try (Cursor cursor = database.rawQuery("SELECT id,event FROM outbox ORDER BY id", null)) {
            while (cursor.moveToNext()) rawOutbox.put(new JSONObject().put("id", cursor.getLong(0)).put("event", cursor.getString(1)));
        }
        return new JSONObject().put("sqlEntities", rawEntities).put("sqlOutbox", rawOutbox).put("pid", android.os.Process.myPid()).put("meta", meta).put("metaJSON", metaJSON).put("rows", rows).put("outbox", outbox)`);
await fs.writeFile(activity,java);
const entry=await fs.readFile(path.join(here,'android-entry.mjs'));await fs.writeFile(path.join(target,'harness-entry.mjs'),entry);
await fs.writeFile(path.join(target,'c006-adaptation.json'),JSON.stringify({source:'tests/protocol-harness/android',originalActivitySha256:sha(Buffer.from(before)),adaptedActivitySha256:sha(Buffer.from(java)),entrySha256:sha(entry),
 adaptations:['C006 validated synthetic folder','actual loopback MKCOL socket transport','raw SQLite audit bytes and PID','entry calls exported production syncDelta'],productionAlgorithmEdits:0},null,2)+'\n');
process.stdout.write(JSON.stringify({target,buildCommand:['node',path.join(target,'build-android.mjs'),'--root',root,'--output-dir',path.join(path.dirname(target),'c006-android-build')]})+'\n');
