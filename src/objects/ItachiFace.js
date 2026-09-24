import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { sharinganTexture } from '../core/utils.js';

/*
 * Realistic skin and a living face for the GLB Itachi:
 *  - skinMaterial(): physically based cloth + skin, with the skin found by colour in the texture and given
 *    wrap-around subsurface scattering, red back-scatter, a skin specular and gentle smoothing; cloth gets a fibre sheen
 *  - FaceFX: eyes (sclera, rotating Sharingan / Mangekyō iris, lash line) and blood trails, built as
 *    decals cut from the face mesh itself and skinned to the same skeleton, so they follow every pose
 */

let _env = null;

/** Soft studio lighting for image-based fill on the model (built once per renderer). */
export function setItachiEnvironment(renderer) {
  if (_env || !renderer) return;
  const pm = new THREE.PMREMGenerator(renderer);
  _env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
}

/* ------------------------------------------------------------------ */
/* Skin + cloth                                                        */
/* ------------------------------------------------------------------ */

const SKIN_PARS = /* glsl */`
float gSkin = 0.0;
`;
const SKIN_DETECT = /* glsl */`
#include <map_fragment>
{
  // skin = warm, moderately saturated, fairly light texels (the cloak's reds / blacks / greys are excluded)
  vec3 sc = pow( max( diffuseColor.rgb, vec3( 1e-4 ) ), vec3( 0.4545 ) );
  float mx = max( sc.r, max( sc.g, sc.b ) ), mn = min( sc.r, min( sc.g, sc.b ) );
  float sat = ( mx - mn ) / max( mx, 1e-3 );
  gSkin = smoothstep( 0.40, 0.55, sc.r ) * smoothstep( 0.04, 0.11, sat ) * ( 1.0 - smoothstep( 0.40, 0.55, sat ) )
        * step( sc.b, sc.g + 0.03 ) * step( sc.g, sc.r + 0.01 );
  #ifdef USE_MAP
  if ( gSkin > 0.01 ) {
    // smooth out compression blotches on the skin only
    vec2 px = 1.3 / vec2( textureSize( map, 0 ) );
    vec3 blur = ( texture2D( map, vMapUv + vec2( px.x, 0.0 ) ).rgb + texture2D( map, vMapUv - vec2( px.x, 0.0 ) ).rgb
                + texture2D( map, vMapUv + vec2( 0.0, px.y ) ).rgb + texture2D( map, vMapUv - vec2( 0.0, px.y ) ).rgb ) * 0.25;
    diffuseColor.rgb = mix( diffuseColor.rgb, blur * diffuse, gSkin * 0.55 );
  }
  #endif
  // living skin tone: a touch warmer, blood under the surface
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.05, 0.97, 0.93 ), gSkin );
}
`;
const SKIN_ROUGH = /* glsl */`
#include <roughnessmap_fragment>
roughnessFactor = mix( roughnessFactor, 0.46, gSkin );
`;
const SKIN_LIGHTS = /* glsl */`
#include <lights_physical_fragment>
material.specularF90 = mix( material.specularF90, 0.7, gSkin );
`;
// subsurface: light wraps past the terminator and bleeds red, thin parts glow when backlit
const DIRECT_FIND = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';
const DIRECT_SSS = /* glsl */`
reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
if ( gSkin > 0.0 ) {
  float nl = dot( geometryNormal, directLight.direction );
  float wrapNL = saturate( ( nl + 0.5 ) / 1.5 );
  vec3 scatter = vec3( 1.0, 0.38, 0.26 ) * max( wrapNL - saturate( nl ), 0.0 ) * 0.85;
  float back = pow( saturate( dot( geometryViewDir, - directLight.direction ) ), 4.0 ) * 0.35;
  reflectedLight.directDiffuse += gSkin * ( scatter + back * vec3( 1.0, 0.25, 0.15 ) ) * directLight.color * BRDF_Lambert( material.diffuseColor );
} else {
  // cloth: a soft fibre sheen toward grazing angles (a cheap stand-in for a full sheen lobe)
  float fres = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 3.0 );
  reflectedLight.directSpecular += irradiance * fres * 0.22 * vec3( 0.55, 0.52, 0.6 );
}
`;

