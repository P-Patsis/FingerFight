import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {effectiveMax,effectiveMin} from '../js/logic.js';
test('lobby settings collapse, arena/music scroll, and actions are under the preview without obsolete toggles',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
 assert.match(html,/<details[^>]*id="settingsCard"[^>]*><summary>Match settings<\/summary>/);assert.doesNotMatch(html,/id="presetPicker"|id="approveBtn"/);assert.match(html,/<span>Arena<\/span><div id="bgPicker" class="bg-picker hrow"/);assert.match(html,/id="musicPicker" class="chips hrow"/);
 const preview=html.indexOf('id="pzRow"'),actions=html.indexOf('id="custOnly"');assert.ok(actions>preview&&actions<html.indexOf('id="looksRow"'));assert.match(css,/\.preview-actions \.btn \{[^}]*min-height:44px/);
});
test('paired limits keep both players on the same cap and exclude zero only at the shrinking floor',()=>{
 const s={maxFingers:5,shrink:true};assert.deepEqual(Array.from({length:12},(_,i)=>effectiveMax(s,i+1)),[5,5,5,5,4,4,3,3,2,2,2,2]);assert.deepEqual([4,5,6,7,8,9,10].map(r=>effectiveMin(s,r)),[0,0,0,0,0,1,1]);assert.equal(effectiveMin({...s,shrink:false},100),0);
});
