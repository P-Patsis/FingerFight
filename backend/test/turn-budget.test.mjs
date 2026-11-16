import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openDB} from '../sqlite.mjs';
import {budgetedRelayConfig,checkRelayBudget,monitorRelayBudget} from '../turn-budget.mjs';
import {createApp} from '../worker.mjs';
function setup(){
 const DB=openDB();DB.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 const day=new Date().toISOString().slice(0,10),end=new Date(Date.now()+86400000).toISOString().slice(0,10);
 const env={DB,TURN_RELAY_ENABLED:'true',TURN_KEY_ID:'key',TURN_API_TOKEN:'private-mint-token',TURN_ACCOUNT_ID:'account',TURN_USAGE_API_TOKEN:'private-analytics-token',TURN_BUDGET_START:day,TURN_BUDGET_END:end};
 const original=globalThis.fetch;let bytes=0,mints=0,revokeOK=true,mode='ok';const revoked=[];
 globalThis.fetch=async(url,opts)=>{
  if(url.endsWith('/graphql')){
   assert.equal(opts.headers.Authorization,'Bearer private-analytics-token');const {query,variables}=JSON.parse(opts.body);assert.equal(variables.accountId,'account');assert.equal(variables.from,day);assert.ok(!query.includes('keyId:'),'account-wide TURN total');
   if(mode==='offline')throw new Error('offline');if(mode==='error')return Response.json({errors:[{message:'bad query'}],data:null});if(mode==='malformed')return Response.json({data:{viewer:{accounts:[]}}});
   return Response.json({data:{viewer:{accounts:[{callsTurnUsageAdaptiveGroups:[{sum:{egressBytes:bytes}}]}]}}});
  }
  assert.equal(opts.headers.Authorization,'Bearer private-mint-token');
  if(url.endsWith('/generate-ice-servers')){mints++;return Response.json({iceServers:[{urls:['turn:turn.cloudflare.com:3478'],username:'temporary-'+mints,credential:'client-password'}]});}
  if(url.endsWith('/revoke')){revoked.push(url);return new Response(null,{status:revokeOK?204:503});}
  throw new Error('Unexpected URL');
 };
 return{DB,env,revoked,get mints(){return mints;},usage:n=>{bytes=n;},mode:m=>{mode=m;},revokeOK:v=>{revokeOK=v;},close(){globalThis.fetch=original;DB.close();}};
}
test('default production route is paused even when mint secrets exist; no unauthenticated budget bypass',async()=>{
 const s=setup();try{delete s.env.TURN_RELAY_ENABLED;const app=createApp();s.env.ALLOWED_ORIGINS='https://localhost';const request=(path,data,token)=>app.fetch(new Request('https://api.test'+path,{method:'POST',headers:{Origin:'https://localhost','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)}),s.env);
 assert.equal((await request('/rtc/config',{})).status,401);const u=await (await request('/players/session',{name:'Test'})).json();const response=await request('/rtc/config',{},u.token);assert.equal(response.status,503);assert.match((await response.json()).error,/paused/);assert.equal(s.mints,0);s.env.TURN_RELAY_ENABLED='true';assert.equal((await request('/rtc/config',{},u.token)).status,200);s.usage(800_000_000_000);assert.equal((await request('/rtc/config',{},u.token)).status,503);assert.equal(s.mints,1);
 }finally{s.close();}
});
test('under-budget request mints only after trusted usage and records revocable username without storing passwords/tokens',async()=>{
 const s=setup();try{s.usage(799_000_000_000);const r=await budgetedRelayConfig(s.env);assert.equal(s.mints,1);assert.equal(r.iceServers[0].username,'temporary-1');assert.ok(!JSON.stringify(r).includes('private-'));
 const rows=(await s.DB.prepare('SELECT * FROM turn_credentials').all()).results;assert.equal(rows.length,1);assert.ok(rows[0].expires<=Math.floor(Date.now()/1000)+600);assert.ok(rows[0].expires>=Math.floor(Date.now()/1000)+595);assert.ok(!JSON.stringify(rows).includes('client-password'));assert.ok(!JSON.stringify(rows).includes('private-'));
 }finally{s.close();}
});
test('800 GB cutoff is sticky, revokes existing credentials, and cannot be reopened by a smaller delayed analytics total',async()=>{
 const s=setup();try{await budgetedRelayConfig(s.env);s.usage(800_000_000_000);await assert.rejects(()=>budgetedRelayConfig(s.env),/allowance reached/);assert.equal(s.mints,1);assert.equal(s.revoked.length,1);assert.equal((await s.DB.prepare('SELECT revoked FROM turn_credentials').first()).revoked,1);
 s.usage(0);await assert.rejects(()=>budgetedRelayConfig(s.env),/allowance reached/);assert.equal(s.mints,1);
 }finally{s.close();}
});
test('analytics failures/errors/malformed totals fail closed without minting',async()=>{
 for(const mode of ['offline','error','malformed']){const s=setup();try{s.mode(mode);await assert.rejects(()=>budgetedRelayConfig(s.env),/could not be verified/);assert.equal(s.mints,0);}finally{s.close();}}
 const s=setup();try{s.usage(-1);await assert.rejects(()=>budgetedRelayConfig(s.env),/could not be verified/);s.usage(NaN);await assert.rejects(()=>budgetedRelayConfig(s.env),/could not be verified/);}finally{s.close();}
});
test('disabled relay, expired billing period, invalid limits and static credential bypass fail closed',async()=>{
 for(const change of [{TURN_RELAY_ENABLED:'false'},{TURN_BUDGET_START:'2020-01-01',TURN_BUDGET_END:'2020-02-01'},{TURN_BUDGET_BYTES:'900000000000'},{TURN_MAX_CREDENTIALS:'0'},{TURN_USAGE_API_TOKEN:''},{TURN_SERVERS_JSON:'[]'}]){const s=setup();try{Object.assign(s.env,change);await assert.rejects(()=>budgetedRelayConfig(s.env));assert.equal(s.mints,0);}finally{s.close();}}
});
test('atomic monthly issuance reservation prevents concurrent requests exceeding operator quota',async()=>{
 const s=setup();try{s.env.TURN_MAX_CREDENTIALS='3';const results=await Promise.allSettled(Array.from({length:12},()=>budgetedRelayConfig(s.env)));assert.ok(s.mints<=3);assert.ok(results.filter(r=>r.status==='fulfilled').length<=3);assert.equal((await s.DB.prepare('SELECT issued FROM turn_budget_windows').first()).issued,3);await assert.rejects(()=>budgetedRelayConfig(s.env),/allowance reached/);
 }finally{s.close();}
});
test('scheduled monitor trips without new players and retries failed revocations; manual switch also revokes',async()=>{
 const s=setup();try{await budgetedRelayConfig(s.env);s.usage(800_000_000_000);s.revokeOK(false);await createApp().scheduled({cron:'* * * * *'},s.env);assert.equal((await s.DB.prepare('SELECT revoked FROM turn_credentials').first()).revoked,0);s.revokeOK(true);await monitorRelayBudget(s.env);assert.equal((await s.DB.prepare('SELECT revoked FROM turn_credentials').first()).revoked,1);
 }finally{s.close();}
 const s2=setup();try{await budgetedRelayConfig(s2.env);s2.env.TURN_RELAY_ENABLED='false';await monitorRelayBudget(s2.env);assert.equal(s2.revoked.length,1);assert.equal(s2.mints,1);}finally{s2.close();}
});
test('cap tripping while credential generation is in flight prevents returning that credential',async()=>{
 const s=setup(),fetcher=globalThis.fetch;let release,entered;const started=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
 globalThis.fetch=async(url,opts)=>{if(url.endsWith('/generate-ice-servers')){entered();await wait;}return fetcher(url,opts);};
 try{const pending=budgetedRelayConfig(s.env);await started;s.usage(800_000_000_000);await assert.rejects(()=>checkRelayBudget(s.env),/allowance reached/);release();await assert.rejects(()=>pending,/allowance reached/);assert.ok(s.revoked.length>0);}
 finally{release?.();s.close();}
});

test('revocations stay bounded per invocation and progress through a backlog without new mint requests',async()=>{
 const s=setup();try{for(let i=0;i<40;i++)await s.DB.prepare('INSERT INTO turn_credentials(username,key_id,expires) VALUES(?,?,?)').bind('old-'+i,'key',Math.floor(Date.now()/1000)+3600).run();s.env.TURN_RELAY_ENABLED='false';await monitorRelayBudget(s.env);assert.equal(s.revoked.length,32);await monitorRelayBudget(s.env);assert.equal(s.revoked.length,40);assert.equal((await s.DB.prepare('SELECT count(*) n FROM turn_credentials WHERE revoked=0').first()).n,0);}
 finally{s.close();}
});

test('a provider 404 is recorded and retried, not treated as proof of revoked credentials',async()=>{
 const s=setup(),fetcher=globalThis.fetch;try{await budgetedRelayConfig(s.env);globalThis.fetch=async(url,opts)=>url.endsWith('/revoke')?new Response(null,{status:404}):fetcher(url,opts);s.env.TURN_RELAY_ENABLED='false';await monitorRelayBudget(s.env);assert.equal((await s.DB.prepare('SELECT revoked FROM turn_credentials').first()).revoked,0);assert.equal((await s.DB.prepare('SELECT status FROM turn_revocations').first()).status,404);globalThis.fetch=fetcher;await monitorRelayBudget(s.env);assert.equal((await s.DB.prepare('SELECT revoked FROM turn_credentials').first()).revoked,1);assert.equal((await s.DB.prepare('SELECT status FROM turn_revocations').first()).status,204);}
 finally{s.close();}
});

test('concurrent bursts reserve a bounded number of live credentials, even after acknowledged revocation',async()=>{
 const s=setup();try{s.env.TURN_MAX_ACTIVE_CREDENTIALS='2';const results=await Promise.allSettled(Array.from({length:12},()=>budgetedRelayConfig(s.env)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,2);assert.equal(s.mints,2);assert.equal((await s.DB.prepare('SELECT issued FROM turn_budget_windows').first()).issued,2);
 await s.DB.prepare('UPDATE turn_credentials SET revoked=1').run();await assert.rejects(()=>budgetedRelayConfig(s.env),/capacity reached/);assert.equal(s.mints,2);
 await s.DB.prepare('UPDATE turn_credential_slots SET expires=0').run();await budgetedRelayConfig(s.env);assert.equal(s.mints,3);
 }finally{s.close();}
});
