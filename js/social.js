// Optional accounts, accepted friends and server-confirmed friend rankings.
export function initSocial(api,{getName,invite,join,onBack,leaderboards=false,notifications=null}){
 let messageTimer=null,actionRevision=0;
 const $=id=>document.getElementById(id),msg=text=>{clearTimeout(messageTimer);$('socialMsg').textContent=text;if(text){messageTimer=setTimeout(()=>{if($('socialMsg').textContent===text)$('socialMsg').textContent='';},6000);messageTimer.unref?.();}},button=(text,action)=>{const b=document.createElement('button');b.className='btn small';b.textContent=text;b.onclick=()=>run(action);return b;},line=text=>{const e=document.createElement('div');e.className='social-row';const name=document.createElement('span');name.textContent=text;e.append(name);return e;};
 let timer=null,opened=false,revision=0;
 const run=async fn=>{const action=++actionRevision;try{msg('');await fn();}catch(e){if(action===actionRevision)msg(e.name==='NotAllowedError'?'Passkey sign-in cancelled.':e.message||'Could not complete request');}};
 $('socialBoardTitle').hidden=!leaderboards;$('socialBoard').hidden=!leaderboards;
 async function render(){
  const mine=++revision,user=api.user;if(document.activeElement!==$('socialName'))$('socialName').value=user?.name||getName();
  $('socialMembers').hidden=!user?.registered;$('accountCopyCode').hidden=!user?.registered;
  $('socialIdentity').textContent=user?.registered?`${user.name} · Friend code: ${user.code}`:'Accounts are optional. Create a passkey to add friends and save match results.';
  $('accountCreate').hidden=!!user?.registered;$('accountLogin').hidden=!!user?.registered;$('accountLogout').hidden=!user?.registered;$('accountDelete').hidden=!user?.registered;$('accountSaveName').hidden=!user?.registered;
  $('socialFriends').replaceChildren();$('socialInvites').replaceChildren();$('socialBlocks').replaceChildren();$('socialBoard').replaceChildren();$('friendAdd').disabled=!user?.registered;
  $('inviteNotify').hidden=!user?.registered||!notifications;
  if(!user?.registered)return;
  const [f,i,l,b]=await Promise.all([api.request('/friends'),api.request('/invites'),leaderboards?api.request('/leaderboard'):Promise.resolve({leaderboard:[]}),api.request('/blocks')]);
  if(mine!==revision||api.user?.id!==user.id)return;
  for(const r of b.blocks){const row=line(r.name);row.append(button('Unblock',async()=>{await api.request('/blocks/'+r.target,'DELETE');await render();}));$('socialBlocks').append(row);}
  for(const r of f.friends){const row=line(r.name+(r.status==='pending'?' · pending':''));if(r.status==='pending'&&r.recipient===user.id)row.append(button('Accept',async()=>{await api.request('/friends/'+r.id,'PATCH',{accept:true});await render();}));if(r.status==='accepted')row.append(button('Invite',async()=>{close();await invite(r.other);}));row.append(button(r.status==='pending'&&r.recipient===user.id?'Decline':'Remove',async()=>{await api.request('/friends/'+r.id,'DELETE');await render();}));row.append(button('Block',async()=>{await api.request('/blocks','POST',{target:r.other});await render();}));row.append(button('Report',async()=>{const reason=globalThis.prompt?.('Reason: abuse, cheating, name, or other','other');if(!reason)return;const detail=globalThis.prompt?.('Describe what happened (up to 500 characters)','');if(detail===null)return;await api.request('/reports','POST',{target:r.other,reason,detail:(detail||'').slice(0,500)});msg('Report received.');}));$('socialFriends').append(row);}
  if(!f.friends.length)$('socialFriends').append(line('Add a friend using their friend code.'));
  for(const r of i.invites){const row=line(r.name+' invited you');row.append(button('Join',async()=>{const accepted=await api.request('/invites/'+r.id,'PATCH',{accept:true});close();await join(accepted.code,accepted.match);}));row.append(button('Decline',async()=>{await api.request('/invites/'+r.id,'PATCH',{accept:false});await render();}));$('socialInvites').append(row);}
  if(!i.invites.length)$('socialInvites').append(line('No invitations right now.'));
  for(const r of l.leaderboard)$('socialBoard').append(line(`${r.name}: ${r.wins} wins / ${r.matches} confirmed matches`));
  if(notifications){const status=notifications.capabilities?{available:notifications.available,enabled:notifications.enabled}:await notifications.load().catch(()=>({available:false,enabled:false}));if(mine!==revision)return;$('inviteNotify').disabled=!status.available;$('inviteNotify').textContent=status.available?(status.enabled?'Disable invite notifications':'Enable invite notifications'):'Invite notifications unavailable on this device';}
 }
 function close(){opened=false;revision++;actionRevision++;clearTimeout(messageTimer);$('socialMsg').textContent='';clearInterval(timer);timer=null;}
 async function open(){opened=true;clearInterval(timer);await run(async()=>{if(api.token){try{const result=await api.request('/me');api.user=result.user;}catch(e){if(e.status===401)await api.logout();else throw e;}}if(api.user?.registered&&notifications){await notifications.load().catch(()=>{});await notifications.sync().catch(()=>{});}await render();});if(opened){timer=setInterval(()=>{if(opened&&!document.hidden)void render().catch(()=>{});},20000);timer.unref?.();}}
 $('accountCreate').onclick=()=>run(async()=>{await api.register($('socialName').value);await render();});$('accountLogin').onclick=()=>run(async()=>{await api.login();await notifications?.sync().catch(()=>{});await render();});
 $('accountCopyCode').onclick=()=>run(async()=>{if(!api.user?.registered)return;if(!globalThis.navigator?.clipboard?.writeText){msg('Friend code: '+api.user.code);return;}await navigator.clipboard.writeText(api.user.code);msg('Friend code copied.');});
 $('accountSaveName').onclick=()=>run(async()=>{const result=await api.request('/me','PATCH',{name:$('socialName').value});api.save({token:api.token,user:result.user});await render();msg('Name saved.');});
 $('accountLogout').onclick=()=>run(async()=>{if(notifications?.enabled)await notifications.disable().catch(()=>{});await api.logout();await render();});
 $('accountDelete').onclick=()=>run(async()=>{if(!globalThis.confirm?.('Delete your account, friends and online match history?'))return;try{await api.request('/me','DELETE',{confirm:true});}catch(e){if(e.status!==403)throw e;msg('Confirm your passkey to delete the account.');await api.login();await api.request('/me','DELETE',{confirm:true});}await notifications?.disable().catch(()=>{});await api.logout();await render();msg('Account deleted.');});
 $('socialRefresh').onclick=()=>run(render);$('socialBack').onclick=()=>{close();onBack();};
 $('friendAdd').onclick=()=>run(async()=>{await api.request('/friends','POST',{code:$('friendCode').value.trim()});await render();msg('Friend request sent.');});
 $('inviteNotify').onclick=()=>run(async()=>{if(notifications.enabled)await notifications.disable();else await notifications.enable();await render();});
 return{open,close,refresh:()=>opened?run(render):Promise.resolve()};
}
