// CI-only original acquisition boundary. Source files and real Puppeteer/Chrome
// remain intact; only the fixed provider navigation is routed to loopback.
const Module=require('node:module');
const load=Module._load;
const origin=process.env.SGPC_TEST_FIXTURE_ORIGIN;
if(!origin||new URL(origin).hostname!=='127.0.0.1')throw new Error('Original reference requires loopback fixture');
Module._load=function(name,parent,isMain){
 const actual=load.call(this,name,parent,isMain);
 if(name!=='puppeteer-core')return actual;
 return {...actual,launch:async options=>{
  const browser=await actual.launch(options),newPage=browser.newPage.bind(browser);
  browser.newPage=async()=>{
   const page=await newPage();await page.setRequestInterception(true);
   page.on('request',request=>{const allowed=['GET','HEAD'].includes(request.method())&&new URL(request.url()).origin===origin;(allowed?request.continue():request.abort('blockedbyclient')).catch(()=>{});});
   const goto=page.goto.bind(page);
   page.goto=(url,settings)=>{
    if(url!=='https://hs.sgpc.net/'||settings.timeout!==60000||settings.waitUntil!=='networkidle2')throw new Error('Original boundary changed');
    return goto(origin+'/',settings);
   };
   return page;
  };
  return browser;
 }};
};
