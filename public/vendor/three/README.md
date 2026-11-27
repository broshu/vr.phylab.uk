three.js 0.187.0 (MIT) with OrbitControls, USDZExporter (for Apple AR Quick Look) and mergeGeometries, bundled and minified with esbuild.
Rebuild: entry exporting * from "three", OrbitControls, USDZExporter and mergeGeometries, then esbuild --bundle --minify --format=esm.

addons.min.js: GLTFLoader, HDRLoader and MeshoptDecoder from three 0.187.0 (examples/jsm), bundled with esbuild with "three" pointing at /vendor/three/three.min.js:
entry exporting { GLTFLoader }, { HDRLoader }, { MeshoptDecoder }; esbuild --bundle --minify --format=esm --alias:three=<shim re-exporting /vendor/three/three.min.js> --external:/vendor/three/three.min.js
