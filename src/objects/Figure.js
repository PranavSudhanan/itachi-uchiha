import * as THREE from 'three';
import { cloakTexture, drawTexture, drawLeaf } from '../core/utils.js';

/**
 * A stylised, low-poly Itachi figure: Akatsuki cloak with high collar, dark hair, scratched headband.
 * Height ≈ 1.8 units, feet at y = 0.
 */
export function createItachiFigure() {
  const g = new THREE.Group();
  const cloakTex = cloakTexture().clone();
  cloakTex.needsUpdate = true;
  cloakTex.repeat.set(2, 1.2);

  const cloakMat = new THREE.MeshStandardMaterial({ map: cloakTex, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0a10, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8cdb8, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x0c0b12, roughness: 0.6 });

  // cloak body (lathe profile from hem up to collar)
  const prof = [
    [0.42, 0.12], [0.4, 0.4], [0.33, 0.8], [0.29, 1.1], [0.3, 1.3], [0.24, 1.42], [0.16, 1.48], [0.15, 1.6], [0.17, 1.66],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const cloak = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), cloakMat);
  g.add(cloak);

  // legs / sandals
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.2, 8), dark);
    leg.position.set(s * 0.1, 0.1, 0);
    g.add(leg);
  }

  // head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), skin);
  head.position.y = 1.69;
  head.scale.set(0.95, 1.1, 1);
  g.add(head);

  // hair cap + bangs + low ponytail
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.142, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hair);
  cap.position.y = 1.7;
  cap.rotation.x = -0.25;
  g.add(cap);
  for (const s of [-1, 1]) {
    const bang = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.03), hair);
    bang.position.set(s * 0.11, 1.64, 0.08);
    bang.rotation.z = s * 0.12;
    g.add(bang);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.012, 0.3, 6), hair);
  tail.position.set(0, 1.5, -0.14);
  tail.rotation.x = 0.25;
  g.add(tail);

  // scratched headband
  const plateTex = drawTexture(256, 96, (x, w, hh) => {
    const gr = x.createLinearGradient(0, 0, 0, hh);
    gr.addColorStop(0, '#d9dde2'); gr.addColorStop(1, '#7d838b');
    x.fillStyle = gr; x.fillRect(0, 0, w, hh);
    drawLeaf(x, w / 2, hh / 2, 26, { color: '#2a2d33', width: 5, scratch: true });
  });
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.145, 0.145, 0.05, 24, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1b2233, roughness: 0.8, side: THREE.DoubleSide }),
  );
  band.position.y = 1.75;
  g.add(band);
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.06, 20, 1, true, -0.55, 1.1),
    new THREE.MeshStandardMaterial({ map: plateTex, metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide }),
  );
  plate.position.y = 1.75;
  plate.rotation.y = Math.PI / 2 - Math.PI / 2;
  g.add(plate);

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
