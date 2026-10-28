import {tmpdir} from 'node:os';
import path from 'node:path';
import {checklistView} from '../shared/checklist.js';
import {test,after,before} from 'node:test';
import {businessInstant,businessLocal} from '../shared/business-time.js';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {db} from '../server/db.js';
import {createApp,total,sessionPool} from '../server/app.js';
if(!new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))throw Error('Tests require a separate database named *_test');
process.env.NODE_ENV='test';
process.env.SESSION_SECRET='test-only-secret-at-least-32-characters-long';
const uploadBase=await mkdtemp(path.join(tmpdir(),'arced-file-test-'));process.env.UPLOAD_DIR=uploadBase+'/.private/uploads';
const app=createApp(),agent=request.agent(app);let csrf,owner,crewSession;
const post=(path,b)=>agent.post('/api/'+path).set('x-csrf-token',csrf).send(b);
before(async()=>{await db.migrate.latest({directory:'./migrations'});await db.raw('TRUNCATE users,divisions,clients,properties,leads,estimates,jobs,invoices,payments,expenses,audit,session RESTART IDENTITY CASCADE');[owner]=await db('users').insert({email:'owner@test.invalid',name:'Test owner',role:'owner',password_hash:await bcrypt.hash('correct-password',4)}).returning('*');csrf=(await agent.get('/api/session')).body.csrf;const login=await post('login',{email:owner.email,password:'correct-password'});assert.equal(login.status,200);csrf=login.body.csrf;});
after(async()=>{await db.destroy();await sessionPool.end();await rm(uploadBase,{recursive:true,force:true});});
test('integer money arithmetic',()=>assert.equal(total([{quantity:3,unit_cents:1999},{quantity:1,unit_cents:1}]),5998));
test('authentication and CSRF are enforced',async()=>{assert.equal((await request(app).get('/api/records')).status,401);assert.equal((await agent.post('/api/leads').send({})).status,403);});
test('lead → approved estimate → scheduled job → invoice → payments, with constraints',async()=>{
let r=await post('leads',{name:'Fictional Bergen client',address:'Demo property, NJ',scope:'Kitchen work'});assert.equal(r.status,201);const lead=r.body.id;
r=await post(`leads/${lead}/convert`,{});assert.equal(r.status,200);const {client_id,property_id}=r.body;assert.deepEqual((await post(`leads/${lead}/convert`,{})).body,r.body);
r=await post('estimates',{client_id,property_id,title:'Kitchen',items:[{description:'Work',quantity:2,unit_cents:50000}]});assert.equal(r.status,201);const estimate=r.body.id;
assert.equal((await post(`estimates/${estimate}/convert`,{})).status,409);
r=await agent.patch(`/api/estimates/${estimate}`).set('x-csrf-token',csrf).send({version:1,title:'Kitchen revised',scope:'Agreed work',items:[{description:'Work',quantity:3,unit_cents:50000}]});assert.equal(r.status,200);assert.equal(Number(r.body.total_cents),150000);
r=await post(`estimates/${estimate}/approve`,{signer:'Fictional client',consent:true});assert.equal(r.status,200);assert.equal(r.body.approved_document.version,2);
const converted=await Promise.all([post(`estimates/${estimate}/convert`,{}),post(`estimates/${estimate}/convert`,{})]);assert.equal(converted[0].body.id,converted[1].body.id);const job=converted[0].body.id;
r=await post(`jobs/${job}/schedule`,{crew:'Crew A',starts_at:'2026-11-02T09:00:00-05:00',ends_at:'2026-11-02T17:00:00-05:00'});assert.equal(r.status,200);
const [other]=await db('estimates').insert({client_id,title:'Other work',items:'[]',total_cents:100,status:'approved'}).returning('*');const otherJob=(await post(`estimates/${other.id}/convert`,{})).body;
r=await post(`jobs/${otherJob.id}/schedule`,{crew:'crew a',starts_at:'2026-11-02T10:00:00-05:00',ends_at:'2026-11-02T11:00:00-05:00'});assert.equal(r.status,409);
r=await post('expenses',{job_id:job,category:'materials',description:'Lumber',amount_cents:20000});assert.equal(r.status,201);
const key=randomUUID();r=await post('invoices',{job_id:job,total_cents:50000,kind:'deposit',due_date:'2026-11-01',request_key:key});assert.equal(r.status,201);assert.equal(r.body.due_date,'2026-11-01');const invoice=r.body.id;assert.equal((await post('invoices',{job_id:job,total_cents:50000,kind:'deposit',due_date:'2026-11-01',request_key:key})).body.id,invoice);
assert.equal((await post('invoices',{job_id:job,total_cents:100001,kind:'final',due_date:'2026-11-10',request_key:randomUUID()})).status,409);
assert.equal((await post('invoices',{job_id:job,total_cents:50000,kind:'progress',due_date:'2026-11-01',request_key:key})).status,409);
const payment={invoice_id:invoice,amount_cents:20000,method:'cash',request_key:randomUUID()};r=await post('payments',payment);assert.equal(r.status,201);assert.equal((await post('payments',payment)).body.id,r.body.id);assert.equal((await post('payments',{...payment,method:'check'})).status,409);assert.equal((await post('payments',{...payment,amount_cents:30001,request_key:randomUUID()})).status,409);assert.equal((await post('payments',{...payment,amount_cents:30000,request_key:randomUUID()})).status,201);
const records=(await agent.get('/api/records')).body;assert.equal(records.payments.filter(p=>p.invoice_id===invoice).reduce((s,p)=>s+Number(p.amount_cents),0),50000);assert.equal(records.expenses.reduce((s,e)=>s+Number(e.amount_cents),0),20000);
const restarted=request.agent(createApp());let token=(await restarted.get('/api/session')).body.csrf;const login=await restarted.post('/api/login').set('x-csrf-token',token).send({email:owner.email,password:'correct-password'});assert.equal(login.status,200);assert.ok((await restarted.get('/api/records')).body.jobs.find(j=>j.id===job));
});
test('client and worker roles cannot access office records or mutate finances',async()=>{for(const role of ['client','worker']){const email=`${role}@test.invalid`;await db('users').insert({email,name:role,role,password_hash:await bcrypt.hash('correct-password',4)});const a=request.agent(app);let token=(await a.get('/api/session')).body.csrf;const l=await a.post('/api/login').set('x-csrf-token',token).send({email,password:'correct-password'});assert.equal(l.status,200);token=l.body.csrf;assert.equal((await a.get('/api/records')).status,403);assert.equal((await a.post('/api/payments').set('x-csrf-token',token).send({})).status,403);}});

