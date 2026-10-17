// パン窯 3D モデル
// 寸法はすべて ../data/oven.json から読む。ここに寸法の数値を書かない。
// 座標は m 単位、y が上、焚き口は +z を向く。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (id) => document.getElementById(id);

// ?embed=1 のときはナビゲータの iframe として動く（左の操作面を隠し、親と伝言をやり取りする）。
const EMBED = new URLSearchParams(location.search).get('embed') === '1';
if (EMBED) document.body.classList.add('embed');

let spec;
try {
  const res = await fetch('../data/oven.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`oven.json を読めません（${res.status}）`);
  spec = await res.json();
} catch (e) {
  $('err').style.display = 'grid';
  $('err').textContent = String(e.message || e);
  throw e;
}

const params = spec.params;
const P = (k) => {
  if (!(k in params)) throw new Error(`oven.json に ${k} がありません`);
  return params[k].v;
};

// 部品の一覧。色は図と凡例で共通に使う。
const PARTS = [
  { key: 'foundation', label: '基礎', color: 0x8e9093, mat: '鉄筋コンクリート（仮）' },
  { key: 'stand', label: '台', color: 0xa9abae, mat: 'コンクリートブロック（仮）' },
  { key: 'slab', label: '床版', color: 0xc2c4c6, mat: '鉄筋コンクリート（仮）' },
  { key: 'hearthIns', label: '炉床の断熱', color: 0xeee6cc, mat: '断熱板（材料は未定）' },
  { key: 'hearth', label: '炉床', color: 0xb85f3c, mat: '耐火レンガ（仮）' },
  { key: 'chamber', label: '窯壁', color: 0xc8734a, mat: '耐火レンガ（仮）' },
  { key: 'mass', label: '蓄熱層', color: 0x9b8a7c, mat: '耐火モルタルや耐火キャスタブル（未定）' },
  { key: 'insulation', label: '断熱', color: 0xe6dcb4, mat: 'セラミックファイバーや軽量断熱コンクリート（未定）' },
  { key: 'shell', label: '外殻', color: 0xd3cbbd, mat: '防水の外装（未定）' },
  { key: 'landing', label: '前室と焚き口', color: 0xd08a5f, mat: '耐火レンガ（仮）' },
  { key: 'door', label: '扉', color: 0x4a3b30, mat: '内側を耐火材、外側を断熱にした扉（仮）' },
  { key: 'chimney', label: '煙突', color: 0x5d6066, mat: '金属の煙突（未定）' },
  { key: 'roof', label: '屋根と柱', color: 0x8b6a4a, mat: '木の柱と屋根（未定）' },
  { key: 'wood', label: '薪', color: 0xa0703f, mat: '薪置き（目安）' },
  { key: 'person', label: '人（大きさの目安）', color: 0x6c8fb3, mat: '背丈の目安' },
  { key: 'frost', label: '凍結深度', color: 0x5aa0d8, mat: '凍結深度の面' },
];
const PART = Object.fromEntries(PARTS.map((p) => [p.key, p]));
const TYPE_LABEL = { dome: 'レンガ内張りのドーム', earth: '土窯', barrel: 'バレル（参考）' };

const state = {
  type: ['dome', 'earth', 'barrel'].includes(spec.type) ? spec.type : 'dome',
  section: false,
  seeThrough: false,
  fade: false,
  visible: Object.fromEntries(PARTS.map((p) => [p.key, true])),
  selected: null,
};

// ---------- 描画の準備

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, stencil: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.95;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f70, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(4.5, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 30 });
sun.shadow.bias = -0.0015;
sun.shadow.normalBias = 0.04;
scene.add(sun);

// 断面は x = 0 で切り、x < 0 の側を残す。
const cutPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const groundMat = new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, opacity: 1 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
let grid = null;

function applyTheme() {
  scene.background = new THREE.Color(css('--scene-bg'));
  groundMat.color = new THREE.Color(css('--ground'));
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  grid = new THREE.GridHelper(10, 20, css('--grid'), css('--grid'));
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.45;
  scene.add(grid);
}
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ---------- 形を作る道具

let ovenMaterials = [];

function material(key, extra = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: PART[key].color, roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
    shadowSide: THREE.BackSide, ...extra,
  });
  ovenMaterials.push(m);
  return m;
}

