import {spawnSync} from 'node:child_process';
import {waitForDatabase} from './wait-for-database.js';
try{await waitForDatabase();}catch(e){console.error(e.message);process.exit(1);}
const run=(script,args=[])=>spawnSync(process.execPath,[script,...args],{stdio:'inherit',env:process.env});
const migrated=run('scripts/migrate.js');
if(migrated.status!==0)process.exit(migrated.status||1);
const checked=run('scripts/create-owner.js',['--check']);
if(checked.status===2){
 const created=run('scripts/create-owner.js');
 if(created.status!==0)process.exit(created.status||1);
}else if(checked.status!==0){process.exit(checked.status||1);}
// Bootstrap values are not needed by the application process after setup.
delete process.env.SETUP_OWNER_PASSWORD;
delete process.env.SETUP_OWNER_EMAIL;
await import('../server/index.js');
