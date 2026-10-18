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
const SUN_DISTANCE = 120;
const SUN_SPRITE_SCALE = 18;
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
    longitudeDeg: Number.isFinite(orbit.longitudeDeg) ? orbit.longitudeDeg : (recommended.longitudeDeg || 0),
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

function makeSatelliteTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createSatelliteMaterials() {
  const solarTexture = makeSatelliteTexture(128, (ctx, size) => {
    ctx.fillStyle = '#061426';
    ctx.fillRect(0, 0, size, size);
    const cell = 16;
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        const tone = (x / cell + y / cell) % 3;
        ctx.fillStyle = tone === 0 ? '#0b2b58' : (tone === 1 ? '#0d3468' : '#092448');
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.fillStyle = 'rgba(94, 156, 220, 0.25)';
        ctx.fillRect(x + 2, y + 2, cell - 4, 2);
      }
    }
    ctx.strokeStyle = 'rgba(188, 214, 240, 0.42)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i += cell) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    ctx.strokeStyle = '#c7a45e';
    ctx.lineWidth = 2;
    for (let i = 0; i <= size; i += cell * 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
    }
  });
  solarTexture.repeat.set(2, 1);

  const goldTexture = makeSatelliteTexture(128, (ctx, size) => {
    ctx.fillStyle = '#9b6b2e';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 240; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const w = 1 + Math.random() * 5;
      const h = 1 + Math.random() * 3;
      const light = Math.random() > 0.45;
      ctx.fillStyle = light
        ? 'rgba(255, 218, 140, 0.18)'
        : 'rgba(72, 42, 14, 0.18)';
      ctx.fillRect(x, y, w, h);
    }
    for (let i = 0; i < 28; i += 1) {
      ctx.strokeStyle = 'rgba(255, 226, 161, 0.13)';
      ctx.beginPath();
      ctx.moveTo(Math.random() * size, Math.random() * size);
      ctx.lineTo(Math.random() * size, Math.random() * size);
      ctx.stroke();
    }
  });
  goldTexture.repeat.set(2, 2);

  const whiteTexture = makeSatelliteTexture(128, (ctx, size) => {
    ctx.fillStyle = '#cbd4dc';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(74, 90, 108, 0.38)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= size; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    for (let i = 0; i < 90; i += 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 1);
    }
  });
  whiteTexture.repeat.set(2, 1);

  const goldMat = new THREE.MeshStandardMaterial({
    map: goldTexture,
    bumpMap: goldTexture,
    bumpScale: 0.006,
    metalness: 0.82,
    roughness: 0.34,
    flatShading: true,
  });
  const whiteMat = new THREE.MeshStandardMaterial({
    map: whiteTexture,
    metalness: 0.28,
    roughness: 0.56,
    flatShading: true,
  });
  const solarMat = new THREE.MeshStandardMaterial({
    map: solarTexture,
    metalness: 0.56,
    roughness: 0.36,
    emissive: 0x061a2f,
    emissiveIntensity: 0.55,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xd6b36b,
    metalness: 0.86,
    roughness: 0.28,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x252b33,
    metalness: 0.82,
    roughness: 0.42,
  });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x071727,
    metalness: 0.62,
    roughness: 0.08,
    emissive: 0x102f4d,
    emissiveIntensity: 0.75,
  });
  const dishMat = new THREE.MeshStandardMaterial({
    color: 0xd4dbe1,
    metalness: 0.38,
    roughness: 0.46,
    side: THREE.DoubleSide,
  });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x59f2b2 });

  return {
    gold: goldMat,
    white: whiteMat,
    solar: solarMat,
    frame: frameMat,
    dark: darkMat,
    lens: lensMat,
    dish: dishMat,
    light: lightMat,
  };
}

