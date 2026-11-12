import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {dependency} from './tools.mjs';
import {fixtureBridge} from './fixture-bridge.mjs';
import {fixtureServer} from './fixture-server.mjs';
import {fixtures,card} from './fixtures.mjs';
import {inventory} from './seal.mjs';

test('actual action through full-CI Miniflare bridge preserves reset and empty200',async()=>{
 const disk=fs.statfsSync(process.cwd());assert.ok(disk.bavail*disk.bsize>=1536*1048576,'1536MiB reserve');
 const directory=path.resolve('.migration-artifacts/bridge-probe');fs.mkdirSync(directory,{recursive:true});
 const entry=path.join(directory,'entry.ts'),worker=path.join(directory,'worker.js');
 fs.writeFileSync(entry,`import {getHukamnama} from '../../app/api/hukamnama/actions'; export default {async fetch(request){if(new URL(request.url).pathname==='/wire'){try{const input=new URL(request.url);const r=await fetch(input.searchParams.get('target')??'https://hs.sgpc.net/',{method:input.searchParams.get('method')??'GET',headers:{'x-sgpc-test-source-url':input.searchParams.get('forged')??'https://hs.sgpc.net/'}});return Response.json({status:r.status,type:r.headers.get('content-type'),text:await r.text()});}catch(error){return Response.json({rejected:true,error:error.message});}}try{return Response.json(await getHukamnama());}catch{return Response.json({error:'Failed to fetch Hukamnama'},{status:500});}}};`);
 const roots=[process.cwd(),...JSON.parse(process.env.SGPC_TEST_MODULE_ROOTS??'[]')];
 const cheerio=roots.map(root=>path.join(root,'node_modules/cheerio/dist/browser/index.js')).find(file=>fs.existsSync(file));assert.ok(cheerio);
 await dependency('esbuild').build({entryPoints:[entry],outfile:worker,bundle:true,platform:'browser',format:'esm',conditions:['worker','browser'],target:'es2022',plugins:[{name:'test-boundaries',setup(build){build.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'marker'}));build.onLoad({filter:/.*/,namespace:'marker'},()=>({contents:'export {};'}));build.onResolve({filter:/^@\//},args=>({path:path.resolve(args.path.slice(2)+'.ts')}));build.onResolve({filter:/^cheerio$/},()=>({path:cheerio}));}}]});
 assert.ok(fs.statSync(worker).size<64*1048576);
 const fixture=await fixtureServer(),mf=dependency('miniflare'),outbound=[];
 const bridge=fixtureBridge(fixture.origin,outbound);
 const options=mf.convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,workers:[{name:'sgpc-bridge-probe',modules:[{type:'ESModule',path:worker}],compatibilityDate:'2026-10-30',outboundService:bridge.outboundService},bridge.worker]});options.telemetry={enabled:false,deviceId:'sgpc-bridge-probe'};
 const instance=new mf.Miniflare(options);
 try{
  const origin=String(await instance.ready),read=async(route='/')=>{const r=await fetch(new URL(route,origin),{signal:AbortSignal.timeout(70000)});return{status:r.status,body:await r.json()};};
  console.log('SGPC_BRIDGE_PROOF '+JSON.stringify(bridge.proof));
  fixture.setMode('reset');const wire=await read('/wire'),reset=await read();
  console.log('SGPC_BRIDGE_RESET_TRACE '+JSON.stringify({wire,action:reset,fixture:fixture.requests,outbound}));
  fixture.setMode({html:''});const empty=await read();assert.deepEqual(empty,{status:200,body:fixtures[0].expected});
  console.log('SGPC_BRIDGE_EMPTY_CONTROL '+JSON.stringify(empty));
  assert.deepEqual(reset,{status:500,body:{error:'Failed to fetch Hukamnama'}});
  assert.equal(wire.body.rejected,true);
  assert.equal(fixture.requests.filter(event=>event.mode==='reset').length,2,'one actual reset acquisition per wire/action call, without retries');
  for(let n=0;n<100&&outbound.slice(0,2).some(event=>!event.upstreamSocketClosed||!event.downstreamSocketClosed);n++)await delay(10);
  assert.ok(outbound.slice(0,2).every(event=>event.upstreamSocketClosed&&event.downstreamSocketClosed),'reset closes both actual TCP sockets before teardown');
  assert.ok(outbound.slice(0,2).every(event=>event.transportError==='ECONNRESET'&&event.status===undefined),'real reset, no fabricated HTTP response');
  for(const [target,method] of [['http://hs.sgpc.net/','GET'],['https://example.invalid/','GET'],['https://hs.sgpc.net:444/','GET'],['https://hs.sgpc.net/','POST']]){
   const before=fixture.requests.length;const rejected=await read('/wire?'+new URLSearchParams({target,method,forged:'https://hs.sgpc.net/'}));assert.equal(rejected.body.rejected,true);assert.equal(fixture.requests.length,before);
  }
  fixture.setMode({html:''});const forged=await read('/wire?'+new URLSearchParams({forged:'https://example.invalid/'}));assert.deepEqual(forged.body,{status:200,type:'text/html;charset=UTF-8',text:''});
  console.log('SGPC_BRIDGE_GUARD '+JSON.stringify({blocked:['scheme','host','port','method'],callerHeaderOverwritten:true}));
  for(const entry of [{status:204,html:''},{status:205,html:''},{status:404,html:card()},{status:500,html:card()},{contentType:'text/plain',html:card()},{contentType:'application/json',html:card()}]){
   fixture.setMode(entry);const result=await read();const expected=[204,205].includes(entry.status)?{status:500,body:{error:'Failed to fetch Hukamnama'}}:{status:200,body:entry.contentType?fixtures[0].expected:fixtures[2].expected};assert.deepEqual(result,expected);console.log('SGPC_BRIDGE_HTTP_CONTROL '+JSON.stringify({entry:entry.status??entry.contentType,result}));
  }
  for(const mode of ['redirect','redirect-loop','hang-headers','hang-body']){
   fixture.setMode(mode);const before=fixture.requests.length,bridgeBefore=outbound.length,started=performance.now(),result=await read(),elapsedMs=performance.now()-started;
   assert.deepEqual(result,mode==='redirect'?{status:200,body:fixtures[2].expected}:{status:500,body:{error:'Failed to fetch Hukamnama'}});
   if(mode.startsWith('hang'))assert.ok(elapsedMs>=59500&&elapsedMs<=69000,`${mode}: ${elapsedMs}`);
   for(let n=0;n<100&&(fixture.requests.slice(before).some(event=>!event.closed)||outbound.slice(bridgeBefore).some(event=>!event.upstreamClosed||!event.downstreamClosed||(mode.startsWith('hang')&&(!event.upstreamSocketClosed||!event.downstreamSocketClosed))));n++)await delay(10);
   const acquisitions=fixture.requests.slice(before);assert.ok(acquisitions.length>0);assert.ok(acquisitions.every(event=>event.closed));const bridgeEvents=outbound.slice(bridgeBefore);assert.ok(bridgeEvents.length>0);assert.ok(bridgeEvents.every(event=>event.upstreamClosed&&event.downstreamClosed));if(mode.startsWith('hang'))assert.ok(bridgeEvents.every(event=>event.upstreamSocketClosed&&event.downstreamSocketClosed),'cancellation closes both actual TCP sockets before teardown');
   console.log('SGPC_BRIDGE_TRANSPORT '+JSON.stringify({mode,result,elapsedMs,acquisitions,bridgeEvents}));
  }
 }finally{await instance.dispose();await fixture.close();}
});

test('test-only bridge is excluded from sealed release bytes and paths',()=>{
 fs.mkdirSync('.migration-artifacts',{recursive:true});const directory=fs.mkdtempSync('.migration-artifacts/bridge-release-control-');
 const output=path.join(directory,'worker.js');fs.writeFileSync(output,'export default {};');assert.equal(inventory(directory).length,1);
 for(const marker of ['x-sgpc-test-source-url','sgpc-synthetic-egress']){fs.writeFileSync(output,JSON.stringify(marker));assert.throws(()=>inventory(directory),/test-only fixture bridge/);}
 fs.writeFileSync(output,'export default {};');fs.writeFileSync(path.join(directory,'fixture-bridge.mjs'),'export {};');assert.throws(()=>inventory(directory),/test-only fixture bridge/);
});
