import {createApp} from './app.js';
const app=createApp();
if(process.env.NODE_ENV==='production'){app.use((await import('express')).default.static('dist'));}else{const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
app.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('ARCED Command Center running'));
