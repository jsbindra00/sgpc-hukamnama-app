import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {inventory,sha} from '../tests/migration/seal.mjs';
import {checkAccess} from './check-access.mjs';

export const accountId='4abb2d00cad9a3253e7d65e3eadbacf2';
export const workerName='sgpc-hukamnama-scraper';
const productionURL=`https://${workerName}.shy-bonus-2f1d.workers.dev`;
const parserSHA256='9a059f30d6b8f966799fdc41039bf5374d230a50aa43726a8d6e650d72f03430';
const json=(root,file)=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const hashFile=(root,file)=>sha(fs.readFileSync(path.join(root,file)));
const normalized=value=>JSON.parse(JSON.stringify(value));
function sourceConfig(config){
 assert.deepEqual(normalized({...config,$schema:undefined,workers_dev:false}),{name:workerName,account_id:accountId,main:'.open-next/worker.js',compatibility_date:'2026-10-30',compatibility_flags:['nodejs_compat'],workers_dev:false,preview_urls:false,assets:{directory:'.open-next/assets',binding:'ASSETS'}},'Unexpected source config identity, resource, build or routing override');
 assert.equal(typeof config.workers_dev,'boolean');
}
function jobIdentity(env,head,dirty){
 assert.equal(env.CI,'true');assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_REPOSITORY,'jsbindra00/sgpc-hukamnama-app');
 assert.match(head,/^[a-f0-9]{40}$/);assert.equal(env.GITHUB_SHA,head,'CI source differs from clean HEAD');assert.equal(dirty,'','Dirty source checkout');
 assert.match(env.GITHUB_RUN_ID??'',/^\d+$/);assert.match(env.GITHUB_RUN_ATTEMPT??'',/^\d+$/);assert.match(env.GITHUB_JOB??'',/^[A-Za-z0-9_-]+$/);
 return{sourceHead:head,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,job:env.GITHUB_JOB};
}
export function assertTrustedMain({env,head,branch,dirty}){
 jobIdentity(env,head,dirty);assert.equal(branch,'main');assert.equal(env.GITHUB_REF,'refs/heads/main');assert.equal(env.GITHUB_EVENT_NAME,'push');
 assert.equal(env.SGPC_PROTECTED_RELEASE_ENABLED,'true','Protected automatic release remains disabled');
 assert.equal(env.CLOUDFLARE_ACCOUNT_ID,accountId,'Wrong Cloudflare account');assert.ok(env.CLOUDFLARE_API_TOKEN,'Missing matching Worker-only CI credential');
}
export function assertProtection(receipt,config){
 sourceConfig(config);assert.equal(config.workers_dev,true,'Enable the Worker URL only after root proves Access');
 assert.equal(receipt.schemaVersion,1);assert.equal(receipt.enabled,true,'Root protected release receipt remains disabled');assert.equal(receipt.accountId,accountId);assert.equal(receipt.worker,workerName);assert.equal(receipt.productionURL,productionURL);assert.equal(receipt.workerReserved,true);
 const access=receipt.access;assert.equal(access.worker,workerName);assert.equal(access.scope,'all-traffic');assert.equal(access.domain,new URL(productionURL).hostname);assert.equal(access.loginHost,'jaspreetsinghb.cloudflareaccess.com');
 for(const id of [access.applicationId,...(access.policyIds??[])])assert.match(id??'',/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
 assert.ok(access.policyIds?.length>0);
 for(const hash of [access.audience,access.ownerEmailSHA256,access.evidenceSHA256]){assert.match(hash??'',/^[a-f0-9]{64}$/);assert.notEqual(hash,'0'.repeat(64));}
 for(const flag of ['exactOwnerEmailOnly','anonymousDenied','ownerLoginVerified','rootReviewed'])assert.equal(access[flag],true,'Unproved owner Access: '+flag);
 assert.equal(access.bypassPolicies,false);assert.equal(access.serviceAuthPolicies,false);
 assert.equal(receipt.credential.worker,workerName);assert.equal(receipt.credential.workerOnly,true);assert.equal(receipt.credential.rootReviewed,true);
 assert.equal(receipt.authenticatedLiveAcceptanceRequired,true,'Authenticated post-deployment acceptance is a separate required gate');
}
export function assertArtifacts(root){
 const directory=path.join(root,'.migration-artifacts/sealed'),manifest=json(root,'.migration-artifacts/sealed-manifest.json');
 const files=inventory(directory);assert.deepEqual(files,manifest.files,'Changed or extra sealed files');assert.equal(files.length,45,'Full 45-file acceptance required');
 assert.equal(manifest.uploaded,false);assert.equal(manifest.entry,'worker/worker.js');assert.equal(manifest.metafileSHA256,hashFile(root,'.migration-artifacts/sealed/metafile.json'));
 assert.deepEqual(files.filter(file=>file.path.startsWith('worker/')).map(file=>file.path),['worker/README.md','worker/worker.js','worker/worker.js.map'],'Only the tested standalone Worker can upload');
 assert.ok(files.filter(file=>file.path.startsWith('assets/')).every(file=>!file.path.endsWith('.map')),'Debug source maps cannot enter public assets');
 assert.deepEqual(json(root,'.migration-artifacts/sealed/wrangler.json'),{name:workerName,main:'worker/worker.js',compatibility_date:'2026-10-30',compatibility_flags:['nodejs_compat'],workers_dev:false,preview_urls:false,assets:{directory:'assets',binding:'ASSETS'}},'Changed tested sealed config');
 const proof=json(root,'.migration-artifacts/ci-evidence.json');assert.equal(proof.accepted,true,'Actual full CI acceptance required');assert.equal(proof.api.length,28);assert.equal(proof.ui.length,2);assert.equal(proof.concurrentRequests,3);assert.equal(proof.realProviderRequests,0);assert.equal(proof.uploads,0);
 assert.equal(proof.source.sourceParserUnchanged,true);assert.equal(proof.source.parserSHA256,parserSHA256);
 assert.deepEqual(proof.sealedBefore,files,'Wrong full CI sealed input');assert.deepEqual(proof.sealedAfter,files,'Changed full CI sealed output');
 return{files,manifestSHA256:hashFile(root,'.migration-artifacts/sealed-manifest.json'),evidenceSHA256:hashFile(root,'.migration-artifacts/ci-evidence.json')};
}
export function recordVerification({root,env,head,dirty}){
 const identity=jobIdentity(env,head,dirty),artifacts=assertArtifacts(root);sourceConfig(json(root,'wrangler.jsonc'));
 const receipt={...identity,...artifacts,sourceConfigSHA256:hashFile(root,'wrangler.jsonc')};
 fs.writeFileSync(path.join(root,'.migration-artifacts/verified-release.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}
export function prepareUpload({root,env,head,branch,dirty}){
 assertTrustedMain({env,head,branch,dirty});const config=json(root,'wrangler.jsonc'),protection=json(root,'cloudflare/protected-release.json');assertProtection(protection,config);
 const proofPath=path.join(root,'.migration-artifacts/verified-release.json');assert.ok(fs.existsSync(proofPath),'Missing same-job verification receipt');
 const expected={...jobIdentity(env,head,dirty),...assertArtifacts(root),sourceConfigSHA256:hashFile(root,'wrangler.jsonc')};assert.deepEqual(JSON.parse(fs.readFileSync(proofPath)),expected,'Receipt must match current exact artifacts and same job');
 const upload={name:workerName,account_id:accountId,main:'../sealed/worker/worker.js',compatibility_date:'2026-10-30',compatibility_flags:['nodejs_compat'],workers_dev:true,preview_urls:false,no_bundle:true,find_additional_modules:false,upload_source_maps:false,assets:{directory:'../sealed/assets',binding:'ASSETS'}};
 const configPath=path.join(root,'.migration-artifacts/release/wrangler.json');fs.mkdirSync(path.dirname(configPath),{recursive:true});fs.writeFileSync(configPath,JSON.stringify(upload,null,2)+'\n');
 const asset=expected.files.find(file=>/^assets\/_next\/static\/.+\.(?:js|css|woff2)$/.test(file.path))??expected.files.find(file=>/^assets\/.+\.js$/.test(file.path));assert.ok(asset,'A genuine sealed asset is required for Access verification');
 return{config:upload,configPath,productionURL:protection.productionURL,assetPath:'/'+asset.path.slice('assets/'.length)};
}
function pinnedWrangler(root){const folder=path.join(root,'node_modules/wrangler');assert.equal(json(folder,'package.json').version,'4.154.0','Use pinned Wrangler 4.154.0');const cli=path.join(folder,'bin/wrangler.js');assert.ok(fs.existsSync(cli));return cli;}
async function execute(command,args,{root,env}){
 // Do not inherit token destinations, API-base overrides, dotenv or owner auth.
 const child=spawn(command,args,{cwd:root,stdio:'inherit',env:{PATH:env.PATH,HOME:env.HOME,TMPDIR:env.TMPDIR,CI:'true',CLOUDFLARE_ACCOUNT_ID:accountId,CLOUDFLARE_API_TOKEN:env.CLOUDFLARE_API_TOKEN,CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false',WRANGLER_SEND_METRICS:'false',WRANGLER_SEND_ERROR_REPORTS:'false',WRANGLER_LOG_PATH:path.join(root,'.migration-artifacts/release/wrangler.log')}});
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});assert.equal(code,0,'Pinned raw Wrangler deployment failed');
}
export async function deployRelease({root,env,head,branch,dirty,access=checkAccess,execute:run=execute}){
 const release=prepareUpload({root,env,head,branch,dirty}),cli=pinnedWrangler(root);
 await access(release.productionURL,{assetPath:release.assetPath});
 // Re-read exact full acceptance after network checks, immediately before upload.
 prepareUpload({root,env,head,branch,dirty});
 await run(process.execPath,[cli,'deploy','--config',release.configPath,'--no-autoconfig','--no-bundle'],{root,env});
 assertArtifacts(root);await access(release.productionURL,{assetPath:release.assetPath});
}
function gitContext(root){const git=args=>execFileSync('git',['-C',root,...args],{cwd:root,encoding:'utf8'}).trim();return{head:git(['rev-parse','HEAD']),branch:git(['branch','--show-current']),dirty:git(['status','--porcelain','--untracked-files=all'])};}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const root=process.cwd();assert.equal(process.argv.length,3,'Unexpected release arguments; overrides are forbidden');const context={root,env:process.env,...gitContext(root)};
 if(process.argv[2]==='record'){recordVerification(context);console.log('Current same-job full acceptance receipt recorded; release activation is independent.');}
 else if(process.argv[2]==='deploy'){await deployRelease(context);console.log('Exact verified Worker uploaded; anonymous Access denial checked. Authenticated live acceptance remains required.');}
 else throw Error('Expected record or deploy');
}
