export default async () => {
 const {sampleSurface,disposeModel}=await import('./surface.js'); const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const wait=ms=>new Promise(r=>setTimeout(r,ms)), results=[];
 function check(name,condition,detail){results.push({name,pass:!!condition,detail});if(!condition)throw new Error(name+': '+JSON.stringify(detail));}
 const tex=document.createElement('canvas');tex.width=4;tex.height=4;const ctx=tex.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,2,4);ctx.fillStyle='#00ff00';ctx.fillRect(2,0,2,4);
 const positions=new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,-1,0,1,1,0,-1,1,0]);
 const uv=new Float32Array([0,0,1,0,1,1,0,0,1,1,0,1]);
 const buffer=new Uint8Array(positions.byteLength+uv.byteLength);buffer.set(new Uint8Array(positions.buffer));buffer.set(new Uint8Array(uv.buffer),positions.byteLength);
 const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,TEXCOORD_0:1},material:0}]}],buffers:[{byteLength:buffer.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength},{buffer:0,byteOffset:positions.byteLength,byteLength:uv.byteLength}],accessors:[{bufferView:0,componentType:5126,count:6,type:'VEC3',min:[-1,-1,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:6,type:'VEC2'}],images:[{uri:tex.toDataURL()}],textures:[{source:0}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0}}]};
 const json=new TextEncoder().encode(JSON.stringify(gltf)),jsonLength=Math.ceil(json.length/4)*4,total=12+8+jsonLength+8+buffer.length;
 const glb=new ArrayBuffer(total),view=new DataView(glb),bytes=new Uint8Array(glb);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,total,true);view.setUint32(12,jsonLength,true);view.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+jsonLength);bytes.set(json,20);view.setUint32(20+jsonLength,buffer.length,true);view.setUint32(24+jsonLength,0x004e4942,true);bytes.set(buffer,28+jsonLength);
 const model=await new GLTFLoader().parseAsync(glb,'');const sampled=await sampleSurface(model.scene,3000);let red=0,green=0;
 for(let i=0;i<sampled.count;i++){const c=sampled.colors;red+=c[i*3]>.8&&c[i*3+1]<.1;green+=c[i*3+1]>.8&&c[i*3]<.1;}
 check('GLB: texture UV sampling',red>900&&green>900,{red,green});
 check('Sampling: all coordinates finite',sampled.positions.every(Number.isFinite),sampled.count);
 check('Sampling: centered normalized scale',Math.max(...sampled.positions)<=2.61&&Math.min(...sampled.positions)>=-2.61);disposeModel(model.scene);
 async function upload(files){const transfer=new DataTransfer();files.forEach(f=>transfer.items.add(f));const input=document.getElementById('file-input');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await wait(50);let attempts=0;while(!window.percepta.getState().ready&&attempts++<100)await wait(100);}
 await upload([new File([glb],'QA-textured.glb'),new File(['v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'],'QA-triangle.obj')]);
 check('Import: GLB and OBJ in one selection',window.percepta.getState().models.length===5,window.percepta.getState().models);
 await upload([new File(['invalid obj'],'QA-invalid.obj')]);
 check('Invalid geometry: rejected without changing sequence',window.percepta.getState().models.length===5&&document.getElementById('toast').textContent.includes('surface'),document.getElementById('toast').textContent);
 const external=structuredClone(gltf);external.buffers[0].uri='geometry.bin';external.images[0].uri='colors.png';
 const png=await (await fetch(tex.toDataURL())).arrayBuffer();
 await upload([new File([JSON.stringify(external)],'QA-external.gltf'),new File([buffer],'geometry.bin'),new File([png],'colors.png',{type:'image/png'})]);
 check('glTF with external geometry and texture',window.percepta.getState().models.length===6,window.percepta.getState().models.length);
 document.querySelectorAll('.remove')[5].click();
 const broken=structuredClone(gltf);broken.buffers[0].uri='missing.bin';
 await upload([new File([JSON.stringify(broken)],'QA-missing.gltf')]);
 check('Missing glTF sidecar: explicit error',window.percepta.getState().models.length===5&&document.getElementById('toast').textContent.includes('missing.bin'),document.getElementById('toast').textContent);
 document.querySelectorAll('.remove')[4].click();document.querySelectorAll('.remove')[3].click();
 check('Remove uploaded models',window.percepta.getState().models.length===3);
 document.getElementById('progress').value=500;document.getElementById('progress').dispatchEvent(new Event('input'));await wait(1800);
 check('Morph scrub reaches midpoint',Math.abs(window.percepta.getState().current-.5)<.001,window.percepta.getState().current);
 document.getElementById('viewport').dispatchEvent(new WheelEvent('wheel',{deltaY:100,cancelable:true}));
 check('Wheel advances morph',window.percepta.getState().target>.5,window.percepta.getState().target);
 document.getElementById('play').click();await wait(300);check('Playback advances timeline',window.percepta.getState().playing&&window.percepta.getState().target>.575);document.getElementById('play').click();
 const density=document.getElementById('density');density.value=40000;density.dispatchEvent(new Event('change'));while(!window.percepta.getState().ready)await wait(100);
 document.querySelector('[data-preset="mono"]').click();document.getElementById('size').value=2.2;document.getElementById('size').dispatchEvent(new Event('input'));document.querySelector('.model-select').click();
 window.qaResults=results; return results;
};
