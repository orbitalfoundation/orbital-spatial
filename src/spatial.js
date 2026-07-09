// spatial — space as a CONCEPT on the bus, wrapping the spatial-hash tool
// with pose semantics and one reserved key:
//
//   { spatial: { query:   { op: 'near', position, radius }
//              |          { op: 'within', min, max }
//              |          { op: 'nearest', position, k } } }
//   { spatial: { command: { op: 'place', id, pose } | { op: 'remove', id } | { op: 'clear' } } }
//
// It also indexes PASSIVELY: any event flowing on the bus that carries an id
// and a `pose` component is placed automatically (pose: null removes). On a
// world bus, agents simply publish themselves and the index stays current —
// no one calls the index by name. Installed as bus.spatial for direct use.
//
// The pose component (see orbital-ontology): the physical truth of a thing —
//   { position: [x, y, z], rotation?: [x, y, z, w], extent?: r | [w, h, d] }
// Rendering (orbital-volume) READS pose; this concept never touches
// presentation. Frames are the world's own (local cartesian); earth-anchored
// placement is the separate `geo` component, not this one.

import { makeSpatialHash } from './hash.js';

const SCHEMA = { spatial: true };

// extent → bounding radius: a number is already one; a box is half its diagonal
const radiusOf = (extent) => {
  if (extent == null) return 0;
  if (typeof extent === 'number') return extent;
  if (Array.isArray(extent)) return Math.hypot(...extent) / 2;
  return 0;
};

export function makeSpatialService({ cellSize = 10 } = {}) {
  const index = makeSpatialHash({ cellSize });
  const poses = new Map(); // id -> pose (the full component, not just the sphere)

  function place(id, pose) {
    if (id == null || !pose?.position) return { ok: false, error: 'id and pose.position required' };
    poses.set(id, pose);
    index.place(id, pose.position, { radius: radiusOf(pose.extent) });
    return { ok: true };
  }

  function remove(id) {
    poses.delete(id);
    return { ok: index.remove(id) };
  }

  const withPose = (hit) => ({ id: hit.id, pose: poses.get(hit.id), ...(hit.distance !== undefined && { distance: hit.distance }) });

  return {
    index, // the raw tool, for callers that want it
    place,
    remove,
    get: (id) => (poses.has(id) ? { id, pose: poses.get(id) } : undefined),
    near: ({ position, radius }) => index.near(position, radius).map(withPose),
    within: ({ min, max }) => index.within(min, max).map(withPose),
    nearest: ({ position, k = 1 }) => index.nearest(position, k).map(withPose),
    all: () => index.all().map(withPose),
    clear: () => {
      poses.clear();
      index.clear();
      return { ok: true };
    },
    get size() {
      return index.size;
    },
  };
}

export function createSpatial({ cellSize = 10 } = {}) {
  const service = makeSpatialService({ cellSize });

  const entity = {
    id: 'bus.spatial',
    resolve(event, bus) {
      if (event.registered) {
        bus.install?.('spatial', service);
        bus.resolve?.({ schema: SCHEMA });
        return;
      }

      const req = event.spatial;
      if (req && typeof req === 'object') {
        const q = req.query;
        if (q) {
          if (q.op === 'near') return service.near(q);
          if (q.op === 'within') return service.within(q);
          if (q.op === 'nearest') return service.nearest(q);
          return null;
        }
        const c = req.command;
        if (c) {
          if (c.op === 'place') return service.place(c.id, c.pose);
          if (c.op === 'remove') return service.remove(c.id);
          if (c.op === 'clear') return service.clear();
          return { ok: false, error: `unknown command: ${c.op}` };
        }
        return undefined;
      }

      // passive ECS indexing: pose-bearing entity traffic keeps the index
      // current; never consume the event — others observe it too
      const id = event.id ?? event.uuid;
      if (id != null && 'pose' in event) {
        if (event.pose === null) service.remove(id);
        else service.place(id, event.pose);
      }
      return undefined;
    },
  };

  return { entity, service };
}

export function attach(bus, opts = {}) {
  const { entity, service } = createSpatial(opts);
  bus.register(entity);
  return service;
}
