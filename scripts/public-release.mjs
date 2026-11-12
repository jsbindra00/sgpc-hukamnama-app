import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {sha} from '../tests/migration/seal.mjs';
import {accountId, assertTrustedMain, gitContext, pinnedWrangler, verifiedArtifacts, workerName} from './protected-release.mjs';

export const productionURL = `https://${workerName}.shy-bonus-2f1d.workers.dev`;
export const workerTag = 'f7fe5de564604f75be3e892e356a4bce';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const activeIs = (active, expected) => active?.id === expected.id && active?.version === expected.version;
const validDeployment = value => uuid.test(value?.id) && uuid.test(value?.version);
const uploadConfig = {
  name:workerName, account_id:accountId, main:'../sealed/worker/worker.js',
  compatibility_date:'2026-10-30', compatibility_flags:['nodejs_compat'],
  workers_dev:true, preview_urls:false, no_bundle:true, find_additional_modules:false,
  upload_source_maps:false, assets:{directory:'../sealed/assets',binding:'ASSETS'},
};

function versionRecord(record, type, idField) {
  assert.equal(record?.type, type, 'Missing Wrangler version receipt');
  assert.equal(record.worker_name, workerName, 'Wrong Worker name');
  assert.equal(record.worker_tag, workerTag, 'Wrong immutable Worker identity');
  assert.match(record[idField] ?? '', uuid, 'Invalid Cloudflare version or deployment ID');
  assert.ok(!record.preview_url && !record.preview_alias_url, 'A version URL was reported');
  return record[idField];
}

export async function promote({head, ops, verifySeal, record}) {
  assert.equal(await ops.readMain(), head, 'This commit is no longer current main');
  await ops.checkIngress();
  const previous = ops.status();
  assert.ok(validDeployment(previous), 'Expected one existing deployment at 100%');
  verifySeal();
  const version = versionRecord(ops.upload(), 'version-upload', 'version_id');
  assert.notEqual(version, previous.version, 'The uploaded version must be new');
  assert.equal(await ops.readMain(), head, 'Main changed during upload. Promotion skipped.');
  await ops.checkIngress();
  assert.ok(activeIs(ops.status(), previous), 'The active deployment changed during upload. Promotion skipped.');
  const id = versionRecord(ops.deploy(version), 'version-deploy', 'deployment_id');
  const receipt = {previous, candidate:{id, version}};
  record(receipt);
  assert.ok(activeIs(ops.status(), receipt.candidate), 'Could not confirm the candidate as the sole active deployment');
  return receipt;
}

export function restore({receipt, ops}) {
  const {previous, candidate} = receipt;
  assert.ok(validDeployment(previous) && validDeployment(candidate), 'Rollback requires exact version and deployment IDs');
  assert.notEqual(previous.version, candidate.version);
  if (!activeIs(ops.status(), candidate)) return false;
  const id = versionRecord(ops.deploy(previous.version, 'Rollback after failed SGPC release'), 'version-deploy', 'deployment_id');
  assert.ok(activeIs(ops.status(), {id, version:previous.version}), 'Could not confirm the restored deployment at 100%');
  return true;
}

function deploymentAssets(files) {
  return ['js','css'].map(extension=>{
    const file = files.find(item=>item.path.startsWith('assets/_next/static/') && item.path.endsWith('.'+extension));
    assert.ok(file, `Missing accepted static ${extension} asset`);
    return {url:file.path.slice('assets'.length), sha256:file.sha256};
  });
}

export async function smoke({assets, fetcher=fetch, probeMs=45_000}) {
  const request = (pathname, method, timeout) => fetcher(new URL(pathname, productionURL), {
    method, redirect:'manual', cache:'no-store', signal:AbortSignal.timeout(timeout),
  });
  const mediaType = response => response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  async function probe({pathname, method='GET', status, verify=()=>true}) {
    const deadline = Date.now()+probeMs;
    do {
      let response;
      try {
        response = await request(pathname, method, Math.max(1, Math.min(6_000, deadline-Date.now())));
        if (response.status===status && await verify(response)) return;
      } catch {
        // The new deployment may still be propagating.
      } finally {
        await response?.body?.cancel().catch(()=>{});
      }
      if (Date.now()<deadline) await delay(Math.min(1000, Math.max(1, deadline-Date.now())));
    } while (Date.now()<deadline);
    throw Error(`Public ${method} ${pathname} failed verification`);
  }
  await Promise.all([
    probe({pathname:'/',status:200,verify:async response=>mediaType(response)==='text/html' && (await response.text()).includes('Daily Hukamnama')}),
    probe({pathname:'/',method:'HEAD',status:200}),
    probe({pathname:'/api/hukamnama',method:'OPTIONS',status:204,verify:response=>/\bGET\b/.test(response.headers.get('allow')??'')}),
    probe({pathname:'/__sgpc_release_smoke_missing__',status:404}),
    ...assets.map(asset=>probe({pathname:asset.url,status:200,verify:async response=>{
      const type = asset.url.endsWith('.css') ? /^text\/css$/ : /^(?:application|text)\/javascript$/;
      return type.test(mediaType(response)) && sha(Buffer.from(await response.arrayBuffer()))===asset.sha256;
    }})),
  ]);
  // The endpoint makes one live SGPC request. Keep it out of propagation retries.
  const response = await request('/api/hukamnama','GET',70_000);
  try {
    assert.equal(response.status,200,'Public Hukamnama API did not return HTTP 200');
    assert.equal(mediaType(response),'application/json','Public Hukamnama API did not return JSON');
    const payload = await response.json().catch(()=>{
      throw Error('Public Hukamnama API returned malformed JSON');
    });
    const hasText = value => typeof value==='string' && value.trim().length>0;
    assert.ok(payload && typeof payload==='object' &&
      Object.keys(payload).sort().join(',')==='ang,date,lines,title' &&
      [payload.ang,payload.date,payload.title].every(hasText) &&
      Array.isArray(payload.lines) && payload.lines.length>0 &&
      payload.lines.every(line=>line && Object.keys(line).sort().join(',')==='gurmukhi,translation' &&
        hasText(line.gurmukhi) && typeof line.translation==='string'),
    'Unexpected public Hukamnama JSON shape');
  } finally {
    await response.body?.cancel().catch(()=>{});
  }
}

