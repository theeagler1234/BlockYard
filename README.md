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
2. Code editor
3. Model maker + .obj/.gltf import
4. One-click publish helper

## Projects
Projects live in your browser (IndexedDB). You can start fresh, upload a .zip, or copy a public GitHub repo
(Git LFS files are fetched automatically). Private repos need a personal access token.
