import test from 'node:test';
import assert from 'node:assert/strict';
import {DeadlineQueue} from '../js/round-clock.js';
import {initialFavourites} from '../js/preferences.js';
test('overdue round work catches up exactly once and skips cancelled rounds',()=>{
 let now=0,generation=1;const events=[],scheduled=[],queue=new DeadlineQueue({now:()=>now,schedule:fn=>{scheduled.push(fn);return scheduled.length;},cancel(){}});
 queue.after(500,()=>events.push('snap'),()=>generation===1);queue.after(1000,()=>{events.push('next');generation++;},()=>generation===1);queue.after(1200,()=>events.push('stale'),()=>generation===1);
 now=20000;queue.flush();assert.deepEqual(events,['snap','next']);for(const fn of scheduled)fn();assert.deepEqual(events,['snap','next']);assert.equal(queue.jobs.size,0);
});
test('new users get arena and song, while existing choices and intentional silence are retained',()=>{
 const choices=[.8,.4];assert.deepEqual(initialFavourites(()=>null,5,5,()=>choices.shift()),{bg:4,music:2});
 const data={'ff-bg':'3','ff-music':'-1'};assert.deepEqual(initialFavourites(k=>data[k]??null,5,5),{bg:3,music:-1});
});
