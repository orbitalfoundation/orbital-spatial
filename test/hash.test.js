import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSpatialHash } from '../src/hash.js';

test('near finds by distance, sorted, respecting bounding radii', () => {
  const h = makeSpatialHash({ cellSize: 10 });
  h.place('close', [1, 0, 0]);
  h.place('mid', [5, 0, 0]);
  h.place('far', [50, 0, 0]);
  h.place('big-far', [14, 0, 0], { radius: 5 }); // center outside r=10, sphere reaches in

  const hits = h.near([0, 0, 0], 10);
  assert.deepEqual(hits.map((x) => x.id), ['close', 'mid', 'big-far']);
  assert.equal(hits[0].distance, 1);
});

test('cell boundaries do not hide neighbors', () => {
  const h = makeSpatialHash({ cellSize: 10 });
  h.place('a', [9.9, 9.9, 0]);
  h.place('b', [10.1, 10.1, 0]); // adjacent cell, tiny true distance
  const hits = h.near([10, 10, 0], 1);
  assert.deepEqual(hits.map((x) => x.id).sort(), ['a', 'b']);
});

test('placing an existing id moves it', () => {
  const h = makeSpatialHash({ cellSize: 10 });
  h.place('fish', [0, 0, 0]);
  h.place('fish', [100, 0, 0]);
  assert.equal(h.near([0, 0, 0], 5).length, 0);
  assert.equal(h.near([100, 0, 0], 5)[0].id, 'fish');
  assert.equal(h.size, 1); // moved, not duplicated
});

test('remove forgets an item everywhere', () => {
  const h = makeSpatialHash({ cellSize: 10 });
  h.place('gone', [3, 3, 3], { radius: 20 }); // spans many cells
  assert.equal(h.remove('gone'), true);
  assert.equal(h.remove('gone'), false);
  assert.equal(h.near([3, 3, 3], 30).length, 0);
});

test('within returns centers inside the box', () => {
  const h = makeSpatialHash({ cellSize: 5 });
  h.place('in', [2, 2, 0]);
  h.place('edge', [5, 5, 0]);
  h.place('out', [6, 2, 0]);
  const ids = h.within([0, 0, 0], [5, 5, 0]).map((x) => x.id).sort();
  assert.deepEqual(ids, ['edge', 'in']);
});

test('nearest finds k, including past sparse gaps (fallback path)', () => {
  const h = makeSpatialHash({ cellSize: 1 }); // tiny cells force ring expansion
  h.place('a', [1000, 0, 0]);
  h.place('b', [2000, 0, 0]);
  h.place('c', [3000, 0, 0]);
  const two = h.nearest([0, 0, 0], 2);
  assert.deepEqual(two.map((x) => x.id), ['a', 'b']);
  assert.deepEqual(h.nearest([0, 0, 0], 99).map((x) => x.id), ['a', 'b', 'c']); // k > size
  assert.deepEqual(makeSpatialHash().nearest([0, 0, 0], 1), []); // empty index
});

test('z defaults to 0 and 3D distances are honest', () => {
  const h = makeSpatialHash({ cellSize: 10 });
  h.place('flat', [0, 0]);
  h.place('above', [0, 0, 8]);
  assert.equal(h.near([0, 0, 0], 5).length, 1);
  assert.equal(h.near([0, 0, 0], 9).length, 2);
});

test('ten thousand agents: queries stay correct at scale', () => {
  const h = makeSpatialHash({ cellSize: 10 });
  // a 100×100 grid of agents 10 apart, plus one marked cluster
  let n = 0;
  for (let x = 0; x < 100; x++) for (let y = 0; y < 100; y++) h.place(`g${n++}`, [x * 10, y * 10, 0]);
  h.place('target', [505, 505, 0]);

  const hits = h.near([505, 505, 0], 8);
  // exactly the four grid corners of that cell (√50 ≈ 7.07) + the target
  assert.equal(hits.length, 5);
  assert.equal(hits[0].id, 'target');
  assert.equal(h.nearest([505, 505, 0], 1)[0].id, 'target');
  assert.equal(h.size, 10001);
});

test('data rides along', () => {
  const h = makeSpatialHash();
  h.place('tagged', [0, 0, 0], { data: { kind: 'coral' } });
  assert.equal(h.near([0, 0, 0], 1)[0].data.kind, 'coral');
});