async function createJob(label='Workspace job') {
  const [c]=await db('clients').insert({name:'Fictional workspace client'}).returning('*');
  const estimate=await post('estimates',{client_id:c.id,title:label,items:[{description:'Original work',quantity:1,unit_cents:100000}]});
  assert.equal(estimate.status,201);
  assert.equal((await post(`estimates/${estimate.body.id}/approve`,{signer:'Fictional client',consent:true})).status,200);
  const result=await post(`estimates/${estimate.body.id}/convert`,{});
  assert.equal(result.status,200);return result.body;
}

test('client and property editing enforce versions and property ownership',async()=>{
  let r=await post('clients',{name:'New fictional client',email:'client@example.test',billing_address:'Billing address',notes:'Private office notes'});
  assert.equal(r.status,201);const c=r.body;
  r=await agent.patch(`/api/clients/${c.id}`).set('x-csrf-token',csrf).send({name:'Updated fictional client',email:c.email,billing_address:'New billing address',notes:c.notes,version:c.version});
  assert.equal(r.status,200);assert.equal(r.body.version,2);
  assert.equal((await agent.patch(`/api/clients/${c.id}`).set('x-csrf-token',csrf).send({name:'Stale change',version:1})).status,409);
  r=await post(`clients/${c.id}/properties`,{address:'Service property in Bergen County',access_notes:'Private lockbox instructions'});
  assert.equal(r.status,201);const p=r.body;
  assert.equal((await agent.patch(`/api/clients/${c.id+100000}/properties/${p.id}`).set('x-csrf-token',csrf).send({address:'Wrong client',version:1})).status,404);
  r=await agent.patch(`/api/clients/${c.id}/properties/${p.id}`).set('x-csrf-token',csrf).send({address:'Updated service property',access_notes:'Private updated instructions',version:1});
  assert.equal(r.status,200);assert.equal(r.body.version,2);
  assert.equal((await agent.patch(`/api/clients/${c.id}/properties/${p.id}`).set('x-csrf-token',csrf).send({address:'Stale property',version:1})).status,409);
  const other=await post('clients',{name:'Another client'});
  assert.equal((await post('estimates',{client_id:other.body.id,property_id:p.id,title:'Mismatched property',items:[{description:'Test',quantity:1,unit_cents:1}]})).status,400);
});

test('change approval updates contract and budget once, preserves approved scope and billing limits',async()=>{
  const j=await createJob();
  let r=await agent.patch(`/api/jobs/${j.id}/budget`).set('x-csrf-token',csrf).send({version:j.version,budget_cents:40000});
  assert.equal(r.status,200);assert.equal(Number(r.body.budget_cents),40000);
  assert.equal((await agent.patch(`/api/jobs/${j.id}/budget`).set('x-csrf-token',csrf).send({version:j.version,budget_cents:90000})).status,409);
  const draft={title:'Add lighting',scope:'Install two fixtures\nExclude patching',amount_cents:25000,budget_delta_cents:10000,request_key:randomUUID()};
  r=await post(`jobs/${j.id}/change-orders`,draft);assert.equal(r.status,201);const c=r.body;
  assert.equal((await post(`jobs/${j.id}/change-orders`,draft)).body.id,c.id);
  assert.equal((await post(`jobs/${j.id}/change-orders`,{...draft,title:'Different change'})).status,409);
  let stored=await db('jobs').where({id:j.id}).first();assert.equal(Number(stored.contract_cents),100000);assert.equal(Number(stored.budget_cents),40000);
  const approvals=await Promise.all([post(`jobs/${j.id}/change-orders/${c.id}/approve`,{version:1,signer:'Fictional signer',consent:true}),post(`jobs/${j.id}/change-orders/${c.id}/approve`,{version:1,signer:'Fictional signer',consent:true})]);
  for(const a of approvals){assert.equal(a.status,200);assert.equal(a.body.status,'approved');assert.equal(a.body.approved_document.scope,draft.scope);assert.equal(a.body.approved_document.version,1);}
  stored=await db('jobs').where({id:j.id}).first();assert.equal(Number(stored.contract_cents),125000);assert.equal(Number(stored.original_contract_cents),100000);assert.equal(Number(stored.budget_cents),50000);
  assert.equal((await db('audit').where({entity:'job',entity_id:j.id,action:'staff_recorded_change_approval'})).length,1);
  r=await post('invoices',{job_id:j.id,total_cents:125000,kind:'final',due_date:'2026-12-01',request_key:randomUUID()});assert.equal(r.status,201);
  assert.equal((await post('invoices',{job_id:j.id,total_cents:1,kind:'progress',due_date:'2026-12-01',request_key:randomUUID()})).status,409);
  const reduction=(await post(`jobs/${j.id}/change-orders`,{title:'Reduction',scope:'Remove work',amount_cents:-1,budget_delta_cents:0,request_key:randomUUID()})).body;
  r=await post(`jobs/${j.id}/change-orders/${reduction.id}/approve`,{version:1,signer:'Signer',consent:true});assert.equal(r.status,409);
  stored=await db('jobs').where({id:j.id}).first();assert.equal(Number(stored.contract_cents),125000);assert.equal((await db('change_orders').where({id:reduction.id}).first()).status,'draft');
});