/** Converts a glTF material into realistic skin/cloth, keeping its textures. */
export function skinMaterial(m) {
  if (Array.isArray(m)) return m.map(skinMaterial);
  if (!m || m.isShaderMaterial) return m;
  const t = new THREE.MeshStandardMaterial({
    name: m.name,
    color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
    map: m.map || null,
    normalMap: m.normalMap || null,
    alphaMap: m.alphaMap || null,
    transparent: m.transparent,
    alphaTest: m.alphaTest,
    opacity: m.opacity,
    side: m.side,
    roughness: 0.82,
    metalness: 0,
    envMap: _env,
    envMapIntensity: 0.32,
  });
  if (t.map) t.map.anisotropy = 4;
  t.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', SKIN_PARS + '#include <lights_physical_pars_fragment>')
      .replace('#include <map_fragment>', SKIN_DETECT)
      .replace('#include <roughnessmap_fragment>', SKIN_ROUGH)
      .replace('#include <lights_physical_fragment>', SKIN_LIGHTS);
    // the direct-light function lives inside an include, so expand it first
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>',
      THREE.ShaderChunk.lights_physical_pars_fragment.replace(DIRECT_FIND, DIRECT_SSS));
  };
  t.customProgramCacheKey = () => 'itachi-skin-2';
  return t;
}

/* ------------------------------------------------------------------ */
/* Decals cut from the face mesh                                       */
/* ------------------------------------------------------------------ */

/**
 * Copies the triangles of `mesh` inside the ellipses (front-facing only) into a new skinned mesh on the
 * same skeleton. Each region gets planar UVs: u across (mirrored for the right side so the inner corner
 * is always u=0), v up.
 */
function cutDecal(mesh, regions, lift, material) {
  const g = mesh.geometry;
  const P = g.attributes.position, N = g.attributes.normal;
  const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const index = g.index ? g.index.array : null;
  const triCount = index ? index.length / 3 : P.count / 3;
  const vi = (t, k) => (index ? index[t * 3 + k] : t * 3 + k);

  const pos = [], nrm = [], uv = [], si = [], sw = [];
  for (const r of regions) {
    const map = new Map();
    const inside = (i) => {
      const dx = (P.getX(i) - r.cx) / r.rx, dy = (P.getY(i) - r.cy) / r.ry;
      return r.rect ? Math.abs(dx) <= 1 && Math.abs(dy) <= 1 : dx * dx + dy * dy <= 1;
    };
    const front = (i) => P.getZ(i) > r.cz - 0.05 && N.getZ(i) > 0.05;
    for (let t = 0; t < triCount; t++) {
      const a = vi(t, 0), b = vi(t, 1), c = vi(t, 2);
      if (!(front(a) && front(b) && front(c))) continue;
      if (!(inside(a) || inside(b) || inside(c))) continue;
      for (const i of [a, b, c]) {
        let j = map.get(i);
        if (j === undefined) {
          j = pos.length / 3;
          map.set(i, j);
          const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
          pos.push(P.getX(i) + nx * lift, P.getY(i) + ny * lift, P.getZ(i) + nz * lift);
          nrm.push(nx, ny, nz);
          const du = (P.getX(i) - r.cx) / (2 * (r.uvRx || r.rx));
          uv.push(0.5 + (r.mirror ? -du : du), (P.getY(i) - r.y0) / (r.y1 - r.y0));
          si.push(SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i));
          sw.push(SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i));
        }
        r.out = r.out || [];
        r.out.push(j);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(regions.flatMap((r) => r.out || []));
  const d = new THREE.SkinnedMesh(geo, material);
  d.position.copy(mesh.position);
  d.quaternion.copy(mesh.quaternion);
  d.scale.copy(mesh.scale);
  d.bind(mesh.skeleton, mesh.bindMatrix);
  d.frustumCulled = false;
  return d;
}

const decalMat = (Ctor, opts) => new Ctor({
  transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  envMap: _env, envMapIntensity: 0.5, ...opts,
});

/* ---------------- painted layers ---------------- */

// eye shape in 0..1 canvas space (inner corner left, outer right, y down)
const IN = [0.13, 0.56], OUT = [0.9, 0.44];
function almond(x, W, H) {
  x.beginPath();
  x.moveTo(IN[0] * W, IN[1] * H);
  x.bezierCurveTo(0.3 * W, 0.25 * H, 0.66 * W, 0.2 * H, OUT[0] * W, OUT[1] * H);
  x.bezierCurveTo(0.72 * W, 0.76 * H, 0.36 * W, 0.8 * H, IN[0] * W, IN[1] * H);
  x.closePath();
}
function canvas(W, H) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return [c, c.getContext('2d')];
}
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

