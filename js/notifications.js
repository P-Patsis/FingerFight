import {isNative} from './native-auth.js';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const keyBytes=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export class InviteNotifications {
 constructor(api,{storage=globalThis.localStorage,notification=globalThis.Notification,serviceWorker=globalThis.navigator?.serviceWorker,native=isNative(),plugin=null,nativeConfigured=()=>globalThis.FF_ANDROID_PUSH_CONFIGURED===true,onInvite=()=>{}}={}){
  this.api=api;this.storage=storage;this.notification=notification;this.serviceWorker=serviceWorker;this.native=native;this.plugin=plugin;this.nativeConfigured=nativeConfigured;this.onInvite=onInvite;this.key='ff-invite-notifications:'+api.base;this.capabilities=null;
  const receive=data=>{if(data?.type==='friend-invite'&&UUID.test(data.inviteId||''))this.onInvite(data.inviteId);};
  serviceWorker?.addEventListener?.('message',event=>receive(event.data));
  if(native){const push=this.push();push?.addListener('pushNotificationActionPerformed',event=>receive(event.notification?.data));push?.addListener('pushNotificationReceived',event=>receive(event.data));}
 }
 push(){return this.plugin||(this.native&&globalThis.Capacitor?.registerPlugin?.('PushNotifications'));}
 state(){try{return JSON.parse(this.storage?.getItem(this.key)||'null')||{};}catch{return{};}}
 save(value){try{this.storage?.setItem(this.key,JSON.stringify(value));}catch{}}
 get enabled(){const s=this.state();return !!s.enabled&&s.owner===this.api.user?.id;}
 get available(){const c=this.capabilities;return !!c&&(this.native?c.androidPush&&this.nativeConfigured():!!(c.webPush&&this.notification&&this.serviceWorker&&globalThis.PushManager));}
 async load(){if(!this.api.user?.registered)return{available:false,enabled:false};this.capabilities=await this.api.request('/notifications/config');return{available:this.available,enabled:this.enabled};}
 async androidToken(){
  const push=this.push();return new Promise(async(resolve,reject)=>{
   let registration,error,settled=false;const done=async(value,failure)=>{if(settled)return;settled=true;clearTimeout(timer);await Promise.allSettled([registration?.remove(),error?.remove()]);failure?reject(failure):resolve(value);};
   const timer=setTimeout(()=>void done(null,new Error('Notification setup timed out. Try again.')),20000);timer.unref?.();
   try{registration=await push.addListener('registration',value=>void done(value.value));error=await push.addListener('registrationError',()=>void done(null,new Error('Could not enable invite notifications')));await push.register();}catch(e){await done(null,new Error('Could not enable invite notifications'));}
  });
 }
 enable(options={}){if(this.disabling)return this.disabling;if(this.enabling)return this.enabling;const job=this.enableNow(options);this.enabling=job;const clear=()=>{if(this.enabling===job)this.enabling=null;};job.then(clear,clear);return job;}
 async enableNow({ask=true}={}){
  if(!this.api.user?.registered)throw new Error('Sign in to enable invite notifications');
  const owner=this.api.user.id,c=this.capabilities;if(!c||(this.native?!c.androidPush||!this.nativeConfigured():!c.webPush||!this.notification||!this.serviceWorker||!globalThis.PushManager))throw new Error('Invite notifications are not available on this device yet');
  const permission=this.native?(ask?await this.push().requestPermissions():await this.push().checkPermissions()).receive:(ask?await this.notification.requestPermission():this.notification.permission);
  if(permission!=='granted')throw new Error('Notifications are blocked. You can allow them in your device or browser settings.');
  const previous=this.state(),id=previous.owner===this.api.user.id&&UUID.test(previous.id||'')?previous.id:crypto.randomUUID();let subscription;
  try{
   let payload;
   if(this.native){await this.push().createChannel({id:'friend-invites',name:'Friend invitations',description:'Invitations to play Finger Fight',importance:3,visibility:0});payload={id,platform:'android',token:await this.androidToken(),launcherSafe:true};}
   else{const registration=await this.serviceWorker.ready;subscription=await registration.pushManager.getSubscription();if(subscription&&previous.owner&&previous.owner!==this.api.user.id){await subscription.unsubscribe();subscription=null;}subscription=subscription||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(c.webPushPublicKey)});payload={id,platform:'web',subscription:subscription.toJSON()};}
   if(this.api.user?.id!==owner)throw new Error('Account changed. Try enabling notifications again.');
   const result=await this.api.request('/notifications/subscribe','POST',payload);if(this.api.user?.id!==owner){await this.api.request('/notifications/revoke','POST',{id:result.id||id,token:result.revokeToken}).catch(()=>{});throw new Error('Account changed. Try enabling notifications again.');}this.save({id:result.id||id,owner:this.api.user.id,enabled:true,revokeToken:result.revokeToken});return true;
  }catch(e){await subscription?.unsubscribe().catch(()=>{});throw e;}
 }
 disable(){if(this.disabling)return this.disabling;const job=(async()=>{if(this.enabling)await this.enabling.catch(()=>{});return this.disableNow();})();this.disabling=job;const clear=()=>{if(this.disabling===job)this.disabling=null;};job.then(clear,clear);return job;}
 async disableNow(){
  const state=this.state();let stopped=!state.id;
  if(state.id&&state.revokeToken)try{await this.api.request('/notifications/revoke','POST',{id:state.id,token:state.revokeToken});stopped=true;}catch{}
  else if(state.id&&state.owner===this.api.user?.id)try{await this.api.request('/notifications/unsubscribe','POST',{id:state.id});stopped=true;}catch{}
  if(this.native){if(this.nativeConfigured())try{await this.push().unregister();}catch{}}
  else try{const registration=await this.serviceWorker?.ready,subscription=await registration?.pushManager?.getSubscription();if(!subscription||await subscription.unsubscribe())stopped=true;}catch{}
  this.save({...state,enabled:false,pendingDisable:!stopped});if(!stopped)throw new Error('Notification removal will finish when you are online');
 }
 async sync(){const state=this.state();if(state.pendingDisable)return this.disable();if(state.owner!==this.api.user?.id)return;if(state.enabled){await this.load();return this.enable({ask:false});}}
}