test('change approval rolls back invalid cost budgets and rejects wrong-job access',async()=>{
  const j=await createJob(),other=await createJob('Other workspace');
  const c=(await post(`jobs/${j.id}/change-orders`,{title:'Invalid budget reduction',scope:'Reduce cost budget below zero',amount_cents:100,budget_delta_cents:-1,request_key:randomUUID()})).body;
  assert.equal((await post(`jobs/${other.id}/change-orders/${c.id}/approve`,{version:1,signer:'Signer',consent:true})).status,404);
  assert.equal((await post(`jobs/${j.id}/change-orders/${c.id}/approve`,{version:1,signer:'Signer',consent:true})).status,409);
  const stored=await db('jobs').where({id:j.id}).first();assert.equal(Number(stored.contract_cents),100000);assert.equal(Number(stored.budget_cents),0);
});

test('checklist completion, private notes, stale task edits and reopening are enforced',async()=>{
  const j=await createJob('Checklist job'),other=await createJob('Other checklist job');
  let r=await post(`jobs/${j.id}/tasks`,{title:'Final inspection',due_date:'2026-11-20'});assert.equal(r.status,201);const task=r.body;assert.equal(task.due_date,'2026-11-20');
  assert.equal((await post(`jobs/${j.id}/complete`,{})).status,409);
  r=await agent.patch(`/api/jobs/${other.id}/tasks/${task.id}`).set('x-csrf-token',csrf).send({version:1,status:'done'});assert.equal(r.status,404);
  r=await agent.patch(`/api/jobs/${j.id}/tasks/${task.id}`).set('x-csrf-token',csrf).send({version:1,status:'done'});assert.equal(r.status,200);
  assert.equal((await agent.patch(`/api/jobs/${j.id}/tasks/${task.id}`).set('x-csrf-token',csrf).send({version:1,status:'open'})).status,409);
  assert.equal((await post(`jobs/${j.id}/notes`,{body:'Private access info\nDo not print.'})).status,201);
  const detail=await agent.get(`/api/jobs/${j.id}`);assert.equal(detail.status,200);assert.equal(detail.body.notes[0].author,owner.name);assert.equal(detail.body.tasks[0].status,'done');
  assert.equal((await post(`jobs/${j.id}/complete`,{})).status,200);
  assert.equal((await post(`jobs/${j.id}/tasks`,{title:'Too late'})).status,409);
  assert.equal((await agent.patch(`/api/jobs/${j.id}/tasks/${task.id}`).set('x-csrf-token',csrf).send({version:2,status:'open'})).status,409);
  assert.equal((await post(`jobs/${j.id}/schedule`,{crew:'Crew',starts_at:'2026-12-01T09:00:00-05:00',ends_at:'2026-12-01T10:00:00-05:00'})).status,409);
  assert.equal((await post(`jobs/${j.id}/reopen`,{})).status,200);
  assert.equal((await agent.patch(`/api/jobs/${j.id}/tasks/${task.id}`).set('x-csrf-token',csrf).send({version:2,status:'open'})).status,200);
});

test('disabled divisions cannot be selected for new estimates',async()=>{
  const [d]=await db('divisions').insert({name:'Test division'}).returning('*');
  let r=await agent.patch(`/api/divisions/${d.id}`).set('x-csrf-token',csrf).send({name:'Renamed division',enabled:false});assert.equal(r.status,200);
  const c=await db('clients').first();
  r=await post('estimates',{client_id:c.id,division_id:d.id,title:'Disabled division',items:[{description:'Test',quantity:1,unit_cents:1}]});assert.equal(r.status,400);
});

test('permissions reflect role changes immediately and financial job mutations require office authority',async()=>{
  const j=await createJob('Permission job');
  const c=(await post(`jobs/${j.id}/change-orders`,{title:'Role test',scope:'Scope',amount_cents:100,budget_delta_cents:0,request_key:randomUUID()})).body;
  try{
    await db('users').where({id:owner.id}).update({role:'estimator'});
    assert.equal((await agent.patch(`/api/jobs/${j.id}/budget`).set('x-csrf-token',csrf).send({version:1,budget_cents:100})).status,403);
    assert.equal((await post(`jobs/${j.id}/change-orders/${c.id}/approve`,{version:1,signer:'Signer',consent:true})).status,403);
    await db('users').where({id:owner.id}).update({role:'worker'});
    assert.equal((await agent.get(`/api/jobs/${j.id}`)).status,403);
    assert.equal((await post(`jobs/${j.id}/notes`,{body:'Unauthorized'})).status,403);
  }finally{await db('users').where({id:owner.id}).update({role:'owner'});}
});

test('New York scheduling is device-independent and rejects DST gaps and repeated times',()=>{
assert.equal(businessInstant('2026-01-12T09:00'),'2026-01-12T14:00:00Z');
assert.equal(businessInstant('2026-07-12T09:00'),'2026-07-12T13:00:00Z');assert.equal(businessInstant('2026-07-12T09:00:30'),'2026-07-12T13:00:30Z');assert.equal(businessLocal('2026-07-12T13:00:30Z','second'),'2026-07-12T09:00:30');
assert.equal(businessLocal('2026-07-12T13:00:00Z'),'2026-07-12T09:00');
assert.throws(()=>businessInstant('2026-03-08T02:30'),/daylight-saving/);
assert.throws(()=>businessInstant('2026-11-01T01:30'),/daylight-saving/);
assert.throws(()=>businessInstant('2026-02-30T09:00'),/invalid/);
});

