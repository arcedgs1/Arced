import {z} from 'zod';
import {db} from './db.js';
const id=z.coerce.number().int().positive();
const error=(status,message)=>Object.assign(new Error(message),{status});
const manager=req=>{if(!['owner','admin','office_manager'].includes(req.session.user.role))throw error(403,'Manager permission required');};
const log=(t,req,entry,action,reason='')=>t('time_reviews').insert({time_entry_id:entry.id,user_id:req.session.user.id,action,reason});
export function registerTimeReviewRoutes(app){
 app.post('/api/time/:id/submit',async(req,res)=>{
  const b=z.object({version:id,consent:z.literal(true),note:z.string().trim().max(2000).default('')}).parse(req.body);
  res.json(await db.transaction(async t=>{
   const employee=await t('employees').where({user_id:req.session.user.id,active:true}).forUpdate().first();if(!employee)throw error(403,'An active employee login is required.');
   const entry=await t('time_entries').where({id:id.parse(req.params.id),employee_id:employee.id}).forUpdate().first();if(!entry)throw error(404,'Time entry not found.');
   if(entry.approved_at)throw error(409,'Approved hours are locked.');
   if(entry.version!==b.version)throw error(409,'Your hours changed. Refresh and review them before submitting.');
   if(!entry.clock_out)throw error(409,'Clock out before submitting your hours.');
   if(entry.review_status==='submitted')return {ok:true,version:entry.version};
   const version=entry.version+1;
   await t('time_entries').where({id:entry.id}).update({review_status:'submitted',submitted_at:new Date(),submitted_version:version,rejection_reason:null,version});
   await log(t,req,entry,'submitted',b.note);await t('audit').insert({user_id:req.session.user.id,action:'time_submitted',entity:'time_entry',entity_id:entry.id,detail:JSON.stringify({version})});return {ok:true,version};
  }));
 });
 app.post('/api/time/:id/reject',async(req,res)=>{
  manager(req);const b=z.object({version:id,reason:z.string().trim().min(1).max(2000)}).parse(req.body);
  res.json(await db.transaction(async t=>{
   const initial=await t('time_entries').where({id:id.parse(req.params.id)}).first();if(!initial)throw error(404,'Time entry not found.');
   const employee=await t('employees').where({id:initial.employee_id}).forUpdate().first();
   const entry=await t('time_entries').where({id:initial.id}).forUpdate().first();
   if(entry.approved_at)throw error(409,'Approved hours are locked.');
   if(!employee.active)throw error(409,'Reactivate this employee before requesting resubmission.');
   if(entry.version!==b.version)throw error(409,'Hours changed since your review. Refresh first.');
   if(!['submitted','legacy_pending'].includes(entry.review_status))throw error(409,'Only hours awaiting review can be rejected.');
   const version=entry.version+1;
   await t('time_entries').where({id:entry.id}).update({review_status:'rejected',rejection_reason:b.reason,submitted_version:null,version});
   await log(t,req,entry,'rejected',b.reason);await t('audit').insert({user_id:req.session.user.id,action:'time_rejected',entity:'time_entry',entity_id:entry.id,detail:JSON.stringify({reason:b.reason,version})});return {ok:true,version};
  }));
 });
 app.get('/api/time/:id/reviews',async(req,res)=>{
  const key=id.parse(req.params.id),entry=await db('time_entries').where({id:key}).first();
  if(req.session.user.role==='worker'){
   const employee=await db('employees').where({user_id:req.session.user.id,active:true}).first();if(!employee||entry?.employee_id!==employee.id)throw error(404,'Time entry not found.');
  }else manager(req);
  if(!entry)throw error(404,'Time entry not found.');
  res.json(await db('time_reviews').leftJoin('users','users.id','time_reviews.user_id').where('time_entry_id',key).select('time_reviews.id','time_reviews.action','time_reviews.reason','time_reviews.created_at','users.name as author').orderBy('time_reviews.id','desc').limit(100));
 });
 app.get('/api/time/export.csv',async(req,res)=>{
  manager(req);const q=z.object({from:z.iso.date(),to:z.iso.date()}).parse(req.query);
  const days=(Date.parse(q.to)-Date.parse(q.from))/86400000;if(days<0||days>366)throw error(400,'Choose an inclusive date range of at most 367 days.');
  const rows=await db('time_entries as t').join('employees as e','e.id','t.employee_id').join('jobs as j','j.id','t.job_id').whereNotNull('t.approved_at').whereRaw("(t.clock_out AT TIME ZONE 'America/New_York')::date BETWEEN ?::date AND ?::date",[q.from,q.to]).select('t.id','e.name','e.email','t.employee_id','t.job_id','j.title','t.clock_in','t.clock_out','t.break_seconds','t.worked_seconds','t.rate_cents','t.cost_cents','t.approved_at').orderBy('t.clock_out').orderBy('t.id').limit(10001);
  if(rows.length>10000)throw error(400,'More than 10,000 shifts match. Choose a narrower date range.');
  const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const headers=['TimeEntryID','EmployeeID','EmployeeName','Email','JobID','JobTitle','ClockInUTC','ClockOutUTC','UnpaidBreakSeconds','WorkedSeconds','HoursDecimal','CapturedHourlyRateCentsUSD','RecordedLaborCostCentsUSD','ApprovedAtUTC'];
  const lines=[headers,...rows.map(r=>[r.id,r.employee_id,r.name,r.email,r.job_id,r.title,new Date(r.clock_in).toISOString(),new Date(r.clock_out).toISOString(),r.break_seconds,r.worked_seconds,(r.worked_seconds/3600).toFixed(6),r.rate_cents,r.cost_cents,new Date(r.approved_at).toISOString()])];
  await db('audit').insert({user_id:req.session.user.id,action:'time_exported',entity:'time_entry',detail:JSON.stringify({...q,rows:rows.length})});
  res.set({'Cache-Control':'private, no-store','Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="arced-approved-hours-${q.from}-${q.to}.csv"`}).send(lines.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n');
 });
}
