import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {createMultiApp} from './multi-app.mjs';
import {localStore,tokenVault} from './store.mjs';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status});
const scopes='https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events.owned';
async function setup(t){
  const store=await localStore();let identity='alice',busyFailure=false,inserts=0,conflict=false;
  const server=createMultiApp({store,vault:tokenVault(randomBytes(32).toString('base64')),clientId:'test',clientSecret:'test-secret',webUrl:'https://www.philipgheno.com/togetherapp/',apiUrl:'https://backend.example',serveWeb:false,fetchImpl:async(url,options)=>{
    if(url.endsWith('/token'))return response({access_token:identity,refresh_token:identity+'refresh',expires_in:3600,scope:scopes});
    if(url.endsWith('/userinfo'))return response({sub:identity,name:identity,email_verified:true});
    if(url.endsWith('/freeBusy')){const range=JSON.parse(options.body);return response({calendars:{primary:busyFailure?{errors:[{reason:'notFound'}]}:{busy:conflict?[{start:range.timeMin,end:range.timeMax}]:[]}}});}
    if(url.includes('/events')){inserts++;const event=JSON.parse(options.body);assert.equal(event.attendees,undefined);return response({htmlLink:'https://calendar.google.com/',id:event.id});}
    if(url.endsWith('/revoke'))return response({});
    throw Error('Unexpected endpoint');
  }});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  async function request(path,input,token,origin='https://www.philipgheno.com'){
    return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path,method:input===undefined?'GET':'POST',headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>{let data;try{data=JSON.parse(text);}catch{data=text;}resolve({status:res.statusCode,data,headers:res.headers});});});req.on('error',reject);req.end(input===undefined?undefined:JSON.stringify(input));});
  }
  async function login(name){identity=name;const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');const begin=await request('/api/auth/start',{challenge});const auth=new URL(begin.data.url);assert.equal(auth.searchParams.get('redirect_uri'),'https://backend.example/auth/google/callback');const callback=await request('/auth/google/callback?'+new URLSearchParams({state:auth.searchParams.get('state'),code:'fake'}));const code=new URL(callback.headers.location).hash.split('=')[1];const exchange=await request('/api/auth/exchange',{code,verifier});assert.equal(exchange.status,200);const token=exchange.data.token;return {token,user:(await request('/api/status',undefined,token)).data.user,code,verifier};}
  return {request,login,get inserts(){return inserts;},failBusy(){busyFailure=true;},conflict(){conflict=true;}};
}
const range=()=>({start:new Date(Date.now()+86400000).toISOString(),end:new Date(Date.now()+93600000).toISOString()});
test('OAuth exchanges are one-use, bound to the browser verifier, and cross-origin posts fail',async t=>{const h=await setup(t);const a=await h.login('alice');assert.equal(a.user.name,'alice');assert.equal((await h.request('/api/auth/exchange',{code:a.code,verifier:a.verifier})).status,401);assert.equal((await h.request('/api/invites',{},a.token,'https://evil.example')).status,403);assert.equal((await h.request('/api/friends')).status,401);});
test('two accounts accept an invite and get busy/free; unrelated accounts cannot read it',async t=>{const h=await setup(t),a=await h.login('alice'),b=await h.login('bob'),e=await h.login('eve');const invite=await h.request('/api/invites',{},a.token);assert.ok(invite.data.url.startsWith('https://www.philipgheno.com/togetherapp/#invite='));const token=invite.data.url.split('#invite=')[1];assert.equal((await h.request('/api/invites/accept',{token},b.token)).status,200);const input={...range(),people:[a.user.id,b.user.id]};const available=await h.request('/api/availability',input,a.token);assert.equal(available.status,200);assert.equal(available.data.calendars.length,2);assert.ok(available.data.calendars.every(c=>c.known));assert.ok(!JSON.stringify(available.data).includes('refresh'));assert.equal((await h.request('/api/availability',{...range(),people:[e.user.id,a.user.id]},e.token)).status,403);await h.request('/api/friends/remove',{id:b.user.id},a.token);assert.equal((await h.request('/api/availability',input,b.token)).status,403);});
test('failed calendar reads never become free openings',async t=>{const h=await setup(t),a=await h.login('alice');h.failBusy();const data=await h.request('/api/availability',{...range(),people:[a.user.id]},a.token);assert.equal(data.data.calendars[0].known,false);});
test('event saves recheck availability and are idempotent',async t=>{const h=await setup(t),a=await h.login('alice');const input={...range(),id:'a'.repeat(32),title:'Dinner',people:[a.user.id]};assert.equal((await h.request('/api/events',input,a.token)).data.saved,true);assert.equal((await h.request('/api/events',input,a.token)).data.saved,true);assert.equal(h.inserts,1);h.conflict();assert.equal((await h.request('/api/events',{...input,id:'b'.repeat(32)},a.token)).status,409);assert.equal(h.inserts,1);});