test('private uploads validate file type and size, enforce job matching and office access',async()=>{
  const j=await createJob('File job'),other=await createJob('Wrong file job');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6S1cAAAAASUVORK5CYII=','base64');
  let r=await agent.post(`/api/jobs/${j.id}/files`).set('x-csrf-token',csrf).attach('file',png,{filename:'receipt.png',contentType:'image/png'});
  assert.equal(r.status,201);const f=r.body;assert.equal(f.filename,'receipt.png');assert.equal(f.size_bytes,png.length);assert.equal(f.storage_key,undefined);
  r=await agent.get(`/api/jobs/${j.id}/files/${f.id}`);assert.equal(r.status,200);assert.match(r.headers['content-disposition'],/filename=(?:"receipt\.png"|receipt\.png)(?:;|$)/);assert.equal(r.headers['cache-control'],'private, no-store');assert.ok(r.body.equals(png));
  assert.equal((await agent.get(`/api/jobs/${other.id}/files/${f.id}`)).status,404);
  assert.equal((await request(app).get(`/api/jobs/${j.id}/files/${f.id}`)).status,401);
  r=await agent.post(`/api/jobs/${j.id}/files`).set('x-csrf-token',csrf).attach('file',Buffer.from('<svg onload="alert(1)"></svg>'),{filename:'unsafe.png',contentType:'image/png'});assert.equal(r.status,400);
  r=await agent.post(`/api/jobs/${j.id}/files`).set('x-csrf-token',csrf).attach('file',Buffer.alloc(10*1024*1024+1),{filename:'large.png',contentType:'image/png'});assert.equal(r.status,413);
  r=await agent.post(`/api/jobs/${j.id}/files`).set('x-csrf-token',csrf).attach('file',png,{filename:'misleading.html',contentType:'text/html'});assert.equal(r.status,201);assert.equal(r.body.filename,'misleading.png');assert.equal(r.body.mime_type,'image/png');
  for(const role of ['worker','client']){
    const a=request.agent(app);const token=(await a.get('/api/session')).body.csrf;const l=await a.post('/api/login').set('x-csrf-token',token).send({email:`${role}@test.invalid`,password:'correct-password'});assert.equal(l.status,200);
    assert.equal((await a.get(`/api/jobs/${j.id}/files/${f.id}`)).status,403);
    assert.equal((await a.post(`/api/jobs/${j.id}/files`).set('x-csrf-token',l.body.csrf).attach('file',png,{filename:'unauthorized.png',contentType:'image/png'})).status,403);
  }
  assert.equal((await agent.get(`/api/jobs/${j.id}`)).body.files.length,2);
});

