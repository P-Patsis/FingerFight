// Invite-only, per-device opt-in push. Endpoints stay private and are restricted to push vendors.
import {buildPushPayload} from '@block65/webcrypto-web-push';
import {QueueError} from './matchmaking.mjs';
const q=(db,sql,...p)=>db.prepare(sql).bind(...p),now=()=>Math.floor(Date.now()/1000);
const need=(v,status,message)=>{if(!v)throw new QueueError(status,message);};
const clean=(d,keys)=>d&&typeof d==='object'&&!Array.isArray(d)&&Object.keys(d).every(k=>keys.includes(k));
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const digest=async text=>b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export function pushCapabilities(env){return{webPush:/^[A-Za-z0-9_-]{87}$/.test(env.VAPID_PUBLIC_KEY||'')&&/^[A-Za-z0-9_-]{43}$/.test(env.VAPID_PRIVATE_KEY||''),androidPush:!!fcmConfig(env),webPushPublicKey:/^[A-Za-z0-9_-]{87}$/.test(env.VAPID_PUBLIC_KEY||'')?env.VAPID_PUBLIC_KEY:null};}
function fcmConfig(env){try{const c=JSON.parse(env.FCM_SERVICE_ACCOUNT||'null');return c&&/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(c.project_id)&&/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(c.client_email)&&typeof c.private_key==='string'&&c.private_key.includes('BEGIN PRIVATE KEY')?c:null;}catch{return null;}}
export function validSubscription(value){
 if(!clean(value,['endpoint','expirationTime','keys'])||typeof value.endpoint!=='string'||value.endpoint.length>2048||!clean(value.keys,['p256dh','auth']))return false;
 try{const u=new URL(value.endpoint),host=u.hostname;if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443'||u.pathname.length<4||!(['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(host)||host.endsWith('.notify.windows.com')))return false;
 return /^[A-Za-z0-9_-]+$/.test(value.keys.p256dh||'')&&/^[A-Za-z0-9_-]+$/.test(value.keys.auth||'')&&decode(value.keys.p256dh).length===65&&decode(value.keys.p256dh)[0]===4&&decode(value.keys.auth).length===16;
 }catch{return false;}
}
export async function notificationRoute(path,method,data,env,user){
 const db=env.DB;
 if(path==='/notifications/config'&&method==='GET')return pushCapabilities(env);
 if(path==='/notifications/devices'&&method==='GET')return{devices:(await q(db,'SELECT id,platform FROM push_devices WHERE user_id=? AND session_hash=?',user.id,user.sessionHash).all()).results};
 if(path==='/notifications/subscribe'&&method==='POST'){
  need(clean(data,['id','platform','subscription','token'])&&/^[a-f0-9-]{36}$/.test(data.id)&&['web','android'].includes(data.platform),400,'Invalid notification device');
  const ready=pushCapabilities(env);need(data.platform==='web'?ready.webPush:ready.androidPush,503,'Invite notifications are not available on this device yet');
  need(data.platform==='web'?data.token===undefined&&validSubscription(data.subscription):data.subscription===undefined&&typeof data.token==='string'&&/^[A-Za-z0-9_:-]{20,4096}$/.test(data.token),400,'Invalid notification subscription');
  const address=data.platform==='web'?data.subscription.endpoint:data.token,key=b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(address)));
  const existing=(await q(db,'SELECT id,user_id FROM push_devices WHERE address_hash=? OR id=?',key,data.id).all()).results;need(existing.every(d=>d.user_id===user.id),409,'Notification device belongs to another session');
  const id=existing[0]?.id||data.id,revokeKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.VAPID_PRIVATE_KEY||env.FCM_SERVICE_ACCOUNT),{name:'HMAC',hash:'SHA-256'},false,['sign']),revokeToken=b64(await crypto.subtle.sign('HMAC',revokeKey,new TextEncoder().encode('device-revoke:'+id+':'+user.id+':'+key))),revokeHash=await digest(revokeToken);
  if(existing.length>1)await q(db,'DELETE FROM push_devices WHERE id=? AND user_id=?',existing[1].id,user.id).run();
  const inserted=await q(db,'INSERT INTO push_devices(id,user_id,session_hash,platform,address_hash,value,created,revoke_hash) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM push_devices WHERE user_id=?)<5 OR EXISTS(SELECT 1 FROM push_devices WHERE id=? AND user_id=?) ON CONFLICT(id) DO UPDATE SET session_hash=excluded.session_hash,platform=excluded.platform,address_hash=excluded.address_hash,value=excluded.value,created=excluded.created,revoke_hash=excluded.revoke_hash',id,user.id,user.sessionHash,data.platform,key,JSON.stringify(data.platform==='web'?data.subscription:{token:data.token}),now(),revokeHash,user.id,id,user.id).run();need(inserted.meta.changes===1,429,'Notification device limit reached');return{ok:true,id,revokeToken};
 }
 if(path==='/notifications/unsubscribe'&&method==='POST'){need(clean(data,['id'])&&/^[a-f0-9-]{36}$/.test(data.id),400,'Invalid notification device');await q(db,'DELETE FROM push_devices WHERE id=? AND user_id=?',data.id,user.id).run();return{ok:true};}
 throw new QueueError(404,'Not found');
}
export async function enqueueInvite(db,invite,target){
 await q(db,'INSERT OR IGNORE INTO push_outbox(id,device_id,invite_id,next_attempt) SELECT lower(hex(randomblob(16))),id,?,? FROM push_devices WHERE user_id=?',invite,now(),target).run();
}
async function fcmToken(env,context){
 if(context.token)return context.token;const c=fcmConfig(env);if(!c)throw new Error('Push unavailable');
 const encode=v=>b64(new TextEncoder().encode(JSON.stringify(v))),head=encode({alg:'RS256',typ:'JWT'}),claims=encode({iss:c.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now(),exp:now()+3600});
 const pem=c.private_key.replace(/-----[^-]+-----|\s/g,''),key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),x=>x.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']),signature=b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(head+'.'+claims)));
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:head+'.'+claims+'.'+signature}),redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Push authentication unavailable');const result=await response.json();if(typeof result.access_token!=='string')throw new Error('Push authentication unavailable');context.token=result.access_token;return context.token;
}
export async function sendPush(env,row,context={}){
 const value=JSON.parse(row.value),payload={type:'friend-invite',inviteId:row.invite_id,name:row.name};
 if(row.platform==='web'){
  if(!pushCapabilities(env).webPush||!validSubscription(value))return{ok:false,gone:false};
  const request=await buildPushPayload({data:payload,options:{ttl:Math.max(1,row.expires-now()),urgency:'normal',topic:row.invite_id.replaceAll('-','')}},value,{subject:env.APP_ORIGIN||'https://p-patsis.github.io',publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY});
  const r=await fetch(value.endpoint,{...request,redirect:'error',signal:AbortSignal.timeout(10000)});await r.body?.cancel();return{ok:r.ok,gone:[404,410].includes(r.status)};
 }
 const config=fcmConfig(env);if(!config)return{ok:false,gone:false};const token=await fcmToken(env,context);
 const r=await fetch('https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(config.project_id)+'/messages:send',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({message:{token:value.token,notification:{title:'Finger Fight',body:row.name+' invited you to play'},data:{type:'friend-invite',inviteId:row.invite_id},android:{ttl:Math.max(1,row.expires-now())+'s',collapse_key:row.invite_id,notification:{channel_id:'friend-invites'}}}}),redirect:'error',signal:AbortSignal.timeout(10000)});
 const body=await r.json().catch(()=>({}));return{ok:r.ok,gone:body.error?.details?.some(d=>d.errorCode==='UNREGISTERED')===true};
}
export async function dispatchPush(env,{send=sendPush}={}){
 if(!env.DB)return;const db=env.DB;
 await q(db,'DELETE FROM push_devices WHERE session_hash IN (SELECT hash FROM sessions WHERE expires<=?)',now()).run();
 await q(db,"DELETE FROM push_outbox WHERE invite_id IN (SELECT id FROM invites WHERE status<>'pending' OR expires<=?)",now()).run();
 const rows=(await q(db,"SELECT o.*,d.platform,d.value,d.user_id,i.sender,i.expires,u.name FROM push_outbox o JOIN push_devices d ON d.id=o.device_id JOIN invites i ON i.id=o.invite_id JOIN users u ON u.id=i.sender WHERE o.next_attempt<=? ORDER BY o.next_attempt,o.id LIMIT 4",now()).all()).results,context={};
 for(const row of rows){
  if(row.expires<=now()){await q(db,'DELETE FROM push_outbox WHERE id=?',row.id).run();continue;}
  const allowed=await q(db,"SELECT 1 FROM friends WHERE status='accepted' AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (actor=? AND target=?) OR (actor=? AND target=?))",row.sender,row.user_id,row.user_id,row.sender,row.sender,row.user_id,row.user_id,row.sender).first();
  if(!allowed){await q(db,'DELETE FROM push_outbox WHERE id=?',row.id).run();continue;}
  // Claim the due job before network I/O so request and Cron dispatch cannot both send it.
  const claimed=await q(db,'UPDATE push_outbox SET attempts=attempts+1,next_attempt=? WHERE id=? AND next_attempt<=?',now()+120,row.id,now()).run();if(claimed.meta.changes!==1)continue;
  try{const result=await send(env,row,context);if(result.gone)await q(db,'DELETE FROM push_devices WHERE id=?',row.device_id).run();else if(result.ok)await q(db,'DELETE FROM push_outbox WHERE id=?',row.id).run();else await q(db,'UPDATE push_outbox SET next_attempt=? WHERE id=?',now()+Math.min(300,20*2**Math.min(row.attempts,4)),row.id).run();}catch{ /* Bounded retry; no endpoint, payload, token or key is logged. */ }
 }
}

export async function revokeNotification(db,data){need(clean(data,['id','token'])&&/^[a-f0-9-]{36}$/.test(data.id)&&/^[A-Za-z0-9_-]{43}$/.test(data.token),400,'Invalid notification device');await q(db,'DELETE FROM push_devices WHERE id=? AND revoke_hash=?',data.id,await digest(data.token)).run();return{ok:true};}
