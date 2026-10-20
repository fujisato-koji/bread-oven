// パン窯 3D モデル
// 寸法は ../data/oven.json の鍵から読む。
// oven.json に鍵の無い小さな寸法は「鍵の無い寸法」にまとめ、構造様式と構造設計の表の値を図のためだけに使う。
// 座標は m 単位で、y を上、焚き口の向きを +z にとる。
// 原点はドームの中心の真下の地面に置く。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

// 部品の一覧。id と並びは docs/data/model.yaml の parts と同じにする。色は図と凡例で共通に使う。
const PARTS = [
  { key: 'foundation', label: '据え台', color: 0xa9abae, mat: 'コンクリートピンコロと締めた砕石（3 か所）' },
  { key: 'anchor', label: '風の留め', color: 0x8a6d3b, mat: '各脚から外へ 60°で張る鎖とターンバックル、M16 の全ねじ、400 角の平板 2 枚（3 か所）' },
  { key: 'stand', label: '台', color: 0x6f757c, mat: '50 角（溶接）と 40 角（ボルト）の 3 本脚、後ろの脚 ±0.90 m、交点に当て板' },
  { key: 'slab', label: '天板', color: 0x4f555c, mat: '鋼板 2.3 mm（2 枚、継ぎ目は z = 0）' },
  { key: 'hearthIns', label: '炉床の下の断熱', color: 0xeee6cc, mat: 'セメントとパーライト 1:5（板 75 mm、縁の帯 65 mm）' },
  { key: 'hearth', label: '炉床', color: 0xb85f3c, mat: '耐火粘土レンガ 65 mm（切らない四角、18 個）' },
  { key: 'chamber', label: 'ドーム', color: 0xcfc6b5, mat: '耐火キャスタブル CA-13T 40 mm（4 個）' },
  { key: 'seam', label: '継ぎ目', color: 0xd2462a, mat: '段付き、ペーパー 1 mm、外の薄塗り、ドームの足の下の縄' },
  { key: 'band', label: '足元の帯', color: 0x3d4247, mat: '平鋼 3 × 40' },
  { key: 'insulation', label: '毛布', color: 0xf3f0e8, mat: '生体溶解性の毛布 25 mm を 3 層' },
  { key: 'shell', label: '殻', color: 0xe8ebee, mat: 'L25 の枠、塗った鋼板、塗った波板（45°）' },
  { key: 'vent', label: '頂部のベント', color: 0xb9bec2, mat: 'ステンレスのフード付きガラリ 100 mm' },
  { key: 'landing', label: '前室と焚き口', color: 0x45484d, mat: '縞鋼板 3.2 mm の箱、敷居と床と天井にレンガ、焚き口の前掛け' },
  { key: 'door', label: '扉', color: 0x4a3b30, mat: '焚き口の差し込みの扉と、前室の口の引き戸（閉、1/4、1/2、全開）' },
  { key: 'damper', label: 'ダンパー', color: 0x2f3236, mat: '差し板' },
  { key: 'chimney', label: '煙突', color: 0x5d6066, mat: 'ステンレス φ120、H 笠、火の粉止め' },
  { key: 'wood', label: '薪置き', color: 0xa0703f, mat: '薪置き（目安。炉床の真下と前室の下には置かない。隅に置く決まりは仮）' },
  { key: 'person', label: '人（大きさの目安）', color: 0x6c8fb3, mat: '背丈の目安' },
  { key: 'frost', label: '凍結深度', color: 0x5aa0d8, mat: '凍結深度の面' },
];
const PART = Object.fromEntries(PARTS.map((p) => [p.key, p]));
const TYPE_LABEL = { cast: '分割のキャスタブルのドーム（第一案）', brick: 'レンガのドーム（前の第一案、参考）' };
const TYPE_BUTTON = { cast: 'キャスタブルのドーム', brick: 'レンガのドーム（参考）' };

// 扉の開け幅。open は引き戸を開ける割合で、引き戸の板の幅に掛けて横へ滑らせる。
const DOOR_STATES = {
  plug: { label: '差し込みの扉あり（焼くとき）', plug: true, open: 0 },
  closed: { label: '差し込みの扉を外し、引き戸を閉', plug: false, open: 0 },
  q1: { label: '差し込みの扉を外し、引き戸を 1/4', plug: false, open: 0.25 },
  q2: { label: '差し込みの扉を外し、引き戸を 1/2', plug: false, open: 0.5 },
  open: { label: '差し込みの扉を外し、引き戸を全開', plug: false, open: 1 },
};

const state = {
  type: Object.keys(TYPE_LABEL).includes(spec.type) ? spec.type : 'cast',
  section: false,
  seeThrough: false,
  fade: false,
  shellFade: false,
  apron: false,
  door: 'plug',
  visible: Object.fromEntries(PARTS.map((p) => [p.key, true])),
  selected: null,
};

// ---------- 鍵の無い寸法
// oven.json に鍵の無い小さな寸法で、構造様式と構造設計の表の値を、図を描くためだけに使う。
// 表の値を変えたら、ここも合わせる。
const LAND_CEIL = 0.032;            // 前室の天井の内の薄いレンガの厚さ
const DAMPER_SLOT = 0.025;          // ダンパーの溝（L25）の高さ。煙突の付け根はこの上に載る
const DAMPER_Z0 = 0.48;             // ダンパーの溝の後ろの端の z
const DAMPER_T = 0.0032;            // ダンパーの差し板の厚さ（縞鋼板 3.2 mm）
const HEARTH_COLS = 6;              // 炉床のレンガの列の数（114 mm の列）
const HEARTH_ROWS = 3;              // 炉床の 1 列のレンガの数（230 mm）
const SILL_SMALL = 0.07;            // 前室の口の小片の長さ（1 個を 3 つに切る）
const STRIP_LEN = 0.47;             // 縁の帯の左右と後ろの長さ。前室の下の板の幅も同じ
const FRONT_PLATE_D = 0.24;         // 前室の下の断熱の板の奥行
const INS_CHAMFER = 0.12;           // 炉床の下の断熱の区画の、外の角を落とす量
const BLANKET_LAYERS = 3;           // 毛布 25 mm の層の数
const CLOTH_T = 0.0015;             // ガラスクロスを見せる厚さ（図のための値）
const SEAM_R = 0.003;               // 継ぎ目の線の管の半径（径 6 mm）
const ROPE_R = 0.004;               // ドームの足の下の縄の半径（径 8 mm）
const SKIM_W = 0.05;                // 継ぎ目の外の薄塗りの幅
const BAND_EAR = { out: 0.03, gap: 0.004, bolt: 0.004 };       // 帯の耳の出、耳と耳のすきま、M8 の半径
const PLUG = { w: 0.31, h: 0.17, faceW: 0.33, faceH: 0.19, faceT: 0.0005 };  // 焚き口の差し込みの扉
const RAIL = { len: 0.72, leg: 0.025, t: 0.003 };              // 引き戸のレール（L25）
const SHELL_PLATE = 0.002;          // 殻の板を見せる厚さ（板は 0.27 mm、図のための値）
const ROOF_T = 0.004;               // 波板を見せる厚さ（板は 0.35 mm、図のための値）
const ROOF_WAVE = 0.07;             // 波板の線の間（図のための値）
const NOTCH_CLEAR = 0.02;           // 前の妻の切り欠きと前室の熱い鋼のすきま
const VENT_OUT = 0.05;              // ベントの殻の外への出（図のための値）
const CHIMNEY_CAP = 0.18;           // H 笠の高さ
const TUBE_WALL = 0.0023;           // 角パイプの厚さ
const SIDE_TRIM = 0.01;             // 側梁の端を天板の縁から下げる量
const GUSSET = { leg: 0.05, t: 0.006, len: 0.15 };            // 交点の当て板（山形鋼 L50 × 50 × 6）
const SHIM = { w: 0.098, t: 0.0128 };                         // 足の敷き板（3.2 mm を 4 枚）
const NUT24 = 0.036;                // M24 のナットの二面幅。ナットの高さは foot.stack から出す
const WASHER = { od: 0.044, id: 0.026, t: 0.0045 };           // 座金 26 × 44 × 4.5 mm
const SLEEVE = { od: 0.034, id: 0.0276, len: 0.10 };          // さや管 SGP 25A
const ROD = { len: 0.28, intoPad: 0.08 };                     // 足の全ねじの長さと、据え台の穴に入れる長さ
const PAD_HOLE = 0.026;             // 据え台と敷き板の穴の径
const PIT_DEPTH = 0.20;             // 据え台の穴の深さ
const LUG = { h: 0.10, out: 0.06, t: 0.006 };                 // 脚の耳（平鋼 6 × 100 を 60 mm に切る）
const ANCHOR = { inset: 0.03, rod: 0.016, slabT: 0.06, gap: 0.018, sill: 0.55 };  // 風の留め
const DECK_JOINT = 0.002;           // 天板の 2 枚の継ぎ目のすきま
const BRICK_JOINT = 0.002;          // 並べたレンガの目地を見せるすきま（図のための値）
const ZINC = 0x9ea4aa;              // 溶融亜鉛めっきの色
const GRAVEL = 0x8e9093;            // 締めた砕石の色
const CONCRETE = 0xb9b7b0;          // コンクリート平板の色
const FRAME = 0x8d9297;             // 殻の枠の色
const WOOD = { r: 0.045, rows: 3, len: 0.30, x0: 0.28, z0: 0.36 };  // 薪置き（目安）

// 計算の値（構造設計と構造様式の表による）。図の寸法からは出せないので、札と表にそのまま出す。
const DOME_PIECES = [
  ['後ろの輪', '17.5〜21.4 kg（帯の半分を含む）'],
  ['前の輪', '13.2〜16.4 kg'],
  ['蓋', '9.9〜12.4 kg'],
  ['入口の枠', '7.3〜9.1 kg'],
];
const CALC_ROWS = [
  ['全体の重さ（計算）', '280〜304 kg', '算出'],
  ['ドームの 4 個の重さ（計算）', DOME_PIECES.map(([n, w]) => `${n} ${w}`).join('、'), '算出', true],
  ['雪の合計（計算、殻の上の設計の雪 50 cm）', '1.17 kN', '算出'],
  ['倒れ始める水平震度（計算、雪なし）', '0.40', '算出'],
  ['鎖が無いときに倒れ始める基準風速（計算、粗度区分 II、P の取り方、炉床 0.90 m）', '20.6 m/s', '算出'],
  ['風の留めの強さ（施主の決定）', '鎖の向きに 1 本 4.9 kN 以上', '決定', true],
];
const BRICK_ROWS = [
  ['全体の重さ（計算、前の第一案）', '1.25〜1.38 t', '参考'],
  ['図の扱い', '大きさと重さを比べるための参考の図で、天秤とピンは描かない', '参考', true],
];

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
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const deg = (v) => THREE.MathUtils.degToRad(v);

function material(key, extra = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: PART[key].color, roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
    shadowSide: THREE.BackSide, ...extra,
  });
  ovenMaterials.push(m);
  return m;
}

// 線の材料。noClip のときは断面で切らない（断面の切り口の上に描く線）。
function lineMat(color, noClip = false) {
  const m = new THREE.LineBasicMaterial({ color });
  m.userData.noClip = noClip;
  ovenMaterials.push(m);
  return m;
}

