import {db} from '../server/db.js';
import bcrypt from 'bcryptjs';
try{
if(!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length<12)throw Error('Set SEED_PASSWORD to at least 12 characters.');
await db.transaction(async t=>{
await t('users').insert({email:process.env.SEED_EMAIL||'owner@example.test',name:'Demo owner',password_hash:await bcrypt.hash(process.env.SEED_PASSWORD,12),role:'owner'}).onConflict('email').ignore();
if(!(await t('divisions').first()))await t('divisions').insert(['General contracting','Electrical','Plumbing','Property maintenance','Jersey Junk Pickup','Holiday & permanent lighting','Snow removal'].map(name=>({name})));
if(!(await t('clients').first()))await t('clients').insert({name:'Maple House Demo',email:'maple@example.test',billing_address:'Fictional property, Bergen County, NJ',notes:'Fictional sample record — replace before real use.'});
});console.log('Seed complete (existing records preserved).');
}finally{await db.destroy();}
