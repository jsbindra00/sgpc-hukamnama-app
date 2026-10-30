import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const baseline='9a83971250ef7bf020684c8a7beaa2af5d5590c0';
const gitlink='d67b5cf107be95b5da1b538f95eabc5e9a3a7ea1';
const linkPath='sgpc-scraper-script';
// No remotes, auth or network protocols are available in the disposable proof.
const isolatedEnv={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_ALLOW_PROTOCOL:'',GIT_NO_LAZY_FETCH:'1'};
const cleanupCommands=[
 ['submodule','foreach','--recursive','sh','-c',String.raw`git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :`],
 ['submodule','foreach','--recursive','sh','-c',String.raw`git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :`],
];
function git(cwd,args,env=isolatedEnv){
 const result=spawnSync('git',args,{cwd,env,encoding:'utf8'});
 if(result.error)throw result.error;
 return {command:['git',...args],exitCode:result.status,stdout:result.stdout,stderr:result.stderr};
}
function success(cwd,args,env){const result=git(cwd,args,env);assert.equal(result.exitCode,0,JSON.stringify(result));return result;}

test('checkout auth cleanup: unresolved original gitlink RED, omitted candidate GREEN without remote access',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'sgpc-checkout-proof-'));
 const trace=path.join(folder,'trace.jsonl');const env={...isolatedEnv,GIT_TRACE2_EVENT:trace};const commands=[];
 try{
  commands.push(success(folder,['init','--quiet','--initial-branch=codex/checkout-proof'],env));
  fs.writeFileSync(path.join(folder,'synthetic.txt'),'Synthetic checkout topology only.\n');
  commands.push(success(folder,['add','synthetic.txt'],env));
  commands.push(success(folder,['update-index','--add','--cacheinfo',`160000,${gitlink},${linkPath}`],env));
  fs.mkdirSync(path.join(folder,linkPath));
  commands.push(success(folder,['-c','user.name=Synthetic Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','Synthetic original unresolved gitlink'],env));
  assert.equal(fs.existsSync(path.join(folder,'.gitmodules')),false);
  assert.equal(fs.existsSync(path.join(folder,linkPath,'.git')),false);
  assert.equal(success(folder,['remote'],env).stdout,'');
  const original=cleanupCommands.map(args=>git(folder,args,env));commands.push(...original);
  for(const result of original){assert.equal(result.exitCode,128);assert.match(result.stderr,/No url found for submodule path 'sgpc-scraper-script' in \.gitmodules/);}
  commands.push(success(folder,['update-index','--force-remove',linkPath],env));
  const candidate=cleanupCommands.map(args=>git(folder,args,env));commands.push(...candidate);
  for(const result of candidate)assert.equal(result.exitCode,0,JSON.stringify(result));
  assert.equal(success(folder,['remote'],env).stdout,'');
  const events=fs.readFileSync(trace,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  const networkProcesses=events.filter(event=>event.event==='child_start'&&event.argv?.some(arg=>/^remote-(?:http|https|ssh)|^(?:fetch|clone|ls-remote)$/.test(arg)));
  assert.deepEqual(networkProcesses,[]);
  console.log('SGPC_CHECKOUT_CLEANUP_PROOF '+JSON.stringify({commands,originalExitCodes:original.map(x=>x.exitCode),candidateExitCodes:candidate.map(x=>x.exitCode),remotes:0,allowedNetworkProtocols:[],networkProcesses:0,initializedSubmodules:0,credentials:0}));
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});

test('migration omits only the unused gitlink and retains its frozen original commit/tree pointer',()=>{
 const root=process.cwd();
 assert.equal(success(root,['cat-file','-t',baseline]).stdout.trim(),'commit');
 assert.equal(success(root,['ls-tree',baseline,'--',linkPath]).stdout.trim(),`160000 commit ${gitlink}\t${linkPath}`);
 assert.equal(success(root,['ls-files','--stage','--',linkPath]).stdout,'','active migration must omit the unresolved unused gitlink');
 assert.equal(fs.existsSync('.gitmodules'),false);
 assert.equal(fs.existsSync(path.join(linkPath,'.git')),false);
 const provenance=JSON.parse(fs.readFileSync('migration/source-provenance.json'));
 assert.deepEqual(provenance.gitlinks,[{path:linkPath,mode:'160000',commit:gitlink,initialized:false}]);
});
