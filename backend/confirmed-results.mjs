// Leaderboards count recomputed game transcripts only after both participants agree.
import {normalizeSettings,effectiveMin,effectiveMax,pointerFor,other,newIdle,trackIdle,resolveRound,applyResult,newGame} from '../js/logic.js';
import {QueueError} from './matchmaking.mjs';
const q=(db,sql,...p)=>db.prepare(sql).bind(...p);
const need=(v,status,message)=>{if(!v)throw new QueueError(status,message);};
export function evaluateTranscript(data){
 need(data&&Object.keys(data).every(k=>['settings','rounds'].includes(k))&&data.settings&&typeof data.settings==='object'&&!Array.isArray(data.settings)&&Object.keys(data.settings).every(k=>['seconds','hits','maxFingers','background','music','shrink'].includes(k)),400,'Invalid match settings');
 const settings=normalizeSettings(data.settings);need(JSON.stringify(settings)===JSON.stringify(Object.fromEntries(Object.keys(settings).map(k=>[k,data.settings[k]]))),400,'Invalid match settings');
 need(Array.isArray(data.rounds)&&data.rounds.length>0&&data.rounds.length<=500,400,'Invalid match transcript');
 let game=newGame(settings),idle=newIdle();
 for(let i=0;i<data.rounds.length;i++){
  need(!game.over,400,'Transcript continues after the match ended');const n=i+1,pair=data.rounds[i],pointer=pointerFor(n);
  need(Array.isArray(pair)&&pair.length===2&&pair.every(v=>v===null||Number.isInteger(v)&&v>=effectiveMin(settings,n)&&v<=effectiveMax(settings,n)),400,'Invalid round values');
  game=applyResult(game,resolveRound({pointer,count:pair[0]??0,guess:pair[1],noHand:pair[0]===null}));
  const away={host:false,guest:false};away[pointer]=pair[0]===null;away[other(pointer)]=pair[1]===null;const verdict=trackIdle(idle,away);idle=verdict.idle;
  if(verdict.forfeit&&!game.over)game={...game,over:true,winner:other(verdict.forfeit)};
 }
 need(game.over&&game.winner,400,'Only completed matches count');return{settings,rounds:data.rounds,winner:game.winner,health:game.health};
}
export async function confirmedResult(db,m,user,data){
 if(m.state==='done')return{confirmed:true,state:'done',winner:m.winner};
 need(m.state==='active'&&m.created>Math.floor(Date.now()/1000)-86400,409,'Match is not active');
 need(!await q(db,'SELECT 1 FROM turns WHERE match_id=?',m.id).first(),409,'Match already uses round commitments');
 const result=evaluateTranscript(data),canonical=JSON.stringify({settings:result.settings,rounds:result.rounds});
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const old=await q(db,'SELECT digest FROM match_results WHERE match_id=? AND player=?',m.id,user.id).first();need(!old||old.digest===hash,409,'Match result already submitted');
 await db.batch([
  q(db,'INSERT OR IGNORE INTO match_results(match_id,player,digest) VALUES(?,?,?)',m.id,user.id,hash),
  q(db,"UPDATE matches SET state='done',winner=?,hp_host=?,hp_guest=?,settings=?,round=? WHERE id=? AND state='active' AND (SELECT count(*) FROM match_results WHERE match_id=? AND digest=?)=2",result.winner==='host'?m.host:m.guest,result.health.host,result.health.guest,JSON.stringify(result.settings),result.rounds.length+1,m.id,m.id,hash)
 ]);
 const mismatch=await q(db,'SELECT count(DISTINCT digest) n FROM match_results WHERE match_id=?',m.id).first();need(mismatch.n<=1,409,'Players reported different match results');
 const current=await q(db,'SELECT state,winner FROM matches WHERE id=?',m.id).first();return{confirmed:current.state==='done',...current};
}
