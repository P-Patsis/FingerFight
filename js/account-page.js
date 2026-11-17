import {API_URL} from './service-config.js';
import {credentialJSON,passkeyOptions} from './passkey.js';
const $=id=>document.getElementById(id),handoff=new URLSearchParams(location.hash.slice(1)).get('handoff');
history.replaceState(null,'',location.pathname);
if(window.top!==window.self||!/^[A-Za-z0-9_-]{43}$/.test(handoff||'')){$('accountPageContinue').hidden=true;$('accountPageMsg').textContent='Open account sign-in from Finger Fight to continue.';}
else $('accountPageContinue').onclick=async()=>{
 const button=$('accountPageContinue');button.disabled=true;$('accountPageMsg').textContent='';
 try{
  if(!navigator.credentials)throw new Error('This browser does not support passkeys. Use an up-to-date browser.');
  const call=async(path,data)=>{const r=await fetch(API_URL+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)}),body=await r.json();if(!r.ok)throw new Error(body.error||'Could not sign in');return body;};
  const options=await call('/auth/native/options',{handoff});$('accountPageInfo').textContent=options.action==='register'?'Create your Finger Fight passkey.':'Sign in to your Finger Fight account.';
  const registration=options.action==='register',credential=await navigator.credentials[registration?'create':'get']({publicKey:passkeyOptions(options.options,registration)});if(!credential)throw new Error('Sign-in cancelled');
  const result=await call('/auth/native/verify',{handoff,id:options.id,response:credentialJSON(credential)});
  if(!/^[A-Za-z0-9_-]{43}$/.test(result.code||'')||result.handoff!==handoff)throw new Error('Invalid sign-in response');
  $('accountPageReturn').href='fingerfight://account?handoff='+encodeURIComponent(handoff)+'&code='+encodeURIComponent(result.code);$('accountPageReturn').hidden=false;button.hidden=true;$('accountPageMsg').textContent='Account ready. Tap Return to Finger Fight.';
 }catch(e){$('accountPageMsg').textContent=e.name==='NotAllowedError'?'Sign-in cancelled. Tap Continue to try again.':e.message||'Could not sign in';}finally{button.disabled=false;}
};
