// Bounded pre-rollout expiry experiment. Credentials stay in memory/stdin only.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {cfRequest,uploadWorker} from './cf-api.mjs';
const t=JSON.parse(await readFile(new URL('../backend/deploy-target.json',import.meta.url)));
const sql=async(query,params=[])=>{const r=await cfRequest(`/accounts/${t.account_id}/d1/database/${t.database_id}/query`,{method:'POST',body:{sql:query,params}});assert.ok(r.result.every(x=>x.success));return r.result.flatMap(x=>x.results||[]);};
const call=async(path,body,token)=>{const r=await fetch(t.public_url+path,{method:'POST',headers:{Origin:'https://localhost','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return{status:r.status,body:await r.json()};};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const start=new Date(Date.now()-86400000).toISOString().slice(0,10),end=new Date(Date.now()+86400000).toISOString().slice(0,10);
const report={at:new Date().toISOString(),checks:{},testWindow:{start,end}},save=()=>writeFile('.git/cf-expiry-smoke.json',JSON.stringify(report,null,2));
const settings=await cfRequest(`/accounts/${t.account_id}/workers/scripts/${t.worker_name}/settings`);
assert.equal(settings.result.bindings.find(b=>b.name==='TURN_RELAY_ENABLED')?.text,'false');
assert.equal((await sql('SELECT period_start FROM turn_budget_windows WHERE period_start=?',[start])).length,0,'Refuse to overwrite any existing period');
let user,active=false;
try{
 const created=await call('/players/session',{name:'Expiry deployment check'});assert.equal(created.status,201);user=created.body;
 active=true;await uploadWorker({overrides:{TURN_RELAY_ENABLED:'true',TURN_BUDGET_START:start,TURN_BUDGET_END:end,TURN_BUDGET_BYTES:'1000000',TURN_MAX_CREDENTIALS:'4'}});await pause(5000);
 const mintedAt=Date.now(),mint=await call('/rtc/config',{},user.token);assert.equal(mint.status,200);const credential=mint.body.iceServers[0];
 report.checks.runtimeMint=true;report.mintedAt=new Date(mintedAt).toISOString();report.expectedExpiryAt=new Date(mintedAt+600000).toISOString();await save();
 const invalid=spawnSync('python3',['tools/turn-probe.py','--expect-rejected'],{input:JSON.stringify({...credential,credential:'deliberately-invalid-test-password'}),encoding:'utf8',timeout:20000});
 report.negativeControl=JSON.parse(invalid.stdout||'{}');assert.equal(invalid.status,0,'Probe must reject wrong passwords');report.checks.rejectsWrongPassword=true;await save();
 const child=spawn('python3',['tools/turn-probe.py','--lifetime','620'],{stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.resume();child.stdin.end(JSON.stringify(credential));
 console.log('Temporary credential minted; wrong-password negative control passed. Measuring actual ten-minute allocation lifetime.');
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Lifetime probe timed out'));},650000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Lifetime probe failed'));});});
 report.allocationLifetime=JSON.parse(output);await save();
 const remaining=mintedAt+620000-Date.now();if(remaining>0)await pause(remaining);
 const expired=spawnSync('python3',['tools/turn-probe.py','--expect-rejected'],{input:JSON.stringify(credential),encoding:'utf8',timeout:20000});report.expiryProbe=JSON.parse(expired.stdout||'{}');report.checks.expiredCredentialRejected=expired.status===0;await save();
 assert.equal(expired.status,0,'Expired credential must be rejected by a fresh allocation');
}finally{
 if(active){await uploadWorker();await pause(5000);report.checks.restoredRelayOff=true;}
 if(user){assert.equal((await call('/rtc/config',{},user.token)).status,503);await sql('DELETE FROM users WHERE id=?',[user.user.id]);report.checks.guestRemoved=true;}
 if(active)await sql('DELETE FROM turn_budget_windows WHERE period_start=?',[start]);
 await save();
}
console.log(JSON.stringify(report,null,2));
