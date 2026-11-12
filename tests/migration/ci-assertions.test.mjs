import assert from 'node:assert/strict';
import test from 'node:test';
import {measureRead,assertTransportCase,assertScriptNegativeControl} from './ci-assertions.mjs';

const errorResponse=()=>({status:500,body:{error:'Failed to fetch Hukamnama'}});
function side(name,mode,{elapsedMs=60000,acquisitions=[{side:name,mode,path:'/',method:'GET',closed:true}]}={}){
 return {side:name,startedAtMs:100,endedAtMs:100+elapsedMs,elapsedMs,response:errorResponse(),acquisitions};
}
function pair(mode){return {original:side('original',mode),candidate:side('candidate',mode)};}
const expected=(title)=>({status:200,body:{date:'30 October 2099',ang:'Ang ੧੨੩',title,lines:[{gurmukhi:'ਅ',translation:'First.'},{gurmukhi:'ਬ',translation:'Second.'}]}});

// These test the actual acceptance assertions, not a Next runtime substitute.
test('transport measurements retain independent start/end times with a virtual clock',async()=>{
 let now=100;const pending=[];
 const read=(name,elapsed)=>measureRead(name,()=>new Promise(resolve=>pending.push({at:now+elapsed,resolve})),()=>now);
 const original=read('original',60000),candidate=read('candidate',1);
 pending.sort((a,b)=>a.at-b.at);
 for(const entry of pending){now=entry.at;entry.resolve(errorResponse());await Promise.resolve();}
 const [a,b]=await Promise.all([original,candidate]);
 assert.deepEqual([a.startedAtMs,a.endedAtMs,a.elapsedMs],[100,60100,60000]);
 assert.deepEqual([b.startedAtMs,b.endedAtMs,b.elapsedMs],[100,101,1]);
});
for(const mode of ['hang-headers','hang-body']){
 test(`${mode}: both bounded deadlines and each side's nonempty closed acquisition pass`,async()=>{
  const input=pair(mode);const result=await assertTransportCase(mode,input);
  assert.equal(result.original.elapsedMs,60000);assert.equal(result.candidate.elapsedMs,60000);
  assert.equal(result.original.acquisitions[0].side,'original');assert.equal(result.candidate.acquisitions[0].side,'candidate');
 });
 for(const name of ['original','candidate']){
  test(`${mode}: reject ${name}'s 1ms generic 500 despite the other side's 60s wait`,async()=>{
   const input=pair(mode);input[name]=side(name,mode,{elapsedMs:1});
   await assert.rejects(async()=>assertTransportCase(mode,input));
  });
  test(`${mode}: reject ${name}'s missing acquisition`,async()=>{
   const input=pair(mode);input[name].acquisitions=[];
   await assert.rejects(async()=>assertTransportCase(mode,input));
  });
  test(`${mode}: reject ${name}'s wrong-side acquisition`,async()=>{
   const input=pair(mode);input[name].acquisitions[0].side=name==='original'?'candidate':'original';
   await assert.rejects(async()=>assertTransportCase(mode,input));
  });
  test(`${mode}: reject ${name}'s socket still open before teardown`,async()=>{
   const input=pair(mode);input[name].acquisitions[0].closed=false;
   await assert.rejects(async()=>assertTransportCase(mode,input));
  });
  test(`${mode}: reject ${name}'s deadline above the bounded window`,async()=>{
   const input=pair(mode);input[name]=side(name,mode,{elapsedMs:70000});
   await assert.rejects(async()=>assertTransportCase(mode,input));
  });
 }
 test(`${mode}: a stale event from another case cannot prove cleanup`,async()=>{
  const input=pair(mode);input.candidate.acquisitions[0].mode='reset';
  await assert.rejects(async()=>assertTransportCase(mode,input));
 });
 test(`${mode}: equal unrelated errors cannot prove timeout behavior`,async()=>{
  const input=pair(mode);input.original.response.body.error='Unrelated';input.candidate.response.body.error='Unrelated';
  await assert.rejects(async()=>assertTransportCase(mode,input));
 });
}
test('script control accepts complete 200 rendered/raw objects with the intended title difference',()=>{
 assertScriptNegativeControl(expected('Rendered synthetic'),expected('Raw synthetic'));
});
for(const name of ['original','candidate']){
 test(`script control rejects ${name}'s unrelated 500`,()=>{
  const input={original:expected('Rendered synthetic'),candidate:expected('Raw synthetic')};input[name]=errorResponse();
  assert.throws(()=>assertScriptNegativeControl(input.original,input.candidate));
 });
 for(const field of ['date','ang','title','lines']){
  test(`script control rejects ${name}'s successful but wrong ${field}`,()=>{
   const input={original:expected('Rendered synthetic'),candidate:expected('Raw synthetic')};input[name].body[field]=field==='lines'?[]:'Unrelated';
   assert.throws(()=>assertScriptNegativeControl(input.original,input.candidate));
  });
 }
}
