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

Itachi is `public/models/itachi-ff.glb`. It's a Mixamo rig with full fingers. `public/models/itachi.json` picks the file and places the Sharingan and bleeding-eye decals: the face mesh, and the eye centres and size in that mesh's own space. It sets `"normals": false` because the ripped mesh's normals are unreliable. The loader also copes with such models: surfaces with scrambled winding or normals are shaded from whichever side faces the viewer, and colour masks stored in the normal-map slot are ignored.

Any Mixamo, VRM or Blender-rigged GLB works the same way. The earlier model and its rigging tool (`tools/rig-itachi.mjs`, with its sources in `tools/_src/`) are kept for reference.

He is alive between poses. Poses blend on springs with a little overshoot, and each hand sign snaps in with a small body accent. At rest he breathes, shifts his weight and glances around, and the cloak's hem sways in the breeze. A warm rim light and a soft contact shadow keep him readable in the dark scenes.

The model is shaded with realistic skin and cloth (`src/objects/ItachiFace.js`): the skin is found by colour in the texture and gets subsurface scattering, a skin specular and smoothing, while the cloak gets a fibre sheen. Set `"toon": true` in `itachi.json` for cel shading instead.

This model has its own painted eyes, so the Sharingan and Mangekyō are painted into its iris (`"native"` in `itachi.json`: the face meshes, and where the iris sits in their texture), keeping its own eye shape, whites and lids. For models without that, the Sharingan, Mangekyō and bleeding eyes are decals cut from the face mesh and skinned to the same skeleton, so they follow every pose. They need the eye positions in `itachi.json`. For a different model, measure the centres and half-size in the mesh's own coordinates:

```json
{ "eyes": { "r": [-0.0285, 1.6518, 0.125], "l": [0.0285, 1.6525, 0.125], "rx": 0.0165, "ry": 0.0095 } }
```

## Susanoo model

`public/models/susanoo.glb` is Itachi's Susanoo, sculpted by a dependency-free tool:

```bash
node tools/build-susanoo.mjs
```

Each part is modelled from blended shapes (signed distance fields), so bone, muscle and armour flow into each other like a sculpt, then meshed with surface nets. The stages are separate parts: I the skeleton (spine, ribs, clavicles, scapulae, bone arms with claws), II the skull, III the muscled warrior (V-tapered torso, heavy shoulders and arms, fists) with a long-nosed tengu face and hair of flame, IV the armour (muscle cuirass with a lamellar skirt, sode shoulder plates, vambraces, a mantle of overlapping feather-like plates, and a helmet with tokin and horns). Shared dimensions live in `src/objects/SusanooShape.js`.

Stage IV is the Perfect Susanoo (`public/models/perfect-susanoo.glb`). It stands at full height and Itachi rises to float inside its chest as it manifests (the camera and the hit zones follow). It is drawn with the same chakra shader (its painted plate and feather outlines glow), and since it has no skeleton its arms swing about the shoulders in the vertex shader for the slash and mirror gestures, with the shield carried upright in front. Without that file the sculpted armour is used for stage IV.

In the chapter it is drawn as a solid, translucent body of chakra: a hot rim at the silhouette, glowing seams, a depth pre-pass so each layer shows only its nearest surface instead of stacking into a blur, and chakra flames licking up the silhouette of stages III and IV. Without the file the site falls back to a simpler procedural Susanoo.

## Chapters and how you interact with them

Most interaction is by gesture: **tap**, **hold** (a charge ring appears), **swipe or flick**, and **draw**. Dragging leaves a glowing chakra trail.

