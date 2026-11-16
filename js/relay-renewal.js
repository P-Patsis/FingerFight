// Renew TURN allocations on the existing WebRTC channel. Host alone offers, avoiding glare.
// Full gathered SDP travels over that channel; PeerJS's initial-candidate handler may be disabled.
const MAX_SDP=64000;
const valid=d=>d&&d.t==='ice-renew'&&Object.keys(d).every(k=>['t','kind','id','sdp'].includes(k))&&(['request','offer','answer'].includes(d.kind))&&(d.kind==='request'||(typeof d.id==='string'&&/^[a-f0-9-]{36}$/.test(d.id)&&typeof d.sdp==='string'&&d.sdp.startsWith('v=0')&&d.sdp.length<=MAX_SDP));
export class RelayRenewal {
 constructor(current,role){this.current=current;this.role=role;this.pending=false;this.busy=false;this.offer=null;this.epoch=0;}
 currentPC(conn){return this.current()===conn&&conn?.open?conn.peerConnection:null;}
 async gathered(pc){
  if(pc.iceGatheringState==='complete')return;
  await new Promise((resolve,reject)=>{
   const finish=error=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);error?reject(error):resolve();};
   const check=()=>{if(pc.iceGatheringState==='complete')finish();};
   const timer=setTimeout(()=>finish(new Error('ICE gathering timed out')),10000);timer.unref?.();
   pc.addEventListener('icegatheringstatechange',check);check();
  });
 }
 request(){
  const conn=this.current(),pc=this.currentPC(conn);if(!pc?.createOffer)return;
  if(this.role()==='guest'){try{conn.send({t:'ice-renew',kind:'request'});}catch{}return;}
  if(this.role()!=='host')return;
  if(this.busy||this.offer){this.pending=true;return;}
  this.busy=true;const epoch=this.epoch;
  void(async()=>{
   try{
    if(pc.signalingState!=='stable')return;
    const id=crypto.randomUUID(),offer=await pc.createOffer({iceRestart:true});
    if(!this.currentPC(conn))return;
    await pc.setLocalDescription(offer);await this.gathered(pc);if(!this.currentPC(conn))return;
    this.offer={id,conn};this.timer=setTimeout(()=>void this.abort(conn),20000);this.timer.unref?.();
    conn.send({t:'ice-renew',kind:'offer',id,sdp:pc.localDescription.sdp});
   }catch{if(epoch===this.epoch)await this.abort(conn);}finally{if(epoch===this.epoch)this.busy=false;}
  })();
 }
 async abort(conn){
  if(this.current()!==conn)return;
  clearTimeout(this.timer);this.offer=null;this.pending=false;
  const pc=this.currentPC(conn);if(pc?.signalingState==='have-local-offer')try{await pc.setLocalDescription({type:'rollback'});}catch{}
  else if(pc?.signalingState==='have-remote-offer')try{await pc.setRemoteDescription({type:'rollback'});}catch{}
 }
 async receive(d){
  if(!valid(d))return;
  const conn=this.current(),pc=this.currentPC(conn);if(!pc?.setRemoteDescription)return;
  if(d.kind==='request'){if(this.role()==='host')this.request();return;}
  try{
   if(d.kind==='offer'&&this.role()==='guest'&&!this.busy&&pc.signalingState==='stable'){
    this.busy=true;const epoch=this.epoch;
    try{
     await pc.setRemoteDescription({type:'offer',sdp:d.sdp});if(!this.currentPC(conn))return;
     const answer=await pc.createAnswer();if(!this.currentPC(conn))return;
     await pc.setLocalDescription(answer);await this.gathered(pc);if(!this.currentPC(conn))return;
     conn.send({t:'ice-renew',kind:'answer',id:d.id,sdp:pc.localDescription.sdp});
    }finally{if(epoch===this.epoch)this.busy=false;}
   }else if(d.kind==='answer'&&this.role()==='host'&&this.offer?.conn===conn&&this.offer.id===d.id){
    await pc.setRemoteDescription({type:'answer',sdp:d.sdp});if(!this.currentPC(conn))return;
    clearTimeout(this.timer);this.offer=null;
    if(this.pending){this.pending=false;this.request();}
   }
  }catch{await this.abort(conn);}
 }
 close(){this.epoch++;clearTimeout(this.timer);this.offer=null;this.pending=false;this.busy=false;}
}
