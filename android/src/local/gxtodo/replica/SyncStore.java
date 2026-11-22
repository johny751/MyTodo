package local.gxtodo.replica;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONObject;
import java.io.*;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Device credentials never enter state.json, exports, or the WebView. */
final class SyncStore {
 private final AtomicFile configFile,baseFile;
 private final String defaultFolder;
 private JSONObject cachedConfig;
 private static final String ALIAS="gxtodo-webdav";
 SyncStore(File directory,String folder){defaultFolder=folder;configFile=new AtomicFile(new File(directory,"sync-config.enc"));baseFile=new AtomicFile(new File(directory,"sync-base.json"));}
 private SecretKey key() throws Exception {KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);if(!store.containsAlias(ALIAS)){KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());generator.generateKey();}return (SecretKey)store.getKey(ALIAS,null);}
 private byte[] encrypt(String value)throws Exception{Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());ByteArrayOutputStream out=new ByteArrayOutputStream();out.write(cipher.getIV());out.write(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)));return out.toByteArray();}
 private String decrypt(byte[] value)throws Exception{Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,value,0,12));return new String(cipher.doFinal(value,12,value.length-12),StandardCharsets.UTF_8);}
 private JSONObject config()throws Exception{if(cachedConfig!=null)return cachedConfig;try{return cachedConfig=new JSONObject(decrypt(configFile.readFully()));}catch(FileNotFoundException missing){return new JSONObject().put("folder",defaultFolder);}}
 private void save(AtomicFile file,byte[] bytes)throws Exception{FileOutputStream out=null;try{out=file.startWrite();out.write(bytes);file.finishWrite(out);}catch(Exception e){if(out!=null)file.failWrite(out);throw e;}}
 private String scope(JSONObject c){return new org.json.JSONArray().put(c.optString("username")).put(c.optString("folder","GxTodo")).toString();}
 private JSONObject redacted(JSONObject c)throws Exception{return new JSONObject().put("scope",scope(c)).put("enabled",c.optBoolean("enabled")).put("autoSync",c.optBoolean("autoSync",true)).put("username",c.optString("username")).put("folder",c.optString("folder","GxTodo")).put("configured",!c.optString("password").isEmpty());}
 synchronized Object invoke(JSONObject input)throws Exception{
  String op=input.getString("op");JSONObject c=config();
  if((op.equals("request")||op.equals("base-get")||op.equals("base-save"))&&!input.optString("scope").equals(scope(c)))throw new Exception("同步设置已经改变，请重新同步");
  if(op.equals("config-get"))return redacted(c);
  if(op.equals("config-save")){JSONObject next=input.getJSONObject("config");String user=next.optString("username").trim(),folder=next.optString("folder","GxTodo").trim(),password=next.optString("password");if(password.isEmpty())password=c.optString("password");if(!folder.matches("[A-Za-z0-9_-]{1,60}"))throw new Exception("同步目录请使用 1–60 位字母、数字、下划线或短横线");if(next.optBoolean("enabled")&&(user.isEmpty()||password.isEmpty()))throw new Exception("请输入坚果云账号和第三方应用密码");JSONObject stored=new JSONObject().put("enabled",next.optBoolean("enabled")).put("autoSync",next.optBoolean("autoSync",true)).put("username",user).put("folder",folder).put("password",password);if(!user.equals(c.optString("username"))||!folder.equals(c.optString("folder")))save(baseFile,"null".getBytes(StandardCharsets.UTF_8));save(configFile,encrypt(stored.toString()));cachedConfig=stored;return redacted(stored);}
  if(op.equals("base-get")){try{String json=new String(baseFile.readFully(),StandardCharsets.UTF_8);return json.equals("null")?JSONObject.NULL:new JSONObject(json);}catch(FileNotFoundException missing){return JSONObject.NULL;}}
  if(op.equals("base-save")){save(baseFile,input.get("base").toString().getBytes(StandardCharsets.UTF_8));return new JSONObject().put("ok",true);}
  if(!op.equals("request"))throw new Exception("不支持的同步操作");
  if(!c.optBoolean("enabled"))throw new Exception("请先启用并保存坚果云同步设置");String folder=c.getString("folder");if(!folder.matches("[A-Za-z0-9_-]{1,60}"))throw new Exception("同步目录无效");String url="https://dav.jianguoyun.com/dav/"+folder+"/",method=input.getString("method");
  String relative=input.optString("path","state.json");if(!(relative.equals("state.json")||relative.equals("v2/")||relative.matches("v2/[A-Za-z0-9_.-]+")))throw new Exception("同步路径无效");
  if(method.equals("MKCOL")){JSONObject parent=request(c,url,"MKCOL",null,null);int status=parent.getInt("status");if(status!=200&&status!=201&&status!=204&&status!=405)return parent;return request(c,url+relative,"MKCOL",null,null);}
  String etag=input.isNull("etag")?null:input.optString("etag",null);
  if(method.equals("GET"))return request(c,url+relative,method,null,etag);
  if(!method.equals("PUT"))throw new Exception("不支持的同步方法");String body=input.getString("body");if(body.getBytes(StandardCharsets.UTF_8).length>8*1024*1024)throw new Exception("单个同步文件过大");
  if(etag==null&&!input.has("path")){JSONObject dir=request(c,url,"MKCOL",null,null);int status=dir.getInt("status");if(status!=200&&status!=201&&status!=204&&status!=405)return dir;}
  return request(c,url+relative,method,body,etag);
 }
 // Android HttpURLConnection rejects extension methods such as MKCOL.
 // Use a bounded HTTP/1.1 exchange for this empty request, with platform trust
 // validation and HTTPS hostname verification still enabled.
 private JSONObject makeCollection(JSONObject config,String target)throws Exception{
  URL url=new URL(target);if(!"https".equals(url.getProtocol())||!"dav.jianguoyun.com".equals(url.getHost()))throw new IOException("同步地址无效");
  try(javax.net.ssl.SSLSocket socket=(javax.net.ssl.SSLSocket)javax.net.ssl.SSLSocketFactory.getDefault().createSocket()){
   socket.connect(new java.net.InetSocketAddress(url.getHost(),443),20000);socket.setSoTimeout(20000);javax.net.ssl.SSLParameters parameters=socket.getSSLParameters();parameters.setEndpointIdentificationAlgorithm("HTTPS");socket.setSSLParameters(parameters);socket.startHandshake();
   String auth=Base64.encodeToString((config.getString("username")+":"+config.getString("password")).getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP);
   String request="MKCOL "+url.getFile()+" HTTP/1.1\r\nHost: "+url.getHost()+"\r\nAuthorization: Basic "+auth+"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";OutputStream out=socket.getOutputStream();out.write(request.getBytes(StandardCharsets.US_ASCII));out.flush();
   InputStream in=socket.getInputStream();ByteArrayOutputStream line=new ByteArrayOutputStream();int b;while((b=in.read())!=-1&&b!='\n'){if(line.size()>=4096)throw new IOException("无效的 WebDAV 响应");line.write(b);}String status=line.toString("US-ASCII").trim();if(!status.matches("HTTP/1\\.[01] [0-9]{3}.*"))throw new IOException("无法读取 WebDAV 响应");return new JSONObject().put("status",Integer.parseInt(status.substring(9,12))).put("body","").put("etag",JSONObject.NULL);
  }
 }
 private JSONObject request(JSONObject config,String url,String method,String body,String etag)throws Exception{
  if(method.equals("MKCOL"))return makeCollection(config,url);
  HttpsURLConnection conn=(HttpsURLConnection)new URL(url).openConnection();conn.setConnectTimeout(20000);conn.setReadTimeout(20000);conn.setInstanceFollowRedirects(false);conn.setRequestMethod(method);
  String auth=config.getString("username")+":"+config.getString("password");conn.setRequestProperty("Authorization","Basic "+Base64.encodeToString(auth.getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP));
  if(method.equals("GET")&&etag!=null)conn.setRequestProperty("If-None-Match",etag);
  try{if(method.equals("PUT")){conn.setDoOutput(true);conn.setRequestProperty("Content-Type",url.endsWith(".gz")?"application/gzip":"application/json; charset=utf-8");conn.setRequestProperty(etag==null?"If-None-Match":"If-Match",etag==null?"*":etag);byte[] bytes=body.getBytes(StandardCharsets.UTF_8);if(url.endsWith(".gz")){ByteArrayOutputStream compressed=new ByteArrayOutputStream();try(java.util.zip.GZIPOutputStream gzip=new java.util.zip.GZIPOutputStream(compressed)){gzip.write(bytes);}bytes=compressed.toByteArray();}conn.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=conn.getOutputStream()){out.write(bytes);}}
   int status=conn.getResponseCode();String content="";if(method.equals("GET")&&status==200){try(InputStream in=url.endsWith(".gz")?new java.util.zip.GZIPInputStream(conn.getInputStream()):conn.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[8192];int length;while((length=in.read(buffer))!=-1){if(out.size()+length>8*1024*1024)throw new IOException("云端数据超过 5 MB，未作覆盖");out.write(buffer,0,length);}content=out.toString("UTF-8");}}
   return new JSONObject().put("status",status).put("body",content).put("etag",conn.getHeaderField("ETag")==null?JSONObject.NULL:conn.getHeaderField("ETag"));
  }finally{conn.disconnect();}
 }
}
