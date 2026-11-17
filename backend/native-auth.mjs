// Browser passkeys for the packaged app; a one-use, PKCE-bound grant returns to Android.
// Permanent bearer tokens never travel in a deep link or through the hosted page.
import {QueueError} from './matchmaking.mjs';
const q=(db,sql,...p)=>db.prepare(sql).bind(...p),now=()=>Math.floor(Date.now()/1000);
const need=(v,status,message='Invalid sign-in request')=>{if(!v)throw new QueueError(status,message);};
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const bytes=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const random=()=>encode(crypto.getRandomValues(new Uint8Array(32))),hash=async s=>encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
const clean=(d,keys)=>d&&typeof d==='object'&&!Array.isArray(d)&&Object.keys(d).every(k=>keys.includes(k));
export async function startNativeAuth(db,user,data){
 need(clean(data,['action','challenge'])&&['register','login'].includes(data.action)&&/^[A-Za-z0-9_-]{43}$/.test(data.challenge),400);
 need(data.action!=='register'||!user.registered,409,'This account already has a passkey');
 await q(db,'DELETE FROM native_handoffs WHERE creator_session=?',user.sessionHash).run();
 const handoff=random();await q(db,'INSERT INTO native_handoffs(id_hash,creator,creator_session,action,challenge,expires) VALUES(?,?,?,?,?,?)',await hash(handoff),user.id,user.sessionHash,data.action,data.challenge,now()+300).run();return{handoff,expires:now()+300};
}
export async function handleNativeAuth(path,db,data,env,webauthn,issue){
 if(path==='/auth/native/exchange'){
  need(clean(data,['handoff','code','verifier'])&&/^[A-Za-z0-9_-]{43}$/.test(data.handoff)&&/^[A-Za-z0-9_-]{43}$/.test(data.code)&&/^[A-Za-z0-9_-]{43,128}$/.test(data.verifier),400);
  const row=await q(db,'DELETE FROM native_handoffs WHERE id_hash=? AND grant_hash=? AND challenge=? AND expires>? AND verified_user IS NOT NULL RETURNING *',await hash(data.handoff),await hash(data.code),await hash(data.verifier),now()).first();need(row,401,'Sign-in expired or could not be verified');
  const user=await q(db,'SELECT * FROM users WHERE id=? AND registered=1',row.verified_user).first();need(user,401,'Account no longer exists');
  await q(db,'DELETE FROM sessions WHERE hash=?',row.creator_session).run();return issue(db,user,true);
 }
 need(clean(data,path.endsWith('/options')?['handoff']:['handoff','id','response'])&&/^[A-Za-z0-9_-]{43}$/.test(data.handoff),400);
 const key=await hash(data.handoff),h=await q(db,'SELECT * FROM native_handoffs WHERE id_hash=? AND expires>? AND grant_hash IS NULL',key,now()).first();need(h,401,'Sign-in request expired');
 const user=await q(db,'SELECT * FROM users WHERE id=?',h.creator).first();need(user,401,'Sign-in request expired');
 if(path==='/auth/native/options'){
  need(h.action!=='register'||!user.registered,409,'Account already registered');
  const options=h.action==='register'?await webauthn.generateRegistrationOptions({rpName:'Finger Fight',rpID:env.RP_ID,userName:user.code,userDisplayName:user.name,userID:new TextEncoder().encode(user.id),attestationType:'none',supportedAlgorithmIDs:[-7],authenticatorSelection:{residentKey:'required',userVerification:'required'}}):await webauthn.generateAuthenticationOptions({rpID:env.RP_ID,userVerification:'required'});
  const cid=crypto.randomUUID();await q(db,'INSERT INTO challenges(id,user_id,kind,value,expires) VALUES(?,?,?,?,?)',cid,user.id,'native-'+h.action,JSON.stringify({challenge:options.challenge,handoff:key}),now()+300).run();return{id:cid,action:h.action,name:user.name,options};
 }
 need(path==='/auth/native/verify'&&typeof data.id==='string'&&data.response&&typeof data.response==='object',400);
 const saved=await q(db,"DELETE FROM challenges WHERE id=? AND user_id=? AND kind=? AND expires>? AND json_extract(value,'$.handoff')=? RETURNING *",data.id,user.id,'native-'+h.action,now(),key).first();need(saved,400,'Passkey request expired');const expectedChallenge=JSON.parse(saved.value).challenge;
 let target=user.id;
 if(h.action==='register'){
  need(!user.registered,409,'Account already registered');let result;
  try{result=await webauthn.verifyRegistrationResponse({response:data.response,expectedChallenge,expectedOrigin:env.APP_ORIGIN,expectedRPID:env.RP_ID,requireUserVerification:true});}catch{throw new QueueError(401,'Passkey verification failed');}need(result.verified,401,'Passkey verification failed');
  const c=result.registrationInfo.credential,change=await db.batch([
   q(db,'INSERT INTO credentials(id,user_id,public_key,counter,transports) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND registered=0)',c.id,user.id,encode(c.publicKey),c.counter,JSON.stringify(c.transports||[]),user.id),
   q(db,'UPDATE users SET registered=1 WHERE id=? AND EXISTS(SELECT 1 FROM credentials WHERE id=? AND user_id=?)',user.id,c.id,user.id),
   q(db,'DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM credentials WHERE id=? AND user_id=?)',user.id,c.id,user.id)
  ]);need(change[0].meta.changes===1,409,'Account already registered');
 }else{
  const c=await q(db,'SELECT * FROM credentials WHERE id=?',data.response.id||'').first();need(c,401,'Passkey not recognised');let result;
  try{result=await webauthn.verifyAuthenticationResponse({response:data.response,expectedChallenge,expectedOrigin:env.APP_ORIGIN,expectedRPID:env.RP_ID,requireUserVerification:true,credential:{id:c.id,publicKey:bytes(c.public_key),counter:c.counter,transports:JSON.parse(c.transports)}});}catch{throw new QueueError(401,'Passkey verification failed');}need(result.verified,401,'Passkey verification failed');
  need((await q(db,'UPDATE credentials SET counter=? WHERE id=? AND counter=?',result.authenticationInfo.newCounter,c.id,c.counter).run()).meta.changes===1,409,'Passkey state changed; sign in again');target=c.user_id;
 }
 const code=random(),changed=await q(db,'UPDATE native_handoffs SET verified_user=?,grant_hash=?,expires=? WHERE id_hash=? AND grant_hash IS NULL',target,await hash(code),now()+60,key).run();need(changed.meta.changes===1,409,'Sign-in already completed');return{code,handoff:data.handoff};
}
