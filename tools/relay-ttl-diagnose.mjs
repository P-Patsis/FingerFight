// Isolated 60-second diagnostic: distinguish cached credentials from never-used ones.
// Temporary bundle only; restores the normal ten-minute production bundle in finally.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {cfRequest,uploadWorker} from './cf-api.mjs';
const t=JSON.parse(await readFile(new URL('../backend/deploy-target.json',import.meta.url)));
const sql=async(query,params=[])=>{const r=await cfRequest(`/accounts/${t.account_id}/d1/database/${t.database_id}/query`,{method:'POST',body:{sql:query,params}});assert.ok(r.result.every(x=>x.success));return r.result.flatMap(x=>x.results||[]);};
const call=async(path,body,token)=>{const r=await fetch(t.public_url+path,{method:'POST',headers:{Origin:'https://localhost','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return{status:r.status,body:await r.json()};};
const pause=ms=>new Promise(r=>setTimeout(r,ms)),start=new Date(Date.now()-3*86400000).toISOString().slice(0,10),end=new Date(Date.now()+86400000).toISOString().slice(0,10);
const report={at:new Date().toISOString(),requestedTTL:60,checks:{}},save=()=>writeFile('.git/cf-ttl-diagnosis.json',JSON.stringify(report,null,2));
const settings=await cfRequest(`/accounts/${t.account_id}/workers/scripts/${t.worker_name}/settings`);assert.equal(settings.result.bindings.find(b=>b.name==='TURN_RELAY_ENABLED')?.text,'false');
assert.equal((await sql('SELECT period_start FROM turn_budget_windows WHERE period_start=?',[start])).length,0);
const original=await readFile('backend/dist/worker.mjs','utf8'),name=original.match(/ttl:([A-Za-z_$][\w$]*)/)?.[1];assert.ok(name);const definition=name+'=600,';assert.equal(original.split(definition).length,2);await writeFile('.git/turn-ttl-probe-worker.mjs',original.replace(definition,name+'=60,'));
let user,active=false;
try{
 const created=await call('/players/session',{name:'TTL cache diagnosis'});assert.equal(created.status,201);user=created.body;
 active=true;await uploadWorker({testBundle:true,overrides:{TURN_RELAY_ENABLED:'true',TURN_BUDGET_START:start,TURN_BUDGET_END:end,TURN_BUDGET_BYTES:'1000000',TURN_MAX_CREDENTIALS:'4'}});await pause(5000);
 const mintedAt=Date.now(),a=await call('/rtc/config',{},user.token),b=await call('/rtc/config',{},user.token);assert.equal(a.status,200);assert.equal(b.status,200);
 const activeCredential=a.body.iceServers[0],virgin=b.body.iceServers[0];assert.notEqual(activeCredential.username,virgin.username);report.checks.shortTTLBundle=a.body.expires*1000<Date.now()+10000;
 const initial=spawnSync('python3',['tools/turn-probe.py'],{input:JSON.stringify(activeCredential),encoding:'utf8',timeout:60000});assert.equal(initial.status,0);report.initialProtocol=JSON.parse(initial.stdout);await save();
 console.log('60-second cache/virgin diagnostic: baseline passed; waiting to test expiry.');await pause(Math.max(0,mintedAt+90000-Date.now()));
 for(const [name,credential]of [['used',activeCredential],['neverUsed',virgin]]){const r=spawnSync('python3',['tools/turn-probe.py','--expect-rejected'],{input:JSON.stringify(credential),encoding:'utf8',timeout:20000});report[name]=JSON.parse(r.stdout||'{}');report[name].elapsedSeconds=Math.round((Date.now()-mintedAt)/1000);}
}finally{
 if(active){await uploadWorker();await pause(5000);report.checks.restoredRelayOff=true;}
 if(user){assert.equal((await call('/rtc/config',{},user.token)).status,503);await sql('DELETE FROM users WHERE id=?',[user.user.id]);report.checks.guestRemoved=true;}
 if(active)await sql('DELETE FROM turn_budget_windows WHERE period_start=?',[start]);await save();
}
console.log(JSON.stringify(report,null,2));