test('daily checklist saves general and job-linked tasks with steps, completion history and edit protection',async()=>{
 const j=await createJob('Daily reminder job');
 const payload={title:'Prepare tomorrow',notes:'Order supplies and call client',priority:'urgent',due_date:'2026-10-24',job_id:j.id,steps:[{title:'Call supplier',done:false},{title:'Confirm delivery',done:false}],request_key:randomUUID()};
 let r=await post('checklist',payload);assert.equal(r.status,201);const t=r.body;
 assert.equal((await post('checklist',payload)).body.id,t.id);
 assert.equal((await post('checklist',{...payload,title:'Changed title'})).status,409);
 assert.equal((await agent.patch(`/api/checklist/${t.id}`).set('x-csrf-token',csrf).send({version:1,status:'done'})).status,409);
 r=await agent.patch(`/api/checklist/${t.id}`).set('x-csrf-token',csrf).send({version:1,status:'in_progress',steps:payload.steps.map(s=>({...s,done:true}))});assert.equal(r.status,200);
 assert.equal((await agent.patch(`/api/checklist/${t.id}`).set('x-csrf-token',csrf).send({version:1,title:'Stale title'})).status,409);
 const results=await Promise.all([agent.patch(`/api/checklist/${t.id}`).set('x-csrf-token',csrf).send({version:2,status:'done'}),agent.patch(`/api/checklist/${t.id}`).set('x-csrf-token',csrf).send({version:2,status:'done'})]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 let stored=await db('daily_tasks').where({id:t.id}).first();assert.ok(stored.completed_at);assert.equal(stored.completed_by,owner.id);
 assert.equal((await db('audit').where({entity:'daily_task',entity_id:t.id,action:'daily_task_completed'})).length,1);
 r=await agent.patch(`/api/checklist/${t.id}`).set('x-csrf-token',csrf).send({version:3,status:'open',due_date:null,job_id:null});assert.equal(r.status,200);assert.equal(r.body.completed_at,null);assert.equal(r.body.completed_by,null);
 assert.equal((await post('checklist',{title:'Buy batteries',request_key:randomUUID()})).status,201);
 assert.equal((await post('checklist',{title:' ',request_key:randomUUID()})).status,400);
 assert.equal((await post('checklist',{title:'Invalid job',job_id:999999,request_key:randomUUID()})).status,400);
 assert.ok((await agent.get('/api/records')).body.daily_tasks.find(x=>x.id===t.id));
 const a=request.agent(app);const token=(await a.get('/api/session')).body.csrf;const login=await a.post('/api/login').set('x-csrf-token',token).send({email:'worker@test.invalid',password:'correct-password'});
 assert.equal((await a.post('/api/checklist').set('x-csrf-token',login.body.csrf).send({title:'Unauthorized',request_key:randomUUID()})).status,403);
});

test('daily views carry overdue work forward and keep future/completed work separate',()=>{
const tasks=[{id:1,title:'Overdue',priority:'normal',status:'open',due_date:'2026-10-23'},{id:2,title:'Today',priority:'urgent',status:'in_progress',due_date:'2026-10-24'},{id:3,title:'Undated',priority:'low',status:'open',due_date:null},{id:4,title:'Future',priority:'high',status:'open',due_date:'2026-10-25'},{id:5,title:'Finished',priority:'normal',status:'done',due_date:'2026-10-23',completed_at:'2026-10-24T12:00:00Z'}];
assert.deepEqual(checklistView(tasks,'Today','2026-10-24').map(t=>t.id),[2,1,3]);
assert.deepEqual(checklistView(tasks,'Overdue','2026-10-24').map(t=>t.id),[1]);
assert.deepEqual(checklistView(tasks,'Upcoming','2026-10-24').map(t=>t.id),[4]);
assert.deepEqual(checklistView(tasks,'Completed','2026-10-24').map(t=>t.id),[5]);
assert.equal(checklistView(tasks,'All open','2026-10-24').length,4);
});

test('employee clock access isolates rates and records, and approval posts labor cost once',async()=>{
 const j=await createJob('Employee assigned job'),other=await createJob('Unassigned job');
 let r=await post('team',{name:'Fictional employee',email:'crew-clock@example.test',password:'unique-test-password',hourly_rate_cents:2500,job_ids:[j.id]});assert.equal(r.status,201);const e=r.body;
 const worker=request.agent(app);const token=(await worker.get('/api/session')).body.csrf;const l=await worker.post('/api/login').set('x-csrf-token',token).send({email:e.email,password:'unique-test-password'});assert.equal(l.status,200);crewSession={agent:worker,csrf:l.body.csrf};const clock=(action,b={})=>worker.post('/api/clock/'+action).set('x-csrf-token',l.body.csrf).send(b);
 r=await worker.get('/api/operations');assert.equal(r.status,200);assert.equal(r.body.jobs.length,1);assert.equal(r.body.employee.hourly_rate_cents,undefined);assert.equal(r.body.employees,undefined);
 assert.equal((await worker.get('/api/records')).status,403);assert.equal((await clock('in',{job_id:other.id})).status,403);
 const starts=await Promise.all([clock('in',{job_id:j.id}),clock('in',{job_id:j.id})]);assert.deepEqual(starts.map(x=>x.status).sort(),[200,409]);const shift=starts.find(x=>x.status===200).body;assert.equal(shift.rate_cents,undefined);assert.equal((await worker.post(`/api/time/${shift.id}/submit`).set('x-csrf-token',l.body.csrf).send({version:1,consent:true})).status,409);
 assert.equal((await clock('break')).status,200);assert.equal((await clock('break')).status,409);
 await db('time_entries').where({id:shift.id}).update({clock_in:new Date(Date.now()-3600000),break_started_at:new Date(Date.now()-600000)});
 assert.equal((await clock('resume')).status,200);assert.equal((await clock('out')).status,200);
 const s=await db('time_entries').where({id:shift.id}).first();assert.ok(s.worked_seconds>=2998&&s.worked_seconds<=3002);assert.ok(Number(s.cost_cents)>=2082&&Number(s.cost_cents)<=2085);
 assert.equal((await worker.post(`/api/time/${shift.id}/approve`).set('x-csrf-token',l.body.csrf).send({})).status,403);
 const submission=await submitCrew(shift.id);s.version=submission.version;
 const approvals=await Promise.all([post(`time/${shift.id}/approve`,{version:s.version}),post(`time/${shift.id}/approve`,{version:s.version})]);assert.ok(approvals.every(r=>r.status===200));assert.equal((await db('expenses').where({time_entry_id:shift.id})).length,1);
 r=await worker.get('/api/operations');assert.equal(r.body.shifts[0].rate_cents,undefined);assert.equal(r.body.shifts[0].cost_cents,undefined);assert.ok(r.body.shifts[0].approved_at);
});

test('overhead stays separate from job costs and rejects changed duplicate requests',async()=>{
 const payload={description:'Insurance premium',category:'insurance',spent_on:'2026-10-24',amount_cents:12500,request_key:randomUUID()};
 const before=(await db('expenses')).length;let r=await post('business-expenses',payload);assert.equal(r.status,201);assert.equal((await post('business-expenses',payload)).body.id,r.body.id);assert.equal((await post('business-expenses',{...payload,amount_cents:13000})).status,409);assert.equal((await db('expenses')).length,before);
});

test('equipment custody, theft reporting and recovery preserve history and stale-edit checks',async()=>{
 const e=await db('employees').first();let r=await post('equipment',{name:'Fictional drill',serial_number:'TEST-123',location:'Storage',replacement_cents:25000});assert.equal(r.status,201);const item=r.body;
 const edit=b=>agent.patch(`/api/equipment/${item.id}`).set('x-csrf-token',csrf).send(b);
 r=await edit({version:1,status:'assigned',employee_id:e.id,location:'Crew truck',notes:'Issued to crew'});assert.equal(r.status,200);
 assert.equal((await edit({version:1,status:'available',employee_id:null,location:'Storage'})).status,409);
 assert.equal((await edit({version:2,status:'stolen',employee_id:e.id,location:'Job site',notes:''})).status,400);
 r=await edit({version:2,status:'stolen',employee_id:e.id,location:'Last seen at job site',notes:'Reported missing after vehicle break-in'});assert.equal(r.status,200);
 r=await edit({version:3,status:'available',employee_id:e.id,location:'Storage',notes:'Recovered'});assert.equal(r.status,200);assert.equal(r.body.employee_id,null);
 const events=await db('equipment_events').where({equipment_id:item.id}).orderBy('id');assert.deepEqual(events.map(e=>e.status),['available','assigned','stolen','available']);
});

test('time corrections retain original values, protect approval and reject worker/stale changes',async()=>{
 const employee=await db('employees').where({email:'crew-clock@example.test'}).first();
 const j=await createJob('Time correction job');
 const start=new Date(Date.now()-7200000),end=new Date(Date.now()-3600000);
 const [shift]=await db('time_entries').insert({employee_id:employee.id,job_id:j.id,clock_in:new Date(Date.now()-10800000),rate_cents:2500}).returning('*');
 const payload={version:1,clock_in:start.toISOString(),clock_out:end.toISOString(),break_seconds:0,reason:'Correct missed clock-out after checking with employee'};
 let r=await agent.patch(`/api/time/${shift.id}`).set('x-csrf-token',csrf).send({...payload,reason:''});assert.equal(r.status,400);
 r=await agent.patch(`/api/time/${shift.id}`).set('x-csrf-token',csrf).send({...payload,break_seconds:99999});assert.equal(r.status,400);
 r=await agent.patch(`/api/time/${shift.id}`).set('x-csrf-token',csrf).send(payload);assert.equal(r.status,200);assert.equal(r.body.worked_seconds,3600);assert.equal(Number(r.body.cost_cents),2500);assert.equal(r.body.version,2);
 const visible=await agent.get(`/api/time/${shift.id}/corrections`);assert.equal(visible.status,200);assert.equal(visible.body[0].author,owner.name);
 const history=await db('time_corrections').where({time_entry_id:shift.id});assert.equal(history.length,1);assert.equal(history[0].before.clock_out,null);assert.equal(history[0].after.worked_seconds,3600);assert.equal(history[0].reason,payload.reason);
 assert.equal((await agent.patch(`/api/time/${shift.id}`).set('x-csrf-token',csrf).send(payload)).status,409);
 assert.equal((await post(`time/${shift.id}/approve`,{version:1})).status,409);
 assert.equal((await post(`time/${shift.id}/approve`,{version:2})).status,409);const submitted=await submitCrew(shift.id);assert.equal((await post(`time/${shift.id}/approve`,{version:submitted.version})).status,200);
 assert.equal((await agent.patch(`/api/time/${shift.id}`).set('x-csrf-token',csrf).send({...payload,version:2})).status,409);
 assert.equal((await db('expenses').where({time_entry_id:shift.id})).length,1);
 const worker=request.agent(app),token=(await worker.get('/api/session')).body.csrf;const login=await worker.post('/api/login').set('x-csrf-token',token).send({email:employee.email,password:'unique-test-password'});assert.equal(login.status,200);
 assert.equal((await worker.patch(`/api/time/${shift.id}`).set('x-csrf-token',login.body.csrf).send({...payload,version:2})).status,403);
 assert.equal((await worker.get(`/api/time/${shift.id}/corrections`)).status,403);
 const projected=(await worker.get('/api/operations')).body.shifts.find(s=>s.id===shift.id);assert.equal(projected.correction_reason,payload.reason);assert.ok(projected.corrected_at);assert.equal(projected.rate_cents,undefined);assert.equal(projected.cost_cents,undefined);
});

test('racing correction and approval cannot post an unreviewed changed labor cost',async()=>{
 const e=await db('employees').where({email:'crew-clock@example.test'}).first(),j=await createJob('Approval race job');const start=new Date(Date.now()-10800000),end=new Date(start.getTime()+3600000);
 const [s]=await db('time_entries').insert({employee_id:e.id,job_id:j.id,clock_in:start,clock_out:end,break_seconds:0,worked_seconds:3600,rate_cents:1000,cost_cents:1000,review_status:'legacy_pending',submitted_version:1}).returning('*');
 const results=await Promise.all([agent.patch(`/api/time/${s.id}`).set('x-csrf-token',csrf).send({version:1,clock_in:start.toISOString(),clock_out:new Date(start.getTime()+7200000).toISOString(),break_seconds:0,reason:'Checked longer work duration'}),post(`time/${s.id}/approve`,{version:1})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);let current=await db('time_entries').where({id:s.id}).first();
 if(!current.approved_at){assert.equal(Number(current.cost_cents),2000);assert.equal((await db('expenses').where({time_entry_id:s.id})).length,0);const submitted=await submitCrew(s.id);assert.equal((await post(`time/${s.id}/approve`,{version:submitted.version})).status,200);}else assert.equal(Number(current.cost_cents),1000);
 current=await db('time_entries').where({id:s.id}).first();const costs=await db('expenses').where({time_entry_id:s.id});assert.equal(costs.length,1);assert.equal(Number(costs[0].amount_cents),Number(current.cost_cents));
 });

test('Estimate Maker preserves evidence, private costs, approved budgets and actual category variance',async()=>{
 const {calculate}=await import('../shared/estimate-maker.js');
 const c=await post('clients',{name:'Fictional Estimate Maker client'}),client_id=c.body.id;
 const maker={location:'07644',customer_description:'Complete agreed repair',internal_notes:'PRIVATE_INTERNAL_NOTE',measurements:[{label:'Wall',value:'10 x 8',unit:'ft',notes:'Measured on site'}],lines:[{category:'materials',description:'PRIVATE_VENDOR_ITEM',quantity_milli:1250,unit:'pack',unit_cents:10000,waste_bps:1000,source:{supplier:'Supplier',url:'https://example.com/product',checked_on:new Date().toISOString().slice(0,10),location:'07644',notes:'Purchase tax included'}},{category:'labor',description:'Loaded labor',quantity_milli:7500,unit:'hour',unit_cents:4500,waste_bps:0,source:null},{category:'disposal',description:'Haul away',quantity_milli:1000,unit:'load',unit_cents:5000,waste_bps:0,source:null}],overhead_bps:1000,contingency_bps:500,profit_bps:2000,profit_mode:'markup',tax_bps:0,price_reviewed:false};
 const payload={client_id,title:'Fictional sourced repair',scope:'Customer-visible scope only',request_key:randomUUID(),maker};
 const first=await post('estimate-maker',payload);assert.equal(first.status,201,JSON.stringify(first.body));const e=first.body;
 assert.equal(Number(e.total_cents),calculate(maker).total_cents);
 assert.equal((await post('estimate-maker',payload)).body.id,e.id);
 assert.equal((await post('estimate-maker',{...payload,title:'Duplicate key changed'})).status,409);
 assert.equal((await agent.patch(`/api/estimates/${e.id}`).set('x-csrf-token',csrf).send({version:1,title:'Bypass',scope:'',items:[{description:'Bypass',quantity:1,unit_cents:1}]})).status,409);
 assert.equal((await post(`estimates/${e.id}/approve`,{signer:'Fictional client',consent:true,version:3})).status,409);
 const unauth=request(app);assert.equal((await unauth.get(`/api/estimate-maker/${e.id}`)).status,401);
 const wave=Buffer.from('RIFF0000WAVEdata0000');
 let r=await agent.post(`/api/estimate-maker/${e.id}/files`).set('x-csrf-token',csrf).attach('file',wave,{filename:'voice.wav',contentType:'audio/wav'});assert.equal(r.status,201,JSON.stringify(r.body));const file=r.body;
 assert.equal((await agent.get(`/api/estimate-maker/${e.id}/files/${file.id}`)).status,200);
 const different=await post('estimates',{client_id,title:'Different',items:[{description:'X',quantity:1,unit_cents:1}]});
 assert.equal((await agent.get(`/api/estimate-maker/${different.body.id}/files/${file.id}`)).status,404);
 assert.equal((await agent.post(`/api/estimate-maker/${e.id}/files`).set('x-csrf-token',csrf).attach('file',Buffer.from('<svg onload=alert(1)>'),{filename:'fake.png',contentType:'image/png'})).status,400);
 r=await agent.get(`/api/estimate-maker/${e.id}`);assert.equal(r.body.estimate.version,2);assert.equal(r.body.files.length,1);
 const revision={version:2,title:payload.title,scope:payload.scope,maker:{...maker,price_reviewed:true}};
 r=await agent.patch(`/api/estimate-maker/${e.id}`).set('x-csrf-token',csrf).send(revision);assert.equal(r.status,200);assert.equal(r.body.version,3);
 assert.equal((await agent.patch(`/api/estimate-maker/${e.id}`).set('x-csrf-token',csrf).send(revision)).status,409);
 const customer=await agent.get(`/api/estimate-maker/${e.id}/customer`);assert.equal(customer.status,200);assert.ok(!JSON.stringify(customer.body).includes('PRIVATE'));assert.ok(!('maker' in customer.body));
 const oldKey=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 assert.equal((await post(`estimate-maker/${e.id}/price-check`,{query:'2x4 lumber',location:'07644'})).status,503);
 const originalFetch=globalThis.fetch;process.env.OPENAI_API_KEY='fictional-test-key';
 try{globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.tools[0].type,'web_search');assert.ok(!JSON.stringify(body).includes('PRIVATE'));return {ok:true,json:async()=>({output:[{type:'web_search_call',status:'completed'},{content:[{type:'output_text',text:'Fictional supplier test price; review required',annotations:[{type:'url_citation',url:'https://example.com/product',title:'Fictional supplier'}]}]}]})};};
 const research=await post(`estimate-maker/${e.id}/price-check`,{query:'Exact test SKU',location:'07644'});assert.equal(research.status,200,JSON.stringify(research.body));assert.equal(research.body.sources[0].url,'https://example.com/product');assert.ok(research.body.checked_at);assert.equal((await db('material_price_checks').where({estimate_id:e.id})).length,1);
 }finally{globalThis.fetch=originalFetch;if(oldKey)process.env.OPENAI_API_KEY=oldKey;else delete process.env.OPENAI_API_KEY;}
 assert.equal((await post(`estimates/${e.id}/approve`,{signer:'Fictional client',consent:true,version:3})).status,200);
 const approvals=(await db('estimates').where({id:e.id}).first()).approved_document;assert.equal(approvals.version,3);assert.equal(approvals.maker.lines.length,3);
 assert.equal((await agent.patch(`/api/estimate-maker/${e.id}`).set('x-csrf-token',csrf).send({...revision,version:3})).status,409);
 assert.equal((await agent.post(`/api/estimate-maker/${e.id}/files`).set('x-csrf-token',csrf).attach('file',wave,{filename:'voice.wav'})).status,409);
 const converted=await post(`estimates/${e.id}/convert`,{});assert.equal(converted.status,200);const job=converted.body;
 assert.equal(Number(job.budget_cents),calculate(maker).cost_cents);assert.equal((await post(`estimates/${e.id}/convert`,{})).body.id,job.id);
 assert.equal((await post('expenses',{job_id:job.id,category:'disposal',description:'Dump receipt',amount_cents:5500})).status,201);
 assert.equal((await post('expenses',{job_id:job.id,category:'overhead',description:'Allocated job overhead',amount_cents:2000})).status,201);
 r=await agent.get(`/api/jobs/${job.id}/estimate-costs`);assert.equal(r.status,200);assert.equal(r.body.rows.find(x=>x.category==='disposal').variance_cents,-500);assert.equal(r.body.actual_cents,7500);
 for(const role of ['worker','client']){const actor=request.agent(app);let token=(await actor.get('/api/session')).body.csrf;let login=await actor.post('/api/login').set('x-csrf-token',token).send({email:`${role}@test.invalid`,password:'correct-password'});token=login.body.csrf;assert.equal((await actor.get(`/api/estimate-maker/${e.id}`)).status,403);assert.equal((await actor.get(`/api/estimate-maker/${e.id}/files/${file.id}`)).status,403);assert.equal((await actor.get(`/api/jobs/${job.id}/estimate-costs`)).status,403);}
});

