/*
 * Shared dimensions of Itachi's Susanoo, used by both the sculpting tool (tools/build-susanoo.mjs) and the
 * runtime (SusanooBody.js). Metres; faces +Z, feet at y = 0, Itachi stands at the origin inside it.
 * Arm points are in arm-local space (relative to the shoulder pivot).
 */
export const SHOULDER = { r: [-2.45, 5.0, -0.55], l: [2.45, 5.0, -0.55] };
export const ELBOW = { r: [-0.95, -1.7, 0.55], l: [0.95, -1.7, 0.55] };
export const HAND = { r: [-0.35, -2.05, 2.25], l: [0.3, -1.2, 2.2] };
/** The right fist grips the gourd's neck: the gourd sits this far from the hand. */
export const GOURD_OFFSET = [0, -0.1, 0.1];
/** The Yata Mirror, held in the left fist. */
export const MIRROR_OFFSET = [0.2, 0.35, 0.5];
/** Centre of the demon face (stage III) and of the skull (stage II). */
export const FACE = [0, 6.65, -0.2];
export const SKULL = [0, 6.55, -0.35];
/** Face-local positions of the glowing eyes and fangs; the demon head is sculpted 12% larger, so they scale with it. */
export const HEAD_SCALE = 1.12;
/** Eyeball centres, set into sockets under the brow, and their radius. */
export const EYES = [[-0.34, 0.05, 0.78], [0.34, 0.05, 0.78]].map((p) => p.map((v) => v * HEAD_SCALE));
export const EYE_R = 0.155 * HEAD_SCALE;
export const FANGS = [[-0.2, -0.6, 0.86], [0.2, -0.6, 0.86]].map((p) => p.map((v) => v * HEAD_SCALE));
/** Spine: vertebra centres. */
export const SPINE = Array.from({ length: 12 }, (_, i) => [0, 0.9 + i * 0.4, -1.05 - Math.sin((i / 11) * Math.PI) * 0.25]);
