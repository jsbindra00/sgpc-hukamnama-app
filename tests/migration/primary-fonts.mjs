// Runs in the page through Puppeteer evaluate. Loading a whole CSS family list
// also forces Next's local() fallback to load, even when the primary webfont is
// healthy. Verify both actual primary faces while leaving the CSS lists intact.
export async function loadPrimaryFonts(){
 await document.fonts.ready;
 const result=[];
 for(const variable of ['--font-geist-sans','--font-geist-mono']){
  const value=getComputedStyle(document.body).getPropertyValue(variable);
  const first=value.split(',')[0].trim();
  const family=first.replace(/^(["'])(.*)\1$/,'$2').trim();
  if(!/^[a-zA-Z0-9_ -]+$/.test(family))throw new Error('Invalid primary font variable: '+variable);
  // A generic or missing face would otherwise resolve with an empty array.
  const faces=await document.fonts.load('12px "'+family+'"','Synthetic font');
  if(faces.length===0||faces.some(face=>face.family.replace(/^(["'])(.*)\1$/,'$2')!==family||face.status!=='loaded'))throw new Error('Primary font did not load: '+variable);
  result.push({variable,family,loadedFaces:faces.length});
 }
 return result;
}
