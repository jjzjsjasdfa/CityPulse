import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function moduleURL(path, replace = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  for (const [name, url] of Object.entries(replace)) outputText = outputText.replaceAll(`'${name}'`, `'${url}'`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const geoURL = await moduleURL('../src/map/geo.ts');
const { markerSlots } = await import(await moduleURL('../src/map/markerLayout.ts', {'./geo':geoURL}));
test('only full names group nearby overlapping coordinates; coarse layers preserve every dot', () => {
  const region={latitude:28.2,longitude:113,latitudeDelta:0.04,longitudeDelta:0.02}, size={width:390,height:844};
  const points=[{id:'a',latitude:28.2,longitude:113},{id:'b',latitude:28.2,longitude:113},{id:'c',latitude:28.2,longitude:113.001}];
  const names=markerSlots(points,region,size,new Set(),144,true,true);
  assert.deepEqual(names.map(slot=>slot.events.map(event=>event.id)),[['a','b'],['c']]);
  for(const mode of [[false,true],[false,false],[true,false]]) {
    const slots=markerSlots(points,region,size,new Set(),144,...mode);
    assert.equal(slots.length,3);
    assert.ok(slots.every(slot=>slot.events.length===1));
  }
  assert.ok(Math.abs(names[1].x-390*(0.5+0.001/0.02))<1e-6);
});
const { regionAtDefaultScale, scaleBar, distanceKm, projectPoint } = await import(geoURL);
const { directionWeights, guidanceTargets, advanceGlows, glowLobes, edgePoint } = await import(
  await moduleURL('../src/map/guidance.ts', { './geo': geoURL }));
const { mergeNearby, acknowledgeNearby, readNearbyState, viewNearby, EMPTY_NEARBY } = await import(await moduleURL('../src/map/nearbyState.ts'));
const { labelIds } = await import(await moduleURL('../src/map/labelLayout.ts', {
  './geo': geoURL, './presentation': await moduleURL('../src/map/presentation.ts'),
}));
const guidanceURL = await moduleURL('../src/map/guidance.ts', {'./geo':geoURL});
const { ribbonGeometry, ribbonColor } = await import(await moduleURL('../src/map/ribbon.ts', {
  './guidance':guidanceURL, '../theme':await moduleURL('../src/theme.ts'),
}));
const origin = { latitude: 28.2, longitude: 112.96 };
const size = { width: 390, height: 772 };
const region = regionAtDefaultScale(origin, size);
const now = Date.parse('2026-09-13T04:00:00Z');
const event = (id, dx, dy, category = 'performance') => ({
  id, latitude: origin.latitude + dy / 111.32,
  longitude: origin.longitude + dx / (111.32 * Math.cos(origin.latitude * Math.PI / 180)),
  category, name: id, status: 'announced', published_at: new Date(now - 60000).toISOString(),
  starts_at: new Date(now + 86400000).toISOString(), ends_at: new Date(now + 2 * 86400000).toISOString(),
});

test('dense labels prioritize favorites, keep all dots, and reveal more names after zooming', () => {
  const points = [event('a', -0.1, 0), event('b', 0.1, 0)];
  const saved = new Set(['b']);
  assert.deepEqual([...labelIds(points, region, size, saved, 144, true, now)], ['b']);
  const zoomed = { ...region, longitudeDelta: region.longitudeDelta / 5, latitudeDelta: region.latitudeDelta / 5 };
  assert.equal(labelIds(points, zoomed, size, saved, 144, true, now).size, 2);
  assert.equal(points.length, 2);
});

test('100 screen units represent 500 m at launch across phone sizes and latitudes', () => {
  for (const width of [320, 390, 768]) for (const latitude of [0, 28.2, 60]) {
    const r = regionAtDefaultScale({ ...origin, latitude }, { width, height: 772 });
    const scale = scaleBar(r, width);
    assert.equal(scale.label, '500 米');
    assert.ok(Math.abs(scale.width - 100) < 0.001);
    assert.deepEqual(projectPoint({ ...origin, latitude }, r, { width, height: 772 }), { x: width / 2, y: 386 });
  }
});

test('eight compass directions wrap smoothly at north and preserve unit weight', () => {
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const weights = directionWeights(Math.sin(angle), -Math.cos(angle));
    assert.equal(weights.find((w) => w.weight > 0.99).direction, i);
    assert.ok(Math.abs(weights.reduce((sum, w) => sum + w.weight, 0) - 1) < 1e-6);
  }
  const before = directionWeights(-0.001, -1).find((w) => w.direction === 0).weight;
  const after = directionWeights(0.001, -1).find((w) => w.direction === 0).weight;
  assert.ok(Math.abs(before - after) < 0.001);
});

test('15 km radius is tied to the user, while panning recomputes the screen direction', () => {
  const inside = event('inside', 3, 0), outside = event('outside', 16, 0);
  assert.ok(distanceKm(origin, inside) < 15 && distanceKm(origin, outside) > 15);
  const first = guidanceTargets([inside, outside], origin, region, size, now);
  assert.deepEqual(first.targets.map((t) => t.direction), [2]);
  const past = { ...region, longitude: inside.longitude + 0.06 };
  assert.deepEqual(guidanceTargets([inside], origin, past, size, now).targets.map((t) => t.direction), [6]);
  assert.deepEqual(guidanceTargets([outside], origin, { ...region, longitude: outside.longitude }, size, now).central, []);
  assert.deepEqual(guidanceTargets([inside], null, region, size, now).targets, []);
});

test('debug radius zero disables signals; 30 km includes farther activities', () => {
  const far = event('far', 20, 0);
  assert.equal(guidanceTargets([far],origin,region,size,now,120,true,undefined,15).targets.length,0);
  assert.equal(guidanceTargets([event('center',0,0)],origin,region,size,now,120,true,undefined,0).central.length,0);
  assert.ok(guidanceTargets([far],origin,region,size,now,120,true,undefined,30).targets.length>0);
});

test('fixed-size ribbon closes every edge and corner with bright opaque colors', () => {
  const geometry=ribbonGeometry(size);
  assert.equal(geometry.length,32);
  const glows=Array.from({length:8},(_,direction)=>({key:String(direction),direction,category:'performance',strength:0.8,proximity:0.7,impulse:0,phase:0,multi:0}));
  geometry.forEach((part,index)=>{
    assert.deepEqual(part.b,geometry[(index+1)%geometry.length].a,'adjacent strips share exactly the same outer endpoint');
    const sample=ribbonColor(part.a.x,part.a.y,part.t,size,glows,1,0,[]);
    assert.equal(sample.opacity,1,'all active directions cover the complete outer perimeter');
    assert.equal(sample.color,'rgb(255,120,107)');
  });
  assert.equal(ribbonColor(0,0,0,size,[],0,0,[]).opacity,0);
});

test('central area acknowledges a visible event away from the exact center, not hidden or edge events', () => {
  const seen = event('seen', 0.4, 0), edge = event('edge', 0.9, 0);
  const result = guidanceTargets([seen, edge], origin, region, size, now);
  assert.deepEqual(result.central, ['seen']);
  assert.ok(result.targets.some((target) => target.direction === 2));
  assert.deepEqual(guidanceTargets([seen], origin, region, size, now, 120, false).central, []);
  assert.deepEqual(guidanceTargets([seen], origin, region, size, now, 120, true, new Set()).central, [], 'native markers not yet mounted during a pan must stay unread');
  assert.equal(guidanceTargets([{ ...edge, status: 'cancelled' }], origin, region, size, now).targets.length, 0);
});

test('direction changes interpolate, near activity responds more strongly, fade-out finishes', () => {
  const target = { key: '2:performance', direction: 2, category: 'performance', strength: 0.8, proximity: 1 };
  const near = advanceGlows([], [target], 0.033)[0];
  const far = advanceGlows([], [{ ...target, proximity: 0 }], 0.033)[0];
  assert.ok(near.strength > far.strength && near.impulse > far.impulse);
  assert.ok(near.strength > 0 && near.strength < target.strength);
  let glows = [near];
  const fading = advanceGlows(glows, [], 0.033);
  assert.ok(fading[0].strength > 0 && fading[0].strength < near.strength);
  for (let i = 0; i < 150; i++) glows = advanceGlows(glows, [], 0.033);
  assert.equal(glows.length, 0);
});

test('same-direction categories alternate; moving overlapping lobes join corners softly', () => {
  const glows = ['performance', 'sports'].map((category, index) => ({ key: `1:${category}`, direction: 1, category, strength: 0.8, proximity: 0.8, impulse: 0.1, phase: index * Math.PI, multi: 1 }));
  const a = glowLobes(glows, 0, size), b = glowLobes(glows, Math.PI / 1.7, size);
  assert.ok((a[0].opacity - a[2].opacity) * (b[0].opacity - b[2].opacity) < 0);
  assert.notEqual(a[0].x + a[0].y, b[0].x + b[0].y);
  const cornerA = edgePoint(Math.PI / 4 - 0.001, size), cornerB = edgePoint(Math.PI / 4 + 0.001, size);
  assert.ok(Math.hypot(cornerA.x - cornerB.x, cornerA.y - cornerB.y) < 2);
  assert.deepEqual(glowLobes(glows, 0, size, true), glowLobes(glows, 50, size, true));
  const remaining = advanceGlows(glows, [{ ...glows[0] }], 0.033).find((glow) => glow.category === 'performance');
  assert.ok(remaining.multi > 0.9 && remaining.multi < 1, 'removing another category must not instantly reset the wave cycle');
});

test('stored cursor, pending activity and acknowledgement survive overlap and partial failures', () => {
  const one = event('one', 3, 0), two = event('two', 4, 0);
  const checkpoint = new Date(now).toISOString();
  let state = mergeNearby(EMPTY_NEARBY, [one, two], checkpoint, now);
  state = acknowledgeNearby(state, ['one']);
  state = readNearbyState(JSON.stringify(state));
  state = mergeNearby(state, [one, two], checkpoint, now);
  assert.deepEqual(state.pending.map((e) => e.id), ['two']);
  assert.deepEqual(state.unread.map((e) => e.id), ['one', 'two'], 'appearing on the map must not count as opening details');
  state = viewNearby(state, 'one');
  state = mergeNearby(readNearbyState(JSON.stringify(state)), [one, two], checkpoint, now);
  assert.deepEqual(state.unread.map((e) => e.id), ['two'], 'opened version stays read across reload/poll');
  state = mergeNearby(state, [{...one, published_at:new Date(now+1).toISOString()}], checkpoint, now+1);
  assert.ok(state.unread.some((e) => e.id === 'one'), 'republished activity becomes unread again');
  assert.equal(state.watermark, checkpoint);
  assert.deepEqual(readNearbyState('bad json'), EMPTY_NEARBY);
});
