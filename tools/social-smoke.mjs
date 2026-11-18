// Real deployed account/friend/score flows with ephemeral software passkeys. No real recipient pushes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {authenticator} from '../backend/test/authenticator.mjs';
import {normalizeSettings} from '../js/logic.js';
import {cfRequest} from './cf-api.mjs';
const target=JSON.parse(await readFile('backend/deploy-target.json')),checks={},created=[];
const call=async(path,data,token,method='POST',origin='https://p-patsis.github.io')=>{const r=await fetch(target.public_url+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method!=='GET'?{body:JSON.stringify(data||{})}:{}),signal:AbortSignal.timeout(20000)});return{status:r.status,body:await r.json()};};
try{
 const a=await authenticator(),b=await authenticator();
 const ga=await call('/players/session',{name:'Account smoke A'});assert.equal(ga.status,201);created.push(ga.body.user.id);
 const oa=await call('/auth/register/options',{},ga.body.token),ra=await call('/auth/register/verify',{id:oa.body.id,response:await a.register(oa.body.options.challenge)},ga.body.token);assert.equal(ra.status,200);checks.webPasskeyRegistration=true;let A=ra.body;
 assert.equal((await call('/me',undefined,ga.body.token,'GET')).status,401);checks.guestSessionRotated=true;
 const gb=await call('/players/session',{name:'Account smoke B'},null,'POST','https://localhost');assert.equal(gb.status,201);created.push(gb.body.user.id);
 const verifier=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');
 const hb=await call('/auth/native/start',{action:'register',challenge},gb.body.token,'POST','https://localhost');assert.equal(hb.status,200);
 const ob=await call('/auth/native/options',{handoff:hb.body.handoff}),vb=await call('/auth/native/verify',{handoff:hb.body.handoff,id:ob.body.id,response:await b.register(ob.body.options.challenge)});assert.equal(vb.status,200);assert.ok(!vb.body.token);
 assert.equal((await call('/auth/native/exchange',{handoff:hb.body.handoff,code:vb.body.code,verifier:'X'.repeat(43)})).status,401);
 const rb=await call('/auth/native/exchange',{handoff:hb.body.handoff,code:vb.body.code,verifier},null,'POST','https://localhost');assert.equal(rb.status,200);const B=rb.body;checks.nativeBrowserHandoffAndPKCE=true;
 assert.equal((await call('/auth/native/exchange',{handoff:hb.body.handoff,code:vb.body.code,verifier},null,'POST','https://localhost')).status,401);checks.nativeGrantOneUse=true;
 const config=await call('/notifications/config',undefined,A.token,'GET');assert.equal(config.status,200);assert.equal(config.body.webPush,true);checks.webPushConfigured=true;checks.androidPushConfigured=config.body.androidPush;
 if(config.body.androidPush){const device=crypto.randomUUID();assert.equal((await call('/notifications/subscribe',{id:device,platform:'android',token:'setup-validation-only-'+crypto.randomUUID(),launcherSafe:true},A.token)).status,200);assert.equal((await call('/notifications/unsubscribe',{id:device},A.token)).status,200);checks.launcherSafeNativeSubscription=true;}

 const friend=await call('/friends',{code:B.user.code},A.token);assert.equal(friend.status,201);assert.equal((await call('/friends/'+friend.body.id,{accept:true},B.token,'PATCH')).status,200);checks.friendAcceptance=true;
 const settings=normalizeSettings({hits:1}),match=await call('/matches',{opponent:B.user.id,settings},A.token);assert.equal(match.status,201);
 const invitation=await call('/invites',{target:B.user.id,code:'ABCDEFGHJKLMNPQR',match:match.body.id},A.token);assert.equal(invitation.status,201);const accepted=await call('/invites/'+invitation.body.id,{accept:true},B.token,'PATCH');assert.equal(accepted.status,200);assert.equal(accepted.body.match,match.body.id);checks.linkedInviteAccepted=true;
 const data={settings,rounds:[[2,2]]},first=await call('/matches/'+match.body.id+'/result',data,A.token);assert.equal(first.body.confirmed,false);const second=await call('/matches/'+match.body.id+'/result',data,B.token);assert.equal(second.body.confirmed,true);assert.equal(second.body.winner,B.user.id);checks.bothPlayersConfirmScore=true;
 const board=await call('/leaderboard',undefined,A.token,'GET');assert.equal(board.status,200);assert.equal(board.body.leaderboard.find(p=>p.id===B.user.id).wins,1);checks.friendLeaderboard=true;
 assert.equal((await call('/auth/logout',{},A.token)).status,200);assert.equal((await call('/friends',undefined,A.token,'GET')).status,401);
 const login=await call('/auth/login/options'),logged=await call('/auth/login/verify',{id:login.body.id,response:await a.login(login.body.options.challenge)});assert.equal(logged.status,200);A=logged.body;checks.passkeyLoginAndLogout=true;
 assert.equal((await call('/blocks',{target:A.user.id},B.token)).status,200);checks.blocking=true;
 assert.equal((await call('/me',{confirm:true},A.token,'DELETE')).status,200);assert.equal((await call('/me',{confirm:true},B.token,'DELETE')).status,200);checks.accountDeletion=true;
}finally{
 if(created.length){const r=await cfRequest(`/accounts/${target.account_id}/d1/database/${target.database_id}/query`,{method:'POST',body:{sql:`DELETE FROM users WHERE id IN (${created.map(()=>'?').join(',')})`,params:created}});assert.ok(r.result.every(x=>x.success));checks.syntheticAccountsRemoved=true;}
 await writeFile('.git/social-live-smoke.json',JSON.stringify({at:new Date().toISOString(),checks},null,2));
}
console.log(JSON.stringify({checks},null,2));
