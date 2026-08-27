/* THE SHOOT HOUSE — a CQB training floor you walk through with your own iron.
 *
 * Deliberately axis-aligned: every wall is a box with no rotation, so collision
 * is circle-vs-AABB and never needs a physics engine. The layout is authored as
 * a list of rectangles in metres rather than a grid, because rooms want doorways
 * at specific spots and a grid would force everything to a cell.
 *
 * build() returns:
 *   group   THREE.Group of all geometry (caller adds to scene)
 *   walls   [{x0,z0,x1,z1}] collision rectangles, y is ignored (single storey)
 *   spots   [{x,z,ry,kind}] target placements - 'civ' is NO-SHOOT
 *   start   {x,z,yaw} where the runner begins
 */
(function (global) {
  const T = 0.18;          // wall thickness
  const H = 3.0;           // wall height
  const D = 1.15;          // doorway half-width

  // ---- the floorplan -------------------------------------------------------
  // One spine corridor with rooms either side, a dogleg at the end so the last
  // room cannot be pre-aimed from the entry - the whole point of a shoot house.
  const ROOMS = [
    { id: 'entry',   x0: -3,  z0: -2,  x1: 3,   z1: 4  },
    { id: 'hall',    x0: -1.6,z0: 4,   x1: 1.6, z1: 22 },
    { id: 'left1',   x0: -9,  z0: 5,   x1: -1.6,z1: 11 },
    { id: 'right1',  x0: 1.6, z0: 5,   x1: 8,   z1: 10 },
    { id: 'left2',   x0: -8,  z0: 13,  x1: -1.6,z1: 19 },
    { id: 'right2',  x0: 1.6, z0: 12,  x1: 9,   z1: 19 },
    { id: 'back',    x0: -6,  z0: 22,  x1: 6,   z1: 28 },
  ];

  // doorways punched into shared walls: {axis:'x'|'z', at, span:[a,b], gap}
  const DOORS = [
    { axis: 'z', at: 4,    gap: [-D, D] },        // entry -> hall
    { axis: 'x', at: -1.6, gap: [6.4, 6.4 + D * 2] },   // hall -> left1
    { axis: 'x', at: 1.6,  gap: [6.0, 6.0 + D * 2] },   // hall -> right1
    { axis: 'x', at: -1.6, gap: [14.5, 14.5 + D * 2] }, // hall -> left2
    { axis: 'x', at: 1.6,  gap: [13.5, 13.5 + D * 2] }, // hall -> right2
    { axis: 'z', at: 22,   gap: [-D, D] },        // hall -> back
  ];

  function build(THREE, mat) {
    const group = new THREE.Group();
    const walls = [];

    // outer shell of the whole plan
    const minX = -9.5, maxX = 9.5, minZ = -2.5, maxZ = 28.5;

    const floorMat = mat.floor, wallMat = mat.wall, trimMat = mat.trim;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    group.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), mat.ceil);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set((minX + maxX) / 2, H, (minZ + maxZ) / 2);
    group.add(ceil);

    // a wall segment: a box, plus its collision rect
    function seg(x0, z0, x1, z1) {
      if (Math.abs(x1 - x0) < 1e-4 && Math.abs(z1 - z0) < 1e-4) return;
      const w = Math.max(Math.abs(x1 - x0), T), d = Math.max(Math.abs(z1 - z0), T);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wallMat);
      m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
      group.add(m);
      // a gold trim line at head height - reads the edge of every wall in the dark
      const tr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.04, d + 0.02), trimMat);
      tr.position.set(m.position.x, 2.25, m.position.z);
      group.add(tr);
      walls.push({ x0: Math.min(x0, x1) - T / 2, z0: Math.min(z0, z1) - T / 2,
                   x1: Math.max(x0, x1) + T / 2, z1: Math.max(z0, z1) + T / 2 });
    }

    // a run of wall along one axis, minus any doorway gaps that fall on it
    function run(axis, at, from, to) {
      const gaps = DOORS.filter(d => d.axis === axis && Math.abs(d.at - at) < 0.01)
                        .map(d => d.gap).sort((a, b) => a[0] - b[0]);
      let cur = from;
      for (const g of gaps) {
        const a = Math.max(from, g[0]), b = Math.min(to, g[1]);
        if (b <= cur) continue;
        if (a > cur) axis === 'x' ? seg(at, cur, at, a) : seg(cur, at, a, at);
        cur = b;
      }
      if (cur < to) axis === 'x' ? seg(at, cur, at, to) : seg(cur, at, to, at);
    }

    // outer shell
    run('z', minZ, minX, maxX);
    run('z', maxZ, minX, maxX);
    run('x', minX, minZ, maxZ);
    run('x', maxX, minZ, maxZ);

    // corridor sides (doorways cut by run())
    run('x', -1.6, 4, 22);
    run('x', 1.6, 4, 22);
    run('z', 4, -3, -D);  run('z', 4, D, 3);        // entry wall either side of its door
    run('z', 22, minX + 0.5, -D); run('z', 22, D, maxX - 0.5);

    // SEAL THE PLAN. Without these the rooms have no south wall and the strips
    // beside the entry are open, so you could walk around the OUTSIDE of the
    // corridor, skip the house entirely and shoot every board from behind.
    // A shoot house you can walk around is not a shoot house.
    run('x', -3, minZ, 4); run('x', 3, minZ, 4);    // entry room sides
    run('z', 5, minX, -1.6);                        // left1 south
    run('z', 5, 1.6, maxX);                         // right1 south

    // room dividers
    run('z', 11, minX, -1.6);   // left1 / left2 split
    run('z', 10, 1.6, maxX);    // right1 / right2 split
    run('x', -9, 5, 19);
    run('x', 8, 5, 10);
    run('x', 9, 12, 19);
    run('z', 19, minX, -1.6);
    run('z', 19, 1.6, maxX);
    run('z', 13, minX, -1.6);
    run('z', 12, 1.6, maxX);

    // a few crates for cover / sightline breaks
    const CRATES = [[-5.5, 8, 1.1], [5, 7.5, 1.0], [-4.5, 16, 1.2], [6, 15.5, 1.0], [0, 25, 1.3]];
    for (const [cx, cz, s] of CRATES) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(s, 1.0, s), mat.crate);
      c.position.set(cx, 0.5, cz);
      group.add(c);
      walls.push({ x0: cx - s / 2, z0: cz - s / 2, x1: cx + s / 2, z1: cz + s / 2 });
    }

    // ---- targets: hostiles to engage, civilians you must NOT hit ------------
    // Placed to punish spraying through doorways and to reward slicing the pie.
    const spots = [
      { x: -5.0, z: 9.6,  ry: 0,            kind: 'mark' },
      { x: -7.6, z: 6.4,  ry: Math.PI / 2,  kind: 'mark' },
      { x: -3.0, z: 6.0,  ry: 0,            kind: 'civ'  },
      { x: 5.6,  z: 8.8,  ry: 0,            kind: 'mark' },
      { x: 7.0,  z: 6.2,  ry: -Math.PI / 2, kind: 'civ'  },
      { x: 3.2,  z: 9.2,  ry: 0,            kind: 'mark' },
      { x: -6.6, z: 17.6, ry: 0,            kind: 'mark' },
      { x: -2.6, z: 14.2, ry: 0,            kind: 'mark' },
      { x: -5.0, z: 13.8, ry: 0,            kind: 'civ'  },
      { x: 7.6,  z: 17.4, ry: 0,            kind: 'mark' },
      { x: 3.0,  z: 13.0, ry: 0,            kind: 'mark' },
      { x: 8.0,  z: 13.4, ry: -Math.PI / 2, kind: 'civ'  },
      { x: -4.2, z: 26.6, ry: 0,            kind: 'mark' },
      { x: 0.0,  z: 27.2, ry: 0,            kind: 'mark' },
      { x: 4.2,  z: 26.6, ry: 0,            kind: 'civ'  },
      { x: 2.2,  z: 24.0, ry: 0,            kind: 'mark' },
    ];

    // ---- lighting ------------------------------------------------------
    // The house MUST carry its own lights. Every range light lives inside the
    // `hall` group, and entering the house sets `hall.visible = false` — which
    // switched the whole scene off and rendered the house pure black.
    // Parented to `group`, so they leave with the house on teardown.
    group.add(new THREE.HemisphereLight(0x3a4658, 0x0a0c11, 0.75));   // fill, so no wall is ever solid black
    for (const r of ROOMS) {
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      const long = Math.max(r.x1 - r.x0, r.z1 - r.z0);
      // long rooms (the spine hall) get a strip of fixtures rather than one hot spot
      const n = long > 12 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : (i + 0.5) / n;
        const px = (r.x1 - r.x0) > (r.z1 - r.z0) ? r.x0 + (r.x1 - r.x0) * t : cx;
        const pz = (r.z1 - r.z0) >= (r.x1 - r.x0) ? r.z0 + (r.z1 - r.z0) * t : cz;
        const lamp = new THREE.PointLight(0xffe6bd, 17, 15, 1.35);
        lamp.position.set(px, H - 0.35, pz);
        group.add(lamp);
        // visible fixture, so the light reads as coming from somewhere
        const fx = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5),
          new THREE.MeshBasicMaterial({ color: 0xffeccb }));
        fx.position.set(px, H - 0.06, pz);
        fx.raycast = () => {};            // a ceiling lamp must never stop a bullet
        group.add(fx);
      }
    }

    return { group, walls, spots, // the camera looks down -Z at yaw 0 and the plan runs along +Z, so face about
             start: { x: 0, z: -0.5, yaw: Math.PI },
             bounds: { minX, maxX, minZ, maxZ } };
  }

  global.SHOOTHOUSE = { build, H };
})(typeof window !== 'undefined' ? window : globalThis);
