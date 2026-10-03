export const THEME_KEY = "unipub:theme";
export const SPLASH_KEY = "unipub:splash";
export const SPLASH_TTL_MS = 24 * 60 * 60 * 1000;
export const SPLASH_MS = 1200;

/**
 * Runs in <head> before first paint (nonce-allowed): resolves the theme, flags weak devices,
 * pauses ambient animation on hidden tabs and decides whether to show the splash.
 * Must stay dependency-free and tiny; it is inlined into every HTML response.
 */
export const headScript = `(function(){var d=document.documentElement,ls;try{ls=window.localStorage}catch(e){}
function get(k){try{return ls&&ls.getItem(k)}catch(e){return null}}
function set(k,v){try{ls&&ls.setItem(k,v)}catch(e){}}
var s=get(${JSON.stringify(THEME_KEY)});var t=s==="light"||s==="dark"?s:(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");
d.setAttribute("data-theme",t);
var n=navigator;if((n.hardwareConcurrency&&n.hardwareConcurrency<=4)||(n.deviceMemory&&n.deviceMemory<=4)||(n.connection&&n.connection.saveData))d.setAttribute("data-lite","");
document.addEventListener("visibilitychange",function(){document.hidden?d.setAttribute("data-hidden",""):d.removeAttribute("data-hidden")});
var q=location.search,h=location.hash;
if(/[?&](t|table|dish)=/.test(q)||h.indexOf("#dish-")===0)return;
var last=+get(${JSON.stringify(SPLASH_KEY)})||0;if(Date.now()-last<${SPLASH_TTL_MS})return;
set(${JSON.stringify(SPLASH_KEY)},String(Date.now()));d.setAttribute("data-splash","");
var done=false;function hide(){if(done)return;done=true;var el=document.getElementById("splash");if(el)el.classList.add("is-leaving");setTimeout(function(){d.removeAttribute("data-splash")},el&&!matchMedia("(prefers-reduced-motion: reduce)").matches?240:0)}
setTimeout(hide,${SPLASH_MS - 240});document.addEventListener("pointerdown",hide,{once:true});document.addEventListener("keydown",hide,{once:true});})();`;
