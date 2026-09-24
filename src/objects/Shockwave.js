import * as THREE from 'three';

/**
 * A ring racing outward across the ground. `dark: true` draws a black ring with a crimson edge
 * (Amaterasu); otherwise a bright additive ring of heat or chakra.
 */
export class Shockwave {
  constructor({ color = 0xff8a30, dark = false, size = 40, speed = 0.9, reach = 12 } = {}) {
    this.speed = speed;
    this.reach = reach;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uR: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(color) }, uDark: { value: dark ? 1 : 0 } },
      transparent: true, depthWrite: false,
      blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uR; uniform float uAlpha; uniform vec3 uColor; uniform float uDark; varying vec2 vP;
        void main(){
          float d = length(vP);
          float w = 0.07 + uR * 0.05;
          float ring = exp(-pow((d - uR) / w, 2.0));
          float edge = exp(-pow((d - uR - w * 0.8) / (w * 0.5), 2.0));
          float inner = smoothstep(uR, 0.0, d) * 0.25;
          if (uDark > 0.5) {
            // a black wave with a thin crimson lip
            vec3 col = mix(vec3(0.01, 0.0, 0.01), uColor, edge);
            gl_FragColor = vec4(col, clamp((ring * 0.9 + edge * 0.6 + inner * 0.8) * uAlpha, 0.0, 1.0));
          } else {
            gl_FragColor = vec4(uColor * (ring * 1.6 + inner) * uAlpha, 1.0);
          }
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    this.t = 0;
  }

  fire(p, color = null) {
    this.mesh.position.set(p.x, (p.y || 0) + 0.05, p.z);
    if (color !== null) this.mat.uniforms.uColor.value.set(color);
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt) {
    if (!this.mesh.visible) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.speed);
    this.mat.uniforms.uR.value = 0.4 + Math.pow(k, 0.6) * this.reach;
    this.mat.uniforms.uAlpha.value = (1 - k) * 1.1;
    if (k >= 1) this.mesh.visible = false;
  }
}
