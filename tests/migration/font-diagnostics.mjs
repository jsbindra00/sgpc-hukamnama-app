import fs from 'node:fs';
import path from 'node:path';
import {sha} from './seal.mjs';

// Diagnostic data only: never retry, fulfil, or change a browser request.
// Only known local Next font files may be read; bodies, URLs, headers and
// arbitrary page text never enter the report. Cap work and retained data.
const fontPath=/^\/_next\/static\/media\/[a-zA-Z0-9_.-]{1,160}\.woff2$/;
const maxEvents=32,maxBytes=1024*1024;
async function bounded(promise,fallback){
 let timer;try{return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(fallback),1000);})]);}
 finally{clearTimeout(timer);}
}
export function observeFonts(page,{origin,label,assetRoot}){
 const events=[],pending=new Set(),requests=new WeakMap();let dropped=0;
 function eventFor(request){
  if(request.resourceType()!=='font'&&!/\.woff2(?:\?|$)/.test(request.url()))return;
  if(requests.has(request))return requests.get(request);
  if(events.length===maxEvents){dropped++;return;}
  const url=new URL(request.url()),local=url.origin===origin;
  const safe=local&&fontPath.test(url.pathname);
  const event={origin:local?label:'blocked-external',path:safe?url.pathname:'unrecorded-path',pathSHA256:sha(url.pathname)};
  if(safe){
   const file=path.join(assetRoot,url.pathname.slice('/_next/static/'.length));
   try{const stat=fs.lstatSync(file);if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=maxBytes)event.disk={bytes:stat.size,sha256:sha(fs.readFileSync(file))};else event.disk='not-bounded-file';}catch{event.disk='missing';}
  }
  events.push(event);requests.set(request,event);return event;
 }
 const onFailure=request=>{const event=eventFor(request);if(event){const code=request.failure()?.errorText;event.failure=code?.match(/^net::[A-Z0-9_]+/)?.[0]??'unrecorded-error';}};
 const onResponse=response=>{
  const event=eventFor(response.request());if(!event)return;
  event.status=response.status();
  // CDP has already buffered this font. Restrict reads to a known small local
  // artifact and a bounded declared response size; retain only size and hash.
  const length=response.headers()['content-length'];
  if(event.disk&&typeof event.disk==='object'&&/^\d+$/.test(length??'')&&Number(length)<=maxBytes){
   const task=response.buffer().then(bytes=>{if(bytes.length<=maxBytes)event.response={bytes:bytes.length,sha256:sha(bytes)};else event.response='too-large';},()=>{event.response='unavailable';});
   pending.add(task);task.finally(()=>pending.delete(task));
  }
 };
 page.on('requestfailed',onFailure);page.on('response',onResponse);
 return{
  async snapshot(){
   // Bound each diagnostic wait; the caller still rethrows the original failure.
   await bounded(Promise.allSettled([...pending]),null);
   let state;
   try{state=await bounded(page.evaluate(()=>({status:document.fonts.status,variables:Object.fromEntries(['--font-geist-sans','--font-geist-mono'].map(name=>{const value=getComputedStyle(document.body).getPropertyValue(name).trim();return[name,/^[a-zA-Z0-9_ ,"'-]{0,160}$/.test(value)?value:'unrecorded-value'];})),faces:[...document.fonts].slice(0,32).map(face=>({family:/^[a-zA-Z0-9_ ,"'-]{1,160}$/.test(face.family)?face.family:'unrecorded-family',status:face.status}))})),{status:'diagnostic-timeout',faces:[]});}catch{state={status:'unavailable',faces:[]};}
   return{origin:label,events:events.map(event=>({...event})),dropped,fontState:state};
  },
  stop(){page.off('requestfailed',onFailure);page.off('response',onResponse);}
 };
}
