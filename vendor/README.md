# Vendored rendering library

Three.js **0.160.1**, MIT license. Source files are checked in so both GitHub Pages
and the downloadable HTML work without a CDN or npm installation.

- `three.module.min.js`: https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.min.js
- `BufferGeometryUtils.js`: https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/utils/BufferGeometryUtils.js
  (only its `three` import was changed to the adjacent local module)
- `THREE-LICENSE.txt`: upstream license, retained in this repository and embedded
  at the start of the standalone build by `scripts/build-download.js`.

Original pig meshes, animation poses, procedural textures, and game logic live
outside this folder. No third-party character models are bundled.
