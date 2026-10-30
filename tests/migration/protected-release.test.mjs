import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {accountId,workerName,assertTrustedMain,assertProtection,assertArtifacts,recordVerification,prepareUpload,deployRelease} from '../../scripts/protected-release.mjs';
import {checkAccess} from '../../scripts/check-access.mjs';
import {inventory,sha} from './seal.mjs';

const head='a'.repeat(40);
const env={CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'jsbindra00/sgpc-hukamnama-app',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',GITHUB_SHA:head,GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_JOB:'verify',SGPC_PROTECTED_RELEASE_ENABLED:'true',CLOUDFLARE_ACCOUNT_ID:accountId,CLOUDFLARE_API_TOKEN:'synthetic-test-only'};
const context={head,branch:'main',dirty:''};
const source={name:workerName,account_id:accountId,main:'.open-next/worker.js',compatibility_date:'2026-10-30',compatibility_flags:['nodejs_compat'],workers_dev:true,preview_urls:false,assets:{directory:'.open-next/assets',binding:'ASSETS'}};
function protection(){return{schemaVersion:1,enabled:true,accountId,worker:workerName,productionURL:`https://${workerName}.shy-bonus-2f1d.workers.dev`,workerReserved:true,access:{worker:workerName,scope:'all-traffic',applicationId:'12345678-1234-1234-1234-123456789abc',audience:'1'.repeat(64),domain:`${workerName}.shy-bonus-2f1d.workers.dev`,loginHost:'jaspreetsinghb.cloudflareaccess.com',policyIds:['12345678-1234-1234-1234-123456789abd'],ownerEmailSHA256:'2'.repeat(64),exactOwnerEmailOnly:true,bypassPolicies:false,serviceAuthPolicies:false,anonymousDenied:true,ownerLoginVerified:true,rootReviewed:true,evidenceSHA256:'3'.repeat(64)},credential:{worker:workerName,workerOnly:true,rootReviewed:true},authenticatedLiveAcceptanceRequired:true};}
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'sgpc-release-')),sealed=path.join(root,'.migration-artifacts/sealed');
 fs.mkdirSync(sealed+'/worker',{recursive:true});fs.mkdirSync(sealed+'/assets',{recursive:true});fs.mkdirSync(root+'/cloudflare');
 fs.writeFileSync(root+'/wrangler.jsonc',JSON.stringify(source));
 fs.writeFileSync(root+'/cloudflare/protected-release.json',JSON.stringify(protection()));
 fs.writeFileSync(sealed+'/worker/worker.js','export default {fetch(){return new Response("synthetic only")}};\n//# sourceMappingURL=worker.js.map\n');
 fs.writeFileSync(sealed+'/worker/worker.js.map','{}');fs.writeFileSync(sealed+'/worker/README.md','synthetic companion');
 for(let i=0;i<40;i++)fs.writeFileSync(sealed+`/assets/synthetic-${i}.js`,'/* synthetic only */');
 fs.writeFileSync(sealed+'/metafile.json',JSON.stringify({outputs:{'worker/worker.js':{entryPoint:'synthetic.js'}}}));
 const config={name:workerName,main:'worker/worker.js',compatibility_date:'2026-10-30',compatibility_flags:['nodejs_compat'],workers_dev:false,preview_urls:false,assets:{directory:'assets',binding:'ASSETS'}};
 fs.writeFileSync(sealed+'/wrangler.json',JSON.stringify(config));
 const files=inventory(sealed);
 fs.writeFileSync(root+'/.migration-artifacts/sealed-manifest.json',JSON.stringify({entry:config.main,files,metafileSHA256:sha(fs.readFileSync(sealed+'/metafile.json')),uploaded:false}));
 fs.writeFileSync(root+'/.migration-artifacts/ci-evidence.json',JSON.stringify({accepted:true,source:{sourceParserUnchanged:true,parserSHA256:'9a059f30d6b8f966799fdc41039bf5374d230a50aa43726a8d6e650d72f03430'},api:Array(28).fill({}),ui:Array(2).fill({}),concurrentRequests:3,sealedBefore:files,sealedAfter:files,realProviderRequests:0,uploads:0}));
 return{root,sealed,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}

