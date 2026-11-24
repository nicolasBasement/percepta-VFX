# Percepta — Particle Studio

A local Three.js particle studio with DialKit controls, complete look presets, model morphing, interactive particle flow, lighting and postprocessing.

## Run

From the project root:

```powershell
npm run dev
```

Open http://localhost:5173. Requires Node.js 20+ and a WebGL2 browser. There is no build step or package installation: Three.js 0.180.0 and DialKit 2.2.1 (vanilla adapter) are vendored locally. To use another port, set `$env:PORT=5174` before starting.

## Workspace

- **Model library:** import, select and remove models on the left.
- **Viewport:** drag to orbit, scroll to morph, use + / − to zoom and the image button to download a PNG.
- **Timeline:** scrub or play the sequence. On a focused viewport, arrows move the morph, Home/End select its extremes and Space toggles playback.
- **Appearance:** global looks, particle count, point size and motion on the left.
- **Particle editor:** direct section shortcuts and a single selected layer on the right. Shape, Color, Pattern, Sprite, Mouse, Bloom, Light, Atmosphere, Camera and Zoom reveal each use one flat section. The panel appears below the viewport on small screens.
- **Presets:** a separate DialKit version menu at the top of the editor, with named save and JSON import/export.

### Presets

Enter a name and click **Save preset**. Use the **Presets menu** to switch looks. DialKit retains the selected version and edits in browser storage. Saving a new version carries the current edits into that version.

Each version includes global settings, all four layers, light, atmosphere, postprocessing, interaction, camera framing and reveal settings. Enabled layers determine which of the four slots render. A layer can be renamed and reset independently.

**Import preset / Export preset** transfers a JSON file containing settings and any referenced sprite images. Exported presets do not depend on temporary blob URLs. Sprite files are stored in IndexedDB and referenced by stable content IDs in the presets; large images do not consume localStorage space.

Model files and their sequence are separate from look presets. Load them again after a page refresh. Presets and images stay local to the browser; nothing is uploaded to a service.

### Particles and layers

The global density is 10,000–90,000 samples per visible layer. Point size, morph scatter and organic motion are independent. Global looks: Mono, LiDAR, Texture and Paper.

Each layer has its own visibility, name, shape, size, opacity, rotation, edge softness, surface offset, blending, color and distribution pattern. Shapes include circle, square, diamond, ring, star, cross and sprite. Colors can follow the global look, use a solid color, height gradient, random blend or model texture.

Patterns include the organic surface, 3D grid, scan lines, 3D checker and concentric rings. The grid aligns positions; other patterns filter surface samples. Each layer can opt out of mouse interaction and lighting.

### Sprites and atlases

Select a layer and open **Sprite / atlas**. Upload a PNG, WebP or JPG up to 16 MB and 4096 × 4096 px, or use the generated example atlas. Choose a stored image from **Saved sprites** and inspect it in the inline preview.

- Set columns and rows to 1 × 1 for a single sprite, or up to 16 × 16 for an atlas.
- Frames run left to right, then top to bottom. The frame index starts at 0.
- Choose a fixed frame, a random frame per particle, or animation at 1–30 fps.
- Tint multiplies the image by the layer color. Background removal supports black or white.
- Cell aspect ratio and transparency are preserved. Rendered point size is capped at 96 physical pixels.
- Increase layer scale and lower density to make sprite artwork easier to see.

### Interaction

**Particle flow** gives each point an independent GPU displacement and velocity. The cursor drives a 2D velocity field; individual mobility, direction and damping break up the surface into grains. A stationary cursor injects no new force. Points slow and recover without a spring or rebound.

**Mixed flow · carry & grow** adds temporary contact memory. A soft, scattered subset follows the cursor beyond the silhouette; each point releases at a different time and returns to rest.

- **Carry → Blend:** pursuit strength relative to flow and recovery.
- **Release After:** maximum follow duration in seconds, from 0.3 to 3.5. Each point uses 55–100% of this duration.
- **Growth:** size increase in percent, up to +200%, with smooth onset and release. Use 0 for motion only.
- Leaving the viewport, starting an orbit drag or losing focus releases contact.

Other modes are radial repel, attract, vortex, waves and no interaction. On touchscreens, dragging orbits the camera.

The flow is a particle effect guided by a 2D current, not an incompressible fluid simulation. Contact uses projected surface samples, without volumetric collision or occlusion testing. Floating-point render targets enable individual dynamics and temporary carry; unsupported devices use basic flow.

### Lighting, atmosphere and finish

Lighting can be directional, point or a spotlight toward the center. Position, color and intensity control face visibility and particle size. Point and spot lights include distance falloff; spots also have an adjustable cone. Shadow fill restores particles on faces pointing away from the light. This is face-normal illumination, without cast shadows or surface-to-surface occlusion.

Atmosphere combines depth fog, low fog, haze, suspended dust and a floor particle field. Haze is a visual approximation, not physical volumetric light scattering.

Finish includes bloom strength/radius/threshold, exposure, vignette and film grain. The PNG capture includes postprocessing. Disable Finish to compare with the direct render.

### Camera

Use stable framing, mouse parallax, breathing, morph travel or a combined cinematic mode. Manual orbit and zoom synchronize with saved preset framing.

Zoom reveal supports playback, progress scrubbing, duration and start/end distances.

**Prepare macro pull back** adds a detail-to-whole reveal inspired by a camera retreating from a point cloud. It picks a nearby surface detail near the center of the current view and prepares a 20-second shot: a 0.55-unit close-up, a smooth geometric pull back to 13.5 units, and a final 20% camera hold. Click **Play reveal** to run it. Particles stay visible from the first frame and grow with perspective in close-ups.

