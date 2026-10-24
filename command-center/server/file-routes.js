import multer from 'multer';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {db} from './db.js';
const id=z.coerce.number().int().positive();
const error=(status,message)=>Object.assign(new Error(message),{status});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:0,parts:1}});
function detectType(bytes) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
  if(bytes.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
  throw error(400,'Upload a JPEG, PNG, WebP image or PDF. Other file types are not supported.');
}
export function registerFileRoutes(app){
  // This directory is deliberately outside every public static-file root.
  const root=path.resolve(process.env.UPLOAD_DIR||'/workspace/.arced/uploads');
  app.post('/api/jobs/:id/files',async(req,res,next)=>{
    const j=await db('jobs').where({id:id.parse(req.params.id)}).first();
    if(!j)throw error(404,'Job not found');req.fileJob=j;next();
  },(req,res,next)=>upload.single('file')(req,res,e=>{
    if(e)return next(error(e.code==='LIMIT_FILE_SIZE'?413:400,e.code==='LIMIT_FILE_SIZE'?'Files must be 10 MB or smaller.':'Upload one file at a time, up to 10 MB.'));
    next();
  }),async(req,res)=>{
    if(!req.file||req.file.size===0)throw error(400,'Choose a nonempty file to upload.');
    const mime=detectType(req.file.buffer),storage_key=randomUUID();
    const safeName=(req.file.originalname.split(/[\\/]/).pop()||'document').replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/^\.+/,'').slice(0,150)||'document';
    const extension={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','application/pdf':'.pdf'}[mime];
    const filename=safeName.replace(/\.[^.]*$/,'')+extension;
    await mkdir(root,{recursive:true,mode:0o700});
    const destination=path.join(root,storage_key);
    await writeFile(destination,req.file.buffer,{flag:'wx',mode:0o600});
    let record;
    try {
      record=await db.transaction(async t=>{
        const [r]=await t('job_files').insert({job_id:req.fileJob.id,user_id:req.session.user.id,storage_key,filename,mime_type:mime,size_bytes:req.file.size,sha256:createHash('sha256').update(req.file.buffer).digest('hex')}).returning(['id','job_id','filename','mime_type','size_bytes','created_at']);
        await t('audit').insert({user_id:req.session.user.id,action:'private_file_uploaded',entity:'job',entity_id:req.fileJob.id,detail:JSON.stringify({file_id:r.id,filename})});return r;
      });
    } catch(e) {await unlink(destination).catch(()=>{});throw e;}
    res.status(201).json(record);
  });
  app.get('/api/jobs/:id/files/:fileId',async(req,res,next)=>{
    const f=await db('job_files').where({id:id.parse(req.params.fileId),job_id:id.parse(req.params.id)}).first();
    if(!f)throw error(404,'File not found on this job');
    const key=z.uuid().parse(f.storage_key);
    res.set({'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-Type-Options':'nosniff','Content-Type':f.mime_type});
    res.download(key,f.filename,{root,dotfiles:'deny'},e=>{if(e&&!res.headersSent)next(error(e.code==='ENOENT'?404:500,e.code==='ENOENT'?'Stored file is unavailable. Restore the file backup.':'File download failed.'));});
  });
}
