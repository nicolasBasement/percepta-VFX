import * as THREE from 'three';
import {createDialKit,mountPresetManager,DialStore} from './vendor/dialkit/index.js';
import {SpriteLibrary} from './sprite-library.js';
const $=id=>document.getElementById(id);
const panelId='percepta-studio-v1';
// The macro controls have wider ranges than the original studio. An older
// open tab must not clamp and write their values back into this version.
const persistenceKey='dialkit:percepta-studio-v2';
function migrateStudioStorage(){
  try{
    if(localStorage.getItem(persistenceKey)===null){
      const previous=localStorage.getItem('dialkit:'+panelId);
      if(previous!==null)localStorage.setItem(persistenceKey,previous);
    }
  }catch{} // DialKit handles unavailable storage and keeps the session usable.
}
const clone=value=>structuredClone(value);
const writable=value=>value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v?.type!=='action').map(([k,v])=>[k,writable(v)])):value;
const at=(obj,path)=>path.split('.').reduce((o,k)=>o?.[k],obj);
const put=(obj,path,value)=>{const keys=path.split('.');let o=obj;for(const key of keys.slice(0,-1))o=o[key]??={};o[keys.at(-1)]=value;};
const action=label=>({type:'action',label});
const select=(options,value)=>({type:'select',options,default:String(value)});
const shapes=['Circle','Square','Diamond','Ring','Star','Cross','Sprite'].map((label,i)=>({value:String(i),label}));
const modes={
'interaction-mode':['None','Radial repel','Attract','Vortex','Waves','Particle flow','Mixed flow · carry & grow'],
'light-type':['Point','Directional','Spot toward center'],
'camera-mode':['Stable','Mouse parallax','Breathing','Morph travel','Cinematic blend'],
'scroll-action':null
};
const map={
'particles.appearance':'@style','particles.count':'density','particles.pointSize':'size',
'particles.morph.scatter':'scatter','particles.morph.organicMotion':'motion',
'interaction.mode':'interaction-mode','interaction.trailWidth':'interaction-radius','interaction.strength':'interaction-strength',
'interaction.flow.inertia':'flow-inertia','interaction.flow.returnSpeed':'flow-recovery','interaction.flow.dispersion':'flow-swirl',
'interaction.carry.blend':'carry-mix','interaction.carry.releaseAfter':'carry-duration','interaction.carry.growth':'carry-scale',
'lighting.enabled':'light-enabled','lighting.type':'light-type','lighting.color':'light-color','lighting.intensity':'light-intensity',
'lighting.position.x':'light-x','lighting.position.y':'light-y','lighting.position.z':'light-z',
'lighting.falloff.range':'light-range','lighting.falloff.coneAngle':'light-angle','lighting.response.size':'light-size',
'lighting.response.shadowFill':'light-shadow','lighting.response.minimumLight':'light-cutoff','lighting.showHelper':'light-helper',
'atmosphere.depthFog':'fog-density','atmosphere.groundFog':'fog-ground','atmosphere.fogStart':'fog-near','atmosphere.color':'fog-color',
'atmosphere.haze':'atmosphere-haze','atmosphere.dust':'atmosphere-dust','atmosphere.floorParticles':'field',
'finish.enabled':'post-enabled','finish.bloom.strength':'bloom-strength','finish.bloom.radius':'bloom-radius','finish.bloom.threshold':'bloom-threshold',
'finish.exposure':'post-exposure','finish.vignette':'post-vignette','finish.filmGrain':'post-grain',
'camera.autoOrbit':'rotate','camera.feedback.mode':'camera-mode','camera.feedback.amount':'camera-intensity','camera.feedback.breathingSpeed':'camera-speed',
'camera.reveal.style':'reveal-style','camera.reveal.hold':'reveal-hold',
'camera.reveal.focusX':'reveal-focus-x','camera.reveal.focusY':'reveal-focus-y','camera.reveal.focusZ':'reveal-focus-z',
'camera.reveal.enabled':'reveal-enabled','camera.reveal.duration':'reveal-duration','camera.reveal.startDistance':'reveal-start','camera.reveal.endDistance':'reveal-end',
'camera.reveal.progress':'reveal-progress','camera.scroll':'scroll-action'
};
const layerMap={name:'name',visible:'visible','shape.type':'shape','shape.scale':'size','shape.opacity':'opacity','shape.rotation':'rotation','shape.randomRotation':'random','shape.softness':'softness','shape.surfaceOffset':'offset','shape.blend':'blend',
'color.source':'colorMode','color.a':'colorA','color.b':'colorB','pattern.type':'pattern','pattern.spacing':'spacing','pattern.coverage':'fill',
'response.mouse':'hover','response.light':'light','sprite.columns':'cols','sprite.rows':'rows','sprite.mode':'atlasMode','sprite.frame':'frame','sprite.fps':'fps','sprite.tint':'tint','sprite.background':'alpha'};
const numericLayer=new Set(['shape','size','opacity','rotation','softness','offset','colorMode','pattern','spacing','fill','cols','rows','atlasMode','frame','fps','alpha']);
function control(id){
  const el=$(id);if(!el)throw new Error('Missing control: '+id);
  if(el.type==='checkbox')return el.checked;
  if(el.tagName==='SELECT')return select([...el.options].map(o=>({value:o.value,label:modes[id]?.[Number(o.value)]||(id==='scroll-action'?(o.value==='reveal'?'Zoom reveal':'Model morph'):o.textContent)})),el.value);
  if(el.type==='color')return el.value;
  return [Number(el.value),Number(el.min),Number(el.max),Number(el.step)||1];
}
const colorCanvas=document.createElement('canvas');colorCanvas.width=colorCanvas.height=1;
const colorContext=colorCanvas.getContext('2d',{willReadFrequently:true});
function hexColor(value){
  colorContext.clearRect(0,0,1,1);colorContext.fillStyle='#000000';colorContext.fillStyle=value;colorContext.fillRect(0,0,1,1);
  const d=colorContext.getImageData(0,0,1,1).data;return '#'+[...d.slice(0,3)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export class DialStudio{
  static async mount(app){const studio=new DialStudio(app);await studio.init();return studio;}
  constructor(app){this.app=app;this.editor=app.editor;this.previous=null;this.applying=false;this.assetTasks=new Map();this.library=new SpriteLibrary();}
  async init(){
    try{await this.library.init();}catch(error){this.app.toast('Browser storage is unavailable. Sprite uploads will last for this session.');console.warn('Sprite storage:',error);}
    while(this.editor.layers.length<4){this.editor.addLayer();this.editor.layer.visible=false;this.editor.apply(this.editor.layer);}
    this.editor.selected=this.editor.layers[0].id;this.editor.syncForm();this.editor.renderLayers();
    this.config=this.makeConfig();migrateStudioStorage();
    this.kit=createDialKit('Studio',this.config,{id:panelId,persist:{key:persistenceKey},onAction:path=>this.onAction(path)});
    // Restore the look and reveal recipe, but always start in model navigation.
    const restoredCamera=this.kit.getValues().camera;
    const startupCamera={scroll:'morph',reveal:{enabled:false,progress:0}};
    if(restoredCamera.reveal.enabled||restoredCamera.framing.distance<3)startupCamera.framing=this.readFraming();
    this.kit.setValues({camera:startupCamera});
    this.presetUI=mountPresetManager($('preset-versions'),{panelId,presets:DialStore.getPresets(panelId),activePresetId:DialStore.getActivePresetId(panelId)});
    this.unsubscribe=this.kit.subscribe(values=>{this.apply(values);this.presetUI.update({panelId,presets:DialStore.getPresets(panelId),activePresetId:DialStore.getActivePresetId(panelId)});});
    this.bind();this.bindSimpleControls();
    $('studio-status').textContent='Presets saved in this browser';
    document.body.classList.add('dialkit-ready');
    this.app.renderer.setSize(this.app.editor.viewport.clientWidth,this.app.editor.viewport.clientHeight);
    this.app.cinema.resize();
  }
  makeConfig(){
    const config={particles:{},interaction:{_collapsed:true},layers:{_collapsed:true},lighting:{_collapsed:true},atmosphere:{_collapsed:true},finish:{_collapsed:true},camera:{_collapsed:true}};
    for(const [path,id]of Object.entries(map)){
      put(config,path,id==='@style'?select(['Mono','LiDAR','Texture','Paper'].map((label,i)=>({value:String(i),label})),this.app.getState().style):control(id));
    }
    for(const path of ['particles.morph','interaction.flow','interaction.carry','lighting.position','lighting.falloff','lighting.response','finish.bloom','camera.feedback','camera.reveal'])put(config,path+'._collapsed',true);
    const framing=this.readFraming();
    config.camera.framing={_collapsed:true,distance:[framing.distance,.2,30,.05],azimuth:[framing.azimuth,-180,180,.1],elevation:[framing.elevation,5,85,.1]};
    config.camera.reveal.macro=action('Prepare macro pull back');config.camera.reveal.play=action('Play / pause reveal');config.camera.reveal.restart=action('Restart reveal');
    config.camera.reveal.approach=action('Approach: wide → close');config.camera.reveal.pullBack=action('Pull back: detail → wide');
    config.camera.reset=action('Reset camera');config.camera.capture=action('Save PNG');
    for(let i=0;i<4;i++)config.layers['layer'+(i+1)]=this.layerConfig(i);
    return config;
  }
  layerConfig(i){
    const layer=this.editor.layers[i];
    return {_collapsed:true,name:{type:'text',default:layer.name},visible:layer.visible,
      shape:{_collapsed:true,type:select(shapes,layer.shape),scale:[layer.size,.25,8,.05],opacity:[layer.opacity,0,100,1],rotation:[layer.rotation,0,360,1],randomRotation:layer.random,softness:[layer.softness,0,100,1],surfaceOffset:[layer.offset,-.5,.8,.01],blend:select([{value:'normal',label:'Normal'},{value:'additive',label:'Additive'}],layer.blend)},
      color:{_collapsed:true,source:select(['Global look','Solid','Height gradient','Random blend','Model texture'].map((label,i)=>({value:String(i),label})),layer.colorMode),a:layer.colorA,b:layer.colorB},
      pattern:{_collapsed:true,type:select(['Organic surface','3D grid','Scan lines','3D checker','Concentric rings'].map((label,i)=>({value:String(i),label})),layer.pattern),spacing:[layer.spacing,.03,.6,.01],coverage:[layer.fill,5,100,1]},
      sprite:{_collapsed:true,asset:select(this.library.options(),''),upload:action('Upload sprite / atlas'),example:action('Use example atlas'),preview:action('Preview sprite'),columns:[layer.cols,1,16,1],rows:[layer.rows,1,16,1],mode:select(['Fixed frame','Random per particle','Animated atlas'].map((label,i)=>({value:String(i),label})),layer.atlasMode),frame:[layer.frame,0,255,1],fps:[layer.fps,1,30,1],tint:layer.tint,background:select(['Image alpha','Remove black','Remove white'].map((label,i)=>({value:String(i),label})),layer.alpha)},
      response:{_collapsed:true,mouse:layer.hover,light:layer.light},reset:action('Reset this layer')};
  }
  readFraming(){
    const c=this.app.cinema,delta=c.camera.position.clone().sub(this.app.fx.offset).sub(c.controls.target);
    return {distance:Math.round(delta.length()*10)/10,azimuth:Math.round(THREE.MathUtils.radToDeg(Math.atan2(delta.x,delta.z))*10)/10,elevation:Math.round(THREE.MathUtils.radToDeg(Math.asin(delta.y/delta.length()))*10)/10};
  }
  applyFraming(value){
    const c=this.app.cinema;c.stopRevealMotion();this.app.fx.beforeCamera();this.app.fx.offset.set(0,0,0);
    const a=THREE.MathUtils.degToRad(value.azimuth),e=THREE.MathUtils.degToRad(value.elevation),d=value.distance;
    c.camera.position.copy(c.controls.target).add(new THREE.Vector3(Math.sin(a)*Math.cos(e)*d,Math.sin(e)*d,Math.cos(a)*Math.cos(e)*d));c.controls.update();
  }
  apply(values){
    if(this.applying)return;
    this.applying=true;const corrections={};
    try{
      for(const [path,id]of Object.entries(map)){
        const value=at(values,path);if(value===undefined||this.previous&&value===at(this.previous,path))continue;
        if(id==='@style'){document.querySelectorAll('[data-preset]')[Number(value)]?.click();continue;}
        const el=$(id);
        if(el.type==='checkbox'){el.checked=value;el.dispatchEvent(new Event('change'));}
        else{
          el.value=el.type==='color'?hexColor(value):String(value);
          el.dispatchEvent(new Event('input'));
          if(id==='density')el.dispatchEvent(new Event('change'));
        }
      }
      if(!values.camera.reveal.enabled&&this.app.cinema.reveal.enabled)this.app.cinema.setRevealEnabled(false);
      for(let i=0;i<4;i++){
        const value=values.layers['layer'+(i+1)],layer=this.editor.layers[i];
        this.applyLayer(layer,value);
        if(value.sprite.frame!==layer.frame)corrections['layer'+(i+1)]={sprite:{frame:layer.frame}};
        if(layer._assetRequest!==value.sprite.asset)this.loadAsset(layer,value.sprite.asset,i);
      }
      if(!this.previous||JSON.stringify(values.camera.framing)!==JSON.stringify(this.previous.camera.framing)){
        this.applyFraming(values.camera.framing);
        const r=this.app.cinema.reveal;
        if(r.enabled&&r.style===1){r.progress=r.target=Number(values.camera.reveal.progress)/100;r.driving=true;this.app.cinema.updateCamera(0);}
      }
      this.editor.renderLayers();this.editor.syncForm();
      this.previous=clone(values);
    }finally{this.applying=false;}
    if(Object.keys(corrections).length)queueMicrotask(()=>this.kit.setValues({layers:corrections}));
  }
  applyLayer(layer,value){
    for(const [path,key]of Object.entries(layerMap)){
      let v=at(value,path);if(v===undefined)continue;
      if(numericLayer.has(key))v=Number(v);
      if(key==='colorA'||key==='colorB')v=hexColor(v);
      if(key==='name')v=String(v).slice(0,32).trim()||'Layer';
      layer[key]=v;
    }
    layer.cols=Math.min(layer.cols,layer.asset?.image.width||16);layer.rows=Math.min(layer.rows,layer.asset?.image.height||16);
    layer.frame=Math.min(layer.frame,layer.cols*layer.rows-1);
    this.editor.apply(layer);
  }
  async loadAsset(layer,id,index){
    layer._assetRequest=id;this.editor.releaseAsset(layer);
    if(!id){layer._storedAsset='';this.editor.apply(layer);return;}
    const record=this.library.records.get(id);
    if(!record){this.app.toast('A preset sprite is missing. Upload it again from this layer.');return;}
    const url=URL.createObjectURL(record.blob),image=new Image();
    const task=(async()=>{
      try{
        image.src=url;await image.decode();
        if(layer._assetRequest!==id){URL.revokeObjectURL(url);return;}
        const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
        layer.asset={name:record.name,url,image,texture};layer._storedAsset=id;
        const values=this.kit.getValues();this.applyLayer(layer,values.layers['layer'+(index+1)]);
        if(this.editor.selected===layer.id)this.editor.syncForm();
      }catch(error){URL.revokeObjectURL(url);this.app.toast('Could not restore sprite: '+error.message);}
    })();
    this.assetTasks.set(index,task);await task;if(this.assetTasks.get(index)===task)this.assetTasks.delete(index);
  }
  refreshAssets(){
    for(let i=1;i<=4;i++)this.config.layers['layer'+i].sprite.asset.options=this.library.options();
    this.kit.updateConfig(clone(this.config));
  }
  async upload(file,index,example=false){
    if(!file)return;
    try{
      const record=await this.library.add(file);this.refreshAssets();
      this.kit.setValues({layers:{['layer'+(index+1)]:{visible:true,shape:{type:'6',scale:Math.max(3,this.editor.layers[index].size)},sprite:{asset:record.id,columns:example?4:1,rows:example?2:1,frame:0,mode:example?'1':'0',tint:example}}}});
      this.app.toast('Sprite saved locally. It will be restored with your presets.');
    }catch(error){this.app.toast(error.message);}
  }
  async onAction(path){
    try{
      const match=path.match(/^layers\.layer([1-4])\.(.+)$/);
      if(match){
        const index=Number(match[1])-1,task=match[2],layer=this.editor.layers[index];
        if(task==='sprite.upload'){this.uploadIndex=index;$('studio-sprite-input').click();}
        if(task==='sprite.example'){
          await this.editor.example(file=>this.upload(file,index,true));
        }
        if(task==='sprite.preview'){
          if(!layer.asset){this.app.toast('Upload a sprite first.');return;}
          $('asset-preview-image').src=layer.asset.url;$('asset-preview-name').textContent=layer.asset.name;$('asset-preview').showModal();
        }
        if(task==='reset'){
          const defaults=clone(this.defaults.layers['layer'+(index+1)]);this.kit.setValues({layers:{['layer'+(index+1)]:defaults}});
        }
        return;
      }
      if(path==='camera.reset'){$('reset-camera').click();this.kit.setValues({camera:{framing:this.readFraming(),reveal:{enabled:false,progress:0}}});}
      if(path==='camera.capture')$('capture').click();
      if(path==='camera.reveal.macro'){$('reveal-macro').click();this.syncReveal();}
      if(path==='camera.reveal.play'){$('reveal-play').click();this.syncReveal();}
      if(path==='camera.reveal.restart'){$('reveal-reset').click();$('reveal-play').click();this.syncReveal();}
      if(path==='camera.reveal.approach')this.kit.setValues({camera:{reveal:{startDistance:18,endDistance:8.5}}});
      if(path==='camera.reveal.pullBack')this.kit.setValues({camera:{reveal:{startDistance:3.5,endDistance:13.5}}});
    }catch(error){this.app.toast(error.message);}
  }
  syncReveal(){
    const r=this.app.cinema.reveal;
    this.syncValues({camera:{scroll:$('scroll-action').value,reveal:{style:String(r.style),hold:r.hold,focusX:r.focusX,focusY:r.focusY,focusZ:r.focusZ,duration:r.duration,startDistance:r.start,endDistance:r.end,enabled:r.enabled,progress:Math.round(r.progress*1000)/10}}});
  }
  syncValues(values){
    if(this.applying)return;
    const changed=(patch,current)=>Object.entries(patch).some(([key,value])=>value&&typeof value==='object'?changed(value,current?.[key]):value!==current?.[key]);
    if(!changed(values,this.kit.getValues()))return;
    this.applying=true;
    try{this.kit.setValues(values);this.previous=clone(this.kit.getValues());}finally{this.applying=false;}
  }
  bind(){
    // Keep the non-preset timeline and camera gestures in sync without feeding
    // their current values back into playback or interrupting a drag.
    this.app.cinema.controls.addEventListener('end',()=>{this.syncValues({camera:{framing:this.readFraming()}});this.syncReveal();});
    for(const id of ['zoom-in','zoom-out'])$(id).addEventListener('click',()=>this.syncValues({camera:{framing:this.readFraming()}}));
    $('reset-camera').addEventListener('click',()=>{this.syncValues({camera:{framing:this.readFraming(),reveal:{enabled:false,progress:0}}});});
    this.timer=setInterval(()=>{
      // Background views follow persisted changes without publishing their
      // own intermediate animation state back to the active editor.
      if(!document.hidden&&document.hasFocus())this.syncReveal();
    },250);
    $('studio-sprite-input').addEventListener('change',event=>{this.upload(event.target.files[0],this.uploadIndex);event.target.value='';});
    $('asset-preview-close').addEventListener('click',()=>$('asset-preview').close());
    $('save-preset').addEventListener('click',()=>{
      const name=$('preset-name').value.trim()||'Look '+(DialStore.getPresets(panelId).length+1);
      this.syncValues({camera:{framing:this.readFraming()}});this.syncReveal();
      DialStore.savePreset(panelId,name);$('preset-name').value='';this.app.toast('Preset saved: '+name);
    });
    $('export-preset').addEventListener('click',()=>this.exportPreset().catch(e=>this.app.toast(e.message)));
    $('import-preset').addEventListener('click',()=>$('preset-file').click());
    $('preset-file').addEventListener('change',async e=>{try{await this.importPreset(e.target.files[0]);}catch(error){this.app.toast(error.message);}finally{e.target.value='';}});
    // Capture defaults from config independently of any persisted active version.
    const resolve=config=>Object.fromEntries(Object.entries(config).filter(([k,v])=>!k.startsWith('_')&&v?.type!=='action').map(([k,v])=>[k,Array.isArray(v)?v[0]:v&&typeof v==='object'?(v.type?v.default??'':resolve(v)):v]));
    this.defaults=resolve(this.config);
  }

  refreshSpriteSelect(){
    const el=$('saved-sprite');if(!el)return;
    const value=this.editor.layer?._assetRequest||'';
    el.replaceChildren(...this.library.options().map(item=>{const option=document.createElement('option');option.value=item.value;option.textContent=item.label;return option;}));
    el.value=value;
  }
  syncLayerControls(layer=this.editor.layer){
    const index=this.editor.layers.indexOf(layer),values={};
    for(const[path,key]of Object.entries(layerMap)){
      let value=layer[key];const config=at(this.config.layers['layer'+(index+1)],path);
      if(config?.type==='select')value=String(value);
      put(values,path,value);
    }
    values.sprite.asset=layer._assetRequest||'';
    this.syncValues({layers:{['layer'+(index+1)]:values}});
  }
  bindSimpleControls(){
    const originalSync=this.editor.syncForm.bind(this.editor);
    this.editor.syncForm=()=>{originalSync();this.refreshSpriteSelect();};
    this.editor.loadSprite=(file,example=false,layer=this.editor.layer)=>this.upload(file,this.editor.layers.indexOf(layer),example);
    this.refreshSpriteSelect();
    $('saved-sprite').addEventListener('change',()=>{
      const index=this.editor.layers.indexOf(this.editor.layer),asset=$('saved-sprite').value;
      this.kit.setValues({layers:{['layer'+(index+1)]:{shape:{type:asset?'6':'0'},sprite:{asset}}}});
    });
    const globals=new Map(Object.entries(map).map(([path,id])=>[id,path]));
    const layerInputs=new Set(['layer-name','layer-size','layer-opacity','layer-rotation','layer-softness','layer-offset','layer-blend','layer-random','layer-hover','layer-light','color-mode','color-a','color-b','pattern-mode','pattern-scale','pattern-fill','atlas-mode','atlas-frame','atlas-fps','atlas-cols','atlas-rows','sprite-alpha','sprite-tint']);
    const handle=event=>{
      if(this.applying)return;
      if(!event.composedPath().some(el=>el.matches?.('.editor-panel,.model-library')))return;
      const target=event.target,id=target.id;
      if(event.type!=='click'){
        if(globals.has(id)){
          const patch={},value=target.type==='checkbox'?target.checked:target.tagName==='SELECT'||target.type==='color'?target.value:Number(target.value);
          put(patch,globals.get(id),value);this.syncValues(patch);
          if(id.startsWith('reveal-')||id==='scroll-action')this.syncReveal();
        }
        if(layerInputs.has(id))this.syncLayerControls();
        if(id==='reveal-direction')this.syncValues({camera:{reveal:{startDistance:this.app.cinema.reveal.start,endDistance:this.app.cinema.reveal.end}}});
      }else{
        const style=target.closest('[data-preset]');
        if(style)this.syncValues({particles:{appearance:String(this.app.getState().style)}});
        if(target.closest('[data-shape]'))this.syncLayerControls();
        if(target.closest('.layer-visible'))for(const layer of this.editor.layers)this.syncLayerControls(layer);
        if(id==='sprite-remove'||id==='editor-reset'){
          this.editor.layer._assetRequest='';this.editor.layer._storedAsset='';
          this.syncLayerControls();this.refreshSpriteSelect();
        }
        if(['reveal-play','reveal-reset','reveal-macro','reveal-focus'].includes(id))this.syncReveal();
      }
    };
    for(const name of ['input','change','click'])document.addEventListener(name,handle);
  }

  async serializePreset(){
    this.syncValues({camera:{framing:this.readFraming()}});this.syncReveal();
    const values=writable(this.kit.getValues()),assets=await this.library.export(Object.values(values.layers).map(l=>l.sprite.asset));
    const data={format:'percepta-preset',version:1,name:DialStore.getPresets(panelId).find(p=>p.id===DialStore.getActivePresetId(panelId))?.name||'Percepta look',values,assets};
    return data;
  }
  async exportPreset(){
    const data=await this.serializePreset();
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='percepta-preset.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async importPreset(file){
    if(!file)return;if(file.size>96*1024*1024)throw new Error('Preset files must be smaller than 96 MB.');
    const data=JSON.parse(await file.text());
    if(data.format!=='percepta-preset'||data.version!==1||!data.values||!Array.isArray(data.assets)||data.assets.length>4)throw new Error('This is not a supported Percepta preset.');
    const ids=new Map();
    for(const asset of data.assets){
      if(typeof asset.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(asset.data))throw new Error('Invalid sprite in preset.');
      const response=await fetch(asset.data),blob=await response.blob(),record=await this.library.add(new File([blob],String(asset.name||'Sprite'),{type:blob.type}));ids.set(asset.id,record.id);
    }
    for(const layer of Object.values(data.values.layers||{})){
      const id=layer.sprite?.asset;if(id&&!ids.has(id)&&!this.library.records.has(id))throw new Error('This preset is missing a required sprite.');
      if(ids.has(id))layer.sprite.asset=ids.get(id);
    }
    if(data.values.camera?.reveal)data.values.camera.reveal={style:'0',hold:20,focusX:0,focusY:0,focusZ:0,...data.values.camera.reveal};
    this.refreshAssets();this.kit.setValues(writable(data.values));DialStore.savePreset(panelId,String(data.name||'Imported look').slice(0,80));this.app.toast('Preset imported and saved.');
  }
  getState(){return {id:panelId,values:this.kit.getValues(),presets:DialStore.getPresets(panelId),active:DialStore.getActivePresetId(panelId),assets:this.library.records.size};}
}
