import pg from 'pg';
import {setTimeout} from 'node:timers/promises';
export async function waitForDatabase({connect,delay=setTimeout,attempts=40,log=console.log}={}){
 const probe=connect||async function(){
  if(!process.env.DATABASE_URL)throw {code:'CONFIG'};
  const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:3000,query_timeout:3000});
  try{await client.connect();await client.query('SELECT 1');}finally{await client.end().catch(()=>{});}
 };
 for(let attempt=1;attempt<=attempts;attempt++){
  try{await probe();log('Database is ready.');return;}catch(e){
   if(!['ECONNREFUSED','ECONNRESET','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','57P03','53300'].includes(e.code))throw new Error('Database connection failed. Check the database status and DATABASE_URL binding in Render.');
   if(attempt===attempts)throw new Error('Database is still unavailable after startup retries. Check arced-crm-db status and its internal connection binding in Render.');
   log(`Waiting for database readiness (${attempt}/${attempts})...`);await delay(3000);
  }
 }
}
