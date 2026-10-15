import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Поле золотых маков на калифорнийских холмах. Прокрутка (0..1) двигает камеру
// по маршруту и ведёт день от утра к ночи.

const HERO_POS = new THREE.Vector3(0, 0, 40);

// Пятна, где маки растут гуще всего (0..1). Земля под ними тоже окрашена —
// так вдалеке поле выглядит сплошным ковром.
export function poppyPatch(x, z) {
  return 0.5 + 0.5 * Math.sin(x * 0.07 + Math.cos(z * 0.045) * 2.2) * Math.cos(z * 0.05 - x * 0.02);
}

export function groundHeight(x, z) {
  const far = Math.max(0, -z - 150);
  return (
    Math.sin(x * 0.045) * Math.cos(z * 0.03) * 1.1 +
    Math.sin(x * 0.11 + z * 0.07) * 0.35 +
    far * far * 0.0009 * (1.2 + Math.sin(x * 0.03))
  );
}

// Время суток: ключевые точки прокрутки и палитра неба.
const PHASES = [
  { p: 0.0, top: '#e7b866', horizon: '#ffe6b3', bottom: '#d9b46a', sun: '#fff0c4', elev: 0.32, light: 2.6, hemi: 1.1, night: 0 },
  { p: 0.35, top: '#d79a4f', horizon: '#ffd28a', bottom: '#cf9a52', sun: '#ffd27a', elev: 0.16, light: 2.4, hemi: 0.95, night: 0 },
  { p: 0.62, top: '#6e4a7a', horizon: '#ff9a5c', bottom: '#a8603f', sun: '#ff7a3d', elev: 0.03, light: 1.6, hemi: 0.6, night: 0.1 },
  { p: 0.8, top: '#1c1c45', horizon: '#6b4a7a', bottom: '#2a2240', sun: '#ff9a7a', elev: -0.05, light: 0.5, hemi: 0.35, night: 0.6 },
  { p: 1.0, top: '#060a1e', horizon: '#1d2348', bottom: '#0b0f24', sun: '#b9c6ff', elev: 0.28, light: 0.35, hemi: 0.25, night: 1 },
];

function phaseAt(p) {
  let i = 0;
  while (i < PHASES.length - 2 && p > PHASES[i + 1].p) i++;
  const a = PHASES[i];
  const b = PHASES[i + 1];
  const t = THREE.MathUtils.smoothstep(p, a.p, b.p);
  return { a, b, t };
}

// Маршрут камеры: позиция и точка взгляда для каждого «кадра» истории.
const CAM_POS = [
  [0, 1.95, 44.7],
  [3.5, 4.6, 54],
  [-7, 3.2, 30],
  [5, 2.1, 4],
  [-3, 2.3, -32],
  [0, 7.5, -58],
  [0, 5.2, -100],
].map((v) => new THREE.Vector3(...v));
const CAM_LOOK = [
  [0, 1.62, 40],
  [0, 1.2, 30],
  [0, 1.1, 0],
  [-4, 1.0, -28],
  [0, 1.4, -70],
  [0, 4.5, -150],
  [0, 2.2, -150],
].map((v) => new THREE.Vector3(...v));

