// Real abrupt process exit: never gracefully closes SQLite or checkpoints.
import path from 'node:path';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {openRoot,fixtureMarker,json} from '../../admission/guard.mjs';
import {seed,event} from './factory.mjs';
const context=await openRoot(process.argv[2]),name=process.argv[3];if(name!=='process-wal')throw Error('Fixed crash fixture required');await fixtureMarker(context,name);
const db=new DatabaseSync(path.join(context.root,name,'source.sqlite'));seed(db,{typed:false});
db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO outbox(id,event) VALUES(?,?)').run(9,JSON.stringify(event(2)));db.exec('COMMIT');
db.exec('BEGIN IMMEDIATE');db.prepare('INSERT INTO outbox(id,event) VALUES(?,?)').run(10,JSON.stringify(event(2)));
fs.writeFileSync(path.join(context.root,name,'child-exit.json'),json({syntheticOnly:true,sourceSha:context.sourceSha,runId:context.runId,pid:process.pid,committedIds:[8,9],uncommittedId:10,exitCode:90}),{flag:'wx'});
process.exit(90);
