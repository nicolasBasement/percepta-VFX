import * as THREE from 'three';
import {FlowField} from './flow-field.js';
import {ParticleDynamics} from './particle-dynamics.js';
const $=id=>document.getElementById(id);
const white=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
white.needsUpdate=true;
const zeroFlow=new THREE.DataTexture(new Float32Array(4),1,1,THREE.RGBAFormat,THREE.FloatType);zeroFlow.needsUpdate=true;

export function appearanceUniforms(){
  return {uShape:{value:0},uLayerSize:{value:1},uOpacity:{value:1},uRotation:{value:0},uRandomRotation:{value:0},uSoftness:{value:.45},uOffset:{value:0},
    uColorMode:{value:0},uColorA:{value:new THREE.Color('#d6f880')},uColorB:{value:new THREE.Color('#b498ff')},
    uPattern:{value:0},uPatternScale:{value:.12},uPatternFill:{value:.55},uHoverEnabled:{value:1},uLightAffected:{value:1},
    uSprite:{value:white},uHasSprite:{value:0},uAtlasGrid:{value:new THREE.Vector2(1,1)},uSpritePixels:{value:new THREE.Vector2(1,1)},
    uAtlasMode:{value:0},uAtlasFrame:{value:0},uAtlasFPS:{value:8},uSpriteTint:{value:0},uSpriteAlpha:{value:0}};
}
export function interactionUniforms(){
  return {uInteraction:{value:5},uCarryMap:{value:zeroFlow},uCarryScale:{value:.8},uParticleReady:{value:0},uParticleMap:{value:zeroFlow},uFlowMap:{value:zeroFlow},uFlowSize:{value:new THREE.Vector2(1,1)},uFlowRight:{value:new THREE.Vector3(1,0,0)},uFlowUp:{value:new THREE.Vector3(0,1,0)},uFlowViewHeight:{value:1},uPointerOrigin:{value:new THREE.Vector3()},uPointerDirection:{value:new THREE.Vector3(0,0,-1)},
    uPointerActive:{value:0},uPointerRadius:{value:.8},uPointerStrength:{value:.45}};
}
const defaults=()=>({name:'Surface',visible:true,shape:0,size:1,opacity:100,rotation:0,random:false,softness:45,offset:0,blend:'normal',
  colorMode:0,colorA:'#d6f880',colorB:'#b498ff',pattern:0,spacing:.12,fill:55,hover:true,light:true,
  cols:1,rows:1,atlasMode:0,frame:0,fps:8,tint:false,alpha:0,asset:null,uploadToken:0});