export function createScene(canvas, { reducedMotion = false } = {}) {
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#ffe6b3', 0.0052);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 900);
  const camPath = new THREE.CatmullRomCurve3(CAM_POS, false, 'centripetal');
  const lookPath = new THREE.CatmullRomCurve3(CAM_LOOK, false, 'centripetal');
  const camPos = camPath.getPoint(0);
  const camLook = lookPath.getPoint(0);
  camera.position.copy(camPos);

  const shared = {
    uTime: { value: 0 },
    uPointer: { value: new THREE.Vector2(999, 999) },
    uGrow: { value: reducedMotion ? 1 : 0 },
  };

  // --- свет ---
  const hemi = new THREE.HemisphereLight('#ffe9c0', '#6a5a2a', 1);
  const sun = new THREE.DirectionalLight('#fff0c4', 2.5);
  scene.add(hemi, sun, sun.target);

  // --- небо ---
  const skyUniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 0.3, -1) },
    uNight: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uBottom, uSunColor, uSunDir;
        uniform float uNight;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.55, d.y));
          col = mix(uBottom, col, smoothstep(-0.12, 0.02, d.y));
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          float disc = smoothstep(0.9994, 0.9997, s);
          col += uSunColor * (disc * 3.0 + pow(s, 14.0) * 0.5 * (1.0 - uNight * 0.7) + pow(s, 3.0) * 0.12);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // звёзды живут вместе с небом
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(1400 * 3);
  for (let i = 0; i < 1400; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.acos(THREE.MathUtils.lerp(0.04, 1, Math.random()));
    starPos.set([Math.sin(v) * Math.cos(u) * 450, Math.cos(v) * 450, Math.sin(v) * Math.sin(u) * 450], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: '#fff6dc', size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  sky.add(new THREE.Points(starGeo, starMat));

  // --- земля ---
  const groundGeo = new THREE.PlaneGeometry(360, 460, 180, 230);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(0, 0, -90);
  {
    const pos = groundGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c1 = new THREE.Color('#6f6224');
    const c2 = new THREE.Color('#b0913f');
    const c3 = new THREE.Color('#e0861a');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, groundHeight(x, z));
      const n = 0.5 + 0.5 * Math.sin(x * 0.08 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.06);
      c.lerpColors(c1, c2, n);
      const inField = THREE.MathUtils.smoothstep(Math.abs(x), 70, 35) * THREE.MathUtils.smoothstep(z, 80, 60);
      c.lerp(c3, poppyPatch(x, z) ** 2 * 0.75 * inField);
      c.toArray(colors, i * 3);
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    groundGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.2 }));
  scene.add(ground);

  // --- поле: трава и маки ---
  const FIELD = { x: 70, zNear: 75, zFar: -235 };
  const grassCount = mobile ? 9000 : 24000;
  const flowerCount = mobile ? 11000 : 32000;

  const grass = new THREE.InstancedMesh(grassGeometry(), windMaterial(shared, { roughness: 0.9, envMapIntensity: 0.3 }), grassCount);
  const flowers = new THREE.InstancedMesh(poppyGeometry(), windMaterial(shared, { roughness: 0.5, metalness: 0.15, envMapIntensity: 0.6 }), flowerCount);
  scatter(grass, grassCount, () => true, [0.6, 1.2]);
  scatter(flowers, flowerCount, (x, z) => {
    // маки растут пятнами, как настоящее поле
    return Math.random() < 0.15 + poppyPatch(x, z) * 0.85;
  }, [0.8, 1.45]);
  scene.add(grass, flowers);

  function scatter(mesh, count, accept, [smin, smax]) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const phase = new Float32Array(count);
    const delay = new Float32Array(count);
    let i = 0;
    let guard = 0;
    while (i < count && guard++ < count * 20) {
      // гуще вдоль тропинки камеры, реже к краям
      const x = ((Math.random() + Math.random() + Math.random()) / 1.5 - 1) * FIELD.x;
      const z = THREE.MathUtils.lerp(FIELD.zNear, FIELD.zFar, Math.random());
      if (!accept(x, z)) continue;
      // оставляем немного места вокруг главного цветка
      if (Math.hypot(x - HERO_POS.x, z - HERO_POS.z) < 1.1) continue;
      p.set(x, groundHeight(x, z) - 0.02, z);
      e.set((Math.random() - 0.5) * 0.25, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25);
      q.setFromEuler(e);
      const k = THREE.MathUtils.lerp(smin, smax, Math.random());
      s.set(k, k * THREE.MathUtils.lerp(0.8, 1.2, Math.random()), k);
      mesh.setMatrixAt(i, m.compose(p, q, s));
      phase[i] = Math.random();
      delay[i] = Math.min(1, Math.hypot(x - HERO_POS.x, z - HERO_POS.z) / 140) * 0.75 + Math.random() * 0.08;
      i++;
    }
    mesh.count = i;
    mesh.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    mesh.geometry.setAttribute('aDelay', new THREE.InstancedBufferAttribute(delay, 1));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
  }

  // --- далёкие холмы и мост ---
  const hillMat = new THREE.MeshStandardMaterial({ color: '#9c7a3c', roughness: 1, envMapIntensity: 0.1 });
  for (let i = 0; i < 9; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), hillMat);
    const x = -170 + i * 42 + (Math.random() - 0.5) * 20;
    hill.scale.set(40 + Math.random() * 30, 14 + Math.random() * 16, 30);
    hill.position.set(x, -4, -275 - Math.random() * 30);
    scene.add(hill);
  }
  scene.add(goldenGate());

  // --- главный цветок ---
  const hero = heroFlower();
  hero.group.position.copy(HERO_POS);
  hero.group.position.y = groundHeight(HERO_POS.x, HERO_POS.z);
  scene.add(hero.group);

  // --- пыльца днём, светлячки ночью ---
  const motes = pollen(mobile ? 700 : 1600, renderer.getPixelRatio());
  scene.add(motes.points);

  // --- посаженные гостем цветы ---
  const planted = new THREE.Group();
  scene.add(planted);
  const plantMat = new THREE.MeshPhysicalMaterial({ color: '#f5c04a', metalness: 0.7, roughness: 0.3, clearcoat: 0.6, emissive: '#ffb000', emissiveIntensity: 0, side: THREE.DoubleSide });
  const plantGeo = mergeGeometries(
    [
      ...Array.from({ length: 5 }, (_, i) => petalGeometry(0.42, 0.26, 0.08).rotateX(1.2).rotateY((i / 5) * Math.PI * 2).translate(0, 1.4, 0)),
      new THREE.CylinderGeometry(0.025, 0.035, 1.45, 5).translate(0, 0.72, 0),
      new THREE.SphereGeometry(0.1, 10, 8).translate(0, 1.42, 0),
    ].map((g) => (g.deleteAttribute('uv'), g)),
  );

  function plant(point, animate = true) {
    const mesh = new THREE.Mesh(plantGeo, plantMat);
    mesh.position.copy(point);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.userData.born = animate ? shared.uTime.value : -10;
    mesh.scale.setScalar(animate ? 0.001 : 1);
    planted.add(mesh);
    if (planted.children.length > 60) planted.remove(planted.children[0]);
  }

  // --- взаимодействие ---
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pointer = { x: 0, y: 0 };
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  function pickGround(clientX, clientY) {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(ground, false);
    if (hits.length) return hits[0].point;
    return raycaster.ray.intersectPlane(groundPlane, hit);
  }

  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / window.innerWidth - 0.5;
    pointer.y = e.clientY / window.innerHeight - 0.5;
    const p = pickGround(e.clientX, e.clientY);
    if (p) shared.uPointer.value.set(p.x, p.z);
  });

  // --- состояние ---
  let progress = 0;
  let bloom = reducedMotion ? 1 : 0;
  let intro = reducedMotion ? 1 : 0;
  const clock = new THREE.Clock();
  const tmpA = new THREE.Color();
  const sunDir = new THREE.Vector3();

  function applyPhase(p) {
    const { a, b, t } = phaseAt(p);
    const mix = (k, target) => target.lerpColors(tmpA.set(a[k]), new THREE.Color(b[k]), t);
    mix('top', skyUniforms.uTop.value);
    mix('horizon', skyUniforms.uHorizon.value);
    mix('bottom', skyUniforms.uBottom.value);
    mix('sun', skyUniforms.uSunColor.value);
    const night = THREE.MathUtils.lerp(a.night, b.night, t);
    skyUniforms.uNight.value = night;
    const elev = THREE.MathUtils.lerp(a.elev, b.elev, t);
    sunDir.set(0.35, elev, -1).normalize();
    skyUniforms.uSunDir.value.copy(sunDir);
    sun.color.copy(skyUniforms.uSunColor.value);
    sun.intensity = THREE.MathUtils.lerp(a.light, b.light, t);
    sun.position.copy(camera.position).addScaledVector(sunDir, 50);
    sun.target.position.copy(camera.position);
    hemi.color.copy(skyUniforms.uTop.value).lerp(new THREE.Color('#fff2d0'), 0.5 * (1 - night));
    hemi.groundColor.copy(skyUniforms.uBottom.value);
    hemi.intensity = THREE.MathUtils.lerp(a.hemi, b.hemi, t);
    scene.fog.color.copy(skyUniforms.uHorizon.value);
    // ночью гасим отражения и экспозицию, чтобы поле правда потемнело
    scene.environmentIntensity = THREE.MathUtils.lerp(0.55, 0.06, night);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.05, 0.85, night);
    starMat.opacity = THREE.MathUtils.smoothstep(night, 0.4, 1);
    motes.uniforms.uNight.value = night;
    plantMat.emissiveIntensity = night * 0.9;
    hero.setNight(night);
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    // на узких экранах отодвигаем камеру шире, чтобы цветок помещался
    camera.fov = camera.aspect < 0.8 ? 62 : 50;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    motes.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }
  window.addEventListener('resize', resize);
  resize();

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = (shared.uTime.value += reducedMotion ? dt * 0.25 : dt);

    // интро: цветок раскрывается, поле прорастает вокруг
    intro = Math.min(1, intro + dt / 3.2);
    const introE = 1 - Math.pow(1 - intro, 3);
    bloom = Math.max(introE, 0);
    shared.uGrow.value = Math.max(introE * 0.3, Math.min(1, 0.3 + progress / 0.18));
    hero.setBloom(bloom, time);

    // камера мягко догоняет точку маршрута
    const target = camPath.getPoint(progress);
    const look = lookPath.getPoint(progress);
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 4);
    camPos.lerp(target, k);
    camLook.lerp(look, k);
    const sway = reducedMotion ? 0 : 1;
    camera.position.set(
      camPos.x + pointer.x * 0.6 * sway + Math.sin(time * 0.3) * 0.08 * sway,
      camPos.y - pointer.y * 0.3 * sway + Math.sin(time * 0.45) * 0.05 * sway,
      camPos.z,
    );
    camera.position.y = Math.max(camera.position.y, groundHeight(camera.position.x, camera.position.z) + 0.9);
    camera.lookAt(camLook);
    sky.position.copy(camera.position);

    applyPhase(progress);
    motes.uniforms.uTime.value = time;
    motes.uniforms.uCam.value.copy(camera.position);

    for (const m of planted.children) {
      const age = time - m.userData.born;
      const g = Math.min(1, age / 1.4);
      m.scale.setScalar(Math.max(0.001, 1 - Math.pow(1 - g, 3) + Math.sin(g * Math.PI) * 0.12));
      m.rotation.z = Math.sin(time * 1.2 + m.position.x) * 0.04;
    }

    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);

  return {
    setProgress(p) {
      progress = THREE.MathUtils.clamp(p, 0, 1);
    },
    plantAt(clientX, clientY) {
      const p = pickGround(clientX, clientY);
      if (!p) return null;
      plant(p.clone());
      return p;
    },
    restore(points) {
      for (const [x, z] of points) plant(new THREE.Vector3(x, groundHeight(x, z), z), false);
    },
    get planted() {
      return planted.children.map((m) => [+m.position.x.toFixed(2), +m.position.z.toFixed(2)]);
    },
  };
}

