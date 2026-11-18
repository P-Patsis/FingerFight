import {encode} from './passkey.js';
const KEY='ff-native-signin';let pending=null,generation=0;
export const isNative=()=>globalThis.Capacitor?.isNativePlatform?.()===true;
const storage=()=>isNative()?globalThis.localStorage:(globalThis.sessionStorage||globalThis.localStorage);
export function cancelNativeSignIn(){generation++;clearTimeout(pending?.timer);pending?.popup?.close?.();pending?.removeListener?.();pending?.reject(new Error('Sign-in cancelled'));pending=null;try{storage()?.removeItem(KEY);}catch{}}
export async function startNativeSignIn(api,action,{name='Fighter',googleAction='signin'}={}){
 cancelNativeSignIn();const attempt=generation,google=action==='google';let popup;
 if(google&&!isNative()){popup=globalThis.open?.('about:blank','fingerfight-signin','popup,width=440,height=640');if(!popup)throw new Error('Allow the sign-in popup and try again');}
 const verifier=encode(crypto.getRandomValues(new Uint8Array(32)));
 const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(pending?.attempt===attempt){pending?.popup?.close?.();pending?.removeListener?.();pending=null;storage()?.removeItem(KEY);}reject(new Error('Sign-in expired. Try again.'));},300000);timer.unref?.();pending={resolve,reject,timer,popup,attempt};});done.catch(()=>{});
 try{
  if(google)await api.ensurePlayer(name);
  const challenge=encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
  if(attempt!==generation)throw new Error('Sign-in cancelled');
  const result=await api.request(google?'/auth/google/start':'/auth/native/start','POST',google?{challenge,platform:isNative()?'android':'web',action:googleAction}:{action,challenge});
  if(attempt!==generation)throw new Error('Sign-in cancelled');
  storage().setItem(KEY,JSON.stringify({base:api.base,handoff:result.handoff,verifier,at:Date.now(),provider:google?'google':'passkey'}));
  const url=google?api.base+'/auth/google#handoff='+encodeURIComponent(result.handoff):'https://p-patsis.github.io/FingerFight/account.html#handoff='+encodeURIComponent(result.handoff);
  if(popup){
   const listener=event=>{if(event.origin===new URL(api.base).origin&&event.source===popup&&event.data?.type==='fingerfight-auth')void completeNativeSignIn(api,event.data.url).catch(()=>{});};
   globalThis.addEventListener?.('message',listener);pending.removeListener=()=>globalThis.removeEventListener?.('message',listener);popup.location.href=url;
  }else await globalThis.Capacitor.registerPlugin('Browser').open({url});
 }catch(e){if(attempt===generation)cancelNativeSignIn();else popup?.close?.();throw e;}
 return done;
}
export async function completeNativeSignIn(api,raw){
 let url,state;try{url=new URL(raw);if(url.protocol!=='fingerfight:'||url.hostname!=='account'||!['','/'].includes(url.pathname))return false;state=JSON.parse(storage()?.getItem(KEY)||'null');}catch{return false;}
 if(!state||state.base!==api.base||Date.now()-state.at>300000||url.searchParams.get('handoff')!==state.handoff||!/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code')||'')||[...url.searchParams.keys()].some(k=>!['handoff','code'].includes(k)))return false;
 try{
  const result=await api.request(state.provider==='google'?'/auth/google/exchange':'/auth/native/exchange','POST',{handoff:state.handoff,code:url.searchParams.get('code'),verifier:state.verifier});let current;try{current=JSON.parse(storage()?.getItem(KEY)||'null');}catch{}if(current?.handoff!==state.handoff){await api.request('/auth/logout','POST',{}, {token:result.token}).catch(()=>{});return false;}
  api.save(result);storage().removeItem(KEY);clearTimeout(pending?.timer);pending?.removeListener?.();pending?.popup?.close?.();pending?.resolve(result);pending=null;return true;
 }catch(e){let current;try{current=JSON.parse(storage()?.getItem(KEY)||'null');}catch{}if(current?.handoff!==state.handoff)return false;storage()?.removeItem(KEY);clearTimeout(pending?.timer);pending?.removeListener?.();pending?.popup?.close?.();pending?.reject(e);pending=null;throw e;}
}
