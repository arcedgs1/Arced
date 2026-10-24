import {z} from 'zod';
import {db} from './db.js';
const id=z.coerce.number().int().positive();
const title=z.string().trim().min(1).max(500);
const body=z.string().trim().min(1).max(20000);
const delta=z.number().int().min(-100000000000).max(100000000000);
const error=(status,message)=>Object.assign(new Error(message),{status});
const audit=(t,req,action,entity,entity_id,detail={})=>t('audit').insert({user_id:req.session.user.id,action,entity,entity_id,detail:JSON.stringify(detail)});
const financial=req=>{if(!['owner','admin','office_manager'].includes(req.session.user.role))throw error(403,'Financial permission required');};
async function job(t,key,lock=false){const q=t('jobs').where({id:id.parse(key)});const found=await (lock?q.forUpdate():q).first();if(!found)throw error(404,'Job not found');return found;}
export function registerJobRoutes(app){
  app.get('/api/jobs/:id',async(req,res)=>{
    const j=await job(db,req.params.id);
    const [tasks,notes,change_orders,expenses,invoices,client,property,files]=await Promise.all([
      db('job_tasks').where({job_id:j.id}).orderBy('id'),
      db('job_notes').join('users','users.id','job_notes.user_id').where('job_notes.job_id',j.id).select('job_notes.*','users.name as author').orderBy('job_notes.id','desc'),
      db('change_orders').where({job_id:j.id}).orderBy('id','desc'),
      db('expenses').where({job_id:j.id}).orderBy('id','desc'),
      db('invoices').where({job_id:j.id}).orderBy('id','desc'),
      db('clients').where({id:j.client_id}).first(),
      j.property_id?db('properties').where({id:j.property_id}).first():null,
      db('job_files').where({job_id:j.id}).select('id','job_id','filename','mime_type','size_bytes','created_at').orderBy('id','desc')
    ]);
    res.json({job:j,tasks,notes,change_orders,expenses,invoices,client,property,files});
  });
  app.patch('/api/jobs/:id/budget',async(req,res)=>{
    financial(req);
    const b=z.object({version:id,budget_cents:z.number().int().nonnegative().max(100000000000)}).parse(req.body);
    res.json(await db.transaction(async t=>{
      const j=await job(t,req.params.id,true);
      if(j.version!==b.version)throw error(409,'This job changed. Refresh before updating the budget.');
      const [r]=await t('jobs').where({id:j.id}).update({budget_cents:b.budget_cents,version:j.version+1}).returning('*');
      await audit(t,req,'budget_updated','job',j.id,{previous_cents:j.budget_cents,budget_cents:b.budget_cents});return r;
    }));
  });
  app.post('/api/jobs/:id/tasks',async(req,res)=>{
    const b=z.object({title,due_date:z.iso.date().nullable().optional()}).parse(req.body);
    res.status(201).json(await db.transaction(async t=>{
      const j=await job(t,req.params.id,true);
      if(j.status==='completed')throw error(409,'Reopen the job before adding checklist items.');
      const [r]=await t('job_tasks').insert({...b,job_id:j.id}).returning('*');
      await audit(t,req,'task_created','job',j.id,{task_id:r.id,title:r.title});return r;
    }));
  });
  app.patch('/api/jobs/:id/tasks/:taskId',async(req,res)=>{
    const b=z.object({version:id,status:z.enum(['open','done'])}).parse(req.body);
    res.json(await db.transaction(async t=>{
      const j=await job(t,req.params.id,true);
      const task=await t('job_tasks').where({id:id.parse(req.params.taskId),job_id:j.id}).forUpdate().first();
      if(!task)throw error(404,'Checklist item not found on this job');
      if(task.version!==b.version)throw error(409,'This checklist item changed. Refresh and try again.');
      if(j.status==='completed'&&b.status==='open')throw error(409,'Reopen the job before reopening checklist items.');
      const [r]=await t('job_tasks').where({id:task.id}).update({status:b.status,version:task.version+1}).returning('*');
      await audit(t,req,'task_updated','job',j.id,{task_id:task.id,status:b.status});return r;
    }));
  });
  app.post('/api/jobs/:id/notes',async(req,res)=>{
    const b=z.object({body}).parse(req.body);
    res.status(201).json(await db.transaction(async t=>{
      const j=await job(t,req.params.id);
      const [r]=await t('job_notes').insert({...b,job_id:j.id,user_id:req.session.user.id}).returning('*');
      await audit(t,req,'private_note_created','job',j.id,{note_id:r.id});return r;
    }));
  });
  app.post('/api/jobs/:id/change-orders',async(req,res)=>{
    const b=z.object({title,scope:body,amount_cents:delta,budget_delta_cents:delta,request_key:z.uuid()}).parse(req.body);
    res.status(201).json(await db.transaction(async t=>{
      const j=await job(t,req.params.id,true);
      if(j.status==='completed')throw error(409,'Reopen the job before adding a change order.');
      const existing=await t('change_orders').where({request_key:b.request_key}).first();
      if(existing){
        if(existing.job_id!==j.id||existing.title!==b.title||existing.scope!==b.scope||Number(existing.amount_cents)!==b.amount_cents||Number(existing.budget_delta_cents)!==b.budget_delta_cents)throw error(409,'Request key already used for another change order');
        return existing;
      }
      const [r]=await t('change_orders').insert({...b,job_id:j.id}).returning('*');
      await audit(t,req,'change_order_created','job',j.id,{change_order_id:r.id});return r;
    }));
  });
  app.post('/api/jobs/:id/change-orders/:changeId/approve',async(req,res)=>{
    financial(req);
    const b=z.object({version:id,signer:title,consent:z.literal(true)}).parse(req.body);
    res.json(await db.transaction(async t=>{
      const j=await job(t,req.params.id,true);
      const c=await t('change_orders').where({id:id.parse(req.params.changeId),job_id:j.id}).forUpdate().first();
      if(!c)throw error(404,'Change order not found on this job');
      if(c.status==='approved')return c;
      if(j.status==='completed')throw error(409,'Reopen the job before approving a change order.');
      if(c.version!==b.version)throw error(409,'The change order changed. Refresh before approving.');
      const contract=BigInt(j.contract_cents)+BigInt(c.amount_cents),budget=BigInt(j.budget_cents)+BigInt(c.budget_delta_cents);
      const [{sum}]=await t('invoices').where({job_id:j.id}).sum('total_cents');
      if(contract<BigInt(sum||0))throw error(409,'The reduced contract would be below the amount already invoiced.');
      if(contract<0n||budget<0n)throw error(409,'Contract value and cost budget cannot become negative.');
      await t('jobs').where({id:j.id}).update({contract_cents:contract.toString(),budget_cents:budget.toString(),version:j.version+1});
      const [r]=await t('change_orders').where({id:c.id}).update({status:'approved',signer:b.signer,approved_at:new Date(),approved_document:JSON.stringify(c),version:c.version+1}).returning('*');
      await audit(t,req,'staff_recorded_change_approval','job',j.id,{change_order_id:c.id,signer:b.signer,consent:true,document_version:c.version,contract_before:j.contract_cents,contract_after:contract.toString(),budget_before:j.budget_cents,budget_after:budget.toString()});return r;
    }));
  });
  app.post('/api/jobs/:id/complete',async(req,res)=>res.json(await db.transaction(async t=>{
    const j=await job(t,req.params.id,true);
    if(await t('job_tasks').where({job_id:j.id,status:'open'}).first())throw error(409,'Finish all open checklist items before completing this job.');
    const [r]=await t('jobs').where({id:j.id}).update({status:'completed',version:j.version+1}).returning('*');
    await audit(t,req,'job_completed','job',j.id);return r;
  })));
  app.post('/api/jobs/:id/reopen',async(req,res)=>res.json(await db.transaction(async t=>{
    const j=await job(t,req.params.id,true);
    if(j.status!=='completed')throw error(409,'Only a completed job can be reopened.');
    const [r]=await t('jobs').where({id:j.id}).update({status:j.starts_at?'scheduled':'unscheduled',version:j.version+1}).returning('*');
    await audit(t,req,'job_reopened','job',j.id);return r;
  })));
}
