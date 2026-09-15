import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../src/map/amap/coordinates.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {wgsToGcj,gcjToWgs,convertRegion}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('GCJ display coordinates agree with the backend normalization convention',()=>{
  const p={longitude:116.397128,latitude:39.916527};
  const gcj=wgsToGcj(p);
  assert.ok(Math.abs(gcj.longitude-116.403372494)<1e-8);
  assert.ok(Math.abs(gcj.latitude-39.917930749)<1e-8);
  for(const p of [{longitude:112.976,latitude:28.194}, {longitude:121.47,latitude:31.23}, {longitude:87.6,latitude:43.8}]){
    const restored=gcjToWgs(wgsToGcj(p));
    assert.ok(Math.abs(restored.longitude-p.longitude)<1e-8);
    assert.ok(Math.abs(restored.latitude-p.latitude)<1e-8);
  }
});
test('coordinates outside the conversion region remain unchanged',()=>{
  const p={latitude:48.85,longitude:2.35};assert.deepEqual(wgsToGcj(p),p);assert.deepEqual(gcjToWgs(p),p);
});
test('viewport roundtrip retains the bounds used by the event API',()=>{
  const r={latitude:28.194,longitude:112.976,latitudeDelta:.04,longitudeDelta:.02};
  const restored=convertRegion(convertRegion(r,wgsToGcj),gcjToWgs);
  for(const key of Object.keys(r))assert.ok(Math.abs(restored[key]-r[key])<1e-6);
});
