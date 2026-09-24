# Itachi Uchiha — The Crow of the Leaf

An immersive, responsive 3D character tribute to Itachi Uchiha (Naruto), built with Three.js and Vite.
Itachi and his Susanoo are GLB models (`public/models/`); everything else (scenes, textures, sound effects and music) is generated in code.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Itachi model

`public/models/itachi.glb` is built from a static OBJ plus its texture by a dependency-free rigging tool, which adds a Mixamo-style skeleton and skin weights:

```bash
node tools/rig-itachi.mjs tools/_src/model.obj tools/_src/basecolor.jpg public/models/itachi.glb
```

Poses (hand signs, fire breath, summon, Susanoo guard and slash, covering the eye) are applied at runtime with IK in `src/objects/ItachiGLB.js`. Any Mixamo, VRM or Blender-rigged GLB dropped in as `itachi.glb` works too; set `public/models/itachi.json` (`rotationY`, `height`, `idleClip`) if it needs adjusting. If the file is missing, the site falls back to the built-in procedural Itachi.

The model is shaded with realistic skin and cloth (`src/objects/ItachiFace.js`): the skin is found by colour in the texture and gets subsurface scattering, a skin specular and smoothing, while the cloak gets a fibre sheen. Set `"toon": true` in `itachi.json` for cel shading instead.

The Sharingan, Mangekyō and bleeding eyes are decals cut from the face mesh and skinned to the same skeleton, so they follow every pose. They need the eye positions in `itachi.json`. For a different model, measure the centres and half-size in the mesh's own coordinates:

```json
{ "eyes": { "r": [-0.0285, 1.6518, 0.125], "l": [0.0285, 1.6525, 0.125], "rx": 0.0165, "ry": 0.0095 } }
```

## Susanoo model

`public/models/susanoo.glb` is Itachi's Susanoo, sculpted by a dependency-free tool:

```bash
node tools/build-susanoo.mjs
```

Each part is modelled from blended shapes (signed distance fields), so bone, muscle and armour flow into each other like a sculpt, then meshed with surface nets. The stages are separate parts: I the skeleton (spine, ribs, clavicles, scapulae, bone arms with claws), II the skull, III the muscled warrior (V-tapered torso, heavy shoulders and arms, fists) with a long-nosed tengu face and hair of flame, IV the armour (muscle cuirass with a lamellar skirt, sode shoulder plates, vambraces, a mantle of overlapping feather-like plates, and a helmet with tokin and horns). Shared dimensions live in `src/objects/SusanooShape.js`.

