import {z} from 'zod';
import {db} from './db.js';
const id=z.coerce.number().int().positive();
const fields={title:z.string().trim().min(1).max(500),notes:z.string().max(10000),priority:z.enum(['low','normal','high','urgent']),due_date:z.iso.date().nullable(),job_id:id.nullable(),steps:z.array(z.object({title:z.string().trim().min(1).max(300),done:z.boolean()})).max(50)};
const create=z.object({...fields,notes:fields.notes.default(''),priority:fields.priority.default('normal'),due_date:fields.due_date.default(null),job_id:fields.job_id.default(null),steps:fields.steps.default([]),request_key:z.uuid()});
const update=z.object({...fields,status:z.enum(['open','in_progress','done'])}).partial().extend({version:id});
const error=(status,message)=>Object.assign(new Error(message),{status});
async function validateJob(t,jobId){if(jobId&&!await t('jobs').where({id:jobId}).first())throw error(400,'Linked job does not exist.');}
export function registerChecklistRoutes(app){
  app.post('/api/checklist',async(req,res)=>{
    const b=create.parse(req.body);
    res.status(201).json(await db.transaction(async t=>{
      await t.raw('select pg_advisory_xact_lock(hashtext(?))',[b.request_key]);
      const existing=await t('daily_tasks').where({request_key:b.request_key}).first();
      if(existing){
        if(existing.title!==b.title||existing.notes!==b.notes||existing.priority!==b.priority||existing.due_date!==b.due_date||existing.job_id!==b.job_id||JSON.stringify(existing.steps.map(s=>[s.title,s.done]))!==JSON.stringify(b.steps.map(s=>[s.title,s.done])))throw error(409,'This save request was already used. Close the form and try again.');
        return existing;
      }
      await validateJob(t,b.job_id);
      const [r]=await t('daily_tasks').insert({...b,steps:JSON.stringify(b.steps),created_by:req.session.user.id}).returning('*');
      await t('audit').insert({user_id:req.session.user.id,action:'daily_task_created',entity:'daily_task',entity_id:r.id});return r;
    }));
  });
  app.patch('/api/checklist/:id',async(req,res)=>{
    const b=update.parse(req.body);
    res.json(await db.transaction(async t=>{
      const task=await t('daily_tasks').where({id:id.parse(req.params.id)}).forUpdate().first();
      if(!task)throw error(404,'Task not found.');
      if(task.version!==b.version)throw error(409,'This task changed. Refresh before trying again.');
      await validateJob(t,b.job_id);
      const status=b.status??task.status,steps=b.steps??task.steps;
      if(status==='done'&&steps.some(s=>!s.done))throw error(409,'Finish the smaller steps before completing this task.');
      const completed=status==='done';
      const [r]=await t('daily_tasks').where({id:task.id}).update({...b,steps:JSON.stringify(steps),version:task.version+1,completed_at:completed?(task.completed_at||new Date()):null,completed_by:completed?(task.completed_by||req.session.user.id):null}).returning('*');
      await t('audit').insert({user_id:req.session.user.id,action:status!==task.status?(completed?'daily_task_completed':task.status==='done'?'daily_task_reopened':'daily_task_status_changed'):'daily_task_updated',entity:'daily_task',entity_id:task.id,detail:JSON.stringify({status,previous_status:task.status})});return r;
    }));
  });
}
