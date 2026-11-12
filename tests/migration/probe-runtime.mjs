import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {dependency} from './tools.mjs';
import {fixtureServer} from './fixture-server.mjs';
import {explicitModules} from './runtime-options.mjs';

// A tiny genuine runtime/API probe, not an app build or Next acceptance claim.
export async function probeRuntime(){
 const directory=path.resolve('.migration-artifacts/runtime-probe');fs.mkdirSync(directory+'/assets',{recursive:true});fs.mkdirSync(directory+'/worker',{recursive:true});
 fs.writeFileSync(directory+'/assets/probe.txt','synthetic asset');
 fs.writeFileSync(directory+'/worker/worker.js',`export default {async fetch(request,env){if(new URL(request.url).pathname==='/asset')return env.ASSETS.fetch(new Request('https://assets/probe.txt'));const response=await fetch('https://hs.sgpc.net/');return new Response(await response.text());}};`);
 fs.writeFileSync(directory+'/wrangler.json',JSON.stringify({name:'sgpc-runtime-probe',main:'worker/worker.js',compatibility_date:'2026-10-30',compatibility_flags:['nodejs_compat'],workers_dev:false,preview_urls:false,assets:{directory:'assets',binding:'ASSETS',run_worker_first:true}}));
 process.env.WRANGLER_SEND_METRICS='false';process.env.WRANGLER_LOG_PATH=path.resolve('.migration-artifacts/wrangler.log');const wrangler=dependency('wrangler'),mf=dependency('miniflare');
 const fixture=await fixtureServer();fixture.setMode({html:'synthetic wire'});let instance;
 try{
  const options=wrangler.unstable_getMiniflareWorkerOptions(directory+'/wrangler.json');
  const converted=mf.convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,workers:[{...explicitModules(options.workerOptions,options.main,directory+'/worker'),outboundService:async request=>{
   assert.equal(request.url,'https://hs.sgpc.net/');const response=await fetch(fixture.origin);return new mf.Response(response.body,{status:response.status,headers:response.headers});
  }},...options.externalWorkers]});converted.telemetry={enabled:false,deviceId:'sgpc-synthetic-probe'};
  instance=new mf.Miniflare(converted);const origin=String(await instance.ready);
  assert.equal(await (await fetch(origin)).text(),'synthetic wire');assert.equal(await (await fetch(new URL('/asset',origin))).text(),'synthetic asset');
  assert.equal(fixture.requests.length,1);return {genuineMiniflare:true,assets:true,loopbackWire:true,realProviderRequests:0,nextBuild:false};
 }finally{if(instance)await instance.dispose();await fixture.close();}
}