// ドームの各層に焚き口の穴をあける。形状を切らずに、焚き口の範囲の画素を捨てる。
function cutDoor(m, door) {
  m.userData.door = door;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDoor = { value: new THREE.Vector3(door.halfW, door.spring, door.bottom) };
    shader.vertexShader = 'varying vec3 vLocalPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vLocalPos = position;',
    );
    shader.fragmentShader = 'varying vec3 vLocalPos;\nuniform vec3 uDoor;\n' + shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
  {
    vec2 q = vec2(vLocalPos.x, vLocalPos.y - uDoor.y);
    bool inW = abs(vLocalPos.x) < uDoor.x;
    bool inH = vLocalPos.y > uDoor.z && (vLocalPos.y < uDoor.y || length(q) < uDoor.x);
    if (vLocalPos.z > 0.0 && inW && inH) discard;
  }`,
    );
  };
  m.customProgramCacheKey = () => `door:${door.halfW}:${door.spring}:${door.bottom}`;
  return m;
}

function mesh(geom, mat, info) {
  const o = new THREE.Mesh(geom, mat);
  o.castShadow = true;
  o.receiveShadow = true;
  o.userData.info = info;
  return o;
}

function box(w, h, d, x, y, z, mat, info) {
  const o = mesh(new THREE.BoxGeometry(w, h, d), mat, info);
  o.position.set(x, y, z);
  return o;
}

// ドームの殻。内面は半径 (R+a, H+a)、外面は (R+b, H+b) の回転楕円体。下に高さ skirt の立ち上がりを付ける。
function domeShell(R, H, a, b, skirt) {
  const n = 40;
  const pts = [new THREE.Vector2(R + b, -skirt)];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI / 2;
    pts.push(new THREE.Vector2(Math.max((R + b) * Math.cos(t), 1e-4), (H + b) * Math.sin(t)));
  }
  for (let i = n; i >= 0; i--) {
    const t = (i / n) * Math.PI / 2;
    pts.push(new THREE.Vector2(Math.max((R + a) * Math.cos(t), 1e-4), (H + a) * Math.sin(t)));
  }
  pts.push(new THREE.Vector2(R + a, -skirt), new THREE.Vector2(R + b, -skirt));
  return new THREE.LatheGeometry(pts, 96);
}

// バレルの断面。側壁の高さ hs の上に半径 r の半円。offset だけ外へ広げた形。
function archOutline(path, r, hs, o) {
  path.moveTo(-(r + o), 0);
  path.lineTo(-(r + o), hs);
  path.absarc(0, hs, r + o, Math.PI, 0, true);
  path.lineTo(r + o, 0);
}

function archRing(r, hs, a, b) {
  const s = new THREE.Shape();
  archOutline(s, r, hs, b);
  s.lineTo(r + a, 0);
  s.lineTo(r + a, hs);
  s.absarc(0, hs, r + a, 0, Math.PI, false);
  s.lineTo(-(r + a), 0);
  s.closePath();
  return s;
}

function archSolid(r, hs, o) {
  const s = new THREE.Shape();
  archOutline(s, r, hs, o);
  s.closePath();
  return s;
}

// 下辺に焚き口の切り欠きを持つ形。outline は左下から時計回りに右下まで描く関数。
function withDoorNotch(outline, door) {
  const s = new THREE.Shape();
  outline(s);
  s.lineTo(door.halfW, 0);
  s.lineTo(door.halfW, door.spring);
  s.absarc(0, door.spring, door.halfW, 0, Math.PI, false);
  s.lineTo(-door.halfW, 0);
  s.closePath();
  return s;
}

function extrude(shape, depth) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 });
}

// 層の境で面を少し離す量
const GAP = 0.002;

const f2 = (v) => (v == null ? '未定' : Number(v).toFixed(2));
const f3 = (v) => (v == null ? '未定' : Number(v).toFixed(3));

// ---------- 窯を組む

// ---------- 断面の切り口を埋める
// 中身の詰まった部品は、切った面に部品の色の蓋を描く（stencil で切り口の内側だけを塗る）。
// 煙突は管なので蓋を付けない。人と凍結深度の面も付けない。
const CAP_SKIP = new Set(['chimney', 'frost', 'person']);

function addCaps(b) {
  const objs = [];
  const mats = [];
  const capGeom = new THREE.PlaneGeometry(12, 12);
  let order = 1;
  for (const p of PARTS) {
    if (CAP_SKIP.has(p.key)) continue;
    const g = b.groups[p.key];
    const meshes = [];
    g.traverse((o) => {
      if (o.isMesh && !o.material.transparent && !o.userData.passThrough) meshes.push(o);
    });
    for (const m of meshes) {
      const common = {
        colorWrite: false, depthWrite: false, depthTest: false,
        stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, clippingPlanes: [cutPlane],
      };
      const back = new THREE.MeshBasicMaterial({
        ...common, side: THREE.BackSide,
        stencilFail: THREE.IncrementWrapStencilOp, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.IncrementWrapStencilOp,
      });
      const front = new THREE.MeshBasicMaterial({
        ...common, side: THREE.FrontSide,
        stencilFail: THREE.DecrementWrapStencilOp, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.DecrementWrapStencilOp,
      });
      if (m.material.userData.door) { cutDoor(back, m.material.userData.door); cutDoor(front, m.material.userData.door); }
      for (const mat of [back, front]) {
        const h = new THREE.Mesh(m.geometry, mat);
        h.renderOrder = order;
        h.userData.passThrough = true;
        h.raycast = () => {};
        m.add(h);
        objs.push(h);
        mats.push(mat);
      }
      const capMat = new THREE.MeshStandardMaterial({
        color: m.material.color.clone().multiplyScalar(0.82), roughness: 0.95, metalness: 0,
        stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
      });
      const cap = new THREE.Mesh(capGeom, capMat);
      cap.rotation.y = Math.PI / 2;
      cap.position.set(0, 1.5, b.d.centerZ);
      cap.renderOrder = order + 0.5;
      cap.onAfterRender = (r) => r.clearStencil();
      cap.userData.passThrough = true;
      cap.raycast = () => {};
      g.add(cap);
      objs.push(cap);
      mats.push(capMat);
      order += 1;
    }
  }
  return { objs, mats };
}

function build(type) {
  ovenMaterials = [];
  const root = new THREE.Group();
  const groups = Object.fromEntries(PARTS.map((p) => {
    const g = new THREE.Group();
    g.name = p.key;
    root.add(g);
    return [p.key, g];
  }));
  const info = (key, dims, mat) => ({ key, name: PART[key].label, mat: mat || PART[key].mat, dims });

  // 高さの基準
  const yFt = P('foundation.top');
  const yFb = yFt - P('foundation.thickness');
  const yStandTop = yFt + P('stand.height');
  const ySlabTop = yStandTop + P('hearth.slab');
  const yInsTop = ySlabTop + P('hearth.insulation');
  const th = P('hearth.firebrick');
  const yFloor = yInsTop + th;

  const t = P('wall.firebrick');
  const ins = P('insulation.thickness');
  const sh = P('shell.thickness');
  const lw = P('landing.wall');
  const landingDepth = P('landing.depth');

  const d = { yFloor };
  let Ro, zBack, zDoorIn, door, outerTop, innerHeight;

  if (type === 'dome' || type === 'earth') {
    // 土窯は窯壁を粘土と砂で作り、蓄熱層を持たない。断熱はおが屑と粘土。
    const earth = type === 'earth';
    const R = P('dome.inner_diameter') / 2;
    const H = P('dome.inner_height');
    const wt = earth ? P('earth.wall') : t;
    const m = earth ? 0 : P('dome.mass');
    const it = earth ? P('earth.insulation') : ins;
    innerHeight = H;
    const offs = [0, wt, wt + m, wt + m + it, wt + m + it + sh];
    Ro = R + offs[4];
    zBack = -Ro;
    outerTop = yFloor + H + offs[4];

    const hd = P('door.height_ratio') * H;
    const halfW = P('door.width') / 2;
    door = { halfW, height: hd, spring: Math.max(0, hd - halfW), bottom: -th - 0.01 };

    // 焚き口の縁のうち、内面で最も手前に来ない点の z。前室はここから始める。
    zDoorIn = R;
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI;
      const pts = [[halfW, door.spring * (i / 32)], [halfW * Math.cos(a), door.spring + halfW * Math.sin(a)]];
      for (const [x, y] of pts) {
        const z2 = R * R - x * x - (R * R / (H * H)) * y * y;
        zDoorIn = Math.min(zDoorIn, Math.sqrt(Math.max(z2, 0)));
      }
    }

    // 炉床はドームの内側に敷き、ドームの壁は炉床の断熱の上に立てる。
    // 積んだ部材は、断面で開いた底面が下の部材の上面と重ならないよう、底を GAP だけ浮かせる。
    const hearth = mesh(new THREE.CylinderGeometry(R, R, th - GAP, 96), material('hearth'),
      info('hearth', `直径 ${f2(2 * R)} m、厚さ ${f3(th)} m、面積 ${f2(Math.PI * R * R)} m²`));
    hearth.position.set(0, yInsTop + GAP + (th - GAP) / 2, 0);
    groups.hearth.add(hearth);

    const layers = [
      ['chamber', 0, 1, `内径 ${f2(2 * R)} m、内高 ${f2(H)} m、厚さ ${f3(wt)} m`,
        earth ? { mat: '粘土と砂（仮）', color: 0xa47d5c } : {}],
      ['mass', 1, 2, `厚さ ${f3(m)} m`, { mat: '粘土と砂（仮）' }],
      ['insulation', 2, 3, `厚さ ${f3(it)} m`,
        earth ? { mat: 'おが屑と粘土（仮）' } : { mat: 'パーライトとセメント（仮）' }],
      ['shell', 3, 4, `厚さ ${f3(sh)} m、外径 ${f2(2 * Ro)} m`, {}],
    ];
    for (const [key, i0, i1, dims, o] of layers) {
      if (offs[i1] - offs[i0] <= 1e-6) continue;
      const mt = cutDoor(material(key, o.color ? { color: o.color } : {}), door);
      // 隣の層と面が重なってちらつかないよう、外側の層が続くときは外面を 2 mm 下げる。
      const b = i1 < 4 ? offs[i1] - GAP : offs[i1];
      const g = mesh(domeShell(R, H, offs[i0], b, th), mt, info(key, dims, o.mat));
      g.position.y = yFloor;
      groups[key].add(g);
    }
    d.hearthArea = Math.PI * R * R;
    d.hearthText = `直径 ${f2(2 * R)} m の円`;
  } else {
    const W = P('barrel.inner_width');
    const D = P('barrel.inner_depth');
    const hs = P('barrel.wall_height');
    const m = P('barrel.mass');
    const r = W / 2;
    innerHeight = hs + r;
    const offs = [0, t, t + m, t + m + ins, t + m + ins + sh];
    Ro = r + offs[4];
    zBack = -D / 2 - offs[4];
    outerTop = yFloor + hs + r + offs[4];

    const hd = P('door.height_ratio') * innerHeight;
    const halfW = P('door.width') / 2;
    door = { halfW, height: hd, spring: Math.max(0, hd - halfW), bottom: 0 };
    // 前の壁に焚き口の切り欠きがあるので、前室は前の壁の外面から始める。
    zDoorIn = D / 2 + t;

    const hearth = box(W + 2 * t, th - GAP, D + 2 * t, 0, yInsTop + GAP + (th - GAP) / 2, 0, material('hearth'),
      info('hearth', `${f2(W)} m × ${f2(D)} m（内法）、厚さ ${f3(th)} m、面積 ${f2(W * D)} m²`));
    groups.hearth.add(hearth);

    // 窯壁: 円筒部、奥の壁、焚き口のある前の壁
    const cm = material('chamber');
    const cInfo = info('chamber', `内幅 ${f2(W)} m、奥行 ${f2(D)} m、内高 ${f2(innerHeight)} m、厚さ ${f3(t)} m`);
    const vault = mesh(extrude(archRing(r, hs, 0, t - GAP), D), cm, cInfo);
    vault.position.set(0, yFloor, -D / 2);
    const back = mesh(extrude(archSolid(r, hs, t), t), cm, cInfo);
    back.position.set(0, yFloor, -D / 2 - t);
    const front = mesh(extrude(withDoorNotch((s) => archOutline(s, r, hs, t), door), t), cm, cInfo);
    front.position.set(0, yFloor, D / 2);
    groups.chamber.add(vault, back, front);

    // 外側の層: 円筒部を前の壁の面まで延ばし、奥にふたをする。
    const layers = [
      ['mass', 1, 2, `厚さ ${f3(m)} m`],
      ['insulation', 2, 3, `厚さ ${f3(ins)} m`],
      ['shell', 3, 4, `厚さ ${f3(sh)} m、外幅 ${f2(2 * Ro)} m`],
    ];
    for (const [key, i0, i1, dims] of layers) {
      const a = offs[i0];
      const b = offs[i1];
      if (b - a <= 1e-6) continue;
      const lm = material(key);
      const li = info(key, dims);
      const ring = mesh(extrude(archRing(r, hs, a, i1 < 4 ? b - GAP : b), D + t + a), lm, li);
      ring.position.set(0, yFloor, -D / 2 - a);
      const cap = mesh(extrude(archSolid(r, hs, b), b - a), lm, li);
      cap.position.set(0, yFloor, -D / 2 - b);
      groups[key].add(ring, cap);
    }
    // 外側の層の下を炉床の断熱の面まで下ろす帯。炉床の周りを左右と奥で囲む。
    const skMat = material('shell');
    const skInfo = info('shell', `外幅 ${f2(2 * Ro)} m`);
    const hx = W / 2 + t;
    const zEnd = D / 2 + t;
    const sideW = Ro - hx;
    const yC = yInsTop + th / 2;
    if (sideW > 1e-6) {
      for (const sgn of [-1, 1]) {
        groups.shell.add(box(sideW, th, zEnd - zBack, sgn * (hx + sideW / 2), yC, (zBack + zEnd) / 2, skMat, skInfo));
      }
    }
    const backD = -D / 2 - t - zBack;
    if (backD > 1e-6) groups.shell.add(box(2 * hx, th, backD, 0, yC, zBack + backD / 2, skMat, skInfo));
    d.hearthArea = W * D;
    d.hearthText = `${f2(W)} m × ${f2(D)} m の長方形`;
  }

  // 前室と焚き口。外の枠に焚き口の形の穴をあけて手前へ延ばす。
  const zFront = (type === 'barrel' ? P('barrel.inner_depth') / 2 + t : Ro) + landingDepth;
  const tunW = 2 * (door.halfW + lw);
  const tunH = door.height + lw;
  const tunLen = zFront - zDoorIn;
  const lmat = material('landing');
  const lInfo = info('landing', `焚き口 幅 ${f2(2 * door.halfW)} m、高さ ${f2(door.height)} m、前室の奥行 ${f2(landingDepth)} m`);
  const tunnel = mesh(extrude(withDoorNotch((s) => {
    s.moveTo(-tunW / 2, 0);
    s.lineTo(-tunW / 2, tunH);
    s.lineTo(tunW / 2, tunH);
    s.lineTo(tunW / 2, 0);
  }, door), tunLen), lmat, lInfo);
  tunnel.position.set(0, yFloor, zDoorIn);
  // 前室の床は炉床と重なる所でちらつかないよう、2 mm 下げる。
  const landingFloor = box(tunW, th, tunLen, 0, yInsTop + th / 2 - 0.002, zDoorIn + tunLen / 2, lmat, lInfo);
  groups.landing.add(tunnel, landingFloor);

  // 扉は焼き室と前室の境に置き、煙突は扉の外に来るようにする。前室の内面と重ならないよう 2 mm 小さくする。
  const dt = P('door.thickness');
  const dIn = { halfW: door.halfW - GAP, spring: door.spring, height: door.height };
  const doorShape = new THREE.Shape();
  doorShape.moveTo(-dIn.halfW, GAP);
  doorShape.lineTo(-dIn.halfW, dIn.spring);
  doorShape.absarc(0, dIn.spring, dIn.halfW, Math.PI, 0, true);
  doorShape.lineTo(dIn.halfW, GAP);
  doorShape.closePath();
  const zDoorFace = type === 'barrel' ? P('barrel.inner_depth') / 2 + t : Ro;
  const doorMesh = mesh(extrude(doorShape, dt), material('door'),
    info('door', `幅 ${f2(2 * door.halfW)} m、高さ ${f2(door.height)} m、厚さ ${f3(dt)} m`));
  doorMesh.position.set(0, yFloor, zDoorFace - dt);
  groups.door.add(doorMesh);

  // 煙突は前室の上に立てる。
  const rc = P('chimney.diameter') / 2;
  const yChimBase = yFloor + tunH;
  const yChimTop = P('chimney.top');
  const chim = mesh(new THREE.CylinderGeometry(rc + 0.004, rc + 0.004, yChimTop - yChimBase, 32, 1, true),
    material('chimney', { metalness: 0.4, roughness: 0.5 }),
    info('chimney', `内径 ${f2(2 * rc)} m、頂部の高さ ${f2(yChimTop)} m`));
  chim.position.set(0, (yChimBase + yChimTop) / 2, zFront - landingDepth / 2);
  groups.chimney.add(chim);

  // 炉床の断熱、床版、台、基礎
  const fx = Ro;
  const fz0 = zBack;
  const fz1 = zFront;
  const hi = P('hearth.insulation');
  const insBox = box(2 * fx, hi - GAP, fz1 - fz0, 0, ySlabTop + GAP + (hi - GAP) / 2, (fz0 + fz1) / 2,
    material('hearthIns'), info('hearthIns', `厚さ ${f3(P('hearth.insulation'))} m`));
  groups.hearthIns.add(insBox);

  const mg = P('stand.margin');
  const sw = 2 * (fx + mg);
  const sd = fz1 - fz0 + 2 * mg;
  const sz = (fz0 + fz1) / 2;
  const hs2 = P('hearth.slab');
  groups.slab.add(box(sw, hs2 - GAP, sd, 0, yStandTop + GAP + (hs2 - GAP) / 2, sz,
    material('slab'), info('slab', `${f2(sw)} m × ${f2(sd)} m、厚さ ${f3(P('hearth.slab'))} m`)));

  const wt = P('stand.wall');
  const sh2 = P('stand.height');
  const stMat = material('stand');
  const stInfo = info('stand', `${f2(sw)} m × ${f2(sd)} m、高さ ${f2(sh2)} m、壁の厚さ ${f3(wt)} m、前は薪置きに開ける`);
  groups.stand.add(
    box(wt, sh2, sd, -sw / 2 + wt / 2, yFt + sh2 / 2, sz, stMat, stInfo),
    box(wt, sh2, sd, sw / 2 - wt / 2, yFt + sh2 / 2, sz, stMat, stInfo),
    box(sw - 2 * wt, sh2, wt, 0, yFt + sh2 / 2, sz - sd / 2 + wt / 2, stMat, stInfo),
  );

  const fm = P('foundation.margin');
  const fw = sw + 2 * fm;
  const fd = sd + 2 * fm;
  groups.foundation.add(box(fw, yFt - yFb, fd, 0, (yFt + yFb) / 2, sz,
    material('foundation'), info('foundation', `${f2(fw)} m × ${f2(fd)} m、厚さ ${f3(yFt - yFb)} m、天端は地面から ${f2(yFt)} m`)));

  const frost = P('frost.depth');
  if (frost != null) {
    const fp = mesh(new THREE.PlaneGeometry(fw + 1.5, fd + 1.5),
      material('frost', { transparent: true, opacity: 0.35, depthWrite: false }),
      info('frost', `地面から ${f2(frost)} m`));
    fp.rotation.x = -Math.PI / 2;
    fp.position.set(0, -frost, sz);
    fp.castShadow = false;
    groups.frost.add(fp);
  }

  // 薪置き
  const wm = material('wood');
  const logR = 0.05;
  const innerW = sw - 2 * wt;
  const nPer = Math.max(1, Math.floor((innerW - 0.04) / (2 * logR)));
  const logLen = Math.min(0.45, sd - wt - 0.1);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < nPer - (row % 2); i++) {
      const lg = mesh(new THREE.CylinderGeometry(logR, logR, logLen, 10), wm, info('wood', `長さ ${f2(logLen)} m の薪`));
      lg.rotation.x = Math.PI / 2;
      const x0 = -innerW / 2 + 0.02 + logR + (row % 2) * logR;
      lg.position.set(x0 + i * 2 * logR, yFt + logR + row * logR * 1.75, sz + sd / 2 - logLen / 2 - 0.05);
      groups.wood.add(lg);
    }
  }

  // 屋根と柱
  const po = P('roof.post_offset');
  const px = fx + mg + po;
  const pz0 = fz0 - mg - po;
  const pz1 = fz1 + mg + po;
  const eave = P('roof.eave');
  const ridge = P('roof.ridge');
  const oh = P('roof.overhang');
  const rm = material('roof');
  const rInfo = info('roof', `柱の間 ${f2(2 * px)} m × ${f2(pz1 - pz0)} m、軒 ${f2(eave)} m、棟 ${f2(ridge)} m`);
  const post = 0.105;
  for (const x of [-px, px]) {
    for (const z of [pz0, pz1]) groups.roof.add(box(post, eave, post, x, eave / 2, z, rm, rInfo));
    groups.roof.add(box(post, post, pz1 - pz0 + post, x, eave - post / 2, (pz0 + pz1) / 2, rm, rInfo));
  }
  const run = px + oh;
  const rise = ridge - eave;
  const slope = Math.hypot(run, rise);
  const ang = Math.atan2(rise, run);
  const roofLen = pz1 - pz0 + 2 * oh;
  const sheet = material('roof', { color: 0x5a6470, transparent: true, opacity: 0.55, depthWrite: false });
  for (const sgn of [-1, 1]) {
    const p = box(slope, 0.03, roofLen, sgn * run / 2, (eave + ridge) / 2, (pz0 + pz1) / 2, sheet, rInfo);
    p.rotation.z = -sgn * ang;
    p.castShadow = false;
    p.userData.passThrough = true;
    groups.roof.add(p);
  }

  // 人
  const hp = P('person.height');
  const pm = material('person');
  const pInfo = info('person', `背丈 ${f2(hp)} m`);
  const body = mesh(new THREE.CapsuleGeometry(0.17, hp * 0.85 - 0.34, 6, 16), pm, pInfo);
  body.position.set(-(sw / 2 + 0.7), (hp * 0.85) / 2, fz1 + 0.6);
  const head = mesh(new THREE.SphereGeometry(0.11, 20, 14), pm, pInfo);
  head.position.set(body.position.x, hp - 0.11, body.position.z);
  groups.person.add(body, head);

  Object.assign(d, {
    type, innerHeight, door, outerTop, zFront, zBack,
    outerW: 2 * Ro, outerD: zFront - zBack, standW: sw, standD: sd,
    roofW: 2 * px, roofD: pz1 - pz0, centerZ: sz,
  });
  return { root, groups, d };
}

// ---------- 組み替えと表示

let current = null;

function disposeTree(o) {
  o.traverse((c) => { if (c.isMesh) c.geometry.dispose(); });
}

function rebuild() {
  if (current) {
    scene.remove(current.root);
    disposeTree(current.root);
    current.mats.forEach((m) => m.dispose());
    current.caps.mats.forEach((m) => m.dispose());
  }
  const b = build(state.type);
  const caps = addCaps(b);
  current = { ...b, mats: ovenMaterials, caps };
  scene.add(b.root);
  applyVisibility();
  applySection();
  renderDerived(b.d);
  renderParams();
  for (const btn of document.querySelectorAll('#type button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.type === state.type));
  }
  state.selected = null;
  renderInfo(null);
  applyFocus(false);
}

// ---------- 親（ナビゲータ）から指された部品を光らせる

let focusKeys = [];
const FOCUS_COLOR = 0xb86a00;
const FOCUS_INTENSITY = 0.55;

// on: 光らせる、dim: 光らせる部品があるときのほかの部品（中に隠れた部品が見えるよう薄くする）
function setGlow(m, on, dim) {
  if (!m || !m.emissive) return;
  if (!m.userData.emBase) {
    m.userData.emBase = {
      color: m.emissive.getHex(), intensity: m.emissiveIntensity,
      transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite,
    };
  }
  const b = m.userData.emBase;
  m.emissive.setHex(on ? FOCUS_COLOR : b.color);
  m.emissiveIntensity = on ? FOCUS_INTENSITY : b.intensity;
  const fade = state.fade && dim && !on;
  m.transparent = fade ? true : b.transparent;
  m.opacity = fade ? Math.min(b.opacity, 0.15) : b.opacity;
  m.depthWrite = fade ? false : b.depthWrite;
  m.needsUpdate = true;
}

function applyFocus(recenter) {
  if (!current) return;
  const keys = focusKeys.filter((k) => current.groups[k]);
  const box = new THREE.Box3();
  for (const p of PARTS) {
    const on = keys.includes(p.key);
    current.groups[p.key].traverse((o) => {
      if (!o.isMesh) return;
      setGlow(o.material, on, keys.length > 0);
    });
    if (on) box.expandByObject(current.groups[p.key]);
  }
  if (recenter && keys.length && !box.isEmpty()) {
    const c = box.getCenter(new THREE.Vector3());
    const delta = c.sub(controls.target);
    camera.position.add(delta);
    controls.target.add(delta);
    controls.update();
  }
}

window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return;
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.type === 'v3d:focus') {
    focusKeys = Array.isArray(m.parts) ? m.parts.filter((k) => typeof k === 'string') : [];
    applyFocus(!state.section);
  } else if (m.type === 'v3d:section') {
    state.section = !!m.on;
    $('section').checked = state.section;
    applySection();
    setView(state.section ? 'cut' : 'iso');
  } else if (m.type === 'v3d:view') {
    if (['iso', 'front', 'side', 'top', 'cut'].includes(m.view)) setView(m.view);
  } else if (m.type === 'v3d:fade') {
    state.fade = !!m.on;
    applyFocus(false);
  }
});

function applyVisibility() {
  for (const p of PARTS) current.groups[p.key].visible = state.visible[p.key];
}

function applySection() {
  for (const m of current.mats) {
    m.clippingPlanes = state.section ? [cutPlane] : [];
    m.needsUpdate = true;
  }
  for (const o of current.caps.objs) o.visible = state.section;
}

function applySeeThrough() {
  groundMat.opacity = state.seeThrough ? 0.3 : 1;
  groundMat.depthWrite = !state.seeThrough;
  groundMat.needsUpdate = true;
}

// ---------- 見る向き

function setView(name) {
  const d = current.d;
  const cy = (d.yFloor + d.outerTop) / 2 * 0.8;
  const target = new THREE.Vector3(0, cy, d.centerZ);
  const span = Math.max(d.roofW, d.roofD, 3);
  const pos = {
    iso: [span * 1.45, span * 1.15, d.centerZ + span * 1.9],
    front: [0, cy + 0.2, d.centerZ + span * 2.3],
    side: [span * 2.3, cy + 0.2, d.centerZ],
    top: [0.001, span * 2.8, d.centerZ + 0.001],
    cut: [d.outerD * 2.1, (d.yFloor + d.outerTop) / 2 + 0.15, d.centerZ + 0.15],
  }[name];
  // 断面は窯に寄って見る。
  if (name === 'cut') target.set(0, (d.yFloor + d.outerTop) / 2, d.centerZ + 0.15);
  camera.position.set(...pos);
  controls.target.copy(target);
  controls.update();
}

// ---------- 画面の表

function chip(status) {
  return `<span class="chip ${status}">${status}</span>`;
}

function renderParams() {
  const rows = Object.entries(params).map(([, p]) => {
    const v = p.v == null ? '未定' : `${p.v}${p.unit ? ' ' + p.unit : ''}`;
    return `<tr><td>${p.label}<br><span class="note">${p.basis}</span></td><td class="num">${v}</td><td>${chip(p.status)}</td></tr>`;
  });
  $('params').innerHTML = rows.join('');
}

function renderDerived(d) {
  const rows = [
    ['型式', TYPE_LABEL[d.type]],
    ['炉床の面の高さ', `${f2(d.yFloor)} m`],
    ['炉床の形', d.hearthText],
    ['炉床の面積', `${f2(d.hearthArea)} m²`],
    ['窯の内高', `${f2(d.innerHeight)} m`],
    ['焚き口', `幅 ${f2(2 * d.door.halfW)} m、高さ ${f2(d.door.height)} m`],
    ['窯の外形', `幅 ${f2(d.outerW)} m、奥行 ${f2(d.outerD)} m、頂部 ${f2(d.outerTop)} m`],
    ['台の大きさ', `${f2(d.standW)} m × ${f2(d.standD)} m`],
    ['屋根の柱の間', `${f2(d.roofW)} m × ${f2(d.roofD)} m`],
  ];
  $('derived').innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td><td>${chip('算出')}</td></tr>`).join('');
}

