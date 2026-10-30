import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Miniflare5 converts explicit modules, not v4 glob rules. Materialize every
// emitted module without rewriting its bytes, preserving the entry first.
export function explicitModules(options,main,directory,{workerName,sealedCompanion}={}){
 const types={'.js':'ESModule','.mjs':'ESModule','.cjs':'CommonJS','.wasm':'CompiledWasm','.txt':'Text','.html':'Text','.sql':'Text','.bin':'Data'};
 const paths=[];let sawCompanion=false;
 function companion(file){
  assert.equal(sealedCompanion?.path,'worker/README.md','Wrangler companion must be covered by the sealed manifest');
  const bytes=fs.readFileSync(file);
  assert.equal(bytes.length,sealedCompanion.bytes,'Wrangler companion bytes must match sealed manifest');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sealedCompanion.sha256,'Wrangler companion hash must match sealed manifest');
  assert.ok(typeof workerName==='string'&&workerName.length>0,'Wrangler companion requires actual configured Worker name');
  // Exact Wrangler4.154.0 bundle.ts output. Its timestamp is run-specific;
  // integrity comes from that run's complete sealed manifest, not a fixed hash.
  const prefix=`This folder contains the built output assets for the worker "${workerName}" generated at `;
  const text=bytes.toString(),iso=text.slice(prefix.length,-1);
  assert.match(iso,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,'Wrangler companion timestamp template');
  assert.equal(new Date(iso).toISOString(),iso,'Wrangler companion timestamp template');
  assert.ok(bytes.equals(Buffer.from(prefix+iso+'.')),'Wrangler companion template must match pinned generator and Worker name');
  sawCompanion=true;
 }
 function visit(folder){for(const name of fs.readdirSync(folder).sort()){const file=path.join(folder,name),stat=fs.lstatSync(file);assert.ok(!stat.isSymbolicLink());if(stat.isDirectory())visit(file);else if(path.relative(directory,file)==='README.md'){assert.ok(stat.isFile());companion(file);}else if(!file.endsWith('.map')){assert.ok(types[path.extname(file)],'Unknown emitted module type: '+file);paths.push(file);}}}
 visit(directory);if(sealedCompanion)assert.ok(sawCompanion,'Wrangler companion from sealed manifest must exist');assert.ok(paths.includes(path.resolve(main)));
 const {modulesRules,...rest}=options;
 assert.ok((modulesRules??[]).every(rule=>['Text','Data','CompiledWasm','ESModule','CommonJS'].includes(rule.type)),'Unsupported module rule must be reviewed');
 return {...rest,modulesRoot:directory,modules:[path.resolve(main),...paths.filter(file=>file!==path.resolve(main))].map(file=>({path:file,type:types[path.extname(file)]}))};
}
