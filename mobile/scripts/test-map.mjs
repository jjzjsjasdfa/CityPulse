import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadSource(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { getTimeSize, getMapLevel, mapDetail, boundsFromRegion, isInBounds, visibleMapPoints, queryBounds, TIME_SIZES, DAY_MS } =
  await loadSource('../src/map/presentation.ts');
const { loadMapPages } = await loadSource('../src/map/loadPages.ts');
const now = Date.parse('2026-09-13T12:00:00+08:00');
const point = (days = 0, extras = {}) => ({
  id: 'one', name: '测试活动', category: 'performance', status: 'announced',
  latitude: 28.2, longitude: 112.96,
  starts_at: new Date(now + days * DAY_MS).toISOString(),
  ends_at: new Date(now + (days + 1) * DAY_MS).toISOString(), ...extras,
});
const bounds = (widthKm) => ({ west: 0, east: widthKm / 111.32, south: -1, north: 1 });

test('zoom detail blends continuously and reversibly without mixing opaque labels', () => {
  assert.deepEqual(mapDetail(2), { name: 1, category: 0, unsaved: 1 });
  assert.deepEqual(mapDetail(20), { name: 0, category: 0, unsaved: 1 });
  assert.equal(mapDetail(40).unsaved, 0);
  for (const boundary of [2, 2.5, 3, 9, 11, 13, 30, 40]) {
    const a = mapDetail(boundary - 0.0001), b = mapDetail(boundary + 0.0001);
    assert.ok(Math.abs(a.name - b.name) < 0.002 && Math.abs(a.category - b.category) < 0.002 && Math.abs(a.unsaved - b.unsaved) < 0.002);
  }
  for (let width = 0; width <= 1500; width++) {
    const d = mapDetail(width);
    assert.ok(d.name + d.category <= 1.00001 && d.unsaved >= 0 && d.unsaved <= 1);
  }
});

test('six sizes: live interval and inclusive 3/7/15/30 day boundaries', () => {
  assert.equal(getTimeSize(point(), now).diameter, 30);
  for (const [days, diameter] of [[3, 26], [7, 22], [15, 18], [30, 15]]) {
    assert.equal(getTimeSize(point(days), now).diameter, diameter);
    assert.ok(getTimeSize(point(days + 1 / DAY_MS), now).diameter < diameter);
  }
  assert.equal(getTimeSize(point(45), now).diameter, 12);
  assert.deepEqual(TIME_SIZES.map((size) => size.diameter), [30, 26, 22, 18, 15, 12]);
});

test('ended, invalid, cancelled and postponed dates never appear live', () => {
  assert.equal(getTimeSize(point(-0.5), now).diameter, 30);
  assert.equal(getTimeSize(point(-1), now).diameter, 12);
  for (const status of ['ended', 'cancelled', 'postponed']) {
    assert.equal(getTimeSize(point(-0.5, { status }), now).diameter, 12);
  }
  assert.equal(getTimeSize(point(0, { starts_at: 'invalid' }), now).diameter, 12);
  assert.equal(getTimeSize(point(0, { ends_at: new Date(now - 1).toISOString() }), now).diameter, 12);
  // Same instant expressed in different time zones must give the same answer.
  assert.equal(getTimeSize(point(0, { starts_at: '2026-09-13T04:00:00Z' }), now).diameter, 30);
});

test('ground width selects saved, province dots, city categories and neighborhood names', () => {
  for (const [width, level] of [[40, 'saved'], [39, 'dots'], [12, 'dots'], [11, 'categories'], [3, 'categories'], [2.5, 'names']]) {
    assert.equal(getMapLevel(bounds(width)), level);
  }
  assert.equal(getMapLevel({ west: 0, east: 22, south: 80, north: 81 }), 'saved');
  assert.equal(getMapLevel({ west: 0, east: 1, south: -20, north: 20 }), 'saved');
});

test('viewport clips points and national view uses favorites even if ended', () => {
  const local = boundsFromRegion({ latitude: 28.2, longitude: 112.96, latitudeDelta: 0.4, longitudeDelta: 0.4 });
  const wide = boundsFromRegion({ latitude: 28.2, longitude: 112.96, latitudeDelta: 35, longitudeDelta: 28 });
  const points = [point(), point(2, { id: 'saved' }), point(1, { id: 'outside', latitude: 70 }), point(-5, { id: 'ended', status: 'ended' })];
  const saved = new Set(['saved', 'ended']);
  assert.deepEqual(visibleMapPoints(points, local, saved, now).map((p) => p.id), ['one', 'saved']);
  assert.deepEqual(visibleMapPoints(points, wide, saved, now).map((p) => p.id), ['saved', 'ended']);
  assert.deepEqual(visibleMapPoints(points, wide, new Set(), now), []);
  assert.equal(isInBounds({ longitude: local.west, latitude: local.north }, local), true);
});

test('date-line viewports split into valid envelopes and retain points on either side', () => {
  const crossing = boundsFromRegion({ latitude: 0, longitude: 180, latitudeDelta: 2, longitudeDelta: 2 });
  assert.equal(isInBounds({ latitude: 0, longitude: 179.5 }, crossing), true);
  assert.equal(isInBounds({ latitude: 0, longitude: -179.5 }, crossing), true);
  assert.equal(isInBounds({ latitude: 0, longitude: 0 }, crossing), false);
  assert.deepEqual(queryBounds(crossing), [
    { west: 179, east: 180, south: -1, north: 1 }, { west: -180, east: -179, south: -1, north: 1 },
  ]);
});

test('loads every page beyond 500 points with progressive batches', async () => {
  const all = Array.from({ length: 1205 }, (_, i) => point(1, { id: String(i) }));
  const offsets = [], batches = [];
  const result = await loadMapPages(async (offset) => {
    offsets.push(offset);
    const next = offset + 500;
    return { data: all.slice(offset, next), meta: { has_next: next < all.length, next_offset: next < all.length ? next : null } };
  }, undefined, (batch) => batches.push(batch.length));
  assert.equal(result.length, 1205);
  assert.deepEqual(offsets, [0, 500, 1000]);
  assert.deepEqual(batches, [500, 1000, 1205]);
});

test('cancellation ignores a late response and never requests its next page', async () => {
  const controller = new AbortController();
  let respond;
  const batches = [];
  const pending = loadMapPages(() => new Promise((resolve) => { respond = resolve; }), controller.signal, (batch) => batches.push(batch));
  controller.abort();
  respond({ data: [point()], meta: { has_next: true, next_offset: 500 } });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(batches.length, 0);
});

test('rejects stalled pagination and deduplicates overlapping pages', async () => {
  await assert.rejects(loadMapPages(async () => ({ data: [], meta: { has_next: true, next_offset: 0 } })), /分页/);
  const result = await loadMapPages(async (offset) => ({
    data: [point()], meta: { has_next: offset === 0, next_offset: offset === 0 ? 1 : null },
  }));
  assert.equal(result.length, 1);
});
