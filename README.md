# Blockyard

A beginner-friendly 3D game maker that runs in the browser.

## Run locally
ES modules need a server (not file://). From this folder:
    python3 -m http.server 8000
Then open http://localhost:8000

## Deploy this project
1. Push to a GitHub repo's `main` branch.
2. Repo Settings > Pages > Source: **GitHub Actions**.
3. The included workflow publishes the site on every push.

## Roadmap
1. Scene editor (done): shapes, move/rotate/scale, properties
2. Code editor (done) and Play tab (done)
3. Simple physics (done: gravity and solid faces), then model maker + .obj/.gltf import
4. One-click publish helper

## Writing game code

Open the Code tab and edit `game.js`, then press **Play**. Two optional functions:

```js
export function start(game) { }            // runs once
export function update(seconds, game) { }  // runs every frame
```

The `game` object:

| | |
|---|---|
| `game.find('Cube 1')` | get a thing by its name (or `null`) |
| `game.add('Sphere', { x: 0, y: 2, z: 0, color: '#ff0000' })` | make a new thing |
| `thing.move(x, y, z)` / `thing.rotate(x, y, z)` | nudge it (rotation is in radians) |
| `thing.position`, `thing.rotation`, `thing.scale`, `thing.color`, `thing.visible` | read or set directly |
| `thing.remove()` | delete it |
| `game.keys.down('left')` / `game.keys.pressed('space')` | keyboard (held / just pressed) |
| `thing.collisions = false` | let things pass through it (also the **Collisions** checkbox in the Scene editor) |
| `thing.falls = true` | give it gravity |
| `thing.velocity.x / .y / .z` | how fast a falling thing moves, in units per second |
| `thing.hit.down` | what it is standing on, or `null` (also `up`, `left`, `right`, `forward`, `back`) |
| `thing.onHit = (face, other) => {}` | runs when a face first touches something |
| `game.physics.gravity = -20` | how hard things fall (0 turns it off) |
| `game.orbit = false` | stop the mouse from moving the camera |
| `game.time` | seconds since the game started |
| `game.THREE`, `game.scene`, `game.camera` | the raw three.js objects, when you outgrow the basics |

Files can import each other with relative paths (`import { x } from './scripts/player.js'`).
Games run inside a sandboxed frame, so they can't touch your saved projects. Turn on **Potato mode**
in the Play tab to render at a lower resolution without antialiasing.

## Projects
Projects live in your browser (IndexedDB). You can start fresh, upload a .zip, or copy a public GitHub repo
(Git LFS files are fetched automatically). Private repos need a personal access token.

## How physics works

Deliberately small, so it runs on a potato:

- **The world is anchored.** Things never move on their own and nothing pushes them. A thing you
  don't mark `falls` is part of the world, and `thing.collisions` decides whether it is solid.
- **Only things with `falls = true` move.** They get gravity, land on solid things, and stop
  at walls and ceilings. Falling things don't collide with each other.
- **Collisions use boxes.** Every shape is treated as its bounding box, so a sphere or cone acts
  like a box. Rotated world pieces get a looser box. A falling thing ignores its own rotation.
- **Directions:** forward is -z (the way the starting camera looks), right is +x, up is +y.
- **Moving things by hand:** `move()` and setting `position` teleport and skip collisions. Use
  `velocity` for anything that should respect walls.
- **No moving platforms.** Anchored things don't carry or push anything.
- **Don't start inside a solid thing.** There is no "get unstuck" logic.

Run the physics tests with `node tests/physics.mjs`.