Stage IV is the Perfect Susanoo, [“Perfect susanoo” by wahidinesport](https://sketchfab.com/3d-models/perfect-susanoo-c1ef38744eb64891b26a6f41aac1b199), licensed [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) (`public/models/perfect-susanoo.glb`, credited in the chapter). It stands at full height and Itachi rises to float inside its chest as it manifests (the camera and the hit zones follow). It is drawn with the same chakra shader (its painted plate and feather outlines glow), and since it has no skeleton its arms swing about the shoulders in the vertex shader for the slash and mirror gestures, with the shield carried upright in front. Without that file the sculpted armour is used for stage IV.

In the chapter it is drawn as a solid, translucent body of chakra: a hot rim at the silhouette, glowing seams, a depth pre-pass so each layer shows only its nearest surface instead of stacking into a blur, and chakra flames licking up the silhouette of stages III and IV. Without the file the site falls back to a simpler procedural Susanoo.

## Chapters and how you interact with them

Most interaction is by gesture: **tap**, **hold** (a charge ring appears), **swipe or flick**, and **draw**. Dragging leaves a glowing chakra trail.

| # | Chapter | Interactions |
|---|---------|--------------|
| 1 | **Prologue** | The eye follows you. **Hold** the eye to awaken it (Sharingan → Mangekyō → onyx). Drag through falling feathers; clouds drift across the red moon. |
| 2 | **Chronicle** | **Swipe** or scroll along a path of 10 stone tablets covering his life. |
| 3 | **Relics** | **Flick** the altar and it spins with momentum, then settles. **Tap** a relic to lift it and **drag** to turn it. Spotlight shadows. |
| 4 | **Training** | **Flick** toward a target to throw shuriken (swipe speed sets throw power; a very fast flick throws two). 30-second trial. Switch to Hand Signs and Itachi appears in the clearing. Weave signs with the **Q–V keys** or the panel; tap a scroll to be guided (the next sign glows), and a wrong sign fizzles. Each finished jutsu plays a cinematic: first a close-up of Itachi's hands re-weaving the whole sequence (each sign is its own finger pose), then the technique with camera moves and a calligraphy title card. **Great Fireball**: chakra gathers, a stream of fire feeds a rolling fireball, it explodes and leaves scorched, burning ground. **Phoenix Sage Fire**: an arcing volley that hides shuriken inside the flames. **Summoning: Crows**: a glowing seal, a smoke burst and a vortex of crows. Moonlit clearing with wind-blown grass that flattens in fireball blasts, fireflies and a pine forest. |
| 5 | **Precognition** *(game)* | Kunai, shuriken and explosive tags fly at you. **Tap** or **slash** them away. **Hold** (or press Space) for Sharingan slow motion, which reveals every trajectory and drains chakra. Includes combos, 3 lives and a saved best score. |
| 6 | **Crows** | **Draw** any shape and 360 crows fly into it. **Hold** still for a vortex, **flick** for a gust, **tap** to scatter. Preset shapes are also available. Find Shisui's red-eyed crow. |
| 7 | **Amaterasu** | **Stare** (hold) to ignite black flames where you look, then **keep dragging** to paint fire. The flames are shader-drawn, black with a violet rim, and they spread and burn logs to ash. **Swipe down** to close the eye. Chakra is limited. |
| 8 | **Tsukuyomi** | **Hold anywhere** to cast: the world turns red and black and 72 hours pass. **Tap** the mirror water to ripple it. A torii gate and stone lanterns stand in the water. Includes the Izanami loop. |
| 9 | **Susanoo** *(game)* | **Swipe up** to manifest each stage and **down** to recede. **Slash** to swing the Totsuka Blade. **Hold** to raise the Yata Mirror. The scene has a thunderstorm with rain and lightning. **Hold the Line**: seal shadow shinobi with slashes and reflect their attacks with the mirror. |
| 10 | **Trials** | An 8-question quiz where each correct answer adds a tomoe. Includes flip-card trivia. |

## On phones

- **Tilt to look around:** the gyroscope turns the camera a little, like looking through a window. The neutral angle re-centres slowly to however you hold the phone. iOS asks for motion access when you tap *Enter*, and reduced-motion settings turn it off.
- **Touch feedback:** a chakra ripple spreads from every touch. On phones that support it, haptics mark hand signs, slashes, jutsu impacts, hits and quiz answers.
- **Guides tuck away:** each chapter's guides show on arrival and fold away after your first touch (or 9 s). The *Guide* pill brings them back. When a chapter's own panel or card is open, it takes priority over the guides.
- **Layouts:** portrait uses a bottom tab bar, and the HUD rides above each chapter's control bar whatever its height. Landscape uses a compact dot nav, the intro on the left, and panels and controls on the right.

## Sound

- The soundtrack is generated live in the Japanese Hirajoshi scale: koto, shakuhachi, taiko, temple bells and a drone.
- It changes with each chapter's mood (calm, mystic, tension, battle, genjutsu).
- The top bar has a **music toggle** and a **mute-all** button. **M** mutes everything.
- Your choice is remembered between visits.
- **Jutsu call-outs** are spoken in Japanese, as in the anime ("Katon: Gōkakyū no Jutsu!", "Amaterasu", "Susanoo", "Tsukuyomi", "Totsuka no Tsurugi"…), with the kanji and romaji shown as a subtitle. They use the browser's own Japanese voice: Edge (Keita / Nanami), Chrome (Google 日本語), macOS / iOS and Android all have one. Where no Japanese voice is installed, a phonetic reading in an English voice is used instead.
- Each technique has its own synthesized effects: the snap of every hand sign, the Sharingan's metallic "shing", the Mangekyō's deep drop, the roar and crackle of Katon, Amaterasu's heavy ignition and sizzle, Susanoo's rumble and cracking ribs, and Tsukuyomi's reversed swell.

## Structure

```
src/
  core/      App (renderer, post-processing, gestures, navigation), Chapter base,
             Audio (SFX + generative music), CinematicPass (grain, vignette, CA, grade)
  objects/   Sharingan eye, particles, crows, flame field, mirror water, grass/forest, weapons, Itachi figure
  chapters/  one file per chapter
  data/      lore, timeline, quiz and trivia text
```

Unofficial fan tribute. Naruto © Masashi Kishimoto / Shueisha / Studio Pierrot.
