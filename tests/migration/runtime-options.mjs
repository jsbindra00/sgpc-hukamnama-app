import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Miniflare5 converts explicit modules, not v4 glob rules. Materialize every
// emitted module without rewriting its bytes, preserving the entry first.
export function explicitModules(options,main,directory){
 const types={'.js':'ESModule','.mjs':'ESModule','.cjs':'CommonJS','.wasm':'CompiledWasm','.txt':'Text','.html':'Text','.sql':'Text','.bin':'Data'};
 const paths=[];
 function visit(folder){for(const name of fs.readdirSync(folder).sort()){const file=path.join(folder,name),stat=fs.lstatSync(file);assert.ok(!stat.isSymbolicLink());if(stat.isDirectory())visit(file);else if(!file.endsWith('.map')){assert.ok(types[path.extname(file)],'Unknown emitted module type: '+file);paths.push(file);}}}
 visit(directory);assert.ok(paths.includes(path.resolve(main)));
 const {modulesRules,...rest}=options;
 assert.ok((modulesRules??[]).every(rule=>['Text','Data','CompiledWasm','ESModule','CommonJS'].includes(rule.type)),'Unsupported module rule must be reviewed');
 return {...rest,modulesRoot:directory,modules:[path.resolve(main),...paths.filter(file=>file!==path.resolve(main))].map(file=>({path:file,type:types[path.extname(file)]}))};
}
