import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
export const sha=data=>createHash('sha256').update(data).digest('hex');
export async function command(executable,args,options={}){
 console.log('COMMAND '+JSON.stringify([executable,...args]));
 const child=spawn(executable,args,{stdio:['ignore','pipe','pipe'],...options});let stdout='',stderr='';
 child.stdout.on('data',x=>{stdout+=x;process.stdout.write(x);});child.stderr.on('data',x=>{stderr+=x;process.stderr.write(x);});
 const exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
 if(exitCode!==0)throw new Error('Command failed '+JSON.stringify({executable,args,exitCode}));return{executable,args,exitCode,stdout,stderr};
}
export async function stop(child){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();
 const deadline=setTimeout(()=>child.kill('SIGKILL'),1000);
 try{await exited;}finally{clearTimeout(deadline);}
}
export function inventory(directory){
 const files=[];
 function visit(relative=''){for(const name of fs.readdirSync(path.join(directory,relative)).sort()){const rel=path.join(relative,name),full=path.join(directory,rel),stat=fs.lstatSync(full);assert.ok(!stat.isSymbolicLink(),'sealed artifact cannot contain a symlink');if(stat.isDirectory())visit(rel);else{assert.ok(!/\.(node|dylib|so|br)$/.test(rel),'native/browser binary excluded');assert.ok(!/private-capture|raw\.html|rendered\.html|(?:^|\/)\.env/.test(rel));const bytes=fs.readFileSync(full);assert.ok(!/tests[\/]migration|fixture-bridge/.test(rel)&&!bytes.includes('x-sgpc-test-source-url')&&!bytes.includes('sgpc-synthetic-egress'),'test-only fixture bridge must not enter sealed release');files.push({path:rel,bytes:stat.size,sha256:sha(bytes)});}}}visit();return files;
}
export async function seal(){
 const directory=path.resolve('.migration-artifacts/sealed');fs.mkdirSync(directory,{recursive:true});
 await command(process.execPath,['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--outdir',directory+'/worker','--metafile',directory+'/metafile.json'],{env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:path.resolve('.migration-artifacts/wrangler.log'),CI:'1'}});
 const meta=JSON.parse(fs.readFileSync(directory+'/metafile.json'));
 const inputs=Object.keys(meta.inputs);assert.ok(inputs.every(x=>!/[\/]node_modules[\/](?:@sparticuz|puppeteer(?:-core)?)[\/]/.test(x)),'native scraper imports must not enter sealed worker');
 assert.ok(inputs.every(x=>!/(?:^|[\/])tests[\/]migration[\/]/.test(x)),'test-only migration imports must not enter sealed worker');
 const entry=Object.keys(meta.outputs).find(file=>meta.outputs[file].entryPoint&&/\.(?:m?js)$/.test(file));assert.ok(entry,'single emitted Worker entry must be discovered from metafile');
 fs.cpSync('.open-next/assets',directory+'/assets',{recursive:true});
 const config={name:'sgpc-hukamnama-scraper',main:path.relative(directory,path.resolve(entry)),compatibility_date:'2026-10-30',compatibility_flags:['nodejs_compat'],workers_dev:false,preview_urls:false,assets:{directory:'assets',binding:'ASSETS'}};
 fs.writeFileSync(directory+'/wrangler.json',JSON.stringify(config,null,2));
 const files=inventory(directory);fs.writeFileSync('.migration-artifacts/sealed-manifest.json',JSON.stringify({entry:config.main,files,metafileSHA256:sha(fs.readFileSync(directory+'/metafile.json')),uploaded:false},null,2));
 console.log('SEALED_MANIFEST '+JSON.stringify({entry:config.main,files,uploaded:false}));return{directory,files};
}
