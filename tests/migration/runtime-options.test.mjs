import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {dependency} from './tools.mjs';
import {explicitModules} from './runtime-options.mjs';
import {inventory,sha} from './seal.mjs';

function reserve(){const stat=fs.statfsSync('.');const availableMiB=Math.floor(Number(stat.bavail)*Number(stat.bsize)/1024/1024);assert.ok(availableMiB>=1536,'Tiny Wrangler probe requires1536MiB free; observed'+availableMiB);return availableMiB;}
function pinnedWrangler(){
 for(const root of [process.cwd(),...JSON.parse(process.env.SGPC_TEST_MODULE_ROOTS??'[]')]){
  const folder=path.join(root,'node_modules/wrangler');if(!fs.existsSync(folder+'/package.json'))continue;
  const pkg=JSON.parse(fs.readFileSync(folder+'/package.json'));assert.equal(pkg.version,'4.154.0');
  return {folder,cli:folder+'/bin/wrangler.js',version:pkg.version,sourceSHA256:sha(fs.readFileSync(folder+'/wrangler-dist/cli.js'))};
 }
 throw Error('Existing pinned Wrangler required; no installation allowed');
}

test('genuine pinned Wrangler companion stays sealed while executable modules run unchanged',async()=>{
 const availableMiB=reserve(),wrangler=pinnedWrangler();
 fs.mkdirSync('.migration-artifacts',{recursive:true});
 const directory=fs.mkdtempSync(path.resolve('.migration-artifacts/wrangler-companion-'));
 const worker=directory+'/worker',name='sgpc-companion-probe';let runtime;
 try{
  fs.writeFileSync(directory+'/source.js',`export default {fetch(){return Response.json({synthetic:'sealed module probe'});}};`);
  const config={name,main:'source.js',compatibility_date:'2026-10-30',workers_dev:false,preview_urls:false};
  fs.writeFileSync(directory+'/source-wrangler.json',JSON.stringify(config));
  const networkGuard=directory+'/no-network.cjs',networkAttempts=directory+'/network-attempts.log';
  fs.writeFileSync(networkGuard,`const fs=require('node:fs');const blocked=()=>{fs.appendFileSync(${JSON.stringify(networkAttempts)},'blocked network attempt\\n');throw Error('No network in Wrangler companion proof');};globalThis.fetch=blocked;for(const [name,methods]of [['net',['connect','createConnection']],['tls',['connect']],['http',['request','get']],['https',['request','get']],['dns',['lookup','resolve']]])for(const method of methods)require('node:'+name)[method]=blocked;`);
  const args=[wrangler.cli,'deploy','--dry-run','--config',directory+'/source-wrangler.json','--outdir',worker,'--metafile',directory+'/metafile.json'];
  const child=spawnSync(process.execPath,args,{cwd:directory,encoding:'utf8',env:{PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,CI:'true',XDG_CONFIG_HOME:directory+'/isolated-config',WRANGLER_SEND_METRICS:'false',WRANGLER_SEND_ERROR_REPORTS:'false',WRANGLER_HIDE_BANNER:'true',WRANGLER_NO_SKILLS_UPDATE_PROMPTS:'true',WRANGLER_LOG_PATH:directory+'/wrangler.log',NODE_OPTIONS:'--require '+networkGuard}});
  console.log('SGPC_WRANGLER_DRY_RUN '+JSON.stringify({command:[process.execPath,...args],cwd:directory,exitCode:child.status,stdout:child.stdout,stderr:child.stderr,wrangler,availableMiB,networkRequests:0}));
  assert.equal(child.status,0);assert.equal(fs.existsSync(networkAttempts),false,'Wrangler dry-run must not attempt any network');
  const meta=JSON.parse(fs.readFileSync(directory+'/metafile.json'));
  const emitted=Object.keys(meta.outputs).find(file=>meta.outputs[file].entryPoint&&file.endsWith('.js'));assert.ok(emitted);
  const main=path.resolve(directory,emitted);assert.equal(path.dirname(main),worker);
  fs.writeFileSync(directory+'/runtime-wrangler.json',JSON.stringify({...config,main:path.relative(directory,main)}));
  const manifest=inventory(worker).map(file=>({...file,path:'worker/'+file.path}));
  const companion=manifest.find(file=>file.path==='worker/README.md');assert.ok(companion);
  const readme=fs.readFileSync(worker+'/README.md');
  const options=dependency('wrangler').unstable_getMiniflareWorkerOptions(directory+'/runtime-wrangler.json');
  const executableOptions=()=>explicitModules(options.workerOptions,options.main,worker,{workerName:name,sealedCompanion:companion});
  const modules=executableOptions();assert.ok(modules.modules.every(module=>module.path!==worker+'/README.md'));assert.equal(modules.modules[0].path,main);
  assert.throws(()=>explicitModules(options.workerOptions,options.main,worker),/companion.*sealed manifest/i);
  const mf=dependency('miniflare');reserve();
  const converted=mf.convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,workers:[{...modules,outboundService:()=>{throw Error('Tiny module must not perform external requests');}},...options.externalWorkers]});converted.telemetry={enabled:false,deviceId:'sgpc-companion-probe'};
  runtime=new mf.Miniflare(converted);const origin=String(await runtime.ready);
  assert.deepEqual(await(await fetch(origin)).json(),{synthetic:'sealed module probe'});
  await runtime.dispose();runtime=undefined;
  assert.deepEqual(inventory(worker).map(file=>({...file,path:'worker/'+file.path})),manifest,'all exact output bytes, including companion, remain sealed');
  const altered=Buffer.from(readme);altered[altered.length-2]=altered[altered.length-2]===48?49:48;
  fs.writeFileSync(worker+'/README.md',altered);assert.throws(executableOptions,/companion.*(?:hash|manifest|bytes)/i);fs.writeFileSync(worker+'/README.md',readme);
  const text=readme.toString(),match=text.match(/generated at (.+)\.$/);assert.ok(match);
  const differentTime=new Date(new Date(match[1]).valueOf()+1).toISOString();const changedTimestamp=Buffer.from(text.replace(match[1],differentTime));
  fs.writeFileSync(worker+'/README.md',changedTimestamp);assert.throws(executableOptions,/companion.*(?:hash|manifest|bytes)/i);
  const tampered={...companion,sha256:sha(Buffer.from(text.replace('built output assets','other output assets')))};
  fs.writeFileSync(worker+'/README.md',text.replace('built output assets','other output assets'));assert.throws(()=>explicitModules(options.workerOptions,options.main,worker,{workerName:name,sealedCompanion:tampered}),/companion.*template/i);fs.writeFileSync(worker+'/README.md',readme);
  const malformedISO=Buffer.from(text.replace(match[1],match[1].replace('T',' ')));
  fs.writeFileSync(worker+'/README.md',malformedISO);assert.throws(()=>explicitModules(options.workerOptions,options.main,worker,{workerName:name,sealedCompanion:{...companion,sha256:sha(malformedISO)}}),/companion.*timestamp template/i);fs.writeFileSync(worker+'/README.md',readme);
  assert.throws(()=>explicitModules(options.workerOptions,options.main,worker,{workerName:'different-worker',sealedCompanion:companion}),/companion.*template/i);
  for(const file of ['unknown.md','unknown.sh','unknown.node']){fs.writeFileSync(worker+'/'+file,'unreviewed executable or metadata');assert.throws(executableOptions,/Unknown emitted module type/);fs.unlinkSync(worker+'/'+file);}
  fs.mkdirSync(worker+'/nested');fs.copyFileSync(worker+'/README.md',worker+'/nested/README.md');assert.throws(executableOptions,/Unknown emitted module type/);fs.rmSync(worker+'/nested',{recursive:true});
  fs.renameSync(worker+'/README.md',worker+'/README-renamed.md');assert.throws(executableOptions,/Unknown emitted module type/);fs.renameSync(worker+'/README-renamed.md',worker+'/README.md');
  fs.renameSync(worker+'/README.md',directory+'/missing-readme');assert.throws(executableOptions,/companion.*must exist/i);fs.renameSync(directory+'/missing-readme',worker+'/README.md');
  fs.renameSync(worker+'/README.md',directory+'/saved-readme');fs.symlinkSync(directory+'/saved-readme',worker+'/README.md');assert.throws(executableOptions);fs.unlinkSync(worker+'/README.md');fs.renameSync(directory+'/saved-readme',worker+'/README.md');
  assert.throws(()=>explicitModules({...options.workerOptions,modulesRules:[{type:'Unreviewed'}]},options.main,worker,{workerName:name,sealedCompanion:companion}),/Unsupported module rule/);
  assert.deepEqual(inventory(worker).map(file=>({...file,path:'worker/'+file.path})),manifest,'negative controls restored exact tested bytes');
  console.log('SGPC_WRANGLER_COMPANION_PROOF '+JSON.stringify({wranglerVersion:wrangler.version,companion,readme:readme.toString(),moduleFiles:modules.modules,manifest,genuineMiniflare:true,controls:['missing manifest authorization','post-seal altered bytes','post-seal valid timestamp','tampered template even with matching supplied digest','malformed ISO even with matching supplied digest','wrong configured name','unknown.md','unknown.sh','unknown.node','nested README','renamed README','missing README','symlink README','unsupported module type'],networkRequests:0,providerRequests:0,fullNextProof:false}));
 }finally{if(runtime)await runtime.dispose();fs.rmSync(directory,{recursive:true,force:true});}
});