function scleraTexture(W, H) {
  const [c, x] = canvas(W, H);
  almond(x, W, H);
  x.save();
  x.clip();
  const g = x.createRadialGradient(0.5 * W, 0.5 * H, 0, 0.5 * W, 0.5 * H, 0.45 * W);
  g.addColorStop(0, '#d6ccc6');
  g.addColorStop(0.55, '#bfb2ac');
  g.addColorStop(1, '#7d6964');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // faint vessels toward the corners
  x.strokeStyle = 'rgba(170,60,60,0.18)';
  x.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? IN : OUT;
    x.beginPath();
    x.moveTo(side[0] * W, (side[1] + (Math.random() - 0.5) * 0.2) * H);
    x.quadraticCurveTo(0.5 * W, (0.3 + Math.random() * 0.5) * H, (side === IN ? 0.3 : 0.7) * W + (Math.random() - 0.5) * 30, (0.35 + Math.random() * 0.3) * H);
    x.stroke();
  }
  // caruncle
  const cg = x.createRadialGradient(IN[0] * W + 8, IN[1] * H, 0, IN[0] * W + 8, IN[1] * H, 16);
  cg.addColorStop(0, 'rgba(190,110,110,0.9)');
  cg.addColorStop(1, 'rgba(190,110,110,0)');
  x.fillStyle = cg;
  x.fillRect(0, 0, W, H);
  x.restore();
  return tex(c);
}

function almondMask(W, H) {
  const [c, x] = canvas(W, H);
  x.fillStyle = '#000';
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff';
  almond(x, W, H);
  x.fill();
  return tex(c, false);
}

function lidTexture(W, H) {
  const [c, x] = canvas(W, H);
  // shadow the upper lid casts on the eyeball
  x.save();
  almond(x, W, H);
  x.clip();
  const sg = x.createLinearGradient(0, 0.2 * H, 0, 0.58 * H);
  sg.addColorStop(0, 'rgba(25,10,10,0.85)');
  sg.addColorStop(1, 'rgba(25,10,10,0)');
  x.fillStyle = sg;
  x.fillRect(0, 0, W, H);
  // soft corners
  const cg = x.createRadialGradient(0.5 * W, 0.5 * H, 0.2 * W, 0.5 * W, 0.5 * H, 0.46 * W);
  cg.addColorStop(0, 'rgba(30,12,12,0)');
  cg.addColorStop(1, 'rgba(30,12,12,0.55)');
  x.fillStyle = cg;
  x.fillRect(0, 0, W, H);
  x.restore();
  // upper lash line: thick in the middle, a sharp flick past the outer corner
  x.fillStyle = '#120a0b';
  x.beginPath();
  x.moveTo(IN[0] * W - 2, IN[1] * H + 1);
  x.bezierCurveTo(0.3 * W, 0.25 * H, 0.66 * W, 0.2 * H, OUT[0] * W, OUT[1] * H);
  x.lineTo(0.985 * W, 0.37 * H);
  x.bezierCurveTo(0.8 * W, 0.26 * H, 0.66 * W, 0.04 * H, 0.3 * W, 0.11 * H);
  x.quadraticCurveTo(0.18 * W, 0.2 * H, IN[0] * W - 2, IN[1] * H + 1);
  x.fill();
  // crease (Itachi's heavy-lidded look)
  x.strokeStyle = 'rgba(70,35,35,0.55)';
  x.lineWidth = H * 0.025;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(0.28 * W, 0.04 * H);
  x.bezierCurveTo(0.5 * W, -0.04 * H, 0.75 * W, 0.02 * H, 0.93 * W, 0.2 * H);
  x.stroke();
  // lower lid
  x.strokeStyle = 'rgba(80,40,40,0.6)';
  x.lineWidth = H * 0.028;
  x.beginPath();
  x.moveTo(0.42 * W, 0.83 * H);
  x.bezierCurveTo(0.6 * W, 0.82 * H, 0.75 * W, 0.72 * H, OUT[0] * W, OUT[1] * H);
  x.stroke();
  return tex(c);
}

/**
 * Blood trail data: R = coverage, G = distance along the flow (0 under the lid → 1 at the end).
 * Streams start under the lower lid (hidden by the eye decal) so they seem to well out of the eye.
 */
