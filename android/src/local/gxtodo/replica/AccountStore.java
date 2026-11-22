package local.gxtodo.replica;
import android.content.Context;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Local profiles share no state files or cloud merge baselines. */
final class AccountStore {
 private static AccountStore instance;
 static synchronized AccountStore get(Context c)throws Exception {if(instance==null)instance=new AccountStore(c.getApplicationContext());return instance;}
 private final Context context;private final AtomicFile registryFile;private JSONObject registry;
 private final Map<String,SyncStore> syncStores=new HashMap<>();
 private final Map<String,ReplicaDatabase> databases=new HashMap<>();
 synchronized ReplicaDatabase database(String id)throws Exception{if(!databases.containsKey(id))databases.put(id,new ReplicaDatabase(directory(id)));return databases.get(id); }
 private AccountStore(Context c)throws Exception {
  context=c;registryFile=new AtomicFile(new File(c.getFilesDir(),"accounts.json"));
  try{registry=new JSONObject(new String(registryFile.readFully(),StandardCharsets.UTF_8));}
  catch(FileNotFoundException e){registry=new JSONObject().put("version",1).put("activeId","default").put("accounts",new JSONArray().put(record("default","账号 A","GxTodo")).put(record("account-b","账号 B","GxTodo-B")));save(registryFile,registry.toString());}
  if(registry.getInt("version")!=1||registry.getJSONArray("accounts").length()<1||registry.getJSONArray("accounts").length()>30)throw new Exception("账号清单格式错误，原数据已保留");
  Set<String> ids=new HashSet<>(),names=new HashSet<>();JSONArray list=registry.getJSONArray("accounts");
  for(int i=0;i<list.length();i++){JSONObject a=list.getJSONObject(i);String id=a.getString("id");if(!valid(id)||!ids.add(id)||!names.add(a.getString("name")))throw new Exception("账号清单包含重复或无效账号");name(a.getString("name"));folder(a.getString("defaultFolder"));}
  info("default");info(registry.getString("activeId"));
 }
 static boolean valid(String id){return id!=null&&id.matches("default|account-[a-z0-9-]{1,60}");}
 static String name(String value)throws Exception{String s=value.trim();if(s.isEmpty()||s.length()>32)throw new Exception("账号名称请输入 1–32 个字");return s;}
 static String folder(String value)throws Exception{String s=value.trim();if(!s.matches("[A-Za-z0-9_-]{1,60}"))throw new Exception("同步目录请使用 1–60 位字母、数字、下划线或短横线");return s;}
 private JSONObject record(String id,String name,String folder)throws Exception{return new JSONObject().put("id",id).put("name",name).put("defaultFolder",folder).put("createdAt",System.currentTimeMillis());}
 private JSONObject info(String id)throws Exception{if(!valid(id))throw new Exception("无效账号");JSONArray list=registry.getJSONArray("accounts");for(int i=0;i<list.length();i++)if(list.getJSONObject(i).getString("id").equals(id))return list.getJSONObject(i);throw new Exception("账号不存在");}
 synchronized String active() {return registry.optString("activeId","default");}
 synchronized String activeName()throws Exception{return info(active()).getString("name");}
 synchronized File directory(String id)throws Exception{info(id);File dir=id.equals("default")?context.getFilesDir():new File(context.getFilesDir(),"accounts/"+id);if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("无法创建账号目录");return dir;}
 private static void save(AtomicFile file,String json)throws IOException{FileOutputStream out=null;try{out=file.startWrite();out.write(json.getBytes(StandardCharsets.UTF_8));file.finishWrite(out);}catch(IOException e){if(out!=null)file.failWrite(out);throw e;}}
 synchronized String read(String id)throws Exception{if(database(id).initialized())return database(id).stateJSON();AtomicFile file=new AtomicFile(new File(directory(id),"state.json"));try{return new String(file.readFully(),StandardCharsets.UTF_8);}catch(FileNotFoundException e){return "";}}
 private void validateState(String json)throws Exception{if(json==null||json.getBytes(StandardCharsets.UTF_8).length>5*1024*1024)throw new Exception("数据不能超过 5 MB");JSONObject parsed=new JSONObject(json);if(parsed.getInt("version")!=1&&parsed.getInt("version")!=2)throw new Exception("不支持的数据版本");for(String field:Arrays.asList("tasks","notes","projects","tags","places"))parsed.getJSONArray(field);}
 synchronized void write(String id,String json)throws Exception{if(database(id).initialized())throw new Exception("请使用新版数据库保存入口");validateState(json);save(new AtomicFile(new File(directory(id),"state.json")),json);}
 synchronized JSONObject manage(JSONObject input)throws Exception{
  String op=input.getString("op");if(op.equals("list"))return new JSONObject(registry.toString());
  JSONObject next=new JSONObject(registry.toString());JSONArray list=next.getJSONArray("accounts");
  if(op.equals("create")){if(list.length()>=30)throw new Exception("最多支持 30 个账号");String n=name(input.getString("name")),id="account-"+UUID.randomUUID();String f=input.optString("folder").trim();if(f.isEmpty())f="GxTodo-"+id.substring(8,16);folder(f);for(int i=0;i<list.length();i++){JSONObject a=list.getJSONObject(i);if(a.getString("name").equals(n))throw new Exception("已有同名账号");if(a.getString("defaultFolder").equals(f))throw new Exception("请为新账号选择独立的同步目录");}list.put(record(id,n,f));}
  else if(op.equals("rename")){String id=input.getString("id"),n=name(input.getString("name"));info(id);for(int i=0;i<list.length();i++){JSONObject a=list.getJSONObject(i);if(!a.getString("id").equals(id)&&a.getString("name").equals(n))throw new Exception("已有同名账号");}for(int i=0;i<list.length();i++)if(list.getJSONObject(i).getString("id").equals(id))list.getJSONObject(i).put("name",n);}
  else if(op.equals("activate")){String id=input.getString("id");info(id);String data=read(id);if(!data.isEmpty())validateState(data);next.put("activeId",id);}
  else throw new Exception("不支持的账号操作");
  save(registryFile,next.toString());registry=next;return new JSONObject(registry.toString());
 }
 private synchronized SyncStore syncStore(String id)throws Exception{if(!syncStores.containsKey(id))syncStores.put(id,new SyncStore(directory(id),info(id).getString("defaultFolder")));return syncStores.get(id);}
 Object sync(String id,JSONObject input)throws Exception{if(input.getString("op").equals("replica"))return database(id).invoke(input);SyncStore selected=syncStore(id);if(!input.getString("op").equals("config-save"))return selected.invoke(input);synchronized(this){JSONObject c=input.getJSONObject("config");String user=c.optString("username").trim(),f=c.optString("folder","GxTodo").trim();folder(f);JSONArray list=registry.getJSONArray("accounts");if(!user.isEmpty())for(int i=0;i<list.length();i++){JSONObject other=list.getJSONObject(i);if(other.getString("id").equals(id))continue;JSONObject config=(JSONObject)syncStore(other.getString("id")).invoke(new JSONObject().put("op","config-get"));if(user.equalsIgnoreCase(config.optString("username"))&&f.equals(config.optString("folder")))throw new Exception("这个坚果云目录已绑定“"+other.getString("name")+"”，请使用不同目录");}return selected.invoke(input);}}
 static String reminderPrefs(Context c)throws Exception {String id=get(c).active();return id.equals("default")?"reminder-delivery":"reminder-delivery-"+id;}
}
