import test from 'node:test';
import assert from 'node:assert/strict';
import {scrollSticky,bindStickyScroll} from '../js/panel-scroll.js';
function scene(){const screen={scrollTop:0,scrollHeight:1200,clientHeight:500,getBoundingClientRect:()=>({top:0})},panel={scrollTop:0,scrollHeight:500,clientHeight:300,getBoundingClientRect:()=>({top:Math.max(0,100-screen.scrollTop)})};return{screen,panel};}
test('sticky scrolling moves the screen to the pinned point, then the panel, then the screen below it',()=>{
 const {screen,panel}=scene();scrollSticky(panel,screen,60);assert.equal(screen.scrollTop,60);assert.equal(panel.scrollTop,0);
 scrollSticky(panel,screen,90);assert.equal(screen.scrollTop,100);assert.equal(panel.scrollTop,50);
 scrollSticky(panel,screen,250);assert.equal(panel.scrollTop,200);assert.equal(screen.scrollTop,200);
 scrollSticky(panel,screen,-250);assert.equal(panel.scrollTop,0);assert.equal(screen.scrollTop,150);
 scrollSticky(panel,screen,-500);assert.equal(screen.scrollTop,0);assert.equal(panel.scrollTop,0);
});
test('sticky touch routing preserves horizontal carousels, range controls and native momentum once pinned',()=>{
 const {screen,panel}=scene(),events={};Object.assign(panel,{id:'storeSticky',addEventListener:(n,fn)=>events[n]=fn});bindStickyScroll(panel,screen);
 let prevented=0;const e=(x,y,target={})=>({touches:[{clientX:x,clientY:y}],target,cancelable:true,preventDefault:()=>prevented++});
 events.touchstart(e(0,100));events.touchmove(e(50,95));assert.equal(prevented,0,'horizontal swipe is native');
 events.touchstart(e(0,100));events.touchmove(e(0,40));assert.equal(screen.scrollTop,60);assert.equal(panel.scrollTop,0);
 events.touchend();screen.scrollTop=100;events.touchstart(e(0,100));events.touchmove(e(0,40));assert.equal(prevented,1,'pinned gesture keeps native momentum');
 const control={closest:()=>({})};events.touchstart(e(0,100,control));events.touchmove(e(0,40,control));assert.equal(prevented,1,'colour/size control gestures stay native');
});