test('trusted main context rejects PR, foreign source, dirty checkout and alternate account',()=>{
 assertTrustedMain({env,...context});
 for(const [key,value] of Object.entries({GITHUB_ACTIONS:'false',CI:'false',GITHUB_REPOSITORY:'other/app',GITHUB_REF:'refs/pull/1/merge',GITHUB_EVENT_NAME:'pull_request',GITHUB_SHA:'b'.repeat(40),CLOUDFLARE_ACCOUNT_ID:'0'.repeat(32),SGPC_PROTECTED_RELEASE_ENABLED:'false',CLOUDFLARE_API_TOKEN:''}))assert.throws(()=>assertTrustedMain({env:{...env,[key]:value},...context}),key);
 assert.throws(()=>assertTrustedMain({env,...context,dirty:' M app/page.tsx'}));
 assert.throws(()=>assertTrustedMain({env,...context,branch:'feature'}));
});
test('committed configuration stays inactive or satisfies root protection; only verified main push can reach the credential',()=>{
 const config=JSON.parse(fs.readFileSync('wrangler.jsonc')),receipt=JSON.parse(fs.readFileSync('cloudflare/protected-release.json'));
 assert.equal(config.account_id,accountId);assert.equal(config.preview_urls,false);
 if(receipt.enabled)assertProtection(receipt,config);
 else{assert.equal(config.workers_dev,false);assert.equal(receipt.enabled,false);}
 const workflow=fs.readFileSync('.github/workflows/cloudflare-verify.yml','utf8');
 assert.equal((workflow.match(/secrets\./g)??[]).length,1);assert.ok(!/pull_request_target|upload-artifact|versions upload|wrangler-action/.test(workflow));
 const release=workflow.slice(workflow.indexOf('- name: Upload exact verified main bytes'));
 for(const condition of ["github.event_name == 'push'","github.repository == 'jsbindra00/sgpc-hukamnama-app'","github.ref == 'refs/heads/main'","vars.SGPC_PROTECTED_RELEASE_ENABLED == 'true'"])assert.ok(release.includes(condition));
 assert.ok(workflow.indexOf('tests/migration/verify-ci.mjs')<workflow.indexOf('scripts/protected-release.mjs record'));assert.ok(workflow.indexOf('scripts/protected-release.mjs record')<workflow.indexOf('secrets.CLOUDFLARE_API_TOKEN'));
});
test('root receipt is per Worker, exact owner and all traffic; inactive receipt cannot authorize',()=>{
 const ready=protection();assertProtection(ready,source);
 for(const change of [r=>r.enabled=false,r=>r.accountId='0'.repeat(32),r=>r.worker='other',r=>r.workerReserved=false,r=>r.access.worker='other',r=>r.access.scope='previews-only',r=>r.access.domain='other.workers.dev',r=>r.access.applicationId=null,r=>r.access.audience=null,r=>r.access.ownerEmailSHA256=null,r=>r.access.policyIds=[],r=>r.access.bypassPolicies=true,r=>r.access.serviceAuthPolicies=true,r=>r.access.anonymousDenied=false,r=>r.access.ownerLoginVerified=false,r=>r.access.rootReviewed=false,r=>r.credential.workerOnly=false,r=>r.credential.worker='other',r=>r.authenticatedLiveAcceptanceRequired=false]){const value=structuredClone(ready);change(value);assert.throws(()=>assertProtection(value,source));}
 assert.throws(()=>assertProtection(ready,{...source,workers_dev:false}));
 assert.throws(()=>assertProtection(ready,{...source,preview_urls:true}));
 assert.throws(()=>assertProtection(ready,{...source,routes:['public.example/*']}));
 assert.throws(()=>assertProtection(ready,{...source,build:{command:'unreviewed'}}));
});
test('complete accepted seal binds same job proof and prepares unchanged standalone upload',()=>{
 const f=fixture();try{
  assert.equal(assertArtifacts(f.root).files.length,45);
  assert.throws(()=>prepareUpload({root:f.root,env,...context}),/verification receipt/);
  recordVerification({root:f.root,env,...context});
  const before=inventory(f.sealed),result=prepareUpload({root:f.root,env,...context});
  assert.deepEqual(inventory(f.sealed),before);
  assert.equal(result.config.no_bundle,true);assert.equal(result.config.find_additional_modules,false);assert.equal(result.config.upload_source_maps,false);assert.equal(result.config.account_id,accountId);assert.equal(result.config.name,workerName);
  assert.equal(path.resolve(path.dirname(result.configPath),result.config.main),f.sealed+'/worker/worker.js');
  assert.equal(path.resolve(path.dirname(result.configPath),result.config.assets.directory),f.sealed+'/assets');
  for(const [key,value] of [['GITHUB_RUN_ID','456'],['GITHUB_RUN_ATTEMPT','2'],['GITHUB_JOB','other']])assert.throws(()=>prepareUpload({root:f.root,env:{...env,[key]:value},...context}),/same job/);
  fs.appendFileSync(f.sealed+'/worker/worker.js','/* changed */');assert.throws(()=>prepareUpload({root:f.root,env,...context}),/sealed/);
 }finally{f.close();}
});
test('missing proof, public maps, unsealed extras and incomplete actual acceptance fail closed',()=>{
 for(const mutate of [f=>fs.writeFileSync(f.sealed+'/assets/debug.map','{}'),f=>fs.writeFileSync(f.sealed+'/worker/extra.js','export {};'),f=>{const p=f.root+'/.migration-artifacts/ci-evidence.json',v=JSON.parse(fs.readFileSync(p));v.accepted=false;fs.writeFileSync(p,JSON.stringify(v));},f=>{const p=f.root+'/.migration-artifacts/ci-evidence.json',v=JSON.parse(fs.readFileSync(p));v.api.pop();fs.writeFileSync(p,JSON.stringify(v));},f=>fs.rmSync(f.root+'/.migration-artifacts/ci-evidence.json')]){const f=fixture();try{mutate(f);assert.throws(()=>assertArtifacts(f.root));}finally{f.close();}}
});
test('upload uses only pinned raw Wrangler and checks protection before and after; denial failure never uploads',async()=>{
 const f=fixture();try{
  recordVerification({root:f.root,env,...context});
  fs.mkdirSync(f.root+'/node_modules/wrangler/bin',{recursive:true});fs.writeFileSync(f.root+'/node_modules/wrangler/package.json',JSON.stringify({version:'4.154.0'}));fs.writeFileSync(f.root+'/node_modules/wrangler/bin/wrangler.js','/* synthetic CLI never executed */');
  const calls=[];
  await deployRelease({root:f.root,env,...context,access:async url=>calls.push(['access',url]),execute:async(exe,args)=>calls.push(['execute',exe,args])});
  assert.deepEqual(calls.map(x=>x[0]),['access','execute','access']);
  assert.deepEqual(calls[1].slice(1),[process.execPath,[f.root+'/node_modules/wrangler/bin/wrangler.js','deploy','--config',f.root+'/.migration-artifacts/release/wrangler.json','--no-autoconfig','--no-bundle']]);
  let uploads=0;await assert.rejects(deployRelease({root:f.root,env,...context,access:async()=>{throw Error('public content');},execute:async()=>uploads++}),/public content/);assert.equal(uploads,0);
  const originalBytes=fs.readFileSync(f.sealed+'/worker/worker.js');await assert.rejects(deployRelease({root:f.root,env,...context,access:async()=>fs.appendFileSync(f.sealed+'/worker/worker.js','/* post-check tamper */'),execute:async()=>uploads++}),/sealed/);assert.equal(uploads,0);fs.writeFileSync(f.sealed+'/worker/worker.js',originalBytes);
  fs.writeFileSync(f.root+'/node_modules/wrangler/package.json',JSON.stringify({version:'4.153.0'}));await assert.rejects(deployRelease({root:f.root,env,...context,access:async()=>{},execute:async()=>uploads++}),/pinned Wrangler/);assert.equal(uploads,0);
 }finally{f.close();}
});