export class ParticleEditor{
  constructor({renderer,points,group,material,toast,getCount,viewport,camera,reducedMotion}){
    Object.assign(this,{group,material,toast,getCount,viewport,camera,reducedMotion});
    this.layers=[{...defaults(),id:1,points,material}];this.selected=1;this.nextID=2;
    this.pointer=new THREE.Vector2();this.pointerInside=false;this.pointerDragging=false;this.raycaster=new THREE.Raycaster();
    this.flow=new FlowField();this.flowTexture=new THREE.DataTexture(this.flow.data,this.flow.size,this.flow.size,THREE.RGBAFormat,THREE.FloatType);
    this.flowTexture.minFilter=THREE.NearestFilter;this.flowTexture.magFilter=THREE.NearestFilter;this.flowTexture.generateMipmaps=false;this.flowTexture.needsUpdate=true;
    material.uniforms.uFlowMap.value=this.flowTexture;material.uniforms.uFlowSize.value.set(this.flow.size,this.flow.size);
    this.dynamics=new ParticleDynamics(renderer,material.uniforms,points.geometry);
    this.bind();this.syncForm();this.syncInteraction();this.renderLayers();this.apply(this.layers[0]);
  }
  get layer(){return this.layers.find(l=>l.id===this.selected);}
  getState(){return {selected:this.selected,layers:this.layers.map(l=>({id:l.id,name:l.name,visible:l.visible,shape:l.shape,size:l.size,opacity:l.opacity,colorMode:l.colorMode,pattern:l.pattern,hover:l.hover,light:l.light,sprite:l.asset?.name||null,atlas:[l.cols,l.rows],atlasMode:l.atlasMode,frame:l.frame})),
    interaction:{mode:this.material.uniforms.uInteraction.value,radius:this.material.uniforms.uPointerRadius.value,strength:this.material.uniforms.uPointerStrength.value,active:this.material.uniforms.uPointerActive.value,flow:this.flow.getState(),particles:this.dynamics.getState()},uploading:this.layers.some(l=>l.uploading)};}
  getPointer(){return {x:this.pointer.x,y:this.pointer.y,active:this.pointerInside};}
  setGeometry(geometry){for(const layer of this.layers)layer.points.geometry=geometry;this.dynamics?.setGeometry(geometry);this.renderBudget();}
  update(dt){
    const u=this.material.uniforms;
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer,this.camera);
    u.uPointerOrigin.value.copy(this.raycaster.ray.origin);u.uPointerDirection.value.copy(this.raycaster.ray.direction);
    u.uPointerActive.value=THREE.MathUtils.damp(u.uPointerActive.value,this.pointerInside?1:0,9,dt);
    u.uFlowRight.value.setFromMatrixColumn(this.camera.matrixWorld,0);u.uFlowUp.value.setFromMatrixColumn(this.camera.matrixWorld,1);
    u.uFlowViewHeight.value=2*Math.tan(this.camera.fov*Math.PI/360);
    if(Math.abs(this.flow.aspect-this.camera.aspect)>.01){this.flow.clear();this.dynamics?.clear();this.flowTexture.image.data=this.flow.data;this.flowTexture.needsUpdate=true;}
    this.flow.aspect=this.camera.aspect;
    this.flow.width=Math.max(.012,u.uPointerRadius.value/(u.uFlowViewHeight.value*Math.max(3,this.camera.position.length()))*.65);
    this.flow.strength=u.uPointerStrength.value;
    if(u.uInteraction.value>4.5){
      if(this.flow.update(dt)){this.flowTexture.image.data=this.flow.data;this.flowTexture.needsUpdate=true;}
      this.dynamics.setPointer(this.pointer.x*.5+.5,this.pointer.y*.5+.5,this.pointerInside&&!this.pointerDragging);
      this.dynamics.update(dt,this.camera,this.flow);
    }
  }
  apply(layer){
    const u=layer.material.uniforms;
    const values={uShape:layer.shape,uLayerSize:layer.size,uOpacity:layer.opacity/100,uRotation:layer.rotation*Math.PI/180,uRandomRotation:Number(layer.random),uSoftness:layer.softness/100,uOffset:layer.offset,
      uColorMode:layer.colorMode,uPattern:layer.pattern,uPatternScale:layer.spacing,uPatternFill:layer.fill/100,uHoverEnabled:Number(layer.hover),uLightAffected:Number(layer.light),uHasSprite:Number(!!layer.asset),
      uAtlasMode:layer.atlasMode,uAtlasFrame:layer.frame,uAtlasFPS:layer.fps,uSpriteTint:Number(layer.tint),uSpriteAlpha:layer.alpha};
    for(const [key,value] of Object.entries(values))u[key].value=value;
    u.uColorA.value.set(layer.colorA);u.uColorB.value.set(layer.colorB);
    u.uSprite.value=layer.asset?.texture||white;
    u.uAtlasGrid.value.set(layer.cols,layer.rows);
    u.uSpritePixels.value.set(layer.asset?.image.width||1,layer.asset?.image.height||1);
    layer.points.visible=layer.visible;
    layer.material.blending=layer.blend==='additive'?THREE.AdditiveBlending:THREE.NormalBlending;
  }
  renderBudget(){
    const n=this.layers.filter(l=>l.visible).length;
    $('layer-budget').textContent=n+' layer'+(n===1?'':'s')+' visible'+' · '+(n*this.getCount()).toLocaleString('en-US')+' particles';
  }
  renderLayers(){
    $('layer-list').replaceChildren();
    for(const layer of this.layers){
      const row=document.createElement('div');row.className='layer-row'+(layer.id===this.selected?' active':'')+(layer.visible?'':' muted');
      const eye=document.createElement('button');eye.className='layer-visible';eye.textContent=layer.visible?'◉':'○';eye.setAttribute('aria-label',(layer.visible?'Hide ':'Show ')+layer.name);eye.setAttribute('aria-pressed',String(layer.visible));
      eye.addEventListener('click',()=>{layer.visible=!layer.visible;this.apply(layer);this.renderLayers();});
      const select=document.createElement('button');select.className='layer-select';select.textContent=layer.name;select.setAttribute('aria-pressed',String(layer.id===this.selected));
      select.addEventListener('click',()=>{this.selected=layer.id;this.renderLayers();this.syncForm();});
      const remove=document.createElement('button');remove.className='layer-delete';remove.textContent='×';remove.setAttribute('aria-label','Delete layer '+layer.name);remove.disabled=this.layers.length===1;
      remove.addEventListener('click',()=>this.removeLayer(layer));
      row.append(eye,select,remove);$('layer-list').append(row);
    }
    $('layer-add').disabled=this.layers.length>=4;this.renderBudget();
  }
  addLayer(){
    if(this.layers.length>=4)return;
    const material=new THREE.ShaderMaterial({uniforms:{...this.material.uniforms,...appearanceUniforms()},vertexShader:this.material.vertexShader,fragmentShader:this.material.fragmentShader,transparent:true,depthWrite:false});
    const points=new THREE.Points(this.layers[0].points.geometry,material);points.frustumCulled=false;this.group.add(points);
    const layer={...defaults(),id:this.nextID++,name:'Layer '+this.nextID,points,material,size:1.5,opacity:45,offset:.08,colorMode:1,colorA:'#b498ff'};
    layer.name='Layer '+layer.id;this.layers.push(layer);this.selected=layer.id;this.apply(layer);this.renderLayers();this.syncForm();
  }
  removeLayer(layer){
    if(this.layers.length===1)return;
    // Keep the original Points/material as the morph anchor; move the next layer's appearance onto it if removed.
    if(layer.points===this.layers[0].points && layer.material===this.material){
      const next=this.layers[1];const basePoints=layer.points,baseMaterial=layer.material;
      this.releaseAsset(layer);this.group.remove(next.points);next.material.dispose();
      next.points=basePoints;next.material=baseMaterial;this.layers.splice(0,1);
      this.apply(next);
    }else{this.releaseAsset(layer);this.group.remove(layer.points);layer.material.dispose();this.layers=this.layers.filter(l=>l!==layer);}
    if(this.selected===layer.id)this.selected=this.layers[0].id;
    this.renderLayers();this.syncForm();
  }
  releaseAsset(layer){
    layer.uploadToken++;layer.uploading=false;
    if(layer.asset){layer.asset.texture.dispose();URL.revokeObjectURL(layer.asset.url);layer.asset=null;}
  }
  syncForm(){
    const l=this.layer;if(!l)return;
    const fields={'layer-name':'name','layer-size':'size','layer-opacity':'opacity','layer-rotation':'rotation','layer-softness':'softness','layer-offset':'offset','layer-blend':'blend','color-mode':'colorMode','color-a':'colorA','color-b':'colorB','pattern-mode':'pattern','pattern-scale':'spacing','pattern-fill':'fill','atlas-cols':'cols','atlas-rows':'rows','atlas-mode':'atlasMode','atlas-frame':'frame','atlas-fps':'fps','sprite-alpha':'alpha'};
    for(const [id,key]of Object.entries(fields))$(id).value=l[key];
    $('layer-light').checked=l.light;$('layer-random').checked=l.random;$('layer-hover').checked=l.hover;$('sprite-tint').checked=l.tint;
    document.querySelectorAll('[data-shape]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.shape)===l.shape);b.setAttribute('aria-pressed',String(Number(b.dataset.shape)===l.shape));});
    this.labels();this.preview();
  }
  labels(){
    const l=this.layer;
    $('layer-size-value').textContent=l.size.toFixed(2)+'×';$('layer-opacity-value').textContent=l.opacity+'%';
    $('layer-rotation-value').textContent=l.rotation+'°';$('layer-softness-value').textContent=l.softness+'%';$('layer-offset-value').textContent=l.offset.toFixed(2);
    $('pattern-scale-value').textContent=l.spacing.toFixed(2);$('pattern-fill-value').textContent=l.fill+'%';
    $('atlas-frame').max=l.cols*l.rows-1;$('atlas-frame-value').textContent=(l.frame+1)+' / '+l.cols*l.rows;
    $('atlas-fps-value').textContent=l.fps+' fps';$('atlas-fps').disabled=l.atlasMode!==2;
    $('atlas-frame').disabled=l.atlasMode===1;$('pattern-scale').disabled=l.pattern===0;$('pattern-fill').disabled=l.pattern<2;
    $('color-a').disabled=l.colorMode===0||l.colorMode===4;$('color-b').disabled=l.colorMode!==2&&l.colorMode!==3;
    $('sprite-remove').disabled=!l.asset;
    $('sprite-filename').textContent=l.uploading?'Reading image…':(l.asset?l.asset.name+' · '+l.asset.image.width+' × '+l.asset.image.height:'PNG · WebP · JPG · up to 16 MB');
  }
  preview(){
    const canvas=$('sprite-preview'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
    const l=this.layer;if(!l.asset){ctx.fillStyle='#839181';ctx.font='12px Arial';ctx.textAlign='center';ctx.fillText('Your image repeats on every point',120,52);return;}
    const image=l.asset.image,scale=Math.min(canvas.width/image.width,canvas.height/image.height);
    const w=image.width*scale,h=image.height*scale,x=(canvas.width-w)/2,y=(canvas.height-h)/2;
    ctx.drawImage(image,x,y,w,h);ctx.lineWidth=1;ctx.strokeStyle='#d6f880aa';
    for(let i=1;i<l.cols;i++){ctx.beginPath();ctx.moveTo(x+i*w/l.cols,y);ctx.lineTo(x+i*w/l.cols,y+h);ctx.stroke();}
    for(let j=1;j<l.rows;j++){ctx.beginPath();ctx.moveTo(x,y+j*h/l.rows);ctx.lineTo(x+w,y+j*h/l.rows);ctx.stroke();}
    ctx.lineWidth=2;ctx.strokeStyle='#d6f880';ctx.strokeRect(x+(l.frame%l.cols)*w/l.cols,y+Math.floor(l.frame/l.cols)*h/l.rows,w/l.cols,h/l.rows);
  }
  async loadSprite(file,example=false,layer=this.layer){
    if(!this.layers.includes(layer))return;
    if(!file)return;
    if(!/\.(png|webp|jpe?g)$/i.test(file.name)){this.toast('Use a PNG, WebP or JPG image.');return;}
    if(file.size>16*1024*1024){this.toast('The image exceeds 16 MB. Use a smaller file.');return;}
    const token=++layer.uploadToken;layer.uploading=true;this.labels();
    const url=URL.createObjectURL(file);
    try{
      const image=new Image();image.src=url;await image.decode();
      if(image.width>4096||image.height>4096)throw new Error('The image exceeds 4096 px. Reduce its resolution.');
      if(!this.layers.includes(layer)||layer.uploadToken!==token){URL.revokeObjectURL(url);return;}
      const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
      if(layer.asset){layer.asset.texture.dispose();URL.revokeObjectURL(layer.asset.url);}
      layer.asset={name:file.name,url,image,texture};layer.shape=6;layer.cols=example?4:1;layer.rows=example?2:1;layer.frame=0;layer.atlasMode=example?1:0;layer.size=Math.max(layer.size,3);
      if(example)layer.tint=true;
      this.apply(layer);
      if(this.selected===layer.id){$('sprite-section').open=true;this.syncForm();}
      this.toast('Sprite ready. Adjust columns and rows for an atlas.');
    }catch(error){URL.revokeObjectURL(url);if(layer.uploadToken===token)this.toast(error.message||'Could not read the image.');}
    finally{if(layer.uploadToken===token){layer.uploading=false;if(this.selected===layer.id)this.labels();}}
  }
  async example(loadSprite=(...args)=>this.loadSprite(...args)){
    const targetLayer=this.layer;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');
    for(let i=0;i<8;i++){
      ctx.save();ctx.translate((i%4)*128+64,Math.floor(i/4)*128+64);ctx.fillStyle='white';ctx.strokeStyle='white';ctx.lineWidth=10;
      if(i===0){ctx.beginPath();ctx.arc(0,0,36,0,Math.PI*2);ctx.fill();}
      if(i===1){ctx.beginPath();for(let j=0;j<10;j++){const angle=j*Math.PI/5-Math.PI/2,r=j%2?18:47;ctx.lineTo(Math.cos(angle)*r,Math.sin(angle)*r);}ctx.closePath();ctx.fill();}
      if(i===2){ctx.rotate(Math.PI/4);ctx.fillRect(-29,-29,58,58);}
      if(i===3){ctx.beginPath();ctx.arc(0,0,34,0,Math.PI*2);ctx.stroke();}
      if(i===4){ctx.fillRect(-10,-43,20,86);ctx.fillRect(-43,-10,86,20);}
      if(i===5){const gradient=ctx.createRadialGradient(0,0,0,0,0,53);gradient.addColorStop(0,'#fff');gradient.addColorStop(.3,'#ffffffaa');gradient.addColorStop(1,'#ffffff00');ctx.fillStyle=gradient;ctx.fillRect(-60,-60,120,120);}
      if(i===6){ctx.fillRect(-7,-46,14,92);}
      if(i===7){ctx.beginPath();ctx.moveTo(0,-43);ctx.lineTo(43,35);ctx.lineTo(-43,35);ctx.closePath();ctx.fill();}
      ctx.restore();
    }
    const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
    await loadSprite(new File([blob],'example-atlas-4x2.png',{type:'image/png'}),true,targetLayer);
  }
  syncInteraction(){
    const fluid=this.material.uniforms.uInteraction.value>4.5;
    const mixed=this.material.uniforms.uInteraction.value>5.5;
    $('flow-controls').hidden=!fluid;$('carry-controls').hidden=!mixed;
    $('interaction-radius-label').textContent=fluid?'Trail width':'Influence radius';
    $('interaction-note').textContent=mixed?(this.dynamics.enabled?'Move across the model and beyond its edge: some points follow, grow and release. Others keep flowing. Drag to orbit the camera.':'This device uses basic flow. Temporary carry requires floating-point GPU textures.'):fluid?'Move the mouse to scatter particles. Each has its own momentum, slows down and returns without bouncing. Drag to orbit.':'The shape recovers as the cursor moves away. On touchscreens, drag to orbit the camera.';
  }
  bind(){
    document.querySelectorAll("[data-editor-section]").forEach(b=>b.addEventListener("click",()=>{const section=$(b.dataset.editorSection);section.open=true;section.scrollIntoView({block:"start",behavior:this.reducedMotion?"instant":"smooth"});}));
    $('layer-add').addEventListener('click',()=>this.addLayer());
    $('layer-name').addEventListener('change',()=>{this.layer.name=$('layer-name').value.trim()||'Layer '+this.layer.id;this.syncForm();this.renderLayers();});
    $('editor-reset').addEventListener('click',()=>{const l=this.layer;this.releaseAsset(l);const {id,name,points,material,uploadToken}=l;Object.assign(l,defaults(),{id,name,points,material,uploadToken});this.apply(l);this.syncForm();this.renderLayers();});
    const bindings={'layer-size':'size','layer-opacity':'opacity','layer-rotation':'rotation','layer-softness':'softness','layer-offset':'offset','layer-blend':'blend','color-mode':'colorMode','color-a':'colorA','color-b':'colorB','pattern-mode':'pattern','pattern-scale':'spacing','pattern-fill':'fill','atlas-mode':'atlasMode','atlas-frame':'frame','atlas-fps':'fps','sprite-alpha':'alpha'};
    for(const[id,key]of Object.entries(bindings))$(id).addEventListener('input',()=>{
      this.layer[key]=['blend','colorA','colorB'].includes(key)?$(id).value:Number($(id).value);
      this.apply(this.layer);this.labels();if(id.startsWith('atlas'))this.preview();
    });
    for(const[id,key]of [['layer-random','random'],['layer-hover','hover'],['sprite-tint','tint'],['layer-light','light']])$(id).addEventListener('change',()=>{this.layer[key]=$(id).checked;this.apply(this.layer);});
    document.querySelectorAll('[data-shape]').forEach(b=>b.addEventListener('click',()=>{
      const shape=Number(b.dataset.shape);
      if(shape===6&&!this.layer.asset){$('sprite-section').open=true;$('sprite-section').scrollIntoView({block:'nearest',behavior:this.reducedMotion?'instant':'smooth'});this.toast('Upload an image or try the example atlas.');return;}
      this.layer.shape=shape;this.apply(this.layer);this.syncForm();
    }));
    for(const[id,key]of [['atlas-cols','cols'],['atlas-rows','rows']])$(id).addEventListener('change',()=>{
      const value=Number($(id).value),limit=Math.min(16,key==='cols'?(this.layer.asset?.image.width||16):(this.layer.asset?.image.height||16));
      this.layer[key]=Math.max(1,Math.min(limit,Math.round(Number.isFinite(value)?value:1)));
      this.layer.frame=Math.min(this.layer.frame,this.layer.cols*this.layer.rows-1);this.apply(this.layer);this.syncForm();
    });
    $('sprite-upload').addEventListener('click',()=>$('sprite-input').click());
    $('sprite-input').addEventListener('change',async e=>{await this.loadSprite(e.target.files[0]);e.target.value='';});
    $('sprite-example').addEventListener('click',()=>this.example());
    $('sprite-remove').addEventListener('click',()=>{this.releaseAsset(this.layer);this.layer.shape=0;this.layer.cols=1;this.layer.rows=1;this.layer.frame=0;this.apply(this.layer);this.syncForm();});
    const drop=$('sprite-drop');
    for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();e.stopPropagation();drop.classList.add('dragging');$('drop-overlay').hidden=true;});
    drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
    drop.addEventListener('drop',e=>{e.preventDefault();e.spriteHandled=true;drop.classList.remove('dragging');$('drop-overlay').hidden=true;this.loadSprite(e.dataTransfer.files[0]);});
    $('interaction-mode').addEventListener('input',()=>{this.material.uniforms.uInteraction.value=Number($('interaction-mode').value);this.flow.clear();this.dynamics.clear();this.flowTexture.image.data=this.flow.data;this.flowTexture.needsUpdate=true;this.syncInteraction();});
    for(const[id,key]of [['flow-inertia','inertia'],['flow-recovery','recovery'],['flow-swirl','swirl']])$(id).addEventListener('input',()=>{this.flow[key]=Number($(id).value)/100;$(id+'-value').textContent=$(id).value+'%';});
    for(const[id,key,scale]of [['carry-mix','carryMix',.01],['carry-duration','carryDuration',1]])$(id).addEventListener('input',()=>{this.dynamics[key]=Number($(id).value)*scale;$(id+'-value').textContent=key==='carryDuration'?Number($(id).value).toFixed(1)+' s':$(id).value+'%';});
    $('carry-scale').addEventListener('input',()=>{this.material.uniforms.uCarryScale.value=Number($('carry-scale').value)/100;$('carry-scale-value').textContent='+'+$('carry-scale').value+'%';});
    $('interaction-radius').addEventListener('input',()=>{this.material.uniforms.uPointerRadius.value=Number($('interaction-radius').value);$('interaction-radius-value').textContent=Number($('interaction-radius').value).toFixed(2);});
    $('interaction-strength').addEventListener('input',()=>{this.material.uniforms.uPointerStrength.value=Number($('interaction-strength').value)/100;$('interaction-strength-value').textContent=$('interaction-strength').value+'%';});
    this.viewport.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const r=this.viewport.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);this.pointerInside=true;this.pointerDragging=!!e.buttons;
      if(this.material.uniforms.uInteraction.value>4.5 && !e.buttons){
        const events=e.getCoalescedEvents?.()||[];
        for(const sample of events.length?events:[e])this.flow.move((sample.clientX-r.left)/r.width,1-(sample.clientY-r.top)/r.height);
      }else this.flow.endStroke();
    });
    this.viewport.addEventListener('pointerleave',()=>{this.pointerInside=false;this.pointerDragging=false;this.flow.endStroke();this.dynamics.clearCarry();});
    this.viewport.addEventListener('pointerdown',()=>{this.pointerDragging=true;this.flow.endStroke();this.dynamics.clearCarry();});
    this.viewport.addEventListener('pointerup',()=>{this.pointerDragging=false;});
    window.addEventListener('blur',()=>{this.pointerInside=false;this.flow.endStroke();this.dynamics.clearCarry();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.pointerInside=false;this.dynamics.clearCarry();this.flow.clear();this.flowTexture.image.data=this.flow.data;this.flowTexture.needsUpdate=true;}});
  }
}