function bloodTexture(W = 128, H = 256, seed = 1) {
  const [c, x] = canvas(W, H);
  x.fillStyle = '#000';
  x.fillRect(0, 0, W, H);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const streams = [
    { u: 0.47 + rnd() * 0.06, len: 0.82, w: 0.13 },
    { u: 0.66 + rnd() * 0.05, len: 0.4 + rnd() * 0.15, w: 0.075 },
  ];
  // a thin wet line along the lid
  x.fillStyle = 'rgb(255,0,0)';
  x.beginPath();
  x.ellipse(0.55 * W, 0.02 * H, 0.3 * W, 0.03 * H, 0, 0, Math.PI * 2);
  x.fill();
  for (const st of streams) {
    let u = st.u;
    const steps = 140;
    let v = 0;
    for (let k = 0; k <= steps; k++) {
      const f = k / steps;
      v = 0.01 + f * st.len * 0.9;
      u += (rnd() - 0.5) * 0.004 + Math.sin(f * 7 + st.u * 17) * 0.001;
      // thick where it wells up, thinning as it runs, with a slight bead every so often
      const w = st.w * W * (1 - f * 0.5) * (1 + 0.12 * Math.max(0, Math.sin(f * 23 + seed)));
      const g = Math.round(f * st.len * 255);
      // R: thick in the middle of the trail, thin (translucent) at its edges
      const rg = x.createRadialGradient(u * W, v * H, 0, u * W, v * H, w * 0.5);
      rg.addColorStop(0, `rgb(255,${g},0)`);
      rg.addColorStop(0.7, `rgb(200,${g},0)`);
      rg.addColorStop(1, `rgba(70,${g},0,0)`);
      x.fillStyle = rg;
      x.beginPath();
      x.ellipse(u * W, v * H, w * 0.5, w * 0.5, 0, 0, Math.PI * 2);
      x.fill();
    }
    // the drop gathering at the end
    x.fillStyle = `rgb(255,${Math.round(st.len * 255)},0)`;
    x.beginPath();
    x.ellipse(u * W, (v + 0.01) * H, st.w * 0.36 * W, st.w * 0.46 * W, 0, 0, Math.PI * 2);
    x.fill();
  }
  const t = tex(c, false);
  t.anisotropy = 1;
  return t;
}

/* ------------------------------------------------------------------ */

export class FaceFX {
  /**
   * @param mesh the skinned body mesh
   * @param cfg  { r: [x,y,z], l: [x,y,z], rx, ry } eye centres / half-size in the mesh's geometry space
   */
  constructor(mesh, cfg) {
    this.group = mesh.parent;
    this.mode = 3;
    this.flare = 0;
    this.spin = 0;
    this.spinTarget = 0;
    const { rx, ry } = cfg;
    const W = 512, H = Math.round(512 * (ry / rx));
    // the uv box is exactly the eye; the cut is a little larger so the painting never clips at a triangle edge
    const eyeRegion = (c, mirror) => ({ cx: c[0], cy: c[1], cz: c[2], rx: rx * 1.1, ry: ry * 1.3, uvRx: rx, mirror, y0: c[1] - ry, y1: c[1] + ry });
    const regions = () => [eyeRegion(cfg.r, true), eyeRegion(cfg.l, false)];

    this.scleraMat = decalMat(THREE.MeshStandardMaterial, { map: scleraTexture(W, H), roughness: 0.2, envMapIntensity: 0.3 });
    this.sclera = cutDecal(mesh, regions(), 0.0006, this.scleraMat);

    // iris: its own copy of the Sharingan texture so its transform can spin without touching others
    this.irisMat = decalMat(THREE.MeshStandardMaterial, {
      alphaMap: almondMask(W, H), roughness: 0.12, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.3,
    });
    this.iris = cutDecal(mesh, regions(), 0.0009, this.irisMat);
    // iris centre and radius in decal uv (the painted almond's middle)
    this.irisC = new THREE.Vector2(0.5, 1 - 0.5);
    const irisR = ry * 0.56; // metres
    this.irisS = new THREE.Vector2(2 * rx / (2 * irisR), 2 * ry / (2 * irisR));

    this.lidMat = decalMat(THREE.MeshStandardMaterial, { map: lidTexture(W, H), roughness: 0.6 });
    this.lids = cutDecal(mesh, regions(), 0.0012, this.lidMat);

    this.sclera.renderOrder = 2;
    this.iris.renderOrder = 3;
    this.lids.renderOrder = 4;
    this.group.add(this.sclera, this.iris, this.lids);

    // blood: below each eye, down the cheek
    this.blood = {};
    for (const side of ['r', 'l']) {
      const c = cfg[side];
      const top = c[1] - ry * 0.3, bottom = c[1] - ry * 6.5;
      const u = { value: 0 }, fade = { value: 0 };
      const mat = decalMat(THREE.MeshStandardMaterial, { map: bloodTexture(128, 320, side === 'r' ? 7 : 13), color: 0x8c0a12, roughness: 0.28, envMapIntensity: 0.3 });
      mat.map.colorSpace = THREE.NoColorSpace;
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uFlow = u;
        sh.uniforms.uFade = fade;
        sh.fragmentShader = 'uniform float uFlow;\nuniform float uFade;\n' + sh.fragmentShader.replace('#include <map_fragment>', /* glsl */`
          vec4 bd = texture2D( map, vMapUv );
          float reveal = 1.0 - smoothstep( uFlow - 0.06, uFlow, bd.g );
          diffuseColor.rgb *= mix( 1.25, 0.6, bd.r ); // thicker blood is darker
          diffuseColor.a *= smoothstep( 0.12, 0.6, bd.r ) * 0.95 * reveal * uFade;
        `);
      };
      mat.customProgramCacheKey = () => 'itachi-blood';
      const region = { cx: c[0], cy: (top + bottom) / 2, cz: c[2], rx: rx * 0.8, ry: (top - bottom) / 2, rect: true, mirror: side === 'r', y0: bottom, y1: top }; // canvas top (v = 1) is the lid
      const m = cutDecal(mesh, [region], 0.0015, mat);
      m.renderOrder = 1; // under the eye, so it wells out from beneath the lid
      m.visible = false;
      this.group.add(m);
      this.blood[side] = { mesh: m, flow: u, fade, on: false };
    }

