// Offline adapter contract test. The fixture is NOT a real AMap service or tile test.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import ts from 'typescript';
import { chromium } from 'playwright-core';

async function documentFactory(config) {
  let source=await readFile(new URL('../src/map/amap/document.ts',import.meta.url),'utf8');
  source=source.replace("import { amapConfig, MAP_PAPER } from './config';",`const amapConfig=${JSON.stringify(config)}, MAP_PAPER='#F8F9FA';`);
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).amapDocument;
}
const fixture=String.raw`
class LngLat {constructor(lng,lat){this.lng=lng;this.lat=lat;}getLng(){return this.lng;}getLat(){return this.lat;}}
class MapFixture {
 constructor(id,options){window.mapOptions=options;window.fixtureMap=this;this.element=document.getElementById(id);this.listeners={};this.center=new LngLat(...options.center);this.zoom=options.zoom;this.overlays=[];setTimeout(()=>this.emit('complete'),10);}
 on(event,fn){(this.listeners[event]??=[]).push(fn);}
 emit(event){for(const fn of this.listeners[event]??[])fn();}
 getCenter(){return this.center;}getZoom(){return this.zoom;}
 getBounds(){const span=360*document.body.clientWidth/(256*2**this.zoom),dy=span*document.body.clientHeight/document.body.clientWidth;return {getSouthWest:()=>new LngLat(this.center.lng-span/2,this.center.lat-dy/2),getNorthEast:()=>new LngLat(this.center.lng+span/2,this.center.lat+dy/2)};}
 setZoomAndCenter(z,c){this.zoom=z;this.center=new LngLat(...c);for(const o of this.overlays)o.render?.();this.emit('mapmove');this.emit('moveend');}
 setZoom(z){this.setZoomAndCenter(z,[this.center.lng,this.center.lat]);this.emit('zoomend');}
 add(o){this.overlays.push(o);o.map=this;o.render?.();}remove(o){this.overlays=this.overlays.filter(x=>x!==o);o.host?.remove();}
 resize(){}destroy(){this.element.replaceChildren();}
}
class Marker {constructor(o){this.host=o.content;this.position=o.position;}
 setPosition(p){this.position=p;this.render();}setzIndex(z){this.host.style.zIndex=z;}
 render(){if(!this.map||!this.position)return;this.map.element.append(this.host);const span=360*document.body.clientWidth/(256*2**this.map.zoom);this.host.style.position='absolute';this.host.style.left=(document.body.clientWidth*(.5+(this.position[0]-this.map.center.lng)/span))+'px';this.host.style.top=(document.body.clientHeight/2-(this.position[1]-this.map.center.lat)/span*document.body.clientWidth)+'px';}}
window.AMap={Map:MapFixture,Marker,Pixel:class{},Circle:class{}};
`;
const initial={latitude:28.2,longitude:112.98,latitudeDelta:.04,longitudeDelta:.02};
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
try {
 const missing=await documentFactory({key:'',serviceHost:'',style:'amap://styles/whitesmoke'});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.setContent(missing(initial,'test'));
 await page.getByText('高德地图待配置 · 请配置地图 Key 和安全代理').waitFor();
 assert.equal(requests.length,0,'missing credentials must not fetch another map provider');await page.close();
 for(const touch of [false,true]) {
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:touch,isMobile:touch});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://webapi.amap.com/maps?**',r=>r.fulfill({contentType:'application/javascript',body:fixture}));
  const html=await documentFactory({key:'offline-fixture',serviceHost:'https://fixture.invalid/_AMapService',style:'amap://styles/whitesmoke'});
  await page.setContent(html(initial,'test'));
  await page.waitForFunction(()=>window.fixtureMap);
  await page.evaluate(()=>{window.messages=[];window.addEventListener('message',e=>window.messages.push(e.data));});
  const pin={...initial,id:'one',name:'<img src=x onerror=alert(1)> 测试活动',category:'演出',color:'#BC4436',signal:'#FF786B',diameter:30,width:140,saved:true,unread:true,haloUntil:Date.now()+60000,nameOpacity:1,categoryOpacity:0,opacity:1};
  const scene={pins:[pin],position:{latitude:28.203,longitude:112.98},radius:7};
  const send=scene=>page.evaluate(scene=>window.citypulseReceive({channel:'test',type:'scene',scene}),scene);
  await send(scene);
  const options=await page.evaluate(()=>window.mapOptions);
  assert.equal(options.mapStyle,'amap://styles/whitesmoke');assert.deepEqual(options.features,['bg','road']);
  assert.equal(await page.locator('img').count(),0,'event text cannot inject markup');
  assert.equal(await page.getByRole('button',{name:'放大地图',exact:true}).isVisible(),!touch);
  const dot=page.getByTestId('event-dot-one'),halo=page.getByTestId('activity-halo-one');
  const b=await dot.boundingBox();
  await page.mouse.click(b.x-12,b.y+15);assert.equal(await page.evaluate(()=>window.messages.filter(m=>m.type==='select').length),0);
  if(touch)await page.touchscreen.tap(b.x+15,b.y+15);else await dot.click();
  await page.waitForFunction(()=>window.messages.some(m=>m.type==='select'&&m.id==='one'));
  const pulse=await halo.locator('.pulse').elementHandle();
  await send(scene);assert.equal(await pulse.evaluate(node=>node.isConnected),true,'same deadline must not recreate pulse');
  await page.evaluate(()=>window.fixtureMap.setZoomAndCenter(15,[112.981,28.201]));
  const a=await dot.boundingBox(),h=await halo.boundingBox();
  assert.ok(Math.abs(a.x+a.width/2-h.x-h.width/2)<.1&&Math.abs(a.y+a.height/2-h.y-h.height/2)<.1,JSON.stringify({message:'halo remains anchored during camera movement',a,h}));
  const before=await page.evaluate(()=>window.messages.filter(m=>m.type==='select').length);
  await page.mouse.move(a.x+15,a.y+15);await page.mouse.down();await page.mouse.move(a.x+55,a.y+35,{steps:5});await page.mouse.up();
  assert.equal(await page.evaluate(()=>window.messages.filter(m=>m.type==='select').length),before);
  await send({...scene,pins:[{...pin,unread:false,haloUntil:0}]});assert.equal(await page.locator('.pulse').count(),0);
  await send({...scene,pins:[{...pin,haloUntil:Date.now()+100}]});await page.waitForTimeout(150);assert.equal(await page.locator('.pulse').count(),0);
  await send({...scene,pins:[],position:null,radius:0});assert.equal(await page.locator('.pin,.own').count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS (offline AMap fixture): configuration gate, pale style/layers, safe labels, touch controls, hit targets, marker/halo alignment, acknowledgement/expiry and removal. Real AMap/network/native device verification still required.');
} finally {await browser.close();}
