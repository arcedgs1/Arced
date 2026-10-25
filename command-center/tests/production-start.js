import {spawn} from 'node:child_process';
import {setTimeout} from 'node:timers/promises';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
const name='arced_production_test_'+Date.now(),source=new pg.Client({connectionString:process.env.DATABASE_URL});await source.connect();const url=new URL(process.env.DATABASE_URL);url.pathname='/'+name;
const password=randomBytes(24).toString('hex'),env={...process.env,DATABASE_URL:url.toString(),SESSION_SECRET:randomBytes(32).toString('hex'),NODE_ENV:'production',TRUST_PROXY_HOPS:'1',PORT:'3002',SETUP_OWNER_EMAIL:'production-owner@example.test',SETUP_OWNER_PASSWORD:password};let child,log='';const base='http://127.0.0.1:3002',headers={'x-forwarded-proto':'https'};
async function start(){child=spawn(process.execPath,['scripts/production-start.js'],{env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>{log+=b;});child.stderr.on('data',b=>{log+=b;});for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}if(child.exitCode!==null)throw Error('Production start failed: '+log);await setTimeout(100);}throw Error('Production startup timed out');}
async function stop(){if(!child||child.exitCode!==null)return;const ended=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await ended;}
try{await source.query(`CREATE DATABASE ${name}`);await start();let r=await fetch(base+'/api/session',{headers});assert.ok(r.headers.get('set-cookie').includes('Secure'));assert.ok(r.headers.get('set-cookie').includes('HttpOnly'));let cookie=r.headers.get('set-cookie').split(';')[0];const token=(await r.json()).csrf;
r=await fetch(base+'/api/login',{method:'POST',headers:{...headers,cookie,'Content-Type':'application/json','x-csrf-token':token},body:JSON.stringify({email:env.SETUP_OWNER_EMAIL,password})});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];
r=await fetch(base+'/api/operations',{headers:{...headers,cookie}});assert.equal(r.status,200);assert.deepEqual((await r.json()).employees,[]);
const html=await (await fetch(base)).text();assert.ok(!html.includes('/@vite/client'));const asset=html.match(/src="([^"]+\.js)"/)[1];const js=await (await fetch(base+asset)).text();assert.ok(!js.includes(password));assert.ok(!js.includes(env.SESSION_SECRET));
await stop();env.SETUP_OWNER_PASSWORD=randomBytes(24).toString('hex');await start();r=await fetch(base+'/api/operations',{headers:{...headers,cookie}});assert.equal(r.status,200);
const db=new pg.Client({connectionString:url.toString()});await db.connect();assert.equal((await db.query('select count(*)::int as n from users')).rows[0].n,1);assert.equal((await db.query('select count(*)::int as n from clients')).rows[0].n,0);await db.end();assert.ok(!log.includes(password));console.log('PASS production startup: migrations, clean owner bootstrap, secure proxy cookies, static assets, no secret leakage, restart/session persistence');
}finally{await stop();await source.query(`DROP DATABASE IF EXISTS ${name}`);await source.end();}
