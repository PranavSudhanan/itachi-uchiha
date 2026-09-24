import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { shared } from '../core/utils.js';

const MAX_RIPPLES = 8;

/**
 * A planar mirror with animated ripples. Call `ripple(x, z)` to disturb the surface.
 */
export function createMirrorWater({ size = 160, resolution = 0.5, color = 0x7f8aa8 } = {}) {
  const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0));
  const shader = {
    name: 'MirrorWater',
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      uTime: shared.uTime,
      uRipples: { value: ripples },
      uTint: { value: new THREE.Color(0x0a0d18) },
      uReflect: { value: 0.55 },
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vUv; varying vec3 vWorld;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        vUv = textureMatrix * vec4(position, 1.0);
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime;
      uniform vec4 uRipples[${MAX_RIPPLES}]; uniform vec3 uTint; uniform float uReflect;
      varying vec4 vUv; varying vec3 vWorld;
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec2 off = vec2(sin(vWorld.x * 0.8 + uTime * 0.9) + sin(vWorld.z * 1.3 - uTime * 0.7), cos(vWorld.z * 0.9 + uTime * 0.8)) * 0.004;
        float crest = 0.0;
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          vec4 r = uRipples[i];
          float age = uTime - r.z;
          if (age < 0.0 || age > 6.0) continue;
          float d = distance(vWorld.xz, r.xy);
          float front = age * 3.2;
          float env = exp(-abs(d - front) * 1.6) * exp(-age * 0.7) * r.w;
          float w = sin((d - front) * 5.0) * env;
          off += normalize(vWorld.xz - r.xy + 0.0001) * w * 0.05;
          crest += max(w, 0.0);
        }
        vec4 uvw = vUv;
        uvw.xy += off * uvw.w;
        vec4 base = texture2DProj(tDiffuse, uvw);
        vec3 col = base.rgb * color * uReflect + uTint + crest * vec3(0.25, 0.28, 0.35);
        float dist = length(vWorld.xz);
        col = mix(col, uTint, smoothstep(30.0, 75.0, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };

  const dpr = Math.min(window.devicePixelRatio, 1);
  const water = new Reflector(new THREE.CircleGeometry(size / 2, 64), {
    color,
    textureWidth: Math.round(window.innerWidth * dpr * resolution),
    textureHeight: Math.round(window.innerHeight * dpr * resolution),
    clipBias: 0.003,
    shader,
  });
  water.rotation.x = -Math.PI / 2;

  let cursor = 0;
  water.ripple = (x, z, strength = 1) => {
    ripples[cursor].set(x, z, shared.uTime.value, strength);
    cursor = (cursor + 1) % MAX_RIPPLES;
  };
  water.uniforms = shader.uniforms;
  return water;
}
