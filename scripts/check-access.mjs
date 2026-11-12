import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

// Adapted from the verified private deployment kit. This proves anonymous
// denial only; it cannot inspect authenticated application or asset bytes.
export async function checkAccess(baseURL,{assetPath,timeoutMs=45000,retryMs=1000,allowLoopback=false}={}){
 const base=new URL(baseURL);
 const loopback=allowLoopback&&base.protocol==='http:'&&base.hostname==='127.0.0.1';
 assert.ok(loopback||(base.protocol==='https:'&&base.hostname==='sgpc-hukamnama-scraper.shy-bonus-2f1d.workers.dev'),'Unexpected protected Worker URL');
 assert.equal(base.username+base.password+base.search+base.hash,'');assert.equal(base.pathname,'/');
 assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=45000);assert.ok(Number.isSafeInteger(retryMs)&&retryMs>0);
 assert.match(assetPath,/^\/[A-Za-z0-9_./-]+\.(?:js|css|woff2)$/);assert.ok(!assetPath.includes('..'));
 for(const route of ['/','/api/hukamnama','/?_rsc=sgpc-access-check',assetPath]){
  const deadline=Date.now()+timeoutMs;let lastFailure='route not ready';
  while(true){
   const remaining=deadline-Date.now();assert.ok(remaining>0,`Timed out waiting for Cloudflare Access for ${route}: ${lastFailure}`);
   let response;
   try{response=await fetch(new URL(route,base),{redirect:'manual',signal:AbortSignal.timeout(Math.min(15000,remaining)),cache:'no-store'});}
   catch{lastFailure='network unavailable';}
   if(response){
    await response.body?.cancel();
    if(response.status!==404){
     assert.equal(response.status,302,'Expected Cloudflare Access login redirect for '+route);
     const target=new URL(response.headers.get('location'));
     assert.equal(target.protocol,'https:');assert.equal(target.hostname,'jaspreetsinghb.cloudflareaccess.com');assert.equal(target.port,'');assert.equal(target.username+target.password,'');assert.ok(target.pathname.startsWith('/cdn-cgi/access/login/'));
     break;
    }
    lastFailure='HTTP 404 while route propagates';
   }
   await delay(Math.min(retryMs,Math.max(0,deadline-Date.now())));
  }
 }
}
