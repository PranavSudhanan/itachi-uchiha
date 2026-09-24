import { createItachi } from './ItachiGLB.js';

/** A posed Itachi for chapters that just need him standing (the model API is kept in userData). */
export function createItachiFigure() {
  const m = createItachi();
  m.root.userData.model = m;
  return m.root;
}