async function submitCrew(key,note='Reviewed test hours'){
 const entry=await db('time_entries').where({id:key}).first();
 const r=await crewSession.agent.post(`/api/time/${key}/submit`).set('x-csrf-token',crewSession.csrf).send({version:entry.version,consent:true,note});assert.equal(r.status,200,JSON.stringify(r.body));return r.body;
}
test('employee submission, rejection and resubmission preserve ownership, audit and approved locks',async()=>{
 const e=await db('employees').where({email:'crew-clock@example.test'}).first(),j=await createJob('Review cycle job');const end=new Date(Date.now()-3600000),start=new Date(end.getTime()-3600000);
 const [entry]=await db('time_entries').insert({employee_id:e.id,job_id:j.id,clock_in:start,clock_out:end,worked_seconds:3600,rate_cents:2500,cost_cents:2500}).returning('*');
 assert.equal((await post(`time/${entry.id}/approve`,{version:1})).status,409);
 assert.equal((await agent.post(`/api/time/${entry.id}/submit`).set('x-csrf-token',csrf).send({version:1,consent:true})).status,403);
 let submitted=await submitCrew(entry.id);assert.equal(submitted.version,2);
 assert.equal((await post(`time/${entry.id}/reject`,{version:2,reason:''})).status,400);
 assert.equal((await post(`time/${entry.id}/reject`,{version:1,reason:'Check breaks'})).status,409);
 assert.equal((await post(`time/${entry.id}/reject`,{version:2,reason:'Please confirm the unpaid break'})).status,200);
 assert.equal((await post(`time/${entry.id}/approve`,{version:3})).status,409);
 const own=(await crewSession.agent.get('/api/operations')).body.shifts.find(s=>s.id===entry.id);assert.equal(own.review_status,'rejected');assert.equal(own.rejection_reason,'Please confirm the unpaid break');assert.equal(own.rate_cents,undefined);
 submitted=await submitCrew(entry.id,'Confirmed break is zero');assert.equal(submitted.version,4);
 assert.equal((await post(`time/${entry.id}/approve`,{version:4})).status,200);
 assert.equal((await post(`time/${entry.id}/reject`,{version:5,reason:'Too late'})).status,409);
 assert.equal((await crewSession.agent.post(`/api/time/${entry.id}/submit`).set('x-csrf-token',crewSession.csrf).send({version:5,consent:true})).status,409);
 assert.equal((await db('expenses').where({time_entry_id:entry.id})).length,1);
 const reviews=(await crewSession.agent.get(`/api/time/${entry.id}/reviews`)).body;assert.deepEqual(reviews.map(r=>r.action).reverse(),['submitted','rejected','submitted','approved']);assert.equal(reviews[0].rate_cents,undefined);
 const [other]=await db('employees').insert({name:'Other record owner',email:'other-record@example.test',hourly_rate_cents:1}).returning('*');const [privateEntry]=await db('time_entries').insert({employee_id:other.id,job_id:j.id,clock_in:start,rate_cents:1}).returning('*');
 assert.equal((await crewSession.agent.get(`/api/time/${privateEntry.id}/reviews`)).status,404);
 assert.equal((await crewSession.agent.post(`/api/time/${privateEntry.id}/submit`).set('x-csrf-token',crewSession.csrf).send({version:1,consent:true})).status,404);
});
test('approved-hours export uses New York clock-out dates, canonical costs and safe CSV',async()=>{
 const e=await db('employees').where({email:'crew-clock@example.test'}).first(),j=await createJob('Payroll boundary job');const oldName=e.name;
 try{await db('employees').where({id:e.id}).update({name:'=SUM(1,2)'});
 await db('time_entries').insert([{employee_id:e.id,job_id:j.id,clock_in:'2026-10-24T03:30:00Z',clock_out:'2026-10-24T04:30:00Z',worked_seconds:3600,rate_cents:2500,cost_cents:2500,approved_by:owner.id,approved_at:new Date(),review_status:'approved'},{employee_id:e.id,job_id:j.id,clock_in:'2026-10-24T02:00:00Z',clock_out:'2026-10-24T03:00:00Z',worked_seconds:3600,rate_cents:9999,cost_cents:9999,approved_by:owner.id,approved_at:new Date(),review_status:'approved'},{employee_id:e.id,job_id:j.id,clock_in:'2026-10-24T05:00:00Z',clock_out:'2026-10-24T06:00:00Z',worked_seconds:3600,rate_cents:9998,cost_cents:9998}]);
 const r=await agent.get('/api/time/export.csv?from=2026-10-24&to=2026-10-24');assert.equal(r.status,200);assert.match(r.headers['content-disposition'],/attachment/);assert.equal(r.headers['cache-control'],'private, no-store');assert.ok(r.text.includes("'"+'=SUM(1,2)'));assert.ok(r.text.includes('2500'));assert.ok(!r.text.includes('9999'));assert.ok(!r.text.includes('9998'));assert.equal(r.text.trim().split('\r\n').length,2);
 assert.equal((await crewSession.agent.get('/api/time/export.csv?from=2026-10-24&to=2026-10-24')).status,403);
 assert.equal((await request(app).get('/api/time/export.csv?from=2026-10-24&to=2026-10-24')).status,401);
 assert.equal((await agent.get('/api/time/export.csv?from=2026-10-25&to=2026-10-24')).status,400);
 }finally{await db('employees').where({id:e.id}).update({name:oldName});}
});
test('expense/equipment attachments stay private, correctly bound and out of job files',async()=>{
 const expense=(await post('business-expenses',{description:'Receipt fixture',category:'supplies',spent_on:'2026-10-24',amount_cents:500,request_key:randomUUID()})).body;
 const equipment=(await post('equipment',{name:'Attachment fixture',replacement_cents:500})).body;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6S1cAAAAASUVORK5CYII=','base64');
 let uploaded;
 for(const [base,parent] of [['business-expenses',expense],['equipment',equipment]]){
  const r=await agent.post(`/api/${base}/${parent.id}/files`).set('x-csrf-token',csrf).attach('file',png,{filename:'private.png',contentType:'image/png'});assert.equal(r.status,201);uploaded=r.body;
  const rows=await agent.get(`/api/${base}/${parent.id}/files`);assert.equal(rows.status,200);assert.equal(rows.body.length,1);assert.equal(rows.body[0].storage_key,undefined);
  const file=await agent.get(`/api/${base}/${parent.id}/files/${uploaded.id}`);assert.equal(file.status,200);assert.ok(file.body.equals(png));assert.equal(file.headers['cache-control'],'private, no-store');
  assert.equal((await crewSession.agent.get(`/api/${base}/${parent.id}/files/${uploaded.id}`)).status,403);
  assert.equal((await request(app).get(`/api/${base}/${parent.id}/files/${uploaded.id}`)).status,401);
  assert.equal((await agent.get(`/api/${base}/${parent.id+999999}/files/${uploaded.id}`)).status,404);
  const record=await db('job_files').where({id:uploaded.id}).first();assert.equal(record.job_id,null);
 }
 assert.equal((await agent.get(`/api/business-expenses/${expense.id}/files/${uploaded.id}`)).status,404);
 try{await db('users').where({id:owner.id}).update({role:'estimator'});assert.equal((await agent.get(`/api/business-expenses/${expense.id}/files`)).status,403);assert.equal((await agent.post(`/api/equipment/${equipment.id}/files`).set('x-csrf-token',csrf).attach('file',png,{filename:'not-authorized.png',contentType:'image/png'})).status,403);assert.equal((await agent.get('/api/time/export.csv?from=2026-10-24&to=2026-10-24')).status,403);}finally{await db('users').where({id:owner.id}).update({role:'owner'});}
 await assert.rejects(db('job_files').insert({job_id:1,equipment_id:equipment.id,user_id:owner.id,storage_key:randomUUID(),filename:'invalid.png',mime_type:'image/png',size_bytes:1,sha256:'x'}),e=>e.code==='23514');
});
