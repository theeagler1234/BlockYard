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
3. Physics (decision pending, see below), then model maker + .obj/.gltf import
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
| `game.orbit = false` | stop the mouse from moving the camera |
| `game.time` | seconds since the game started |
| `game.THREE`, `game.scene`, `game.camera` | the raw three.js objects, when you outgrow the basics |

Files can import each other with relative paths (`import { x } from './scripts/player.js'`).
Games run inside a sandboxed frame, so they can't touch your saved projects. Turn on **Potato mode**
in the Play tab to render at a lower resolution without antialiasing.

## Projects
Projects live in your browser (IndexedDB). You can start fresh, upload a .zip, or copy a public GitHub repo
(Git LFS files are fetched automatically). Private repos need a personal access token.