test('genuine pinned raw Wrangler preserves standalone input bytes without module or map discovery',()=>{
 const availableMiB=()=>{const stat=fs.statfsSync('.');return Math.floor(Number(stat.bavail)*Number(stat.bsize)/1024/1024);};
 assert.ok(availableMiB()>=1536,'Tiny dry-run requires at least1536MiB free');
 const roots=[process.cwd(),...JSON.parse(process.env.SGPC_TEST_MODULE_ROOTS??'[]')];
 const folder=roots.map(root=>path.join(root,'node_modules/wrangler')).find(root=>fs.existsSync(root+'/package.json'));assert.ok(folder,'Existing pinned Wrangler required; no installation');
 assert.equal(JSON.parse(fs.readFileSync(folder+'/package.json')).version,'4.154.0');
 const f=fixture();try{
  recordVerification({root:f.root,env,...context});const release=prepareUpload({root:f.root,env,...context});
  const guard=f.root+'/no-network.cjs',attempts=f.root+'/network-attempts.log';
  fs.writeFileSync(guard,`const fs=require('node:fs');const blocked=()=>{fs.appendFileSync(${JSON.stringify(attempts)},'blocked network attempt\\n');throw Error('No network in raw upload dry-run');};globalThis.fetch=blocked;for(const [name,methods]of [['net',['connect','createConnection']],['tls',['connect']],['http',['request','get']],['https',['request','get']],['dns',['lookup','resolve']]])for(const method of methods)require('node:'+name)[method]=blocked;`);
  const before=inventory(f.sealed),out=f.root+'/dry-run';
  const args=[folder+'/bin/wrangler.js','deploy','--config',release.configPath,'--no-autoconfig','--no-bundle','--dry-run','--outdir',out];
  const result=spawnSync(process.execPath,args,{cwd:f.root,encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,CI:'true',XDG_CONFIG_HOME:f.root+'/isolated-config',WRANGLER_SEND_METRICS:'false',WRANGLER_SEND_ERROR_REPORTS:'false',WRANGLER_HIDE_BANNER:'true',CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false',WRANGLER_LOG_PATH:f.root+'/wrangler.log',NODE_OPTIONS:'--require '+guard}});
  console.log('SGPC_RAW_UPLOAD_DRY_RUN '+JSON.stringify({command:[process.execPath,...args],cwd:f.root,exitCode:result.status,stdout:result.stdout,stderr:result.stderr,networkAttempts:fs.existsSync(attempts),genuineWrangler:'4.154.0',fullAppProof:false}));
  assert.equal(result.status,0);assert.equal(fs.existsSync(attempts),false);
  assert.deepEqual(fs.readdirSync(out).sort(),['README.md','worker.js']);
  assert.equal(sha(fs.readFileSync(out+'/worker.js')),sha(fs.readFileSync(f.sealed+'/worker/worker.js')),'No-bundle Worker bytes must match sealed input');
  assert.deepEqual(inventory(f.sealed),before);assert.ok(availableMiB()>=1536);
 }finally{f.close();}
});

async function server(handler,run){const s=createServer(handler);await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));try{await run(`http://127.0.0.1:${s.address().port}`);}finally{s.closeAllConnections();await new Promise(resolve=>s.close(resolve));}}
const login='https://jaspreetsinghb.cloudflareaccess.com/cdn-cgi/access/login/app';
test('anonymous checker covers app, API, RSC and a genuine sealed asset; retries only transient failures',async()=>{
 const seen=new Map();await server((req,res)=>{const n=(seen.get(req.url)||0)+1;seen.set(req.url,n);res.writeHead(n===1?404:302,n===1?{}:{location:login});res.end();},async base=>{
  await checkAccess(base,{assetPath:'/_next/static/chunks/real.js',timeoutMs:300,retryMs:5,allowLoopback:true});
  assert.deepEqual([...seen.keys()],['/','/api/hukamnama','/?_rsc=sgpc-access-check','/_next/static/chunks/real.js']);assert.ok([...seen.values()].every(n=>n===2));
 });
});
test('anonymous public content, foreign redirects and disabled endpoint never count as protection',async()=>{
 for(const [status,location] of [[200,login],[403,null],[302,'https://other.example/cdn-cgi/access/login/app'],[302,'https://jaspreetsinghb.cloudflareaccess.com/wrong'],[302,'http://jaspreetsinghb.cloudflareaccess.com/cdn-cgi/access/login/app']]){let hits=0;await server((req,res)=>{hits++;res.writeHead(status,location?{location}:{});res.end('synthetic');},async base=>{await assert.rejects(checkAccess(base,{assetPath:'/real.js',timeoutMs:100,retryMs:5,allowLoopback:true}));assert.equal(hits,1);});}
 await server((req,res)=>{res.writeHead(404);res.end();},async base=>await assert.rejects(checkAccess(base,{assetPath:'/real.js',timeoutMs:50,retryMs:5,allowLoopback:true}),/Timed out/));
 await server(()=>{},async base=>await assert.rejects(checkAccess(base,{assetPath:'/real.js',timeoutMs:50,retryMs:5,allowLoopback:true}),/Timed out/));
 await assert.rejects(checkAccess('https://other.example',{assetPath:'/real.js'}));
});
test('anonymous checker recovers after an actual connection reset',async()=>{
 let first=true;await server((req,res)=>{if(first){first=false;req.socket.destroy();return;}res.writeHead(302,{location:login});res.end();},async base=>await checkAccess(base,{assetPath:'/real.js',timeoutMs:300,retryMs:5,allowLoopback:true}));
});
