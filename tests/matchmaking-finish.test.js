import test from 'node:test';
import assert from 'node:assert/strict';
import {Matchmaker} from '../js/matchmaking.js';
test('normal scored completion stops queue renewal without reporting a connection error or minting relay credentials',async()=>{
 let cancelled=false,warning=false,relay=false;const service={base:'https://api.test',async request(path){if(path==='/queue/poll')return{state:'finished'};assert.equal(path,'/queue/cancel');cancelled=true;return{ok:true};},async prepareRelay(){relay=true;}};
 const search=new Matchmaker(service,{storage:null,renewMs:1});search.client=crypto.randomUUID();search.onRelay=()=>{};search.renew(search.client,()=>{warning=true;});try{for(let i=0;!cancelled&&i<50;i++)await new Promise(r=>setTimeout(r,2));assert.equal(cancelled,true);assert.equal(search.stopped,true);assert.equal(warning,false);assert.equal(relay,false);}finally{await search.cancel();}
});
