// Protective admission cutoff, not a provider-enforced dollar/byte ceiling.
import {QueueError,relayConfig,RELAY_TTL_SECONDS} from './matchmaking.mjs';
const q=(db,sql,...args)=>db.prepare(sql).bind(...args);
const now=()=>Math.floor(Date.now()/1000);
const fail=message=>{throw new QueueError(503,message);};
const PAUSED='Online play paused: relay allowance reached.';
const UNAVAILABLE='Online play paused: relay usage could not be verified.';
function policy(env){
 const start=Date.parse(env.TURN_BUDGET_START),end=Date.parse(env.TURN_BUDGET_END),t=Date.now();
 const cap=Number(env.TURN_BUDGET_BYTES??800_000_000_000),issues=Number(env.TURN_MAX_CREDENTIALS??1000);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(env.TURN_BUDGET_START||'')||!/^\d{4}-\d{2}-\d{2}$/.test(env.TURN_BUDGET_END||'')||!(start<=t&&t<end&&end-start<=32*86400000)||!Number.isSafeInteger(cap)||cap<=0||cap>800_000_000_000||!Number.isSafeInteger(issues)||issues<1||issues>10000||!env.DB||!env.TURN_ACCOUNT_ID||!env.TURN_USAGE_API_TOKEN||!env.TURN_KEY_ID||!env.TURN_API_TOKEN||env.TURN_SERVERS_JSON)fail(UNAVAILABLE);
 return{start:env.TURN_BUDGET_START,end:env.TURN_BUDGET_END,cap,issues};
}
// Await every revocation. Failed attempts remain in D1 for the next request/scheduled retry.
export async function revokeIssued(env){
 if(!env.DB)return;
 const rows=(await q(env.DB,'SELECT username,key_id FROM turn_credentials WHERE revoked=0 AND expires>? ORDER BY attempted,expires DESC LIMIT 32',now()).all()).results;
 for(let i=0;i<rows.length;i+=4)await Promise.all(rows.slice(i,i+4).map(async row=>{
  if(!env.TURN_API_TOKEN)return;
  try{
   await q(env.DB,'UPDATE turn_credentials SET attempted=? WHERE username=?',now(),row.username).run();
   const r=await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/'+encodeURIComponent(row.key_id)+'/credentials/'+encodeURIComponent(row.username)+'/revoke',{method:'POST',headers:{Authorization:'Bearer '+env.TURN_API_TOKEN},signal:AbortSignal.timeout(10000)});
   await r.body?.cancel();
   await q(env.DB,'INSERT INTO turn_revocations(username,status,attempted) VALUES(?,?,?) ON CONFLICT(username) DO UPDATE SET status=excluded.status,attempted=excluded.attempted',row.username,r.status,now()).run();
   if(r.status===204)await q(env.DB,'UPDATE turn_credentials SET revoked=1 WHERE username=? AND key_id=?',row.username,row.key_id).run();
  }catch{/* Keep pending; never log tokens or provider response bodies. */}
 }));
}
async function block(env,p,permanent=false){
 await q(env.DB,'UPDATE turn_budget_windows SET blocked=1,stopped=max(stopped,?) WHERE period_start=?',permanent?1:0,p.start).run();
 await revokeIssued(env);
}
async function reportedBytes(env,p){
 // No dimensions: one aggregate for ALL TURN keys in this account, not just this game's key.
 const query=`query TurnBudget($accountId: String!, $from: Date!, $to: Date!) { viewer { accounts(filter: {accountTag: $accountId}) { callsTurnUsageAdaptiveGroups(limit: 1, filter: {date_geq: $from, date_leq: $to}) { sum { egressBytes } } } } }`;
 const to=new Date(Date.parse(p.end)-86400000).toISOString().slice(0,10);
 const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{Authorization:'Bearer '+env.TURN_USAGE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({query,variables:{accountId:env.TURN_ACCOUNT_ID,from:p.start,to}}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)fail(UNAVAILABLE);
 const data=await r.json(),accounts=data?.data?.viewer?.accounts;
 if((data.errors!=null&&(!Array.isArray(data.errors)||data.errors.length))||!Array.isArray(accounts)||accounts.length!==1)fail(UNAVAILABLE);
 const groups=accounts[0].callsTurnUsageAdaptiveGroups;
 if(!Array.isArray(groups)||groups.length>1)fail(UNAVAILABLE);
 const bytes=groups.length?groups[0]?.sum?.egressBytes:0;
 if(!Number.isSafeInteger(bytes)||bytes<0)fail(UNAVAILABLE);
 return bytes;
}
export async function checkRelayBudget(env){
 if(env.TURN_RELAY_ENABLED!=='true'){await revokeIssued(env);fail('Online play paused by the operator.');}
 let p;try{p=policy(env);}catch(error){await revokeIssued(env);throw error;}
 await q(env.DB,'INSERT INTO turn_budget_windows(period_start,period_end) VALUES(?,?) ON CONFLICT(period_start) DO NOTHING',p.start,p.end).run();
 const row=await q(env.DB,'SELECT * FROM turn_budget_windows WHERE period_start=?',p.start).first();
 if(row.period_end!==p.end||row.stopped||row.issued>=p.issues){await block(env,p,true);fail(PAUSED);}
 let bytes;
 try{bytes=await reportedBytes(env,p);}catch{await block(env,p);fail(UNAVAILABLE);}
 await q(env.DB,'UPDATE turn_budget_windows SET reported_bytes=max(reported_bytes,?),checked=? WHERE period_start=?',bytes,now(),p.start).run();
 const current=await q(env.DB,'SELECT reported_bytes,stopped FROM turn_budget_windows WHERE period_start=?',p.start).first();
 if(current.stopped||current.reported_bytes>=p.cap){await block(env,p,true);fail(PAUSED);}
 await q(env.DB,'UPDATE turn_budget_windows SET blocked=0 WHERE period_start=? AND stopped=0',p.start).run();
 return p;
}
export async function budgetedRelayConfig(env){
 const p=await checkRelayBudget(env);
 // Conditional update reserves capacity across concurrent Worker instances; failed mints consume a slot.
 const reserved=await q(env.DB,'UPDATE turn_budget_windows SET issued=issued+1 WHERE period_start=? AND stopped=0 AND blocked=0 AND issued<?',p.start,p.issues).run();
 if(reserved.meta.changes!==1)fail(PAUSED);
 let result;
 try{result=await relayConfig(env);}catch{await block(env,p);fail(UNAVAILABLE);}
 try{
  for(const server of result.iceServers)await q(env.DB,'INSERT INTO turn_credentials(username,key_id,expires) VALUES(?,?,?) ON CONFLICT(username) DO NOTHING',server.username,env.TURN_KEY_ID,now()+RELAY_TTL_SECONDS).run();
  const row=await q(env.DB,'SELECT blocked,stopped FROM turn_budget_windows WHERE period_start=?',p.start).first();
  if(!row||row.blocked||row.stopped){await revokeIssued(env);fail(PAUSED);}
 }catch(error){
  // Even a persistence failure must not leak an untracked credential to the client.
  for(const server of result.iceServers)try{await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/'+encodeURIComponent(env.TURN_KEY_ID)+'/credentials/'+encodeURIComponent(server.username)+'/revoke',{method:'POST',headers:{Authorization:'Bearer '+env.TURN_API_TOKEN},signal:AbortSignal.timeout(10000)});}catch{}
  if(error instanceof QueueError)throw error;fail(UNAVAILABLE);
 }
 return result;
}
export async function monitorRelayBudget(env){
 try{await checkRelayBudget(env);}catch(error){if(!(error instanceof QueueError))throw error;}
 await q(env.DB,'DELETE FROM turn_credentials WHERE expires<?',now()-86400).run();
}
