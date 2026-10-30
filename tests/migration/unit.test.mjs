import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {createServer} from 'node:net';
import {dependency} from './tools.mjs';
import {fixtures,card} from './fixtures.mjs';
import {fixtureServer} from './fixture-server.mjs';
import {verifySource,originalAction} from './source-invariants.mjs';
import {stop} from './seal.mjs';
import {probeRuntime} from './probe-runtime.mjs';
import './ci-assertions.test.mjs';
import './checkout-cleanup.test.mjs';
import './runtime-options.test.mjs';
import './fixture-bridge.test.mjs';
import './protected-release.test.mjs';
const esbuild=dependency('esbuild'),cheerio=dependency('cheerio');
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
function reference(html){const referenceModule={exports:{}};const browser={newPage:async()=>({setUserAgent:async()=>{},goto:async()=>{},content:async()=>html}),close:async()=>{}};const code=esbuild.transformSync(originalAction(),{loader:'ts',format:'cjs'}).code;vm.runInNewContext(code,{module:referenceModule,exports:referenceModule.exports,process:{env:{NODE_ENV:'development'}},console:{error(){}},require:name=>{if(name==='cheerio')return cheerio;if(name==='puppeteer')return{launch:async()=>browser};throw Error(name);}});return referenceModule.exports.getHukamnama().then(x=>JSON.parse(JSON.stringify(x)));}

test('approved source/parser/UI invariants',()=>verifySource());
test('actual candidate action and fixed-origin HTTP in genuine workerd',async()=>{
 const fixture=await fixtureServer();fs.mkdirSync('.migration-artifacts/unit',{recursive:true});
 const entry=path.resolve('.migration-artifacts/unit/entry.ts');
 fs.writeFileSync(entry,`import {getHukamnama} from '../../app/api/hukamnama/actions'; export default {async fetch(){try{return Response.json(await getHukamnama());}catch(error){return Response.json({error:error.message},{status:500});}}};`);
 await esbuild.build({entryPoints:[entry],outfile:'.migration-artifacts/unit/worker.js',bundle:true,platform:'browser',format:'esm',conditions:['worker','browser'],target:'es2022',plugins:[{name:'test-only-boundaries',setup(build){build.onResolve({filter:/^server-only$/},()=>({path:'marker',namespace:'marker'}));build.onLoad({filter:/.*/,namespace:'marker'},()=>({contents:'export {};'}));build.onResolve({filter:/^@\//},args=>({path:path.resolve(args.path.slice(2)+'.ts')}));build.onResolve({filter:/^cheerio$/},()=>({path:path.join(path.dirname(dependencyPath('cheerio/package.json')),'dist/browser/index.js')}));}}]});
 const portServer=createServer();await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
 fs.writeFileSync('.migration-artifacts/unit/egress.js',`export default {async fetch(request,env){const url=new URL(request.url);if(url.origin!=='https://hs.sgpc.net'||request.method!=='GET')throw Error('Blocked non-fixture egress');return fetch(env.ORIGIN+url.pathname,{headers:request.headers,signal:request.signal,redirect:'manual'});}};`);
 fs.writeFileSync('.migration-artifacts/unit/runtime.capnp',`using Workerd = import "/workerd/workerd.capnp";const config :Workerd.Config=(services=[(name="main",worker=(modules=[(name="worker.js",esModule=embed "worker.js")],compatibilityDate="2026-10-30",globalOutbound="egress")),(name="egress",worker=(modules=[(name="egress.js",esModule=embed "egress.js")],compatibilityDate="2026-10-30",bindings=[(name="ORIGIN",text="${fixture.origin}")],globalOutbound="loopback")),(name="loopback",network=(allow=["127.0.0.0/8"]))],sockets=[(name="http",address="127.0.0.1:${port}",http=(),service="main")]);`);
 const child=spawn(dependency('workerd').default,['serve',path.resolve('.migration-artifacts/unit/runtime.capnp')],{stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',x=>{logs+=x;});child.stderr.on('data',x=>{logs+=x;});
 const call=()=>fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(5000)});
 try{
  for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error(logs);try{await call();break;}catch{await delay(25);}}
  for(const item of fixtures){fixture.setMode({html:item.html});const r=await call();assert.equal(r.status,200);assert.deepEqual(await r.json(),await reference(item.html),item.name);}
  for(const status of [204,205]){fixture.setMode({status,html:''});const r=await call();assert.equal(r.status,500);assert.deepEqual(await r.json(),{error:'Failed to load Hukamnama'});}
  for(const contentType of ['text/plain; charset=UTF-8','APPLICATION/JSON']){fixture.setMode({contentType,html:card()});const r=await call();assert.deepEqual(await r.json(),{date:'',ang:'',title:'',lines:[]});}
  for(const status of [404,500]){fixture.setMode({status,html:card()});assert.deepEqual(await (await call()).json(),await reference(card()));}
  fixture.setMode('redirect');assert.deepEqual(await (await call()).json(),await reference(card()));
  fixture.setMode('reset');assert.equal((await call()).status,500);
  fixture.setMode({html:card()});const before=fixture.requests.length;await Promise.all([call(),call(),call()]);assert.equal(fixture.requests.length-before,3);
  assert.ok(fixture.requests.every(x=>x.method==='GET'&&x.userAgent===UA));console.log(JSON.stringify({parserFixtures:fixtures.length,statusMIME:true,redirect:true,error:true,concurrency:3,realProviderRequests:0}));
 }finally{await stop(child);await fixture.close();}
});
function dependencyPath(name){for(const base of [process.cwd(),...JSON.parse(process.env.SGPC_TEST_MODULE_ROOTS??'[]')]){const file=path.join(base,'node_modules',name);if(fs.existsSync(file))return file;}throw Error('Missing test package file');}

test('genuine pinned Miniflare options, ASSETS and strict loopback bridge API',async()=>{console.log(JSON.stringify(await probeRuntime()));});
