import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
const $=id=>document.getElementById(id);

export function cinematicUniforms(){
  return {uLightingEnabled:{value:0},uLightType:{value:1},uLightPosition:{value:new THREE.Vector3(4,5,3)},uLightColor:{value:new THREE.Color('#ffe7c1')},
    uLightIntensity:{value:2},uLightRange:{value:8},uLightAngle:{value:35*Math.PI/180},uLightSize:{value:.8},uLightShadow:{value:0},uLightCutoff:{value:.04},
    uRevealEnabled:{value:0},uRevealProgress:{value:1},uRevealStyle:{value:0}};
}
const gradeShader={
  uniforms:{tDiffuse:{value:null},uVignette:{value:.15},uGrain:{value:0},uTime:{value:0},uAspect:{value:1}},
  vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`
    uniform sampler2D tDiffuse;
    uniform float uVignette,uGrain,uTime,uAspect;
    varying vec2 vUv;
    void main(){
      vec4 color=texture2D(tDiffuse,vUv);
      vec2 p=(vUv-.5)*vec2(min(uAspect,1.5),1.);
      float edge=smoothstep(.18,.72,length(p));
      color.rgb*=1.-edge*uVignette*.82;
      float noise=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+floor(uTime*24.))*43758.5453)-.5;
      color.rgb=max(vec3(0.),color.rgb+noise*uGrain*.055);
      gl_FragColor=color;
    }
`
};

