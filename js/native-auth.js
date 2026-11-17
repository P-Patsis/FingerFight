import {encode} from './passkey.js';
const KEY='ff-native-signin';let pending=null;
export const isNative=()=>globalThis.Capacitor?.isNativePlatform?.()===true;
const storage=()=>globalThis.localStorage;
export function cancelNativeSignIn(){clearTimeout(pending?.timer);pending?.reject(new Error('Sign-in cancelled'));pending=null;try{storage()?.removeItem(KEY);}catch{}}
export async function startNativeSignIn(api,action){
 cancelNativeSignIn();const verifier=encode(crypto.getRandomValues(new Uint8Array(32))),challenge=encode(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));
 const result=await api.request('/auth/native/start','POST',{action,challenge});
 const state={base:api.base,handoff:result.handoff,verifier,at:Date.now()};storage().setItem(KEY,JSON.stringify(state));
 const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending=null;storage()?.removeItem(KEY);reject(new Error('Sign-in expired. Try again.'));},300000);timer.unref?.();pending={resolve,reject,timer};});
 done.catch(()=>{});
 try{await globalThis.Capacitor.registerPlugin('Browser').open({url:'https://p-patsis.github.io/FingerFight/account.html#handoff='+encodeURIComponent(result.handoff)});}catch(e){cancelNativeSignIn();throw new Error('Could not open your browser for sign-in');}
 return done;
}
export async function completeNativeSignIn(api,raw){
 let url,state;try{url=new URL(raw);if(url.protocol!=='fingerfight:'||url.hostname!=='account'||!['','/'].includes(url.pathname))return false;state=JSON.parse(storage()?.getItem(KEY)||'null');}catch{return false;}
 if(!state||state.base!==api.base||Date.now()-state.at>300000||url.searchParams.get('handoff')!==state.handoff||!/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('code')||'')||[...url.searchParams.keys()].some(k=>!['handoff','code'].includes(k)))return false;
 try{
  const result=await api.request('/auth/native/exchange','POST',{handoff:state.handoff,code:url.searchParams.get('code'),verifier:state.verifier});let current;try{current=JSON.parse(storage()?.getItem(KEY)||'null');}catch{}if(current?.handoff!==state.handoff){await api.request('/auth/logout','POST',{}, {token:result.token}).catch(()=>{});return false;}api.save(result);storage().removeItem(KEY);clearTimeout(pending?.timer);pending?.resolve(result);pending=null;return true;
 }catch(e){let current;try{current=JSON.parse(storage()?.getItem(KEY)||'null');}catch{}if(current?.handoff!==state.handoff)return false;storage()?.removeItem(KEY);clearTimeout(pending?.timer);pending?.reject(e);pending=null;throw e;}
}
