import assert from 'node:assert/strict';
import test from 'node:test';
import { demoApiURL } from '../src/api/demoHost.ts';

test('Expo Go uses the development computer on Android and iOS', () => {
  for (const platform of ['android', 'ios']) {
    assert.equal(demoApiURL(undefined, '192.168.2.49:8081', platform), 'http://192.168.2.49:18082/api/v1');
    assert.equal(demoApiURL(undefined, 'exp://192.168.2.49:8081', platform), 'http://192.168.2.49:18082/api/v1');
  }
});
test('explicit remote API wins; web follows its own host', () => {
  assert.equal(demoApiURL('https://demo.example/api/v1/', '192.168.2.49:8081', 'ios'), 'https://demo.example/api/v1');
  assert.equal(demoApiURL(undefined, 'localhost:8081', 'web', '192.168.2.49'), 'http://192.168.2.49:18082/api/v1');
});
test('offline bundles retain emulator fallback and tolerate invalid hosts', () => {
  assert.equal(demoApiURL(undefined, undefined, 'android'), 'http://10.0.2.2:18082/api/v1');
  assert.equal(demoApiURL(undefined, 'bad host', 'ios'), 'http://localhost:18082/api/v1');
});
