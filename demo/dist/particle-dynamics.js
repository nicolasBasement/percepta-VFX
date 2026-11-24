import * as THREE from 'three';
import {carryFragment,carryEnvelope} from './particle-carry.js';
const vertex=/* glsl */`
varying vec2 vUV;
void main(){vUV=uv;gl_Position=vec4(position.xy,0.,1.);}
`;
const fragment=/* glsl */`
precision highp float;
uniform sampler2D uState;
uniform sampler2D uSource;
uniform sampler2D uTarget;
uniform sampler2D uFlowMap;
uniform sampler2D uCarryMap;
uniform vec2 uCursor;
uniform float uCarryEnabled,uCarryMix;
uniform vec2 uFlowSize;
uniform mat4 uViewProjection;
uniform float uProgress;
uniform float uDt;
uniform float uAspect;
uniform float uInertia;
uniform float uRecovery;
uniform float uSwirl;
varying vec2 vUV;
${carryEnvelope}
vec2 currentAt(vec2 uv){
  vec2 grid=clamp(uv*uFlowSize-.5,vec2(0.),uFlowSize-1.);
  vec2 base=floor(grid),f=fract(grid),a=(base+.5)/uFlowSize,h=1./uFlowSize;
  return mix(mix(texture2D(uFlowMap,a).zw,texture2D(uFlowMap,a+vec2(h.x,0.)).zw,f.x),
             mix(texture2D(uFlowMap,a+vec2(0.,h.y)).zw,texture2D(uFlowMap,a+h).zw,f.x),f.y);
}
void main(){
  vec4 source=texture2D(uSource,vUV),target=texture2D(uTarget,vUV);
  if(source.w<0.){gl_FragColor=vec4(0.);return;}
  float seed=source.w;
  float delay=seed*.19,t=smoothstep(delay,.81+delay,uProgress);
  vec4 clip=uViewProjection*vec4(mix(source.xyz,target.xyz,t),1.);
  vec4 state=texture2D(uState,vUV);
  vec2 offset=state.xy,velocity=state.zw;
  vec2 sampleUV=clip.xy/max(.0001,clip.w)*.5+.5+offset/vec2(uAspect,1.);
  vec2 flow=vec2(0.);
  if(clip.w>0. && min(sampleUV.x,sampleUV.y)>=0. && max(sampleUV.x,sampleUV.y)<=1.)flow=currentAt(sampleUV);
  // Each point owns its momentum. Nearby points have independent response,
  // so the surface breaks into grains rather than stretching as a sheet.
  float randomA=fract(sin(seed*473.17+12.1)*14375.45);
  float randomB=fract(sin(seed*231.53+71.7)*24317.73);
  float mobility=smoothstep(.16,.82,seed);
  float angle=(randomA-.5)*(2.4+uSwirl*2.);
  vec2 impulse=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*flow;
  impulse*=mobility*(.5+randomB*1.2);
  float drag=6.+(1.-uInertia)*8.+randomB*2.;
  velocity=velocity*exp(-drag*uDt)+impulse*uDt*5.5;
  vec4 memory=texture2D(uCarryMap,vUV);
  float follow=carryEnvelope(memory)*uCarryEnabled*uCarryMix;
  // Seek a loose, individual point near the cursor. Velocity relaxes towards
  // pursuit, without an elastic position tether or a common target for all points.
  vec2 jitter=vec2(cos(randomA*6.283),sin(randomA*6.283))*(.012+randomB*.025);
  vec2 toward=(uCursor-sampleUV)*vec2(uAspect,1.)+jitter;
  vec2 desiredVelocity=toward*(4.+randomB*3.);
  velocity=mix(velocity,desiredVelocity,(1.-exp(-12.*uDt))*follow);
  float speed=length(velocity);
  if(speed>.6)velocity*=.6/speed;
  // First-order homing, not a spring: never accelerate back through rest.
  float returning=(2.5+uRecovery*5.)*(.7+randomB*.7);
  offset=(offset+velocity*uDt)*exp(-returning*(1.-follow*.94)*uDt);
  float maxTravel=uCarryEnabled>.5 ? .18+seed*.12 : .025+seed*.045;
  if(length(offset)>maxTravel)offset*=maxTravel/length(offset);
  if(length(offset)<.000005&&length(velocity)<.00002&&length(flow)<.00005){offset=vec2(0.);velocity=vec2(0.);}
  gl_FragColor=vec4(offset,velocity);
}
`;