// ---------- материалы и геометрия ----------

// Ветер, «прорастание» и отклик на курсор — прямо в вершинном шейдере.
function windMaterial(shared, params) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, ...params });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec2 uPointer;
        uniform float uGrow;
        attribute float aPhase;
        attribute float aDelay;`,
      )
      .replace(
        '#include <project_vertex>',
        `
        float grow = smoothstep(aDelay, aDelay + 0.25, uGrow);
        vec3 local = transformed * vec3(mix(0.2, 1.0, grow), grow, mix(0.2, 1.0, grow));
        vec4 wp = instanceMatrix * vec4(local, 1.0);
        vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float h = max(local.y, 0.0);
        float bend = h * h;
        float gust = sin(uTime * 0.6 + root.x * 0.05 + root.z * 0.04) * 0.5 + 0.5;
        float w = sin(uTime * 1.6 + root.x * 0.18 + root.z * 0.12 + aPhase * 6.283) * (0.08 + gust * 0.1)
                + sin(uTime * 3.1 + aPhase * 17.0) * 0.025;
        vec2 away = root.xz - uPointer;
        float d = length(away);
        vec2 push = away / max(d, 0.001) * smoothstep(4.5, 0.0, d) * 0.55;
        wp.x += (w + gust * 0.12) * bend + push.x * bend;
        wp.z += w * 0.4 * bend + push.y * bend;
        wp.y -= length(push) * bend * 0.25;
        vec4 mvPosition = modelViewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  return mat;
}

