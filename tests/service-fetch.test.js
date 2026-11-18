import test from 'node:test';
import assert from 'node:assert/strict';
import {Service} from '../js/service.js';

for(const injected of [false,true])test(`account signup and private relay preserve the browser fetch receiver (${injected?'injected':'default'} transport)`,async()=>{
 const original=globalThis.fetch,calls=[];let registered=false;
 // Browser fetch accepts the Window/global receiver and a bare call, but not a Service instance.
 const browserFetch=async function(url,options){
  if(this!==globalThis&&this!==undefined)throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
  const path=new URL(url).pathname;calls.push(path);
  const user={id:'player',registered,name:'Alice'};
  if(path==='/auth/guest')return Response.json({token:'guest',user});
  if(path==='/auth/register/options')return Response.json({id:'challenge',options:{challenge:'AA',user:{id:'AA',name:'Alice'}}});
  if(path==='/auth/register/verify'){assert.equal(options.headers.Authorization,'Bearer guest');registered=true;return Response.json({token:'account',user:{...user,registered:true}});}
  assert.equal(options.headers.Authorization,'Bearer account');
  if(path==='/me')return Response.json({user});
  if(path==='/rtc/config')return Response.json({expires:Math.floor(Date.now()/1000)+600,iceServers:[{urls:'turns:relay.test:443',username:'temporary',credential:'temporary'}]});
  throw new Error('Unexpected API request '+path);
 };
 globalThis.fetch=browserFetch;
 try{
  const api=new Service('https://api.test',{storage:null,credentials:{async create(){return{toJSON:()=>({id:'credential'})};}},...(injected?{fetch:browserFetch}:{})});
  await api.register('Alice');assert.equal(api.user.registered,true);
  await api.ensurePlayer('Alice');const ice=await api.prepareRelay();assert.equal(ice[0].urls,'turns:relay.test:443');
  assert.deepEqual(calls,['/auth/guest','/auth/register/options','/auth/register/verify','/me','/rtc/config']);
 }finally{globalThis.fetch=original;}
});
