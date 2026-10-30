import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {dependency} from './tools.mjs';
import {fixtureServer} from './fixture-server.mjs';
import {fixtureBridge} from './fixture-bridge.mjs';
import {fixtures,card} from './fixtures.mjs';
import {verifySource} from './source-invariants.mjs';
import {seal,inventory,sha,stop} from './seal.mjs';
import {explicitModules} from './runtime-options.mjs';
import {measureRead,assertTransportCase,assertScriptNegativeControl} from './ci-assertions.mjs';
assert.equal(process.env.CI,'true','Genuine full integration is reserved for reviewed Linux CI');
assert.equal(process.platform,'linux','Full acceptance requires the actual reviewed Linux CI execution');
const source=verifySource();const sealed=await seal();
// Separate listeners make fixture acquisition/close evidence attributable to
// the transport that opened it, without changing either production request.
const sideFixtures={original:await fixtureServer(),candidate:await fixtureServer()};
function setMode(value){for(const fixture of Object.values(sideFixtures))fixture.setMode(value);}
const {folder:baseline}=JSON.parse(fs.readFileSync('.migration-artifacts/baseline-location.json'));
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const originalOrigin=`http://127.0.0.1:${port}`;
const original=spawn(process.execPath,[path.join(baseline,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{cwd:baseline,env:{...process.env,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:'--require '+path.resolve('tests/migration/original-browser-preload.cjs'),SGPC_TEST_FIXTURE_ORIGIN:sideFixtures.original.origin},stdio:['ignore','pipe','pipe']});
let originalLog='';original.stdout.on('data',x=>{originalLog+=x;});original.stderr.on('data',x=>{originalLog+=x;});
process.env.WRANGLER_SEND_METRICS='false';process.env.WRANGLER_LOG_PATH=path.resolve('.migration-artifacts/wrangler.log');
const mf=dependency('miniflare'),wrangler=dependency('wrangler');
let candidate,browser;const evidence={source,api:[],ui:[],sealedBefore:sealed.files,realProviderRequests:0,uploads:0};
try{
const options=wrangler.unstable_getMiniflareWorkerOptions(path.join(sealed.directory,'wrangler.json'));
const workerName=JSON.parse(fs.readFileSync(path.join(sealed.directory,'wrangler.json'))).name;
const sealedCompanion=sealed.files.find(file=>file.path==='worker/README.md');assert.ok(sealedCompanion,'Pinned Wrangler companion must remain in the complete sealed manifest');
const outbound=[];
const bridge=fixtureBridge(sideFixtures.candidate.origin,outbound);evidence.fixtureBridge=bridge.proof;
const converted=mf.convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,workers:[{...explicitModules(options.workerOptions,options.main,sealed.directory+'/worker',{workerName,sealedCompanion}),outboundService:bridge.outboundService},bridge.worker,...options.externalWorkers]});
converted.telemetry={enabled:false,deviceId:'sgpc-synthetic-ci'};
candidate=new mf.Miniflare(converted);
async function read(origin){const response=await fetch(origin+'/api/hukamnama',{signal:AbortSignal.timeout(70000)});return{status:response.status,body:await response.json()};}
async function waitOriginal(){for(let n=0;n<100;n++){if(original.exitCode!==null)throw Error(originalLog);try{const r=await fetch(originalOrigin);if(r.status===200)return;}catch{}await delay(100);}throw Error('Original Next readiness timeout');}
 await waitOriginal();const candidateOrigin=String(await candidate.ready).replace(/\/$/,'');
 for(const item of fixtures){setMode({html:item.html});const [a,b]=await Promise.all([read(originalOrigin),read(candidateOrigin)]);if(item.expectsRenderingDifference)assertScriptNegativeControl(a,b);else assert.deepEqual(b,a,item.name);evidence.api.push({name:item.name,equal:JSON.stringify(a)===JSON.stringify(b),expectedScriptNonEquivalence:!!item.expectsRenderingDifference,original:a,candidate:b});}
 for(const entry of [{status:204,html:''},{status:205,html:''},{contentType:'text/plain',html:card()},{contentType:'application/json',html:JSON.stringify({synthetic:'<div class=hukamnama-card><div class=hukamnama-title>Synthetic</div><div class=hukamnama-text>ਅ ॥੧॥</div></div>'})},{status:404,html:card()},{status:500,html:card()}]){setMode(entry);const [a,b]=await Promise.all([read(originalOrigin),read(candidateOrigin)]);assert.deepEqual(b,a);evidence.api.push({name:'status-or-MIME',fixture:entry.status??entry.contentType,original:a,candidate:b});}
 for(const mode of ['redirect','redirect-loop','reset','hang-headers','hang-body']){
  setMode(mode);
  const bridgeBefore=outbound.length;
  const before=Object.fromEntries(Object.entries(sideFixtures).map(([name,fixture])=>[name,fixture.requests.length]));
  const [a,b]=await Promise.all([measureRead('original',()=>read(originalOrigin)),measureRead('candidate',()=>read(candidateOrigin))]);
  const events=name=>sideFixtures[name].requests.slice(before[name]);
  for(let n=0;n<100&&(Object.keys(sideFixtures).some(name=>events(name).some(event=>!event.closed))||outbound.slice(bridgeBefore).some(event=>!event.upstreamClosed||!event.downstreamClosed||((mode==='reset'||mode.startsWith('hang'))&&(!event.upstreamSocketClosed||!event.downstreamSocketClosed))));n++)await delay(10);
  const sides={original:a,candidate:b};
  // Snapshot actual response-close observations while both fixture servers and
  // runtime processes remain alive. finally/fixture.close cannot satisfy this.
  for(const name of Object.keys(sides))sides[name].acquisitions=events(name).map(event=>({...event,side:name}));
  assertTransportCase(mode,sides);
  const bridgeEvents=outbound.slice(bridgeBefore);assert.ok(bridgeEvents.length>0);assert.ok(bridgeEvents.every(event=>event.upstreamClosed&&event.downstreamClosed),'both bridge response legs close before teardown');
  if(mode==='reset'||mode.startsWith('hang'))assert.ok(bridgeEvents.every(event=>event.upstreamSocketClosed&&event.downstreamSocketClosed),'both actual TCP sockets close before teardown');
  evidence.api.push({name:mode,original:a.response,candidate:b.response,transports:sides,bridgeEvents,socketsClosedBeforeTeardown:true});
 }
 setMode({html:card()});const before=sideFixtures.candidate.requests.length;const concurrent=await Promise.all(Array.from({length:3},()=>read(candidateOrigin)));assert.ok(concurrent.every(x=>JSON.stringify(x)===JSON.stringify(concurrent[0])));assert.equal(sideFixtures.candidate.requests.length-before,3);evidence.concurrentRequests=3;
 const puppeteer=dependency('puppeteer-core');const executable=process.env.SGPC_TEST_CHROME;assert.ok(executable&&fs.existsSync(executable),'Use preinstalled Chrome; no silent browser download');
 browser=await puppeteer.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-background-networking','--disable-sync']});
 for(const origin of [originalOrigin,candidateOrigin]){
  setMode({html:card(),delayMs:600});const page=await browser.newPage();const actions=[],fonts=[];
  await page.setRequestInterception(true);page.on('request',request=>{const local=new URL(request.url()).origin===origin;const allowed=local&&(['GET','HEAD'].includes(request.method())||(request.method()==='POST'&&!!request.headers()['next-action']));(allowed?request.continue():request.abort('blockedbyclient')).catch(()=>{});});
  page.on('response',response=>{if(response.request().method()==='POST'&&response.request().headers()['next-action'])actions.push({status:response.status(),contentType:response.headers()['content-type'],idHash:sha(response.request().headers()['next-action'])});if(/\.woff2(?:\?|$)/.test(response.url()))fonts.push({status:response.status(),path:new URL(response.url()).pathname});});
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForSelector('[data-slot="skeleton"]',{timeout:10000});
  assert.equal(await page.$$eval('[data-slot="skeleton"]',nodes=>nodes.length),12,'original five-row skeleton and two heading placeholders');
  await page.waitForFunction(()=>document.body.innerText.includes('Synthetic Title'),{timeout:30000});
  assert.ok(actions.length>0,'actual React Query must invoke genuine Next-Action transport');assert.ok(actions.every(x=>x.contentType?.includes('text/x-component')));
  const rendered=await page.evaluate(()=>({title:document.querySelector('[data-slot="card-title"]').textContent,date:document.querySelector('[data-slot="card-description"]').textContent,ang:document.querySelector('[data-slot="card-header"] > p').textContent,lines:[...document.querySelectorAll('[data-slot="card-content"] p')].map(node=>node.textContent)}));
  const expected=fixtures.find(item=>item.name==='fallback-card2').expected;assert.deepEqual(rendered,{title:expected.title,date:expected.date,ang:expected.ang,lines:expected.lines.flatMap(line=>[line.gurmukhi,line.translation])});
  await page.evaluate(async()=>{await document.fonts.ready;const mono=document.createElement('span');mono.textContent='Synthetic font';mono.style.fontFamily='var(--font-geist-mono)';document.body.append(mono);await document.fonts.load('12px '+getComputedStyle(mono).fontFamily);mono.remove();});
  const fontVars=await page.evaluate(()=>{const style=getComputedStyle(document.body);return{sans:style.getPropertyValue('--font-geist-sans'),mono:style.getPropertyValue('--font-geist-mono')};});assert.ok(fontVars.sans&&fontVars.mono);assert.ok(fonts.every(x=>x.status===200||x.status===304));assert.ok(fonts.length>=2,'both original font assets load');
  const beforeError=actions.length;setMode({status:205,html:''});await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.innerText.includes('Error loading Hukamnama. Please try again later.'),{timeout:30000});assert.ok(actions.length-beforeError>=4,'existing automatic retry behavior must execute real actions');
  evidence.ui.push({origin:origin===originalOrigin?'original':'candidate',skeleton:true,success:true,error:true,rendered,actualServerActions:actions,fontVariables:fontVars,fontAssets:fonts});await page.close();
 }
 assert.ok(Object.values(sideFixtures).every(fixture=>fixture.requests.every(x=>x.method==='GET'&&x.userAgent==='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')));
 const after=inventory(sealed.directory);assert.deepEqual(after,sealed.files,'tested exact complete Worker/assets bytes must remain sealed');evidence.sealedAfter=after;evidence.outbound=outbound;evidence.accepted=true;
 fs.writeFileSync('.migration-artifacts/ci-evidence.json',JSON.stringify(evidence,null,2));
 for(const entry of evidence.api)console.log('SGPC_CI_API '+JSON.stringify(entry));
 for(const entry of evidence.ui)console.log('SGPC_CI_UI '+JSON.stringify(entry));
 for(const file of after)console.log('SGPC_CI_SEALED_FILE '+JSON.stringify(file));
 console.log('SGPC_CI_BRIDGE '+JSON.stringify(bridge.proof));
 console.log('SGPC_CI_ACCEPTANCE '+JSON.stringify({accepted:true,source,apiCases:evidence.api.length,uiReferences:evidence.ui.length,concurrentRequests:3,originalNext:'16.0.10',candidateNext:'16.4.3',sealedFileCount:after.length,sealedBeforeSHA256:sha(JSON.stringify(sealed.files)),sealedAfterSHA256:sha(JSON.stringify(after)),outboundRequestCount:outbound.length,realProviderRequests:0,uploads:0}));
}catch(error){console.error('CI_VERIFICATION_FAILED '+error.message);console.error('ORIGINAL_NEXT_DIAGNOSTICS '+originalLog);throw error;}
finally{try{if(browser)await browser.close();}finally{try{if(candidate)await candidate.dispose();}finally{try{await stop(original);}finally{for(const fixture of Object.values(sideFixtures))await fixture.close();}}}}
