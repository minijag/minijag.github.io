import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('web');
const origin = 'http://localhost:4173';
const redirectUri = origin + '/auth/google/callback';
const scopes = ['https://www.googleapis.com/auth/calendar.freebusy','https://www.googleapis.com/auth/calendar.events.owned'];
const random = () => randomBytes(32).toString('base64url');
const fail = (message,status=502) => Object.assign(new Error(message),{status});
async function readBody(req) {
  let body='';
  for await (const chunk of req) { body+=chunk; if(body.length>8192) throw fail('Request too large.',413); }
  try { return JSON.parse(body); } catch { throw fail('Invalid request.',400); }
}
export function createApp({clientId, clientSecret, fetchImpl = fetch} = {}) {
  const sessions = new Map();
  const configured = Boolean(clientId && clientSecret);
  const json = (res, status, body) => { res.writeHead(status, {'Content-Type':'application/json'}); res.end(JSON.stringify(body)); };
  const redirect = (res, to) => { res.writeHead(303, {Location:to}); res.end(); };
  async function google(url, options) {
    const response = await fetchImpl(url, {...options, signal:AbortSignal.timeout(15000)});
    const data = await response.json();
    if (!response.ok || data.error) throw fail('Google request failed.',response.status);
    return data;
  }
  async function token(session) {
    if (session.tokens?.expires > Date.now()+60000) return session.tokens.access_token;
    if (!session.tokens?.refresh_token) { session.tokens=null; throw fail('Reconnect Google Calendar.',401); }
    try {
      const data = await google('https://oauth2.googleapis.com/token', {method:'POST', body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'refresh_token',refresh_token:session.tokens.refresh_token})});
      if (!data.access_token) throw new Error('Missing token');
      session.tokens={...session.tokens,...data,expires:Date.now()+Number(data.expires_in)*1000};
      return data.access_token;
    } catch { session.tokens=null; throw fail('Google authorization expired. Reconnect Google Calendar.',401); }
  }
  async function busy(session,start,end) {
    const access=await token(session);
    const data=await google('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({timeMin:start.toISOString(),timeMax:end.toISOString(),items:[{id:'primary'}]})});
    const cal=data.calendars?.primary;
    if(!cal || cal.errors?.length || !Array.isArray(cal.busy)) throw fail('Calendar availability is unknown. Try refreshing.');
    return cal.busy.map(b=>{
      if(!Number.isFinite(Date.parse(b.start))||!Number.isFinite(Date.parse(b.end))||Date.parse(b.end)<=Date.parse(b.start)) throw fail('Invalid calendar availability.');
      return {start:b.start,end:b.end};
    });
  }
  return http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    // Loopback-only development host, including protection against DNS rebinding.
    if (req.headers.host !== 'localhost:4173') return json(res,403,{error:'Open http://localhost:4173 to use this app.'});
    if (req.headers.origin && req.headers.origin !== origin) return json(res,403,{error:'Origin rejected'});
    const url = new URL(req.url,origin);
    try {
      const id = req.headers.cookie?.match(/(?:^|;\s*)together_session=([\w-]+)/)?.[1];
      let session = sessions.get(id);
      if (session?.until < Date.now()) { sessions.delete(id); session=null; }
      if (!session) {
        for (const [key,value] of sessions) if(value.until<Date.now()) sessions.delete(key);
        session={until:Date.now()+24*3600000,csrf:random(),events:new Map()};
        const sid=random();sessions.set(sid,session);
        res.setHeader('Set-Cookie',`together_session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
      }
      if(req.method==='POST' && (req.headers.origin!==origin || req.headers['x-csrf-token']!==session.csrf)) return json(res,403,{error:'Reload the app and try again.'});
      if (url.pathname==='/api/google/status' && req.method==='GET') return json(res,200,{configured,connected:Boolean(session.tokens),csrf:session.csrf});
      if (url.pathname==='/api/google/start' && req.method==='POST') {
        if(!configured) return json(res,503,{error:'Google OAuth credentials are not configured. Follow the setup instructions in My calendars.'});
        session.oauth={state:random(),verifier:random(),until:Date.now()+600000};
        const params=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:scopes.join(' '),access_type:'offline',prompt:'consent',state:session.oauth.state,code_challenge:createHash('sha256').update(session.oauth.verifier).digest('base64url'),code_challenge_method:'S256'});
        return json(res,200,{url:'https://accounts.google.com/o/oauth2/v2/auth?'+params});
      }
      if (url.pathname==='/auth/google/callback' && req.method==='GET') {
        const pending=session.oauth;delete session.oauth;
        if(!pending || pending.until<Date.now() || url.searchParams.get('state')!==pending.state) return redirect(res,'/?google=invalid_state');
        if(url.searchParams.has('error')) return redirect(res,'/?google=denied');
        if(!url.searchParams.get('code')) return redirect(res,'/?google=failed');
        try {
          const data=await google('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,code:url.searchParams.get('code'),code_verifier:pending.verifier,grant_type:'authorization_code',redirect_uri:redirectUri})});
          if(!data.access_token || !Number.isFinite(Number(data.expires_in)) || !scopes.every(s=>(data.scope||'').split(' ').includes(s))) throw new Error('Missing permissions');
          session.tokens={...data,expires:Date.now()+Number(data.expires_in)*1000};session.events.clear();
          return redirect(res,'/?google=connected');
        } catch { return redirect(res,'/?google=failed'); }
      }
      if(url.pathname==='/api/google/disconnect' && req.method==='POST') {
        const saved=session.tokens;session.tokens=null;delete session.oauth;session.events.clear();
        let revoked=true;
        if(saved) try { const response=await fetchImpl('https://oauth2.googleapis.com/revoke',{method:'POST',body:new URLSearchParams({token:saved.refresh_token||saved.access_token}),signal:AbortSignal.timeout(15000)});revoked=response.ok; } catch { revoked=false; }
        return json(res,200,{disconnected:true,revoked});
      }
      if(url.pathname==='/api/google/busy' && req.method==='GET') {
        if(!session.tokens) return json(res,401,{error:'Connect Google Calendar first.'});
        const start=new Date(url.searchParams.get('start')), end=new Date(url.searchParams.get('end'));
        if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||end-start>32*86400000) return json(res,400,{error:'Choose a valid range of at most 31 days.'});
        const blocks=await busy(session,start,end);
        return json(res,200,{busy:blocks,timeMin:start.toISOString(),timeMax:end.toISOString(),syncedAt:new Date().toISOString()});
      }
      if(url.pathname==='/api/google/events' && req.method==='POST') {
        if(!session.tokens) throw fail('Connect Google Calendar first.',401);
        const input=await readBody(req);
        const start=new Date(input.start),end=new Date(input.end);
        if(!/^[a-f0-9]{32}$/.test(input.id)||typeof input.title!=='string'||!input.title.trim()||input.title.length>120||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||end-start>24*3600000) throw fail('Enter a title and a valid event time.',400);
        const fingerprint=JSON.stringify([input.title.trim(),start.toISOString(),end.toISOString()]);
        const prior=session.events.get(input.id);
        if(prior && prior.fingerprint!==fingerprint) throw fail('This request was already used for another event.',409);
        if(prior?.result) return json(res,200,prior.result);
        if(session.saving) throw fail('An event is being saved. Wait, then try again.',409);
        if(start<Date.now()||start-Date.now()>32*86400000) throw fail('Choose a future time within the next month.',400);
        session.saving=true;
        try {
          // After an uncertain network result, recover only this app-generated ID, never list event details.
          const access=await token(session);
          const eventUrl='https://www.googleapis.com/calendar/v3/calendars/primary/events';
          const savedResult=data=>({saved:true,id:input.id,url:typeof data.htmlLink==='string'&&/^https:\/\/(calendar\.google\.com|www\.google\.com)\//.test(data.htmlLink)?data.htmlLink:'https://calendar.google.com/'});
          if(prior?.attempted) {
            try { const existing=await google(eventUrl+'/'+input.id,{headers:{Authorization:`Bearer ${access}`}}); const result=savedResult(existing);session.events.set(input.id,{fingerprint,result});return json(res,200,result); }
            catch(error) { if(error.status!==404) throw error; }
          }
          const conflicts=await busy(session,start,end);
          if(conflicts.some(b=>Date.parse(b.start)<+end&&Date.parse(b.end)>+start)) throw fail('That time is now busy. Refresh and choose another opening.',409);
          session.events.set(input.id,{fingerprint,attempted:true});
          const data=await google(eventUrl+'?sendUpdates=none',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({id:input.id,summary:input.title.trim(),start:{dateTime:start.toISOString()},end:{dateTime:end.toISOString()},transparency:'opaque'})});
          const result=savedResult(data);session.events.set(input.id,{fingerprint,result});
          return json(res,200,result);
        } finally { session.saving=false; }
      }
      if(req.method!=='GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return json(res,404,{error:'Not found'});
      const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!path.startsWith(root+sep)) return json(res,403,{error:'Forbidden'});
      let body;try {body=await readFile(path);}catch{return json(res,404,{error:'Not found'});}
      res.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.mjs':'text/javascript'})[extname(path)]||'application/octet-stream'});res.end(body);
    } catch(error) {
      const status=[400,401,403,409,413].includes(error.status)?error.status:502;
      json(res,status,{error:error.message==='Google request failed.'?'Google Calendar request failed. Check the API setup and granted permissions, then retry.':error.status?error.message:'Could not reach Google Calendar. Please retry.'});
    }
  });
}
