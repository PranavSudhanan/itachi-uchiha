# Itachi Uchiha — The Crow of the Leaf

An immersive, responsive 3D character tribute to Itachi Uchiha (Naruto), built with Three.js and Vite.
Every model, texture, sound effect and piece of music is generated in code, so there are no asset files to download.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Chapters and how you interact with them

Most interaction is by gesture: **tap**, **hold** (a charge ring appears), **swipe or flick**, and **draw**. Dragging leaves a glowing chakra trail.

| # | Chapter | Interactions |
|---|---------|--------------|
| 1 | **Prologue** | The eye follows you. **Hold** the eye to awaken it (Sharingan → Mangekyō → onyx). Drag through falling feathers; clouds drift across the red moon. |
| 2 | **Chronicle** | **Swipe** or scroll along a path of 10 stone tablets covering his life. |
| 3 | **Relics** | **Flick** the altar and it spins with momentum, then settles. **Tap** a relic to lift it and **drag** to turn it. Spotlight shadows. |
| 4 | **Training** | **Flick** toward a target to throw shuriken (swipe speed sets throw power; a very fast flick throws two). 30-second trial. Weave hand signs with the **Q–V keys** or the panel to cast Great Fireball, Phoenix Sage Fire and Summoning: Crows. Moonlit clearing with wind-blown grass that flattens in fireball blasts, fireflies and a pine forest. |
| 5 | **Precognition** *(game)* | Kunai, shuriken and explosive tags fly at you. **Tap** or **slash** them away. **Hold** (or press Space) for Sharingan slow motion, which reveals every trajectory and drains chakra. Includes combos, 3 lives and a saved best score. |
| 6 | **Crows** | **Draw** any shape and 360 crows fly into it. **Hold** still for a vortex, **flick** for a gust, **tap** to scatter. Preset shapes are also available. Find Shisui's red-eyed crow. |
| 7 | **Amaterasu** | **Stare** (hold) to ignite black flames where you look, then **keep dragging** to paint fire. The flames are shader-drawn, black with a violet rim, and they spread and burn logs to ash. **Swipe down** to close the eye. Chakra is limited. |
| 8 | **Tsukuyomi** | **Hold anywhere** to cast: the world turns red and black and 72 hours pass. **Tap** the mirror water to ripple it. A torii gate and stone lanterns stand in the water. Includes the Izanami loop. |
| 9 | **Susanoo** *(game)* | **Swipe up** to manifest each stage and **down** to recede. **Slash** to swing the Totsuka Blade. **Hold** to raise the Yata Mirror. The scene has a thunderstorm with rain and lightning. **Hold the Line**: seal shadow shinobi with slashes and reflect their attacks with the mirror. |
| 10 | **Trials** | An 8-question quiz where each correct answer adds a tomoe. Includes flip-card trivia. |

## Sound

- The soundtrack is generated live in the Japanese Hirajoshi scale: koto, shakuhachi, taiko, temple bells and a drone.
- It changes with each chapter's mood (calm, mystic, tension, battle, genjutsu).
- The top bar has a **music toggle** and a **mute-all** button. **M** mutes everything.
- Your choice is remembered between visits.

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
