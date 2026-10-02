import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from './app.mjs';

const scopes='https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events.owned';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
async function harness(t,fetchImpl,configured=true){
  const server=createApp({...(configured?{clientId:'test-client',clientSecret:'test-secret'}:{}),fetchImpl});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  let cookie='',csrf='';
  async function request(path,{method='GET',body,headers={}}={}){
    return new Promise((resolve,reject)=>{
      const req=http.request({host:'127.0.0.1',port:server.address().port,path,method,headers:{Host:'localhost:4173',Cookie:cookie,...(method==='POST'?{Origin:'http://localhost:4173','X-CSRF-Token':csrf,'Content-Type':'application/json'}:{}),...headers}},res=>{
        let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>{
          if(res.headers['set-cookie'])cookie=res.headers['set-cookie'][0].split(';')[0];
          let data;try{data=JSON.parse(text);}catch{data=text;}
          if(data?.csrf)csrf=data.csrf;
          resolve({status:res.statusCode,headers:res.headers,data,text});
        });
      });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
    });
  }
  async function login(){
    await request('/api/google/status');
    const start=await request('/api/google/start',{method:'POST'});
    assert.equal(start.status,200);
    const auth=new URL(start.data.url);
    assert.equal(auth.searchParams.get('redirect_uri'),'http://localhost:4173/auth/google/callback');
    assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
    assert.equal(auth.searchParams.get('scope'),scopes);
    return request('/auth/google/callback?'+new URLSearchParams({code:'test-code',state:auth.searchParams.get('state')}));
  }
  return {request,login};
}
const tokenResponse=()=>response({access_token:'private-access',refresh_token:'private-refresh',expires_in:3600,scope:scopes});
const eventInput=()=>({id:'a'.repeat(32),title:'Dinner together',start:new Date(Date.now()+86400000).toISOString(),end:new Date(Date.now()+93600000).toISOString()});

