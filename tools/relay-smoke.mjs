// Controlled live verification before client migration. Never prints credentials.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {cfRequest,uploadWorker} from './cf-api.mjs';
const target=JSON.parse(await readFile(new URL('../backend/deploy-target.json',import.meta.url),'utf8'));
const base=target.public_url,dbPath=`/accounts/${target.account_id}/d1/database/${target.database_id}/query`;
const sql=async(query,params=[])=>{const r=await cfRequest(dbPath,{method:'POST',body:{sql:query,params}});assert.ok(r.result.every(p=>p.success));return r.result.flatMap(p=>p.results||[]);};
const call=async(path,body,token)=>{const r=await fetch(base+path,{method:'POST',headers:{Origin:'https://localhost','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return{status:r.status,body:await r.json()};};
const start=new Date().toISOString().slice(0,10),end=new Date(Date.now()+86400000).toISOString().slice(0,10);
const checks={},report={at:new Date().toISOString(),base,testWindow:{start,end,cutoffBytes:1000000},checks};let user=null,username=null,active=false;
const settings=await cfRequest(`/accounts/${target.account_id}/workers/scripts/${target.worker_name}/settings`);
assert.equal(settings.result.bindings.find(b=>b.name==='TURN_RELAY_ENABLED')?.text,'false','Run only with relay disabled and clients not migrated');
assert.equal((await sql('SELECT period_start FROM turn_budget_windows WHERE period_start=?',[start])).length,0,'Refuse to overwrite an existing budget window');
try{
 const created=await call('/players/session',{name:'Relay deployment check'});assert.equal(created.status,201);user=created.body;
 active=true;await uploadWorker({overrides:{TURN_RELAY_ENABLED:'true',TURN_BUDGET_START:start,TURN_BUDGET_END:end,TURN_BUDGET_BYTES:'1000000',TURN_MAX_CREDENTIALS:'4'}});
 const deployed=await cfRequest(`/accounts/${target.account_id}/workers/scripts/${target.worker_name}/settings`);report.testBindings=deployed.result.bindings.filter(b=>['TURN_RELAY_ENABLED','TURN_BUDGET_START','TURN_BUDGET_END','TURN_BUDGET_BYTES'].includes(b.name)).map(b=>({name:b.name,text:b.text}));
 assert.equal(deployed.result.bindings.find(b=>b.name==='TURN_RELAY_ENABLED')?.text,'true','Test override did not attach');
 await new Promise(r=>setTimeout(r,5000));
 const minted=await call('/rtc/config',{},user.token);
 if(minted.status!==200){const rows=await sql('SELECT reported_bytes,checked,issued,blocked,stopped FROM turn_budget_windows WHERE period_start=?',[start]);report.failureStage=rows;throw new Error(`Relay check returned HTTP ${minted.status}: ${minted.body.error}`);}
 checks.runtimeAnalyticsAndMint=true;checks.temporaryExpiry=minted.body.expires>Math.floor(Date.now()/1000)+500;
 const credential=minted.body.iceServers[0];username=credential.username;
 const probe=spawnSync('python3',['tools/turn-probe.py'],{input:JSON.stringify(credential),encoding:'utf8',timeout:60000});
 report.protocol=JSON.parse(probe.stdout||'[]');assert.equal(probe.status,0,'TURN UDP/TLS protocol checks failed; inspect the safe protocol summary');checks.bidirectionalRelay=true;
 const before=(await sql('SELECT issued FROM turn_budget_windows WHERE period_start=?',[start]))[0];assert.equal(before.issued,1,'Unexpected other credential issuances during isolated setup test');
 // Synthetic high-water mark exercises the deployed cutoff without sending a megabyte of traffic.
 await sql('UPDATE turn_budget_windows SET reported_bytes=1000000 WHERE period_start=?',[start]);
 const denied=await call('/rtc/config',{},user.token);assert.equal(denied.status,503);assert.match(denied.body.error,/allowance reached/);checks.storedUsageCutoff=true;
 const state=(await sql('SELECT issued,stopped FROM turn_budget_windows WHERE period_start=?',[start]))[0];assert.equal(state.issued,1);assert.equal(state.stopped,1);checks.stickyNoFurtherMint=true;
 const row=(await sql('SELECT revoked FROM turn_credentials WHERE username=?',[username]))[0];assert.equal(row.revoked,1);checks.providerRevocationAcknowledged=true;
 await new Promise(r=>setTimeout(r,30000));
 const rejected=spawnSync('python3',['tools/turn-probe.py','--expect-revoked'],{input:JSON.stringify(credential),encoding:'utf8',timeout:20000});report.revokedProbe=JSON.parse(rejected.stdout||'{}');assert.equal(rejected.status,0,'Revoked credential must be rejected by the relay');checks.revokedCredentialRejected=true;
}finally{
 if(active){await uploadWorker();await new Promise(r=>setTimeout(r,5000));}
 if(user){const off=await call('/rtc/config',{},user.token);assert.equal(off.status,503,'Relay must be disabled again');checks.restoredRelayOff=true;await sql('DELETE FROM users WHERE id=?',[user.user.id]);checks.smokeUserRemoved=true;}
 // Remove only the isolated test window after restoration. Keep revocation records for scheduled retry/audit.
 const pending=await sql('SELECT count(*) n FROM turn_credentials WHERE revoked=0 AND expires>?',[Math.floor(Date.now()/1000)]);checks.noPendingRevocation=pending[0].n===0;
 if(checks.noPendingRevocation)await sql('DELETE FROM turn_budget_windows WHERE period_start=?',[start]);
 await writeFile(new URL('../.git/cf-relay-smoke.json',import.meta.url),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
