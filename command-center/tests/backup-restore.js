// Runs the actual backup/restore scripts against a disposable database.
// Requires host PostgreSQL clients, or ARCED_PG_TOOLS pointing to compatible wrappers.
import {spawnSync} from 'node:child_process';
import {mkdtemp,readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';
const databaseName=`arced_restore_verify_${Date.now()}`;
const restoredUrl=new URL(process.env.DATABASE_URL);restoredUrl.pathname='/'+databaseName;
const restoredFiles=path.join(await mkdtemp('/tmp/arced-restore-'),'files');
const env={...process.env,...(process.env.ARCED_PG_TOOLS?{PATH:process.env.ARCED_PG_TOOLS+path.delimiter+process.env.PATH}:{})};
const run=(program,args,extra={})=>{const r=spawnSync(program,args,{env:{...env,...extra},encoding:'utf8'});if(r.status!==0)throw Error(`${program} failed: ${r.stderr||r.stdout||r.error?.message}`);return r.stdout;};
const source=new pg.Client({connectionString:process.env.DATABASE_URL}),restored=new pg.Client({connectionString:restoredUrl.toString()});
try {
  await source.connect();
  await source.query(`CREATE DATABASE ${databaseName}`);
  const output=run('sh',['scripts/backup.sh']);
  const backup=output.match(/Backup created: (.+)/)?.[1];assert.ok(backup);
  run('sh',['scripts/restore.sh',backup],{RESTORE_DATABASE_URL:restoredUrl.toString(),RESTORE_UPLOAD_DIR:restoredFiles});
  await restored.connect();
  for(const table of ['clients','jobs','job_tasks','job_notes','job_files','change_orders','invoices','payments','daily_tasks','employees','employee_jobs','time_entries','business_expenses','equipment','equipment_events','time_corrections']){
    const before=await source.query(`SELECT count(*)::int AS count FROM ${table}`),after=await restored.query(`SELECT count(*)::int AS count FROM ${table}`);
    assert.equal(after.rows[0].count,before.rows[0].count,`${table} count differs`);
  }
  const files=(await restored.query('SELECT storage_key,sha256 FROM job_files')).rows;
  assert.ok(files.length>0,'Create at least one fictional file before verifying file backup');
  for(const f of files)assert.equal(createHash('sha256').update(await readFile(path.join(restoredFiles,f.storage_key))).digest('hex'),f.sha256);
  assert.ok((await readdir(restoredFiles)).length>=files.length);
  console.log(`PASS actual backup/restore scripts: 16 table counts match, ${files.length} private files verified by SHA-256`);
}finally{
  await restored.end().catch(()=>{});
  await source.query(`DROP DATABASE IF EXISTS ${databaseName}`).catch(()=>{});
  await source.end();
}
