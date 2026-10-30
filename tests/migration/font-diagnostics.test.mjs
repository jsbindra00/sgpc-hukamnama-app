import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {dependency} from './tools.mjs';
import {observeFonts} from './font-diagnostics.mjs';
import {sha} from './seal.mjs';

test('real Chrome preserves font failures and reports bounded local evidence',async()=>{
 const executable=process.env.SGPC_TEST_CHROME,fontFile=process.env.SGPC_TEST_FONT_FILE;
 assert.ok(executable&&fs.existsSync(executable),'Use existing Chrome only');
 assert.ok(fontFile&&fs.existsSync(fontFile),'Use an existing public test font; no download');
 const valid=fs.readFileSync(fontFile),corrupt=Buffer.from('synthetic invalid font');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sgpc-font-diagnostics-'));
 fs.mkdirSync(path.join(directory,'media'));
 fs.writeFileSync(path.join(directory,'media/valid.woff2'),valid);
 fs.writeFileSync(path.join(directory,'media/corrupt.woff2'),corrupt);
 let mode='valid',externalHits=0,browser;
 const server=createServer((request,response)=>{
  if(request.url==='/'){
   const src=mode==='external'?`http://127.0.0.1:${external.address().port}/private.woff2?secret=never-print`:`/_next/static/media/${mode}.woff2`;
   response.setHeader('content-type','text/html');response.end(`<style>@font-face{font-family:Synthetic;src:url("${src}")}body{--font-geist-mono:Synthetic}</style><body>Synthetic font</body>`);
  }else{const bytes=mode==='valid'?valid:corrupt;response.statusCode=mode==='missing'?404:200;response.setHeader('content-type','font/woff2');response.setHeader('content-length',bytes.length);response.end(bytes);}
 });
 const external=createServer((_request,response)=>{externalHits++;response.end(valid);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await new Promise(resolve=>external.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  browser=await dependency('puppeteer-core').launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-background-networking','--disable-sync','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  for(mode of ['valid','missing','corrupt','external']){
   const page=await browser.newPage();const observer=observeFonts(page,{origin,label:'original',assetRoot:directory});
   try{
    await page.setRequestInterception(true);
    page.on('request',request=>{const allowed=new URL(request.url()).origin===origin&&['GET','HEAD'].includes(request.method());(allowed?request.continue():request.abort('blockedbyclient')).catch(()=>{});});
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    // Exact failing full-CI operation, including its default font-load text.
    const operation=page.evaluate(async()=>{await document.fonts.ready;const mono=document.createElement('span');mono.textContent='Synthetic font';mono.style.fontFamily='var(--font-geist-mono)';document.body.append(mono);await document.fonts.load('12px '+getComputedStyle(mono).fontFamily);mono.remove();});
    if(mode==='valid')await operation;else await assert.rejects(operation,/NetworkError/);
    const proof=await observer.snapshot();assert.ok(proof.events.length>=1&&proof.events.length<=2);assert.equal(proof.dropped,0);
    const event=proof.events.find(event=>mode==='external'?event.failure:event.status);assert.equal(proof.fontState.faces[0].status,mode==='valid'?'loaded':'error');
    if(mode==='external'){assert.equal(event.origin,'blocked-external');assert.equal(event.path,'unrecorded-path');assert.equal(event.failure,'net::ERR_BLOCKED_BY_CLIENT');assert.equal(externalHits,0);assert.ok(!JSON.stringify(proof).includes('secret'));assert.ok(!JSON.stringify(proof).includes('private'));}
    else{assert.equal(event.status,mode==='missing'?404:200);assert.equal(event.path,`/_next/static/media/${mode}.woff2`);if(mode==='missing')assert.equal(event.disk,'missing');else{assert.deepEqual(event.response,event.disk);assert.equal(event.disk.sha256,sha(mode==='valid'?valid:corrupt));}}
    assert.ok(JSON.stringify(proof).length<4096);assert.ok(!JSON.stringify(proof).includes('synthetic invalid font'));
    console.log('SGPC_FONT_PROBE '+JSON.stringify({mode,operation:mode==='valid'?'resolved':'rejected-NetworkError',proof,externalHits}));
   }finally{observer.stop();await page.close();}
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>external.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});

test('diagnostics cap event retention and stop waiting for an unresponsive page',async()=>{
 const {EventEmitter}=await import('node:events');const page=new EventEmitter();page.evaluate=()=>new Promise(()=>{});
 const observer=observeFonts(page,{origin:'http://127.0.0.1:1',label:'candidate',assetRoot:os.tmpdir()});
 try{
  for(let n=0;n<40;n++)page.emit('requestfailed',{resourceType:()=>'font',url:()=>`https://blocked.invalid/private-${n}.woff2?secret=hidden`,failure:()=>({errorText:'net::ERR_BLOCKED_BY_CLIENT.Inspector'})});
  const proof=await observer.snapshot();assert.equal(proof.events.length,32);assert.equal(proof.dropped,8);assert.equal(proof.fontState.status,'diagnostic-timeout');assert.ok(!JSON.stringify(proof).includes('private'));assert.ok(!JSON.stringify(proof).includes('secret'));
 }finally{observer.stop();}
 assert.equal(page.listenerCount('requestfailed'),0);assert.equal(page.listenerCount('response'),0);
});
