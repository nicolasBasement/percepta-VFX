import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { sampleSurface, makeExamples, random, disposeModel } from './surface.js';
import { vertexShader, fragmentShader } from './shaders.js';
import {ParticleEditor,appearanceUniforms,interactionUniforms} from './particle-editor.js';
import {SceneFX,fogUniforms} from './scene-fx.js';
import {CinematicEffects,cinematicUniforms} from './cinematic-effects.js';
import {DialStudio} from './dial-studio.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let models=[], count=40000, target=0, current=0, segment=-1, playing=false, busy=false, style=0, lastTime=0, time=0, direction=1;
let renderer, scene, camera, controls, points, field, group, material;
let toastTimer, pendingDensity=null, editor, fx, cinema;
const viewport=$('viewport');
function toast(message, duration=5000){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,duration);}
function loading(active,message='Converting surfaces into particles…'){
  busy=active;$('loading').hidden=!active;$('loading').textContent=message;
  $('upload-button').disabled=active;$('density').disabled=active;
  document.querySelectorAll('.remove').forEach(b=>b.disabled=active);
}
function setPlaying(value){playing=value;$('play').textContent=value?'Ⅱ':'▶';$('play').setAttribute('aria-label',value?'Pause sequence':'Play sequence');}
function setTarget(value, pause=true){target=THREE.MathUtils.clamp(value,0,Math.max(0,models.length-1));if(pause)setPlaying(false);}
function commonUniforms(isField=0){return {...appearanceUniforms(),...interactionUniforms(),...fogUniforms(),...cinematicUniforms(),uProgress:{value:0},uTime:{value:0},uSize:{value:2.2},uPixelRatio:{value:Math.min(devicePixelRatio,2)},uScatter:{value:.55},uMotion:{value:reducedMotion?0:.2},uStyle:{value:0},uField:{value:isField}};}
function newGeometry(a,b){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(a.positions,3));
  g.setAttribute('targetPosition',new THREE.BufferAttribute(b.positions,3));
  g.setAttribute('sourceColor',new THREE.BufferAttribute(a.colors,3));
  g.setAttribute('targetColor',new THREE.BufferAttribute(b.colors,3));
  g.setAttribute('sourceNormal',new THREE.BufferAttribute(a.normals,3));
  g.setAttribute('targetNormal',new THREE.BufferAttribute(b.normals,3));
  const rng=random(991),seeds=Float32Array.from({length:a.count},()=>rng());g.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
  const side=Math.ceil(Math.sqrt(a.count)),particleUV=new Float32Array(a.count*2);
  for(let i=0;i<a.count;i++){particleUV[i*2]=(i%side+.5)/side;particleUV[i*2+1]=(Math.floor(i/side)+.5)/side;}
  g.setAttribute('particleUV',new THREE.BufferAttribute(particleUV,2));return g;
}
function updateSegment(){
  if(!models.length)return;
  const index=Math.min(Math.floor(current),Math.max(0,models.length-2));
  if(index!==segment){
    segment=index;
    const a=models[index].sample,b=models[Math.min(index+1,models.length-1)].sample;
    const g=newGeometry(a,b);
    if(points){points.geometry.dispose();points.geometry=g;}else{points=new THREE.Points(g,material);points.frustumCulled=false;group.add(points);}
    editor?.setGeometry(g);
  }
  material.uniforms.uProgress.value=models.length===1?0:current-index;
  const nearest=Math.min(models.length-1,Math.round(current));
  document.querySelectorAll('.model-row').forEach((el,i)=>el.classList.toggle('active',i===nearest));
  $('scene-index').textContent='SHAPE '+String(nearest+1).padStart(2,'0')+' / '+String(models.length).padStart(2,'0');
  $('scene-name').textContent=models[nearest].name;$('scene-detail').textContent=models[nearest].detail;
  const next=Math.min(index+1,models.length-1);
  $('transition-name').textContent=models.length===1?models[0].name:models[index].name+' → '+models[next].name;
  $('progress-value').textContent=String(Math.round((models.length===1?0:current/(models.length-1))*100)).padStart(2,'0')+'%';
  $('progress').value=Math.round(current*1000);
}
function renderModels(){
  $('model-list').replaceChildren();$('timeline-labels').replaceChildren();
  models.forEach((model,i)=>{
    const row=document.createElement('div');row.className='model-row';
    const button=document.createElement('button');button.className='model-select';button.title='Go to '+model.name;
    const icon=document.createElement('span');icon.className='model-icon';icon.textContent=model.icon;
    const text=document.createElement('span');text.className='model-text';
    const name=document.createElement('strong');name.textContent=model.name;
    const detail=document.createElement('small');detail.textContent=model.origin;
    text.append(name,detail);button.append(icon,text);button.addEventListener('click',()=>setTarget(i));
    const remove=document.createElement('button');remove.className='remove';remove.textContent='×';remove.title='Remove '+model.name;remove.setAttribute('aria-label','Remove '+model.name);
    remove.addEventListener('click',()=>{
      if(busy)return;if(models.length<=1){toast('Keep at least one model in the sequence.');return;}
      disposeModel(models[i].root);models.splice(i,1);current=Math.min(current,models.length-1);setTarget(current);segment=-1;renderModels();updateSegment();
    });
    row.append(button,remove);$('model-list').append(row);
    const stop=document.createElement('button');stop.textContent=model.name;stop.addEventListener('click',()=>setTarget(i));$('timeline-labels').append(stop);
  });
  $('model-total').textContent=models.length+' model'+(models.length===1?'':'s');
  $('progress').max=Math.max(1,(models.length-1)*1000);$('progress').disabled=models.length<2;$('play').disabled=models.length<2;
  if(models.length<2)setPlaying(false);
}
function resetCamera(){cinema?.resetCamera();fx?.beforeCamera();if(fx)fx.offset.set(0,0,0);camera.position.set(7,4.6,8.5);controls.target.set(0,-.1,0);controls.update();}
function resize(){if(!renderer)return;const {width,height}=viewport.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(43)/2)/Math.min(1,camera.aspect)));camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,2));material.uniforms.uPixelRatio.value=renderer.getPixelRatio()*Math.min(1,camera.aspect);field.material.uniforms.uPixelRatio.value=renderer.getPixelRatio()*Math.min(1,camera.aspect);cinema?.resize();}
async function init(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    renderer.setClearColor('#080a0c');renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
    viewport.append(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(43,1,.1,100);
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.06;controls.enableZoom=false;controls.enablePan=false;controls.autoRotateSpeed=.35;controls.minPolarAngle=.15;controls.maxPolarAngle=Math.PI*.85;resetCamera();
    group=new THREE.Group();scene.add(group);
    material=new THREE.ShaderMaterial({uniforms:commonUniforms(),vertexShader,fragmentShader,transparent:true,depthWrite:false,blending:THREE.NormalBlending});
    const n=11000,p=new Float32Array(n*3),normals=new Float32Array(n*3),colors=new Float32Array(n*3),rng=random(8);
    for(let i=0;i<n;i++){p.set([(rng()-.5)*23,-2.85,(rng()-.5)*19],i*3);normals.set([0,1,0],i*3);}
    const data={positions:p,normals,colors,count:n};
    field=new THREE.Points(newGeometry(data,data),new THREE.ShaderMaterial({uniforms:commonUniforms(1),vertexShader,fragmentShader,transparent:true,depthWrite:false}));field.frustumCulled=false;scene.add(field);
    if(reducedMotion){$('motion').value=0;$('motion-value').textContent='0%';field.material.uniforms.uMotion.value=0;}
    new ResizeObserver(resize).observe(viewport);resize();
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();setPlaying(false);toast('The GPU connection was lost. Reload the page to continue.',30000);});
    models=makeExamples();
    for(const model of models)model.sample=await sampleSurface(model.root,count);
    renderModels();updateSegment();editor=new ParticleEditor({renderer,points,group,material,toast,getCount:()=>count,viewport,camera,reducedMotion});fx=new SceneFX({scene,camera,controls,material,field,editor,reducedMotion});cinema=new CinematicEffects({renderer,scene,camera,controls,material,viewport,getPoints:()=>editor.layers.find(layer=>layer.visible)?.points,pauseMorph:()=>{setPlaying(false);target=current;},reducedMotion});bindUI();loading(false);$('stage-status').textContent='PARTICLE SURFACES';requestAnimationFrame(frame);
    window.percepta={getState:()=>({ready:!busy,count,models:models.map(m=>({name:m.name,triangles:m.sample.triangles})),current,target,style,playing,drawCalls:renderer.info.render.calls,editor:editor.getState(),effects:fx.getState(),cinematic:cinema.getState()}),renderer,scene,camera,editor,fx,cinema,toast};
    window.percepta.studio=await DialStudio.mount(window.percepta);
  }catch(error){console.error(error);loading(false);$('stage-status').textContent='UNABLE TO START';toast('Could not start the 3D view. '+error.message,30000);}
}
let fpsFrames=0,fpsTime=0;
function frame(now){
  requestAnimationFrame(frame);const dt=Math.min((now-(lastTime||now))/1000,.05);lastTime=now;
  if(document.hidden)return;
  if(!reducedMotion)time+=dt;
  if(playing&&!busy){target+=dt*.19*direction;if(target>=models.length-1){target=models.length-1;direction=-1;}if(target<=0){target=0;direction=1;}}
  current=THREE.MathUtils.damp(current,target,7,dt);if(Math.abs(current-target)<.0001)current=target;
  updateSegment();material.uniforms.uTime.value=time;field.material.uniforms.uTime.value=time;
  fx?.beforeCamera();cinema?.updateCamera(dt);
  const macroDriving=cinema?.reveal.enabled&&cinema.reveal.style===1&&cinema.reveal.driving;
  const autoRotate=controls.autoRotate;if(macroDriving)controls.autoRotate=false;
  controls.update(dt);controls.autoRotate=autoRotate;
  fx?.update(dt,time,current,macroDriving);editor?.update(dt);cinema.render(dt,time);
  fpsFrames++;fpsTime+=dt;if(fpsTime>.75){$('fps').textContent=Math.round(fpsFrames/fpsTime)+' FPS';fpsFrames=0;fpsTime=0;}
}
async function changeDensity(){
  const desired=Number($('density').value);if(busy){pendingDensity=desired;return;}
  const oldCount=count;loading(true,'Adjusting particle density…');
  try{const samples=[];for(const m of models)samples.push(await sampleSurface(m.root,desired));samples.forEach((s,i)=>models[i].sample=s);count=desired;segment=-1;updateSegment();}
  catch(error){$('density').value=oldCount;toast(error.message);}
  finally{loading(false);$('density-value').textContent=count.toLocaleString('en-US');}
  if(pendingDensity!==null&&pendingDensity!==count){$('density').value=pendingDensity;pendingDensity=null;await changeDensity();}
}
function bindUI(){
  viewport.addEventListener('wheel',e=>{e.preventDefault();if(!busy){let delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?viewport.clientHeight:1);if(!cinema.handleWheel(delta))setTarget(target+THREE.MathUtils.clamp(delta,-160,160)*.00075);}},{passive:false});
  viewport.addEventListener('keydown',e=>{if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Home','End',' '].includes(e.key)){e.preventDefault();if(e.key===' ')setPlaying(!playing);else if(e.key==='Home')setTarget(0);else if(e.key==='End')setTarget(models.length-1);else setTarget(target+(['ArrowDown','ArrowRight'].includes(e.key)?.08:-.08));}});
  $('progress').addEventListener('input',e=>setTarget(Number(e.target.value)/1000));
  $('play').addEventListener('click',()=>setPlaying(!playing));
  $('density').addEventListener('input',()=>{$('density-value').textContent=Number($('density').value).toLocaleString('en-US');});
  $('density').addEventListener('change',changeDensity);
  for(const [id,uniform,percent] of [['size','uSize',false],['scatter','uScatter',true],['motion','uMotion',true]]){
    $(id).addEventListener('input',()=>{const value=Number($(id).value);material.uniforms[uniform].value=percent?value/100:value;if(id==='size')field.material.uniforms.uSize.value=value*.85;$(id+'-value').textContent=percent?value+'%':value.toFixed(1);});
  }
  $('rotate').addEventListener('change',()=>controls.autoRotate=$('rotate').checked);
  $('field').addEventListener('change',()=>field.visible=$('field').checked);
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>{
    const presets=['mono','lidar','texture','paper'];style=presets.indexOf(button.dataset.preset);
    document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('active',b===button));
    document.body.classList.toggle('paper',style===3);renderer.setClearColor(style===3?'#eceee7':'#080a0c');material.uniforms.uStyle.value=style;field.material.uniforms.uStyle.value=style;
  }));
  $('reset-camera').addEventListener('click',resetCamera);
  $('zoom-in').addEventListener('click',()=>{cinema.stopRevealMotion();fx?.beforeCamera();if(fx)fx.offset.set(0,0,0);const d=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(d.setLength(Math.max(4,d.length()*.85)));});
  $('zoom-out').addEventListener('click',()=>{cinema.stopRevealMotion();fx?.beforeCamera();if(fx)fx.offset.set(0,0,0);const d=camera.position.clone().sub(controls.target);camera.position.copy(controls.target).add(d.setLength(Math.min(30,d.length()*1.15)));});
  $('capture').addEventListener('click',()=>{cinema.render(0,time);renderer.domElement.toBlob(blob=>{if(!blob){toast('Could not save the image.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='percepta-'+Date.now()+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});});
  $('help-button').addEventListener('click',()=>$('help').showModal());$('close-help').addEventListener('click',()=>$('help').close());$('help-done').addEventListener('click',()=>$('help').close());
  $('upload-button').addEventListener('click',()=>$('file-input').click());
  $('file-input').addEventListener('change',async e=>{await importFiles([...e.target.files]);e.target.value='';});
  let dragDepth=0;
  document.addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;}});
  document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
  document.addEventListener('dragleave',()=>{dragDepth--;if(dragDepth<=0){dragDepth=0;$('drop-overlay').hidden=true;}});
  document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;if(!e.spriteHandled)importFiles([...e.dataTransfer.files]);});
}
async function importFiles(files){
  if(busy){toast('Wait for the current conversion to finish.');return;}
  const entries=files.filter(f=>/\.(glb|gltf|obj)$/i.test(f.name));
  if(!entries.length){toast('Choose a GLB, glTF or OBJ. Include the supporting files for glTF.');return;}
  if(entries.length+models.length>6){toast('The sequence supports up to 6 models. Remove an example to add your own.');return;}
  if(files.reduce((sum,f)=>sum+f.size,0)>100*1024*1024){toast('This import exceeds 100 MB. Use smaller models or textures.');return;}
  loading(true);setPlaying(false);
  const urls=new Map(), paths=new Map(), added=[];let activeRoot=null;
  try{
    for(const file of files){const url=URL.createObjectURL(file);urls.set(file,url);const name=file.name.toLowerCase();if(paths.has(name))throw new Error('Some files share a name. Import each model separately.');paths.set(name,url);if(file.webkitRelativePath)paths.set(file.webkitRelativePath.toLowerCase(),url);}
    const manager=new THREE.LoadingManager();
    let missing=null;
    manager.setURLModifier(url=>{
      if(url.startsWith('blob:')||url.startsWith('data:'))return url;
      const clean=decodeURIComponent(url).replace(/\\/g,'/').split('?')[0];
      const match=paths.get(clean.toLowerCase())||paths.get(clean.split('/').pop().toLowerCase());
      if(match)return match;
      missing=clean.split('/').pop();throw new Error('Missing file '+missing+'. Select it together with the glTF.');
    });
    const draco=new DRACOLoader();draco.setDecoderPath('./vendor/examples/jsm/libs/draco/gltf/');
    const loader=new GLTFLoader(manager);loader.setDRACOLoader(draco);loader.setMeshoptDecoder(MeshoptDecoder);
    try{
      for(const file of entries){
        $('loading').textContent='Processing '+file.name+'…';
        if(/\.obj$/i.test(file.name))activeRoot=new OBJLoader().parse(await file.text());
        else{
          const raw=await file.arrayBuffer();
          const parsed=await loader.parseAsync(raw,'');
          activeRoot=parsed.scene;
        }
        if(missing)throw new Error('Missing '+missing+'. Select all glTF textures and supporting files.');
        const sample=await sampleSurface(activeRoot,count);
        added.push({name:file.name.replace(/\.[^.]+$/,''),detail:'Your model, reinterpreted as particles',icon:'◇',origin:file.name.split('.').pop().toUpperCase()+' / LOCAL',root:activeRoot,sample});
        activeRoot=null;
      }
    }finally{draco.dispose();}
    const first=models.length;models.push(...added);renderModels();setTarget(first);toast(added.length===1?'Model ready. Scroll to explore the transition.':'Models ready. Your sequence is available.');
  }catch(error){if(activeRoot)disposeModel(activeRoot);added.forEach(m=>disposeModel(m.root));console.warn('Import:',error);toast(error.message||'Could not read this file. Try exporting it as GLB.',9000);}
  finally{urls.forEach(url=>URL.revokeObjectURL(url));loading(false);}
}
init();