export class CinematicEffects{
  constructor({renderer,scene,camera,controls,material,viewport,getPoints,pauseMorph,reducedMotion}){
    Object.assign(this,{renderer,scene,camera,controls,material,viewport,getPoints,pauseMorph,reducedMotion});
    this.enabled=true;this.exposure=1;this.lastTime=0;this.clearColor=new THREE.Color();
    this.composer=new EffectComposer(renderer);
    this.renderPass=new RenderPass(scene,camera);
    this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.35,.25,.55);
    this.grade=new ShaderPass(gradeShader);this.output=new OutputPass();
    this.composer.addPass(this.renderPass);this.composer.addPass(this.bloom);this.composer.addPass(this.grade);this.composer.addPass(this.output);
    this.marker=new THREE.Group();this.marker.visible=false;
    this.lamp=new THREE.Mesh(new THREE.SphereGeometry(.1,12,8),new THREE.MeshBasicMaterial({color:'#ffe7c1',toneMapped:false}));
    this.aim=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(4,5,3),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:'#ffe7c1',transparent:true,opacity:.5,toneMapped:false}));
    this.marker.add(this.lamp,this.aim);scene.add(this.marker);
    this.reveal={enabled:false,progress:0,target:0,playing:false,driving:false,duration:4,start:18,end:8.5,style:0,hold:20,focusX:0,focusY:0,focusZ:0};
    this.revealCenter=new THREE.Vector3(0,-.1,0);
    controls.addEventListener('start',()=>this.stopRevealMotion());
    this.bind();this.syncLight();this.setRevealEnabled(false);this.resize();
  }
  resize(){
    const r=this.viewport.getBoundingClientRect();
    this.composer.setPixelRatio(this.renderer.getPixelRatio());this.composer.setSize(r.width,r.height);
    this.grade.uniforms.uAspect.value=r.width/Math.max(1,r.height);
  }
  render(dt=0,time=this.lastTime){
    this.lastTime=time;
    this.renderer.toneMappingExposure=this.exposure;
    if(this.enabled){
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      this.bloom.enabled=this.bloom.strength>0;
      this.grade.enabled=this.grade.uniforms.uVignette.value>0||this.grade.uniforms.uGrain.value>0;
      this.grade.uniforms.uTime.value=time;
      // RenderPass clears before scene.render refreshes the GL clear color.
      // Prime that color in linear space, so the dark background is not decoded twice.
      const previousTarget=this.renderer.getRenderTarget();
      this.renderer.getClearColor(this.clearColor);
      this.renderer.setRenderTarget(this.composer.readBuffer);
      this.renderer.setClearColor(this.clearColor,this.renderer.getClearAlpha());
      this.renderer.setRenderTarget(previousTarget);
      this.composer.render(dt);
    }else{
      this.renderer.toneMapping=THREE.NoToneMapping;
      this.renderer.render(this.scene,this.camera);
    }
  }
  syncLight(){
    const u=this.material.uniforms,p=u.uLightPosition.value;
    this.lamp.position.copy(p);this.lamp.material.color.copy(u.uLightColor.value);this.aim.material.color.copy(u.uLightColor.value);
    const line=this.aim.geometry.attributes.position;line.setXYZ(0,p.x,p.y,p.z);line.needsUpdate=true;this.aim.geometry.computeBoundingSphere();
    this.marker.visible=u.uLightingEnabled.value>.5&&$('light-helper').checked;
    $('light-range').disabled=u.uLightType.value===1;$('light-angle').disabled=u.uLightType.value!==2;
  }
  setRevealStyle(style){
    this.reveal.style=Number(style);this.material.uniforms.uRevealStyle.value=this.reveal.style;
    $('reveal-style').value=String(this.reveal.style);
    const macro=this.reveal.style===1;
    $('reveal-macro-controls').hidden=!macro;
    $('reveal-direction').hidden=macro;document.querySelector('label[for="reveal-direction"]').hidden=macro;
    if(this.reveal.enabled)this.reveal.driving=true;
  }
  focusVisibleDetail(){
    const points=this.getPoints?.();if(!points)return;
    this.stopRevealMotion();this.pauseMorph();
    this.camera.updateMatrixWorld();points.updateWorldMatrix(true,false);
    const a=points.geometry.attributes,point=new THREE.Vector3(),other=new THREE.Vector3(),projected=new THREE.Vector3();
    const best=new THREE.Vector3(),progress=this.material.uniforms.uProgress.value;
    let score=Infinity;
    // Pick a front-facing detail near the center of the user's current view.
    // Read the same per-particle morph delay as the surface shader.
    for(let i=0;i<a.position.count;i++){
      const delay=a.seed.getX(i)*.19,t=THREE.MathUtils.smoothstep(progress,delay,.81+delay);
      point.fromBufferAttribute(a.position,i);other.fromBufferAttribute(a.targetPosition,i);point.lerp(other,t).applyMatrix4(points.matrixWorld);
      projected.copy(point).project(this.camera);
      if(projected.z< -1||projected.z>1)continue;
      const radial=Math.hypot(projected.x*this.camera.aspect,projected.y);
      const depth=point.distanceTo(this.camera.position);
      const candidate=radial<.16?depth*.001:1+radial;
      if(candidate<score){score=candidate;best.copy(point);}
    }
    if(!Number.isFinite(score))best.copy(this.revealCenter);
    for(const axis of ['x','y','z']){
      const value=THREE.MathUtils.clamp(Math.round(best[axis]*100)/100,-4,4);
      this.reveal['focus'+axis.toUpperCase()]=value;
      $('reveal-focus-'+axis).value=value;$('reveal-focus-'+axis+'-value').textContent=value.toFixed(2);
    }
    this.syncReveal();
  }
  prepareMacro(){
    this.focusVisibleDetail();this.setRevealStyle(1);
    for(const [key,value]of Object.entries({duration:20,start:.55,end:13.5,hold:20})){
      this.reveal[key]=value;$('reveal-'+key).value=value;
      $('reveal-'+key+'-value').textContent=key==='hold'?value+'%':value.toFixed(key==='start'?2:1)+(key==='duration'?' s':'');
    }
    this.reveal.progress=0;this.reveal.target=0;this.reveal.playing=false;
    this.setRevealEnabled(true);this.updateCamera(0);
  }
  setScrollAction(action){
    const reveal=this.reveal.enabled&&action==='reveal';
    $('scroll-action').value=reveal?'reveal':'morph';
    $('scroll-action').disabled=!this.reveal.enabled;
    document.querySelector('.desktop-hint').textContent=reveal?'Scroll to reveal':'Scroll to morph';
  }
  setRevealEnabled(enabled){
    const wasEnabled=this.reveal.enabled;
    if(enabled&&!wasEnabled)this.overview={position:this.camera.position.clone(),target:this.controls.target.clone()};
    this.reveal.enabled=enabled;$('reveal-enabled').checked=enabled;
    this.material.uniforms.uRevealEnabled.value=Number(enabled);
    if(enabled){
      this.reveal.driving=true;this.pauseMorph();
      if(!wasEnabled)this.setScrollAction('reveal');
    }else{
      this.reveal.playing=false;this.reveal.driving=false;
      this.material.uniforms.uRevealProgress.value=1;
      this.setScrollAction('morph');
      if(wasEnabled&&this.overview){
        this.camera.position.copy(this.overview.position);this.controls.target.copy(this.overview.target);this.controls.update();
        this.overview=null;
      }
    }
    this.syncReveal();
  }
  setRevealProgress(progress){
    this.reveal.target=THREE.MathUtils.clamp(progress,0,1);this.reveal.playing=false;
    if(this.reveal.enabled){this.reveal.driving=true;this.pauseMorph();}
    else this.reveal.progress=this.reveal.target;
    this.syncReveal();
  }
  stopRevealMotion(){this.reveal.playing=false;this.reveal.driving=false;this.reveal.target=this.reveal.progress;this.syncReveal();}
  resetCamera(){
    this.setRevealEnabled(false);this.reveal.progress=0;this.reveal.target=0;this.material.uniforms.uRevealProgress.value=1;this.syncReveal();
  }
  syncReveal(){
    const r=this.reveal;
    $('reveal-play').textContent=r.playing?'Pause reveal':'Play reveal';
    $('reveal-play').setAttribute('aria-pressed',String(r.playing));
    for(const id of ['reveal-progress','reveal-reset'])$(id).disabled=!r.enabled;
    $('reveal-progress').value=r.progress*100;$('reveal-progress-value').textContent=Math.round(r.progress*100)+'%';
  }
  updateCamera(dt){
    const r=this.reveal;if(!r.enabled)return;
    const wasPlaying=r.playing;
    if(r.playing){r.target=Math.min(1,r.target+dt/r.duration);if(r.target===1)r.playing=false;}
    r.progress=(this.reducedMotion||(r.style===1&&wasPlaying))?r.target:THREE.MathUtils.damp(r.progress,r.target,10,dt);
    if(Math.abs(r.progress-r.target)<.0001)r.progress=r.target;
    this.material.uniforms.uRevealProgress.value=r.progress;
    if(r.driving){
      const direction=this.camera.position.clone().sub(this.controls.target);
      if(r.style===1){
        const t=THREE.MathUtils.clamp(r.progress/(1-r.hold/100),0,1);
        const ease=t*t*t*(t*(t*6-15)+10);
        // Geometric spacing keeps the apparent zoom continuous across scales.
        const distance=Math.exp(THREE.MathUtils.lerp(Math.log(Math.max(.2,r.start)),Math.log(Math.max(.2,r.end)),ease));
        this.controls.target.set(r.focusX,r.focusY,r.focusZ).lerp(this.revealCenter,ease);
        this.camera.position.copy(this.controls.target).add(direction.setLength(distance));
      }else{
        const ease=r.progress*r.progress*(3-2*r.progress);
        const desired=THREE.MathUtils.lerp(r.start,r.end,ease);
        const distance=this.reducedMotion?desired:THREE.MathUtils.damp(direction.length(),desired,10,dt);
        this.camera.position.copy(this.controls.target).add(direction.setLength(distance));
      }
    }
    this.syncReveal();
  }
  handleWheel(delta){
    if(!this.reveal.enabled||$('scroll-action').value!=='reveal')return false;
    this.setRevealProgress(this.reveal.target+THREE.MathUtils.clamp(delta,-160,160)*.0008);
    return true;
  }
  getState(){
    const u=this.material.uniforms;
    return {post:{enabled:this.enabled,bloom:this.bloom.strength,radius:this.bloom.radius,threshold:this.bloom.threshold,exposure:this.exposure},
      light:{enabled:u.uLightingEnabled.value>.5,type:u.uLightType.value,position:u.uLightPosition.value.toArray(),intensity:u.uLightIntensity.value,sizeResponse:u.uLightSize.value},
      reveal:{...this.reveal,scroll:$('scroll-action').value}};
  }
  bind(){
    $('post-enabled').addEventListener('change',()=>this.enabled=$('post-enabled').checked);
    for(const[id,key,scale,format]of [['bloom-strength','strength',1,'number'],['bloom-radius','radius',.01,'percent'],['bloom-threshold','threshold',1,'number']]){
      $(id).addEventListener('input',()=>{this.bloom[key]=Number($(id).value)*scale;$(id+'-value').textContent=format==='percent'?$(id).value+'%':Number($(id).value).toFixed(2);});
    }
    $('post-exposure').addEventListener('input',()=>{this.exposure=Number($('post-exposure').value);$('post-exposure-value').textContent=this.exposure.toFixed(2);});
    for(const[id,key]of [['post-vignette','uVignette'],['post-grain','uGrain']])$(id).addEventListener('input',()=>{this.grade.uniforms[key].value=Number($(id).value)/100;$(id+'-value').textContent=$(id).value+'%';});
    $('light-enabled').addEventListener('change',()=>{this.material.uniforms.uLightingEnabled.value=Number($('light-enabled').checked);this.syncLight();});
    $('light-type').addEventListener('input',()=>{this.material.uniforms.uLightType.value=Number($('light-type').value);this.syncLight();});
    for(const axis of ['x','y','z'])$('light-'+axis).addEventListener('input',()=>{const n=Number($('light-'+axis).value);this.material.uniforms.uLightPosition.value[axis]=n;$('light-'+axis+'-value').textContent=n.toFixed(1);this.syncLight();});
    $('light-color').addEventListener('input',()=>{this.material.uniforms.uLightColor.value.set($('light-color').value);this.syncLight();});
    for(const[id,key,scale,format]of [['light-intensity','uLightIntensity',1,'number'],['light-range','uLightRange',1,'distance'],['light-angle','uLightAngle',Math.PI/180,'angle'],['light-size','uLightSize',.01,'percent'],['light-shadow','uLightShadow',.01,'percent'],['light-cutoff','uLightCutoff',1,'number']]){
      $(id).addEventListener('input',()=>{const n=Number($(id).value);this.material.uniforms[key].value=n*scale;$(id+'-value').textContent=format==='percent'?n+'%':format==='angle'?n+'°':n.toFixed(format==='distance'?1:2);});
    }
    $('light-helper').addEventListener('change',()=>this.syncLight());
    $('reveal-style').addEventListener('input',()=>this.setRevealStyle($('reveal-style').value));
    $('reveal-macro').addEventListener('click',()=>this.prepareMacro());
    $('reveal-overview').addEventListener('click',()=>$('reset-camera').click());
    $('reveal-focus').addEventListener('click',()=>{this.focusVisibleDetail();this.setRevealProgress(0);});
    $('reveal-hold').addEventListener('input',()=>{this.reveal.hold=Number($('reveal-hold').value);$('reveal-hold-value').textContent=this.reveal.hold+'%';if(this.reveal.enabled)this.reveal.driving=true;});
    for(const axis of ['x','y','z'])$('reveal-focus-'+axis).addEventListener('input',()=>{
      const value=Number($('reveal-focus-'+axis).value);this.reveal['focus'+axis.toUpperCase()]=value;
      $('reveal-focus-'+axis+'-value').textContent=value.toFixed(2);if(this.reveal.enabled)this.reveal.driving=true;
    });
    $('reveal-enabled').addEventListener('change',()=>this.setRevealEnabled($('reveal-enabled').checked));
    $('reveal-progress').addEventListener('input',()=>this.setRevealProgress(Number($('reveal-progress').value)/100));
    $('reveal-direction').addEventListener('input',()=>{
      const away=$('reveal-direction').value==='1';
      this.reveal.start=away?3.5:18;this.reveal.end=away?13.5:8.5;
      for(const key of ['start','end']){$('reveal-'+key).value=this.reveal[key];$('reveal-'+key+'-value').textContent=this.reveal[key].toFixed(1);}
      if(this.reveal.enabled)this.reveal.driving=true;
    });
    for(const key of ['start','end','duration'])$('reveal-'+key).addEventListener('input',()=>{
      this.reveal[key]=Number($('reveal-'+key).value);$('reveal-'+key+'-value').textContent=this.reveal[key].toFixed(key==='duration'?1:2)+(key==='duration'?' s':'');if(this.reveal.enabled)this.reveal.driving=true;
    });
    $('reveal-play').addEventListener('click',()=>{
      const r=this.reveal;
      if(r.playing){this.stopRevealMotion();return;}
      this.setRevealEnabled(true);this.pauseMorph();
      if(r.progress>.995){r.progress=0;r.target=0;}
      if(r.style===1)this.updateCamera(0);
      r.playing=true;r.driving=true;this.syncReveal();
    });
    $('reveal-reset').addEventListener('click',()=>{
      if(this.reveal.style===1)this.reveal.progress=0;
      this.setRevealProgress(0);if(this.reveal.style===1)this.updateCamera(0);
    });
    $('scroll-action').addEventListener('input',()=>this.setScrollAction($('scroll-action').value));
  }
  dispose(){
    this.bloom.dispose();this.grade.dispose();this.output.dispose();this.composer.dispose();
    this.lamp.geometry.dispose();this.lamp.material.dispose();this.aim.geometry.dispose();this.aim.material.dispose();this.scene.remove(this.marker);
  }
}
