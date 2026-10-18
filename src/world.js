import * as THREE from 'three';
import { RECOMMENDED_ORBITS } from './game.js';

const EARTH_RADIUS = 1.5;
const CONTRACT_RADIUS = EARTH_RADIUS * 1.004;
const MIN_ZOOM = 0.82;
const MAX_ZOOM = 3.2;
const MIN_POLAR = 0.35;
const MAX_POLAR = 2.6;
const ORBIT_MIN_KM = 300;
const ORBIT_MAX_KM = 40000;
const LEO_REF_KM = 550;
const LEO_REF_RADIUS = 2.15;
const GEO_REF_KM = 35786;
const GEO_REF_RADIUS = 6.5;
const ORBIT_REF_SPEED = 0.22;
const AUTO_SPIN = 0.035; // радиан в секунду, собственное вращение планеты
const MOON_RADIUS = 0.38;
const MOON_ORBIT_SPEED = 0.02;
const SUN_ORBIT_SPEED = 0.003; // полный оборот примерно за 35 минут
const ECLIPSE_IN = 5;
const ECLIPSE_HOLD = 15;
const ECLIPSE_OUT = 6;
const GAME_YEAR = (Math.PI * 2) / SUN_ORBIT_SPEED;

// Визуальный масштаб орбит сжат: высота в километрах отображается
// логарифмически, иначе геостационарная орбита улетела бы за камеру.
function visualRadiusForAltitude(altitudeKm) {
  const altitude = Math.max(ORBIT_MIN_KM, Math.min(ORBIT_MAX_KM, Number(altitudeKm) || LEO_REF_KM));
  const low = Math.log1p(LEO_REF_KM / ORBIT_MIN_KM);
  const high = Math.log1p(GEO_REF_KM / ORBIT_MIN_KM);
  const t = (Math.log1p(altitude / ORBIT_MIN_KM) - low) / (high - low);
  return LEO_REF_RADIUS + (GEO_REF_RADIUS - LEO_REF_RADIUS) * Math.max(0, Math.min(1, t));
}

function speedForRadius(radius) {
  return ORBIT_REF_SPEED * Math.pow(LEO_REF_RADIUS / radius, 1.5);
}

// Геостационарная высота: угловая скорость должна совпадать с вращением
// планеты, иначе аппарат будет медленно уезжать относительно поверхности.
// При наклонении 0 он висит над одной точкой экватора, при наклонении
// больше 0 — геосинхронная «восьмёрка».
function angularSpeedForOrbit(altitudeKm, radius) {
  if (Math.abs(altitudeKm - GEO_REF_KM) <= 50) return AUTO_SPIN;
  return speedForRadius(radius);
}

function orbitForSatellite(sat) {
  const recommended = RECOMMENDED_ORBITS[sat.type] || RECOMMENDED_ORBITS.mapper;
  const orbit = sat.orbit || recommended;
  return {
    altitudeKm: Number.isFinite(orbit.altitudeKm) ? orbit.altitudeKm : recommended.altitudeKm,
    inclinationDeg: Number.isFinite(orbit.inclinationDeg) ? orbit.inclinationDeg : recommended.inclinationDeg,
  };
}

