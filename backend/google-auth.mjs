// Google Identity Services: verified ID tokens, server nonce, and one-use PKCE app grants.
import {QueueError} from './matchmaking.mjs';
const q=(db,sql,...args)=>db.prepare(sql).bind(...args),now=()=>Math.floor(Date.now()/1000);
const need=(v,status,message='Google sign-in could not be verified')=>{if(!v)throw new QueueError(status,message);};
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const bytes=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const random=()=>b64(crypto.getRandomValues(new Uint8Array(32))),hash=async s=>b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
const clean=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>keys.includes(k));
export const googleReady=env=>/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID||'');
export async function googleMethods(db,user,env){return{googleEnabled:googleReady(env),googleLinked:!!await q(db,'SELECT 1 FROM google_identities WHERE user_id=?',user.id).first()};}
export async function startGoogleAuth(db,user,data,env){
 need(googleReady(env),503,'Google sign-in setup is not finished yet');need(clean(data,['challenge','platform','action'])&&/^[A-Za-z0-9_-]{43}$/.test(data.challenge)&&['android','web'].includes(data.platform)&&['signin','link'].includes(data.action),400);
 if(data.action==='link')need(user.registered&&user.auth_at>now()-600,403,'Confirm your existing sign-in before connecting Google');
 await q(db,'DELETE FROM google_handoffs WHERE creator_session=?',user.sessionHash).run();
 const handoff=random();await q(db,'INSERT INTO google_handoffs(hash,creator,creator_session,challenge,nonce,platform,action,expires) VALUES(?,?,?,?,?,?,?,?)',await hash(handoff),user.id,user.sessionHash,data.challenge,random(),data.platform,data.action,now()+300).run();return{handoff};
}
export async function verifyGoogleToken(raw,clientId,nonce){
 need(typeof raw==='string'&&raw.length<16000,400);const parts=raw.split('.');need(parts.length===3&&parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)),401);
 let header,claims;try{header=JSON.parse(new TextDecoder().decode(bytes(parts[0])));claims=JSON.parse(new TextDecoder().decode(bytes(parts[1])));}catch{throw new QueueError(401,'Invalid Google credential');}
 need(header.alg==='RS256'&&typeof header.kid==='string'&&header.kid.length<=256,401);
 need(['accounts.google.com','https://accounts.google.com'].includes(claims.iss)&&claims.aud===clientId&&claims.nonce===nonce&&Number.isInteger(claims.exp)&&claims.exp>now()&&Number.isInteger(claims.iat)&&claims.iat<=now()+60&&claims.iat>=now()-600&&typeof claims.sub==='string'&&/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub),401);
 const response=await fetch('https://www.googleapis.com/oauth2/v3/certs',{redirect:'error',signal:AbortSignal.timeout(10000),cf:{cacheTtl:600,cacheEverything:true}});need(response.ok,503,'Google verification is temporarily unavailable');const keys=await response.json();need(Array.isArray(keys.keys)&&keys.keys.length<=10,503,'Google verification is temporarily unavailable');const jwk=keys.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');need(jwk,401);
 let valid=false;try{const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));}catch{}
 need(valid,401);return claims.sub;
}
export async function googleAuthRoute(path,db,data,env,issue){
 if(path==='/auth/google/exchange'){
  need(clean(data,['handoff','code','verifier'])&&/^[A-Za-z0-9_-]{43}$/.test(data.handoff)&&/^[A-Za-z0-9_-]{43}$/.test(data.code)&&/^[A-Za-z0-9_-]{43,128}$/.test(data.verifier),400);
  const h=await q(db,'DELETE FROM google_handoffs WHERE hash=? AND grant_hash=? AND challenge=? AND expires>? AND subject IS NOT NULL RETURNING *',await hash(data.handoff),await hash(data.code),await hash(data.verifier),now()).first();need(h,401,'Google sign-in expired; try again');
  const creator=await q(db,'SELECT users.*,sessions.auth_at FROM users JOIN sessions ON sessions.user_id=users.id WHERE users.id=? AND sessions.hash=? AND sessions.expires>?',h.creator,h.creator_session,now()).first();need(creator,401,'Sign-in was cancelled or expired');
  let identity=await q(db,'SELECT user_id FROM google_identities WHERE subject=?',h.subject).first();
  if(h.action==='link'){
   need(creator.registered&&creator.auth_at>now()-600,403,'Confirm your existing sign-in before connecting Google');need(!identity||identity.user_id===creator.id,409,'That Google account already belongs to another profile');
   const own=await q(db,'SELECT subject FROM google_identities WHERE user_id=?',creator.id).first();need(!own||own.subject===h.subject,409,'This profile already has a Google account');
   await q(db,'INSERT OR IGNORE INTO google_identities(subject,user_id) VALUES(?,?)',h.subject,creator.id).run();identity={user_id:creator.id};
  }else if(!identity){
   need(!creator.registered,409,'Profile changed; start sign-in again');
   await db.batch([q(db,'INSERT OR IGNORE INTO google_identities(subject,user_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND registered=0)',h.subject,creator.id,creator.id),q(db,'UPDATE users SET registered=1 WHERE id=? AND EXISTS(SELECT 1 FROM google_identities WHERE subject=? AND user_id=?)',creator.id,h.subject,creator.id),q(db,'DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM google_identities WHERE subject=? AND user_id=?)',creator.id,h.subject,creator.id)]);
   identity=await q(db,'SELECT user_id FROM google_identities WHERE subject=?',h.subject).first();
  }
  need(identity,409,'Profile changed; try sign-in again');
  const user=await q(db,'SELECT * FROM users WHERE id=? AND registered=1',identity.user_id).first();need(user,401);
  // Retain a separate guest device profile when signing into an already-existing account.
  if(creator.registered||user.id===creator.id)await q(db,'DELETE FROM sessions WHERE hash=?',h.creator_session).run();
  return issue(db,{...user,google:true},true);
 }
 need(clean(data,path==='/auth/google/options'?['handoff']:['handoff','credential'])&&/^[A-Za-z0-9_-]{43}$/.test(data.handoff),400);
 const h=await q(db,'SELECT * FROM google_handoffs WHERE hash=? AND expires>? AND grant_hash IS NULL',await hash(data.handoff),now()).first();need(h,401,'Google sign-in expired; start again');
 need(googleReady(env),503,'Google sign-in setup is not finished yet');
 if(path==='/auth/google/options')return{clientId:env.GOOGLE_CLIENT_ID,nonce:h.nonce,platform:h.platform,appOrigin:env.APP_ORIGIN};
 need(path==='/auth/google/verify',404);const subject=await verifyGoogleToken(data.credential,env.GOOGLE_CLIENT_ID,h.nonce),code=random();
 need((await q(db,'UPDATE google_handoffs SET subject=?,grant_hash=?,expires=? WHERE hash=? AND grant_hash IS NULL',subject,await hash(code),now()+60,h.hash).run()).meta.changes===1,409,'Sign-in already completed');return{handoff:data.handoff,code};
}
export const GOOGLE_PAGE=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Finger Fight · Sign in</title><style>body{margin:0;background:#0b1020;color:#f8fafc;font:18px system-ui;min-height:100dvh;display:grid;place-items:center}main{text-align:center;padding:24px;max-width:380px}h1{color:#fbbf24}#googleButton{display:flex;justify-content:center;margin:24px 0}a{display:block;padding:14px;background:#fbbf24;color:#111;border-radius:12px;font-weight:bold;text-decoration:none}[hidden]{display:none!important}p{line-height:1.5}</style><script src="https://accounts.google.com/gsi/client" defer></script><script src="/auth/google.js" defer></script></head><body><main><h1>FINGER FIGHT</h1><p id="info">Sign in with Google to keep your friends across devices.</p><div id="googleButton"></div><a id="return" hidden>Return to Finger Fight</a><p id="status" role="status"></p></main></body></html>`;
export const GOOGLE_SCRIPT=`(()=>{const handoff=new URLSearchParams(location.hash.slice(1)).get('handoff'),status=document.getElementById('status'),back=document.getElementById('return');history.replaceState(null,'',location.pathname);let busy=false;async function call(path,data){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)}),body=await r.json();if(!r.ok)throw new Error(body.error||'Sign-in failed');return body;}async function begin(){try{if(window.top!==window.self||!/^[A-Za-z0-9_-]{43}$/.test(handoff||''))throw new Error('Open sign-in from Finger Fight.');const options=await call('/auth/google/options',{handoff});if(!globalThis.google?.accounts?.id)throw new Error('Google sign-in could not load. Close this page and try again.');google.accounts.id.initialize({client_id:options.clientId,nonce:options.nonce,auto_select:false,callback:async response=>{if(busy)return;busy=true;try{status.textContent='Signing in…';const grant=await call('/auth/google/verify',{handoff,credential:response.credential}),url='fingerfight://account?handoff='+encodeURIComponent(grant.handoff)+'&code='+encodeURIComponent(grant.code);if(options.platform==='web'&&window.opener){window.opener.postMessage({type:'fingerfight-auth',url},options.appOrigin);window.close();status.textContent='Signed in. Return to the game.';}else{back.href=url;back.hidden=false;document.getElementById('googleButton').hidden=true;status.textContent='Signed in. Return to Finger Fight.';location.href=url;}}catch(e){busy=false;status.textContent=e.message||'Sign-in failed';}}});google.accounts.id.renderButton(document.getElementById('googleButton'),{type:'standard',theme:'filled_blue',size:'large',text:'continue_with',shape:'pill'});}catch(e){status.textContent=e.message||'Sign-in failed';}}void begin();})();`;