function opsFor({root, env, head}, configPath, outputPath) {
  const cli = pinnedWrangler(root);
  const command = (args, output) => {
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath,'utf8')),uploadConfig,'Release config changed');
    if (output && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    const result = spawnSync(process.execPath,[cli,...args,'--config',configPath],{
      cwd:root, encoding:'utf8', timeout:120_000, maxBuffer:4*1024*1024,
      env:{
        PATH:env.PATH, HOME:env.HOME, TMPDIR:env.TMPDIR, CI:'true',
        CLOUDFLARE_ACCOUNT_ID:accountId, CLOUDFLARE_API_TOKEN:env.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV:'false', WRANGLER_SEND_METRICS:'false',
        WRANGLER_SEND_ERROR_REPORTS:'false', WRANGLER_LOG_PATH:path.join(path.dirname(configPath),'wrangler.log'),
        ...(output ? {WRANGLER_OUTPUT_FILE_PATH:outputPath} : {}),
      },
    });
    assert.equal(result.status,0,`Pinned Wrangler ${args[0]} ${args[1]??''} failed`);
    if (!output) return JSON.parse(result.stdout);
    const events = fs.readFileSync(outputPath,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    const matches = events.filter(event=>event.type===output);
    assert.equal(matches.length,1,`Expected exactly one ${output} receipt`);
    return matches[0];
  };
  const getJSON = async (url, token) => {
    assert.ok(token,'Missing required CI credential');
    const response = await fetch(url,{
      headers:{authorization:`Bearer ${token}`,accept:'application/json'},
      redirect:'error', signal:AbortSignal.timeout(20_000),
    });
    assert.ok(response.ok,`Read-only release check returned HTTP ${response.status}`);
    return response.json();
  };
  return {
    readMain:async()=>{
      const ref = await getJSON('https://api.github.com/repos/jsbindra00/sgpc-hukamnama-app/git/ref/heads/main',env.GH_TOKEN);
      return ref.object?.sha;
    },
    checkIngress:async()=>{
      const data = await getJSON(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`,env.CLOUDFLARE_API_TOKEN);
      assert.ok(data.success===true && data.result?.enabled===true && data.result?.previews_enabled===false,
        'Canonical workers.dev ingress must be enabled and version URLs disabled');
    },
    status:()=>{
      const result = command(['deployments','status','--json']);
      if (result.versions?.length!==1 || result.versions[0].percentage!==100) return null;
      return {id:result.id, version:result.versions[0].version_id};
    },
    upload:()=>command(['versions','upload','--strict','--keep-vars','--no-bundle','--no-upload-source-maps','--tag',head],'version-upload'),
    deploy:(version,message)=>command(['versions','deploy','--yes',`${version}@100%`,...(message?['--message',message]:[])],'version-deploy'),
  };
}

async function main() {
  assert.equal(process.argv.length,3,'Expected one release mode');
  const mode = process.argv[2];
  assert.ok(['promote','smoke','rollback'].includes(mode),'Unknown release mode');
  const root = process.cwd();
  const env = process.env;
  const context = {root,env,...gitContext(root)};
  const release = path.join(root,'.migration-artifacts/public-release');
  const configPath = path.join(release,'wrangler.json');
  const promotionPath = path.join(release,'promotion.json');
  if (mode==='smoke') {
    const accepted = verifiedArtifacts(context);
    await smoke({assets:deploymentAssets(accepted.files)});
    console.log('Verified public Hukamnama shell, sealed assets and live API response.');
    return;
  }
  assertTrustedMain(context,'SGPC_PUBLIC_RELEASE_ENABLED');
  const ops = opsFor(context,configPath,path.join(release,'wrangler.ndjson'));
  if (mode==='rollback') {
    const receipt = JSON.parse(fs.readFileSync(promotionPath,'utf8'));
    assert.equal(receipt.head,context.head,'Rollback receipt belongs to another commit');
    assert.equal(receipt.runId,env.GITHUB_RUN_ID,'Rollback receipt belongs to another run');
    assert.equal(receipt.runAttempt,env.GITHUB_RUN_ATTEMPT,'Rollback receipt belongs to another attempt');
    if (restore({receipt,ops})) {
      console.log(`Restored Worker version ${receipt.previous.version} at 100%.`);
    } else {
      console.log('Rollback skipped because this release is no longer the sole active deployment.');
    }
    return;
  }
  const checkSeal = () => verifiedArtifacts(context);
  checkSeal();
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8')).workers_dev,false);
  fs.mkdirSync(release,{recursive:true});
  fs.writeFileSync(configPath,JSON.stringify(uploadConfig,null,2)+'\n',{flag:'wx'});
  await promote({head:context.head,ops,verifySeal:checkSeal,record:receipt=>{
    fs.writeFileSync(promotionPath,JSON.stringify({
      ...receipt,head:context.head,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,
    },null,2)+'\n',{flag:'wx'});
    fs.appendFileSync(env.GITHUB_OUTPUT,'promotion_recorded=true\n');
  }});
  await ops.checkIngress();
  console.log('Promoted the accepted Worker version to the canonical production hostname.');
}

if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) await main();
