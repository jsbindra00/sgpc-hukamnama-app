import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
export const baseline='9a83971250ef7bf020684c8a7beaa2af5d5590c0';
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const originalAction=()=>execFileSync('git',['show',baseline+':app/api/hukamnama/actions.ts'],{encoding:'utf8'});
export const parser=source=>source.slice(source.indexOf('    const $ = cheerio.load(html);'),source.indexOf('\n  } catch (error)'));
export function verifySource(){
 const source=JSON.parse(fs.readFileSync('migration/source-provenance.json'));
 const exceptions=new Set(['.gitignore','README.md','package.json','package-lock.json','next.config.ts','eslint.config.mjs','app/api/hukamnama/actions.ts']);
 const protectedFiles=source.files.filter(x=>!exceptions.has(x.path));
 for(const file of protectedFiles)assert.equal(hash(fs.readFileSync(file.path)),file.sha256,'original protected file changed: '+file.path);
 const action=fs.readFileSync('app/api/hukamnama/actions.ts','utf8');
 assert.equal(parser(action),parser(originalAction()));assert.equal(hash(parser(action)),'9a059f30d6b8f966799fdc41039bf5374d230a50aa43726a8d6e650d72f03430');
 assert.match(action,/await acquireSGPCHTML\(\)/);assert.doesNotMatch(action,/require\(|puppeteer|chromium|process\.env/);
 const pkg=JSON.parse(fs.readFileSync('package.json')),lock=JSON.parse(fs.readFileSync('package-lock.json'));
 const oldPackage=JSON.parse(execFileSync('git',['show',baseline+':package.json'],{encoding:'utf8'})),oldLock=JSON.parse(execFileSync('git',['show',baseline+':package-lock.json'],{encoding:'utf8'}));
 assert.equal(pkg.dependencies.next,'16.4.3');assert.equal(pkg.dependencies.react,'19.2.0');assert.equal(pkg.dependencies['react-dom'],'19.2.0');
 assert.equal(lock.packages['node_modules/@tanstack/react-query'].version,'5.90.11');
 for(const name of Object.keys(oldPackage.dependencies).filter(name=>!['next','@sparticuz/chromium','puppeteer','puppeteer-core'].includes(name)))assert.equal(lock.packages['node_modules/'+name].version,oldLock.packages['node_modules/'+name].version,'original runtime UI/parser package version changed: '+name);
 for(const name of ['@sparticuz/chromium','puppeteer','puppeteer-core'])assert.equal(pkg.dependencies[name],undefined);
 const files=execFileSync('git',['ls-files'],{encoding:'utf8'}).split('\n');assert.ok(files.every(x=>!/private-capture|raw\.html|rendered\.html|\.env(?:\.|$)/.test(x)));
 return {baseline,protectedOriginalFiles:protectedFiles.length,allowedHostingExceptions:[...exceptions],parserSHA256:hash(parser(action)),sourceParserUnchanged:true};
}
if(process.argv[1]?.endsWith('source-invariants.mjs'))console.log(JSON.stringify(verifySource()));
