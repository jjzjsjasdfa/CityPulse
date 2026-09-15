import { amapConfig, MAP_PAPER } from './config';
import type { MapRegion } from '../presentation';

// This document is shared by web and native. Markers/halos live in AMap's own
// overlay layer, so panning never waits for a React render or a bridge roundtrip.
// The bridge only sends camera changes at 10 Hz and a final settled position.
export function amapDocument(initialRegion: MapRegion, channel: string) {
  const config = JSON.stringify({ ...amapConfig, initialRegion, channel }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <style>html,body,#map{margin:0;width:100%;height:100%;overflow:hidden;background:${MAP_PAPER};font-family:system-ui,sans-serif}
  #notice{position:absolute;top:42%;left:24px;right:24px;text-align:center;color:#637075;font-size:13px;line-height:1.8;pointer-events:none}
  .pin{width:0;height:0;position:relative;pointer-events:none;transition:opacity .22s}
  .dot,.label{position:absolute;box-sizing:border-box;cursor:pointer;touch-action:none;-webkit-tap-highlight-color:transparent}
  .dot{left:0;top:0;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 1px 3px #17323225;border:2px solid white;transition:width .22s,height .22s,border-color .22s}
  .label{top:22px;left:0;transform:translateX(-50%);text-align:center;font-size:12px;font-weight:800;line-height:16px;padding:3px 5px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;transition:opacity .22s;background:none}
  .star{position:absolute;left:8px;top:-20px;border:1px solid white;border-radius:50%;color:white;font-size:9px;width:12px;height:12px;text-align:center}
  .own{width:18px;height:18px;border:3px solid white;border-radius:50%;background:#287DE3;box-shadow:0 0 0 7px #287DE328;transform:translate(-50%,-50%);pointer-events:none}
  .halo{width:44px;height:44px;position:absolute;left:-22px;top:-22px;pointer-events:none}
  .pulse{width:100%;height:100%;border-radius:50%;animation:pulse 2.4s ease-out infinite;will-change:transform,opacity}
  @keyframes pulse{0%{transform:scale(.05);opacity:0}15%,75%{opacity:1}100%{transform:scale(1);opacity:0}}
  @media(prefers-reduced-motion:reduce){.pulse{animation:none;opacity:.35}.dot,.label,.pin{transition:none}}
  #zoom{position:absolute;right:18px;top:120px;border:1px solid #E2E6E7;border-radius:12px;overflow:hidden;background:white}
  #zoom button{display:block;width:44px;height:44px;border:0;background:white;color:#173232;font-size:24px}
  @media(any-pointer:coarse){#zoom{display:none}}
  </style></head><body><div id="map" aria-label="高德活动地图"></div><div id="notice">高德地图加载中…</div>
  <div id="zoom" hidden><button aria-label="放大地图">＋</button><button aria-label="缩小地图">−</button></div>
  <script>const config=${config};${runtime}</script></body></html>`;
}

const runtime = String.raw`
(() => {
  const send = payload => {
    const data={...payload,channel:config.channel};
    if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(data));
    else window.parent.postMessage(data,'*');
  };
  let map=null, scene={pins:[],position:null,radius:0}, own=null, circle=null, lastCircle='', stopped=false;
  let pendingCamera=null, cameraTimer=0, lastCamera=0, press=null;
  const pins=new Map(), notice=document.getElementById('notice');
  const fail=message=>{notice.textContent=message;notice.hidden=false;send({type:'error',message});};
  function camera(settled) {
    if(!map||stopped)return;
    const b=map.getBounds(),sw=b.getSouthWest(),ne=b.getNorthEast(),c=map.getCenter();
    send({type:'camera',settled,region:{latitude:c.getLat(),longitude:c.getLng(),latitudeDelta:ne.getLat()-sw.getLat(),longitudeDelta:ne.getLng()-sw.getLng()}});
    lastCamera=Date.now();
  }
  function moving() {
    if(Date.now()-lastCamera>=100) camera(false);
    else if(!cameraTimer) cameraTimer=setTimeout(()=>{cameraTimer=0;camera(false);},100);
  }
  function settled(){clearTimeout(cameraTimer);cameraTimer=0;camera(true);}
  function fit(r,immediate) {
    // AMap's Mercator world is 256 * 2^zoom pixels wide.
    const zoom=Math.max(3,Math.min(20,Math.log2(document.body.clientWidth*360/(256*r.longitudeDelta))));
    map.setZoomAndCenter(zoom,[r.longitude,r.latitude],immediate,550);
  }
  function setHalo(entry,p) {
    const deadline=p.unread?p.haloUntil:0;
    if(entry.deadline===deadline)return;
    entry.deadline=deadline;clearTimeout(entry.timer);entry.halo.replaceChildren();
    if(deadline<=Date.now())return;
    const pulse=document.createElement('div');pulse.className='pulse';
    pulse.style.background='radial-gradient(circle,'+p.signal+' 0%,'+p.signal+' 65%,'+p.signal+'00 100%)';
    pulse.style.animationDelay=(-Math.max(0,60000-(deadline-Date.now()))/1000)+'s';
    entry.halo.append(pulse);entry.halo.dataset.testid='activity-halo-'+p.id;
    entry.timer=setTimeout(()=>{entry.halo.replaceChildren();delete entry.halo.dataset.testid;},deadline-Date.now());
  }
  function activate(event,entry) {
    const target=event.target.closest('[data-hit]');
    if(!target||Number(getComputedStyle(target).opacity)<.5||Number(entry.host.style.opacity)<.5)return;
    if(event.type==='keydown') {
      if(event.key!=='Enter'&&event.key!==' ')return;
      event.preventDefault();send({type:'select',id:entry.id});return;
    }
    if(!press||press.cancelled||Date.now()-press.time>1200)return;
    const b=target.getBoundingClientRect();
    const inside=(x,y)=>target===entry.dot?Math.hypot(x-b.x-b.width/2,y-b.y-b.height/2)<=b.width/2:x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom;
    if(inside(press.x,press.y)&&inside(event.clientX,event.clientY))send({type:'select',id:entry.id});
  }
  function update() {
    if(!map)return;
    const keep=new Set(scene.pins.map(p=>p.id));
    for(const [id,e] of pins)if(!keep.has(id)){clearTimeout(e.timer);map.remove(e.marker);pins.delete(id);}
    for(const p of scene.pins) {
      let e=pins.get(p.id);
      if(!e){
        const host=document.createElement('div');host.className='pin';host.dataset.testid='event-marker-'+p.id;
        const halo=document.createElement('div');halo.className='halo';
        const dot=document.createElement('div');dot.className='dot';dot.dataset.testid='event-dot-'+p.id;
        const name=document.createElement('div');name.className='label';name.dataset.testid='name-label-'+p.id;
        const category=document.createElement('div');category.className='label';category.dataset.testid='category-label-'+p.id;
        const star=document.createElement('div');star.className='star';star.textContent='★';
        host.append(halo,dot,name,category,star);
        const marker=new AMap.Marker({position:[p.longitude,p.latitude],content:host,anchor:'top-left',offset:new AMap.Pixel(0,0),bubble:true});
        map.add(marker);e={id:p.id,host,dot,name,category,star,halo,marker,deadline:0,timer:0};pins.set(p.id,e);
        for(const target of [dot,name,category]){target.dataset.hit='1';target.setAttribute('role','button');target.addEventListener('click',event=>activate(event,e));target.addEventListener('keydown',event=>activate(event,e));}
      }
      if(e.lat!==p.latitude||e.lon!==p.longitude){e.marker.setPosition([p.longitude,p.latitude]);e.lat=p.latitude;e.lon=p.longitude;}
      e.host.style.opacity=p.opacity;e.marker.setzIndex(p.saved?1000:100);
      e.dot.style.width=e.dot.style.height=p.diameter+'px';e.dot.style.background=p.color;e.dot.style.borderColor=p.unread?'#101010':'#FFFFFF';e.dot.style.borderWidth=p.unread?'3px':'2px';
      e.dot.style.pointerEvents=p.opacity>=.5?'auto':'none';e.dot.tabIndex=p.opacity>=.5?0:-1;e.dot.setAttribute('aria-label','查看'+p.name);
      for(const [node,text,opacity,width] of [[e.name,p.name,p.nameOpacity,p.width],[e.category,p.category,p.categoryOpacity,80]]){
        node.textContent=text;node.style.color=p.color;node.style.width=width+'px';node.style.opacity=opacity;
        node.style.pointerEvents=opacity>=.5&&p.opacity>=.5?'auto':'none';node.tabIndex=opacity>=.5&&p.opacity>=.5?0:-1;node.setAttribute('aria-label','查看'+p.name);
      }
      e.star.hidden=!p.saved;e.star.style.background=p.color;setHalo(e,p);
    }
    if(scene.position){
      if(!own){const host=document.createElement('div');host.className='own';host.dataset.testid='my-location';host.setAttribute('aria-label','我的位置');own=new AMap.Marker({content:host,anchor:'top-left',offset:new AMap.Pixel(0,0),zIndex:2000,bubble:true});map.add(own);}
      own.setPosition([scene.position.longitude,scene.position.latitude]);
    }else if(own){map.remove(own);own=null;}
    const key=JSON.stringify([scene.position,scene.radius]);
    if(key!==lastCircle){
      lastCircle=key;if(circle){map.remove(circle);circle=null;}
      if(scene.position&&scene.radius>0){circle=new AMap.Circle({center:[scene.position.longitude,scene.position.latitude],radius:scene.radius*1000,strokeColor:'#38BDB6',strokeWeight:1,strokeStyle:'dashed',fillOpacity:0,bubble:true});map.add(circle);}
    }
  }
  window.citypulseReceive=data=>{
    if(data.channel!==config.channel)return;
    if(data.type==='scene'){scene=data.scene;update();}
    if(data.type==='camera'){pendingCamera=data.region;if(map)fit(data.region,false);}
  };
  window.addEventListener('message',event=>{if(window.parent!==window&&event.source===window.parent)window.citypulseReceive(event.data||{});});
  document.addEventListener('pointerdown',event=>{press={x:event.clientX,y:event.clientY,time:Date.now(),cancelled:!event.isPrimary};send({type:'interaction',active:true});},true);
  document.addEventListener('pointermove',event=>{if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>6)press.cancelled=true;},true);
  document.addEventListener('pointerup',()=>send({type:'interaction',active:false}),true);
  document.addEventListener('pointercancel',()=>{if(press)press.cancelled=true;send({type:'interaction',active:false});},true);
  if(!config.key||!config.serviceHost){fail('高德地图待配置 · 请配置地图 Key 和安全代理');return;}
  try{const url=new URL(config.serviceHost);if(!['http:','https:'].includes(url.protocol))throw new Error();}catch{fail('高德安全代理地址无效，请检查配置');return;}
  window._AMapSecurityConfig={serviceHost:config.serviceHost};
  const timeout=setTimeout(()=>fail('高德地图加载超时，请检查网络及地图配置'),20000);
  const script=document.createElement('script');script.src='https://webapi.amap.com/maps?v=2.0&key='+encodeURIComponent(config.key);
  script.onerror=()=>{clearTimeout(timeout);fail('高德地图加载失败，请检查网络及地图配置');};
  script.onload=()=>{
    try {
      map=new AMap.Map('map',{viewMode:'2D',rotateEnable:false,pitchEnable:false,zoomEnable:true,dragEnable:true,zoom:15,
        center:[config.initialRegion.longitude,config.initialRegion.latitude],mapStyle:config.style,
        features:['bg','road'],showIndoorMap:false,showBuildingBlock:false,showLabel:true,resizeEnable:true});
      map.on('complete',()=>{clearTimeout(timeout);notice.hidden=true;send({type:'ready'});settled();});
      map.on('mapmove',moving);map.on('zoomchange',moving);map.on('moveend',settled);map.on('zoomend',settled);
      map.on('error',()=>{clearTimeout(timeout);fail('高德地图不可用，请检查 Key、域名白名单及安全代理');});
      fit(pendingCamera||config.initialRegion,true);update();
      const zoom=document.getElementById('zoom');zoom.hidden=navigator.maxTouchPoints>0;
      zoom.children[0].onclick=()=>map.setZoom(map.getZoom()+.5,false,350);
      zoom.children[1].onclick=()=>map.setZoom(map.getZoom()-.5,false,350);
      map.on('resize',settled);
      window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timeout);clearTimeout(cameraTimer);for(const e of pins.values())clearTimeout(e.timer);map.destroy();},{once:true});
    }catch{clearTimeout(timeout);fail('高德地图初始化失败，请检查配置及设备 WebGL 支持');}
  };
  document.head.append(script);
})();`;
