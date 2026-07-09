# @orbitalfoundation/spatial

Space as a **concept**: place entities by pose, detect proximity, query regions. Two halves, deliberately separable:

- **The tool** — `makeSpatialHash()`: a pure uniform-grid index over 3D bounding spheres (place / remove / near / within / nearest). No bus, no components, no dependencies — import just this into any sim that needs proximity (cloudreef-style spatial hashing, done once, tested).
- **The concept** — one reserved bus key and a passive indexer. Any event carrying an `id` and a `pose` component is indexed automatically (`pose: null` removes), so on a world bus agents simply publish themselves and the index stays current. Installed as `bus.spatial` for direct calls.

```js
{ spatial: { query:   { op: 'near', position: [x,y,z], radius }
           |          { op: 'within', min, max }
           |          { op: 'nearest', position, k } } }
{ spatial: { command: { op: 'place', id, pose } | { op: 'remove', id } | { op: 'clear' } } }
```

## The pose component

The physical truth of a thing (see [orbital-ontology](../orbital-ontology)):

```json
{ "pose": { "position": [12, 0, -3], "rotation": [0, 0, 0, 1], "extent": 2.5 } }
```

`extent` is a bounding radius, or a `[w, h, d]` box (indexed by its bounding sphere). Positions are in the **world's own local frame** — earth-anchored placement is the separate `geo` component. And pose is not presentation: rendering ([orbital-volume](../orbital-volume)) *reads* pose; spatial queries never touch how a thing looks. The old habit of stuffing position into the `volume` component conflated those two concerns; `pose` is the divorce.

## Do-nots

- Don't query space through the renderer — that coupling is what this package exists to end.
- Don't put per-tick pose churn on a shared/control bus — a world's spatial traffic belongs on that world's bus (the coarse-unit principle).
- Don't reach for a database: in-world proximity is in-memory by design. A *durable* spatial adapter (e.g. mongo 2dsphere over filespace `geo` entities, for map views) is a future orbital-store entry behind its own contract.

## Use

```js
import { makeSpatialHash, attach } from '@orbitalfoundation/spatial';

// standalone tool
const grid = makeSpatialHash({ cellSize: 10 });
grid.place('fish-1', [3, 0, 0], { radius: 0.5 });
grid.near([0, 0, 0], 5);                 // → sorted hits with distances

// as a bus citizen
const spatial = attach(bus, { cellSize: 10 });
await bus.resolve({ id: 'fish-1', pose: { position: [3, 0, 0] } }); // passively indexed
await bus.resolve({ spatial: { query: { op: 'nearest', position: [0, 0, 0], k: 3 } } });
```

```sh
npm test   # 14 cases: boundaries, moves, radii, k-nearest fallback, 10k-agent scale
```
