import { createMultiApp } from './server/multi-app.mjs';
import { localStore, tokenVault } from './server/store.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
try { process.loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir('.private',{recursive:true});
let key=process.env.TOKEN_ENCRYPTION_KEY;
if(!key){try{key=await readFile('.private/token-key','utf8');}catch(error){if(error.code!=='ENOENT')throw error;key=randomBytes(32).toString('base64');await writeFile('.private/token-key',key,{mode:0o600,flag:'wx'});}}
const store=await localStore('.private/accounts.json');
const port=Number(process.env.PORT||4173);
createMultiApp({store,vault:tokenVault(key),clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,
  webUrl:process.env.WEB_URL||'http://localhost:4173/',apiUrl:process.env.API_URL||'http://localhost:4173',serveWeb:process.env.SERVE_WEB!=='false'})
  .listen(port,'127.0.0.1',()=>console.log('Together backend listening on loopback port '+port));
