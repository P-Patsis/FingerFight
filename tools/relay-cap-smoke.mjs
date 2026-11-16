// Pre-rollout live D1 burst-limit check. Never prints temporary relay credentials.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {cfRequest,uploadWorker} from './cf-api.mjs';
const t=JSON.parse(await readFile(new URL('../backend/deploy-target.json',import.meta.url)));
const sql=async(query,params=[])=>{const r=await cfRequest(`/accounts/${t.account_id}/d1/database/${t.database_id}/query`,{method:'POST',body:{sql:query,params}});assert.ok(r.result.every(x=>x.success));return r.result.flatMap(x=>x.results||[]);};
const call=async(path,body,token)=>{const r=await fetch(t.public_url+path,{method:'POST',headers:{Origin:'https://localhost','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return{status:r.status,body:await r.json()};};
const pause=ms=>new Promise(r=>setTimeout(r,ms)),start=new Date(Date.now()-2*86400000).toISOString().slice(0,10),end=new Date(Date.now()+86400000).toISOString().slice(0,10);
const report={at:new Date().toISOString(),checks:{}},save=()=>writeFile('.git/cf-cap-smoke.json',JSON.stringify(report,null,2));
const settings=await cfRequest(`/accounts/${t.account_id}/workers/scripts/${t.worker_name}/settings`);assert.equal(settings.result.bindings.find(b=>b.name==='TURN_RELAY_ENABLED')?.text,'false');
assert.equal((await sql('SELECT period_start FROM turn_budget_windows WHERE period_start=?',[start])).length,0);
const existing=process.argv.includes('--existing-slots')?2:0;
assert.equal((await sql('SELECT count(*) n FROM turn_credential_slots WHERE expires>unixepoch()'))[0].n,existing);
let user,active=false;
try{
 const created=await call('/players/session',{name:'Capacity deployment check'});assert.equal(created.status,201);user=created.body;
 active=true;await uploadWorker({overrides:{TURN_RELAY_ENABLED:'true',TURN_BUDGET_START:start,TURN_BUDGET_END:end,TURN_BUDGET_BYTES:'1000000',TURN_MAX_CREDENTIALS:'4',TURN_MAX_ACTIVE_CREDENTIALS:'2'}});await pause(15000);
 const results=await Promise.all(Array.from({length:existing?1:3},()=>call('/rtc/config',{},user.token)));
 report.statuses=results.map(r=>r.status).sort();assert.deepEqual(report.statuses,existing?[503]:[200,200,503]);assert.match(results.find(r=>r.status===503).body.error,/capacity reached/);
 const row=(await sql('SELECT issued,blocked,stopped FROM turn_budget_windows WHERE period_start=?',[start]))[0];assert.equal(row.issued,existing?0:2);assert.equal(row.blocked,0);assert.equal(row.stopped,0);report.state=row;report.checks.atomicBurstLimit=true;report.checks.capacityDoesNotStopExisting=true;
}finally{
 if(active){await uploadWorker();await pause(5000);report.checks.restoredRelayOff=true;}
 if(user){assert.equal((await call('/rtc/config',{},user.token)).status,503);await sql('DELETE FROM users WHERE id=?',[user.user.id]);report.checks.guestRemoved=true;}
 report.retainedSlots=(await sql('SELECT count(*) n FROM turn_credential_slots WHERE expires>unixepoch()'))[0].n;
 if(active)await sql('DELETE FROM turn_budget_windows WHERE period_start=?',[start]);await save();
}
console.log(JSON.stringify(report,null,2));