export class ParticleDynamics{
  constructor(renderer,uniforms,geometry){
    this.renderer=renderer;this.shared=uniforms;this.enabled=renderer.extensions.has('EXT_color_buffer_float');this.size=0;this.tail=0;this.current=0;this.targets=[];this.carryTargets=[];this.carryCurrent=0;this.carryTail=0;this.carryMix=.65;this.carryDuration=1.6;this.cursor=new THREE.Vector2(.5,.5);this.previousCursor=null;this.cursorActive=false;
    if(!this.enabled)return;
    this.scene=new THREE.Scene();this.camera=new THREE.Camera();
    this.material=new THREE.ShaderMaterial({uniforms:{
      uState:{value:null},uSource:{value:null},uTarget:{value:null},uFlowMap:uniforms.uFlowMap,uFlowSize:uniforms.uFlowSize,
      uCarryMap:{value:uniforms.uCarryMap?.value||null},uCarryEnabled:{value:0},uCarryMix:{value:.65},
      uCursor:{value:this.cursor},uPreviousCursor:{value:new THREE.Vector2()},uCursorActive:{value:0},uCursorMoving:{value:0},uCarryRadius:{value:.04},uCarryDuration:{value:1.6},
      uViewProjection:{value:new THREE.Matrix4()},uProgress:uniforms.uProgress,uDt:{value:0},uAspect:{value:1},uInertia:{value:.5},uRecovery:{value:.6},uSwirl:{value:.55}
    },vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false});
    this.carryMaterial=new THREE.ShaderMaterial({uniforms:{...this.material.uniforms,uMemory:{value:null}},vertexShader:vertex,fragmentShader:carryFragment,depthTest:false,depthWrite:false});
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.quad.frustumCulled=false;this.scene.add(this.quad);
    this.setGeometry(geometry);
  }
  preserveRender(callback){
    const r=this.renderer,target=r.getRenderTarget(),color=r.getClearColor(new THREE.Color()),alpha=r.getClearAlpha(),viewport=r.getViewport(new THREE.Vector4());
    try{callback();}finally{r.setRenderTarget(target);r.setViewport(viewport);r.setClearColor(color,alpha);}
  }
  setGeometry(geometry){
    if(!this.enabled)return;
    const count=geometry.attributes.position.count,size=Math.ceil(Math.sqrt(count));
    if(size!==this.size){
      this.targets.forEach(t=>t.dispose());this.carryTargets.forEach(t=>t.dispose());this.size=size;
      this.targets=[0,1].map(()=>new THREE.WebGLRenderTarget(size,size,{type:THREE.FloatType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false}));
      this.carryTargets=this.targets.map(t=>t.clone());
      this.clear();
    }
    this.source?.dispose();this.target?.dispose();
    const from=new Float32Array(size*size*4),to=new Float32Array(size*size*4),p=geometry.attributes.position,q=geometry.attributes.targetPosition,seeds=geometry.attributes.seed;
    for(let i=0;i<size*size;i++){
      from[i*4+3]=-1;
      if(i<count){from.set([p.getX(i),p.getY(i),p.getZ(i),seeds.getX(i)],i*4);to.set([q.getX(i),q.getY(i),q.getZ(i),1],i*4);}
    }
    this.source=new THREE.DataTexture(from,size,size,THREE.RGBAFormat,THREE.FloatType);
    this.target=new THREE.DataTexture(to,size,size,THREE.RGBAFormat,THREE.FloatType);this.source.needsUpdate=true;this.target.needsUpdate=true;
    this.material.uniforms.uSource.value=this.source;this.material.uniforms.uTarget.value=this.target;
    this.clearCarry();
    this.shared.uParticleReady.value=1;this.shared.uParticleMap.value=this.targets[this.current].texture;
  }
  clear(){
    if(!this.enabled||!this.targets.length)return;
    this.preserveRender(()=>{this.renderer.setClearColor(0,0);for(const target of [...this.targets,...this.carryTargets]){this.renderer.setRenderTarget(target);this.renderer.clear();}});
    this.current=0;this.tail=0;this.carryCurrent=0;this.carryTail=0;this.previousCursor=null;this.shared.uParticleMap.value=this.targets[0].texture;
    if(this.shared.uCarryMap)this.shared.uCarryMap.value=this.carryTargets[0].texture;
  }
  clearCarry(){
    if(!this.enabled||!this.carryTargets.length)return;
    this.preserveRender(()=>{this.renderer.setClearColor(0,0);for(const target of this.carryTargets){this.renderer.setRenderTarget(target);this.renderer.clear();}});
    this.carryCurrent=0;this.carryTail=0;this.previousCursor=null;
    if(this.shared.uCarryMap)this.shared.uCarryMap.value=this.carryTargets[0].texture;
    this.material.uniforms.uCarryMap.value=this.carryTargets[0].texture;
  }
  setPointer(x,y,active){this.cursor.set(x,y);this.cursorActive=active;if(!active)this.previousCursor=null;}
  update(dt,camera,flow){
    if(!this.enabled)return;
    const mixed=this.shared.uInteraction?.value>5.5;
    const moved=mixed&&this.cursorActive&&this.previousCursor&&this.cursor.distanceToSquared(this.previousCursor)>.00000001;
    const u=this.material.uniforms;
    u.uPreviousCursor.value.copy(this.previousCursor||this.cursor);
    this.previousCursor=this.cursorActive?this.cursor.clone():null;
    if(moved)this.carryTail=this.carryDuration+.1;else this.carryTail=Math.max(0,this.carryTail-dt);
    if(!mixed||!this.cursorActive){if(this.carryTail>0)this.clearCarry();}
    u.uCarryEnabled.value=Number(mixed);u.uCursorActive.value=Number(this.cursorActive);u.uCursorMoving.value=Number(!!moved);
    u.uCarryMix.value=this.carryMix*Math.min(1,(flow.strength??.45)*2.2);u.uCarryDuration.value=this.carryDuration;u.uCarryRadius.value=flow.width??.04;
    if(flow.awake||this.carryTail>0)this.tail=4;
    else this.tail=Math.max(0,this.tail-dt);
    if(this.tail===0){if(this.wasRunning)this.clear();this.wasRunning=false;return;}
    this.wasRunning=true;
    u.uViewProjection.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    u.uAspect.value=camera.aspect;u.uInertia.value=flow.inertia;u.uRecovery.value=flow.recovery;u.uSwirl.value=flow.swirl;
    const steps=Math.max(1,Math.ceil(dt/(1/90)));u.uDt.value=Math.min(.05,dt)/steps;
    this.preserveRender(()=>{
      for(let i=0;i<steps;i++){
        if(mixed){
          const nextCarry=1-this.carryCurrent;
          this.carryMaterial.uniforms.uMemory.value=this.carryTargets[this.carryCurrent].texture;
          this.quad.material=this.carryMaterial;this.renderer.setRenderTarget(this.carryTargets[nextCarry]);this.renderer.render(this.scene,this.camera);
          this.carryCurrent=nextCarry;u.uCarryMap.value=this.carryTargets[nextCarry].texture;
          u.uCursorMoving.value=0;
        }
        this.quad.material=this.material;
        const next=1-this.current;u.uState.value=this.targets[this.current].texture;
        this.renderer.setRenderTarget(this.targets[next]);this.renderer.render(this.scene,this.camera);this.current=next;
      }
    });
    this.shared.uParticleMap.value=this.targets[this.current].texture;
    if(this.shared.uCarryMap)this.shared.uCarryMap.value=this.carryTargets[this.carryCurrent].texture;
  }
  dispose(){
    this.targets.forEach(t=>t.dispose());this.carryTargets.forEach(t=>t.dispose());this.carryMaterial?.dispose();this.source?.dispose();this.target?.dispose();this.material?.dispose();this.quad?.geometry.dispose();this.shared.uParticleReady.value=0;
  }
  getState(){return {independent:this.enabled,textureSize:this.size,active:this.tail>0,carryDuration:this.carryDuration,carryMix:this.carryMix,carrying:this.carryTail>0};}
}
