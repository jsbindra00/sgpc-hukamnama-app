import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {fixtures} from './fixtures.mjs';

export async function measureRead(side,read,now=()=>performance.now()){
 const startedAtMs=now();
 const response=await read();
 const endedAtMs=now();
 return {side,startedAtMs,endedAtMs,elapsedMs:endedAtMs-startedAtMs,response};
}

export function assertTransportCase(mode,sides){
 assert.deepEqual(sides.candidate.response,sides.original.response,mode);
 for(const name of ['original','candidate']){
  const side=sides[name];
  assert.equal(side.side,name,`${mode}: transport side`);
  assert.ok(Number.isFinite(side.startedAtMs)&&Number.isFinite(side.endedAtMs),`${mode}: ${name} actual start/end times`);
  assert.equal(side.elapsedMs,side.endedAtMs-side.startedAtMs,`${mode}: ${name} elapsed time`);
  if(mode.startsWith('hang')){
   assert.deepEqual(side.response,{status:500,body:{error:'Failed to fetch Hukamnama'}},`${mode}: ${name} original generic error`);
   assert.ok(side.elapsedMs>=59500&&side.elapsedMs<=69000,`${mode}: ${name} acquisition deadline outside59500–69000ms: ${side.elapsedMs}`);
  }
  assert.ok(side.acquisitions.length>0,`${mode}: ${name} must actually acquire its own fixture`);
  for(const event of side.acquisitions){
   assert.equal(event.side,name,`${mode}: ${name} acquisition side`);
   assert.equal(event.mode,mode,`${mode}: ${name} current case acquisition`);
   assert.equal(event.method,'GET',`${mode}: ${name} acquisition method`);
   assert.equal(event.closed,true,`${mode}: ${name} response close must be observed before test teardown`);
  }
 }
 return sides;
}

export function assertScriptNegativeControl(original,candidate){
 const base=fixtures.find(item=>item.name==='fallback-card2').expected;
 const expectedRendered={...base,title:'Rendered synthetic'};
 const expectedRaw={...base,title:'Raw synthetic'};
 assert.deepEqual(original,{status:200,body:expectedRendered},'script control: complete successful rendered original');
 assert.deepEqual(candidate,{status:200,body:expectedRaw},'script control: complete successful raw candidate');
 assert.notDeepEqual(candidate,original,'script control: intended non-execution difference');
}
