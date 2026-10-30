import {createRequire} from 'node:module';
import path from 'node:path';
const allowed=new Set(['cheerio','esbuild','workerd','wrangler','miniflare','puppeteer-core']);
const roots=[process.cwd(),...JSON.parse(process.env.SGPC_TEST_MODULE_ROOTS??'[]')];
export function dependency(name){
 if(!allowed.has(name))throw new Error('Unexpected test dependency');
 for(const root of roots){try{return createRequire(path.resolve(root,'package.json'))(name);}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}}
 throw new Error('Missing pinned test dependency: '+name);
}
export const root=process.cwd();
