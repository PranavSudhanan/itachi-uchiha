import * as THREE from 'three';
import { sharinganTexture, glowTexture, damp, TAU } from '../core/utils.js';

/**
 * A glowing Sharingan orb. The iris pattern is projected onto the front hemisphere,
 * with an animated spiral wipe between patterns.
 */
export class SharinganEye {
  constructor({ radius = 2, mode = 3, halo = true } = {}) {
    this.mode = mode;
    this.uniforms = {
      uTexA: { value: sharinganTexture(mode) },
      uTexB: { value: sharinganTexture(mode) },
      uMix: { value: 1 },
      uRot: { value: 0 },
      uGlow: { value: 0.35 },
      uIris: { value: 0.8 },
      uFlash: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vObj; varying vec3 vN; varying vec3 vView;
        void main(){
          vObj = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vN = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTexA; uniform sampler2D uTexB;
        uniform float uMix; uniform float uRot; uniform float uGlow; uniform float uIris; uniform float uFlash;
        varying vec3 vObj; varying vec3 vN; varying vec3 vView;
        vec2 rot(vec2 p, float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c)*p; }
        void main(){
          float fres = pow(1.0 - max(dot(vN, vView), 0.0), 2.4);
          vec3 col = mix(vec3(0.045,0.012,0.018), vec3(0.2,0.02,0.035), fres);
          if (vObj.z > 0.0) {
            vec2 p = vObj.xy / uIris;
            float r = length(p);
            vec4 A = texture2D(uTexA, rot(p, uRot + uMix * 6.2831) * 0.5 + 0.5);
            vec4 B = texture2D(uTexB, rot(p, uRot + (uMix - 1.0) * 6.2831) * 0.5 + 0.5);
            float w = 1.0 - smoothstep(uMix * 1.25 - 0.25, uMix * 1.25, r);
            vec4 T = mix(A, B, w);
            float inside = 1.0 - smoothstep(0.97, 1.0, r);
            col = mix(col, T.rgb * (0.8 + uGlow * 0.7), T.a * inside);
            // wet specular
            vec3 L = normalize(vec3(-0.4, 0.6, 1.0));
            float spec = pow(max(dot(reflect(-L, vN), vView), 0.0), 60.0);
            col += spec * 0.6;
          }
          col += vec3(0.9, 0.04, 0.06) * fres * uGlow * 0.9;
          col += uFlash * vec3(1.0, 0.12, 0.1);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), this.material);
    this.group = new THREE.Group();
    this.group.add(this.mesh);

    if (halo) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xff1a2a, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sprite.scale.setScalar(radius * 5.2);
      sprite.position.z = -radius * 0.6;
      this.halo = sprite;
      this.group.add(sprite);
    }

    this.spinSpeed = 0.35;
    this.spinBoost = 0;
    this.targetGlow = 0.35;
    this.transition = 1;
  }

  setMode(mode) {
    if (mode === this.mode) return false;
    this.uniforms.uTexA.value = this.uniforms.uTexB.value;
    this.uniforms.uTexB.value = sharinganTexture(mode);
    this.mode = mode;
    this.transition = 0;
    this.spinBoost = 9;
    this.uniforms.uFlash.value = 0.6;
    return true;
  }

  pulse(amount = 0.8) {
    this.uniforms.uFlash.value = Math.max(this.uniforms.uFlash.value, amount);
    this.spinBoost = Math.max(this.spinBoost, 6);
  }

  update(dt) {
    const u = this.uniforms;
    this.transition = Math.min(1, this.transition + dt * 1.2);
    u.uMix.value = 1 - Math.pow(1 - this.transition, 3);
    this.spinBoost = damp(this.spinBoost, 0, 2.2, dt);
    const spinning = this.mode === 0 ? 0 : this.spinSpeed;
    u.uRot.value = (u.uRot.value - (spinning + this.spinBoost) * dt) % TAU;
    u.uFlash.value = damp(u.uFlash.value, 0, 5, dt);
    u.uGlow.value = damp(u.uGlow.value, this.targetGlow, 5, dt);
    if (this.halo) this.halo.material.opacity = 0.1 + u.uGlow.value * 0.3 + u.uFlash.value * 0.5;
  }
}