function addSolarWing(group, side, mats) {
  const wing = new THREE.Group();
  const assembly = new THREE.Group();
  assembly.position.x = side * 0.34;
  assembly.userData.isSolarPanelAssembly = true;

  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.022, 0.18), mats.solar);
  assembly.add(panel);

  const railX = new THREE.BoxGeometry(0.43, 0.014, 0.014);
  for (const z of [-0.09, 0.09]) {
    const rail = new THREE.Mesh(railX, mats.frame);
    rail.position.set(0, 0.016, z);
    assembly.add(rail);
  }

  const railZ = new THREE.BoxGeometry(0.014, 0.028, 0.19);
  for (const dx of [-0.21, 0.21]) {
    const rail = new THREE.Mesh(railZ, mats.frame);
    rail.position.set(dx, 0, 0);
    assembly.add(rail);
  }

  wing.add(assembly);

  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.012, 0.014), mats.gold);
  boom.position.set(side * 0.19, 0, 0);
  wing.add(boom);

  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 8), mats.frame);
  hinge.rotation.z = Math.PI / 2;
  hinge.position.x = side * 0.12;
  wing.add(hinge);

  group.add(wing);
  return assembly;
}

function buildSatelliteMesh(type) {
  const group = new THREE.Group();
  const mats = createSatelliteMaterials();
  const isRelay = type === 'relay';
  const bodyRadius = isRelay ? 0.13 : 0.12;

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyRadius, bodyRadius, 0.24, 8),
    isRelay ? mats.white : mats.gold
  );
  body.rotation.x = Math.PI / 2;
  group.add(body);

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyRadius + 0.006, bodyRadius + 0.006, 0.045, 8),
    isRelay ? mats.gold : mats.white
  );
  band.rotation.x = Math.PI / 2;
  band.position.z = 0.02;
  group.add(band);

  const antennaMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.13, 6),
    mats.frame
  );
  antennaMast.position.y = 0.17;
  group.add(antennaMast);

  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), mats.frame);
  antennaTip.position.y = 0.24;
  group.add(antennaTip);

  for (const x of [-0.055, 0.055]) {
    const thruster = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.055, 8), mats.dark);
    thruster.rotation.x = -Math.PI / 2;
    thruster.position.set(x, 0, -0.145);
    group.add(thruster);
  }

  const statusLight = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), mats.light);
  statusLight.position.set(0.075, 0.07, 0.115);
  group.add(statusLight);

  if (isRelay) {
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      mats.dish
    );
    // Чаша должна открываться вниз, к Земле: верхняя полусфера без
    // переворота, вершиной к корпусу.
    dish.position.y = -0.30;
    group.add(dish);

    for (let i = 0; i < 3; i += 1) {
      const angle = (Math.PI * 2 * i) / 3;
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.18, 6),
        mats.frame
      );
      strut.position.set(Math.cos(angle) * 0.13, -0.21, Math.sin(angle) * 0.13);
      group.add(strut);
    }

    const feed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.022, 0.13, 8),
      mats.gold
    );
    feed.position.y = -0.33;
    group.add(feed);
  } else {
    const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 24), mats.frame);
    lensRing.position.z = 0.13;
    group.add(lensRing);

    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.054, 0.012, 24),
      mats.lens
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.138;
    group.add(lens);

    const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.07), mats.white);
    sensor.position.set(0, 0.085, 0.08);
    group.add(sensor);
  }

  const solarPanels = [];
  for (const x of [-1, 1]) solarPanels.push(addSolarWing(group, x, mats));

  group.userData.solarPanels = solarPanels;

  const greebleGeo = new THREE.BoxGeometry(0.028, 0.024, 0.032);
  for (const x of [-0.08, 0.08]) {
    const greeble = new THREE.Mesh(greebleGeo, mats.dark);
    greeble.position.set(x, -0.075, 0.06);
    group.add(greeble);
  }

  group.scale.setScalar(1.3);
  group.userData.modelType = type;
  group.userData.workingAxis = isRelay
    ? new THREE.Vector3(0, -1, 0)
    : new THREE.Vector3(0, 0, 1);
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
  let focusSatelliteId = null;
  let focusZoom = 1;
  let savedView = null;
  const focusTarget = new THREE.Vector3();

  const sunDir = new THREE.Vector3(5, 0, 3.2).normalize();
  const sunBaseDir = sunDir.clone();
  const sunAxis = new THREE.Vector3(0, 1, 0);
  let sunOrbitAngle = 0;
  const sunLight = new THREE.DirectionalLight(0xfff2dd, 3.0);
  sunLight.position.copy(sunDir).multiplyScalar(20);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x1b2a44, 1.35));

  // Космический фон: несколько далёких слоёв звёзд, полоса Млечного
  // Пути и слабые туманности. Радиусы намеренно намного больше камеры,
  // чтобы при отдалении не возникало ощущения близких звёзд.
  const starfield = new THREE.Group();
  scene.add(starfield);
  const starfieldStats = {
    layers: 0,
    stars: 0,
    minRadius: Infinity,
    maxRadius: 0,
    nebulas: 0,
  };

  function createStarLayer({
    count,
    radiusMin,
    radiusMax,
    size,
    color,
    opacity,
    band = false,
    bandWidth = 0.2,
    renderOrder = -2,
  }) {
    const positions = new Float32Array(count * 3);
    const normal = new THREE.Vector3(0.36, 0.82, 0.44).normalize();
    const helper = new THREE.Vector3(1, 0, 0);
    const basisU = new THREE.Vector3().crossVectors(normal, helper).normalize();
    const basisV = new THREE.Vector3().crossVectors(normal, basisU).normalize();

    for (let i = 0; i < count; i += 1) {
      let x;
      let y;
      let z;
      if (band) {
        const phi = Math.random() * Math.PI * 2;
        const offset = (Math.random() - 0.5) * bandWidth;
        const cos = Math.cos(phi);
        const sin = Math.sin(phi);
        x = basisU.x * cos + basisV.x * sin + normal.x * offset;
        y = basisU.y * cos + basisV.y * sin + normal.y * offset;
        z = basisU.z * cos + basisV.z * sin + normal.z * offset;
      } else {
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        x = s * Math.cos(a);
        y = u;
        z = s * Math.sin(a);
      }

      const length = Math.hypot(x, y, z) || 1;
      const radius = radiusMin + Math.random() * (radiusMax - radiusMin);
      positions[i * 3] = (x / length) * radius;
      positions[i * 3 + 1] = (y / length) * radius;
      positions[i * 3 + 2] = (z / length) * radius;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    points.renderOrder = renderOrder;
    points.frustumCulled = false;
    starfield.add(points);
    starfieldStats.layers += 1;
    starfieldStats.stars += count;
    starfieldStats.minRadius = Math.min(starfieldStats.minRadius, radiusMin);
    starfieldStats.maxRadius = Math.max(starfieldStats.maxRadius, radiusMax);
    return points;
  }

  createStarLayer({
    count: 3400,
    radiusMin: 220,
    radiusMax: 280,
    size: 0.9,
    color: 0xdce9ff,
    opacity: 0.9,
    renderOrder: -3,
  });
  createStarLayer({
    count: 850,
    radiusMin: 160,
    radiusMax: 210,
    size: 0.72,
    color: 0x9fc4ff,
    opacity: 0.72,
  });
  createStarLayer({
    count: 260,
    radiusMin: 130,
    radiusMax: 180,
    size: 0.62,
    color: 0xffd9a8,
    opacity: 0.55,
  });
  createStarLayer({
    count: 950,
    radiusMin: 210,
    radiusMax: 270,
    size: 0.55,
    color: 0xcddcff,
    opacity: 0.48,
    band: true,
    bandWidth: 0.22,
    renderOrder: -2,
  });

  // Мягкие туманности: почти прозрачные цветные пятна на дальнем плане.
  const nebulaCanvas = document.createElement('canvas');
  nebulaCanvas.width = 256;
  nebulaCanvas.height = 256;
  const nebulaCtx = nebulaCanvas.getContext('2d');
  const nebulaGradient = nebulaCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
  nebulaGradient.addColorStop(0, 'rgba(255,255,255,0.75)');
  nebulaGradient.addColorStop(0.28, 'rgba(255,255,255,0.28)');
  nebulaGradient.addColorStop(0.62, 'rgba(255,255,255,0.07)');
  nebulaGradient.addColorStop(1, 'rgba(255,255,255,0)');
  nebulaCtx.fillStyle = nebulaGradient;
  nebulaCtx.fillRect(0, 0, 256, 256);
  const nebulaTexture = new THREE.CanvasTexture(nebulaCanvas);
  nebulaTexture.colorSpace = THREE.SRGBColorSpace;

  const nebulaSpecs = [
    { direction: new THREE.Vector3(-0.9, 0.2, -0.35), color: 0x315f9c, scale: 150, opacity: 0.09 },
    { direction: new THREE.Vector3(0.62, -0.35, 0.7), color: 0x4f3f8e, scale: 120, opacity: 0.07 },
    { direction: new THREE.Vector3(0.25, 0.82, -0.5), color: 0x2f6e7a, scale: 110, opacity: 0.06 },
    { direction: new THREE.Vector3(-0.45, -0.55, 0.7), color: 0x755079, scale: 140, opacity: 0.055 },
    { direction: new THREE.Vector3(0.9, 0.25, 0.35), color: 0x3d5f9c, scale: 130, opacity: 0.05 },
  ];

  for (const spec of nebulaSpecs) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebulaTexture,
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    sprite.position.copy(spec.direction.normalize()).multiplyScalar(235);
    sprite.scale.setScalar(spec.scale);
    sprite.renderOrder = -4;
    sprite.frustumCulled = false;
    starfield.add(sprite);
    starfieldStats.nebulas += 1;
  }

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
  sunSprite.position.copy(sunDir).multiplyScalar(SUN_DISTANCE);
  sunSprite.scale.setScalar(SUN_SPRITE_SCALE);
  scene.add(sunSprite);

  const solarUp = new THREE.Vector3(0, 1, 0);
  const solarPanelWorld = new THREE.Vector3();
  const solarPanelDirection = new THREE.Vector3();
  const solarParentQuaternion = new THREE.Quaternion();
  const solarTargetQuaternion = new THREE.Quaternion();

  function aimSolarPanels(mesh) {
    const panels = mesh.userData.solarPanels || [];
    for (const panel of panels) {
      panel.getWorldPosition(solarPanelWorld);
      solarPanelDirection.copy(sunSprite.position).sub(solarPanelWorld).normalize();
      panel.parent.getWorldQuaternion(solarParentQuaternion);
      solarParentQuaternion.invert();
      solarPanelDirection.applyQuaternion(solarParentQuaternion);
      solarTargetQuaternion.setFromUnitVectors(solarUp, solarPanelDirection);
      panel.quaternion.copy(solarTargetQuaternion);
    }
  }

  const satelliteNadir = new THREE.Vector3();

  function orientSatelliteToEarth(mesh) {
    const workingAxis = mesh.userData.workingAxis || new THREE.Vector3(0, 0, 1);
    // Орбитальная группа центрирована на Земле, поэтому направление
    // к планете — это минус локальная позиция аппарата.
    satelliteNadir.copy(mesh.position).negate().normalize();
    mesh.quaternion.setFromUnitVectors(workingAxis, satelliteNadir);
  }

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
  let contractMarkers = [];
  let contractTargets = [];
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
    // Размер аппарата не зависит от высоты орбиты: связь не должна
    // выглядеть гигантской рядом с картографом.
    mesh.scale.setScalar(1.3);
    const phase = isRelay
      ? -earthSpinGroup.rotation.y - THREE.MathUtils.degToRad(orbit.longitudeDeg)
      : index * 2.1;
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
    satellites.set(sat.id, { mesh, orbitGroup, orbitLine, radius, speed, phase, ring, type: sat.type, altitudeKm: orbit.altitudeKm, longitudeDeg: orbit.longitudeDeg });
  }

  function updateSatelliteOrbit(id, orbit) {
    const entry = satellites.get(id);
    if (!entry || !orbit) return false;
    const altitude = Math.max(ORBIT_MIN_KM, Math.min(ORBIT_MAX_KM, Number(orbit.altitudeKm) || LEO_REF_KM));
    const inclination = Math.max(0, Math.min(180, Number(orbit.inclinationDeg) || 0));
    const longitude = Math.max(-180, Math.min(180, Number(orbit.longitudeDeg) || 0));
    const radius = visualRadiusForAltitude(altitude);
    const speed = angularSpeedForOrbit(altitude, radius);

    entry.radius = radius;
    entry.speed = speed;
    entry.altitudeKm = altitude;
    entry.longitudeDeg = longitude;
    if (entry.type === 'relay') {
      entry.phase = -earthSpinGroup.rotation.y - THREE.MathUtils.degToRad(longitude);
    }
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
    entry.mesh.scale.setScalar(1.3);
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

    if (focusSatelliteId && !ids.has(focusSatelliteId)) {
      focusSatelliteId = null;
      savedView = null;
      focusZoom = 1;
    }

    list.forEach((sat, index) => {
      if (!satellites.has(sat.id)) createSatellite(sat, index);
    });
    for (const [id, entry] of satellites) {
      const selected = list.some(s => s.id === id && s.selected);
      entry.ring.visible = selected;
    }
  }

  function disposeContractMarkers() {
    for (const marker of contractMarkers) {
      marker.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      });
      earthSpinGroup.remove(marker);
    }
    contractMarkers = [];
    contractTargets = [];
  }

  function setContract(next) {
    contract = next;
    disposeContractMarkers();
    if (!next) return;

    const targets = Array.isArray(next.targets) && next.targets.length
      ? next.targets
      : [{ id: 'legacy-target', lat: next.lat, lon: next.lon, shot: false }];

    targets.forEach((target, index) => {
      const local = latLonToVec3(target.lat, target.lon, CONTRACT_RADIUS);
      const done = Boolean(target.shot);
      const color = done ? 0x4a8d7a : 0x59f2b2;
      const group = new THREE.Group();
      group.position.copy(local);
      group.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        local.clone().normalize()
      );

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.055, 0.088, 40),
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: done ? 0.22 : 0.95,
          depthWrite: false,
        })
      );
      group.add(ring);

      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.018, 24),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: done ? 0.2 : 0.9,
          depthWrite: false,
        })
      );
      dot.position.z = 0.002;
      group.add(dot);

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.012, 0.42, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: done ? 0.05 : 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      beam.rotation.x = Math.PI / 2;
      beam.position.z = 0.21;
      group.add(beam);

      group.scale.setScalar(done ? 0.75 : 1);
      group.userData.isContractMarker = true;
      group.userData.targetId = target.id || 'target-' + index;
      group.userData.done = done;
      group.userData.phase = index * 0.9;
      earthSpinGroup.add(group);
      contractMarkers.push(group);
      contractTargets.push({
        id: target.id || 'target-' + index,
        local,
        group,
        shot: done,
      });
    });
  }

  function getContractAngles(satId) {
    const entry = satellites.get(satId);
    if (!entry || contractTargets.length === 0) return [];
    earthGroup.updateMatrixWorld(true);
    const satPos = new THREE.Vector3();
    entry.mesh.getWorldPosition(satPos);
    const satDir = satPos.clone().normalize();
    return contractTargets.map(target => {
      const world = earthSpinGroup.localToWorld(target.local.clone()).normalize();
      return {
        id: target.id,
        angle: satDir.angleTo(world),
        shot: target.shot,
      };
    });
  }

  function getAngleToContract(satId, targetId = null) {
    const targets = getContractAngles(satId);
    if (targets.length === 0) return null;
    if (targetId) {
      const target = targets.find(item => item.id === targetId);
      return target ? target.angle : null;
    }
    const next = targets.find(item => !item.shot);
    return next ? next.angle : null;
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
    sunSprite.position.copy(sunDir).multiplyScalar(SUN_DISTANCE);

    for (const entry of satellites.values()) {
      entry.phase += entry.speed * dt;
      entry.mesh.position.set(
        Math.cos(entry.phase) * entry.radius,
        0,
        Math.sin(entry.phase) * entry.radius
      );
      orientSatelliteToEarth(entry.mesh);
      aimSolarPanels(entry.mesh);
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

    for (const marker of contractMarkers) {
      if (marker.userData.done) continue;
      const phase = marker.userData.phase || 0;
      marker.scale.setScalar(1 + 0.10 * Math.sin(elapsed * 3 + phase));
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

    // Планета вращается всегда, даже когда палец удерживается или
    // камера облетает сцену. Пауза останавливает её отдельно.
    earthSpinGroup.rotation.y -= AUTO_SPIN * dt;

    if (!dragging) {
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

    if (focusSatelliteId) applyCamera();
  }

  function render() {
    // Фон привязан к камере: звёзды не смещаются при зуме и облёте.
    starfield.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  function baseDistance(aspect) {
    return aspect < 0.8 ? 12.5 : (aspect < 1.2 ? 10.5 : 8.8);
  }

  function focusDistanceForAspect(aspect) {
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * aspect);
    const half = Math.min(vertical, horizontal);
    return (1.02 / Math.tan(half)) * 1.32;
  }

  function applyCamera() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const aspect = width / height;
    const focused = focusSatelliteId ? satellites.get(focusSatelliteId) : null;
    if (focusSatelliteId && !focused) {
      focusSatelliteId = null;
      savedView = null;
      focusZoom = 1;
    }
    const distance = focused
      ? focusDistanceForAspect(aspect) * focusZoom
      : baseDistance(aspect) * zoomFactor;
    focusTarget.set(0, 0, 0);
    if (focused) focused.mesh.getWorldPosition(focusTarget);
    const sinPolar = Math.sin(polar);
    camera.aspect = aspect;
    camera.position.set(
      focusTarget.x + distance * sinPolar * Math.sin(azimuth),
      focusTarget.y + distance * Math.cos(polar),
      focusTarget.z + distance * sinPolar * Math.cos(azimuth)
    );
    camera.lookAt(focusTarget);
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

  function focusSatellite(id) {
    const entry = satellites.get(id);
    if (!entry) return false;
    if (!focusSatelliteId) {
      savedView = { azimuth, polar, zoomFactor };
    }
    spinAzimuth = 0;
    spinPolar = 0;
    focusSatelliteId = id;
    focusZoom = 1;
    applyCamera();
    return true;
  }

  function focusEarth() {
    if (!focusSatelliteId) return false;
    focusSatelliteId = null;
    focusZoom = 1;
    spinAzimuth = 0;
    spinPolar = 0;
    if (savedView) {
      azimuth = savedView.azimuth;
      polar = savedView.polar;
      zoomFactor = savedView.zoomFactor;
      savedView = null;
    }
    applyCamera();
    return true;
  }

  function zoomToOrbit(radius) {
    if (focusSatelliteId) focusEarth();
    zoomFactor = zoomForRadius(radius);
    applyCamera();
    return zoomFactor;
  }

  function setZoom(value) {
    if (focusSatelliteId) {
      focusZoom = THREE.MathUtils.clamp(Number(value) || 1, 0.55, 2.5);
      applyCamera();
      return focusZoom;
    }
    zoomFactor = THREE.MathUtils.clamp(Number(value) || 1, MIN_ZOOM, MAX_ZOOM);
    applyCamera();
    return zoomFactor;
  }

  function getZoom() {
    return focusSatelliteId ? focusZoom : zoomFactor;
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
      pinchStartZoom = focusSatelliteId ? focusZoom : zoomFactor;
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size >= 2) {
      const distance = pointerDistance();
      if (pinchStartDistance > 0 && distance > 0) {
        if (focusSatelliteId) {
          focusZoom = THREE.MathUtils.clamp(
            pinchStartZoom * (pinchStartDistance / distance),
            0.55,
            2.5
          );
        } else {
          zoomFactor = THREE.MathUtils.clamp(
            pinchStartZoom * (pinchStartDistance / distance),
            MIN_ZOOM,
            MAX_ZOOM
          );
        }
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
    if (focusSatelliteId) {
      focusZoom = THREE.MathUtils.clamp(focusZoom * factor, 0.55, 2.5);
    } else {
      zoomFactor = THREE.MathUtils.clamp(zoomFactor * factor, MIN_ZOOM, MAX_ZOOM);
    }
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
    focusSatellite,
    focusEarth,
    zoomToOrbit,
    setZoom,
    getZoom,
    getVisualRadius(altitudeKm) {
      return visualRadiusForAltitude(altitudeKm);
    },
    setContract,
    getAngleToContract,
    getContractAngles,
    getSolarPanelDirections() {
      const result = [];
      for (const [id, entry] of satellites) {
        const panels = entry.mesh.userData.solarPanels || [];
        for (const panel of panels) {
          const quaternion = new THREE.Quaternion();
          panel.getWorldQuaternion(quaternion);
          const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
          result.push({ id, dot: normal.dot(sunDir) });
        }
      }
      return result;
    },
    getSatelliteWorkingDirections() {
      const result = [];
      const earthWorld = new THREE.Vector3();
      earthGroup.getWorldPosition(earthWorld);
      for (const [id, entry] of satellites) {
        const quaternion = new THREE.Quaternion();
        entry.mesh.getWorldQuaternion(quaternion);
        const axis = (entry.mesh.userData.workingAxis || new THREE.Vector3(0, 0, 1))
          .clone()
          .applyQuaternion(quaternion);
        const position = new THREE.Vector3();
        entry.mesh.getWorldPosition(position);
        const toEarth = earthWorld.clone().sub(position).normalize();
        result.push({ id, dot: axis.dot(toEarth) });
      }
      return result;
    },
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
        hasContract: contractMarkers.length > 0,
        contractMarkers: contractMarkers.length,
        contractTargets: contractTargets.length,
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
        zoom: focusSatelliteId ? focusZoom : zoomFactor,
        focusSatelliteId,
        focusZoom,
        cameraOrbit: { azimuth, polar },
        planetSpin: -earthSpinGroup.rotation.y,
        hasSun: Boolean(sunSprite.parent),
        starfield: {
          ...starfieldStats,
          cameraAttached: true,
          parallax: Math.round(starfield.position.distanceTo(camera.position) * 1000) / 1000,
        },
        sunDistance: Math.round(sunSprite.position.length() * 100) / 100,
        sunScale: sunSprite.scale.x,
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
        longitudeDeg: entry.longitudeDeg,
        visualScale: entry.mesh.scale.x,
        solarPanels: entry.mesh.userData.solarPanels?.length || 0,
        periodSec: (Math.PI * 2) / Math.abs(entry.speed),
        speed: entry.speed,
        angularSpeed: entry.speed,
        phase: entry.phase,
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
      earthGroup.updateMatrixWorld(true);
      earthGroup.worldToLocal(v);
      v.applyAxisAngle(new THREE.Vector3(0, 1, 0), -earthSpinGroup.rotation.y);
      return { x: v.x, y: v.y, z: v.z };
    },
  };
}
