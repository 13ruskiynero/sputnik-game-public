import * as THREE from 'three';

const EARTH_RADIUS = 1.5;
const CONTRACT_RADIUS = EARTH_RADIUS * 1.004;

function latLonToVec3(lat, lon, radius) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function buildSatelliteMesh(type) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: type === 'relay' ? 0xffd479 : 0xd8e6f2,
    metalness: 0.55,
    roughness: 0.35,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x2b6cb0,
    metalness: 0.7,
    roughness: 0.3,
    emissive: 0x081c33,
    emissiveIntensity: 0.8,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.24), bodyMat);
  group.add(body);

  const panelGeo = new THREE.BoxGeometry(0.42, 0.02, 0.16);
  const left = new THREE.Mesh(panelGeo, panelMat);
  left.position.x = -0.31;
  group.add(left);
  const right = new THREE.Mesh(panelGeo, panelMat);
  right.position.x = 0.31;
  group.add(right);

  if (type === 'relay') {
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      bodyMat
    );
    dish.rotation.x = Math.PI;
    dish.position.y = -0.13;
    group.add(dish);
  }

  group.scale.setScalar(1.3);
  return group;
}

export function createWorld(canvas, onSelect) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060d);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  camera.position.set(0, 1.6, 8.8);
  camera.lookAt(0, 0, 0);

  const sunDir = new THREE.Vector3(5, 2.2, 3.2).normalize();
  const sunLight = new THREE.DirectionalLight(0xfff2dd, 3.0);
  sunLight.position.copy(sunDir).multiplyScalar(20);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x1b2a44, 1.35));

  // Звёздный фон.
  const starPositions = new Float32Array(2400 * 3);
  for (let i = 0; i < 2400; i += 1) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 40 + Math.random() * 70;
    starPositions[i * 3] = s * Math.cos(a) * r;
    starPositions[i * 3 + 1] = u * r;
    starPositions[i * 3 + 2] = s * Math.sin(a) * r;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    color: 0x9fc4ff,
    size: 0.32,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  }));
  scene.add(stars);

  // Земля.
  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  const earthTexture = new THREE.TextureLoader().load('./assets/textures/earth_atmos_2048.jpg');
  earthTexture.colorSpace = THREE.SRGBColorSpace;

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 96, 96),
    new THREE.MeshStandardMaterial({ map: earthTexture, roughness: 0.92, metalness: 0.0 })
  );
  earthGroup.add(earth);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.025, 64, 64),
    new THREE.MeshBasicMaterial({
      color: 0x3f8cff,
      transparent: true,
      opacity: 0.10,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  earthGroup.add(atmosphere);

  // Спутники.
  const satellites = new Map();
  let contract = null;
  let contractMarker = null;
  let contractLocal = null;
  let elapsed = 0;

  // Конус наблюдения: кратковременный луч от спутника к поверхности.
  const observationMaterial = new THREE.MeshBasicMaterial({
    color: 0x59f2b2,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const observationCone = new THREE.Mesh(
    new THREE.ConeGeometry(1, 1, 32, 1, true),
    observationMaterial
  );
  observationCone.visible = false;
  observationCone.renderOrder = 3;
  scene.add(observationCone);
  let observationUntil = 0;
  let observationSatId = null;

  function triggerObservation(satId) {
    observationSatId = satId;
    observationUntil = elapsed + 0.55;
  }

  function createSatellite(sat, index) {
    const isRelay = sat.type === 'relay';
    const radius = isRelay ? 2.75 : 2.15;
    const speed = isRelay ? 0.12 : 0.22;
    const inclination = isRelay ? -0.30 : Math.PI / 2;
    const node = isRelay ? 1.2 : 0.28;

    const orbitGroup = new THREE.Group();
    orbitGroup.rotation.x = inclination;
    orbitGroup.rotation.y = node;
    earthGroup.add(orbitGroup);

    const points = [];
    for (let i = 0; i <= 128; i += 1) {
      const a = (i / 128) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const orbitGeom = new THREE.BufferGeometry().setFromPoints(points);
    orbitGroup.add(new THREE.Line(orbitGeom, new THREE.LineBasicMaterial({
      color: isRelay ? 0xffd479 : 0x8fd3ff,
      transparent: true,
      opacity: 0.52,
    })));

    const mesh = buildSatelliteMesh(sat.type);
    const phase = index * 2.1 + (isRelay ? 1.1 : 0);
    mesh.position.set(Math.cos(phase) * radius, 0, Math.sin(phase) * radius);
    mesh.userData.satId = sat.id;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.14, 0.17, 32),
      new THREE.MeshBasicMaterial({
        color: 0x59f2b2,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
    );
    ring.visible = false;
    ring.userData.isSelectionRing = true;
    mesh.add(ring);

    orbitGroup.add(mesh);
    satellites.set(sat.id, { mesh, orbitGroup, radius, speed, phase, ring, type: sat.type });
  }

  function syncSatellites(list) {
    list.forEach((sat, index) => {
      if (!satellites.has(sat.id)) createSatellite(sat, index);
    });
    for (const [id, entry] of satellites) {
      const selected = list.some(s => s.id === id && s.selected);
      entry.ring.visible = selected;
    }
  }

  function setContract(next) {
    contract = next;
    if (contractMarker) {
      earthGroup.remove(contractMarker);
      contractMarker = null;
    }
    contractLocal = null;
    if (!next) return;

    contractLocal = latLonToVec3(next.lat, next.lon, CONTRACT_RADIUS);
    const group = new THREE.Group();
    group.position.copy(contractLocal);
    group.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      contractLocal.clone().normalize()
    );

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.055, 0.088, 40),
      new THREE.MeshBasicMaterial({
        color: 0x59f2b2,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      })
    );
    group.add(ring);

    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.018, 24),
      new THREE.MeshBasicMaterial({ color: 0x59f2b2, transparent: true, opacity: 0.9, depthWrite: false })
    );
    dot.position.z = 0.002;
    group.add(dot);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.012, 0.42, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x59f2b2,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beam.rotation.x = Math.PI / 2;
    beam.position.z = 0.21;
    group.add(beam);

    earthGroup.add(group);
    contractMarker = group;
  }

  function getAngleToContract(satId) {
    if (!contractLocal) return null;
    const entry = satellites.get(satId);
    if (!entry) return null;
    earthGroup.updateMatrixWorld(true);
    const satPos = new THREE.Vector3();
    entry.mesh.getWorldPosition(satPos);
    const contractWorld = earthGroup.localToWorld(contractLocal.clone());
    return satPos.clone().normalize().angleTo(contractWorld.clone().normalize());
  }

  function getSunlitMap() {
    const map = {};
    const pos = new THREE.Vector3();
    for (const [id, entry] of satellites) {
      entry.mesh.getWorldPosition(pos);
      map[id] = pos.normalize().dot(sunDir) > 0.02;
    }
    return map;
  }

  function update(dt) {
    elapsed += dt;
    for (const entry of satellites.values()) {
      entry.phase += entry.speed * dt;
      entry.mesh.position.set(
        Math.cos(entry.phase) * entry.radius,
        0,
        Math.sin(entry.phase) * entry.radius
      );
      if (entry.ring.visible) {
        entry.ring.lookAt(camera.position);
        entry.ring.scale.setScalar(1 + 0.08 * Math.sin(elapsed * 4));
      }
    }

    if (contractMarker) {
      contractMarker.scale.setScalar(1 + 0.10 * Math.sin(elapsed * 3));
    }

    if (elapsed < observationUntil && observationSatId) {
      const entry = satellites.get(observationSatId);
      if (entry) {
        const satPos = new THREE.Vector3();
        entry.mesh.getWorldPosition(satPos);
        const distance = satPos.length();
        const height = Math.max(0.1, distance - EARTH_RADIUS);
        const up = satPos.clone().normalize();
        const radius = height * Math.tan(THREE.MathUtils.degToRad(16));
        observationCone.visible = true;
        observationCone.position.copy(satPos).addScaledVector(up, -height / 2);
        observationCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        observationCone.scale.set(radius, height, radius);
        observationMaterial.opacity = 0.24 * Math.min(1, (observationUntil - elapsed) / 0.18);
      } else {
        observationCone.visible = false;
      }
    } else {
      observationCone.visible = false;
    }

    if (!dragging) {
      earthGroup.rotation.y += spinY;
      earthGroup.rotation.x = THREE.MathUtils.clamp(earthGroup.rotation.x + spinX, -1.15, 1.15);
      spinY *= 0.94;
      spinX *= 0.94;
      if (Math.abs(spinY) < 0.0001) spinY = 0;
      if (Math.abs(spinX) < 0.0001) spinX = 0;
    }
  }

  function render() {
    renderer.render(scene, camera);
  }

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const distance = aspect < 0.8 ? 12.5 : (aspect < 1.2 ? 10.5 : 8.8);
    camera.aspect = aspect;
    camera.position.set(0, distance * 0.18, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  // Вращение Земли мышью и пальцем.
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  let spinX = 0;
  let spinY = 0;

  canvas.addEventListener('pointerdown', e => {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    earthGroup.rotation.y += dx * 0.006;
    earthGroup.rotation.x = THREE.MathUtils.clamp(earthGroup.rotation.x + dy * 0.006, -1.15, 1.15);
    spinY = dx * 0.006;
    spinX = dy * 0.006;
    e.preventDefault();
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    if (moved < 8) pickSatellite(e.clientX, e.clientY);
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  canvas.addEventListener('pointerleave', () => { dragging = false; });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pickSatellite(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const meshes = [];
    for (const entry of satellites.values()) meshes.push(entry.mesh);
    const hits = raycaster.intersectObjects(meshes, true);
    if (!hits.length) return false;
    let obj = hits[0].object;
    while (obj && !obj.userData.satId) obj = obj.parent;
    if (obj && obj.userData.satId) {
      onSelect(obj.userData.satId);
      return true;
    }
    return false;
  }

  resize();

  return {
    scene,
    camera,
    resize,
    render,
    update,
    syncSatellites,
    setContract,
    getAngleToContract,
    getSunlitMap,
    triggerObservation,
    getDebug() {
      return {
        satellites: satellites.size,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        hasContract: Boolean(contractMarker),
        observation: observationCone.visible,
        textureLoaded: Boolean(earthTexture.image && earthTexture.image.width),
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov },
        orbits: Array.from(satellites.values()).map(e => ({
          type: e.type,
          inclination: e.orbitGroup.rotation.x,
          node: e.orbitGroup.rotation.y,
          parentIsEarth: e.orbitGroup.parent === earthGroup,
        })),
        earthRotation: [earthGroup.rotation.x, earthGroup.rotation.y],
      };
    },
    getSatellitePosition(id) {
      const entry = satellites.get(id);
      if (!entry) return null;
      const v = new THREE.Vector3();
      entry.mesh.getWorldPosition(v);
      return { x: v.x, y: v.y, z: v.z };
    },
    getSatelliteLocalPosition(id) {
      const entry = satellites.get(id);
      if (!entry) return null;
      const v = new THREE.Vector3();
      entry.mesh.getWorldPosition(v);
      earthGroup.worldToLocal(v);
      return { x: v.x, y: v.y, z: v.z };
    },
  };
}