| # | Chapter | Interactions |
|---|---------|--------------|
| 1 | **Prologue** | The eye follows you. **Hold** the eye to awaken it (Sharingan → Mangekyō → onyx). Drag through falling glossy black crow feathers. Behind the eye, Konoha sleeps under a coppery, eclipsed blood moon in a dark night sky: rooftops with upswept eaves rimmed by the moon's red light, shoji windows glowing in varied warm tones, paper lanterns at the doors, a pagoda, telephone poles and wires, the village's lamplight hazing the air above the roofs and the foot of the hills beyond, and clouds lit red around the moon (`src/objects/Konoha.js`). |
| 2 | **Chronicle** | **Swipe** or scroll along a moonlit stepping-stone path through a bamboo grove, past 10 stone steles carved with the chapters of his life (the age inlaid in red lacquer, the title in gold), each with a stone lantern that lights the one you're reading. Fireflies drift over the grass. |
| 3 | **Relics** | **Flick** the altar and it spins with momentum, then settles. **Tap** a relic to lift it and **drag** to turn it. The relics stand in a dim Uchiha shrine hall: a polished wooden floor, shoji screens lit from behind, the clan's crest on a banner, and each relic above a plum silk cushion with gold tassels, on a granite plinth with softened edges and a thin brass band, in its own faint shaft of light with dust drifting through it. The relics themselves: a steel forehead protector bent to the brow, brushed and slashed, on a woven navy band tied at the back; a heavy gold Akatsuki ring with its 朱 in lacquer; soft, matte dango; and a folded piece of the black Akatsuki cloak itself, the red cloud printed on its twill and a red lining beneath. |
| 4 | **Training** | **Flick** toward a target to throw shuriken (swipe speed sets throw power; a very fast flick throws two). 30-second trial. Switch to Hand Signs and Itachi appears in the clearing. Weave signs with the **Q–V keys** or the panel; tap a scroll to be guided (the next sign glows), and a wrong sign fizzles. Each finished jutsu plays a cinematic: first a close-up of Itachi's hands re-weaving the whole sequence (each sign is its own finger pose), then the technique with camera moves and a calligraphy title card. **Great Fireball**: chakra gathers, a stream of fire feeds a rolling fireball, it explodes and leaves scorched, burning ground. **Fire Style: Hōsenka Tsumabeni** (Phoenix Sage Flower Nail Crimson): an arcing volley that hides shuriken inside the flames. **Summoning: Crows**: a glowing seal, a smoke burst and a vortex of crows. A moonlit clearing under a starry sky with drifting clouds and a moon showing its real seas: trodden earth around weathered wooden targets; Team 7's three training posts, slightly irregular logs with cracked end grain on top and a coil of twisted rope; paper lanterns marked 火; mossy boulders half-sunk in the meadow; fireflies; a meadow of grass growing in tufts of thin, arching blades, some fresh and some dry, over short turf, that flattens in fireball blasts; and a fir forest fading into the night haze. |
| 5 | **Precognition** *(game)* | Kunai, shuriken and explosive tags fly at you. **Tap** or **slash** them away. **Hold** (or press Space) for Sharingan slow motion, which reveals every trajectory and drains chakra. Includes combos, 3 lives and a saved best score. The ambush comes out of a night forest under a low moon: backlit firs (`createForest` in `src/objects/Nature.js`: each a trunk with whorls of drooping branches, every branch a pair of crossed cards of needled twigs, ragged and see-through at the edges and casting needle-cut shadows), dense low undergrowth, mossy boulders, shafts of moonlight, mist over the ground and long shadows, with the blades reflecting the night sky and glinting as they turn. |
| 6 | **Crows** | **Draw** any shape and 360 crows fly into it. **Hold** still for a vortex, **flick** for a gust, **tap** to scatter. Preset shapes are also available: in **Akatsuki** the crows trace the red cloud's border and curl, and the emblem itself glows up behind them. Find Shisui's red-eyed crow. The crows (`src/objects/Crow.js`) have rounded bodies, heavy beaks, fanned tails and the separated "finger" primaries of real crows; they bank into turns, alternate wingbeats with glides, and are near-black with a faint oily sheen and a thin rim where the dusk backlights them. The sky is a blood-red dusk (`src/objects/Dusk.js`): the last light deep red-orange at the horizon and already dark overhead, streaks of cloud lit around a coppery, eclipsed blood moon, the first stars, ridges fading into the haze with mist between them, ragged pines and a bare tree. |
| 7 | **Amaterasu** | A desolate plain under a heavy grey overcast, the sun a dim patch behind the cloud: cracked, dried mud, tufts of dead grass, bare dead trees at the edge of the field, hazy hills on the horizon, and ash drifting down (thicker while the flames burn). **Stare** (hold) to ignite black flames where you look, then **keep dragging** to paint fire. The flames are shader-drawn: a lightless black mass that writhes slowly, edged in a broken crimson glow and rolling black smoke; they spread and burn logs to ash. **Ring of fire** lights a complete circle of black flames out in the field, well clear of Itachi. **Swipe down** to close the eye. Keeping the flames alive drains chakra, which only returns once the eye rests; at zero the flames die out. Eye strain builds the longer Amaterasu is used and kept burning, in four stages: after a while his right eye starts to bleed, the bleeding worsens, both eyes bleed, and his sight fails (the screen darkens and blurs). Each stage is shown as a cinematic; after the eye rests the stages start over, and at the last stage it replays every 30 s. Itachi stands beside the field and the flames never burn within 4 m of him. When the strain makes his eyes bleed, a short cinematic shows it: a close-up as the blood wells and runs, a slowing heartbeat, then a hand pressed to the eye with the black flames burning on beyond him. |
| 8 | **Tsukuyomi** | **Hold anywhere** to cast: the moonlit sky of drifting clouds turns red, with black clouds streaming across it, crosses rise out of the water and 72 hours pass. Mist drifts over the still water, which mirrors the torii (its top beam sweeping up at the ends), the lanterns, the weathered standing stones and a cratered moon. **Tap** the mirror water to ripple it. A torii gate and stone lanterns stand in the water. Includes the Izanami loop. |
| 9 | **Susanoo** *(game)* | **Swipe up** to manifest each stage and **down** to recede. **Slash** to swing the Totsuka Blade. **Hold** to raise the Yata Mirror. The scene is the ruins of the Uchiha hideout in a thunderstorm (`src/objects/Storm.js`): heavy clouds that light up from within when forked lightning strikes, distant mountains, broken stone ruins and wet rock pooled with rain. The Susanoo lights the storm around it: its glow pools on the wet rock with its reflection stretched toward you, raindrops falling near it catch its orange light, and steam hisses off the chakra where the rain lands. **Hold the Line**: seal shadow shinobi with slashes and reflect their attacks with the mirror. |
| 10 | **Trials** | An 8-question quiz where each correct answer adds a tomoe. Includes flip-card trivia. It takes place in the secret chamber beneath the Naka Shrine: dressed stone walls in relief, dark timber posts, separate tatami mats of woven rush edged in cloth, Uchiha crest banners, candles with teardrop flames and running wax on tall stands, and the Uchiha stone tablet (carved with the clan crest and an ancient script) behind the eye, under a shimenawa rope hung with zigzag shide and lit by a dusty shaft of light from above. |