function renderInfo(inf) {
  if (!inf) {
    $('info').innerHTML = '<span class="muted">図の部品をクリックすると、材料と寸法が出ます。</span>';
    return;
  }
  $('info').innerHTML = `<div class="name">${inf.name}</div><div>${inf.mat}</div><div class="muted">${inf.dims}</div>`;
}

function renderParts() {
  $('parts').innerHTML = PARTS.map((p) => {
    const hex = '#' + p.color.toString(16).padStart(6, '0');
    return `<label class="part"><input type="checkbox" data-part="${p.key}" checked><span class="sw" style="background:${hex}"></span>${p.label}</label>`;
  }).join('');
  $('parts').addEventListener('change', (e) => {
    const k = e.target.dataset.part;
    if (!k) return;
    state.visible[k] = e.target.checked;
    applyVisibility();
  });
}

// ---------- 部品を指す

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pick(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const targets = [];
  current.root.traverseVisible((o) => { if (o.isMesh) targets.push(o); });
  const hits = ray.intersectObjects(targets, false)
    .filter((h) => !(state.section && h.point.x > 1e-4))
    .filter((h) => !h.object.userData.passThrough);
  return hits.length ? hits[0] : null;
}

canvas.addEventListener('pointermove', (ev) => {
  const h = pick(ev);
  const tip = $('tip');
  if (!h) { tip.style.display = 'none'; return; }
  const r = canvas.getBoundingClientRect();
  tip.textContent = h.object.userData.info.name;
  tip.style.left = `${ev.clientX - r.left + 12}px`;
  tip.style.top = `${ev.clientY - r.top + 12}px`;
  tip.style.display = 'block';
});
canvas.addEventListener('pointerleave', () => { $('tip').style.display = 'none'; });

