import pg from 'pg';
import knex from 'knex';
import {readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();const name='arced_upgrade_test_'+Date.now(),url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;let k;
try{
 await admin.query(`CREATE DATABASE ${name}`);k=knex({client:'pg',connection:url.toString()});
 for(const file of (await readdir('migrations')).filter(n=>/^00[1-6]_.*\.js$/.test(n)).sort())await k.migrate.up({directory:'migrations',name:file});
 const [u]=await k('users').insert({name:'Upgrade fixture',email:'upgrade@example.test',password_hash:'non-login-fixture',role:'owner'}).returning('*');const [c]=await k('clients').insert({name:'Upgrade client'}).returning('*');const [e]=await k('estimates').insert({client_id:c.id,title:'Upgrade estimate',items:'[]',total_cents:10000,status:'approved'}).returning('*');const [j]=await k('jobs').insert({estimate_id:e.id,client_id:c.id,title:'Upgrade job',contract_cents:10000}).returning('*');const [employee]=await k('employees').insert({user_id:u.id,name:'Upgrade employee',email:u.email,hourly_rate_cents:2500}).returning('*');
 const base={employee_id:employee.id,job_id:j.id,clock_in:new Date('2026-10-01T12:00:00Z'),clock_out:new Date('2026-10-01T13:00:00Z'),worked_seconds:3600,rate_cents:2500,cost_cents:2500};const [pending,approved]=await k('time_entries').insert([{...base,version:3},{...base,version:2,approved_by:u.id,approved_at:new Date('2026-10-02T12:00:00Z')}]).returning('*');
 const [cost]=await k('expenses').insert({job_id:j.id,category:'labor',description:'Existing approved labor',amount_cents:2500,time_entry_id:approved.id}).returning('*');
 const [file]=await k('job_files').insert({job_id:j.id,user_id:u.id,storage_key:randomUUID(),filename:'legacy.png',mime_type:'image/png',size_bytes:10,sha256:'fixture'}).returning('*');
 await k.migrate.latest({directory:'migrations'});
 const afterPending=await k('time_entries').where({id:pending.id}).first(),afterApproved=await k('time_entries').where({id:approved.id}).first();
 for(const before of [pending,approved]){const after=before.id===pending.id?afterPending:afterApproved;for(const [key,value] of Object.entries(before))assert.deepEqual(after[key],value,`Existing ${key} changed`);}
 assert.equal(afterPending.review_status,'legacy_pending');assert.equal(afterPending.submitted_version,3);assert.equal(afterPending.submitted_at,null);assert.equal(afterApproved.review_status,'approved');
 assert.deepEqual(await k('expenses').where({id:cost.id}).first(),cost);assert.equal((await k('expenses')).length,1);
 const afterFile=await k('job_files').where({id:file.id}).first();for(const [key,value] of Object.entries(file))assert.deepEqual(afterFile[key],value);assert.equal(afterFile.equipment_id,null);assert.equal(afterFile.business_expense_id,null);
 assert.equal((await k('users')).length,1);assert.equal((await k.migrate.latest({directory:'migrations'}))[1].length,0);
 console.log('PASS upgrade v6→v7: legacy pending eligibility without implied consent, approved locks/costs, existing job files, users and repeat migration preserved');
}finally{if(k)await k.destroy();await admin.query(`DROP DATABASE IF EXISTS ${name}`);await admin.end();}