## Jutsu cinematics

Each technique: the signs in a medium shot, every sign snapping in with an anime impact frame (radial speed lines) and a chakra ring; the name called in an extreme close-up on the Sharingan, lit from below by the chakra at his hands; then the technique. The Great Fireball is a ray-marched volume of churning fire fed by a jet from his mouth, filmed from behind his shoulder with Itachi silhouetted against it, tracked across the field, and ending in a hit-stop, a shockwave across the ground and a burst of fire. The ray-march uses fewer samples the more of the screen the ball covers.

**Amaterasu** (the first ignition of each visit, and the ring): letterbox bars, the scene dims, a close-up of the Mangekyō as it turns and bleeds, a push in on the eye, then a hard cut to the target as the black flames erupt with a dark shockwave. **Susanoo**: the first manifestation cuts to both eyes as the Mangekyō turns, then to a low ground shot as the chakra erupts and the camera rises with the forming skeleton. Reaching the Perfect Susanoo adds a low hero shot answered by lightning, thunder and a shockwave across the field. The cinematics use `src/core/CineCam.js` (keyframed shots with cuts, shake and timed events) and `src/objects/Shockwave.js`.

## On phones

- **Changing chapters on a phone:** arrows at both ends of the chapter bar step back and forward; the veil wipes across in the direction you are going (a GPU-only transform, smooth while the next chapter builds), shows the chapter's number, name and kanji, gives a light haptic tick, and holds until the new scene's shaders are compiled so it doesn't stutter on reveal. Larger screens keep the iris opening, with the same title card.
- **Tilt:** the gyroscope never tilts the whole view; each scene gives it a meaning of its own. Prologue and Trials: the Sharingan's gaze follows the tilt (only the far skyline shifts a touch for depth, and feathers drift with it). Chronicle and Training: a gentle turn of the head. Relics: the relic you hold turns to show its sides. Precognition: lean to dodge, and a blade you lean out of misses. Crows: the tilt is the wind that blows the flock. Amaterasu: the tilt aims Itachi's gaze, and holding anywhere ignites where it points, so no finger covers the target. Tsukuyomi: the view leans around the scene. Susanoo: a gentle peek around the giant and up at it (its eyes follow you); a dead zone ignores hand tremor, and tilt pauses while your finger is down, in the dodge game and in cinematics. On a phone a stroke across the manifested Susanoo is always a sword slash and never swings the camera. The neutral angle re-centres slowly to however you hold the phone. iOS asks for motion access when you tap *Enter*, and reduced-motion settings turn it off.
- **Touch feedback:** a chakra ripple spreads from every touch. On phones that support it, haptics mark hand signs, slashes, jutsu impacts, hits and quiz answers.
- **Guides tuck away:** each chapter's guides show on arrival and fold away after your first touch (or 9 s). The *Guide* pill brings them back. When a chapter's own panel or card is open, it takes priority over the guides.
- **Layouts:** portrait uses a bottom tab bar, and the HUD rides above each chapter's control bar whatever its height. Landscape uses a compact dot nav, the intro on the left, and panels and controls on the right.

