import {z} from 'zod';
import {db} from './db.js';
const id=z.coerce.number().int().positive();
const text=z.string().trim().min(1).max(500);
const optional=z.string().trim().max(2000).default('');
const clientSchema=z.object({name:text,email:z.union([z.email(),z.literal('')]).default(''),phone:z.string().trim().max(50).default(''),billing_address:optional,notes:z.string().trim().max(20000).default('')});
const propertySchema=z.object({address:text,access_notes:z.string().trim().max(10000).default('')});
const error=(status,message)=>Object.assign(new Error(message),{status});
const audit=(t,req,action,entity,entity_id)=>t('audit').insert({user_id:req.session.user.id,action,entity,entity_id});
export function registerClientRoutes(app){
  app.post('/api/clients',async(req,res)=>{
    const b=clientSchema.parse(req.body);
    res.status(201).json(await db.transaction(async t=>{
      const [r]=await t('clients').insert(b).returning('*');await audit(t,req,'created','client',r.id);return r;
    }));
  });
  app.patch('/api/clients/:id',async(req,res)=>{
    const b=clientSchema.extend({version:id}).parse(req.body);
    res.json(await db.transaction(async t=>{
      const c=await t('clients').where({id:id.parse(req.params.id)}).forUpdate().first();
      if(!c)throw error(404,'Client not found');
      if(c.version!==b.version)throw error(409,'This client changed. Refresh before editing.');
      const [r]=await t('clients').where({id:c.id}).update({...b,version:c.version+1}).returning('*');await audit(t,req,'updated','client',r.id);return r;
    }));
  });
  app.post('/api/clients/:id/properties',async(req,res)=>{
    const b=propertySchema.parse(req.body);
    res.status(201).json(await db.transaction(async t=>{
      const c=await t('clients').where({id:id.parse(req.params.id)}).first();if(!c)throw error(404,'Client not found');
      const [r]=await t('properties').insert({...b,client_id:c.id}).returning('*');await audit(t,req,'created','property',r.id);return r;
    }));
  });
  app.patch('/api/clients/:id/properties/:propertyId',async(req,res)=>{
    const b=propertySchema.extend({version:id}).parse(req.body);
    res.json(await db.transaction(async t=>{
      const p=await t('properties').where({id:id.parse(req.params.propertyId),client_id:id.parse(req.params.id)}).forUpdate().first();
      if(!p)throw error(404,'Property not found on this client');
      if(p.version!==b.version)throw error(409,'This property changed. Refresh before editing.');
      const [r]=await t('properties').where({id:p.id}).update({...b,version:p.version+1}).returning('*');await audit(t,req,'updated','property',r.id);return r;
    }));
  });
  app.patch('/api/divisions/:id',async(req,res)=>{
    if(!['owner','admin'].includes(req.session.user.role))throw error(403,'Owner or admin permission required');
    const b=z.object({name:text,enabled:z.boolean()}).parse(req.body);
    res.json(await db.transaction(async t=>{
      const [r]=await t('divisions').where({id:id.parse(req.params.id)}).update(b).returning('*');if(!r)throw error(404,'Division not found');await audit(t,req,'updated','division',r.id);return r;
    }));
  });
}
