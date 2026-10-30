import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {baseline,verifySource} from './source-invariants.mjs';
import {command} from './seal.mjs';
assert.equal(process.env.CI,'true','Full preparation is CI-only until local reserve is reviewed');
assert.equal(process.platform,'linux','The original native reference is a genuine Linux CI check');
verifySource();
await command(process.execPath,['tests/migration/build-guard.mjs']);
const folder=path.resolve(process.env.RUNNER_TEMP,'sgpc-original-next');
assert.ok(folder.startsWith(path.resolve(process.env.RUNNER_TEMP)+path.sep));fs.mkdirSync(folder,{recursive:true});
const tar=execFileSync('git',['archive',baseline],{maxBuffer:4*1024*1024});execFileSync('tar',['-xf','-','-C',folder],{input:tar});
await command('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:folder,env:{...process.env,PUPPETEER_SKIP_DOWNLOAD:'true'}});
await command(process.execPath,['tests/migration/build-guard.mjs']);
// Real original Next16.0.10 source, with the same supported Webpack compiler
// chosen for the candidate. The original action/browser packages are unchanged.
await command(process.execPath,[path.join(folder,'node_modules/next/dist/bin/next'),'build','--webpack'],{cwd:folder,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',NODE_OPTIONS:'--max-old-space-size=3072'}});
fs.mkdirSync('.migration-artifacts',{recursive:true});fs.writeFileSync('.migration-artifacts/baseline-location.json',JSON.stringify({folder,baseline}));