    this.setEyes(3);
  }

  /** 0 = onyx, 1–3 = tomoe count, 'mangekyo' */
  setEyes(mode) {
    if (mode === this.mode && this.irisMat.map) return;
    const was = this.mode;
    this.mode = mode;
    const base = sharinganTexture(mode);
    const t = base.clone();
    t.matrixAutoUpdate = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    if (this.irisMat.map) this.irisMat.map.dispose();
    this.irisMat.map = t;
    this.irisMat.emissiveMap = t;
    this.irisMat.needsUpdate = true;
    this._applyIris();
    if (was !== mode && was !== undefined && mode !== 0) this.pulse();
  }

  /** The eyes flare and the pattern turns a third of a revolution (it is 3-fold symmetric, so it settles cleanly). */
  pulse() {
    this.flare = 1;
    this.spinTarget += (Math.PI * 2) / 3;
  }

  setBleeding(on, side = 'both') {
    for (const s of ['r', 'l']) {
      const want = on && (side === 'both' || side === s);
      const b = this.blood[s];
      if (want && !b.on) { b.flow.value = 0; b.fade.value = 1; b.mesh.visible = true; }
      b.on = want;
    }
  }

  _applyIris() {
    const m = this.irisMat.map;
    if (!m) return;
    // q = R(spin) · S · (uv − c) + 0.5  (rotation in the iris' own round space, so it never shears)
    const cs = Math.cos(this.spin), sn = Math.sin(this.spin);
    const sx = this.irisS.x, sy = this.irisS.y, cx = this.irisC.x, cy = this.irisC.y;
    const a = cs * sx, b = -sn * sy, c = sn * sx, d = cs * sy;
    m.matrix.set(a, b, 0.5 - a * cx - b * cy, c, d, 0.5 - c * cx - d * cy, 0, 0, 1);
  }

  update(dt) {
    // spin toward the target with a fast start and soft landing
    const ds = this.spinTarget - this.spin;
    if (Math.abs(ds) > 1e-4) {
      this.spin += ds * (1 - Math.exp(-7 * dt));
      this._applyIris();
    }
    this.flare = Math.max(0, this.flare - dt * 1.3);
    const glow = this.mode === 0 ? 0.03 : this.mode === 'mangekyo' ? 0.3 : 0.2;
    this.irisMat.emissiveIntensity = glow + this.flare * 3.2;
    for (const s of ['r', 'l']) {
      const b = this.blood[s];
      if (!b.mesh.visible) continue;
      if (b.on) b.flow.value = Math.min(1.08, b.flow.value + dt * 0.45);
      else {
        b.fade.value = Math.max(0, b.fade.value - dt * 0.5);
        if (b.fade.value <= 0) b.mesh.visible = false;
      }
    }
  }
}