function buildOrbitLine(radius, isRelay) {
  const points = [];
  for (let i = 0; i <= 128; i += 1) {
    const a = (i / 128) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const orbitGeom = new THREE.BufferGeometry().setFromPoints(points);
  const orbitMaterial = new THREE.LineDashedMaterial({
    color: isRelay ? 0xffd479 : 0x8fd3ff,
    transparent: true,
    opacity: isRelay ? 0.20 : 0.26,
    dashSize: 0.08,
    gapSize: 0.14,
    depthWrite: false,
  });
  const line = new THREE.Line(orbitGeom, orbitMaterial);
  line.computeLineDistances();
  return line;
}

// Спутник в тени Земли, если он позади планеты и его расстояние
// от оси Земля–Солнце меньше радиуса Земли. Иначе он видит Солнце
// мимо края планеты и заряжается.
function isSunlitPosition(position, sunDirection) {
  const along = position.dot(sunDirection);
  if (along >= 0) return true;
  const perpendicularSq = Math.max(0, position.lengthSq() - along * along);
  return perpendicularSq >= EARTH_RADIUS * EARTH_RADIUS;
}

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
  let zoomFactor = 1;
  let azimuth = 0;
  let polar = Math.atan2(1, 0.18);

  const sunDir = new THREE.Vector3(5, 0, 3.2).normalize();
  const sunBaseDir = sunDir.clone();
  const sunAxis = new THREE.Vector3(0, 1, 0);
  let sunOrbitAngle = 0;
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

  // Видимое солнце: мировая точка, вокруг которой вращается камера.
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = 128;
  sunCanvas.height = 128;
  const sunCtx = sunCanvas.getContext('2d');
  const sunGradient = sunCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
  sunGradient.addColorStop(0, 'rgba(255, 252, 230, 1)');
  sunGradient.addColorStop(0.18, 'rgba(255, 236, 170, 0.95)');
  sunGradient.addColorStop(0.45, 'rgba(255, 200, 90, 0.28)');
  sunGradient.addColorStop(1, 'rgba(255, 180, 60, 0)');
  sunCtx.fillStyle = sunGradient;
  sunCtx.fillRect(0, 0, 128, 128);
  const sunTexture = new THREE.CanvasTexture(sunCanvas);
  sunTexture.colorSpace = THREE.SRGBColorSpace;
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  sunSprite.position.copy(sunDir).multiplyScalar(30);
  sunSprite.scale.setScalar(4.5);
  scene.add(sunSprite);

  // Земля.
  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  const earthTexture = new THREE.TextureLoader().load('./assets/textures/earth_atmos_2048.jpg');
  earthTexture.colorSpace = THREE.SRGBColorSpace;

  const earthSpinGroup = new THREE.Group();
  earthGroup.add(earthSpinGroup);

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS, 96, 96),
    new THREE.MeshStandardMaterial({ map: earthTexture, roughness: 0.92, metalness: 0.0 })
  );
  earthSpinGroup.add(earth);

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
  earthSpinGroup.add(atmosphere);

  // Луна: отдельная орбита в группе Земли, не участвует в автовращении планеты.
  const moonTexture = new THREE.TextureLoader().load('./assets/textures/moon_1024.jpg');
  moonTexture.colorSpace = THREE.SRGBColorSpace;

  const moonHorizontalRadius = Math.hypot(4, 25);
  let moonAngle = Math.atan2(4, 25);
  const moonMaterial = new THREE.MeshStandardMaterial({
    map: moonTexture,
    roughness: 1.0,
    metalness: 0.0,
  });
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(MOON_RADIUS, 48, 48), moonMaterial);
  moonMesh.position.set(
    moonHorizontalRadius * Math.sin(moonAngle),
    2,
    -moonHorizontalRadius * Math.cos(moonAngle)
  );
  moonMesh.rotation.y = -moonAngle;
  moonMesh.userData.isMoon = true;
  earthGroup.add(moonMesh);

  const moonDistance = Math.sqrt(moonHorizontalRadius ** 2 + 2 ** 2);
  let nextEclipseAt = GAME_YEAR * (2 + Math.random());
  let eclipse = null;
  const moonWhite = new THREE.Color(0xffffff);
  const moonRed = new THREE.Color(0x8a3a24);
  const moonDark = new THREE.Color(0x1a1a1a);
  const moonEmissive = new THREE.Color(0x2a0704);
  const moonEmissiveOff = new THREE.Color(0x000000);
  let nextEclipseType = 'lunar';

  const eclipseShadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x1b2b44,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const eclipseShadow = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.5, 28, 32, 1, true),
    eclipseShadowMaterial
  );
  eclipseShadow.visible = false;
  eclipseShadow.renderOrder = 1;
  scene.add(eclipseShadow);

  // Солнечное затмение: пятно тени Луны на поверхности Земли.
  const solarUmbraMaterial = new THREE.MeshBasicMaterial({
    color: 0x05070d,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const solarPenumbraMaterial = new THREE.MeshBasicMaterial({
    color: 0x05070d,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const solarSpotGroup = new THREE.Group();
  const solarPenumbra = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), solarPenumbraMaterial);
  const solarUmbra = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), solarUmbraMaterial);
  solarPenumbra.position.z = -0.001;
  solarSpotGroup.add(solarPenumbra);
  solarSpotGroup.add(solarUmbra);
  solarSpotGroup.visible = false;
  scene.add(solarSpotGroup);

  const solarConeMaterial = new THREE.MeshBasicMaterial({
    color: 0x05070d,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const solarConeLength = moonDistance - EARTH_RADIUS;
  const solarCone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.5, solarConeLength, 20, 1, true),
    solarConeMaterial
  );
  solarCone.visible = false;
  scene.add(solarCone);

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function triggerEclipse(type = null) {
    if (eclipse) return false;
    eclipse = {
      start: elapsed,
      from: moonMesh.position.clone(),
      type: type || nextEclipseType,
    };
    return true;
  }

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
    const orbit = orbitForSatellite(sat);
    const radius = visualRadiusForAltitude(orbit.altitudeKm);
    const speed = angularSpeedForOrbit(orbit.altitudeKm, radius);
    const inclination = THREE.MathUtils.degToRad(orbit.inclinationDeg);
    const node = isRelay ? 0 : 0.28;

    const orbitGroup = new THREE.Group();
    orbitGroup.rotation.x = inclination;
    orbitGroup.rotation.y = node;
    earthGroup.add(orbitGroup);

    const orbitLine = buildOrbitLine(radius, isRelay);
    orbitGroup.add(orbitLine);

    const mesh = buildSatelliteMesh(sat.type);
    mesh.scale.setScalar(1.3 * Math.max(1, radius / LEO_REF_RADIUS));
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
    satellites.set(sat.id, { mesh, orbitGroup, orbitLine, radius, speed, phase, ring, type: sat.type, altitudeKm: orbit.altitudeKm });
  }

  function updateSatelliteOrbit(id, orbit) {
    const entry = satellites.get(id);
    if (!entry || !orbit) return false;
    const altitude = Math.max(ORBIT_MIN_KM, Math.min(ORBIT_MAX_KM, Number(orbit.altitudeKm) || LEO_REF_KM));
    const inclination = Math.max(0, Math.min(180, Number(orbit.inclinationDeg) || 0));
    const radius = visualRadiusForAltitude(altitude);
    const speed = angularSpeedForOrbit(altitude, radius);

    entry.radius = radius;
    entry.speed = speed;
    entry.altitudeKm = altitude;
    entry.orbitGroup.rotation.x = THREE.MathUtils.degToRad(inclination);
    entry.orbitGroup.rotation.y = entry.type === 'relay' ? 0 : 0.28;

    const nextLine = buildOrbitLine(radius, entry.type === 'relay');
    entry.orbitGroup.remove(entry.orbitLine);
    if (entry.orbitLine.geometry) entry.orbitLine.geometry.dispose();
    if (entry.orbitLine.material) entry.orbitLine.material.dispose();
    entry.orbitGroup.add(nextLine);
    entry.orbitLine = nextLine;

    entry.mesh.position.set(
      Math.cos(entry.phase) * radius,
      0,
      Math.sin(entry.phase) * radius
    );
    entry.mesh.scale.setScalar(1.3 * Math.max(1, radius / LEO_REF_RADIUS));
    return true;
  }

  function syncSatellites(list) {
    const ids = new Set(list.map(s => s.id));

    for (const [id, entry] of satellites) {
      if (!ids.has(id)) {
        if (entry.orbitGroup.parent) entry.orbitGroup.parent.remove(entry.orbitGroup);
        entry.orbitGroup.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
          }
        });
        satellites.delete(id);
      }
    }

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
      contractMarker.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      earthSpinGroup.remove(contractMarker);
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

    group.userData.isContractMarker = true;
    earthSpinGroup.add(group);
    contractMarker = group;
  }

  function getAngleToContract(satId) {
    if (!contractLocal) return null;
    const entry = satellites.get(satId);
    if (!entry) return null;
    earthGroup.updateMatrixWorld(true);
    const satPos = new THREE.Vector3();
    entry.mesh.getWorldPosition(satPos);
    const contractWorld = earthSpinGroup.localToWorld(contractLocal.clone());
    return satPos.clone().normalize().angleTo(contractWorld.clone().normalize());
  }

  function getSunlitMap() {
    const map = {};
    const pos = new THREE.Vector3();
    for (const [id, entry] of satellites) {
      entry.mesh.getWorldPosition(pos);
      map[id] = isSunlitPosition(pos, sunDir);
    }
    return map;
  }

  function update(dt) {
    elapsed += dt;

    sunOrbitAngle += SUN_ORBIT_SPEED * dt;
    sunDir.copy(sunBaseDir).applyAxisAngle(sunAxis, sunOrbitAngle).normalize();
    sunLight.position.copy(sunDir).multiplyScalar(20);
    sunSprite.position.copy(sunDir).multiplyScalar(30);

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

    moonAngle += MOON_ORBIT_SPEED * dt;
    const orbitPos = new THREE.Vector3(
      moonHorizontalRadius * Math.sin(moonAngle),
      2,
      -moonHorizontalRadius * Math.cos(moonAngle)
    );

    if (!eclipse && elapsed >= nextEclipseAt) triggerEclipse();

    if (eclipse) {
      const isSolar = eclipse.type === 'solar';
      const targetDir = sunDir.clone().multiplyScalar(isSolar ? 1 : -1).normalize();
      const targetPos = targetDir.multiplyScalar(moonDistance);
      const t = elapsed - eclipse.start;
      let colorK = 1;
      let shadowK = 1;

      if (t < ECLIPSE_IN) {
        const k = smoothstep(t / ECLIPSE_IN);
        moonMesh.position.copy(eclipse.from).lerp(targetPos, k);
        colorK = k;
        shadowK = k;
      } else if (t < ECLIPSE_IN + ECLIPSE_HOLD) {
        moonMesh.position.copy(targetPos);
      } else if (t < ECLIPSE_IN + ECLIPSE_HOLD + ECLIPSE_OUT) {
        const k = smoothstep((t - ECLIPSE_IN - ECLIPSE_HOLD) / ECLIPSE_OUT);
        moonMesh.position.copy(targetPos).lerp(orbitPos, k);
        colorK = 1 - k;
        shadowK = 1 - k;
      } else {
        const kind = eclipse.type;
        eclipse = null;
        nextEclipseType = kind === 'lunar' ? 'solar' : 'lunar';
        moonMesh.position.copy(orbitPos);
        colorK = 0;
        shadowK = 0;
        nextEclipseAt = elapsed + GAME_YEAR * (2 + Math.random());
      }

      moonMesh.rotation.y = -moonAngle;
      if (isSolar) {
        moonMaterial.color.copy(moonWhite).lerp(moonDark, colorK);
        moonMaterial.emissive.copy(moonEmissiveOff);
        moonMaterial.emissiveIntensity = 0;
      } else {
        moonMaterial.color.copy(moonWhite).lerp(moonRed, colorK);
        moonMaterial.emissive.copy(moonEmissiveOff).lerp(moonEmissive, colorK);
        moonMaterial.emissiveIntensity = 0.55 * colorK;
      }

      eclipseShadow.visible = !isSolar && shadowK > 0.001;
      if (eclipseShadow.visible) {
        eclipseShadowMaterial.opacity = 0.18 * shadowK;
        eclipseShadow.position.copy(targetDir).multiplyScalar(14);
        eclipseShadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetDir);
      }

      solarSpotGroup.visible = isSolar && shadowK > 0.001;
      solarCone.visible = isSolar && shadowK > 0.001;
      if (solarSpotGroup.visible) {
        solarSpotGroup.position.copy(sunDir).multiplyScalar(EARTH_RADIUS * 1.003);
        solarSpotGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sunDir);
        solarUmbraMaterial.opacity = 0.62 * shadowK;
        solarPenumbraMaterial.opacity = 0.20 * shadowK;
        solarCone.position.copy(sunDir).multiplyScalar((EARTH_RADIUS + moonDistance) / 2);
        solarCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunDir);
        solarConeMaterial.opacity = 0.08 * shadowK;
      }
    } else {
      moonMesh.position.copy(orbitPos);
      moonMesh.rotation.y = -moonAngle;
      moonMaterial.color.copy(moonWhite);
      moonMaterial.emissive.copy(moonEmissiveOff);
      moonMaterial.emissiveIntensity = 0;
      eclipseShadow.visible = false;
      solarSpotGroup.visible = false;
      solarCone.visible = false;
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
      earthSpinGroup.rotation.y += AUTO_SPIN * dt;
      if (Math.abs(spinAzimuth) > 0.0001 || Math.abs(spinPolar) > 0.0001) {
        azimuth += spinAzimuth;
        polar = THREE.MathUtils.clamp(polar + spinPolar, MIN_POLAR, MAX_POLAR);
        spinAzimuth *= 0.94;
        spinPolar *= 0.94;
        if (Math.abs(spinAzimuth) < 0.0001) spinAzimuth = 0;
        if (Math.abs(spinPolar) < 0.0001) spinPolar = 0;
        applyCamera();
      }
    }
  }

  function render() {
    renderer.render(scene, camera);
  }

  function baseDistance(aspect) {
    return aspect < 0.8 ? 12.5 : (aspect < 1.2 ? 10.5 : 8.8);
  }

  function applyCamera() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const aspect = width / height;
    const distance = baseDistance(aspect) * zoomFactor;
    const sinPolar = Math.sin(polar);
    camera.aspect = aspect;
    camera.position.set(
      distance * sinPolar * Math.sin(azimuth),
      distance * Math.cos(polar),
      distance * sinPolar * Math.cos(azimuth)
    );
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  function zoomForRadius(radius) {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const aspect = width / height;
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    const half = Math.min(vertical, horizontal);
    const distance = Math.max(baseDistance(aspect), radius / Math.tan(half) * 1.18);
    return THREE.MathUtils.clamp(distance / baseDistance(aspect), MIN_ZOOM, MAX_ZOOM);
  }

  function zoomToOrbit(radius) {
    zoomFactor = zoomForRadius(radius);
    applyCamera();
    return zoomFactor;
  }

  function setZoom(value) {
    zoomFactor = THREE.MathUtils.clamp(Number(value) || 1, MIN_ZOOM, MAX_ZOOM);
    applyCamera();
    return zoomFactor;
  }

  function getZoom() {
    return zoomFactor;
  }

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    applyCamera();
  }

  // Вращение сцены мышью и пальцем + pinch zoom.
  const activePointers = new Map();
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  let spinAzimuth = 0;
  let spinPolar = 0;
  let pinchStartDistance = 0;
  let pinchStartZoom = 1;

  function pointerDistance() {
    const points = Array.from(activePointers.values());
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  canvas.addEventListener('pointerdown', e => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        // Синтетические события в тестах не имеют активного указателя.
      }
    }

    if (activePointers.size === 1) {
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
    } else if (activePointers.size === 2) {
      dragging = false;
      pinchStartDistance = pointerDistance();
      pinchStartZoom = zoomFactor;
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size >= 2) {
      const distance = pointerDistance();
      if (pinchStartDistance > 0 && distance > 0) {
        zoomFactor = THREE.MathUtils.clamp(
          pinchStartZoom * (pinchStartDistance / distance),
          MIN_ZOOM,
          MAX_ZOOM
        );
        applyCamera();
      }
      e.preventDefault();
      return;
    }

    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    azimuth -= dx * 0.006;
    polar = THREE.MathUtils.clamp(polar - dy * 0.006, MIN_POLAR, MAX_POLAR);
    spinAzimuth = -dx * 0.006;
    spinPolar = -dy * 0.006;
    applyCamera();
    e.preventDefault();
  });

  function pointerEnd(e) {
    const wasSingle = activePointers.size === 1;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchStartDistance = 0;
    if (activePointers.size === 0) {
      if (dragging && moved < 8 && wasSingle) pickSatellite(e.clientX, e.clientY);
      dragging = false;
    } else {
      dragging = false;
    }
  }

  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('pointerleave', e => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    if (activePointers.size === 0) dragging = false;
    if (activePointers.size < 2) pinchStartDistance = 0;
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.0012);
    zoomFactor = THREE.MathUtils.clamp(zoomFactor * factor, MIN_ZOOM, MAX_ZOOM);
    applyCamera();
  }, { passive: false });

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
    updateSatelliteOrbit,
    zoomToOrbit,
    setZoom,
    getZoom,
    getVisualRadius(altitudeKm) {
      return visualRadiusForAltitude(altitudeKm);
    },
    setContract,
    getAngleToContract,
    getSunlitMap,
    isPointSunlit(x, y, z, sunDirection = null) {
      const position = new THREE.Vector3(x, y, z);
      const direction = sunDirection
        ? new THREE.Vector3(sunDirection.x, sunDirection.y, sunDirection.z).normalize()
        : sunDir;
      return isSunlitPosition(position, direction);
    },
    triggerObservation,
    triggerEclipse,
    setCameraOrbit(nextAzimuth, nextPolar) {
      azimuth = nextAzimuth;
      polar = THREE.MathUtils.clamp(nextPolar, MIN_POLAR, MAX_POLAR);
      applyCamera();
    },
    getDebug() {
      return {
        satellites: satellites.size,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        hasContract: Boolean(contractMarker),
        contractMarkers: earthSpinGroup.children.filter(c => c.userData.isContractMarker).length,
        moon: (() => {
          const v = new THREE.Vector3();
          moonMesh.getWorldPosition(v);
          return { x: v.x, y: v.y, z: v.z };
        })(),
        moonAngle: Math.round(moonAngle * 1000) / 1000,
        sunAngle: Math.round(sunOrbitAngle * 100000) / 100000,
        sunDir: { x: sunDir.x, y: sunDir.y, z: sunDir.z },
        eclipseActive: Boolean(eclipse),
        eclipseType: eclipse ? eclipse.type : nextEclipseType,
        nextEclipseType,
        solarSpot: solarSpotGroup.visible,
        solarCone: solarCone.visible,
        eclipsePhase: eclipse
          ? (elapsed - eclipse.start < ECLIPSE_IN ? 'in'
            : elapsed - eclipse.start < ECLIPSE_IN + ECLIPSE_HOLD ? 'total' : 'out')
          : 'none',
        eclipseColor: moonMaterial.color.getHexString(),
        eclipseShadow: eclipseShadow.visible,
        eclipseNextIn: Math.round(Math.max(0, nextEclipseAt - elapsed)),
        moonScreen: (() => {
          const v = new THREE.Vector3();
          moonMesh.getWorldPosition(v);
          v.project(camera);
          return {
            x: Math.round((v.x * 0.5 + 0.5) * canvas.clientWidth),
            y: Math.round((-v.y * 0.5 + 0.5) * canvas.clientHeight),
            z: Math.round(v.z * 100) / 100,
          };
        })(),
        observation: observationCone.visible,
        textureLoaded: Boolean(earthTexture.image && earthTexture.image.width),
        camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov },
        zoom: zoomFactor,
        cameraOrbit: { azimuth, polar },
        planetSpin: earthSpinGroup.rotation.y,
        hasSun: Boolean(sunSprite.parent),
        sunScreen: (() => {
          const v = sunSprite.position.clone().project(camera);
          return {
            x: Math.round((v.x * 0.5 + 0.5) * canvas.clientWidth),
            y: Math.round((-v.y * 0.5 + 0.5) * canvas.clientHeight),
            z: Math.round(v.z * 100) / 100,
          };
        })(),
        orbits: Array.from(satellites.values()).map(e => ({
          type: e.type,
          inclination: e.orbitGroup.rotation.x,
          node: e.orbitGroup.rotation.y,
          parentIsEarth: e.orbitGroup.parent === earthGroup,
          material: e.orbitLine.material.type,
          opacity: e.orbitLine.material.opacity,
          dashSize: e.orbitLine.material.dashSize,
          gapSize: e.orbitLine.material.gapSize,
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
    getSatelliteInfo(id) {
      const entry = satellites.get(id);
      if (!entry) return null;
      return {
        radius: entry.radius,
        distance: entry.radius,
        altitude: entry.radius - EARTH_RADIUS,
        altitudeKm: entry.altitudeKm,
        periodSec: (Math.PI * 2) / Math.abs(entry.speed),
        speed: entry.speed,
        angularSpeed: entry.speed,
        inclinationDeg: THREE.MathUtils.radToDeg(entry.orbitGroup.rotation.x),
        nodeDeg: THREE.MathUtils.radToDeg(entry.orbitGroup.rotation.y),
        geostationary: Math.abs(entry.altitudeKm - GEO_REF_KM) <= 50
          && Math.abs(THREE.MathUtils.radToDeg(entry.orbitGroup.rotation.x)) < 0.5,
      };
    },
    getSatelliteLocalPosition(id) {
      const entry = satellites.get(id);
      if (!entry) return null;
      const v = new THREE.Vector3();
      entry.mesh.getWorldPosition(v);
      earthGroup.worldToLocal(v);
      return { x: v.x, y: v.y, z: v.z };
    },
    getSatelliteSpinLocalPosition(id) {
      const entry = satellites.get(id);
      if (!entry) return null;
      const v = new THREE.Vector3();
      entry.mesh.getWorldPosition(v);
      earthSpinGroup.worldToLocal(v);
      return { x: v.x, y: v.y, z: v.z };
    },
  };
}
