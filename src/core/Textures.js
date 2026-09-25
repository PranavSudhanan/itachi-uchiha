import * as THREE from 'three';

/*
 * Photographic surface textures (CC0, Poly Haven; see public/textures/LICENSE.txt). Each set is a colour
 * map, an OpenGL normal map and a roughness map at 1K. A chapter asks for a set when it builds; the images
 * load in the background and are swapped into the material when they arrive, so the drawn texture shows
 * until then and nothing ever flashes black. Images are shared; each use gets its own repeat.
 */

const loader = new THREE.TextureLoader();
const images = new Map(); // url -> Promise<HTMLImageElement>

function image(url) {
  if (!images.has(url)) {
    images.set(url, new Promise((resolve) => {
      loader.load(url, (t) => resolve(t.image), undefined, () => resolve(null));
    }));
  }
  return images.get(url);
}

function texture(img, { repeat, srgb, renderer }) {
  const t = new THREE.Texture(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (renderer) t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.needsUpdate = true;
  return t;
}

/**
 * Applies the set `id` to `material`.
 *  repeat       [u, v] tiling over the surface's UVs
 *  maps         which of 'diff' | 'nor' | 'rough' to use (default all three); leave out 'diff' to keep
 *               the material's own colour map and only add the real surface relief
 *  normalScale  strength of the relief
 *  roughness    multiplier on the roughness map (lower for wet or polished surfaces)
 *  tint         multiplies the colour map (e.g. darker for wet stone)
 */
export function applyTextureSet(material, id, { repeat = [1, 1], maps = ['diff', 'nor', 'rough'], normalScale = 1, roughness = 1, tint = null, renderer = null } = {}) {
  const base = `textures/${id}/`;
  const jobs = [];
  if (maps.includes('diff')) jobs.push(image(base + 'diff.jpg').then((img) => {
    if (!img) return;
    material.map = texture(img, { repeat, srgb: true, renderer });
    if (tint != null) material.color.set(tint);
    // a drawn map may have doubled as bump relief; the normal map replaces it
    if (material.bumpMap && maps.includes('nor')) material.bumpMap = null;
  }));
  if (maps.includes('nor')) jobs.push(image(base + 'nor.jpg').then((img) => {
    if (!img) return;
    material.normalMap = texture(img, { repeat, srgb: false, renderer });
    material.normalScale.set(normalScale, normalScale);
    if (material.bumpMap && !maps.includes('diff')) material.bumpMap = null;
  }));
  if (maps.includes('rough')) jobs.push(image(base + 'rough.jpg').then((img) => {
    if (!img) return;
    material.roughnessMap = texture(img, { repeat, srgb: false, renderer });
    material.roughness = roughness;
  }));
  return Promise.all(jobs).then(() => { material.needsUpdate = true; });
}
