import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'node:http';
import {dependency} from './tools.mjs';
import {sha} from './seal.mjs';

// Controlled missing local fallback; never change an app font or install one.
test('the previous family-list operation rejects a missing local fallback despite valid primary bytes',async()=>{
 const executable=process.env.SGPC_TEST_CHROME,fontFile=process.env.SGPC_TEST_FONT_FILE;
 assert.ok(executable&&fs.existsSync(executable));assert.ok(fontFile&&fs.existsSync(fontFile));
 const font=fs.readFileSync(fontFile);let browser;
 const server=createServer((request,response)=>{
  if(request.url==='/font.woff2'){response.setHeader('content-type','font/woff2');response.setHeader('content-length',font.length);response.end(font);return;}
  response.setHeader('content-type','text/html');response.end(`<style>@font-face{font-family:"Geist Mono";src:url("/font.woff2")}@font-face{font-family:"Geist Mono Fallback";src:local("SGPC Deliberately Missing Local Font 2099")}body{--font-geist-mono:"Geist Mono","Geist Mono Fallback"}</style><body>Synthetic font</body>`);
 });
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await dependency('puppeteer-core').launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-background-networking','--disable-sync','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  const page=await browser.newPage(),assets=[];await page.setRequestInterception(true);
  page.on('request',request=>{const allowed=new URL(request.url()).origin===origin&&request.method()==='GET';(allowed?request.continue():request.abort('blockedbyclient')).catch(()=>{});});
  page.on('response',response=>{if(response.url()===origin+'/font.woff2')assets.push(response);});
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await assert.rejects(page.evaluate(async()=>{await document.fonts.ready;const mono=document.createElement('span');mono.textContent='Synthetic font';mono.style.fontFamily='var(--font-geist-mono)';document.body.append(mono);await document.fonts.load('12px '+getComputedStyle(mono).fontFamily);mono.remove();}),/NetworkError/);
  // The local() rejection may precede the successful network font completion.
  await page.evaluate(async()=>{await document.fonts.ready;});
  const state=await page.evaluate(()=>({variable:getComputedStyle(document.body).getPropertyValue('--font-geist-mono'),faces:[...document.fonts].map(face=>({family:face.family,status:face.status}))}));
  assert.equal(state.faces.find(face=>face.family==='Geist Mono').status,'loaded');assert.equal(state.faces.find(face=>face.family==='Geist Mono Fallback').status,'error');
  assert.equal(assets.length,1);assert.equal(assets[0].status(),200);const actual=await assets[0].buffer();assert.equal(sha(actual),sha(font));
  console.log('SGPC_PRIMARY_FONT_RED '+JSON.stringify({oldOperation:'NetworkError',state,asset:{status:200,bytes:actual.length,sha256:sha(actual),equalsDisk:true},providerRequests:0}));
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});

test('both primary webfonts decode with missing local fallbacks; either broken primary still rejects',async()=>{
 const {loadPrimaryFonts}=await import('./primary-fonts.mjs');
 const executable=process.env.SGPC_TEST_CHROME;
 const files={sans:process.env.SGPC_TEST_SANS_FONT_FILE,mono:process.env.SGPC_TEST_FONT_FILE};
 for(const file of Object.values(files))assert.ok(file&&fs.existsSync(file));
 const fonts=Object.fromEntries(Object.entries(files).map(([name,file])=>[name,fs.readFileSync(file)]));
 let mode='valid',browser;const requests=[];
 const server=createServer((request,response)=>{
  if(request.url==='/'){
   const sans=mode==='missing-variable'?'':mode==='generic-primary'?'monospace':mode==='absent-face'?'Absent Primary':'"Geist","Geist Fallback"';
   response.setHeader('content-type','text/html');response.end(`<style>@font-face{font-family:"Geist";src:url("/sans.woff2")}@font-face{font-family:"Geist Fallback";src:local("SGPC Deliberately Missing Local Font 2099")}@font-face{font-family:"Geist Mono";src:url("/mono.woff2")}@font-face{font-family:"Geist Mono Fallback";src:local("SGPC Deliberately Missing Local Font 2099")}body{--font-geist-sans:${sans};--font-geist-mono:"Geist Mono","Geist Mono Fallback"}</style><body>Synthetic font</body>`);return;
  }
  const name=request.url.slice(1).replace('.woff2','');
  if(!Object.hasOwn(fonts,name)){response.statusCode=404;response.end();return;}
  requests.push({mode,name});const broken=mode.endsWith('-'+name),bytes=broken?Buffer.from('synthetic corrupt primary'):fonts[name];
  response.statusCode=broken&&mode.startsWith('missing-')?404:200;response.setHeader('content-type','font/woff2');response.setHeader('content-length',bytes.length);response.end(bytes);
 });
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await dependency('puppeteer-core').launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-background-networking','--disable-sync','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  for(mode of ['valid','missing-sans','corrupt-sans','missing-mono','corrupt-mono','absent-face','generic-primary','missing-variable']){
   const page=await browser.newPage(),assets=[];let blocked=0;
   try{
    await page.setRequestInterception(true);page.on('request',request=>{const allowed=new URL(request.url()).origin===origin&&request.method()==='GET';if(!allowed)blocked++;(allowed?request.continue():request.abort('blockedbyclient')).catch(()=>{});});
    page.on('response',response=>{if(/\/(sans|mono)\.woff2$/.test(response.url()))assets.push(response);});
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    const css=()=>page.evaluate(()=>{const style=getComputedStyle(document.body);return['--font-geist-sans','--font-geist-mono'].map(name=>style.getPropertyValue(name));});
    const before=await css();let loaded;
    if(mode==='valid'){
     loaded=await page.evaluate(loadPrimaryFonts);assert.deepEqual(loaded,[{variable:'--font-geist-sans',family:'Geist',loadedFaces:1},{variable:'--font-geist-mono',family:'Geist Mono',loadedFaces:1}]);
     assert.equal(assets.length,2);
     for(const response of assets){assert.equal(response.status(),200);const name=new URL(response.url()).pathname.slice(1).replace('.woff2','');assert.equal(sha(await response.buffer()),sha(fonts[name]));}
    }else if(mode==='missing-variable')await assert.rejects(page.evaluate(loadPrimaryFonts),/Invalid primary font variable/);
    else if(mode==='absent-face'||mode==='generic-primary')await assert.rejects(page.evaluate(loadPrimaryFonts),/Primary font did not load/);
    else await assert.rejects(page.evaluate(loadPrimaryFonts),/NetworkError/);
    assert.deepEqual(await css(),before,'font verification must not rewrite complete CSS family lists');
    const faces=await page.evaluate(()=>[...document.fonts].map(face=>({family:face.family,status:face.status})));
    assert.ok(faces.filter(face=>face.family.endsWith('Fallback')).every(face=>face.status==='unloaded'),'primary check must not force either local fallback');
    assert.equal(blocked,0);
    console.log('SGPC_PRIMARY_FONT_CONTROL '+JSON.stringify({mode,result:mode==='valid'?loaded:'rejected',variables:before,faces,assets:await Promise.all(assets.map(async response=>({path:new URL(response.url()).pathname,status:response.status(),sha256:sha(await response.buffer())}))),requests:requests.filter(request=>request.mode===mode),externalRequests:0}));
   }finally{await page.close();}
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