let downAt = null;
canvas.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
canvas.addEventListener('pointerup', (ev) => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 4) return;
  const h = pick(ev);
  renderInfo(h ? h.object.userData.info : null);
  if (EMBED && window.parent !== window) {
    window.parent.postMessage({ type: 'v3d:pick', part: h ? h.object.userData.info.key : null }, location.origin);
  }
});

// ---------- 操作

$('rev').textContent = `改訂 ${spec.revision}、${spec.date}。${spec.note}`;
renderParts();

$('type').addEventListener('click', (e) => {
  const tp = e.target.dataset.type;
  if (!tp || tp === state.type) return;
  state.type = tp;
  rebuild();
});
$('views').addEventListener('click', (e) => { if (e.target.dataset.view) setView(e.target.dataset.view); });
$('section').addEventListener('change', (e) => {
  state.section = e.target.checked;
  applySection();
  if (state.section) setView('cut');
});
$('seeThrough').addEventListener('change', (e) => { state.seeThrough = e.target.checked; applySeeThrough(); });

// URL の ?type=barrel&section=1&view=side で初期状態を指定できる。
const q = new URLSearchParams(location.search);
if (q.get('type') in TYPE_LABEL) state.type = q.get('type');
if (q.get('section') === '1') { state.section = true; $('section').checked = true; }

rebuild();
setView(q.get('view') || (state.section ? 'cut' : 'iso'));

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(r.height, 1);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);
resize();
if (EMBED && window.parent !== window) window.parent.postMessage({ type: 'v3d:ready' }, location.origin);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
