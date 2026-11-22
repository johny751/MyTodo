import fs from 'node:fs/promises';
import {crc32,deflateRawSync} from 'node:zlib';
import path from 'node:path';
// Ordinary ZIP with UTF-8 names; no platform code-page dependence.
export async function writeZip(output,baseName,dir,files){
 if(files.length>65535)throw Error('Too many ZIP entries');
 const target=await fs.open(output,'wx'),central=[];let offset=0;const now=new Date();
 const year=Math.max(1980,Math.min(2107,now.getUTCFullYear()));
 const date=((year-1980)<<9)|((now.getUTCMonth()+1)<<5)|now.getUTCDate();
 const time=(now.getUTCHours()<<11)|(now.getUTCMinutes()<<5)|Math.floor(now.getUTCSeconds()/2);
 try{
  for(const file of files){
   const name=Buffer.from(baseName+'/'+file.path,'utf8'),data=await fs.readFile(path.join(dir,file.path)),compressed=deflateRawSync(data,{level:6});
   if(data.length>0xffffffff||compressed.length>0xffffffff||offset+30+name.length+compressed.length>0xffffffff)throw Error('ZIP64 required');
   const crc=crc32(data),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(time,10);local.writeUInt16LE(date,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
   await target.writeFile(local);await target.writeFile(name);await target.writeFile(compressed);
   const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(8,10);entry.writeUInt16LE(time,12);entry.writeUInt16LE(date,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(0x20,38);entry.writeUInt32LE(offset,42);
   central.push(entry,name);offset+=local.length+name.length+compressed.length;
  }
  const centralBuffer=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralBuffer.length,12);end.writeUInt32LE(offset,16);await target.writeFile(centralBuffer);await target.writeFile(end);
 }finally{await target.close();}
}
export async function zipNames(file){
 const zip=await fs.readFile(file),end=zip.length-22;
 if(end<0||zip.readUInt32LE(end)!==0x06054b50)throw Error('Invalid ZIP end record');
 const count=zip.readUInt16LE(end+10),names=[];let offset=zip.readUInt32LE(end+16);
 for(let i=0;i<count;i++){
  if(offset+46>zip.length||zip.readUInt32LE(offset)!==0x02014b50||!(zip.readUInt16LE(offset+8)&0x800))throw Error('Invalid UTF-8 ZIP directory');
  const nameLength=zip.readUInt16LE(offset+28),extraLength=zip.readUInt16LE(offset+30),commentLength=zip.readUInt16LE(offset+32);names.push(zip.subarray(offset+46,offset+46+nameLength).toString('utf8'));offset+=46+nameLength+extraLength+commentLength;
 }
 return names;
}
