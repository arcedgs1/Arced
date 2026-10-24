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
process.env.SESSION_SECRET='test-only-secret-at-least-32-characters-long';
const uploadBase=await mkdtemp('/tmp/arced-file-test-');process.env.UPLOAD_DIR=uploadBase+'/.private/uploads';
const app=createApp(),agent=request.agent(app);let csrf,owner;
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
assert.equal(businessInstant('2026-07-12T09:00'),'2026-07-12T13:00:00Z');
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