Use **Focus on visible detail** after orbiting to another side, or adjust Detail X/Y/Z. Duration (1–30 seconds), start/end distance (0.2–30), final hold (0–40%), and progress can be edited and saved in presets. Macro camera travel temporarily suppresses auto orbit and camera feedback; dragging releases camera control. Restart returns directly to the same detail. The existing fade mode remains available under **Reveal style**. The model and its particle density determine how sparse the close-up looks.

 The Approach and Pull Back actions set useful distance pairs. Reveal mode is off on every startup, including when the previous session saved it as enabled. Scroll changes models by default. Enabling reveal mode switches scroll to the reveal; disabling it stops playback, restores the previous model view, and returns scroll to model navigation. The Scroll selector is available while reveal mode is enabled. Reveal pauses morph playback; manual orbit or zoom releases automatic camera movement. Reset Camera also disables reveal.

Reduced-motion preferences start with stable camera feedback and disable continuous organic motion and atlas playback. Explicit playback and manual controls remain available.

## Model files

GLB with embedded PNG/JPG textures is recommended. For glTF, select the JSON, .bin and image files together. Referenced files in subfolders are matched by basename; duplicate names in one import are rejected. OBJ imports geometry without external MTL/textures.

Texture mode samples base color through UVs and combines it with material and vertex color. UV transforms and color space are respected. Missing textures fall back to material color. PBR illumination, normal maps and alpha-cutout textures are not reproduced.

Models are centered and normalized to a shared scale. Sampling uses the initial pose, including skinning and transforms; animation clips are not played. Draco and Meshopt are included. KTX2 is not supported.

Limits: six models, 100 MB per import and two million triangles per model. Files are processed locally in memory. Spatial Morton ordering gives approximate morph correspondence, not semantic matching of object parts.

## Implementation

- `demo/dist/app.js`: scene, file import, model sequence, renderer and application lifecycle.
- `dial-studio.js`: real DialKit vanilla controls, complete scene presets, camera synchronization and portable JSON presets.
- `sprite-library.js`: validated local image storage in IndexedDB.
- `surface.js`: area-weighted surface sampling, UV/color sampling and procedural examples.
- `shaders.js`: GPU morph, appearance, patterns, lighting, fog and sprite rendering.
- `particle-editor.js`: layer resources and appearance, atlas loading and pointer tracking.
- `flow-field.js`: 96 × 96 advected velocity field.
- `particle-dynamics.js`, `particle-carry.js`: individual GPU state, temporary pursuit and release.
- `scene-fx.js`: atmosphere volumes and camera feedback.
- `cinematic-effects.js`: bloom/postprocessing, light controls and reveal.
- `style.css`, `studio.css`: responsive shell and DialKit integration.
- `demo/server.mjs`: dependency-free local HTTP server.

The familiar form controls are visible again. DialKit retains the version store, preset menu and portable preset schema. The adapter synchronizes form edits back to that store, and preset loads update both controls and GPU state. There are no nested settings folders. The same four layer slots and existing saved presets remain compatible. Models and timeline navigation stay outside the settings panel.

## Validation

The DialKit migration passed 40 browser checks:

- 17 control/preset checks covering actual GPU uniforms, density, layers, lighting, atmosphere, camera framing, sprite upload, named versions and storage.
- 12 reload/portable-preset checks covering the active version, image restoration, embedded export data, import, invalid input, reveal playback/reset and color conversion.
- 11 model regression checks covering textured GLB sampling, GLB/OBJ import, external glTF resources, invalid geometry, missing resources, removal, morph, scroll and playback.

The new checks are in `demo/tests/dial-studio-check.js` and `dial-persistence-check.js`. Run the first exported function in the loaded page context, reload, then run the second. They use temporary QA presets and sessionStorage backup keys; restore that backup afterward. The model checks are in `browser-check.js`.

Desktop and 390 × 844 mobile layouts were visually reviewed without horizontal overflow. Normal loading and preset use produced no console errors. Invalid-model tests intentionally produce warnings. Previous GPU tests for lighting, postprocessing, flow, carry and sprite scale remain in `demo/tests/`.

The site runs locally and has not been published to external hosting.

## Dependencies

- [DialKit documentation](https://www.dialkit.dev/agent) and [API reference](https://github.com/joshpuckett/dialkit/blob/main/docs/reference.md). Version 2.2.1, MIT; license at `demo/dist/vendor/dialkit/LICENSE`.
- [Three.js](https://threejs.org/), version 0.180.0, MIT; license at `demo/dist/vendor/LICENSE`.

### Simplified editor validation (v.08)

Nine checks in `demo/tests/simple-editor-check.js` verify visible form → GPU → preset synchronization, selected-layer editing, visibility, light/bloom, complete form restoration, direct section navigation and English labels. The presets and stored sprites remain compatible with v.07.

### Macro pull back validation

`demo/tests/macro-reveal-check.js` checks detail preparation, monotonic travel, final hold, restart/replay, manual interruption, scroll routing, shared GPU state, preset serialization/restoration and reset. `lighting-reveal-gpu-check.js` also checks first-frame visibility, perspective point growth and unchanged floor rendering. The 15 macro checks, 16 lighting/reveal GPU checks and 10 existing camera checks passed in the browser. Reload restores the macro recipe, but starts with reveal mode off and model scrolling enabled.

The macro studio migrates existing presets into a separate persistence key so older open tabs cannot clamp macro distances or switch its reveal mode. Background tabs do not publish animation progress. Use **Show full model** in Zoom reveal to exit the reveal and restore the overview. Verified with an old tab writing incompatible settings while the macro continued playing.
