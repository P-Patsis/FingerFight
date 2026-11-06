// Small optional backend client. Camera pixels are never included in these API requests.
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
function credentialJSON(c){if(c.toJSON)return c.toJSON();const r=c.response,response={clientDataJSON:encode(r.clientDataJSON)};if(r.attestationObject){response.attestationObject=encode(r.attestationObject);response.transports=r.getTransports?.()||[];}else{response.authenticatorData=encode(r.authenticatorData);response.signature=encode(r.signature);response.userHandle=r.userHandle?encode(r.userHandle):null;}return {id:c.id,rawId:encode(c.rawId),type:c.type,authenticatorAttachment:c.authenticatorAttachment,clientExtensionResults:c.getClientExtensionResults(),response};}
export class Service{
 constructor(base,{fetch=globalThis.fetch,storage=globalThis.sessionStorage,credentials=globalThis.navigator?.credentials}={}){
  this.base=base?.replace(/\/$/,'')||'';this.fetch=fetch;this.storage=storage;this.credentials=credentials;this.token=null;this.user=null;
  if(this.base){const u=new URL(this.base);if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw new Error('Backend requires HTTPS');try{const s=JSON.parse(storage?.getItem('ff-session:'+this.base)||'null');if(s?.token){this.token=s.token;this.user=s.user;}}catch{ /* unavailable storage */ }}
 }
 get enabled(){return !!this.base;}
 save(result){this.token=result.token;this.user=result.user;try{this.storage?.setItem('ff-session:'+this.base,JSON.stringify(result));}catch{ /* memory session */ }return result;}
 async request(path,method='GET',data){if(!this.enabled)throw new Error('Online accounts are not connected');const res=await this.fetch(this.base+path,{method,headers:{'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},...(data===undefined?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(15000)});const result=await res.json();if(!res.ok){const e=new Error(result.error||'Could not complete request');e.status=res.status;throw e;}return result;}
 async ensurePlayer(name){
  if(this.token){try{const result=await this.request('/me');this.user=result.user;return this.user;}catch(e){if(e.status!==401)throw e;this.token=null;this.user=null;}}
  return this.save(await this.request('/players/session','POST',{name})).user;
 }
 async prepareRelay(){
  if(this.relayUntil>Date.now()+60000)return this.relayServers;
  const r=await this.request('/rtc/config','POST',{}),ice=r.iceServers;
  if(!Array.isArray(ice)||ice.length<1||ice.length>8||!Number.isFinite(r.expires)||r.expires*1000<Date.now()+60000||!ice.every(s=>s&&typeof s.username==='string'&&s.username.length<=1024&&typeof s.credential==='string'&&s.credential.length<=1024&&(Array.isArray(s.urls)?s.urls:[s.urls]).length>0&&(Array.isArray(s.urls)?s.urls:[s.urls]).length<=8&&(Array.isArray(s.urls)?s.urls:[s.urls]).every(u=>typeof u==='string'&&u.length<=512&&/^turns?:[^\s]+$/.test(u))))throw new Error('Multiplayer relay is unavailable');
  this.relayServers=ice;this.relayUntil=r.expires*1000;return ice;
 }
 async guest(name){return this.save(await this.request('/auth/guest','POST',{name}));}
 async register(name){if(!this.credentials)throw new Error('Passkeys are not supported by this browser');if(!this.token)await this.guest(name);const o=await this.request('/auth/register/options','POST',{}),options={...o.options,challenge:decode(o.options.challenge),user:{...o.options.user,id:decode(o.options.user.id)},excludeCredentials:(o.options.excludeCredentials||[]).map(c=>({...c,id:decode(c.id)}))};const credential=await this.credentials.create({publicKey:options});if(!credential)throw new Error('Passkey creation cancelled');return this.save(await this.request('/auth/register/verify','POST',{id:o.id,response:credentialJSON(credential)}));}
 async login(){if(!this.credentials)throw new Error('Passkeys are not supported by this browser');const o=await this.request('/auth/login/options','POST',{}),options={...o.options,challenge:decode(o.options.challenge),allowCredentials:(o.options.allowCredentials||[]).map(c=>({...c,id:decode(c.id)}))},credential=await this.credentials.get({publicKey:options});if(!credential)throw new Error('Sign in cancelled');return this.save(await this.request('/auth/login/verify','POST',{id:o.id,response:credentialJSON(credential)}));}
 async lockRound(match,round,value,{timeout=20000}={}){
  const nonce=[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join(''),text=`${match}:${round}:${value===null?'null':value}:${nonce}`;
  const commitment=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
  await this.request('/matches/'+match+'/turn','POST',{round,commitment});
  const started=Date.now();while(true){const state=await this.request('/matches/'+match);if(state.committed.length===2)break;if(Date.now()-started>timeout)throw new Error('Waiting for the other player to lock in');await new Promise(r=>setTimeout(r,500));}
  let result=await this.request('/matches/'+match+'/turn','POST',{round,value,nonce});
  while(result.match.round===round&&result.match.state==='active'){if(Date.now()-started>timeout)throw new Error('Waiting for the other player to reveal');await new Promise(r=>setTimeout(r,500));result=await this.request('/matches/'+match);}
  return result.match;
 }
 async logout(){try{if(this.token)await this.request('/auth/logout','POST',{});}catch{ /* local sign-out still clears the browser session when offline */ }finally{this.token=null;this.user=null;try{this.storage?.removeItem('ff-session:'+this.base);}catch{}}}
}
