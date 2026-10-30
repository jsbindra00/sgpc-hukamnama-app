import {createServer} from 'node:http';
import {card} from './fixtures.mjs';
export async function fixtureServer(){
 let mode='valid';const requests=[],sockets=new Set();
 const server=createServer((req,res)=>{
  const event={mode,path:req.url,method:req.method,userAgent:req.headers['user-agent'],closed:false};requests.push(event);res.on('close',()=>{event.closed=true;});
  const entry=typeof mode==='object'?mode:{html:card()};
  if(mode==='reset'){req.socket.destroy();return;}
  if(mode==='hang-headers')return;
  if(mode==='hang-body'){res.writeHead(200,{'content-type':'text/html'});res.write('<html>');return;}
  if(mode==='redirect'&&req.url==='/'){res.writeHead(302,{location:'/after-redirect'});res.end();return;}
  if(mode==='redirect-loop'){res.writeHead(302,{location:'/'});res.end();return;}
  res.writeHead(entry.status??200,{'content-type':entry.contentType??'text/html;charset=UTF-8'});
  const send=()=>{if(!res.destroyed)res.end(entry.html??card());};
  if(entry.delayMs)setTimeout(send,entry.delayMs);else send();
 });
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {origin:`http://127.0.0.1:${server.address().port}`,requests,setMode(value){mode=value;},async close(){for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
