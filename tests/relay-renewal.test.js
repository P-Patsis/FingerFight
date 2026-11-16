import test from 'node:test';
import assert from 'node:assert/strict';
import {RelayRenewal} from '../js/relay-renewal.js';
const tick=()=>new Promise(r=>setImmediate(r));
function pair(){
 const pcs=[],conns=[],controls=[];
 for(let i=0;i<2;i++){
  const pc={signalingState:'stable',iceGatheringState:'complete',offers:0,remote:[],
   async createOffer(options){assert.equal(options.iceRestart,true);this.offers++;return{type:'offer',sdp:'v=0\r\no=renewed-host'};},
   async createAnswer(){return{type:'answer',sdp:'v=0\r\no=renewed-guest'};},
   async setLocalDescription(d){this.localDescription=d;this.signalingState=d.type==='offer'?'have-local-offer':'stable';},
   async setRemoteDescription(d){this.remote.push(d);this.signalingState=d.type==='offer'?'have-remote-offer':'stable';}};
  pcs.push(pc);conns.push({open:true,peerConnection:pc,send:d=>void controls[1-i].receive(d)});
 }
 for(let i=0;i<2;i++)controls.push(new RelayRenewal(()=>conns[i],()=>i?'guest':'host'));
 return{pcs,conns,controls,close(){controls.forEach(c=>c.close());}};
}
test('both peers refresh concurrently: host negotiates fresh ICE without closing the data channel',async()=>{
 const s=pair();try{s.controls[0].request();s.controls[1].request();for(let i=0;i<12;i++)await tick();
 assert.ok(s.pcs[0].offers>=1&&s.pcs[0].offers<=2);assert.equal(s.pcs[1].offers,0);
 assert.ok(s.pcs[0].remote.every(d=>d.type==='answer'));assert.ok(s.pcs[1].remote.every(d=>d.type==='offer'));
 assert.equal(s.pcs[0].signalingState,'stable');assert.equal(s.pcs[1].signalingState,'stable');assert.ok(s.conns.every(c=>c.open));assert.equal(s.controls[0].offer,null);
 }finally{s.close();}
});
test('malformed SDP, wrong-role offers and unmatched answers cannot mutate the active connection',async()=>{
 const s=pair(),id=crypto.randomUUID();try{
 await s.controls[0].receive({t:'ice-renew',kind:'offer',id,sdp:'v=0'});
 await s.controls[0].receive({t:'ice-renew',kind:'answer',id,sdp:'v=0'});
 await s.controls[1].receive({t:'ice-renew',kind:'offer',id,sdp:'v=0'+'x'.repeat(64000)});
 await s.controls[1].receive({t:'ice-renew',kind:'offer',id,sdp:'bad'});
 assert.ok(s.pcs.every(pc=>pc.remote.length===0));
 }finally{s.close();}
});
test('a departed connection cannot send an offer after its async gathering finishes',async()=>{
 const s=pair();let finish;try{
 s.pcs[0].createOffer=()=>new Promise(r=>finish=r);let sent=0;s.conns[0].send=()=>sent++;
 s.controls[0].request();s.conns[0].open=false;finish({type:'offer',sdp:'v=0'});await tick();
 assert.equal(sent,0);assert.equal(s.pcs[0].localDescription,undefined);
 }finally{s.close();}
});
