import {db} from '../server/db.js';
try{console.log(await db.migrate.latest({directory:'./migrations'}));}finally{await db.destroy();}
