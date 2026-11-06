// Shared APK/browser queue. Only identity and connection metadata reach this API, never camera frames.
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const peer=v=>typeof v==='string'&&/^ffight-q-[a-f0-9]{48}$/.test(v);
export function validateAssignment(state){
 const p=state?.pair;
 if(!p||!uuid(p.id)||!uuid(p.host)||!uuid(p.guest)||p.host===p.guest||!/^[a-f0-9]{48}$/.test(p.key)||!['host','guest'].includes(p.role)||!peer(p.hostPeer)||!peer(p.guestPeer)||p.hostPeer===p.guestPeer||state.peer!==(p.role==='host'?p.hostPeer:p.guestPeer))throw new Error('Invalid matchmaking response');
 return p;
}
export class Matchmaker{
 constructor(service,{storage=globalThis.sessionStorage,pollMs=2000,timeout=120000}={}){this.service=service;this.storage=storage;this.pollMs=pollMs;this.timeout=timeout;this.client=null;this.stopped=false;this.timer=null;this.lastLease=0;this.storageKey='ff-search:'+service.base;}
 async cancel(){this.stopped=true;clearTimeout(this.timer);const client=this.client;this.client=null;if(!client)return;try{await this.pendingJoin;}catch{}try{if(this.storage?.getItem(this.storageKey)===client)this.storage.removeItem(this.storageKey);}catch{}try{await this.service.request('/queue/cancel','POST',{client});}catch{ /* cancellation is also covered by the server lease */ }}
 async start(name,{openPeer,onPair,connect,onStatus=()=>{},onRelay=()=>{}}){
  this.stopped=false;
  const check=()=>{if(this.stopped)throw new Error('Search cancelled');};
  await this.service.ensurePlayer(name);check();
  // Refuse a configured but unavailable relay; random opponents must never learn each other's IP.
  const relay=await this.service.prepareRelay();this.onRelay=onRelay;check();
  let old;try{old=this.storage?.getItem(this.storageKey);}catch{}
  if(uuid(old)){try{await this.service.request('/queue/cancel','POST',{client:old});}catch(e){if(e.status!==409)throw e;}check();}
  this.client=crypto.randomUUID();const client=this.client;
  try{this.storage?.setItem(this.storageKey,client);}catch{}
  const call=(path,extra={})=>this.service.request('/queue/'+path,'POST',{client,...extra});
  try{
   this.pendingJoin=call('join');const joined=await this.pendingJoin;this.pendingJoin=null;check();if(!peer(joined.peer))throw new Error('Invalid matchmaking response');
   await openPeer(joined.peer,relay);check();let state=await call('ready');const deadline=Date.now()+this.timeout;
   while(!state.pair){check();if(Date.now()>deadline)throw new Error('No opponent found right now. Try again in a minute.');onStatus('Waiting for an opponent…');await pause(this.pollMs);check();state=await call('poll');}
   const pair=validateAssignment(state);if(pair[pair.role]!==this.service.user.id)throw new Error('Invalid matchmaking identity');
   await onPair(pair);check();state=await call('ack',{pair:pair.id});if(validateAssignment(state).id!==pair.id)throw new Error('Match assignment changed');
   while(!state.pair?.acknowledged){check();if(Date.now()>deadline)throw new Error('The other player did not connect. Please try again.');await pause(this.pollMs);check();state=await call('poll');if(validateAssignment(state).id!==pair.id)throw new Error('Match assignment changed');}
   check();await connect(pair);check();this.lastLease=Date.now();this.renew(client,onStatus);return pair;
  }catch(e){await this.cancel();try{await this.service.request('/queue/cancel','POST',{client});}catch{}throw e;}
 }
 renew(client,onStatus){
  this.timer=setTimeout(async()=>{if(this.stopped||client!==this.client)return;
   try{await this.service.request('/queue/poll','POST',{client});this.lastLease=Date.now();this.onRelay?.(await this.service.prepareRelay());}
   catch(e){if([401,403,409].includes(e.status)||Date.now()-this.lastLease>90000){await this.cancel();onStatus('Matchmaking session ended. Finish this game, then search again.');return;}}
   if(!this.stopped)this.renew(client,onStatus);
  },20000);this.timer.unref?.();
 }
}
