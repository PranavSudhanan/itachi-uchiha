Optional scene music
====================

By default every scene plays its own original, synthesized theme (src/core/Audio.js).

To use recorded music for a scene instead, put an audio file here named after the scene's id:

  prologue.mp3   chronicle.mp3   relics.mp3    training.mp3   precognition.mp3
  crows.mp3      amaterasu.mp3   tsukuyomi.mp3 susanoo.mp3    trials.mp3

(.ogg, .m4a and .wav work too.) Or list them in tracks.json, which maps scene ids to files, so one
clip can serve several scenes, each with its own level ("gain", 0 to 1). tracks.json is checked first. An entry can also name a "battle" clip that takes over while the
scene's action runs (a trial, a fight, a game) and hands back when it ends.
Short clips loop seamlessly: each pass crossfades into the next. It loops, fades in when the scene opens, and the synthesized score steps
aside while it plays. Remove the file to go back to the original theme.

Only add music you have the right to use and publish (your own compositions, royalty-free or
properly licensed tracks). Official anime soundtrack recordings are copyrighted and can't be
redistributed on a public site without a licence.
