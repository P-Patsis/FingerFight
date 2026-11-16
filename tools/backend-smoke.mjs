// Live checks against this project's deployed API. Temporary users are removed through D1.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {cfRequest} from './cf-api.mjs';
import {spawnSync} from 'node:child_process';
const enabled=process.argv.includes('--relay-enabled');
const target=JSON.parse(await readFile(new URL('../backend/deploy-target.json',import.meta.url),'utf8'));
const base=target.public_url;if(!base?.startsWith('https://fingerfight-api.'))throw new Error('Unexpected smoke-test target');
const ids=[],checks={},users=[];
const call=async(path,{token,body={},origin='https://localhost',method='POST'}={})=>{
 const r=await fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method!=='GET'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 return{status:r.status,body:await r.json(),origin:r.headers.get('access-control-allow-origin')};
};
try{
 const health=await call('/health',{method:'GET',origin:'https://p-patsis.github.io'});assert.equal(health.status,200);assert.equal(health.origin,'https://p-patsis.github.io');checks.healthAndWebCors=true;
 assert.equal((await call('/players/session',{origin:'https://untrusted.example',body:{name:'Denied'}})).status,403);checks.badOriginDenied=true;
 assert.equal((await call('/rtc/config')).status,401);checks.unauthenticatedRelayDenied=true;
 for(const name of ['Deploy smoke A','Deploy smoke B']){const r=await call('/players/session',{body:{name}});assert.equal(r.status,201);ids.push(r.body.user.id);users.push({...r.body,client:crypto.randomUUID()});}
 for(const [i,u] of users.entries()){
  const r=await call('/rtc/config',{token:u.token});
  if(enabled){assert.equal(r.status,200);assert.ok(r.body.managed&&r.body.iceServers?.length);assert.ok(r.body.expires>Math.floor(Date.now()/1000)+400);
   if(i===0){const probe=spawnSync('python3',['tools/turn-probe.py'],{input:JSON.stringify(r.body.iceServers[0]),encoding:'utf8',timeout:60000});checks.relayProtocol=JSON.parse(probe.stdout||'[]');assert.equal(probe.status,0);}
  }else{assert.equal(r.status,503);assert.match(r.body.error,/paused/);}
 }checks[enabled?'managedRelayEnabled':'relayDisabled']=true;
 const queue=(path,u,extra={})=>call('/queue/'+path,{token:u.token,body:{client:u.client,...extra}});
 for(const u of users)assert.equal((await queue('join',u)).status,200);
 assert.equal((await queue('ready',users[0])).body.state,'waiting');
 const pair=(await queue('ready',users[1])).body.pair;assert.ok(pair?.id);checks.atomicPairing=true;
 assert.equal((await queue('ack',users[0],{pair:pair.id})).body.pair.acknowledged,false);
 assert.equal((await queue('ack',users[1],{pair:pair.id})).body.pair.acknowledged,true);checks.twoPlayerAcknowledgement=true;
 assert.equal((await queue('cancel',users[0])).status,200);assert.equal((await queue('poll',users[1])).status,409);checks.cancellation=true;
}finally{
 if(ids.length){await cfRequest(`/accounts/${target.account_id}/d1/database/${target.database_id}/query`,{method:'POST',body:{sql:`DELETE FROM users WHERE id IN (${ids.map(()=>'?').join(',')})`,params:ids}});checks.smokeUsersRemoved=true;}
 await writeFile(new URL('../.git/cf-live-smoke.json',import.meta.url),JSON.stringify({at:new Date().toISOString(),base,checks},null,2));
}
console.log(JSON.stringify({base,checks},null,2));
