import test from 'node:test';
import assert from 'node:assert/strict';
import {resultTranscript,submitMatchResult} from '../js/match-results.js';
import {normalizeSettings} from '../js/logic.js';
test('online score records contain only normalized settings and contiguous finger values, never camera pixels',async()=>{
 const settings=normalizeSettings({}),log=[{n:1,reveal:{count:2,noHand:false,photo:'private photo',lm:[1,2]},guessMsg:{guess:2,photo:'other photo'}}],result=resultTranscript(settings,log);assert.deepEqual(result.rounds,[[2,2]]);assert.ok(!JSON.stringify(result).includes('photo'));assert.ok(!JSON.stringify(result).includes('lm'));
 let sent;await submitMatchResult({enabled:true,async request(path,method,data){sent={path,method,data};return{confirmed:true};}},crypto.randomUUID(),settings,log);assert.equal(sent.method,'POST');assert.deepEqual(sent.data,result);assert.throws(()=>resultTranscript(settings,[{...log[0],n:2}]),/Incomplete/);
});

test('reconnect can fill missing score rounds but cannot rewrite locally observed values or exceed finger limits',async()=>{
 const {mergeScoreRounds}=await import('../js/match-results.js'),settings=normalizeSettings({}),known=[[2,3]];
 assert.deepEqual(mergeScoreRounds(known,[[2,3],[4,4]],settings,2),[[2,3],[4,4]]);
 assert.equal(mergeScoreRounds(known,[[1,3],[4,4]],settings,2),known);
 assert.equal(mergeScoreRounds(known,[[2,3],[10,10]],settings,2),known);
 assert.equal(mergeScoreRounds(known,[[2,3],[4,4]],settings,1),known);
 assert.deepEqual(resultTranscript(settings,[[2,3],[4,4]]).rounds,[[2,3],[4,4]]);
});
