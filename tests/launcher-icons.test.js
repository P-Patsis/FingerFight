import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {decompose,transformPoint,flattenPath,androidColor} from '../tools/icon-geometry.mjs';
const dir='android/app/src/main/java/io/github/ppatsis/fingerfight/',manifest=readFileSync('android/app/src/main/AndroidManifest.xml','utf8');
test('launcher entries are unique, have exactly one install default, and preserve a stable real activity and notification route',()=>{
 const aliases=[...manifest.matchAll(/<activity-alias\b[^>]*>/g)].map(m=>m[0]);assert.equal(aliases.length,48);
 assert.equal(aliases.filter(s=>s.includes('android:enabled="true"')).length,1);
 assert.equal(new Set(aliases.map(s=>s.match(/android:name="([^"]+)"/)[1])).size,48);
 const main=manifest.match(/<activity\b[\s\S]*?<\/activity>/)[0];assert.match(main,/fingerfight.OPEN_INVITES/);assert.match(main,/android.intent.action.VIEW/);assert.doesNotMatch(main,/category.LAUNCHER|android:enabled="false"/);
 for(const alias of aliases){assert.match(alias,/android:targetActivity=".MainActivity"/);const resource=alias.match(/@mipmap\/([^\"]+)/)[1];for(const folder of ['mipmap-anydpi','mipmap-anydpi-v26'])assert.ok(readFileSync(`android/app/src/main/res/${folder}/${resource}.xml`,'utf8').includes('xmlns:android'));}
 assert.match(manifest,/android.permission.BIND_JOB_SERVICE/);assert.doesNotMatch(manifest,/SCHEDULE_EXACT_ALARM|USE_EXACT_ALARM/);
});
test('native icon transforms reproduce the rig including shear/reflection, and path flattening preserves arc endpoints',()=>{
 for(const m of [[1,.4,.7,2,4,7],[-2,.5,.3,1,0,0],[.2,0,0,.3,20,30],[0,-.4,.6,0,54,54]]){
  const d=decompose(m),l=d.left*Math.PI/180,r=d.right*Math.PI/180;
  const c=Math.cos(l),s=Math.sin(l),v=Math.cos(r),w=Math.sin(r),actual=[c*d.sx*v-s*d.sy*w,s*d.sx*v+c*d.sy*w,-c*d.sx*w-s*d.sy*v,-s*d.sx*w+c*d.sy*v,d.tx,d.ty];
  m.forEach((n,i)=>assert.ok(Math.abs(n-actual[i])<1e-8));
 }
 const contours=flattenPath('M 0 0 C 1 0 2 1 2 2 Q 2 3 3 3 A 4 4 30 0 1 7 7 Z');assert.deepEqual(contours[0].at(-1),[0,0]);assert.ok(contours[0].some(p=>Math.hypot(p[0]-7,p[1]-7)<1e-7));
 assert.equal(androidColor('#11223344'),'#44112233');assert.equal(androidColor('none'),'#00000000');assert.deepEqual(transformPoint([1,0,0,1,3,4],[2,5]),[5,9]);
});
test('real Java policy waits an hour and changes both skin and finger count across the whole catalog',()=>{
 const out='.git/icon-policy-test';mkdirSync(out,{recursive:true});
 const harness=`package io.github.ppatsis.fingerfight; import java.util.Random; public class IconPolicyTest { public static void main(String[] args) { long interval=LauncherIconPolicy.INTERVAL_MS; assert interval==3600000L; assert LauncherIconPolicy.due(0,100); assert !LauncherIconPolicy.due(100,100+interval-1); assert LauncherIconPolicy.due(100,100+interval); assert LauncherIconPolicy.due(100,50); assert LauncherIconPolicy.due(100,100+interval-LauncherIconPolicy.FLEX_MS,true); assert !LauncherIconPolicy.due(100,100+interval-LauncherIconPolicy.FLEX_MS-1,true); Random r=new Random(7); boolean[] seen=new boolean[48]; for(int old=0;old<48;old++)for(int i=0;i<200;i++){int n=LauncherIconPolicy.next(old,8,6,r); assert n>=0&&n<48; assert n/6!=old/6; assert n%6!=old%6; seen[n]=true;} for(boolean value:seen)assert value; assert LauncherIconCatalog.NAMES.length==48; assert LauncherIconCatalog.NAMES[LauncherIconCatalog.DEFAULT_INDEX].equals("cartoon_5"); System.out.println("policy passes"); }} `;
 writeFileSync(out+'/IconPolicyTest.java',harness);execFileSync('javac',['-d',out,dir+'LauncherIconPolicy.java',dir+'LauncherIconCatalog.java',out+'/IconPolicyTest.java']);
 assert.match(execFileSync('java',['-Xmx64m','-ea','-cp',out,'io.github.ppatsis.fingerfight.IconPolicyTest'],{encoding:'utf8'}),/policy passes/);
});