// 窓の形の画素を捨てる（ドームの焚き口と、毛布の入口の枠と前室の穴）。
// 窓は z の向きに抜ける柱で、世界の座標で持つ。
// arch は幅 2 halfW、y = spring から上を半円にしたアーチで、z > z0 だけを抜く。
// rect は幅 2 halfW、y = bottom から top までの四角で、z > z0 だけを抜く。
function cutWindow(m, win) {
  m.userData.win = win;
  const a = win.arch || { halfW: 0, spring: 0, bottom: 0, z0: 0 };
  const r = win.rect || { halfW: 0, bottom: 0, top: 0, z0: 0 };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uArch = { value: new THREE.Vector4(a.halfW, a.spring, a.bottom, a.z0) };
    shader.uniforms.uRect = { value: new THREE.Vector4(r.halfW, r.bottom, r.top, r.z0) };
    shader.vertexShader = 'varying vec3 vWinPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vWinPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = 'varying vec3 vWinPos;\nuniform vec4 uArch;\nuniform vec4 uRect;\n' + shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
  {
    vec3 p = vWinPos;
    bool inA = uArch.x > 0.0 && p.z > uArch.w && abs(p.x) < uArch.x && p.y > uArch.z
      && (p.y < uArch.y || length(vec2(p.x, p.y - uArch.y)) < uArch.x);
    bool inR = uRect.x > 0.0 && p.z > uRect.w && abs(p.x) < uRect.x && p.y > uRect.y && p.y < uRect.z;
    if (inA || inR) discard;
  }`,
    );
  };
  const key = [a.halfW, a.spring, a.bottom, a.z0, r.halfW, r.bottom, r.top, r.z0].join(':');
  m.customProgramCacheKey = () => `win:${key}`;
  return m;
}

// 点が窓の中にあるか（cutWindow と同じ決まり）。断面の線を窓で切るときに使う。
function inWindow(win, x, y, z) {
  const a = win.arch;
  const r = win.rect;
  const inA = a && z > a.z0 && Math.abs(x) < a.halfW && y > a.bottom && (y < a.spring || Math.hypot(x, y - a.spring) < a.halfW);
  const inR = r && z > r.z0 && Math.abs(x) < r.halfW && y > r.bottom && y < r.top;
  return Boolean(inA || inR);
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

function placed(o, x, y, z) {
  o.position.set(x, y, z);
  return o;
}

// 2 点の間に、Y 軸の向きの形（円柱など）を置く。
function placeAlong(o, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  o.position.copy(a).addScaledVector(dir, 0.5);
  o.quaternion.setFromUnitVectors(V3(0, 1, 0), dir.normalize());
  return o;
}

function cylAlong(r, a, b, mat, info, segs = 16) {
  return placeAlong(mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), segs), mat, info), a, b);
}

// 向きを 3 本の軸（basis）で決めた箱を作る。size は軸ごとの長さとする。
function orientedBox(size, basis, center, mat, info) {
  const o = mesh(new THREE.BoxGeometry(...size), mat, info);
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(...basis));
  o.position.copy(center);
  return o;
}

function extrude(shape, depth) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 48 });
}

// x と z の平面の形を、y0 から高さ h だけ上へ押し出す。
// pts は [[x, z], ...]、holes は [[x, z], ...] か { x, z, r } の並びとする。
function slabXZ(pts, holes, y0, h) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const hole of holes || []) {
    const p = new THREE.Path();
    if (Array.isArray(hole)) hole.forEach(([x, z], i) => (i ? p.lineTo(x, -z) : p.moveTo(x, -z)));
    else p.absarc(hole.x, -hole.z, hole.r, 0, Math.PI * 2, true);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 24 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

const rectXZ = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const polyXZ = (r, n, rot = 0) => Array.from({ length: n }, (_, i) => {
  const a = rot + (i / n) * Math.PI * 2;
  return [r * Math.cos(a), r * Math.sin(a)];
});
const hexR = (af) => af / 2 / Math.cos(Math.PI / 6);

// 中を抜いた角パイプ。中心を原点に置き、axis の向きに長さ len をとる。
function sqTube(side, len, axis) {
  const a = side / 2;
  const b = a - TUBE_WALL;
  const s = new THREE.Shape([new THREE.Vector2(-a, -a), new THREE.Vector2(a, -a), new THREE.Vector2(a, a), new THREE.Vector2(-a, a)]);
  s.holes.push(new THREE.Path([new THREE.Vector2(-b, -b), new THREE.Vector2(-b, b), new THREE.Vector2(b, b), new THREE.Vector2(b, -b)]));
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  if (axis === 'x') g.rotateY(Math.PI / 2);
  else if (axis === 'y') g.rotateX(-Math.PI / 2);
  return g;
}

// 閉じた回転体。pts は (r, y) の閉じた輪郭で、左回りにとり、最初と最後の点を同じにする。
// phi0 から dphi だけ回し、全周でないときは両端に輪郭の面を付けて閉じる（断面の切り口を埋めるため）。
function revolve(pts, phi0 = 0, dphi = Math.PI * 2, segs = 96) {
  const lathe = new THREE.LatheGeometry(pts, segs, phi0, dphi);
  if (dphi >= Math.PI * 2 - 1e-6) return lathe;
  const ends = [phi0, phi0 + dphi].map((phi, i) => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y))));
    if (i === 1) flipFaces(g);
    g.rotateY(phi - Math.PI / 2);
    return g;
  });
  return mergeGeometries([lathe, ...ends]);
}

function flipFaces(g) {
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
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

// 焚き口の形を描く。幅 2 r、高さ hs の側壁の上に半円を載せ、o だけ外へ広げる。
function archOutline(path, r, hs, o) {
  path.moveTo(-(r + o), 0);
  path.lineTo(-(r + o), hs);
  path.absarc(0, hs, r + o, Math.PI, 0, true);
  path.lineTo(r + o, 0);
}

// 焚き口のまわりの帯（offset a から b まで）。
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

// 幅 2 halfW、高さ height のアーチの板の形。
function archShape(halfW, height) {
  const s = new THREE.Shape();
  archOutline(s, halfW, Math.max(0, height - halfW), 0);
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

// 線分の組を LineSegments にする。pairs は [[Vector3, Vector3], ...]。
function lines(pairs, mat) {
  return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pairs.flat()), mat);
}

const chainPairs = (pts) => pts.slice(1).map((p, i) => [pts[i], p]);

// 層の境で面を少し離す量
const GAP = 0.002;

const f2 = (v) => (v == null ? '未定' : Number(v).toFixed(2));
const f3 = (v) => (v == null ? '未定' : Number(v).toFixed(3));
const mm = (v) => String(+(v * 1000).toFixed(1));

// ---------- 窯を組む

// ---------- 断面の切り口を埋める
// 中身の詰まった部品は、切った面に部品の色の蓋を描く（stencil で切り口の内側だけを塗る）。
// 煙突は管なので蓋を付けない。人と凍結深度の面も付けない。
// 開いた面（userData.noCap）と、切る面 x = 0 をまたがない形には蓋を付けない。
// 窓で画素を捨てる形は、蓋も同じ窓で捨てる。
const CAP_SKIP = new Set(['chimney', 'frost', 'person']);

function addCaps(b) {
  const objs = [];
  const mats = [];
  const capGeom = new THREE.PlaneGeometry(12, 12);
  const bb = new THREE.Box3();
  b.root.updateMatrixWorld(true);
  let order = 1;
  for (const p of PARTS) {
    if (CAP_SKIP.has(p.key)) continue;
    const g = b.groups[p.key];
    const meshes = [];
    g.traverse((o) => {
      if (o.isMesh && !o.material.transparent && !o.userData.passThrough && !o.userData.noCap) meshes.push(o);
    });
    for (const m of meshes) {
      bb.setFromObject(m);
      if (bb.max.x <= 1e-6 || bb.min.x >= -1e-6) continue;
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
      const capMat = new THREE.MeshStandardMaterial({
        color: m.material.color.clone().multiplyScalar(0.82), roughness: 0.95, metalness: 0,
        stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
      });
      const win = m.material.userData.win;
      if (win) for (const mt of [back, front, capMat]) cutWindow(mt, win);
      for (const mat of [back, front]) {
        const h = new THREE.Mesh(m.geometry, mat);
        h.renderOrder = order;
        h.userData.passThrough = true;
        h.userData.part = p.key;
        h.raycast = () => {};
        m.add(h);
        objs.push(h);
        mats.push(mat);
      }
      const cap = new THREE.Mesh(capGeom, capMat);
      cap.rotation.y = Math.PI / 2;
      cap.position.set(0, 1.5, b.d.centerZ);
      cap.renderOrder = order + 0.5;
      cap.onAfterRender = (r) => r.clearStencil();
      cap.userData.passThrough = true;
      cap.userData.part = p.key;
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
  const info = (key, dims, mat, sub) => ({ key, name: PART[key].label, sub, mat: mat || PART[key].mat, dims });
  const ctx = { groups, info, sectionOnly: [] };
  const d = type === 'brick' ? buildBrick(ctx) : buildCast(ctx);
  d.type = type;
  return { root, groups, d, sectionOnly: ctx.sectionOnly };
}

// 断面の切り口の上に描く線（x = 0 の面のすぐ前）。pairs は [[[z, y], [z, y]], ...]。断面のときだけ見せる。
function sectionLines(ctx, key, pairs, color) {
  const x = 0.001;
  const o = lines(pairs.map(([a, b]) => [V3(x, a[1], a[0]), V3(x, b[1], b[0])]), lineMat(color, true));
  o.userData.sectionOnly = true;
  o.visible = false;
  o.renderOrder = 1000;
  ctx.groups[key].add(o);
  ctx.sectionOnly.push(o);
  return o;
}

// ---------- 分割のキャスタブルのドーム（第一案）

function buildCast(ctx) {
  const { groups, info } = ctx;
  const add = (key, ...objs) => { groups[key].add(...objs); return objs[0]; };

  // 高さ。炉床の下の断熱は天板の上面に載る。
  const yT = P('table.top');
  const hi = P('hearth.insulation');
  const th = P('hearth.firebrick');
  const yIns1 = yT + hi;                      // 炉床の下の断熱の上面
  const yFloor = yIns1 + th;                  // 炉床の面
  const seat = P('dome.seat');
  const yBase = yFloor + seat;                // ドームの足の下の面

  // ドーム
  const R = P('dome.inner_diameter') / 2;
  const H = P('dome.inner_height');
  const t = P('dome.thickness');
  const Ro = R + t;
  const Rm = R + t / 2;
  const lat = deg(P('dome.split_lat'));
  const dStep = P('dome.step') / Rm;          // 段の重なりの角。子午線に沿って段の深さと同じ長さにとる
  const gk = P('dome.gasket');
  const gLat = gk / Rm;
  const gPhi = gk / 2 / Rm;
  const ins = P('insulation.thickness');
  const rIns = Ro + ins;

  // 焚き口と入口の枠。ドームの中の高さは、ドームの足の下の面からはかる。
  const dHalf = P('door.width') / 2;
  const dH = P('door.height');
  const dSpring = Math.max(0, dH - dHalf);    // 炉床の面から半円の中心まで
  const sprL = Math.max(0, dSpring - seat);   // ドームの足の下の面から半円の中心まで
  const collarZ = Ro + P('collar.depth');     // 入口の枠の前の面

  // 前室
  const lw = P('landing.width');
  const lh = P('landing.height');
  const ld = P('landing.depth');
  const lp = P('landing.plate');
  const zLF = collarZ + ld + lp;              // 前室の前の面
  const yCeil = yFloor + lh;                  // 天井の薄いレンガの下の面
  const yRoof = yCeil + LAND_CEIL;            // 鋼板の天井の下の面
  const yRoofTop = yRoof + lp;
  const rc = P('chimney.diameter') / 2;
  const cz = P('chimney.z');
  const yCB = yRoofTop + DAMPER_SLOT;         // 煙突の付け根

  // 炉床
  const hw = P('hearth.width');
  const hd = P('hearth.depth');
  const hx = hw / 2;
  const hz = hd / 2;
  const bw = hw / HEARTH_COLS;
  const bl = hd / HEARTH_ROWS;

  // 回転楕円体の上の点を返す。a はドームの内面から外へはかった厚さ、q は緯度とする。
  const sp = (a, q) => new THREE.Vector2(Math.max((R + a) * Math.cos(q), 1e-4), (H + a) * Math.sin(q));
  const arc = (a, q0, q1, n) => Array.from({ length: n + 1 }, (_, i) => sp(a, q0 + ((q1 - q0) * i) / n));
  // 回転楕円体の面の z（ドームの足の下の面からの高さ y、左右 x のとき）
  const zOn = (a, x, y) => (R + a) * Math.sqrt(Math.max(0, 1 - (x / (R + a)) ** 2 - (y / (H + a)) ** 2));

  // ---- ドーム（4 個）
  // 4 個は同じ chamber に入れ、色を 3% ずつ変えて継ぎ目を見せる。
  const shade = (i) => new THREE.Color(PART.chamber.color).multiplyScalar(1 - 0.03 * i);
  const pieceWeights = DOME_PIECES.map(([n, w]) => `${n} ${w}`).join('、');
  const domeDims = `内径 ${f2(2 * R)} m、内高 ${f2(H)} m、厚さ ${f3(t)} m。緯度 ${P('dome.split_lat')}° で輪と蓋に分け、輪を z = 0 で前と後ろに分ける。4 個の重さは ${pieceWeights} になる（計算）`;
  const pieceInfo = (i) => info('chamber', domeDims, `${PART.chamber.mat}。この個は${DOME_PIECES[i][0]}で、重さは ${DOME_PIECES[i][1]} になる（計算）`, DOME_PIECES[i][0]);

  // 輪の輪郭。上の端を段付きにする（外の半分は緯度 lat まで、内の半分は lat + dStep まで）。
  const N = 24;
  const ringPts = [...arc(t, 0, lat, N), ...arc(t / 2, lat, lat + dStep, 3), ...arc(0, lat + dStep, 0, N)];
  ringPts.push(ringPts[0].clone());
  // 蓋の輪郭。輪の段に紙の厚さだけ離して座る。
  const lidPts = [
    ...arc(t, lat + gLat, Math.PI / 2, N),
    ...arc(0, Math.PI / 2, lat + dStep + gLat, N),
    ...arc(t / 2 + gk, lat + dStep + gLat, lat + gLat, 3),
  ];
  lidPts.push(lidPts[0].clone());

  const doorWin = { arch: { halfW: dHalf, spring: yFloor + dSpring, bottom: yFloor - 0.02, z0: 0 } };
  const collarWin = { arch: { halfW: dHalf + t, spring: yFloor + dSpring, bottom: yFloor - 0.02, z0: 0 } };

  const back = mesh(revolve(ringPts, Math.PI / 2 + gPhi, Math.PI - 2 * gPhi, 48), material('chamber', { color: shade(0) }), pieceInfo(0));
  const frontMat = cutWindow(material('chamber', { color: shade(1) }), doorWin);
  const front = mesh(revolve(ringPts, -Math.PI / 2 + gPhi, Math.PI - 2 * gPhi, 48), frontMat, pieceInfo(1));
  const lid = mesh(revolve(lidPts), material('chamber', { color: shade(2) }), pieceInfo(2));

  // 前の輪の焚き口の縁の壁（見た目のため。断面の蓋は窓で捨てるので、ここには付けない）。
  const reveal = (() => {
    const w = dHalf + 1e-4;
    const outline = [];
    for (let i = 0; i <= 4; i++) outline.push([-w, (sprL * i) / 4]);
    for (let i = 1; i < 32; i++) {
      const q = Math.PI - (i / 32) * Math.PI;
      outline.push([w * Math.cos(q), sprL + w * Math.sin(q)]);
    }
    for (let i = 4; i >= 0; i--) outline.push([w, (sprL * i) / 4]);
    const pos = [];
    for (const [x, y] of outline) pos.push(x, y, zOn(0, x, y), x, y, zOn(t, x, y));
    const idx = [];
    for (let i = 0; i < outline.length - 1; i++) {
      const k = 2 * i;
      idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const o = mesh(g, material('chamber', { color: shade(1) }), pieceInfo(1));
    o.userData.noCap = true;
    return o;
  })();

  // 入口の枠。焚き口のまわりの厚さ t の帯を前へ押し出し、後ろの面をドームの外面に沿わせる。
  const collarGeom = extrude(archRing(dHalf, sprL, 0, t), collarZ);
  {
    const pos = collarGeom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) < 1e-6) pos.setZ(i, zOn(t + gk, pos.getX(i), pos.getY(i)));
    }
    collarGeom.computeVertexNormals();
  }
  const collar = mesh(collarGeom, material('chamber', { color: shade(3) }), pieceInfo(3));
  for (const o of [back, front, reveal, lid, collar]) o.position.y = yBase;
  add('chamber', back, front, reveal, lid, collar);

  // ---- 継ぎ目（継ぎ目の線、外の薄塗り、ドームの足の下の縄）
  const seamMat = material('seam');
  const skimMat = material('seam', { color: new THREE.Color(PART.seam.color).lerp(new THREE.Color(PART.chamber.color), 0.45) });
  const seamDims = `段の深さ ${mm(P('dome.step'))} mm、紙 ${mm(gk)} mm、外の薄塗り ${mm(P('dome.skim'))} mm、縄の圧したあとの厚さ ${mm(seat)} mm`;
  const Hm = H + t / 2;
  // 緯度 lat の輪（厚さの中ほど）
  const ringSeam = new THREE.TorusGeometry(Rm * Math.cos(lat), SEAM_R, 8, 128);
  ringSeam.rotateX(-Math.PI / 2);
  const ringSeamMesh = mesh(ringSeam, seamMat, info('seam', seamDims, '輪と蓋の段付きの継ぎ目（ペーパー 1 mm を挟む）', '緯度の継ぎ目'));
  ringSeamMesh.position.y = yBase + Hm * Math.sin(lat);
  add('seam', ringSeamMesh);
  // 前と後ろを分ける縦の 2 本（x = ±Rm）
  for (const s of [-1, 1]) {
    const pts = Array.from({ length: 13 }, (_, i) => {
      const q = (lat * i) / 12;
      return V3(s * Rm * Math.cos(q), yBase + Hm * Math.sin(q), 0);
    });
    add('seam', mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, SEAM_R, 8, false), seamMat,
      info('seam', seamDims, '前の輪と後ろの輪の段付きの継ぎ目（ペーパー 1 mm を挟む）', '縦の継ぎ目')));
  }
  // 入口の枠のまわり（ドームの外面の上）
  {
    const w = dHalf + t;
    const pts = [];
    for (let i = 0; i <= 3; i++) pts.push([-w, (sprL * i) / 3]);
    for (let i = 1; i < 40; i++) {
      const q = Math.PI - (i / 40) * Math.PI;
      pts.push([w * Math.cos(q), sprL + w * Math.sin(q)]);
    }
    for (let i = 3; i >= 0; i--) pts.push([w, (sprL * i) / 3]);
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => V3(x, yBase + y, zOn(t, x, y))));
    add('seam', mesh(new THREE.TubeGeometry(curve, 96, SEAM_R, 8, false), seamMat,
      info('seam', seamDims, '前の輪と入口の枠の継ぎ目（外に耐火モルタルを薄く塗る）', '入口の枠のまわり')));
  }
  // 外の薄塗り（緯度の輪と縦の 2 本の外。幅 SKIM_W、厚さ dome.skim）
  {
    const sk = P('dome.skim');
    const hwq = SKIM_W / 2 / Ro;
    const latBand = [...arc(t + sk, lat - hwq, lat + hwq, 6), ...arc(t + 3e-4, lat + hwq, lat - hwq, 6)];
    latBand.push(latBand[0].clone());
    const skimInfo = info('seam', seamDims, `継ぎ目の外の薄塗り（耐火モルタル、幅 ${mm(SKIM_W)} mm）`, '外の薄塗り');
    add('seam', placed(mesh(revolve(latBand), skimMat, skimInfo), 0, yBase, 0));
    const q0 = Math.asin(Math.min(1, P('band.width') / (H + t)));
    const vBand = [...arc(t + sk, q0, lat - hwq, 12), ...arc(t + 3e-4, lat - hwq, q0, 12)];
    vBand.push(vBand[0].clone());
    for (const s of [-1, 1]) {
      const o = mesh(revolve(vBand, s * Math.PI / 2 - hwq, 2 * hwq, 4), skimMat, skimInfo);
      o.position.y = yBase;
      add('seam', o);
    }
  }
  // ドームの足の下の縄。焚き口の両脇で止め、入口の枠の脚の下にも敷く。
  {
    const gapHalf = Math.asin(Math.min(1, dHalf / Rm));
    const rope = new THREE.TorusGeometry(Rm, ROPE_R, 8, 120, Math.PI * 2 - 2 * gapHalf);
    rope.rotateZ(Math.PI * 1.5 + gapHalf);
    rope.rotateX(-Math.PI / 2);
    const ropeInfo = info('seam', seamDims, 'ドームの足の下の縄（φ8〜10 mm、焚き口の両脇で止める）', '縄');
    const ropeMesh = mesh(rope, seamMat, ropeInfo);
    ropeMesh.position.y = yFloor + seat / 2;
    add('seam', ropeMesh);
    for (const s of [-1, 1]) {
      const x = s * (dHalf + t / 2);
      add('seam', cylAlong(ROPE_R, V3(x, yFloor + seat / 2, zOn(t, x, 0)), V3(x, yFloor + seat / 2, collarZ), seamMat, ropeInfo, 10));
    }
  }

  // ---- 足元の帯（半円 2 本。焚き口の前は入口の枠の外形の中を描かない）
  {
    const bwid = P('band.width');
    const bt = P('band.thickness');
    const rO = Ro + bt / 2;
    const rI = Ro - bt / 2;
    const pts = [new THREE.Vector2(rO, 0), new THREE.Vector2(rO, bwid), new THREE.Vector2(rI, bwid), new THREE.Vector2(rI, 0), new THREE.Vector2(rO, 0)];
    const gB = BAND_EAR.gap / 2 / Ro;
    const bandMat = material('band', { metalness: 0.4, roughness: 0.6 });
    const frontBandMat = cutWindow(material('band', { metalness: 0.4, roughness: 0.6 }), collarWin);
    const bInfo = info('band', `平鋼 ${mm(bt)} × ${mm(bwid)} mm、外の半径 ${f3(rO)} m の半円 2 本。耳はステンレスの M8 で締める`);
    const halves = [
      mesh(revolve(pts, Math.PI / 2 + gB, Math.PI - 2 * gB, 64), bandMat, bInfo),
      mesh(revolve(pts, -Math.PI / 2 + gB, Math.PI - 2 * gB, 64), frontBandMat, bInfo),
    ];
    for (const o of halves) { o.position.y = yBase; add('band', o); }
    for (const s of [-1, 1]) {
      for (const k of [-1, 1]) {
        add('band', box(BAND_EAR.out, bwid, bt, s * (rO + BAND_EAR.out / 2), yBase + bwid / 2, k * (BAND_EAR.gap / 2 + bt / 2), bandMat, bInfo));
      }
      const bolt = mesh(new THREE.CylinderGeometry(BAND_EAR.bolt, BAND_EAR.bolt, BAND_EAR.gap + 2 * bt + 0.012, 12), material('band', { color: ZINC, metalness: 0.5 }), bInfo);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(s * (rO + BAND_EAR.out * 0.6), yBase + bwid / 2, 0);
      add('band', bolt);
    }
  }

  // ---- 毛布とガラスクロス。入口の枠の外形と前室の箱の形を抜く。
  const insWin = {
    arch: { halfW: dHalf + t, spring: yFloor + dSpring, bottom: yFloor - 0.02, z0: 0 },
    rect: { halfW: lw / 2 + lp, bottom: yFloor - 0.02, top: yRoofTop, z0: collarZ },
  };
  {
    const insInfo = info('insulation', `厚さ ${f3(ins)} m（25 mm を ${BLANKET_LAYERS} 層）、外の半径 ${f3(rIns)} m`);
    const blanket = mesh(domeShell(R, H, t + 0.001, t + ins, seat), cutWindow(material('insulation'), insWin), insInfo);
    const cloth = mesh(domeShell(R, H, t + ins, t + ins + CLOTH_T, seat),
      cutWindow(material('insulation', { color: 0xdcd6c6 }), insWin),
      info('insulation', `毛布の外に重ねしろ 50 mm で巻く`, 'ガラスクロス #200（ガラス繊維の織物）。ステンレスの針金で留める', 'ガラスクロス'));
    blanket.position.y = yBase;
    cloth.position.y = yBase;
    add('insulation', blanket, cloth);
    // 炉床の四角の 4 隅の上と、縁の帯の無い側面を覆う毛布の切れ端（25 mm）
    const tl = ins / BLANKET_LAYERS;
    const scrapMat = material('insulation');
    const scrapInfo = info('insulation', `厚さ ${mm(tl)} mm`, '毛布 25 mm の切れ端（炉床の四角の隅と側面）', '切れ端');
    if (hx * hx + hz * hz > rIns * rIns && hx < rIns && hz < rIns) {
      const zc0 = Math.sqrt(rIns * rIns - hx * hx);
      const xc0 = Math.sqrt(rIns * rIns - hz * hz);
      const a1 = Math.atan2(zc0, hx);
      const a2 = Math.atan2(hz, xc0);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const pts = [[hx, zc0], [hx, hz], [xc0, hz]];
          for (let i = 1; i < 8; i++) {
            const q = a2 + ((a1 - a2) * i) / 8;
            pts.push([rIns * Math.cos(q), rIns * Math.sin(q)]);
          }
          add('insulation', mesh(slabXZ(pts.map(([x, z]) => [sx * x, sz * z]), null, yFloor, tl), scrapMat, scrapInfo));
        }
      }
    }
    const sideH = th - GAP;
    const sy = yIns1 + GAP + sideH / 2;
    const e = STRIP_LEN / 2;
    for (const s of [-1, 1]) {
      for (const k of [-1, 1]) {
        if (hz > e) add('insulation', box(tl, sideH, hz - e, s * (hx + tl / 2), sy, k * (e + hz) / 2, scrapMat, scrapInfo));
        if (hx > e) add('insulation', box(hx - e, sideH, tl, k * (e + hx) / 2, sy, s * (hz + tl / 2), scrapMat, scrapInfo));
      }
    }
    // 断面の 3 層の線
    const pairs = [];
    for (let k = 1; k < BLANKET_LAYERS; k++) {
      const a = t + (ins * k) / BLANKET_LAYERS;
      for (const sgn of [-1, 1]) {
        const pts = [V3(0, yFloor, sgn * (R + a))];
        for (let i = 0; i <= 48; i++) {
          const q = (i / 48) * Math.PI / 2;
          pts.push(V3(0, yBase + (H + a) * Math.sin(q), sgn * (R + a) * Math.cos(q)));
        }
        for (const [p, q] of chainPairs(pts)) {
          if (!inWindow(insWin, 0, p.y, p.z) && !inWindow(insWin, 0, q.y, q.z)) pairs.push([[p.z, p.y], [q.z, q.y]]);
        }
      }
    }
    sectionLines(ctx, 'insulation', pairs, 0x9c9584);
  }

  // 断面の継ぎ目の段（内と外で段の深さずつずらす）と、入口の枠の後ろの面
  {
    const pz = (a, q, sgn) => [sgn * (R + a) * Math.cos(q), yBase + (H + a) * Math.sin(q)];
    const pairs = [];
    for (const sgn of [-1, 1]) {
      const pts = [pz(t, lat, sgn), pz(t / 2, lat, sgn), pz(t / 2, lat + dStep, sgn), pz(0, lat + dStep, sgn)];
      pairs.push(...chainPairs(pts));
    }
    const y0 = sprL + dHalf;
    const cpts = Array.from({ length: 6 }, (_, i) => {
      const y = y0 + (t * i) / 5;
      return [zOn(t, 0, y), yBase + y];
    });
    pairs.push(...chainPairs(cpts));
    sectionLines(ctx, 'seam', pairs, PART.seam.color);
  }

  // ---- 炉床（レンガを切らずに並べた四角）
  {
    const hm = material('hearth');
    add('hearth', box(hw, th - GAP, hd, 0, yIns1 + GAP + (th - GAP) / 2, 0, hm,
      info('hearth', `${f3(hw)} × ${f2(hd)} m、厚さ ${f3(th)} m。230 × 114 × 65 mm を ${HEARTH_COLS} 列 × ${HEARTH_ROWS} 個に並べる`)));
    const y = yFloor + 0.0004;
    const pairs = [];
    for (let i = 1; i < HEARTH_COLS; i++) {
      const x = -hx + i * bw;
      pairs.push([V3(x, y, -hz), V3(x, y, hz)]);
    }
    for (let j = 1; j < HEARTH_ROWS; j++) {
      const z = -hz + j * bl;
      pairs.push([V3(-hx, y, z), V3(hx, y, z)]);
    }
    add('hearth', lines(pairs, lineMat(0x7a3a22)));
    const sec = [];
    for (let j = 1; j < HEARTH_ROWS; j++) sec.push([[-hz + j * bl, yIns1], [-hz + j * bl, yFloor]]);
    sec.push([[hz, yIns1], [hz, yFloor]], [[hz + bl, yIns1], [hz + bl, yFloor]]);
    sectionLines(ctx, 'hearth', sec, 0x7a3a22);
  }

  // ---- 炉床の下の断熱（4 区画と前室の下の板）と、炉床の外の縁の帯
  {
    const q = P('hearth.ins_quarter');
    const c = INS_CHAMFER;
    const g = GAP / 2;
    const im = material('hearthIns');
    const qInfo = info('hearthIns', `${f2(q)} m 角、厚さ ${f3(hi)} m。外の角を ${f2(c)} m 落とす`, undefined, '区画');
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pts = [[g, g], [q, g], [q, q - c], [q - c, q], [g, q]].map(([x, z]) => [sx * x, sz * z]);
        add('hearthIns', mesh(slabXZ(pts, null, yT + GAP, hi - GAP), im, qInfo));
      }
    }
    add('hearthIns', box(STRIP_LEN, hi - GAP, FRONT_PLATE_D, 0, yT + GAP + (hi - GAP) / 2, q + FRONT_PLATE_D / 2, im,
      info('hearthIns', `${f2(STRIP_LEN)} × ${f2(FRONT_PLATE_D)} m、厚さ ${f3(hi)} m`, undefined, '前室の下の板')));
    const sw = P('hearth.strip');
    const sh = th - GAP;
    const sy = yIns1 + GAP + sh / 2;
    const sInfo = info('hearthIns', `幅 ${f3(sw)} m、高さ ${f3(th)} m`, undefined, '縁の帯');
    for (const s of [-1, 1]) add('hearthIns', box(sw, sh, STRIP_LEN, s * (hx + sw / 2), sy, 0, im, sInfo));
    add('hearthIns', box(STRIP_LEN, sh, sw, 0, sy, -(hz + sw / 2), im, sInfo));
    const fx0 = hw / 4;
    const fx1 = STRIP_LEN / 2;
    for (const s of [-1, 1]) add('hearthIns', box(fx1 - fx0, sh, zLF - hz, s * (fx0 + fx1) / 2, sy, (hz + zLF) / 2, im, sInfo));
  }

  // ---- 前室と焚き口
  {
    const lm = material('landing', { metalness: 0.35, roughness: 0.6 });
    const brick = material('landing', { color: PART.hearth.color });
    const boxInfo = info('landing', `内のり 幅 ${f2(lw)} × 高さ ${f3(lh)}（薄いレンガの下）× 奥行 ${f2(ld)} m、鋼板の天井は床から ${f3(lh + LAND_CEIL)} m`, '縞鋼板 3.2 mm の袖 2 枚と天板。外は 600℃ の耐熱塗料で塗る', '箱');
    for (const s of [-1, 1]) {
      add('landing', box(lp, yRoof - yFloor, zLF - collarZ, s * (lw / 2 + lp / 2), (yFloor + yRoof) / 2, (collarZ + zLF) / 2, lm, boxInfo));
    }
    const zTop = zLF + P('landing.overhang');
    add('landing', mesh(slabXZ(rectXZ(-(lw / 2 + lp), lw / 2 + lp, collarZ, zTop), [{ x: 0, z: cz, r: rc + 0.003 }], yRoof, lp), lm, boxInfo));
    const zc1 = collarZ + ld;
    const holeR = Math.max(0.01, Math.min(rc, zc1 - cz - 0.003, cz - collarZ - 0.003));
    add('landing', mesh(slabXZ(rectXZ(-lw / 2, lw / 2, collarZ, zc1), [{ x: 0, z: cz, r: holeR }], yCeil, LAND_CEIL - 0.0005), brick,
      info('landing', `厚さ ${mm(LAND_CEIL)} mm。煙突の口を切り欠く`, '薄いレンガ（SK34 ウス半丁）を天井の内に張る', '天井のレンガ')));
    // 焚き口の敷居と前室の床に、丸ごと 3 個と、前室の口の小片 3 個を並べる。
    const sillInfo = info('landing', `幅 ${f3(3 * bw)} m、z = ${f3(hz)}〜${f3(hz + bl + SILL_SMALL)} m`, '耐火粘土レンガ（丸ごと 3 個と小片 3 個）', '敷居と前室の床');
    for (let i = -1; i <= 1; i++) {
      for (const [z0, z1] of [[hz, hz + bl], [hz + bl, hz + bl + SILL_SMALL]]) {
        add('landing', box(bw - BRICK_JOINT, th - GAP, z1 - z0 - BRICK_JOINT, i * bw, yIns1 + GAP + (th - GAP) / 2, (z0 + z1) / 2, brick, sillInfo));
      }
    }
    // 焚き口の前掛け（焚く日だけ掛ける）
    if (state.apron) {
      const aw = P('apron.width');
      const ad = P('apron.depth');
      const ar = P('apron.rim');
      const z0 = P('table.offset_z') + P('table.depth') / 2;
      const aInfo = info('landing', `${f2(aw)} × ${f2(ad)} m、縁 ${mm(ar)} mm。焚く日に天板の前の縁に掛ける`, '縞鋼板 3.2 mm の前掛け', '前掛け');
      add('landing', box(aw, lp, ad, 0, yT - lp / 2, z0 + ad / 2, lm, aInfo));
      add('landing', box(aw, ar, lp, 0, yT + ar / 2, z0 + ad - lp / 2, lm, aInfo));
      for (const s of [-1, 1]) add('landing', box(lp, ar, ad, s * (aw / 2 - lp / 2), yT + ar / 2, z0 + ad / 2, lm, aInfo));
    }
  }

  // ---- 扉（焚き口の差し込みの扉と、前室の口の引き戸）
  {
    const ds = DOOR_STATES[state.door] || DOOR_STATES.plug;
    const dm = material('door');
    const steel = material('door', { color: 0xa9aeb3, metalness: 0.6, roughness: 0.4 });
    if (ds.plug) {
      const plug = P('door.plug');
      const pInfo = info('door', `差し込む部分 幅 ${f2(PLUG.w)} m、高さ ${f2(PLUG.h)} m、厚さ ${f3(plug)} m。面の板 ${f2(PLUG.faceW)} × ${f2(PLUG.faceH)} m`,
        'ケイカル板 6 mm と毛布 25 mm を焚き口の形に切り、ステンレス板 0.5 mm の面に重ねる', '焚き口の差し込みの扉');
      const body = mesh(extrude(archShape(PLUG.w / 2, PLUG.h), plug - PLUG.faceT), dm, pInfo);
      body.position.set(0, yFloor, collarZ - (plug - PLUG.faceT));
      const face = mesh(extrude(archShape(PLUG.faceW / 2, PLUG.faceH), 0.001), steel, pInfo);
      face.position.set(0, yFloor, collarZ + 0.0002);
      add('door', body, face, box(0.08, 0.012, 0.02, 0, yFloor + PLUG.faceH * 0.55, collarZ + 0.011, steel, pInfo));
    }
    const lfw = P('door.leaf_w');
    const lfh = P('door.leaf_h');
    const dt = P('door.thickness');
    const off = ds.open * lfw;
    const yMid = yFloor + lh / 2;
    const leafInfo = info('door', `${f2(lfw)} × ${f2(lfh)} m、厚さ ${f3(dt)} m。止めは閉のほかに ${P('door.stops')} 段ある（1/4、1/2、全開）`,
      '縞鋼板 3.2 mm、ケイカル板 6 mm、毛布 25 mm の引き戸', '前室の口の引き戸');
    add('door', box(lfw, lfh, dt, off, yMid, zLF + dt / 2, dm, leafInfo));
    add('door', box(0.02, 0.06, 0.02, off - lfw / 2 + 0.04, yMid, zLF + dt + 0.01, steel, leafInfo));
    const railInfo = info('door', `長さ ${f2(RAIL.len)} m を上と下に 1 本ずつ付ける。下のレールの穴に止めのピンを落とす`, '山形鋼 L25 のレール', 'レール');
    const rx = RAIL.len / 2 - lfw / 2;
    for (const s of [-1, 1]) {
      const yEdge = yMid + s * lfh / 2;
      add('door', box(RAIL.len, RAIL.t, dt + 2 * RAIL.t, rx, yEdge + s * RAIL.t / 2, zLF + dt / 2 + RAIL.t / 2, steel, railInfo));
      add('door', box(RAIL.len, RAIL.leg * 0.6, RAIL.t, rx, yEdge - s * (RAIL.leg * 0.3 - RAIL.t), zLF + dt + RAIL.t * 1.5, steel, railInfo));
    }
  }

  // ---- ダンパー（前室の天板の上の溝に通す差し板。図は閉めた位置）
  {
    const dw = P('damper.width');
    const dl = P('damper.length');
    const dmat = material('damper', { metalness: 0.3, roughness: 0.6 });
    const dInfo = info('damper', `差し板 ${f2(dw)} × ${f2(dl)} m、溝 z = ${f2(DAMPER_Z0)}〜${f2(DAMPER_Z0 + dl)} m。図は閉めた位置で描く`);
    const yc = yRoofTop + DAMPER_SLOT / 2;
    add('damper', box(dw, DAMPER_T, dl, 0, yc, DAMPER_Z0 + dl / 2, dmat, dInfo));
    for (const s of [-1, 1]) {
      const x = s * (dw / 2 + 0.004);
      add('damper', box(RAIL.t, DAMPER_SLOT, dl, x, yc, DAMPER_Z0 + dl / 2, dmat, dInfo));
      add('damper', box(0.012, RAIL.t, dl, x - s * 0.006, yRoofTop + DAMPER_SLOT - RAIL.t / 2, DAMPER_Z0 + dl / 2, dmat, dInfo));
    }
    add('damper', cylAlong(0.005, V3(0, yc, DAMPER_Z0 + dl), V3(0, yc, DAMPER_Z0 + dl + 0.08), dmat, dInfo, 10));
  }

  // ---- 殻（45°の切妻）
  const W = P('shell.width');
  const sw2 = W / 2;
  const yS0 = yT + P('shell.bottom_gap');
  const yE = P('shell.eave');
  const pitch = deg(P('shell.pitch'));
  const yR = yE + sw2 * Math.tan(pitch);
  const ov = P('shell.overhang');
  const fr = P('shell.frame');
  const flow = (sw2 + ov) / Math.cos(pitch);
  const notch = { w: Math.max(lw / 2 + lp + NOTCH_CLEAR, STRIP_LEN / 2), top: yRoofTop + NOTCH_CLEAR };
  {
    const pm = material('shell', { metalness: 0.2, roughness: 0.7 });
    const rm = material('shell', { color: 0xc9ced3, metalness: 0.3, roughness: 0.6 });
    const fm = material('shell', { color: FRAME, metalness: 0.3, roughness: 0.6 });
    const shellDims = `幅と奥行 ${f2(W)} m、軒 ${f2(yE)} m、棟 ${f2(yR)} m、勾配 ${P('shell.pitch')}°、軒の出 ${f2(ov)} m、毛布とのすきま ${mm(P('shell.gap'))} mm、裾のすきま ${mm(P('shell.bottom_gap'))} mm`;
    const plInfo = info('shell', shellDims, '塗った鋼板の小板（0.27 mm）。枠にドリルねじで留める', '側と妻の板');
    for (const s of [-1, 1]) add('shell', box(SHELL_PLATE, yE - yS0, W, s * (sw2 - SHELL_PLATE / 2), (yS0 + yE) / 2, 0, pm, plInfo));
    const gable = (cut) => {
      const s = new THREE.Shape();
      s.moveTo(-sw2, yS0);
      if (cut) {
        s.lineTo(-cut.w, yS0);
        s.lineTo(-cut.w, cut.top);
        s.lineTo(cut.w, cut.top);
        s.lineTo(cut.w, yS0);
      }
      s.lineTo(sw2, yS0);
      s.lineTo(sw2, yE);
      s.lineTo(0, yR);
      s.lineTo(-sw2, yE);
      s.closePath();
      return s;
    };
    const rearG = mesh(extrude(gable(null), SHELL_PLATE), pm, plInfo);
    rearG.position.z = -sw2;
    const frontG = mesh(extrude(gable(notch), SHELL_PLATE), pm,
      info('shell', `${shellDims}。前の妻は前室の形に切り欠き、熱い鋼から ${mm(NOTCH_CLEAR)} mm 以上離す`, plInfo.mat, '側と妻の板'));
    frontG.position.z = sw2 - SHELL_PLATE;
    add('shell', rearG, frontG);
    // 屋根の波板と棟包み
    const roofInfo = info('shell', `流れの長さ ${f3(flow)} m、棟の向きの長さ ${f2(W + 2 * ov)} m`, '塗った小波の波板', '屋根');
    const wavePairs = [];
    for (const s of [-1, 1]) {
      const nrm = V3(s * Math.sin(pitch), Math.cos(pitch), 0);
      const o = mesh(new THREE.BoxGeometry(flow, ROOF_T, W + 2 * ov), rm, roofInfo);
      o.position.set(s * (sw2 + ov) / 2, yR - ((sw2 + ov) / 2) * Math.tan(pitch), 0).addScaledVector(nrm, ROOF_T / 2);
      o.rotation.z = -s * pitch;
      add('shell', o);
      const lift = nrm.clone().multiplyScalar(ROOF_T + 0.0008);
      for (let z = -sw2 - ov + ROOF_WAVE / 2; z < sw2 + ov; z += ROOF_WAVE) {
        wavePairs.push([V3(0, yR, z).add(lift), V3(s * (sw2 + ov), yR - (sw2 + ov) * Math.tan(pitch), z).add(lift)]);
      }
    }
    add('shell', lines(wavePairs, lineMat(0x8a9096)));
    add('shell', box(0.08, ROOF_T, W + 2 * ov, 0, yR + ROOF_T / Math.cos(pitch) + ROOF_T / 2, 0, rm, info('shell', roofInfo.dims, '棟包み（板の余りの帯）', '屋根')));
    // 枠（L25 を細い角柱で描く）
    const frInfo = info('shell', `山形鋼 L${mm(fr)} × ${mm(fr)} × 3 で、四隅の柱、軒の桁、妻の繋ぎ、垂木、棟、母屋を組む。天板に M8 で 4 か所留める`, '山形鋼の枠（溶接して 1 つの籠にする）', '枠');
    const io = sw2 - SHELL_PLATE - fr / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) add('shell', box(fr, yE - yT, fr, sx * io, (yT + yE) / 2, sz * io, fm, frInfo));
      add('shell', box(fr, fr, W - 2 * SHELL_PLATE, sx * io, yE - fr / 2, 0, fm, frInfo));
    }
    add('shell', box(W - 2 * SHELL_PLATE, fr, fr, 0, yE - fr / 2, -io, fm, frInfo));
    // 前の妻の繋ぎは、前室の切り欠きの上で垂木どうしをつなぐ。
    const yTie = Math.max(yE - fr / 2, notch.top + fr / 2);
    const tieHalf = Math.min(sw2 - SHELL_PLATE, (yR - (yTie + fr / 2)) / Math.tan(pitch));
    add('shell', box(2 * tieHalf, fr, fr, 0, yTie, io, fm, frInfo));
    const rafter = sw2 / Math.cos(pitch);
    for (const sx of [-1, 1]) {
      const nrm = V3(sx * Math.sin(pitch), Math.cos(pitch), 0);
      const c = V3(sx * sw2 / 2, (yE + yR) / 2, 0).addScaledVector(nrm, -fr / 2);
      for (const sz of [-1, 1]) {
        const o = box(rafter, fr, fr, c.x, c.y, sz * io, fm, frInfo);
        o.rotation.z = -sx * pitch;
        add('shell', o);
      }
      const pur = box(fr, fr, W - 2 * SHELL_PLATE, c.x, c.y, 0, fm, frInfo);
      pur.rotation.z = -sx * pitch;
      add('shell', pur);
    }
    add('shell', box(fr, fr, W - 2 * SHELL_PLATE, 0, yR - fr, 0, fm, frInfo));
  }

  // ---- 頂部のベント（後ろの妻の頂）
  {
    const rv = P('vent.diameter') / 2;
    const vm = material('vent', { metalness: 0.6, roughness: 0.35 });
    const vInfo = info('vent', `径 ${f2(2 * rv)} m。後ろの妻の頂に付け、口の内に網を張る`);
    const yV = yR - 2 * rv - fr * 1.5;
    add('vent', cylAlong(rv, V3(0, yV, -sw2 + SHELL_PLATE), V3(0, yV, -sw2 - VENT_OUT), vm, vInfo, 24));
    const hood = box(2 * rv + 0.03, 0.003, VENT_OUT + 0.03, 0, yV + rv + 0.012, -sw2 - (VENT_OUT + 0.03) / 2, vm, vInfo);
    hood.rotation.x = -0.35;
    add('vent', hood);
    for (const s of [-1, 1]) add('vent', box(0.003, rv + 0.02, VENT_OUT + 0.01, s * (rv + 0.015), yV + rv / 2 - 0.005, -sw2 - (VENT_OUT + 0.01) / 2, vm, vInfo));
  }

  // ---- 煙突（前室の天板の上の溝の上に立てる）
  {
    const yCT = P('chimney.top') - CHIMNEY_CAP;
    const cm = material('chimney', { metalness: 0.4, roughness: 0.5 });
    const cInfo = info('chimney', `内径 ${f2(2 * rc)} m、付け根 ${f2(yCB)} m、頂部の高さ ${f2(P('chimney.top'))} m、z = ${f2(cz)} m`);
    const yH = yCT + CHIMNEY_CAP / 2;
    const pipe = mesh(new THREE.CylinderGeometry(rc + 0.002, rc + 0.002, yH - yCB, 32, 1, true), cm, cInfo);
    pipe.position.set(0, (yCB + yH) / 2, cz);
    add('chimney', pipe);
    const capInfo = info('chimney', cInfo.dims, 'H 笠（内に火の粉止めの網）', 'H 笠');
    const xs = 2 * rc;
    add('chimney', cylAlong(rc * 0.9, V3(-xs, yH, cz), V3(xs, yH, cz), cm, capInfo, 24));
    for (const s of [-1, 1]) {
      const o = mesh(new THREE.CylinderGeometry(rc * 0.9, rc * 0.9, CHIMNEY_CAP, 24, 1, true), cm, capInfo);
      o.position.set(s * xs, yH, cz);
      add('chimney', o);
    }
    // 支持金具。殻の前の妻の頂の枠に留める。
    const yB = Math.min(yR - 1.5 * fr, yCT - 0.05);
    const bInfo = info('chimney', cInfo.dims, '自在支持金具（殻の前の妻の枠に留める）', '支持金具');
    const clamp = mesh(new THREE.TorusGeometry(rc + 0.006, 0.003, 6, 32), cm, bInfo);
    clamp.rotation.x = Math.PI / 2;
    clamp.position.set(0, yB, cz);
    add('chimney', clamp, box(0.02, 0.006, cz - rc - sw2, 0, yB, (cz - rc + sw2) / 2, cm, bInfo));
  }

  // ---- 天板と台
  const tz = P('table.offset_z');
  const TW = P('table.width');
  const TD = P('table.depth');
  const zBack = tz - TD / 2;
  const zFront = tz + TD / 2;
  const deck = P('deck.thickness');
  const jt = P('table.joist');
  const sd = P('table.side');
  const bm = P('table.beam');
  const yJt = yT - deck;                      // 根太の上面
  const yJb = yJt - jt;                       // 根太の下面と側梁の上面
  const ySb = yJb - sd;                       // 側梁の下面と横梁の上面
  const yBb = ySb - bm;                       // 横梁の下面と脚の上端
  const yPad = P('pad.top');
  const yPlateBot = yPad + P('foot.stack');   // 底板の下面
  const yLegBot = yPlateBot + P('foot.plate');
  const legLen = yBb - yLegBot;
  const zF = P('table.front_z');
  const zR = P('table.rear_z');
  const xR = P('table.rear_leg_x');
  const bx = P('table.beam_x');
  const legs = [[0, zF], [-xR, zR], [xR, zR]];
  const zMid = legs.reduce((s, l) => s + l[1], 0) / legs.length;
  const outward = (x, z) => V3(x, 0, z - zMid).normalize();

  {
    const dm = material('slab', { metalness: 0.3, roughness: 0.6 });
    const dInfo = info('slab', `鋼板 ${mm(deck)} mm、${f2(TW)} × ${f2(TD)} m を z = 0 の根太の上で 2 枚に分ける（奥行 ${f2(-zBack)} m と ${f2(zFront)} m）。全面に不織布を敷く`);
    add('slab', box(TW, deck, -zBack - DECK_JOINT / 2, 0, yT - deck / 2, (zBack - DECK_JOINT / 2) / 2, dm, dInfo));
    add('slab', box(TW, deck, zFront - DECK_JOINT / 2, 0, yT - deck / 2, (zFront + DECK_JOINT / 2) / 2, dm, dInfo));
  }

  {
    const st = material('stand', { metalness: 0.3, roughness: 0.6 });
    const zn = material('stand', { color: ZINC, metalness: 0.5, roughness: 0.45 });
    const stDims = `天板の上面は地面から ${f3(yT)} m、梁の下の面 ${f2(yBb)} m、脚の長さ ${f2(legLen)} m、後ろの脚は左右 ±${f2(xR)} m`;
    const sub = (s, m) => info('stand', stDims, m, s);
    // 根太。殻の柱の下と前室の下に置く。
    const nJ = P('table.joist_n');
    let jz = [-sw2, -sw2 / 2, 0, sw2 / 2, sw2, collarZ + ld];
    if (jz.length !== nJ) jz = Array.from({ length: nJ }, (_, i) => zBack + jt + ((zFront - zBack - 2 * jt) * i) / Math.max(1, nJ - 1));
    const jInfo = sub('根太', `角パイプ ${mm(jt)} × ${mm(jt)} × 2.3 を ${nJ} 本（z = ${jz.map(f3).join('、')} m）`);
    for (const z of jz) add('stand', placed(mesh(sqTube(jt, TW, 'x'), st, jInfo), 0, yJb + jt / 2, z));
    const sInfo = sub('側梁', `角パイプ ${mm(sd)} × ${mm(sd)} × 2.3 を x = ±${f2(bx)} m に 2 本（ボルトで留める）`);
    for (const s of [-1, 1]) add('stand', placed(mesh(sqTube(sd, TD - 2 * SIDE_TRIM, 'z'), st, sInfo), s * bx, ySb + sd / 2, tz));
    const fLen = 2 * bx + bm;
    const rLen = 2 * xR + bm;
    add('stand', placed(mesh(sqTube(bm, fLen, 'x'), st, sub('前の横梁', `角パイプ ${mm(bm)} × ${mm(bm)} × 2.3、長さ ${f2(fLen)} m（前の T）`)), 0, yBb + bm / 2, zF));
    add('stand', placed(mesh(sqTube(bm, rLen, 'x'), st, sub('後ろの横梁', `角パイプ ${mm(bm)} × ${mm(bm)} × 2.3、長さ ${f2(rLen)} m（後ろの門形）`)), 0, yBb + bm / 2, zR));
    const lInfo = sub('脚', `角パイプ ${mm(bm)} × ${mm(bm)} × 2.3、長さ ${f2(legLen)} m。上は溶接で固め、方杖は付けない`);
    for (const [x, z] of legs) add('stand', placed(mesh(sqTube(bm, legLen, 'y'), st, lInfo), x, (yBb + yLegBot) / 2, z));
    // 交点の当て板は、横梁の内の面に立てる脚と、側梁の下に入る脚を持つ山形にする。
    const gInfo = sub('交点の当て板', `山形鋼 L50 × 50 × 6、長さ ${f2(GUSSET.len)} m。各部材に M10 を 2 本で留める`);
    for (const s of [-1, 1]) {
      const xc = s * (bx + sd / 2 - GUSSET.len / 2);
      for (const [zb, inw] of [[zF, -1], [zR, 1]]) {
        const zf = zb + inw * bm / 2;
        add('stand', box(GUSSET.len, GUSSET.leg, GUSSET.t, xc, yBb + GUSSET.leg / 2, zf + inw * GUSSET.t / 2, st, gInfo));
        add('stand', box(GUSSET.len, GUSSET.t, GUSSET.leg, xc, ySb - GUSSET.t / 2, zf + inw * GUSSET.leg / 2, st, gInfo));
      }
    }
    // 足は、底板、さや管、M24 の全ねじ、ナット 4 個、座金、敷き板で組む。
    const rr = P('foot.rod') / 2;
    const free = P('foot.free');
    const nh = Math.max(0.005, (P('foot.stack') - SHIM.t - free - WASHER.t) / 4);
    const shimTop = yPad + SHIM.t;
    const nutYs = [shimTop, shimTop + nh, shimTop + 2 * nh + free, shimTop + 3 * nh + free];
    const plW = P('foot.plate_w');
    const fDims = `全ねじ M${mm(2 * rr)}、出し ${mm(free)} mm、据え台の上面から底板の下面まで ${mm(P('foot.stack'))} mm`;
    const plInfo = sub('脚の底板', `平鋼 6 × 100 の ${mm(plW)} mm 角、穴 35 mm。${fDims}`);
    const slInfo = sub('さや管', `SGP 25A、長さ ${f2(SLEEVE.len)} m。${fDims}`);
    const rodInfo = info('stand', fDims, `M${mm(2 * rr)} の全ねじ、ナット、座金（溶融亜鉛めっき）`, '足の金物');
    const shimInfo = sub('敷き板', `鋼板 3.2 mm、${mm(SHIM.w)} mm 角を重ねて ${mm(SHIM.t)} mm、穴 26 mm`);
    for (const [x, z] of legs) {
      const at = (o) => { o.position.x += x; o.position.z += z; return o; };
      add('stand', at(mesh(slabXZ(rectXZ(-plW / 2, plW / 2, -plW / 2, plW / 2), [{ x: 0, z: 0, r: SLEEVE.od / 2 + 0.0005 }], yPlateBot, P('foot.plate')), st, plInfo)));
      add('stand', at(mesh(slabXZ(polyXZ(SLEEVE.od / 2, 24), [{ x: 0, z: 0, r: SLEEVE.id / 2 }], yPlateBot, SLEEVE.len), st, slInfo)));
      add('stand', cylAlong(rr, V3(x, yPad - ROD.intoPad, z), V3(x, yPad - ROD.intoPad + ROD.len, z), zn, rodInfo));
      for (const y of nutYs) add('stand', at(mesh(slabXZ(polyXZ(hexR(NUT24), 6, Math.PI / 6), [{ x: 0, z: 0, r: rr + 0.0005 }], y, nh), zn, rodInfo)));
      add('stand', at(mesh(slabXZ(polyXZ(WASHER.od / 2, 24), [{ x: 0, z: 0, r: WASHER.id / 2 }], shimTop + 4 * nh + free, WASHER.t), zn, rodInfo)));
      add('stand', at(mesh(slabXZ(rectXZ(-SHIM.w / 2, SHIM.w / 2, -SHIM.w / 2, SHIM.w / 2), [{ x: 0, z: 0, r: PAD_HOLE / 2 }], yPad, SHIM.t), st, shimInfo)));
      // 脚の耳。鎖の向きにそろえて、脚の外の面に溶接する。
      const u = outward(x, z);
      const lug = box(LUG.t, LUG.h, LUG.out, x + u.x * (bm / 2 + LUG.out / 2), P('anchor.lug'), z + u.z * (bm / 2 + LUG.out / 2), st,
        sub('脚の耳', `平鋼 6 × 100 を 60 mm に切る（穴 18 mm）。地面から ${f2(P('anchor.lug'))} m の高さに付ける`));
      lug.rotation.y = Math.atan2(u.x, u.z);
      add('stand', lug);
    }
  }

  // ---- 据え台
  {
    const ps = P('pad.size');
    const ph = P('pad.height');
    const pg = P('pad.gravel');
    const pp = P('pad.pit');
    const yPad = P('pad.top');
    const padMat = material('foundation');
    const grMat = material('foundation', { color: GRAVEL });
    const fInfo = info('foundation', `ピンコロ ${f2(ps)} m 角、高さ ${f2(ph)} m、上面は地面から ${f2(yPad)} m、穴 ${f2(pp)} m 角、深さ ${f2(PIT_DEPTH)} m、下に締めた砕石 ${f2(pg)} m`);
    const pit = new THREE.EdgesGeometry(new THREE.BoxGeometry(pp, PIT_DEPTH - 0.002, pp));
    const pitMat = lineMat(0x6b6f73);
    for (const [x, z] of legs) {
      const pad = mesh(slabXZ(rectXZ(-ps / 2, ps / 2, -ps / 2, ps / 2), [{ x: 0, z: 0, r: PAD_HOLE / 2 }], yPad - ph, ph), padMat, fInfo);
      pad.position.set(x, 0, z);
      add('foundation', pad, box(pp, pg, pp, x, yPad - ph - pg / 2, z, grMat, info('foundation', fInfo.dims, '締めた砕石', '砕石')));
      const o = new THREE.LineSegments(pit, pitMat);
      o.position.set(x, -PIT_DEPTH / 2 - 0.002, z);
      add('foundation', o);
    }
  }

  // ---- 風の留め（各脚から外へ水平から anchor.angle で張る。地面の下は全ねじと埋めた平板）
  const slabCenters = [];
  {
    const a = deg(P('anchor.angle'));
    const lugY = P('anchor.lug');
    const depth = P('anchor.depth');
    const sl = P('anchor.slab');
    const n = P('anchor.slabs');
    const am = material('anchor', { metalness: 0.45, roughness: 0.5 });
    const steel = material('anchor', { color: 0x5f6468, metalness: 0.4, roughness: 0.6 });
    const cm = material('anchor', { color: CONCRETE });
    const dGround = ANCHOR.inset + lugY / Math.tan(a);
    const dSlab = ANCHOR.inset + (lugY + depth + ANCHOR.slabT / 2) / Math.tan(a);
    const aDims = `水平から ${P('anchor.angle')}°で張る。全ねじは脚の中心から外へ ${f2(dGround)} m で地面に入る。平板 ${n} 枚の中心は外へ ${f2(dSlab)} m にあり、上の面の深さは ${f2(depth)} m になる`;
    const chainInfo = info('anchor', aDims, 'シャックル、鎖、ターンバックル、アイナット（使用荷重 3.3 kN 以上）', '鎖とターンバックル');
    const rodInfo = info('anchor', aDims, 'M16 の全ねじ（溶融亜鉛めっき、1 m）', '全ねじ');
    const slabInfo = info('anchor', aDims, `コンクリート平板 ${mm(sl)} 角を ${n} 枚、すきま ${mm(ANCHOR.gap)} mm で並べる（厚さ ${mm(ANCHOR.slabT)} mm と置いた）`, '平板');
    const sillInfo = info('anchor', aDims, `受け材（山形鋼 L50 × 50 × 6、${f2(ANCHOR.sill)} m）、角座金とナット 2 個`, '受け材');
    const up = V3(0, 1, 0);
    for (const [x, z] of legs) {
      const u = outward(x, z);
      const dir = V3(u.x * Math.cos(a), -Math.sin(a), u.z * Math.cos(a));
      const p0 = V3(x, lugY, z).addScaledVector(u, ANCHOR.inset);
      const lc = lugY / Math.sin(a);
      const G = p0.clone().addScaledVector(dir, lc);
      const C = p0.clone().addScaledVector(dir, (lugY + depth + ANCHOR.slabT / 2) / Math.sin(a));
      slabCenters.push(C);
      const at = (s) => p0.clone().addScaledVector(dir, s);
      // 地面の上：シャックル、鎖、ターンバックル、アイナット
      const qDir = new THREE.Quaternion().setFromUnitVectors(up, dir);
      const qTurn = new THREE.Quaternion().setFromAxisAngle(dir, Math.PI / 2);
      const ring = (r, tube, s, turn) => {
        const g = new THREE.TorusGeometry(r, tube, 6, 18);
        g.scale(1, 1.5, 1);
        const o = mesh(g, am, chainInfo);
        o.quaternion.copy(turn ? qTurn.clone().multiply(qDir) : qDir);
        o.position.copy(at(s));
        o.userData.noCap = true;
        return o;
      };
      add('anchor', ring(0.012, 0.004, 0.015, false));
      const linkPitch = 0.022;
      const c0 = 0.04;
      const c1 = lc * 0.42;
      let k = 0;
      for (let s = c0; s < c1; s += linkPitch, k++) add('anchor', ring(0.009, 0.0028, s, k % 2 === 1));
      const t0 = c1 + 0.01;
      const t1 = lc - 0.06;
      const body = cylAlong(0.011, at(t0 + (t1 - t0) * 0.25), at(t0 + (t1 - t0) * 0.75), am, chainInfo, 12);
      const screw = cylAlong(0.005, at(t0), at(t1), am, chainInfo, 8);
      body.userData.noCap = true;
      screw.userData.noCap = true;
      add('anchor', body, screw, ring(0.012, 0.004, lc - 0.035, true), ring(0.016, 0.005, lc - 0.012, false));
      // 地面の下：全ねじ、平板、受け材、角座金とナット
      const tail = ANCHOR.slabT / 2 + GUSSET.leg + 0.006 + 0.03;
      add('anchor', cylAlong(ANCHOR.rod / 2, at(lc - 0.03), C.clone().addScaledVector(dir, tail), am, rodInfo, 12));
      const v = V3(-u.z, 0, u.x);
      const w = v.clone().cross(dir).normalize();
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * (sl + ANCHOR.gap);
        add('anchor', orientedBox([sl, ANCHOR.slabT, sl], [v, dir, w], C.clone().addScaledVector(v, off), cm, slabInfo));
      }
      const cb = C.clone().addScaledVector(dir, ANCHOR.slabT / 2);
      add('anchor', orientedBox([ANCHOR.sill, 0.006, GUSSET.leg], [v, dir, w], cb.clone().addScaledVector(dir, 0.003), steel, sillInfo));
      add('anchor', orientedBox([ANCHOR.sill, GUSSET.leg, 0.006], [v, dir, w], cb.clone().addScaledVector(dir, GUSSET.leg / 2).addScaledVector(w, GUSSET.leg / 2 - 0.003), steel, sillInfo));
      add('anchor', orientedBox([0.05, 0.006, 0.05], [v, dir, w], cb.clone().addScaledVector(dir, 0.009), steel, sillInfo));
      for (let j = 0; j < 2; j++) {
        const s0 = 0.012 + j * 0.013;
        const nut = cylAlong(hexR(0.024), cb.clone().addScaledVector(dir, s0), cb.clone().addScaledVector(dir, s0 + 0.013), steel, sillInfo, 6);
        nut.userData.noCap = true;
        add('anchor', nut);
      }
    }
  }

  // ---- 凍結深度
  const ext = [...legs.map(([x, z]) => V3(x, 0, z)), ...slabCenters];
  const minX = Math.min(...ext.map((p) => p.x)) - 0.5;
  const maxX = Math.max(...ext.map((p) => p.x)) + 0.5;
  const minZ = Math.min(zBack, ...ext.map((p) => p.z)) - 0.5;
  const maxZ = Math.max(zFront, ...ext.map((p) => p.z)) + 0.5;
  const frost = P('frost.depth');
  if (frost != null) {
    const fp = mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
      material('frost', { transparent: true, opacity: 0.35, depthWrite: false }),
      info('frost', `地面から ${f2(frost)} m`));
    fp.rotation.x = -Math.PI / 2;
    fp.position.set((minX + maxX) / 2, -frost, (minZ + maxZ) / 2);
    fp.castShadow = false;
    add('frost', fp);
  }

  // ---- 薪置き（目安）。台の下の前の右の隅に置き、炉床の真下と前室の下を避ける。
  {
    const wm = material('wood');
    const wInfo = info('wood', `長さ ${f2(WOOD.len)} m の薪。中心から 0.45 m より外の隅で、天板から 0.25 m 以上離す（仮）`);
    for (let row = 0; row < WOOD.rows; row++) {
      for (let i = 0; i < 2 - (row % 2); i++) {
        const lg = mesh(new THREE.CylinderGeometry(WOOD.r, WOOD.r, WOOD.len, 10), wm, wInfo);
        lg.rotation.x = Math.PI / 2;
        lg.position.set(WOOD.x0 + WOOD.r * (1 + 2 * i + (row % 2)), WOOD.r + row * WOOD.r * 1.75, WOOD.z0 + WOOD.len / 2);
        add('wood', lg);
      }
    }
  }

  // ---- 人
  {
    const hp = P('person.height');
    const pm = material('person');
    const pInfo = info('person', `背丈 ${f2(hp)} m`);
    const body = mesh(new THREE.CapsuleGeometry(0.17, hp * 0.85 - 0.34, 6, 16), pm, pInfo);
    body.position.set(-(xR + 0.35), (hp * 0.85) / 2, zFront + 0.5);
    const head = mesh(new THREE.SphereGeometry(0.11, 20, 14), pm, pInfo);
    head.position.set(body.position.x, hp - 0.11, body.position.z);
    add('person', body, head);
  }

  // ---- 表に出す値
  const dGround = ANCHOR.inset + P('anchor.lug') / Math.tan(deg(P('anchor.angle')));
  const dSlab = ANCHOR.inset + (P('anchor.lug') + P('anchor.depth') + ANCHOR.slabT / 2) / Math.tan(deg(P('anchor.angle')));
  const rows = [
    ['型式', TYPE_LABEL.cast, '算出', true],
    ['炉床の面の高さ', `${f2(yFloor)} m`],
    ['炉床の四角', `${f3(hw)} × ${f2(hd)} m（${HEARTH_COLS} 列 × ${HEARTH_ROWS} 個）`],
    ['ドームの内の炉床の面積', `${f2(Math.PI * R * R)} m²`],
    ['ドームの内径と内高', `${f2(2 * R)} m、${f2(H)} m`],
    ['ドームの外の半径、毛布の外の半径', `${f3(Ro)} m、${f3(rIns)} m`],
    ['ドームの足の下の面', `${f3(yBase)} m`],
    ['焚き口', `幅 ${f2(2 * dHalf)} m、高さ ${f2(dH)} m`],
    ['前室の前の面の z', `${f3(zLF)} m`],
    ['殻の軒と棟', `${f2(yE)} m、${f2(yR)} m`],
    ['殻の屋根の流れの長さ', `${f3(flow)} m`],
    ['天板の大きさ', `${f2(TW)} × ${f2(TD)} m（z ${f2(zBack)}〜${f2(zFront)} m）`],
    ['梁の下の面の高さ（雪を下ろす目安）', `${f2(yBb)} m`],
    ['脚の長さ', `${f2(legLen)} m`],
    ['後ろの横梁と前の横梁の長さ', `${f2(2 * xR + bm)} m、${f2(2 * bx + bm)} m`],
    ['煙突の付け根と頂', `${f2(yCB)} m、${f2(P('chimney.top'))} m`],
    ['全ねじが地面に入る所（脚の中心から外へ）', `${f2(dGround)} m`],
    ['平板の中心（脚の中心から外へ、深さ）', `${f2(dSlab)} m、${f2(P('anchor.depth') + ANCHOR.slabT / 2)} m`],
    ...CALC_ROWS,
  ];

  return {
    yFloor, outerTop: yR, centerZ: tz, outerD: zLF - (-sw2 - ov), span: Math.max(2 * xR + 0.4, TD, P('chimney.top')),
    rows,
  };
}

// ---------- レンガのドーム（前の第一案、参考）
// ref.* の鍵で、ドーム、断熱、外殻、炉床、前室、天板と 4 本の脚だけを描く。天秤とピンは描かない。
// 焚き口は、今の焚き口を内径と内高の比で大きくして描く（参考の図のための決まり）。

function buildBrick(ctx) {
  const { groups, info } = ctx;
  const add = (key, ...objs) => { groups[key].add(...objs); return objs[0]; };
  const refInfo = (key, dims, mat) => info(key, dims, `${mat}。前の第一案の形を参考に描く`);

  const yT = P('ref.table_top');
  const hi = P('ref.hearth_ins');
  const th = P('ref.hearth');
  const yIns1 = yT + hi;
  const yFloor = yIns1 + th;
  const R = P('ref.inner_diameter') / 2;
  const H = P('ref.inner_height');
  const wall = P('ref.wall');
  const offs = [0, wall, wall + P('ref.insulation'), wall + P('ref.insulation') + P('ref.shell')];
  const Ro = R + offs[3];
  const zBack = -Ro;
  const outerTop = yFloor + H + offs[3];

  const halfW = (P('door.width') / 2) * (2 * R / P('dome.inner_diameter'));
  const dHt = P('door.height') * (H / P('dome.inner_height'));
  const door = { halfW, height: dHt, spring: Math.max(0, dHt - halfW) };
  const win = { arch: { halfW, spring: yFloor + door.spring, bottom: yFloor - th - 0.01, z0: 0 } };

  // 焚き口の縁のうち、内面で最も手前に来ない点の z を求める。前室はここから始める。
  let zDoorIn = R;
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI;
    const pts = [[halfW, door.spring * (i / 32)], [halfW * Math.cos(a), door.spring + halfW * Math.sin(a)]];
    for (const [x, y] of pts) {
      const z2 = R * R - x * x - (R * R / (H * H)) * y * y;
      zDoorIn = Math.min(zDoorIn, Math.sqrt(Math.max(z2, 0)));
    }
  }

  const hearth = mesh(new THREE.CylinderGeometry(R, R, th - GAP, 96), material('hearth'),
    refInfo('hearth', `直径 ${f2(2 * R)} m、厚さ ${f3(th)} m`, '耐火粘土レンガを縦に立てて並べる'));
  hearth.position.set(0, yIns1 + GAP + (th - GAP) / 2, 0);
  add('hearth', hearth);

  const layers = [
    ['chamber', 0, 1, `内径 ${f2(2 * R)} m、内高 ${f2(H)} m、厚さ ${f3(wall)} m`, '耐火粘土レンガの窯壁'],
    ['insulation', 1, 2, `厚さ ${f3(offs[2] - offs[1])} m`, '毛布 25 mm とパーライト 75 mm の断熱'],
    ['shell', 2, 3, `厚さ ${f3(offs[3] - offs[2])} m、外径 ${f2(2 * Ro)} m`, '左官の外殻'],
  ];
  for (const [key, i0, i1, dims, matText] of layers) {
    const b = i1 < 3 ? offs[i1] - GAP : offs[i1];
    const g = mesh(domeShell(R, H, offs[i0], b, th), cutWindow(material(key, key === 'chamber' ? { color: 0xc8734a } : {}), win), refInfo(key, dims, matText));
    g.position.y = yFloor;
    add(key, g);
  }

  // 前室と焚き口
  const ldp = P('ref.landing_depth');
  const zFront = Ro + ldp;
  const tunW = 2 * (halfW + wall);
  const tunH = dHt + wall;
  const tunLen = zFront - zDoorIn;
  const lmat = material('landing', { color: 0xd08a5f });
  const lInfo = refInfo('landing', `焚き口 幅 ${f2(2 * halfW)} m、高さ ${f2(dHt)} m、前室の奥行 ${f2(ldp)} m`, 'レンガの前室');
  const tunnel = mesh(extrude(withDoorNotch((s) => {
    s.moveTo(-tunW / 2, 0);
    s.lineTo(-tunW / 2, tunH);
    s.lineTo(tunW / 2, tunH);
    s.lineTo(tunW / 2, 0);
  }, door), tunLen), lmat, lInfo);
  tunnel.position.set(0, yFloor, zDoorIn);
  add('landing', tunnel, box(tunW, th, tunLen, 0, yIns1 + th / 2 - 0.002, zDoorIn + tunLen / 2, lmat, lInfo));

  // 扉は焼き室と前室の境に置く。
  const dt = P('door.thickness');
  const ds = new THREE.Shape();
  ds.moveTo(-(halfW - GAP), GAP);
  ds.lineTo(-(halfW - GAP), door.spring);
  ds.absarc(0, door.spring, halfW - GAP, Math.PI, 0, true);
  ds.lineTo(halfW - GAP, GAP);
  ds.closePath();
  const dm = mesh(extrude(ds, dt), material('door'), refInfo('door', `幅 ${f2(2 * halfW)} m、高さ ${f2(dHt)} m`, '扉'));
  dm.position.set(0, yFloor, Ro - dt);
  add('door', dm);

  // 煙突は前室の上に立てる。
  const rc = P('chimney.diameter') / 2;
  const yCB = yFloor + tunH;
  const yCT = P('chimney.top');
  const chim = mesh(new THREE.CylinderGeometry(rc + 0.002, rc + 0.002, yCT - yCB, 32, 1, true),
    material('chimney', { metalness: 0.4, roughness: 0.5 }), refInfo('chimney', `内径 ${f2(2 * rc)} m、頂部の高さ ${f2(yCT)} m`, '煙突'));
  chim.position.set(0, (yCB + yCT) / 2, zFront - ldp / 2);
  add('chimney', chim);

  // 炉床の下の断熱、天板、4 本の脚
  const centerZ = (zBack + zFront) / 2;
  add('hearthIns', box(2 * Ro, hi - GAP, zFront - zBack, 0, yT + GAP + (hi - GAP) / 2, centerZ,
    material('hearthIns'), refInfo('hearthIns', `厚さ ${f3(hi)} m`, 'セメントとパーライトの断熱')));
  const tw = P('ref.table_w');
  const td = P('ref.table_d');
  const deck = P('deck.thickness');
  add('slab', box(tw, deck, td, 0, yT - deck / 2, centerZ, material('slab', { metalness: 0.3, roughness: 0.6 }),
    refInfo('slab', `${f3(tw)} × ${f3(td)} m、上面は地面から ${f3(yT)} m`, '天板')));
  const bm = P('table.beam');
  const st = material('stand', { metalness: 0.3, roughness: 0.6 });
  const sInfo = refInfo('stand', `天板の下に 4 本の脚を描く。天板の上面は地面から ${f3(yT)} m にある`, '簡単な脚（図のための形）');
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const o = mesh(sqTube(bm, yT - deck, 'y'), st, sInfo);
      o.position.set(sx * (tw / 2 - 1.5 * bm), (yT - deck) / 2, centerZ + sz * (td / 2 - 1.5 * bm));
      add('stand', o);
    }
  }

  const frost = P('frost.depth');
  if (frost != null) {
    const fp = mesh(new THREE.PlaneGeometry(tw + 1.5, td + 1.5),
      material('frost', { transparent: true, opacity: 0.35, depthWrite: false }), info('frost', `地面から ${f2(frost)} m`));
    fp.rotation.x = -Math.PI / 2;
    fp.position.set(0, -frost, centerZ);
    fp.castShadow = false;
    add('frost', fp);
  }

  const hp = P('person.height');
  const pm = material('person');
  const pInfo = info('person', `背丈 ${f2(hp)} m`);
  const body = mesh(new THREE.CapsuleGeometry(0.17, hp * 0.85 - 0.34, 6, 16), pm, pInfo);
  body.position.set(-(tw / 2 + 0.7), (hp * 0.85) / 2, centerZ + td / 2 + 0.4);
  const head = mesh(new THREE.SphereGeometry(0.11, 20, 14), pm, pInfo);
  head.position.set(body.position.x, hp - 0.11, body.position.z);
  add('person', body, head);

  const rows = [
    ['型式', TYPE_LABEL.brick, '算出', true],
    ['炉床の面の高さ', `${f2(yFloor)} m`],
    ['炉床の形', `直径 ${f2(2 * R)} m の円`],
    ['炉床の面積', `${f2(Math.PI * R * R)} m²`],
    ['窯の内高', `${f2(H)} m`],
    ['焚き口（図）', `幅 ${f2(2 * halfW)} m、高さ ${f2(dHt)} m`],
    ['窯の外形', `幅 ${f2(2 * Ro)} m、奥行 ${f2(zFront - zBack)} m、頂部 ${f2(outerTop)} m`],
    ['天板の大きさ', `${f3(tw)} × ${f3(td)} m`],
    ...BRICK_ROWS,
  ];
  return { yFloor, outerTop, centerZ, outerD: zFront - zBack, span: Math.max(tw, td, 2.2), rows };
}

// ---------- 組み替えと表示

let current = null;

function disposeTree(o) {
  o.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
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
  syncPartList();
  applyShellFade();
  applySection();
  renderDerived(b.d);
  renderParams();
  for (const btn of document.querySelectorAll('#type button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.type === state.type));
  }
  for (const id of ['doorState', 'apron']) if ($(id)) $(id).disabled = state.type !== 'cast';
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
      // 断面の蓋は薄くしない（透かすと描く順が変わり、stencil の数がずれる）。蓋は syncCaps で隠す。
      setGlow(o.material, on, keys.length > 0 && !o.userData.passThrough);
    });
    if (on) box.expandByObject(current.groups[p.key]);
  }
  syncCaps();
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

// 図に形の無い部品（型式で使わない部品）は一覧から外す。
function syncPartList() {
  for (const inp of document.querySelectorAll('#parts input[data-part]')) {
    inp.closest('label').style.display = current.groups[inp.dataset.part].children.length ? '' : 'none';
  }
}

function applySection() {
  for (const m of current.mats) {
    m.clippingPlanes = state.section && !m.userData.noClip ? [cutPlane] : [];
    m.needsUpdate = true;
  }
  syncCaps();
  for (const o of current.sectionOnly) o.visible = state.section;
}

// 断面の蓋を見せるかを決める。透かした殻の蓋と、まわりを透かすときの光らせない部品の蓋は隠す。
function syncCaps() {
  if (!current) return;
  const keys = focusKeys.filter((k) => current.groups[k]);
  const dimOthers = state.fade && keys.length > 0;
  for (const o of current.caps.objs) {
    const p = o.userData.part;
    o.visible = state.section && !(state.shellFade && p === 'shell') && !(dimOthers && !keys.includes(p));
  }
}

// 殻を透かす。殻の材料を薄くし、影を落とさず、押しても選ばないようにする。
function applyShellFade() {
  if (!current) return;
  const on = state.shellFade;
  current.groups.shell.traverse((o) => {
    if (!(o.isMesh || o.isLine) || o.userData.passThrough) return;
    const m = o.material;
    if (!m.userData.shellBase) m.userData.shellBase = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite };
    const b = m.userData.shellBase;
    const v = { transparent: on || b.transparent, opacity: on ? Math.min(b.opacity, 0.15) : b.opacity, depthWrite: on ? false : b.depthWrite };
    Object.assign(m, v);
    if (m.userData.emBase) Object.assign(m.userData.emBase, v);
    m.needsUpdate = true;
    if (o.isMesh) o.castShadow = !on;
  });
}

function applySeeThrough() {
  groundMat.opacity = state.seeThrough ? 0.3 : 1;
  groundMat.depthWrite = !state.seeThrough;
  groundMat.needsUpdate = true;
}

// ---------- 見る向き

function setView(name) {
  const d = current.d;
  const cy = ((d.yFloor + d.outerTop) / 2) * 0.8;
  const target = new THREE.Vector3(0, cy, d.centerZ);
  const span = d.span;
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

// 行は [名, 値, 状態, 折り返すか] の形にする。長い値は折り返す。
function renderDerived(d) {
  $('derived').innerHTML = d.rows.map(([k, v, c = '算出', wrap = false]) => {
    const w = wrap || String(v).length > 14;
    return `<tr><td>${k}</td><td${w ? '' : ' class="num"'}>${v}</td><td>${chip(c)}</td></tr>`;
  }).join('');
}

const fullName = (inf) => (inf.sub ? `${inf.name}（${inf.sub}）` : inf.name);

function renderInfo(inf) {
  if (!inf) {
    $('info').innerHTML = '<span class="muted">図の部品をクリックすると、材料と寸法が出ます。</span>';
    return;
  }
  $('info').innerHTML = `<div class="name">${fullName(inf)}</div><div>${inf.mat}</div><div class="muted">${inf.dims}</div>`;
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

// 左の欄の型式のボタンと、殻を透かす、前掛け、扉の開け幅の切替をそろえる（index.html に無ければ足す）。
function setupControls() {
  const seg = $('type');
  const want = Object.keys(TYPE_LABEL);
  const have = [...seg.querySelectorAll('button[data-type]')].map((b) => b.dataset.type);
  if (have.length !== want.length || !want.every((k) => have.includes(k))) {
    seg.innerHTML = want.map((k) => `<button type="button" data-type="${k}">${TYPE_BUTTON[k]}</button>`).join('');
  }
  const tg = document.querySelector('aside .toggles');
  if (!tg) return;
  if (!$('shellFade')) tg.insertAdjacentHTML('beforeend', '<label><input type="checkbox" id="shellFade"> 殻を透かす</label>');
  if (!$('apron')) tg.insertAdjacentHTML('beforeend', '<label><input type="checkbox" id="apron"> 焚き口の前掛けを掛ける</label>');
  if (!$('doorState')) {
    const opts = Object.entries(DOOR_STATES).map(([k, s]) => `<option value="${k}">${s.label}</option>`).join('');
    tg.insertAdjacentHTML('afterend', `<h2>扉の開け幅</h2><select id="doorState" style="width:100%;font:inherit;padding:5px 6px;border:1px solid var(--line);border-radius:6px;background:var(--panel);color:var(--ink)">${opts}</select>`);
  }
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
    .filter((h) => !h.object.userData.passThrough)
    .filter((h) => !(state.shellFade && h.object.userData.info && h.object.userData.info.key === 'shell'))
    .filter((h) => !(h.object.material.userData.win && inWindow(h.object.material.userData.win, h.point.x, h.point.y, h.point.z)));
  return hits.length ? hits[0] : null;
}

canvas.addEventListener('pointermove', (ev) => {
  const h = pick(ev);
  const tip = $('tip');
  if (!h) { tip.style.display = 'none'; return; }
  const r = canvas.getBoundingClientRect();
  tip.textContent = fullName(h.object.userData.info);
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
setupControls();

$('type').addEventListener('click', (e) => {
  const tp = e.target.dataset.type;
  if (!tp || tp === state.type || !(tp in TYPE_LABEL)) return;
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
if ($('shellFade')) $('shellFade').addEventListener('change', (e) => { state.shellFade = e.target.checked; applyShellFade(); applySection(); applyFocus(false); });
if ($('apron')) $('apron').addEventListener('change', (e) => { state.apron = e.target.checked; rebuild(); });
if ($('doorState')) $('doorState').addEventListener('change', (e) => { state.door = e.target.value in DOOR_STATES ? e.target.value : 'plug'; rebuild(); });

// URL の ?type=brick&section=1&view=side&door=q2&apron=1&shellFade=1 で初期状態を指定できる。
const q = new URLSearchParams(location.search);
if (q.get('type') in TYPE_LABEL) state.type = q.get('type');
if (q.get('section') === '1') { state.section = true; $('section').checked = true; }
if (q.get('door') in DOOR_STATES) state.door = q.get('door');
if (q.get('apron') === '1') state.apron = true;
if (q.get('shellFade') === '1') state.shellFade = true;
if ($('doorState')) $('doorState').value = state.door;
if ($('apron')) $('apron').checked = state.apron;
if ($('shellFade')) $('shellFade').checked = state.shellFade;

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
