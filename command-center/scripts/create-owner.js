import {db} from '../server/db.js';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
const divisions=['General contracting','Electrical','Plumbing','Property maintenance','Jersey Junk Pickup','Holiday & permanent lighting','Snow removal'];
try {
  if(process.argv.includes('--check')) {
    process.exitCode=await db('users').first()?0:2;
  } else {
    const account=z.object({email:z.email(),password:z.string().min(12).max(200)}).safeParse({email:process.env.SETUP_OWNER_EMAIL,password:process.env.SETUP_OWNER_PASSWORD});
    if(!account.success)throw Error('Choose a valid email and a password between 12 and 200 characters.');
    const password_hash=await bcrypt.hash(account.data.password,12);
    await db.transaction(async t=>{
      await t.raw("select pg_advisory_xact_lock(hashtext('arced-initial-owner'))");
      if(await t('users').first())throw Error('An account already exists. Sign in with your original credentials; setup does not reset passwords.');
      await t('users').insert({email:account.data.email,name:'Owner',role:'owner',password_hash});
      if(!await t('divisions').first())await t('divisions').insert(divisions.map(name=>({name})));
    });
    console.log('Owner account created. Sign in using the email and password you chose.');
  }
} catch(e) {
  console.error(e.message.startsWith('Choose ')||e.message.startsWith('An account ')?e.message:'Owner setup failed. Check the database and migrations.');process.exitCode=1;
} finally {await db.destroy();}
