import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {normalizeSettings,effectiveMin,effectiveMax,pointerFor,resolveRound} from '../js/logic.js';
const encoder=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const bytes=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const token=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const id=()=>crypto.randomUUID(),now=()=>Math.floor(Date.now()/1000);
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const need=(value,status=400,message='Invalid request')=>{if(!value)throw new ApiError(status,message);};
const publicUser=u=>({id:u.id,code:u.code,name:u.name,registered:!!u.registered});
const nameOf=v=>typeof v==='string'?v.normalize('NFKC').replace(/[<>\x00-\x1f]/g,'').trim().slice(0,24):'';
const strict=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k));
async function body(req){const reader=req.body?.getReader();if(!reader)return {};const parts=[];let n=0;while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>20000){await reader.cancel();throw new ApiError(413,'Request too large');}parts.push(value);}const data=new Uint8Array(n);let offset=0;for(const p of parts){data.set(p,offset);offset+=p.length;}try{return JSON.parse(new TextDecoder().decode(data));}catch{throw new ApiError(400,'Invalid JSON');}}
const q=(db,sql,...params)=>db.prepare(sql).bind(...params);
async function rate(db,key,max=60,seconds=60){const t=now();await q(db,'INSERT INTO limits(key,n,until) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=CASE WHEN limits.until<=? THEN 1 ELSE limits.n+1 END,until=CASE WHEN limits.until<=? THEN excluded.until ELSE limits.until END',key,t+seconds,t,t).run();const row=await q(db,'SELECT n FROM limits WHERE key=?',key).first();need(row.n<=max,429,'Too many requests; try again later');}
async function session(db,req){const bearer=req.headers.get('Authorization')||'';need(/^Bearer [A-Za-z0-9_-]{43}$/.test(bearer),401,'Sign in required');const hash=await digest(bearer.slice(7));const u=await q(db,'SELECT users.*,sessions.auth_at FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>?',hash,now()).first();need(u,401,'Session expired');return {...u,sessionHash:hash};}
async function issue(db,user,verified=false){const value=token();await q(db,'INSERT INTO sessions(hash,user_id,expires,auth_at) VALUES(?,?,?,?)',await digest(value),user.id,now()+30*86400,verified?now():0).run();return {token:value,user:publicUser(user)};}
async function allowedPair(db,a,b){need(a!==b,400,'Choose another player');need(!await q(db,'SELECT 1 FROM blocks WHERE (actor=? AND target=?) OR (actor=? AND target=?)',a,b,b,a).first(),403,'This connection is unavailable');}
async function friendPair(db,a,b){await allowedPair(db,a,b);need(await q(db,"SELECT 1 FROM friends WHERE status='accepted' AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))",a,b,b,a).first(),403,'Accepted friends only');}
export const roundCommitment=(match,round,value,nonce)=>digest(`${match}:${round}:${value===null?'null':value}:${nonce}`);
export function createApp({webauthn={generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse}}={}){
 return {async fetch(req,env){
  const origin=req.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin&&allowed.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='Authorization,Content-Type';headers['Access-Control-Allow-Methods']='GET,POST,PATCH,DELETE,OPTIONS';}
  const out=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
  try{
   need(!origin||allowed.includes(origin),403,'Origin not allowed');
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   const url=new URL(req.url),path=url.pathname.replace(/\/$/,''),db=env.DB,method=req.method;
   if(path==='/health')return out({ok:true,service:'fingerfight',version:1});
   need(db,503,'Database not configured');
   need(['GET','POST','PATCH','DELETE'].includes(method),405,'Method not allowed');
   const ip=req.headers.get('CF-Connecting-IP')||'local';await rate(db,'ip:'+await digest(ip),180);
   const data=method==='GET'?{}:await body(req);
   if(path==='/auth/guest'&&method==='POST'){
    need(strict(data,['name']));await rate(db,'create:'+await digest(ip),5,3600);
    const u={id:id(),code:token().slice(0,12).toUpperCase(),name:nameOf(data.name)||'Fighter',registered:0};
    await q(db,'INSERT INTO users(id,code,name,created) VALUES(?,?,?,?)',u.id,u.code,u.name,now()).run();return out(await issue(db,u),201);
   }
   if(path==='/auth/login/options'&&method==='POST'){
    await rate(db,'login:'+await digest(ip),20,300);const options=await webauthn.generateAuthenticationOptions({rpID:env.RP_ID,userVerification:'required'}),cid=id();
    await q(db,"INSERT INTO challenges(id,user_id,kind,value,expires) VALUES(?,NULL,'login',?,?)",cid,options.challenge,now()+300).run();return out({id:cid,options});
   }
   if(path==='/auth/login/verify'&&method==='POST'){
    need(strict(data,['id','response'])&&uuid(data.id)&&data.response&&typeof data.response==='object');const challenge=await q(db,"DELETE FROM challenges WHERE id=? AND kind='login' AND expires>? RETURNING *",data.id,now()).first();need(challenge,400,'Challenge expired');
    const cred=await q(db,'SELECT * FROM credentials WHERE id=?',data.response?.id||'').first();need(cred,401,'Passkey not recognised');
    let result;try{result=await webauthn.verifyAuthenticationResponse({response:data.response,expectedChallenge:challenge.value,expectedOrigin:env.APP_ORIGIN,expectedRPID:env.RP_ID,requireUserVerification:true,credential:{id:cred.id,publicKey:bytes(cred.public_key),counter:cred.counter,transports:JSON.parse(cred.transports)}});}catch{throw new ApiError(401,'Passkey verification failed');}
    need(result.verified,401,'Passkey verification failed');const updated=await q(db,'UPDATE credentials SET counter=? WHERE id=? AND counter=?',result.authenticationInfo.newCounter,cred.id,cred.counter).run();need(updated.meta.changes===1,409,'Passkey state changed; sign in again');const u=await q(db,'SELECT * FROM users WHERE id=?',cred.user_id).first();return out(await issue(db,u,true));
   }
   const u=await session(db,req);await rate(db,'user:'+u.id,100);
   if(path==='/me'&&method==='GET')return out({user:publicUser(u)});
   if(path==='/me'&&method==='PATCH'){need(strict(data,['name'])&&nameOf(data.name));await q(db,'UPDATE users SET name=? WHERE id=?',nameOf(data.name),u.id).run();return out({user:publicUser({...u,name:nameOf(data.name)})});}
   if(path==='/auth/logout'&&method==='POST'){await q(db,'DELETE FROM sessions WHERE hash=?',u.sessionHash).run();return out({ok:true});}
   if(path==='/auth/register/options'&&method==='POST'){
    need(!u.registered,409,'This account already has a passkey');const options=await webauthn.generateRegistrationOptions({rpName:'Finger Fight',rpID:env.RP_ID,userName:u.code,userDisplayName:u.name,userID:encoder.encode(u.id),attestationType:'none',supportedAlgorithmIDs:[-7],authenticatorSelection:{residentKey:'required',userVerification:'required'}}),cid=id();
    await q(db,"INSERT INTO challenges(id,user_id,kind,value,expires) VALUES(?,?,'register',?,?)",cid,u.id,options.challenge,now()+300).run();return out({id:cid,options});
   }
   if(path==='/auth/register/verify'&&method==='POST'){
    need(!u.registered&&strict(data,['id','response'])&&uuid(data.id)&&data.response&&typeof data.response==='object');const challenge=await q(db,"DELETE FROM challenges WHERE id=? AND user_id=? AND kind='register' AND expires>? RETURNING *",data.id,u.id,now()).first();need(challenge,400,'Challenge expired');
    let result;try{result=await webauthn.verifyRegistrationResponse({response:data.response,expectedChallenge:challenge.value,expectedOrigin:env.APP_ORIGIN,expectedRPID:env.RP_ID,requireUserVerification:true});}catch{throw new ApiError(401,'Passkey verification failed');}need(result.verified,401,'Passkey verification failed');
    const c=result.registrationInfo.credential;
    const change=await db.batch([q(db,'INSERT INTO credentials(id,user_id,public_key,counter,transports) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND registered=0)',c.id,u.id,b64(c.publicKey),c.counter,JSON.stringify(c.transports||[]),u.id),q(db,'UPDATE users SET registered=1 WHERE id=? AND EXISTS(SELECT 1 FROM credentials WHERE id=? AND user_id=?)',u.id,c.id,u.id),q(db,'DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM credentials WHERE id=? AND user_id=?)',u.id,c.id,u.id)]);
    need(change[0].meta.changes===1,409,'Account already registered');return out(await issue(db,{...u,registered:1},true));
   }
   if(path==='/me'&&method==='DELETE'){need(data.confirm===true&&u.auth_at>now()-600,403,'Sign in with your passkey again before deleting your account');await q(db,'DELETE FROM users WHERE id=?',u.id).run();return out({ok:true});}
   need(u.registered,403,'Create a passkey account to use social features');
   if(path==='/friends'&&method==='GET'){const rows=await q(db,"SELECT f.*,u.code,u.name FROM friends f JOIN users u ON u.id=CASE WHEN f.sender=? THEN f.recipient ELSE f.sender END WHERE f.sender=? OR f.recipient=? ORDER BY f.created DESC LIMIT 200",u.id,u.id,u.id).all();return out({friends:rows.results.map(f=>({...f,other:f.sender===u.id?f.recipient:f.sender}))});}
   if(path==='/friends'&&method==='POST'){
    need(strict(data,['code'])&&typeof data.code==='string');await rate(db,'friends:'+u.id,20,3600);const target=await q(db,'SELECT id FROM users WHERE code=? AND registered=1',data.code.toUpperCase()).first();need(target,404,'Friend code not found');await allowedPair(db,u.id,target.id);need(!await q(db,'SELECT 1 FROM friends WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',u.id,target.id,target.id,u.id).first(),409,'Friend request already exists');const fid=id();await q(db,"INSERT INTO friends(id,sender,recipient,status,created) VALUES(?,?,?,'pending',?)",fid,u.id,target.id,now()).run();return out({id:fid},201);
   }
   const friend=path.match(/^\/friends\/([a-f0-9-]{36})$/);
   if(friend&&method==='PATCH'){need(data.accept===true&&strict(data,['accept']));const r=await q(db,"SELECT * FROM friends WHERE id=? AND recipient=? AND status='pending'",friend[1],u.id).first();need(r,404,'Request not found');await allowedPair(db,u.id,r.sender);await q(db,"UPDATE friends SET status='accepted' WHERE id=?",r.id).run();return out({ok:true});}
   if(friend&&method==='DELETE'){await q(db,'DELETE FROM friends WHERE id=? AND (sender=? OR recipient=?)',friend[1],u.id,u.id).run();return out({ok:true});}
   if(path==='/blocks'&&method==='GET')return out({blocks:(await q(db,'SELECT b.target,u.name,u.code FROM blocks b JOIN users u ON u.id=b.target WHERE b.actor=?',u.id).all()).results});
   if(path==='/blocks'&&method==='POST'){
    need(strict(data,['target'])&&uuid(data.target));await allowedPair(db,u.id,data.target).catch(e=>{if(e.status!==403)throw e;});need(await q(db,'SELECT 1 FROM users WHERE id=?',data.target).first(),404,'Player not found');await db.batch([q(db,'INSERT OR IGNORE INTO blocks(actor,target) VALUES(?,?)',u.id,data.target),q(db,'DELETE FROM friends WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',u.id,data.target,data.target,u.id),q(db,"UPDATE invites SET status='declined' WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)",u.id,data.target,data.target,u.id)]);return out({ok:true});
   }
   const block=path.match(/^\/blocks\/([a-f0-9-]{36})$/);if(block&&method==='DELETE'){await q(db,'DELETE FROM blocks WHERE actor=? AND target=?',u.id,block[1]).run();return out({ok:true});}
   if(path==='/invites'&&method==='GET')return out({invites:(await q(db,"SELECT i.*,u.name FROM invites i JOIN users u ON u.id=i.sender WHERE i.recipient=? AND i.status='pending' AND i.expires>? ORDER BY expires DESC LIMIT 50",u.id,now()).all()).results});
   if(path==='/invites'&&method==='POST'){need(strict(data,['target','code'])&&typeof data.target==='string'&&/^[A-HJ-NP-Z2-9]{16}$/.test(data.code));await friendPair(db,u.id,data.target);await rate(db,'invite:'+u.id,20,3600);const iid=id();await q(db,"INSERT INTO invites(id,sender,recipient,code,status,expires) VALUES(?,?,?,?,'pending',?)",iid,u.id,data.target,data.code,now()+600).run();return out({id:iid},201);}
   const invite=path.match(/^\/invites\/([a-f0-9-]{36})$/);if(invite&&method==='PATCH'){need(strict(data,['accept'])&&typeof data.accept==='boolean');const r=await q(db,"SELECT * FROM invites WHERE id=? AND recipient=? AND status='pending' AND expires>?",invite[1],u.id,now()).first();need(r,404,'Invitation expired');await friendPair(db,u.id,r.sender);await q(db,'UPDATE invites SET status=? WHERE id=?',data.accept?'accepted':'declined',r.id).run();return out({ok:true,...(data.accept?{code:r.code}:{})});}
   if(path==='/reports'&&method==='POST'){need(strict(data,['target','reason','detail','match'])&&uuid(data.target)&&(data.match===undefined||data.match===null||uuid(data.match))&&['abuse','cheating','name','other'].includes(data.reason)&&typeof data.detail==='string'&&data.detail.length<=500);need(u.id!==data.target&&await q(db,'SELECT 1 FROM users WHERE id=?',data.target).first(),404,'Player not found');await rate(db,'reports:'+u.id,10,86400);const rid=id();await q(db,'INSERT INTO reports(id,actor,target,reason,detail,match_id,created) VALUES(?,?,?,?,?,?,?)',rid,u.id,data.target,data.reason,data.detail,data.match||null,now()).run();return out({id:rid,status:'received'},201);}
   if(path==='/matches'&&method==='POST'){need(strict(data,['opponent','settings'])&&typeof data.opponent==='string');await friendPair(db,u.id,data.opponent);await rate(db,'matches:'+u.id,30,3600);const mid=id(),s=normalizeSettings(data.settings||{});await q(db,'INSERT INTO matches(id,host,guest,settings,hp_host,hp_guest,created) VALUES(?,?,?,?,?,?,?)',mid,u.id,data.opponent,JSON.stringify(s),s.hits,s.hits,now()).run();return out({id:mid},201);}
   const match=path.match(/^\/matches\/([a-f0-9-]{36})(?:\/(accept|turn|cancel))?$/);
   if(match){let m=await q(db,'SELECT * FROM matches WHERE id=? AND (host=? OR guest=?)',match[1],u.id,u.id).first();need(m,404,'Match not found');await allowedPair(db,m.host,m.guest);
    if(method==='GET'){const turns=(await q(db,'SELECT player,revealed FROM turns WHERE match_id=? AND round=?',m.id,m.round).all()).results;return out({match:publicMatch(m),committed:turns.map(t=>t.player),revealed:turns.filter(t=>t.revealed).map(t=>t.player)});}
    if(match[2]==='cancel'&&method==='POST'){await q(db,"UPDATE matches SET state='abandoned',winner=NULL WHERE id=? AND state<>'done'",m.id).run();return out({ok:true});}
    if(match[2]==='accept'&&method==='POST'){need(u.id===m.guest&&m.state==='pending'&&data.accept===true,403);await q(db,"UPDATE matches SET state='active' WHERE id=? AND state='pending'",m.id).run();return out({ok:true});}
    if(match[2]==='turn'&&method==='POST'){
     need(m.state==='active'&&m.round<=500,409,'Match is not active');need(data.round===m.round,409,'Wrong round');const s=JSON.parse(m.settings);
     if(data.commitment!==undefined){need(strict(data,['round','commitment'])&&/^[a-f0-9]{64}$/.test(data.commitment));await q(db,'INSERT OR IGNORE INTO turns(match_id,round,player,commitment) VALUES(?,?,?,?)',m.id,m.round,u.id,data.commitment).run();return out({ok:true});}
     need(strict(data,['round','value','nonce'])&&(data.value===null||Number.isInteger(data.value)&&data.value>=effectiveMin(s,m.round)&&data.value<=effectiveMax(s,m.round))&&/^[a-f0-9]{64}$/.test(data.nonce));
     const turns=(await q(db,'SELECT * FROM turns WHERE match_id=? AND round=?',m.id,m.round).all()).results;need(turns.length===2,409,'Both players must commit first');const mine=turns.find(t=>t.player===u.id);need(mine&&!mine.revealed&&await roundCommitment(m.id,m.round,data.value,data.nonce)===mine.commitment,409,'Commitment mismatch or replay');await q(db,'UPDATE turns SET revealed=1,value=? WHERE match_id=? AND round=? AND player=? AND revealed=0',data.value,m.id,m.round,u.id).run();
     const revealed=(await q(db,'SELECT * FROM turns WHERE match_id=? AND round=? AND revealed=1',m.id,m.round).all()).results;
     if(revealed.length===2){const side=pointerFor(m.round),pointer=side==='host'?m.host:m.guest,p= revealed.find(t=>t.player===pointer),g=revealed.find(t=>t.player!==pointer),result=resolveRound({pointer:side,count:p.value??0,guess:g.value,noHand:p.value===null});let h=m.hp_host,v=m.hp_guest;if(result.target==='host')h=Math.max(0,h-result.damage);if(result.target==='guest')v=Math.max(0,v-result.damage);let winner=h===0?m.guest:v===0?m.host:null;if(!winner&&m.round>=3){const recent=(await q(db,'SELECT round,player,value FROM turns WHERE match_id=? AND round>=? AND round<=? AND revealed=1',m.id,m.round-2,m.round).all()).results,away=[m.host,m.guest].filter(uid=>[0,1,2].every(k=>recent.some(t=>t.player===uid&&t.round===m.round-k&&t.value===null)));if(away.length===1)winner=away[0]===m.host?m.guest:m.host;}await q(db,'UPDATE matches SET hp_host=?,hp_guest=?,round=round+1,state=?,winner=? WHERE id=? AND round=? AND state=\'active\'',h,v,winner?'done':'active',winner,m.id,m.round).run();}
     m=await q(db,'SELECT * FROM matches WHERE id=?',m.id).first();return out({match:publicMatch(m)});
    }
   }
   if(path==='/leaderboard'&&method==='GET'){const rows=await q(db,"SELECT u.id,u.code,u.name,sum(CASE WHEN m.winner=u.id THEN 1 ELSE 0 END) wins,count(m.id) matches FROM users u LEFT JOIN matches m ON (m.host=u.id OR m.guest=u.id) AND m.state='done' WHERE u.id=? OR u.id IN (SELECT CASE WHEN sender=? THEN recipient ELSE sender END FROM friends WHERE status='accepted' AND (sender=? OR recipient=?)) GROUP BY u.id ORDER BY wins DESC,matches DESC LIMIT 201",u.id,u.id,u.id,u.id).all();return out({leaderboard:rows.results});}
   throw new ApiError(404,'Not found');
  }catch(error){if(error instanceof ApiError)return out({error:error.message},error.status);if(/UNIQUE constraint failed/.test(error?.message||''))return out({error:'Already exists'},409);console.error(JSON.stringify({event:'api_error',message:'Request failed'}));return out({error:'Request failed'},500);}
 },async scheduled(event,env){await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires<unixepoch()'),env.DB.prepare('DELETE FROM challenges WHERE expires<unixepoch()'),env.DB.prepare('DELETE FROM limits WHERE until<unixepoch()'),env.DB.prepare('DELETE FROM invites WHERE expires<unixepoch()-86400'),env.DB.prepare('DELETE FROM users WHERE registered=0 AND created<unixepoch()-2592000 AND NOT EXISTS(SELECT 1 FROM sessions WHERE user_id=users.id)')]);}};
}
function publicMatch(m){return {id:m.id,host:m.host,guest:m.guest,settings:JSON.parse(m.settings),round:m.round,health:{host:m.hp_host,guest:m.hp_guest},state:m.state,winner:m.winner,forfeit:m.state==='done'&&m.hp_host>0&&m.hp_guest>0?(m.winner===m.host?m.guest:m.host):null};}
export default createApp();
