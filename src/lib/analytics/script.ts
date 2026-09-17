/**
 * 計測タグ本体（/t.js が返す JavaScript）。文字列として持つ（ビルドの都合で .js を配信しない）。
 *
 * 送るもの: ページビュー（パス・参照元・UTM・自サイトのホスト）、離脱（滞在秒・スクロール到達 %）、
 * 電話 / メール / 外部リンクのタップ、フォーム送信。Cookie も localStorage も使わない。
 * SPA のルーター（pushState）にも追従する。
 *
 * 収集口の URL は自分の src から作る（app.seo-checker.tokyo/t.js → app.seo-checker.tokyo/api/t）。
 * 送信は sendBeacon（無ければ fetch keepalive）。本文は text/plain にして、CORS のプリフライトを起こさない。
 */
export const TRACKING_SCRIPT = `(function(){
var s=document.currentScript;if(!s)return;
var site=s.getAttribute("data-site");if(!site)return;
if(navigator.webdriver)return;
var ep=s.src.replace(/\\/t\\.js(\\?.*)?$/,"/api/t");
var start=Date.now(),maxScroll=0,left=false;
function send(ev,beacon){
  var body=JSON.stringify({site:site,events:ev});
  try{
    if(beacon&&navigator.sendBeacon){navigator.sendBeacon(ep,new Blob([body],{type:"text/plain"}));return;}
    fetch(ep,{method:"POST",body:body,headers:{"content-type":"text/plain"},keepalive:true,credentials:"omit"}).catch(function(){});
  }catch(e){}
}
function utm(){
  var out={};try{var p=new URLSearchParams(location.search);["utm_source","utm_medium","utm_campaign"].forEach(function(k){var v=p.get(k);if(v)out[k]=v;});}catch(e){}
  return out;
}
function view(){
  start=Date.now();maxScroll=0;left=false;
  send([{t:"pageview",p:location.pathname,r:document.referrer||"",h:location.host,u:utm()}]);
}
function leave(){
  if(left)return;left=true;
  send([{t:"leave",p:location.pathname,s:Math.round((Date.now()-start)/1000),sc:maxScroll}],true);
}
function scrolled(){
  var h=document.documentElement,total=h.scrollHeight-window.innerHeight;
  if(total<=0){maxScroll=100;return;}
  var pct=Math.round(window.scrollY/total*100);if(pct>maxScroll)maxScroll=Math.min(100,pct);
}
document.addEventListener("click",function(e){
  var t=e.target;if(!t||!t.closest)return;var a=t.closest("a[href]");if(!a)return;
  var href=a.getAttribute("href")||"",kind="",host="";
  if(/^tel:/i.test(href))kind="tel";
  else if(/^mailto:/i.test(href))kind="mail";
  else if(/^https?:/i.test(href)&&a.host&&a.host!==location.host){kind="external";host=a.host;}
  if(!kind)return;
  send([{t:"click",p:location.pathname,k:kind,x:host}],true);
},true);
document.addEventListener("submit",function(){send([{t:"form",p:location.pathname}],true);},true);
window.addEventListener("scroll",scrolled,{passive:true});
window.addEventListener("pagehide",leave);
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")leave();});
var push=history.pushState;
if(push){history.pushState=function(){leave();push.apply(history,arguments);setTimeout(view,0);};}
window.addEventListener("popstate",function(){leave();setTimeout(view,0);});
view();
})();
`;
