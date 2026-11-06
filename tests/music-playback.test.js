import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const started=[],gain=()=>({gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}},connect(){return this;},disconnect(){}});
class AudioContext{
 constructor(){this.currentTime=0;this.state='running';this.destination={};}
 createGain(){return gain();}
 async decodeAudioData(data){assert.equal(Buffer.from(data).subarray(0,4).toString(),'OggS');return{decoded:true};}
 createBufferSource(){return{connect(){return this;},start(){started.push(this);},stop(){},disconnect(){}};}
}
globalThis.window={AudioContext};globalThis.localStorage={getItem:()=>null,setItem(){}};
const {sfx,music,TRACKS}=await import('../js/audio.js');
const files=async url=>new Response(readFileSync(new URL('../'+url,import.meta.url)));
sfx.unlock();
test('each bundled music selection decodes and starts a looping source independently of click sounds',async()=>{
 globalThis.fetch=files;for(let i=0;i<TRACKS.length;i++){await music.setArena(i);assert.equal(started.at(-1).loop,true);assert.ok(started.at(-1).buffer.decoded);}
 assert.equal(started.length,5);music.stop();
});
test('a temporary missing music file during an update retries instead of silencing that song forever',async()=>{
 // A fresh module owns its own decoded-buffer cache.
 const audio=await import('../js/audio.js?retry');audio.sfx.unlock();let attempts=0,clock=1000000;const dateNow=Date.now;Date.now=()=>clock;
 globalThis.fetch=async url=>++attempts===1?new Response('',{status:404}):files(url);
 try{const count=started.length;await audio.music.setArena(0);assert.equal(started.length,count);await audio.music.setArena(0);assert.equal(attempts,1,'bounded retry delay');clock+=15001;await audio.music.setArena(0);assert.equal(attempts,2);assert.equal(started.length,count+1);audio.music.stop();}finally{Date.now=dateNow;}
});
