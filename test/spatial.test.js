// space as a bus citizen: passive indexing of pose-bearing traffic, query
// vocabulary under the one reserved key, bus.spatial installed for direct use.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '@orbitalfoundation/bus';
import { attach } from '../src/spatial.js';

function setup() {
  const bus = createBus({ description: 'spatial-test' });
  const service = attach(bus, { cellSize: 10 });
  return { bus, service };
}

test('pose-bearing entity traffic is indexed passively; pose null removes', async () => {
  const { bus } = setup();
  await bus.resolve({ id: 'reef-1', pose: { position: [0, 0, 0], extent: 2 } });
  await bus.resolve({ id: 'fish-1', pose: { position: [3, 0, 0] } });
  await bus.resolve({ id: 'fish-2', pose: { position: [40, 0, 0] } });

  const near = await bus.resolve({ spatial: { query: { op: 'near', position: [0, 0, 0], radius: 5 } } });
  assert.deepEqual(near.map((x) => x.id), ['reef-1', 'fish-1']);
  assert.deepEqual(near[1].pose, { position: [3, 0, 0] }); // the full component comes back

  await bus.resolve({ id: 'fish-1', pose: null });
  const after = await bus.resolve({ spatial: { query: { op: 'near', position: [0, 0, 0], radius: 5 } } });
  assert.deepEqual(after.map((x) => x.id), ['reef-1']);
});

test('a moving agent is tracked, not duplicated', async () => {
  const { bus, service } = setup();
  for (let x = 0; x <= 100; x += 10) {
    await bus.resolve({ id: 'swimmer', pose: { position: [x, 0, 0] } });
  }
  assert.equal(service.size, 1);
  assert.deepEqual((await bus.resolve({ spatial: { query: { op: 'nearest', position: [100, 0, 0], k: 1 } } }))[0].id, 'swimmer');
});

test('query vocabulary: within and nearest; commands: place, remove, clear', async () => {
  const { bus } = setup();
  await bus.resolve({ spatial: { command: { op: 'place', id: 'a', pose: { position: [1, 1, 0] } } } });
  await bus.resolve({ spatial: { command: { op: 'place', id: 'b', pose: { position: [9, 9, 0] } } } });

  const boxed = await bus.resolve({ spatial: { query: { op: 'within', min: [0, 0, 0], max: [5, 5, 5] } } });
  assert.deepEqual(boxed.map((x) => x.id), ['a']);

  assert.equal((await bus.resolve({ spatial: { command: { op: 'remove', id: 'a' } } })).ok, true);
  await bus.resolve({ spatial: { command: { op: 'clear' } } });
  assert.deepEqual(await bus.resolve({ spatial: { query: { op: 'nearest', position: [0, 0, 0], k: 5 } } }), []);
});

test('installed as bus.spatial for direct in-process use', async () => {
  const { bus } = setup();
  await new Promise((r) => setImmediate(r));
  bus.spatial.place('direct', { position: [7, 0, 0], extent: [2, 2, 2] });
  const hit = bus.spatial.near({ position: [7, 0, 0], radius: 1 });
  assert.equal(hit[0].id, 'direct');
  assert.deepEqual(hit[0].pose.extent, [2, 2, 2]);
});

test('malformed places are refused, not indexed', async () => {
  const { bus, service } = setup();
  const res = await bus.resolve({ spatial: { command: { op: 'place', id: 'x', pose: {} } } });
  assert.equal(res.ok, false);
  assert.equal(service.size, 0);
});
