// Only compact finger values reach the score API; never photos, landmarks or cosmetics.
import {effectiveMin,effectiveMax} from './logic.js';
export const MATCH_ID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export function resultTranscript(settings,log){
 if(!Array.isArray(log)||!log.length||log.length>500||log.some((row,i)=>!Array.isArray(row)&&row.n!==i+1))throw new Error('Incomplete match record');
 return{settings:{...settings},rounds:log.map(row=>Array.isArray(row)?[...row]:[row.reveal.noHand?null:row.reveal.count,row.guessMsg.guess])};
}
export async function submitMatchResult(api,id,settings,log){if(!api.enabled||!MATCH_ID.test(id||''))return null;return api.request('/matches/'+id+'/result','POST',resultTranscript(settings,log));}

export function mergeScoreRounds(local,incoming,settings,maxRound){
 if(!Array.isArray(incoming)||incoming.length>500||incoming.length>maxRound||incoming.length<local.length)return local;
 for(let i=0;i<incoming.length;i++){
  const row=incoming[i];if(!Array.isArray(row)||row.length!==2||row.some(v=>v!==null&&(!Number.isInteger(v)||v<effectiveMin(settings,i+1)||v>effectiveMax(settings,i+1))))return local;
  if(local[i]&&(local[i][0]!==row[0]||local[i][1]!==row[1]))return local;
 }
 return incoming.map(row=>[...row]);
}
