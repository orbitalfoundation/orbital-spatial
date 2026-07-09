// spatial hash — the TOOL half of spatial: a uniform-grid index over 3D
// positions with bounding radii. Pure and standalone (no bus, no components):
// import just this into any sim that needs proximity. The concept half
// (spatial.js) wraps it with pose semantics and bus vocabulary.
//
// Model: each item is a bounding sphere (position + radius). An item is
// registered in every grid cell its sphere overlaps, so queries only ever
// look at the cells the QUERY region overlaps — no "fat query" radius games.
//
// Choose cellSize near the typical query radius; the default suits
// meter-scale sims. All positions are [x, y, z] (z may be omitted → 0).

const norm = (p) => [p[0], p[1], p[2] ?? 0];

export function makeSpatialHash({ cellSize = 10 } = {}) {
  if (cellSize <= 0) throw new Error('cellSize must be positive');
  const cells = new Map(); // "cx,cy,cz" -> Set(id)
  const items = new Map(); // id -> { id, position, radius, data, keys }
  const cellOf = (v) => Math.floor(v / cellSize);
  const key = (cx, cy, cz) => `${cx},${cy},${cz}`;

  function keysFor(position, radius) {
    const [x, y, z] = position;
    const out = [];
    for (let cx = cellOf(x - radius); cx <= cellOf(x + radius); cx++)
      for (let cy = cellOf(y - radius); cy <= cellOf(y + radius); cy++)
        for (let cz = cellOf(z - radius); cz <= cellOf(z + radius); cz++)
          out.push(key(cx, cy, cz));
    return out;
  }

  function unlink(item) {
    for (const k of item.keys) {
      const set = cells.get(k);
      if (set) {
        set.delete(item.id);
        if (!set.size) cells.delete(k);
      }
    }
  }

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  function candidates(position, radius) {
    // enumerating (2r/cell)³ grid cells explodes on large radii over sparse
    // data — when the query spans more cells than are occupied, checking
    // every item directly is strictly cheaper
    const span = Math.ceil((2 * radius) / cellSize) + 1;
    if (span * span * span > cells.size) return new Set(items.keys());
    const seen = new Set();
    for (const k of keysFor(position, radius)) {
      for (const id of cells.get(k) ?? []) seen.add(id);
    }
    return seen;
  }

  return {
    cellSize,

    // upsert: placing an existing id moves it
    place(id, position, { radius = 0, data = null } = {}) {
      const p = norm(position);
      const existing = items.get(id);
      if (existing) unlink(existing);
      const item = { id, position: p, radius, data, keys: keysFor(p, radius) };
      items.set(id, item);
      for (const k of item.keys) {
        let set = cells.get(k);
        if (!set) cells.set(k, (set = new Set()));
        set.add(id);
      }
      return item;
    },

    remove(id) {
      const item = items.get(id);
      if (!item) return false;
      unlink(item);
      items.delete(id);
      return true;
    },

    get(id) {
      const item = items.get(id);
      return item ? { id: item.id, position: [...item.position], radius: item.radius, data: item.data } : undefined;
    },

    // every item whose bounding sphere intersects the query sphere,
    // nearest first, each with its center distance
    near(position, radius) {
      const p = norm(position);
      const out = [];
      for (const id of candidates(p, radius)) {
        const item = items.get(id);
        const d = dist(p, item.position);
        if (d <= radius + item.radius) out.push({ id, position: [...item.position], radius: item.radius, data: item.data, distance: d });
      }
      return out.sort((a, b) => a.distance - b.distance);
    },

    // every item whose CENTER lies in the axis-aligned box
    within(min, max) {
      const lo = norm(min);
      const hi = norm(max);
      const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      const reach = dist(lo, center);
      const out = [];
      for (const id of candidates(center, reach)) {
        const { position } = items.get(id);
        if (position.every((v, i) => v >= lo[i] && v <= hi[i])) {
          const item = items.get(id);
          out.push({ id, position: [...position], radius: item.radius, data: item.data });
        }
      }
      return out;
    },

    // the k nearest items: expanding-ring search, falling back to a full
    // scan once the rings outgrow the data (correct first, clever later)
    nearest(position, k = 1) {
      const p = norm(position);
      if (!items.size) return [];
      let r = cellSize;
      for (let i = 0; i < 32; i++) {
        const found = this.near(p, r);
        if (found.length >= k) return found.slice(0, k);
        r *= 2;
      }
      return [...items.values()]
        .map((item) => ({ id: item.id, position: [...item.position], radius: item.radius, data: item.data, distance: dist(p, item.position) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, k);
    },

    all() {
      return [...items.values()].map((i) => ({ id: i.id, position: [...i.position], radius: i.radius, data: i.data }));
    },

    get size() {
      return items.size;
    },

    clear() {
      cells.clear();
      items.clear();
    },
  };
}