function paint(geo, colorFn) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) colorFn(c, pos.getX(i), pos.getY(i), pos.getZ(i)).toArray(colors, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// Пучок из пяти травинок — плотнее при том же числе экземпляров.
function grassGeometry() {
  const base = new THREE.Color('#4f5a1e');
  const tip = new THREE.Color('#d8bd62');
  const blades = [];
  for (let b = 0; b < 5; b++) {
    const h = 0.55 + Math.random() * 0.35;
    const geo = new THREE.PlaneGeometry(0.06, h, 1, 3);
    geo.translate(0, h / 2, 0);
    const pos = geo.attributes.position;
    const lean = 0.1 + Math.random() * 0.25;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / h;
      pos.setX(i, pos.getX(i) * (1 - y * 0.92));
      pos.setZ(i, y * y * lean);
    }
    geo.rotateY((b / 5) * Math.PI * 2 + Math.random()).translate((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25);
    geo.computeVertexNormals();
    blades.push(paint(geo, (c, x, y) => c.lerpColors(base, tip, y / 0.9)));
  }
  return mergeGeometries(blades);
}

// Калифорнийский мак: тонкий стебель, чашечка из четырёх лепестков, тёмная серединка.
function poppyGeometry() {
  const stemH = 0.62;
  const stem = new THREE.CylinderGeometry(0.01, 0.016, stemH, 4, 1, true).translate(0, stemH / 2, 0);
  paint(stem, (c) => c.set('#6b7d2c'));
  const petals = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.CircleGeometry(0.14, 8).translate(0, 0.13, 0);
    const pos = p.attributes.position;
    for (let j = 0; j < pos.count; j++) {
      const y = pos.getY(j);
      pos.setZ(j, (y / 0.27) ** 2 * 0.06);
    }
    p.rotateX(-0.95).rotateY((i / 4) * Math.PI * 2 + 0.3).translate(0, stemH, 0);
    p.computeVertexNormals();
    paint(p, (c, x, y) => {
      const t = THREE.MathUtils.clamp((y - stemH) / 0.22, 0, 1);
      return c.lerpColors(new THREE.Color('#ff8f12'), new THREE.Color('#ffd24a'), t);
    });
    petals.push(p);
  }
  const center = new THREE.SphereGeometry(0.04, 6, 4).translate(0, stemH + 0.02, 0);
  paint(center, (c) => c.set('#b5560e'));
  return mergeGeometries([stem, ...petals, center]);
}