test('missing setup is actionable; secrets and .env are not exposed',async t=>{
  const {request}=await harness(t,()=>{throw Error('Unexpected Google call');},false);
  const status=await request('/api/google/status');assert.equal(status.data.configured,false);assert.equal(status.data.connected,false);
  assert.match(status.headers['set-cookie'][0],/HttpOnly; SameSite=Lax/);
  assert.equal((await request('/api/google/start',{method:'POST'})).status,503);
  assert.equal((await request('/.env')).status,404);
  assert.equal((await request('/server/app.mjs')).status,404);
});
test('OAuth rejects cross-origin, missing CSRF and mismatched or replayed state',async t=>{
  let calls=0;
  const {request}=await harness(t,async()=>{calls++;return tokenResponse();});
  await request('/api/google/status');
  assert.equal((await request('/api/google/start',{method:'POST',headers:{Origin:'https://other.test'}})).status,403);
  assert.equal((await request('/api/google/start',{method:'POST',headers:{'X-CSRF-Token':''}})).status,403);
  assert.equal((await request('/api/google/status',{headers:{Host:'hostile.test'}})).status,403);
  const start=await request('/api/google/start',{method:'POST'});
  const state=new URL(start.data.url).searchParams.get('state');
  const invalid=await request('/auth/google/callback?state=wrong&code=secret');
  assert.equal(invalid.headers.location,'/?google=invalid_state');
  assert.equal((await request('/auth/google/callback?state='+state+'&code=secret')).headers.location,'/?google=invalid_state');
  assert.equal(calls,0);
});
test('connected calendar returns only busy intervals and supports disconnect',async t=>{
  const input=eventInput();let payload;
  const {request,login}=await harness(t,async(url,options)=>{
    if(url.endsWith('/token')){assert.equal(options.body.get('code'),'test-code');assert.ok(options.body.get('code_verifier'));return tokenResponse();}
    if(url.endsWith('/revoke'))return response({});
    payload=JSON.parse(options.body);
    return response({calendars:{primary:{busy:[{start:input.start,end:input.end,summary:'Must never leave adapter'}]}}});
  });
  assert.equal((await login()).headers.location,'/?google=connected');
  const result=await request('/api/google/busy?'+new URLSearchParams({start:input.start,end:input.end}));
  assert.deepEqual(result.data.busy,[{start:input.start,end:input.end}]);
  assert.deepEqual(payload.items,[{id:'primary'}]);
  assert.ok(!result.text.includes('summary'));assert.ok(!result.text.includes('private-access'));
  assert.equal((await request('/api/google/disconnect',{method:'POST'})).data.revoked,true);
  assert.equal((await request('/api/google/status')).data.connected,false);
  assert.equal((await request('/api/google/busy')).status,401);
});
test('per-calendar errors are unknown, never an empty available calendar',async t=>{
  const {request,login}=await harness(t,async url=>url.endsWith('/token')?tokenResponse():response({calendars:{primary:{errors:[{reason:'notFound'}]}}}));
  await login();const input=eventInput();
  const result=await request('/api/google/busy?'+new URLSearchParams({start:input.start,end:input.end}));
  assert.equal(result.status,502);assert.equal(result.data.busy,undefined);
});
test('creates approved event, checks conflicts, and retries without duplicate insertion',async t=>{
  let inserts=0,checks=0,created;
  const {request,login}=await harness(t,async(url,options)=>{
    if(url.endsWith('/token'))return tokenResponse();
    if(url.endsWith('/freeBusy')){checks++;return response({calendars:{primary:{busy:[]}}});}
    inserts++;created=JSON.parse(options.body);return response({id:created.id,htmlLink:'https://calendar.google.com/calendar/event?eid=test'});
  });
  await login();const input=eventInput();
  const saved=await request('/api/google/events',{method:'POST',body:input});
  assert.equal(saved.status,200);assert.equal(saved.data.saved,true);
  assert.equal(checks,1);assert.equal(inserts,1);
  assert.equal(created.summary,input.title);assert.equal(created.attendees,undefined);assert.equal(created.transparency,'opaque');
  assert.equal((await request('/api/google/events',{method:'POST',body:input})).data.saved,true);
  assert.equal(inserts,1);
  assert.equal((await request('/api/google/events',{method:'POST',body:{...input,title:'Changed'}})).status,409);
});
test('new conflict prevents saving',async t=>{
  const input=eventInput();let inserts=0;
  const {request,login}=await harness(t,async url=>{
    if(url.endsWith('/token'))return tokenResponse();
    if(url.endsWith('/freeBusy'))return response({calendars:{primary:{busy:[{start:input.start,end:input.end}]}}});
    inserts++;return response({});
  });
  await login();assert.equal((await request('/api/google/events',{method:'POST',body:input})).status,409);assert.equal(inserts,0);
});
test('uncertain insertion recovers the same event ID on retry',async t=>{
  let inserts=0;
  const input=eventInput();
  const {request,login}=await harness(t,async(url,options)=>{
    if(url.endsWith('/token'))return tokenResponse();
    if(url.endsWith('/freeBusy'))return response({calendars:{primary:{busy:[]}}});
    if(options.method==='POST'){inserts++;throw Error('Connection lost after Google accepted');}
    assert.ok(url.endsWith('/'+input.id));return response({id:input.id,htmlLink:'https://calendar.google.com/'});
  });
  await login();assert.equal((await request('/api/google/events',{method:'POST',body:input})).status,502);
  assert.equal((await request('/api/google/events',{method:'POST',body:input})).data.saved,true);assert.equal(inserts,1);
});
test('partial permission grant does not mark the calendar connected',async t=>{
  const {request,login}=await harness(t,async()=>response({access_token:'access',expires_in:3600,scope:'https://www.googleapis.com/auth/calendar.freebusy'}));
  assert.equal((await login()).headers.location,'/?google=failed');
  assert.equal((await request('/api/google/status')).data.connected,false);
});
test('expired access tokens refresh on the server',async t=>{
  let refreshes=0;
  const {request,login}=await harness(t,async(url,options)=>{
    if(url.endsWith('/token')){
      if(options.body.get('grant_type')==='refresh_token'){refreshes++;return response({access_token:'refreshed',expires_in:3600});}
      return response({access_token:'expired',refresh_token:'private-refresh',expires_in:0,scope:scopes});
    }
    assert.equal(options.headers.Authorization,'Bearer refreshed');return response({calendars:{primary:{busy:[]}}});
  });
  await login();const input=eventInput();
  assert.equal((await request('/api/google/busy?'+new URLSearchParams({start:input.start,end:input.end}))).status,200);
  assert.equal(refreshes,1);
});
