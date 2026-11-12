import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {promote, restore, smoke, productionURL, workerTag} from '../../scripts/public-release.mjs';

const id = value => `11111111-1111-1111-1111-11111111111${value}`;
const worker = 'sgpc-hukamnama-scraper';
const before = {id:id(1), version:id(2)};
const after = {id:id(3), version:id(4)};
const reverted = {id:id(5), version:before.version};
const upload = {type:'version-upload', worker_name:worker, worker_tag:workerTag, version_id:after.version};
const deploy = {type:'version-deploy', worker_name:worker, worker_tag:workerTag, deployment_id:after.id};
const head = 'a'.repeat(40);

function mock({states=[before,before,after], uploadRecord=upload, deployRecord=deploy, stale=false, previewEnabled=false}={}) {
  const calls=[];
  return {
    calls,
    readMain: async () => { calls.push('main'); return stale && calls.filter(x=>x==='main').length===2 ? 'b'.repeat(40) : head; },
    checkIngress: async () => { calls.push('ingress'); assert.ok(!previewEnabled, 'enabled previews'); },
    status: () => { calls.push('status'); return states.shift(); },
    upload: () => { calls.push('upload'); return uploadRecord; },
    deploy: version => { calls.push(version); return deployRecord; },
  };
}

test('stages the exact Worker without a preview URL before promoting the current accepted main', async()=>{
  const ops=mock();
  let observed;
  assert.deepEqual(await promote({head,ops,verifySeal:()=>ops.calls.push('seal'),record:receipt=>{ observed=receipt; }}),
    {previous:before, candidate:after});
  assert.deepEqual(observed,{previous:before,candidate:after});
  assert.deepEqual(ops.calls,['main','ingress','status','seal','upload','main','ingress','status',after.version,'status']);
});

test('preview exposure, wrong Worker, stale main and a concurrent deployment cannot promote', async()=>{
  for(const options of [
    {uploadRecord:{...upload, preview_url:'https://unexpected.workers.dev'}},
    {uploadRecord:{...upload, preview_alias_url:'https://unexpected.workers.dev'}},
    {uploadRecord:{...upload, worker_tag:'incorrect'}},
    {uploadRecord:{...upload, worker_name:'other'}},
    {uploadRecord:{...upload, version_id:'malformed'}},
    {stale:true},
    {previewEnabled:true},
    {states:[before,{id:id(6),version:before.version}]},
  ]){
    const ops=mock(options);
    await assert.rejects(promote({head,ops,verifySeal:()=>{},record:()=>assert.fail('unexpected promotion')}));
    assert.ok(!ops.calls.includes(after.version));
  }
});

test('records the exact promoted deployment before a post-promotion status failure',async()=>{
  const ops=mock({states:[before,before,{id:id(6),version:after.version}]});
  let observed;
  await assert.rejects(promote({head,ops,verifySeal:()=>{},record:receipt=>{ observed=receipt; }}),/active deployment/);
  assert.deepEqual(observed,{previous:before,candidate:after});
});

test('rollback restores the recorded previous version only if this exact deployment still has all traffic', async()=>{
  const receipt={previous:before,candidate:after};
  const ops=mock({states:[after,reverted],deployRecord:{...deploy,deployment_id:reverted.id}});
  assert.equal(restore({receipt,ops}),true);
  assert.deepEqual(ops.calls,['status',before.version,'status']);
  for(const replacement of [{id:id(6),version:after.version},{id:after.id,version:id(6)},null]){
    const changed=mock({states:[replacement]});
    assert.equal(restore({receipt,ops:changed}),false);
    assert.deepEqual(changed.calls,['status']);
  }
  assert.throws(()=>restore({receipt:{...receipt,previous:{...before,version:'bad'}},ops:mock()}));
  assert.throws(()=>restore({receipt,ops:mock({states:[after,after],deployRecord:{...deploy,deployment_id:reverted.id}})}),/restored/);
});

const js='/_next/static/chunks/synthetic.js';
const css='/_next/static/css/synthetic.css';
const assetHash=createHash('sha256').update('synthetic bytes').digest('hex');
const assets=[{url:js,sha256:assetHash},{url:css,sha256:assetHash}];
const apiPayload={date:'Fixture date',ang:'123',title:'Fixture title',lines:[{gurmukhi:'Synthetic line',translation:'Synthetic meaning'}]};
function responder({api=apiPayload,asset='synthetic bytes',redirect=false}={}){
  const seen=[];
  return {seen,fetcher:async(url,options)=>{
    assert.equal(url.origin,productionURL);
    assert.equal(options.redirect,'manual');
    assert.ok(!options.headers?.authorization);
    seen.push([options.method,url.pathname]);
    const path=url.pathname;
    if(path==='/' && options.method==='HEAD') return new Response(null,{status:200});
    if(path==='/') return new Response('Daily Hukamnama',{status:redirect?302:200,headers:{'content-type':'text/html'}});
    if(options.method==='OPTIONS') return new Response(null,{status:204,headers:{allow:'GET, HEAD, OPTIONS'}});
    if(path===js||path===css) return new Response(asset,{headers:{'content-type':path===js?'application/javascript':'text/css'}});
    if(path==='/api/hukamnama') return Response.json(api);
    return new Response(null,{status:404});
  }};
}

test('public smoke checks known app routes and exact static bytes before a single bounded API request',async()=>{
  const {seen,fetcher}=responder();
  await smoke({assets,fetcher,probeMs:10});
  assert.deepEqual(seen.filter(([,path])=>path==='/api/hukamnama'),[['OPTIONS','/api/hukamnama'],['GET','/api/hukamnama']]);
  assert.ok(seen.find(([method,path])=>method==='HEAD'&&path==='/'));
  assert.ok(seen.find(([,path])=>path===js));
  assert.ok(seen.find(([,path])=>path===css));
});

test('wrong asset bytes and redirected home prevent a scrape; a malformed API body fails without retries',async()=>{
  for(const options of [{asset:'wrong build'},{redirect:true}]){
    const {seen,fetcher}=responder(options);
    await assert.rejects(smoke({assets,fetcher,probeMs:10}));
    assert.equal(seen.filter(([method,path])=>method==='GET'&&path==='/api/hukamnama').length,0);
  }
  const {seen,fetcher}=responder({api:{...apiPayload,lines:[]}});
  await assert.rejects(smoke({assets,fetcher,probeMs:10}),/shape/);
  assert.equal(seen.filter(([method,path])=>method==='GET'&&path==='/api/hukamnama').length,1);
});
