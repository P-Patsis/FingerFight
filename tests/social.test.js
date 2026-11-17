import test from 'node:test';
import assert from 'node:assert/strict';
import {installBrowser} from './harness.js';
import {initSocial} from '../js/social.js';
const b=installBrowser('?sim=1'),$=id=>b.byId.get(id);
test('account UI keeps guests optional and joins an invite only after the player presses Join',async()=>{
 const own=crypto.randomUUID(),friend=crypto.randomUUID(),mid=crypto.randomUUID(),iid=crypto.randomUUID();let registered=false,joined=null,deleted=0,auth=0;
 const user=()=>({id:own,name:'Alice',code:'ALICECODE123',registered}),api={token:null,user:null,save(r){this.user=r.user;this.token=r.token;},async register(name){registered=true;this.token='token';this.user={...user(),name};},async login(){auth++;},async logout(){this.token=null;this.user=null;registered=false;},async request(path,method,data){
  if(path==='/me'&&method==='DELETE'){if(!auth){const e=new Error('Confirm passkey');e.status=403;throw e;}deleted++;return{ok:true};}
  if(path==='/me')return{user:user()};if(path==='/friends')return{friends:[]};if(path==='/invites')return{invites:[{id:iid,name:'Bob'}]};if(path==='/blocks')return{blocks:[]};if(path==='/leaderboard')return{leaderboard:[{name:'Alice',wins:1,matches:1}]};if(path==='/invites/'+iid){assert.equal(data.accept,true);return{code:'ABCDEFGHJKLMNPQR',match:mid};}throw new Error(path);
 }};
 const social=initSocial(api,{getName:()=> 'Alice',invite:()=>{},join:async(code,id)=>{joined={code,id};},onBack:()=>{},leaderboards:true});
 try{await social.open();assert.equal($('socialMembers').hidden,true);assert.equal(joined,null);await $('accountCreate').onclick();assert.equal($('socialMembers').hidden,false);assert.equal(joined,null);assert.equal($('socialBoard').children[0].children[0].textContent,'Alice: 1 wins / 1 confirmed matches');
 const row=$('socialInvites').children[0],joinButton=row.children.find(c=>c.textContent==='Join');await joinButton.onclick();assert.deepEqual(joined,{code:'ABCDEFGHJKLMNPQR',id:mid});
 const old=globalThis.confirm;globalThis.confirm=()=>true;try{await $('accountDelete').onclick();}finally{globalThis.confirm=old;}assert.equal(auth,1);assert.equal(deleted,1);assert.equal($('socialMembers').hidden,true);
 }finally{social.close();}
});

test('a push-provider configuration failure does not block account and friend screens',async()=>{
 const user={id:crypto.randomUUID(),name:'Alice',code:'FRIENDCODE12',registered:true},api={token:'token',user,async request(path){if(path==='/me')return{user};if(path==='/friends')return{friends:[]};if(path==='/invites')return{invites:[]};if(path==='/blocks')return{blocks:[]};return{leaderboard:[]};}},notifications={capabilities:null,async load(){throw new Error('Push unavailable');},async sync(){},enabled:false};
 const social=initSocial(api,{getName:()=>user.name,invite(){},join(){},onBack(){},leaderboards:true,notifications});try{await social.open();assert.equal($('socialMembers').hidden,false);assert.equal($('inviteNotify').disabled,true);assert.equal($('socialFriends').children[0].children[0].textContent,'Add a friend using their friend code.');}finally{social.close();}
});
