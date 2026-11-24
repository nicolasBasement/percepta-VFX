import * as THREE from 'three';

export function random(seed = 123456) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function lowerBound(array, value) {
  let lo = 0, hi = array.length - 1;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (array[mid] < value) lo = mid + 1; else hi = mid; }
  return lo;
}
function morton(x, y, z) {
  function bits(n) { n &= 1023; n = (n | n << 16) & 0x030000FF; n = (n | n << 8) & 0x0300F00F; n = (n | n << 4) & 0x030C30C3; return (n | n << 2) & 0x09249249; }
  return (bits(x) | bits(y) << 1 | bits(z) << 2) >>> 0;
}
const textureCache = new WeakMap();
function texturePixels(texture) {
  if (!texture?.image) return null;
  if (textureCache.has(texture)) return textureCache.get(texture);
  const image = texture.image;
  if (texture.isCompressedTexture) throw new Error('This texture uses KTX2 compression. Export a GLB with PNG or JPG textures.');
  const width = Math.min(2048, image.width || 1), height = Math.min(2048, image.height || 1);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try { ctx.drawImage(image, 0, 0, width, height); }
  catch { throw new Error('Could not read a texture. Use a GLB with embedded PNG or JPG images.'); }
  const result = { data: ctx.getImageData(0, 0, width, height).data, width, height };
  textureCache.set(texture, result); return result;
}
export async function sampleSurface(root, count) {
  root.updateMatrixWorld(true);
  const records = [], cumulative = [], bounds = new THREE.Box3();
  let totalArea = 0, triangles = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    if (mesh.isSkinnedMesh) mesh.skeleton.update();
    const g = mesh.geometry, position = g.attributes.position, index = g.index;
    const instances = mesh.isInstancedMesh ? mesh.count : 1;
    const nFaces = Math.floor((index ? index.count : position.count) / 3);
    triangles += nFaces * instances;
    if (triangles > 2000000) throw new Error('The model exceeds 2 million triangles. Simplify it before importing.');
    for (let instance = 0; instance < instances; instance++) {
      const matrix = mesh.matrixWorld.clone();
      if (mesh.isInstancedMesh) { const local = new THREE.Matrix4(); mesh.getMatrixAt(instance, local); matrix.multiply(local); }
      const vertices = new Float32Array(position.count * 3);
      for (let v = 0; v < position.count; v++) {
        mesh.getVertexPosition(v, a); a.applyMatrix4(matrix);
        if (![a.x, a.y, a.z].every(Number.isFinite)) throw new Error('The model contains invalid coordinates.');
        a.toArray(vertices, v * 3); bounds.expandByPoint(a);
      }
      const areas = new Float64Array(nFaces);
      let sum = 0;
      for (let f = 0; f < nFaces; f++) {
        const offset = f * 3;
        a.fromArray(vertices, (index ? index.getX(offset) : offset) * 3);
        b.fromArray(vertices, (index ? index.getX(offset + 1) : offset + 1) * 3);
        c.fromArray(vertices, (index ? index.getX(offset + 2) : offset + 2) * 3);
        sum += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() * .5;
        areas[f] = sum;
      }
      if (sum > 0) { totalArea += sum; cumulative.push(totalArea); records.push({ mesh, g, index, vertices, areas, area: sum }); }
    }
  });
  if (!records.length || !Number.isFinite(totalArea)) throw new Error('No valid triangular surface was found in this model.');
  const center = bounds.getCenter(new THREE.Vector3()), extent = bounds.getSize(new THREE.Vector3());
  const scale = 5.2 / Math.max(extent.x, extent.y, extent.z);
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  const rng = random(8675309), uv = new THREE.Vector2(), color = new THREE.Color(), texColor = new THREE.Color();
  const keys = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const r = records[lowerBound(cumulative, rng() * totalArea)];
    const face = lowerBound(r.areas, rng() * r.area), off = face * 3;
    const ia = r.index ? r.index.getX(off) : off, ib = r.index ? r.index.getX(off + 1) : off + 1, ic = r.index ? r.index.getX(off + 2) : off + 2;
    a.fromArray(r.vertices, ia * 3); b.fromArray(r.vertices, ib * 3); c.fromArray(r.vertices, ic * 3);
    ab.subVectors(b, a).cross(ac.subVectors(c, a)).normalize().toArray(normals, i * 3);
    const sqrt = Math.sqrt(rng()), wa = 1 - sqrt, wb = sqrt * (1 - rng()), wc = 1 - wa - wb;
    const px = (a.x * wa + b.x * wb + c.x * wc - center.x) * scale;
    const py = (a.y * wa + b.y * wb + c.y * wc - center.y) * scale;
    const pz = (a.z * wa + b.z * wb + c.z * wc - center.z) * scale;
    positions.set([px, py, pz], i * 3);
    keys[i] = morton(Math.floor((px / 5.3 + .5) * 1023), Math.floor((py / 5.3 + .5) * 1023), Math.floor((pz / 5.3 + .5) * 1023));
    const group = r.g.groups.find(group => off >= group.start && off < group.start + group.count);
    const material = Array.isArray(r.mesh.material) ? r.mesh.material[group?.materialIndex || 0] : r.mesh.material;
    color.copy(material?.color || new THREE.Color('#d9dfd4'));
    const vc = r.g.attributes.color;
    if (vc) { color.r *= vc.getX(ia) * wa + vc.getX(ib) * wb + vc.getX(ic) * wc; color.g *= vc.getY(ia) * wa + vc.getY(ib) * wb + vc.getY(ic) * wc; color.b *= vc.getZ(ia) * wa + vc.getZ(ib) * wb + vc.getZ(ic) * wc; }
    const tex = material?.map;
    const uvs = r.g.attributes[tex?.channel ? 'uv' + tex.channel : 'uv'];
    if (tex && uvs) {
      const pixels = texturePixels(tex);
      if (pixels) {
        uv.set(uvs.getX(ia) * wa + uvs.getX(ib) * wb + uvs.getX(ic) * wc, uvs.getY(ia) * wa + uvs.getY(ib) * wb + uvs.getY(ic) * wc);
        tex.updateMatrix(); tex.transformUv(uv);
        const x = THREE.MathUtils.clamp(Math.floor(uv.x * pixels.width), 0, pixels.width - 1), y = THREE.MathUtils.clamp(Math.floor(uv.y * pixels.height), 0, pixels.height - 1);
        const p = (y * pixels.width + x) * 4;
        texColor.setRGB(pixels.data[p] / 255, pixels.data[p + 1] / 255, pixels.data[p + 2] / 255, tex.colorSpace === THREE.SRGBColorSpace ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace);
        color.multiply(texColor);
      }
    }
    color.toArray(colors, i * 3);
    if (i > 0 && i % 10000 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  // Spatial ordering makes nearby regions travel together, independent of mesh topology.
  const order = Uint32Array.from({ length: count }, (_, i) => i); order.sort((a, b) => keys[a] - keys[b]);
  function ordered(input) { const result = new Float32Array(input.length); for (let i = 0; i < count; i++) { const j = order[i] * 3; result.set(input.subarray(j, j + 3), i * 3); } return result; }
  return { positions: ordered(positions), normals: ordered(normals), colors: ordered(colors), triangles, count };
}
export function disposeModel(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  root.traverse(obj => { if (obj.geometry) geometries.add(obj.geometry); if (obj.material) for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(m); });
  for (const m of materials) { for (const value of Object.values(m)) if (value?.isTexture) { textures.add(value); if (value.image?.close) images.add(value.image); } m.dispose(); }
  geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); images.forEach(i => i.close());
}
export function makeExamples() {
  const city = new THREE.Group(), orbit = new THREE.Group(), tower = new THREE.Group();
  const rng = random(37);
  const palette = ['#c8d1be','#9ba6c2','#d6b7a6','#a1bda8'];
  function box(parent, size, at, color) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({color})); mesh.position.set(...at); parent.add(mesh); return mesh; }
  // A small architectural study, with setbacks and an actual street grid.
  box(city, [8, .12, 7], [0, -.08, 0], '#626c7b');
  for (let x = -3; x <= 3; x += 1.2) for (let z = -2.6; z <= 2.6; z += 1.3) {
    if (Math.abs(x) < .5 || (x > 1 && z > 1)) continue;
    const h = .6 + rng() * 2.4, width = .64 + rng() * .26, depth = .7 + rng() * .22;
    const color = palette[Math.floor(rng() * palette.length)];
    box(city, [width,h,depth], [x,h/2,z], color);
    if (h > 1.7) box(city, [width*.68,.23,depth*.7], [x,h+.115,z],color);
    for (let y = .18; y < h; y += .3) box(city,[width+.02,.035,depth+.02],[x,y,z],'#8e9baf');
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85,.47,60,180),new THREE.MeshStandardMaterial({color:'#d0b48e'}));
  ring.rotation.x = .45; ring.rotation.y = -.25; orbit.add(ring);
  function beam(p1,p2,r=.045,color='#aebcc8') {
    const start=new THREE.Vector3(...p1), end=new THREE.Vector3(...p2), dir=end.clone().sub(start);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,dir.length(),6),new THREE.MeshStandardMaterial({color}));
    mesh.position.copy(start.add(end).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());tower.add(mesh);
  }
  const levels=[{y:0,w:1.15},{y:1.3,w:.78},{y:2.6,w:.45},{y:3.8,w:.34},{y:4.9,w:.18}];
  for(let j=0;j<levels.length-1;j++){
    const a=levels[j],b=levels[j+1];
    for(const sx of [-1,1])for(const sz of [-1,1]){
      beam([sx*a.w,a.y,sz*a.w],[sx*b.w,b.y,sz*b.w],.055);
      beam([sx*a.w,a.y,sz*a.w],[-sx*b.w,b.y,sz*b.w],.027);
      beam([sx*a.w,a.y,sz*a.w],[sx*b.w,b.y,-sz*b.w],.027);
      beam([sx*a.w,a.y,sz*a.w],[-sx*a.w,a.y,sz*a.w],.035);
    }
  }
  for(const [y,w] of [[3.1,1.6],[4.1,1.35],[4.8,1.05]]){
    beam([-w,y,0],[w,y,0],.065);beam([-w,y,0],[0,y+.4,0]);beam([w,y,0],[0,y+.4,0]);
    for(const x of [-w,w]){beam([x,y,0],[x,y-.35,0],.045,'#b4c886');for(let t=0;t<4;t++)box(tower,[.15,.035,.15],[x,y-.1-t*.07,0],'#c1d3a1');}
  }
  beam([0,4.8,0],[0,5.5,0],.04);
  return [
    { name:'City', detail:'Architecture in points', icon:'▥', root:city, origin:'EXAMPLE / SURFACE' },
    { name:'Orbit', detail:'A suspended form', icon:'◎', root:orbit, origin:'EXAMPLE / SURFACE' },
    { name:'Tower', detail:'Structure, space and connections', icon:'♜', root:tower, origin:'EXAMPLE / SURFACE' }
  ];
}