## Sound

- The soundtrack is generated live in the Japanese Hirajoshi scale: koto, shakuhachi, taiko, temple bells and a drone.
- It changes with each chapter's mood (calm, mystic, tension, battle, genjutsu).
- The top bar has a **music toggle** and a **mute-all** button. **M** mutes everything.
- Your choice is remembered between visits.
- **Jutsu call-outs** are spoken in Japanese, as in the anime ("Katon: Gōkakyū no Jutsu!", "Amaterasu", "Susanoo", "Tsukuyomi", "Totsuka no Tsurugi"…), with the kanji and romaji shown as a subtitle. They use the browser's own Japanese voice: Edge (Keita / Nanami), Chrome (Google 日本語), macOS / iOS and Android all have one. Where no Japanese voice is installed, a phonetic reading in an English voice is used instead. Natural (neural) male voices are preferred, pitched and paced to a low, level, unhurried delivery (around 100 Hz).
- **Voice lines:** Itachi's call-outs ship as clips in `public/audio/voice/`: Microsoft's Keita Neural Japanese male voice (`tools/voice-lines.py`), deepened to a low, level, calm delivery around 100 Hz (processing described in the README there). They play instead of the speech engine, mixed with the game audio, and the jutsu cinematics time the call to each clip. Replace any line by dropping in audio you have the rights to use under the same name (`.mp3`, `.ogg`, `.m4a` or `.wav`). The anime's own voice lines are copyrighted, so none ship with the project.
- Each technique has its own synthesized effects: the snap of every hand sign, the Sharingan's metallic "shing", the Mangekyō's low swell into a metallic ring (modelled on a reference recording: its pitches, partials and envelope were measured and rebuilt as a shorter synthesized effect that ducks under the spoken line), the roar and crackle of Katon, Amaterasu's heavy ignition and sizzle, Susanoo's rumble and cracking ribs, and Tsukuyomi's reversed swell.

## Structure

```
src/
  core/      App (renderer, post-processing, gestures, navigation), Chapter base,
             Audio (SFX + generative music), CinematicPass (grain, vignette, CA, grade)
  objects/   Sharingan eye, particles, crows, flame field, mirror water, grass/forest, weapons, Itachi figure
  chapters/  one file per chapter
  data/      lore, timeline, quiz and trivia text
```
