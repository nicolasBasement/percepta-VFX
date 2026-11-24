import * as THREE from 'three';
import {random} from './surface.js';
const $=id=>document.getElementById(id);
export function fogUniforms(){return {uFogDensity:{value:.018},uFogGround:{value:0},uFogNear:{value:5},uFogColor:{value:new THREE.Color('#395165')}};}
const volumeVertex=/* glsl */`
attribute float seed;
uniform float uTime;
uniform float uPixelRatio;
uniform float uHaze;
varying float vSeed;
varying float vDepth;
void main(){
  vec3 p=position;
  p.x += sin(uTime*.09+seed*40.)*.35;
  p.y += sin(uTime*.13+seed*27.)*.22;
  p.z += cos(uTime*.07+seed*53.)*.3;
  vec4 mv=modelViewMatrix*vec4(p,1.);
  vDepth=-mv.z;vSeed=seed;
  gl_Position=projectionMatrix*mv;
  float size=mix(2.2,110.,uHaze)*(.7+seed*.6);
  gl_PointSize=clamp(size*uPixelRatio*8./max(2.,-mv.z),1.,160.);
}`;
const volumeFragment=/* glsl */`
uniform vec3 uFogColor;
uniform float uAmount;
uniform float uHaze;
uniform float uFogDensity;
uniform float uFogNear;
varying float vSeed;
varying float vDepth;
void main(){
  float radius=length(gl_PointCoord-.5);
  if(radius>.5)discard;
  float profile=pow(max(0.,1.-radius*2.),mix(1.8,2.6,uHaze));
  float fade=1.-exp(-max(vDepth-1.,0.)*.5);
  float depth=max(0.,vDepth-uFogNear);
  fade*=exp(-depth*depth*uFogDensity*uFogDensity*.5);
  float alpha=profile*uAmount*mix(.65,.11,uHaze)*fade;
  vec3 color=mix(uFogColor,vec3(.64,.73,.78),.3*(1.-uHaze));
  gl_FragColor=vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export class SceneFX{
  constructor({scene,camera,controls,material,field,editor,reducedMotion}){
    Object.assign(this,{scene,camera,controls,material,editor,reducedMotion});
    this.offset=new THREE.Vector3();this.targetOffset=new THREE.Vector3();this.right=new THREE.Vector3();this.up=new THREE.Vector3();this.forward=new THREE.Vector3();
    this.mode=reducedMotion?0:1;this.intensity=.25;this.speed=1;this.dragging=false;
    const shared=material.uniforms;
    for(const key of ['uFogDensity','uFogGround','uFogNear','uFogColor'])field.material.uniforms[key]=shared[key];
    this.volumes=[this.createVolume(1800,0,shared),this.createVolume(230,1,shared)];
    controls.addEventListener('start',()=>this.dragging=true);controls.addEventListener('end',()=>this.dragging=false);
    $('camera-mode').value=this.mode;
    this.bind();
  }
  createVolume(count,haze,shared){
    const rng=random(haze?392:214),positions=new Float32Array(count*3),seeds=new Float32Array(count);
    for(let i=0;i<count;i++){positions.set([(rng()-.5)*16,rng()*8-3.3,(rng()-.5)*16],i*3);seeds[i]=rng();}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
    const material=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uPixelRatio:shared.uPixelRatio,uHaze:{value:haze},uAmount:{value:0},
      uFogColor:shared.uFogColor,uFogDensity:shared.uFogDensity,uFogNear:shared.uFogNear},vertexShader:volumeVertex,fragmentShader:volumeFragment,transparent:true,depthWrite:false});
    const points=new THREE.Points(geometry,material);points.frustumCulled=false;points.visible=false;this.scene.add(points);return points;
  }
  beforeCamera(){this.camera.position.sub(this.offset);}
  update(dt,time,morph,cameraLocked=false){
    const pointer=this.editor.getPointer();
    this.right.set(1,0,0).applyQuaternion(this.camera.quaternion);this.up.set(0,1,0).applyQuaternion(this.camera.quaternion);
    this.forward.copy(this.camera.position).sub(this.controls.target).normalize();
    this.targetOffset.set(0,0,0);
    const amount=this.intensity*(this.dragging||cameraLocked?0:1);
    if(this.mode===1||this.mode===4){
      const active=pointer.active?1:0;
      this.targetOffset.addScaledVector(this.right,pointer.x*amount*.65*active).addScaledVector(this.up,pointer.y*amount*.4*active);
    }
    if(this.mode===2||this.mode===4){
      const t=time*this.speed;
      this.targetOffset.addScaledVector(this.forward,Math.sin(t*.55)*amount*.4).addScaledVector(this.up,Math.cos(t*.37)*amount*.12);
    }
    if(this.mode===3||this.mode===4){
      // Return to the user's exact orbit position at each model stop.
      const envelope=Math.sin((morph%1)*Math.PI);
      this.targetOffset.addScaledVector(this.forward,-envelope*amount*1.4).addScaledVector(this.right,Math.sin(morph*Math.PI*2)*amount*.45);
    }
    if(cameraLocked)this.offset.set(0,0,0);else this.offset.lerp(this.targetOffset,1-Math.exp(-dt*5));
    if(this.mode===0&&this.offset.lengthSq()<1e-8)this.offset.set(0,0,0);
    this.camera.position.add(this.offset);this.camera.lookAt(this.controls.target);
    this.volumes.forEach(v=>v.material.uniforms.uTime.value=time);
  }
  getState(){return {fog:this.material.uniforms.uFogDensity.value,groundFog:this.material.uniforms.uFogGround.value,dust:this.volumes[0].material.uniforms.uAmount.value,haze:this.volumes[1].material.uniforms.uAmount.value,cameraMode:this.mode,cameraOffset:this.offset.toArray()};}
  bind(){
    for(const[id,key,mult]of [['fog-density','uFogDensity',.0012],['fog-ground','uFogGround',.01],['fog-near','uFogNear',1]]){
      $(id).addEventListener('input',()=>{const n=Number($(id).value);this.material.uniforms[key].value=n*mult;$(id+'-value').textContent=id==='fog-near'?n.toFixed(1):n+'%';});
    }
    $('fog-color').addEventListener('input',()=>this.material.uniforms.uFogColor.value.set($('fog-color').value));
    for(const[id,index]of [['atmosphere-dust',0],['atmosphere-haze',1]]){
      $(id).addEventListener('input',()=>{const n=Number($(id).value);this.volumes[index].material.uniforms.uAmount.value=n/100;this.volumes[index].visible=n>0;$(id+'-value').textContent=n+'%';});
    }
    $('camera-mode').addEventListener('input',()=>this.mode=Number($('camera-mode').value));
    $('camera-intensity').addEventListener('input',()=>{this.intensity=Number($('camera-intensity').value)/100;$('camera-intensity-value').textContent=$('camera-intensity').value+'%';});
    $('camera-speed').addEventListener('input',()=>{this.speed=Number($('camera-speed').value);$('camera-speed-value').textContent=this.speed.toFixed(1)+'×';});
  }
}
