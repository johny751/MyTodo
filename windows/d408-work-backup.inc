/* This is a standalone Windows candidate backup contract, not a shared
   Android/Web exchange format. Historical references are part of the archive. */
static int work_file_metadata(J *file){double size=num(file,"size");const char *hash=str(file,"sha256");return cJSON_IsNumber(get(file,"size"))&&isfinite(size)&&size>=0&&size<=10*1024*1024&&size==floor(size)&&strlen(hash)==64&&strspn(hash,"0123456789abcdef")==64;}
static J *work_backup_snapshot(int allowMissing){
 J *backup=cJSON_CreateObject(),*files=cJSON_CreateObject(),*references=work_attachments(workStore.data),*file;ss(backup,"format","mytodo.d408.work-backup");sn(backup,"version",1);ss(backup,"scope","windows-isolated-candidate");set(backup,"state",dup(workStore.data));set(backup,"files",files);int ok=1;
 cJSON_ArrayForEach(file,references){BYTE *bytes=0;DWORD size=0,length=0;ok=work_file_metadata(file)&&file_read(file,&bytes,&size);if(!ok){free(bytes);if(allowMissing){J *missing=get(backup,"missingAttachments");if(!missing){missing=cJSON_CreateArray();set(backup,"missingAttachments",missing);}cJSON_AddItemToArray(missing,dup(file));ok=1;continue;}break;}char *encoded=0;if(!size)encoded=_strdup("");else if(CryptBinaryToStringA(bytes,size,CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,0,&length)){encoded=calloc(length+1,1);ok=CryptBinaryToStringA(bytes,size,CRYPT_STRING_BASE64|CRYPT_STRING_NOCRLF,encoded,&length);}else ok=0;free(bytes);if(ok){J *existing=get(files,str(file,"id"));if(existing&&strcmp(str(files,str(file,"id")),encoded))ok=0;else if(!existing)ss(files,str(file,"id"),encoded);}free(encoded);if(!ok)break;
 }cJSON_Delete(references);if(!ok){cJSON_Delete(backup);return 0;}if(get(backup,"missingAttachments")){ss(backup,"format","mytodo.d408.work-incomplete-safety-snapshot");ss(backup,"warning","当前缺失或损坏的附件已逐项列出；此文件是恢复前结构证据，不是完整可恢复备份。");}return backup;
}
static J *work_backup(void){return work_backup_snapshot(0);}
static int work_backup_files(J *backup,int writing){
 J *references=work_attachments(get(backup,"state")),*file;int ok=cJSON_IsObject(get(backup,"files"));cJSON_ArrayForEach(file,references){if(!ok)break;J *encodedValue=get(get(backup,"files"),str(file,"id"));const char *encoded=str(get(backup,"files"),str(file,"id"));DWORD length=0;wchar_t *target=calloc(32768,sizeof(wchar_t));ok=work_file_metadata(file)&&file_path(target,file)&&cJSON_IsString(encodedValue);if(ok&&*encoded)ok=CryptStringToBinaryA(encoded,0,CRYPT_STRING_BASE64,0,&length,0,0);if(ok)ok=length<=10*1024*1024&&length==(DWORD)num(file,"size");BYTE *raw=ok?malloc(length?length:1):0;if(ok&&length)ok=CryptStringToBinaryA(encoded,0,CRYPT_STRING_BASE64,raw,&length,0,0);char hash[65];if(ok){d408_hash(raw,length,hash);ok=!strcmp(hash,str(file,"sha256"));}if(ok&&writing){if(GetFileAttributesW(target)!=INVALID_FILE_ATTRIBUTES){BYTE *existing=0;DWORD found=0;ok=d408_file_read(target,&existing,&found,10*1024*1024)&&found==length&&!memcmp(existing,raw,length);free(existing);}else ok=d408_file_write(target,raw,length);}free(raw);free(target);
 }cJSON_Delete(references);return ok;
}
static int restore_work_files(J *backup){return work_backup_files(backup,1);}
static int work_restore(J *backup){
 J *incoming=get(backup,"state");if(strcmp(str(backup,"format"),"mytodo.d408.work-backup")||num(backup,"version")!=1||!work_valid(incoming)||!work_backup_files(backup,0))return 0;
 J *before=work_backup_snapshot(1);char *text=before?json(before):0,safetyId[80];uuid(safetyId);wchar_t *safety=calloc(32768,sizeof(wchar_t)),*safeName=wide(safetyId);swprintf(safety,32768,L"%s\\work-before-restore-%s.json",workStore.directory,safeName);free(safeName);int ok=text&&d408_file_write(safety,(BYTE*)text,(DWORD)strlen(text));free(safety);free(text);cJSON_Delete(before);
 if(ok)ok=restore_work_files(backup);if(ok){J *next=dup(workStore.data);merge_work(next,incoming);ok=work_valid(next)&&d408_store_commit(&workStore,next);cJSON_Delete(next);}return ok;
}
static void backup_work(int importing){
 wchar_t *path=calloc(32768,sizeof(wchar_t));wcscpy(path,L"MyTodo-work-d408.json");OPENFILENAMEW of={sizeof(of)};of.hwndOwner=workWindow;of.lpstrFile=path;of.nMaxFile=32768;of.lpstrFilter=L"Windows 候选工作备份 JSON\0*.json\0\0";of.lpstrDefExt=L"json";of.Flags=OFN_NOCHANGEDIR|(importing?OFN_FILEMUSTEXIST:OFN_OVERWRITEPROMPT);if(!(importing?GetOpenFileNameW(&of):GetSaveFileNameW(&of))){free(path);return;}int ok=1;J *backup=0;
 if(!importing){backup=work_backup();char *encoded=backup?json(backup):0;ok=encoded&&d408_file_write(path,(BYTE*)encoded,(DWORD)strlen(encoded));free(encoded);}else{
  BYTE *bytes=0;DWORD size=0;ok=d408_file_read(path,&bytes,&size,64*1024*1024);backup=ok?cJSON_Parse((char*)bytes):0;free(bytes);J *incoming=get(backup,"state");ok=backup&&!strcmp(str(backup,"format"),"mytodo.d408.work-backup")&&num(backup,"version")==1&&work_valid(incoming);
  if(ok&&MessageBoxW(workWindow,L"合并此 Windows 独立候选备份？较新记录替换前保留历史，同时间或较旧差异保留独立冲突副本；恢复前先写安全快照；当前缺失附件将列明，完整备份可用于补回缺失文件。此格式不代表 Android / Web 互通。",L"恢复候选工作数据",MB_OKCANCEL|MB_ICONQUESTION)!=IDOK){cJSON_Delete(backup);free(path);return;}
  if(ok)ok=work_restore(backup);
 }cJSON_Delete(backup);free(path);refresh_projects();work_refresh();if(!ok)d408_error(workWindow,"工作备份操作未完成，原记录与恢复前备份保留；请检查当前及历史附件、格式和写入权限后重试。");else ui_set(wc(W_NOTICE),importing?"工作记录、历史及实际附件已恢复；冲突副本保留，可在列表中编辑查看。":"工作记录、历史和附件已导出为 Windows 独立候选备份。");
}