function petalGeometry(len, width, cup) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(width * 0.9, len * 0.12, width * 1.15, len * 0.72, 0, len);
  s.bezierCurveTo(-width * 1.15, len * 0.72, -width * 0.9, len * 0.12, 0, 0);
  const g = new THREE.ShapeGeometry(s, 20);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / len;
    const side = pos.getX(i) / width;
    pos.setZ(i, -cup * t * t + side * side * cup * 0.6);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function heroFlower() {
  const group = new THREE.Group();
  const gold = new THREE.MeshPhysicalMaterial({
    color: '#f7c04a',
    metalness: 0.5,
    roughness: 0.34,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    emissive: '#8a4a00',
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
    envMapIntensity: 1.1,
  });
  const inner = gold.clone();
  inner.color.set('#ffcf5c');
  inner.emissive.set('#7a3a00');

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.06, 0.55, -0.03),
    new THREE.Vector3(-0.04, 1.1, 0.04),
    new THREE.Vector3(0, 1.5, 0.12),
  ]);
  const stemMat = new THREE.MeshStandardMaterial({ color: '#7a8a34', roughness: 0.6, metalness: 0.3 });
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.032, 8), stemMat));

  // лист
  const leaf = new THREE.Mesh(petalGeometry(0.7, 0.16, 0.15), stemMat);
  leaf.position.set(0.05, 0.45, 0);
  leaf.rotation.set(0.2, 0.6, -0.9);
  group.add(leaf);

  const head = new THREE.Group();
  head.position.copy(curve.getPoint(1));
  head.rotation.x = 1.2;
  group.add(head);

  const layers = [
    { n: 6, len: 0.78, w: 0.33, cup: 0.16, from: 0.12, to: 1.45, off: 0, mat: gold },
    { n: 6, len: 0.62, w: 0.27, cup: 0.14, from: 0.07, to: 1.15, off: Math.PI / 6, mat: gold },
    { n: 5, len: 0.44, w: 0.2, cup: 0.12, from: 0.03, to: 0.8, off: 0.3, mat: inner },
  ];
  const petals = [];
  layers.forEach((L, li) => {
    const geo = petalGeometry(L.len, L.w, L.cup);
    for (let i = 0; i < L.n; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / L.n) * Math.PI * 2 + L.off;
      const petal = new THREE.Mesh(geo, L.mat);
      petal.position.y = 0.02 * li;
      pivot.add(petal);
      head.add(pivot);
      petals.push({ petal, from: L.from, to: L.to + (Math.random() - 0.5) * 0.08, delay: li * 0.12 });
    }
  });

  // серединка с тычинками
  const centerMat = new THREE.MeshStandardMaterial({ color: '#c0640e', roughness: 0.5, metalness: 0.4, emissive: '#3a1400' });
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 14), centerMat);
  center.scale.y = 0.6;
  head.add(center);
  const stamenMat = new THREE.MeshStandardMaterial({ color: '#ffd76a', emissive: '#ff9a00', emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
  const stamens = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 6, 4), stamenMat, 48);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 48; i++) {
    const a = i * 2.39996;
    const r = 0.04 + Math.sqrt(i / 48) * 0.1;
    m.makeTranslation(Math.cos(a) * r, 0.08 + Math.random() * 0.05, Math.sin(a) * r);
    stamens.setMatrixAt(i, m);
  }
  head.add(stamens);

  // тёплый отсвет вокруг цветка
  const glow = new THREE.PointLight('#ffb84a', 0, 4, 2);
  glow.position.set(0, 0.2, 0.3);
  head.add(glow);

  return {
    group,
    setBloom(b, time) {
      for (const p of petals) {
        const t = THREE.MathUtils.clamp((b - p.delay) / (1 - p.delay), 0, 1);
        const e = 1 - Math.pow(1 - t, 3);
        p.petal.rotation.x = THREE.MathUtils.lerp(p.from, p.to, e) + Math.sin(time * 1.4 + p.to * 9) * 0.025 * e;
      }
      head.rotation.y = time * 0.12;
      group.rotation.z = Math.sin(time * 0.8) * 0.02;
    },
    setNight(n) {
      glow.intensity = n * 3;
      gold.emissiveIntensity = 0.35 + n * 0.5;
    },
  };
}

