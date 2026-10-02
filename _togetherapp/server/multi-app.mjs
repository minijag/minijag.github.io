import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {socialService,secret,digest,problem,publicUser} from './social.mjs';

const calendarScopes=['https://www.googleapis.com/auth/calendar.freebusy','https://www.googleapis.com/auth/calendar.events.owned'];
const hashChallenge=value=>createHash('sha256').update(value).digest('base64url');
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>16000)throw problem('Request too large.',413);}try{return JSON.parse(text||'{}');}catch{throw problem('Invalid JSON.');}}
export function createMultiApp({store,vault,clientId,clientSecret,webUrl='http://localhost:4173/',apiUrl='http://localhost:4173',fetchImpl=fetch,serveWeb=true}){
  const frontend=new URL(webUrl),backend=new URL(apiUrl),callback=backend.origin+'/auth/google/callback';
  const social=socialService(store,frontend.href);const root=resolve('web');
  const allowedOrigin=frontend.origin,configured=Boolean(clientId&&clientSecret);
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  const redirect=(res,fragment)=>{res.writeHead(303,{Location:frontend.href+'#'+fragment});res.end();};
  const set=(key,value)=>store.transaction(async tx=>{tx.set(key,value);});
  async function google(url,options){const r=await fetchImpl(url,{...options,signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok||data.error)throw problem('Google Calendar could not complete the request.',r.status===401?401:r.status===404?404:502);return data;}
  async function access(user){
    if(!user?.tokens)throw problem('Calendar disconnected. Ask this person to reconnect.',409);
    const tokens=vault.open(user.tokens);
    if(tokens.expires>Date.now()+60000)return tokens.access_token;
    if(!tokens.refresh_token)throw problem('Calendar authorization expired. Reconnect Google Calendar.',409);
    let data;
    try{data=await google('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'refresh_token',refresh_token:tokens.refresh_token})});}catch{throw problem('Calendar authorization expired or Google is unavailable. Reconnect or retry.',409);}
    if(!data.access_token)throw problem('Calendar authorization expired.',409);
    await store.transaction(async tx=>{const current=await tx.get('user_'+user.id);if(!current?.tokens)throw problem('Calendar disconnected.',409);if(current.tokens===user.tokens)tx.set('user_'+user.id,{...current,tokens:vault.seal({...tokens,...data,expires:Date.now()+Number(data.expires_in)*1000})});});
    return data.access_token;
  }
  async function busy(user,start,end){const token=await access(user);const data=await google('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({timeMin:start.toISOString(),timeMax:end.toISOString(),items:[{id:'primary'}]})});const cal=data.calendars?.primary;if(!cal||cal.errors?.length||!Array.isArray(cal.busy))throw problem('Calendar availability is unknown. Please reconnect or retry.',409);return cal.busy.map(b=>{if(!Number.isFinite(Date.parse(b.start))||!Number.isFinite(Date.parse(b.end))||Date.parse(b.end)<=Date.parse(b.start))throw problem('Invalid calendar availability.',502);return {start:b.start,end:b.end};});}
  async function authenticated(req){const bearer=req.headers.authorization?.match(/^Bearer ([\w-]{43})$/)?.[1];if(!bearer)throw problem('Sign in with Google to continue.',401);const key='session_'+digest(bearer),session=await store.get(key);if(!session||session.expires<Date.now())throw problem('Your session expired. Sign in again.',401);const user=await store.get('user_'+session.user);if(!user)throw problem('Sign in again.',401);return {user,key};}
  const rates=new Map();
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    if(req.headers.origin===allowedOrigin){res.setHeader('Access-Control-Allow-Origin',allowedOrigin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
    if(req.headers.origin&&req.headers.origin!==allowedOrigin)return json(res,403,{error:'Origin rejected.'});
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    let url;try{url=new URL(req.url,backend);}catch{return json(res,400,{error:'Invalid URL.'});}
    try{
      if(req.method==='POST'&&req.headers.origin!==allowedOrigin)throw problem('Origin rejected.',403);
      if(url.pathname==='/health')return json(res,200,{ok:true});
      if(url.pathname==='/api/auth/start'&&req.method==='POST'){
        if(!configured)throw problem('Calendar sign-in is not configured yet.',503);
        const ip=req.socket.remoteAddress;const rate=rates.get(ip)||{count:0,until:Date.now()+60000};if(rate.until<Date.now()){rate.count=0;rate.until=Date.now()+60000;}if(++rate.count>100)throw problem('Too many sign-in attempts. Try again shortly.',429);rates.set(ip,rate);if(rates.size>10000)for(const[key,value]of rates)if(value.until<Date.now())rates.delete(key);
        const input=await body(req);if(!/^[\w-]{43}$/.test(input.challenge||''))throw problem('Missing browser security challenge. Reload and try again.');
        const state=secret(),verifier=secret();await set('oauth_'+digest(state),{challenge:input.challenge,verifier,expires:Date.now()+600000});
        const params=new URLSearchParams({client_id:clientId,redirect_uri:callback,response_type:'code',scope:['openid','email','profile',...calendarScopes].join(' '),access_type:'offline',prompt:'consent',state,code_challenge:hashChallenge(verifier),code_challenge_method:'S256'});
        return json(res,200,{url:'https://accounts.google.com/o/oauth2/v2/auth?'+params});
      }
      if(url.pathname==='/auth/google/callback'&&req.method==='GET'){
        try{
          const state=url.searchParams.get('state');if(!/^[\w-]{43}$/.test(state||''))throw problem('Invalid state.');
          const pending=await store.transaction(async tx=>{const key='oauth_'+digest(state),record=await tx.get(key);if(!record||record.expires<Date.now())throw problem('Sign-in expired.');tx.delete(key);return record;});
          if(url.searchParams.has('error'))return redirect(res,'auth_error=denied');
          if(!url.searchParams.get('code'))throw problem('Missing authorization code.');
          const data=await google('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code:url.searchParams.get('code'),code_verifier:pending.verifier,grant_type:'authorization_code',redirect_uri:callback})});
          if(!data.access_token||!calendarScopes.every(s=>(data.scope||'').split(' ').includes(s)))throw problem('Both calendar permissions are required.');
          const identity=await google('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+data.access_token}});
          if(!identity.sub||identity.email_verified!==true)throw problem('A verified Google account is required.');
          const id=digest(identity.sub),code=secret();
          await store.transaction(async tx=>{
            const previous=await tx.get('user_'+id);const old=previous?.tokens?vault.open(previous.tokens):{};
            tx.set('user_'+id,{id,name:String(identity.name||'Together friend').slice(0,100),friends:previous?.friends||[],invites:previous?.invites||[],tokens:vault.seal({access_token:data.access_token,refresh_token:data.refresh_token||old.refresh_token||null,expires:Date.now()+Number(data.expires_in)*1000})});
            tx.set('exchange_'+digest(code),{user:id,challenge:pending.challenge,expires:Date.now()+120000});
          });
          return redirect(res,'auth_code='+code);
        }catch{return redirect(res,'auth_error=failed');}
      }
      if(url.pathname==='/api/auth/exchange'&&req.method==='POST'){
        const input=await body(req);if(!/^[\w-]{43}$/.test(input.code||'')||!/^[\w-]{43}$/.test(input.verifier||''))throw problem('Sign-in expired. Try again.',401);
        const token=secret();await store.transaction(async tx=>{const key='exchange_'+digest(input.code),record=await tx.get(key);if(!record||record.expires<Date.now()||record.challenge!==hashChallenge(input.verifier))throw problem('Sign-in must finish in the browser where it started.',401);tx.delete(key);tx.set('session_'+digest(token),{user:record.user,expires:Date.now()+7*86400000});});return json(res,200,{token});
      }
      if(url.pathname==='/api/status'&&req.method==='GET'){
        let user=null;try{user=(await authenticated(req)).user;}catch{}
        return json(res,200,{configured,user:user?publicUser(user):null});
      }
      if(url.pathname==='/api/invites/preview'&&req.method==='POST')return json(res,200,await social.preview((await body(req)).token));
      if(url.pathname.startsWith('/api/')){
        const {user,key}=await authenticated(req);
        if(url.pathname==='/api/logout'&&req.method==='POST'){await store.transaction(async tx=>{tx.delete(key);});return json(res,200,{ok:true});}
        if(url.pathname==='/api/friends'&&req.method==='GET')return json(res,200,{friends:await social.friends(user.id),invitations:await social.invitations(user.id)});
        if(url.pathname==='/api/invites'&&req.method==='POST')return json(res,200,await social.invite(user.id));
        if(url.pathname==='/api/invites/accept'&&req.method==='POST')return json(res,200,{friend:await social.accept(user.id,(await body(req)).token)});
        if(url.pathname==='/api/invites/revoke'&&req.method==='POST'){await social.revoke(user.id,(await body(req)).id);return json(res,200,{ok:true});}
        if(url.pathname==='/api/friends/remove'&&req.method==='POST'){await social.remove(user.id,(await body(req)).id);return json(res,200,{ok:true});}
        if(url.pathname==='/api/disconnect'&&req.method==='POST'){
          await store.transaction(async tx=>{const current=await tx.get('user_'+user.id);tx.set('user_'+user.id,{...current,tokens:null});});
          let revoked=true;if(user.tokens){const tokens=vault.open(user.tokens);try{const r=await fetchImpl('https://oauth2.googleapis.com/revoke',{method:'POST',body:new URLSearchParams({token:tokens.refresh_token||tokens.access_token}),signal:AbortSignal.timeout(15000)});revoked=r.ok;}catch{revoked=false;}}
          return json(res,200,{ok:true,revoked});
        }
        if(url.pathname==='/api/availability'&&req.method==='POST'){
          const input=await body(req),start=new Date(input.start),end=new Date(input.end);
          if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||end-start>32*86400000||start<Date.now()-2*86400000||end>Date.now()+33*86400000)throw problem('Choose a range within the next month.');
          const users=await social.authorize(user.id,input.people);
          const calendars=await Promise.all(users.map(async person=>{try{return {id:person.id,known:true,busy:await busy(person,start,end)};}catch{return {id:person.id,known:false,busy:[],error:'Calendar unavailable. This person may need to reconnect.'};}}));
          // Removal or disconnection during a network request must prevent newly delivered data.
          const fresh=await social.authorize(user.id,input.people);for(const cal of calendars)if(!fresh.find(p=>p.id===cal.id)?.tokens){cal.known=false;cal.busy=[];}
          return json(res,200,{calendars,timeMin:start.toISOString(),timeMax:end.toISOString(),syncedAt:new Date().toISOString()});
        }
        if(url.pathname==='/api/events'&&req.method==='POST'){
          const input=await body(req),start=new Date(input.start),end=new Date(input.end);
          if(!/^[a-f0-9]{32}$/.test(input.id||'')||typeof input.title!=='string'||!input.title.trim()||input.title.length>120||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||end-start>24*3600000)throw problem('Enter a title and valid event time.');
          const users=await social.authorize(user.id,input.people);
          const fingerprint=digest(JSON.stringify([input.title.trim(),input.start,input.end,[...input.people].sort()])),eventKey='event_'+user.id+'_'+input.id;
          const attempt=await store.transaction(async tx=>{const prior=await tx.get(eventKey);if(prior?.fingerprint!==undefined&&prior.fingerprint!==fingerprint)throw problem('This request was used for another event.',409);if(prior?.result)return prior;if(prior?.lockedUntil>Date.now())throw problem('Saving is in progress. Please retry shortly.',409);if(start<Date.now()||start-Date.now()>32*86400000)throw problem('Choose a future time within the next month.');const next={...prior,fingerprint,lockedUntil:Date.now()+90000};tx.set(eventKey,next);return {...next,retry:!!prior?.attempted};});
          if(attempt.result)return json(res,200,attempt.result);
          const eventUrl='https://www.googleapis.com/calendar/v3/calendars/primary/events';
          const resultFor=data=>({saved:true,url:typeof data.htmlLink==='string'&&/^https:\/\/(calendar\.google\.com|www\.google\.com)\//.test(data.htmlLink)?data.htmlLink:'https://calendar.google.com/'});
          try{
            const auth=await access(user);
            if(attempt.retry){try{const existing=await google(eventUrl+'/'+input.id,{headers:{Authorization:'Bearer '+auth}});const result=resultFor(existing);await set(eventKey,{fingerprint,result,lockedUntil:0});return json(res,200,result);}catch(error){if(error.status!==404)throw error;}}
            for(const person of users){const blocks=await busy(person,start,end);if(blocks.some(b=>Date.parse(b.start)<+end&&Date.parse(b.end)>+start))throw problem('Someone is now busy. Refresh and choose a new time.',409);}
            const fresh=await social.authorize(user.id,input.people);if(fresh.some(person=>!person.tokens))throw problem('A calendar was disconnected. Refresh first.',409);
            await set(eventKey,{fingerprint,attempted:true,lockedUntil:Date.now()+90000});
            const data=await google(eventUrl+'?sendUpdates=none',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({id:input.id,summary:input.title.trim(),start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()},transparency:'opaque'})});
            const result=resultFor(data);await set(eventKey,{fingerprint,result,lockedUntil:0});return json(res,200,result);
          }finally{await store.transaction(async tx=>{const record=await tx.get(eventKey);if(record)tx.set(eventKey,{...record,lockedUntil:0});});}
        }
        throw problem('Not found.',404);
      }
      if(!serveWeb||req.method!=='GET')throw problem('Not found.',404);
      const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root+sep))throw problem('Not found.',404);
      let content;try{content=await readFile(path);}catch{throw problem('Not found.',404);}
      res.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json'})[extname(path)]||'application/octet-stream'});res.end(content);
    }catch(error){json(res,[400,401,403,404,409,410,413,429,503].includes(error.status)?error.status:502,{error:error.status?error.message:'The service is temporarily unavailable. Please retry.'});}
  });
}
