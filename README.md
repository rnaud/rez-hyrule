# REZ: HYRULE

**Awaken the Triforce. Become the light on the rails.**

A Rez-inspired rail shooter set in a vector-lit Hyrule, built from scratch with [three.js](https://threejs.org/).
Fly the sacred rails, paint lock-on sigils across the malice, and release them in time with a generative
synth-score. Four regions, four guardians, one Triforce.

**▶ [Play REZ: HYRULE in your browser](https://rnaud.github.io/rez-hyrule/)**

![REZ: HYRULE title screen](screenshots/title.png)

## Play in your browser

The live build is deployed to GitHub Pages: **<https://rnaud.github.io/rez-hyrule/>**

To run it locally:

```bash
npm install
npm run dev
```

Open **http://127.0.0.1:5173** and click **Awaken**. Turn the sound on — the score is part of the game.
Headphones are recommended.

For a production build:

```bash
npm run build
npm run preview
```

Requires Node 20.19+ and a browser with WebGL 2 and Web Audio (current Chrome, Safari, Firefox).

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Aim the reticle | Move the mouse, or arrow keys / WASD | Drag |
| Lock onto a target | Hold **LMB**, **Space**, or **Z** | Press and hold |
| Fire all locks | Release | Release |
| Pause | **Esc** / **P**, or the pause button | Pause button |
| Mute | **M** | Pause menu |
| Fullscreen | **F** | — |
| Confirm / advance | **Enter** | Tap |

Sweep the reticle across several enemies while holding to stack locks (four at first, up to eight as you
awaken). Release to send a volley of homing light. Releasing on the beat grants a **Harmony** bonus and
adds extra notes to the music.

**Take your time.** Foes fly in, then hold station in front of you for several seconds — their targeting
halo appears when they settle. That is your lock-on window. Once it expires they swoop past harmlessly — a missed foe costs you its score and rupees, never a heart.
Incoming fire is what costs health, and killing the caster clears its orbs in flight.

## The legend

The kingdom has been stitched shut with malice. As the spirit of the hero, follow the old light through
four rails:

1. **Hyrule Field** — the golden plain, where a Master Sword stands sentinel and Hyrule Castle smoulders on
   the horizon. Guardian: **Gohma, the Cursed Eye**.
2. **The Lost Woods** — lanterns, hollow trees and a forest that listens. Guardian: **The Ancient Bloom**.
3. **Death Mountain** — lava fissures, obsidian arches and a volcano breathing embers. Guardian:
   **King Dodongo**.
4. **Hyrule Castle** — a throne room of malice and the last shade of Ganon. Guardian: **The Malice Eye**.

Each defeated guardian yields a Triforce fragment (Power, Courage, Wisdom), a heart container, and a
respite before the next rail.

### Systems

- **Lock-on volleys** — hold to acquire, sweep to stack, release to fire; targets that die before the volley
  are quietly dropped from it.
- **Harmony** — release on a quarter-note beat for bonus points, extra awaken charge, and a brighter shot.
- **Awaken 1→10** — destroy malice to awaken further. Level increases your lock capacity and opens new
  layers of the score (percussion → arpeggio → pads → lead → shimmer). Taking a hit drains awaken charge
  and can pull you back a level.
- **Hearts & heart containers** — start with four hearts. Common enemy fire costs a quarter heart, guardian fire costs half; heart drops and permanent containers keep the run alive.
- **Rupees** — collected from every foe; every hundred rupees restores a little life.
- **Shot-down rate, ranks, and a persistent best score** — every run ends on a results screen.
- **Touch support** — a full touch control scheme with an on-screen pause button.

## What's inside

Everything you see and hear is generated at runtime:

- A hand-written procedural **wireframe art library** (Link, Keese, Octoroks, Deku Babas, Stalfos, Beamos,
  Wizzrobes, and four guardians). No downloaded models or textures.
- Four **procedural stage corridors** assembled from line batches, each with its own palette, landmarks,
  skyline, gates, particles and lighting mood.
- A **Web Audio synth-score**: four layered, generative songs with a beating kick, sub bass, hats, arps,
  pads, bell motifs, reverb and tempo-locked player notes. Player shots are quantized into the current
  chord and become part of the music.
- A **bloom post-processing** chain (EffectComposer + UnrealBloomPass + OutputPass) over additive vector
  lines, plus a CSS HUD with a live lock-on reticle.

## Project layout

```
index.html               shell + HUD markup
src/main.js              boot & frame loop
src/style.css            the interface and all screen layouts
src/game/
  Game.js                state machine, waves, scoring, targeting, run flow
  World.js               renderer, bloom composer, sky dome, chase camera
  Rail.js                arc-length sampled spline rails
  Player.js              the hero's flight, aura, sword and aiming
  models.js              procedural Link, bestiary and boss vector models
  enemies.js             enemy kinds, behaviours, formations
  boss.js                four guardian fights and their weak points
  projectiles.js         malice orbs (targetable!)
  effects.js             particles, shockwaves and homing light beams
  environment.js         procedurally built Hyrule Field / Woods / Mountain / Castle
  stages.js              palettes, songs, poems, bestiary weights, boss configs
  AudioEngine.js         generative soundtrack + synthesized SFX
  Hud.js, screens.js     DOM HUD, menus, results, title and pause screens
  Input.js, util.js      pointer/keyboard aiming and math/line-batch helpers
src/fonts/               bundled Cinzel, Cormorant Garamond and Rajdhani subsets
screenshots/             captures from the finished build
licenses/                SIL Open Font License texts for the bundled fonts
```

## Notes

- The game never makes a network request at runtime; fonts and code are local.
- Browser autoplay policy means the soundtrack begins on your first interaction (the **Awaken** click/keypress).
- Rendering is capped at 1.75× device pixel ratio. If the ride feels heavy, close other WebGL tabs; bloom is
  the costly part.
- This is an unofficial fan tribute in the spirit of Sega's **Rez** and Nintendo's **The Legend of Zelda**.
  It is not affiliated with or endorsed by either company. All code, procedural geometry, UI, text and music
  were created for this project. The bundled fonts are used under the SIL Open Font License (see `licenses/`).