function pollen(count, pixelRatio) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * 70, Math.random() * 6, (Math.random() - 0.5) * 70], i * 3);
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uPixelRatio: { value: pixelRatio },
  };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uNight, uPixelRatio;
        uniform vec3 uCam;
        attribute float aSeed;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.3 + aSeed * 20.0) * 1.5 + uTime * 0.35;
          p.z += cos(uTime * 0.25 + aSeed * 7.0) * 1.5;
          vec3 box = vec3(70.0, 6.0, 70.0);
          p.xz = mod(p.xz - uCam.xz + box.xz * 0.5, box.xz) - box.xz * 0.5 + uCam.xz;
          p.y = 0.3 + mod(p.y + sin(uTime * 0.5 + aSeed * 13.0) * 0.6 + uTime * 0.05, 6.0) + max(uCam.y - 5.0, 0.0) * 0.5;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float blink = mix(1.0, smoothstep(0.2, 1.0, sin(uTime * 1.7 + aSeed * 40.0) * 0.5 + 0.5), uNight);
          gl_PointSize = mix(2.4, 7.0, uNight) * (0.5 + aSeed) * uPixelRatio * (24.0 / max(-mv.z, 0.5));
          vAlpha = blink * smoothstep(55.0, 6.0, -mv.z) * smoothstep(0.2, 1.2, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          vec3 day = vec3(1.0, 0.85, 0.45);
          vec3 night = vec3(0.85, 1.0, 0.45);
          gl_FragColor = vec4(mix(day, night, uNight), a * a * vAlpha * mix(0.55, 1.0, uNight));
        }`,
    }),
  );
  points.frustumCulled = false;
  return { points, uniforms };
}

// Силуэт моста Золотые Ворота вдали — привет Сан-Франциско.
function goldenGate() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#c0442c', roughness: 0.7, envMapIntensity: 0.2 });
  const span = 150;
  for (const x of [-span / 2, span / 2]) {
    for (const dx of [-2.2, 2.2]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 62, 1.6), mat);
      leg.position.set(x + dx, 31, 0);
      g.add(leg);
    }
    for (const y of [26, 40, 52, 61]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 1.4), mat);
      beam.position.set(x, y, 0);
      g.add(beam);
    }
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span * 2.2, 1.8, 4), mat);
  deck.position.y = 20;
  g.add(deck);
  const cable = (x0, x1, sag) => {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = THREE.MathUtils.lerp(x0, x1, t);
      pts.push(new THREE.Vector3(x, THREE.MathUtils.lerp(61, 61, t) - Math.sin(t * Math.PI) * sag, 0));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.35, 4), mat);
    g.add(tube);
  };
  cable(-span / 2, span / 2, 39);
  g.position.set(20, 0, -330);
  return g;
}
