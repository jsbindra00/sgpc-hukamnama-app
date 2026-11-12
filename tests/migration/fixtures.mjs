// All names, dates and text here are synthetic test content.
export function card({ g = 'ਅ ॥ ਬ ॥੧॥', e = 'First. Second. ||1||', fallback = false, title = 'Synthetic Title', date = '30 October 2099', ang = 'Ang ੧੨੩' } = {}) {
  const cls = fallback ? 'hukamnama-card2' : 'hukamnama-card';
  return `<!doctype html><html><body><div class="fs-5 customDate">${date}</div><article class="${cls}"><h2 class="hukamnama-title">${title}</h2><div class="hukamnama-text">${g}</div><i class="customDate">first metadata</i><i class="customDate">${ang}</i></article><article class="${cls}"><h2 class="hukamnama-title">English Translation</h2><div class="hukamnama-text">${e}</div></article></body></html>`;
}
export const fixtures = [
  { name:'empty', html:'', expected:{date:'',ang:'',title:'',lines:[]} },
  { name:'malformed-repaired-by-parse5', html:'<div class="fs-5 customDate">  Synthetic date <div class="hukamnama-card"><div class="hukamnama-title"> Broken <b>title</div><p class="hukamnama-text"> ਅ &amp; ਬ ॥੧॥' },
  { name:'fallback-card2', html:card({fallback:true}), expected:{date:'30 October 2099',ang:'Ang ੧੨੩',title:'Synthetic Title',lines:[{gurmukhi:'ਅ',translation:'First.'},{gurmukhi:'ਬ',translation:'Second.'}]} },
  { name:'primary-precedes-fallback', html:card() + card({fallback:true,title:'Ignored fallback',g:'ਗ ॥੧॥',e:'Last english wins. ||1||'}) },
  { name:'entities-whitespace', html:card({title:' A &amp; B ',g:'  ਅ&nbsp;  ਬ\n &amp;  ਗ ॥ ਘ&#160;ਙ ॥੧॥',e:' One&nbsp; sentence.\n Second &amp; third! ||1||'}) },
  { name:'rahau-shared-danda-mixed-digits', html:card({g:'ਅ ॥ ਬ ॥੧॥ ਰਹਾਉ ॥ ਗ ॥ ਘ ॥2॥੩॥',e:'One. Two. ||1|| Pause || Three! Four? ||2||3||'}) },
  { name:'full-rahau-markers', html:card({g:'ਅ ॥ ਰਹਾਉ ॥ ਬ ॥੧॥',e:'Pause line. ||Pause|| Second line. ||1||'}) },
  { name:'more-english-sentences-remainder', html:card({g:'ਅ ॥ ਬ ॥ ਗ ॥੧॥',e:'One. Two! Three? Four. Five. Six. Seven! ||1||'}), expected:{date:'30 October 2099',ang:'Ang ੧੨੩',title:'Synthetic Title',lines:[{gurmukhi:'ਅ',translation:'One. Two! Three?'},{gurmukhi:'ਬ',translation:'Four. Five.'},{gurmukhi:'ਗ',translation:'Six. Seven!'}]} },
  { name:'fewer-english-sentences', html:card({g:'ਅ ॥ ਬ ॥ ਗ ॥੧॥',e:'One. ||1||'}) },
  { name:'one-gurmukhi-line-keeps-whole-english-block', html:card({g:'ਅ ॥੧॥',e:'One. Two! Trailing fragment ||1||'}) },
  { name:'unpunctuated-english-fallback', html:card({e:'No terminal punctuation ||1||'}) },
  { name:'trailing-english-fragment-originally-dropped', html:card({e:'One. Second trailing fragment ||1||'}), expected:{date:'30 October 2099',ang:'Ang ੧੨੩',title:'Synthetic Title',lines:[{gurmukhi:'ਅ',translation:'One.'},{gurmukhi:'ਬ',translation:''}]} },
  { name:'extra-english-stanza-with-no-gurmukhi-skipped', html:card({g:'ਅ ॥੧॥',e:'One. ||1|| Extra. ||2||'}) },
  { name:'extra-gurmukhi-stanza-empty-translation', html:card({g:'ਅ ॥੧॥ ਬ ॥੨॥',e:'One. ||1||'}) },
  { name:'missing-gurmukhi-card', html:'<div class="fs-5 customDate">Synthetic date</div><div class="hukamnama-card2"><div class="hukamnama-title">English Translation</div><div class="hukamnama-text">One.</div></div>' },
  { name:'selectors-missing', html:'<html><body><main>Not a scraper source</main></body></html>', expected:{date:'',ang:'',title:'',lines:[]} },
  { name:'script-mutates-source', html:card({title:'Raw synthetic'}) + '<script>document.querySelector(".hukamnama-title").textContent="Rendered synthetic";</script>', expectsRenderingDifference:true },
];
