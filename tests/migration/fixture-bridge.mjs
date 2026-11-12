import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';

// Miniflare's JS fetcher service converts thrown fetch errors to HTTP500 text.
// The supported Node handler preserves transport failure and cancellation.
// Its envelope loses the URL scheme, so validate inside workerd first.
export function fixtureBridge(origin,outbound=[]){
 const target=new URL(origin);
 assert.equal(target.protocol,'http:');assert.equal(target.hostname,'127.0.0.1');
 assert.equal(target.origin,origin);assert.ok(target.port);
 const sourceHeader='x-sgpc-test-source-url',name='sgpc-synthetic-egress';
 const script=`export default {fetch(request,env){
  const url=new URL(request.url);
  if(url.origin!=='https://hs.sgpc.net'||request.method!=='GET')throw Error('Blocked non-fixture egress');
  const forwarded=new Request(request);forwarded.headers.set('${sourceHeader}',request.url);
  return env.RELAY.fetch(forwarded);
 }};`;
 function relay(req,res){
  let url;
  try{
   url=new URL(req.headers[sourceHeader]);
   assert.equal(url.origin,'https://hs.sgpc.net');assert.equal(req.method,'GET');assert.equal(req.headers.host,url.host);
   assert.equal(req.url,url.pathname+url.search);
  }catch{res.destroy();return;}
  const event={path:url.pathname,method:req.method,userAgent:req.headers['user-agent']??null,downstreamClosed:false,upstreamClosed:false,downstreamSocketClosed:false,upstreamSocketClosed:false};outbound.push(event);
  const downstreamSocket=res.socket;
  const socketClosed=()=>{event.downstreamSocketClosed=true;};
  downstreamSocket.once('close',socketClosed);
  // Successful keep-alive responses need not close their reusable connection.
  res.once('finish',()=>downstreamSocket.off('close',socketClosed));
  // Only this fixed loopback listener is reachable, including on redirects.
  const headers=Object.fromEntries(Object.entries(req.headers).filter(([key])=>key!==sourceHeader&&key!=='host'&&!key.startsWith('mf-')));
  const upstream=httpRequest(origin+url.pathname,{method:'GET',headers,agent:false},response=>{
   event.status=response.statusCode;
   response.on('error',()=>res.destroy());
   res.writeHead(response.statusCode,response.statusMessage,response.headers);
   response.pipe(res);
  });
  upstream.once('socket',socket=>socket.once('close',()=>{event.upstreamSocketClosed=true;}));
  upstream.on('error',error=>{event.transportError=error.code;res.destroy();});
  upstream.on('close',()=>{event.upstreamClosed=true;});
  // Workerd's existing headers/body deadline must close both socket legs before
  // teardown. No bridge timeout, retry, fabricated status or error body.
  res.on('close',()=>{event.downstreamClosed=true;upstream.destroy();});
  upstream.end();
 }
 const hash=value=>createHash('sha256').update(value).digest('hex');
 return {outboundService:name,proof:{guardSHA256:hash(script),relaySHA256:hash(relay.toString())},worker:{
  name,modules:true,compatibilityDate:'2026-10-30',script,
  outboundService:()=>{throw Error('Fixture guard cannot access the network');},
  serviceBindings:{RELAY:{node:relay}},
 }};
}
