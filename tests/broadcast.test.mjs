import assert from 'node:assert/strict';
import test from 'node:test';
import { broadcastBackground, obsBrowserSourceUrl, restoreBroadcastBackground } from '../src/broadcast.mjs';

test('broadcast URL and background transitions are deterministic', () => {
  assert.equal(obsBrowserSourceUrl('http://127.0.0.1:4173', '/app/'), 'http://127.0.0.1:4173/app/?broadcast=1&background=transparent');
  assert.deepEqual(broadcastBackground('studio'), { background: 'transparent', previous: 'studio' });
  assert.deepEqual(broadcastBackground('green'), { background: 'green', previous: null });
  assert.equal(restoreBroadcastBackground('transparent', 'studio'), 'studio');
  assert.equal(restoreBroadcastBackground('green', null), 'green');
});
