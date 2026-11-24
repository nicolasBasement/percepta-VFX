export default async () => {
const THREE=await import('three');
const {appearanceUniforms,interactionUniforms}=await import('./particle-editor.js');
const {fogUniforms}=await import('./scene-fx.js');
const {cinematicUniforms}=await import('./cinematic-effects.js');
const {vertexShader,fragmentShader}=await import('./shaders.js');
const renderer=window.percepta.renderer,results=[];
const check=(name,condition,detail)=>{results.push({name,pass:!!condition,detail});if(!condition)throw new Error(name+': '+JSON.stringify(detail));};
const saved={target:renderer.getRenderTarget(),color:renderer.getClearColor(new THREE.Color()),alpha:renderer.getClearAlpha()};
const rt=new THREE.WebGLRenderTarget(192,192),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,1,.1,100);camera.position.z=5;
const u={...appearanceUniforms(),...interactionUniforms(),...fogUniforms(),...cinematicUniforms(),uProgress:{value:0},uTime:{value:0},uSize:{value:12},uPixelRatio:{value:1},uScatter:{value:0},uMotion:{value:0},uStyle:{value:0},uField:{value:0}};
u.uInteraction.value=0;u.uFogDensity.value=0;u.uLightingEnabled.value=1;u.uLightPosition.value.set(0,0,5);u.uLightColor.value.set('#ffffff');u.uLightSize.value=1;u.uLightIntensity.value=1;
const g=new THREE.BufferGeometry();
for(const[key,value]of Object.entries({position:[0,0,0],targetPosition:[0,0,0],sourceColor:[1,1,1],targetColor:[1,1,1],sourceNormal:[0,0,1],targetNormal:[0,0,1]}))g.setAttribute(key,new THREE.Float32BufferAttribute(value,3));
g.setAttribute('seed',new THREE.Float32BufferAttribute([.3],1));
const m=new THREE.ShaderMaterial({uniforms:u,vertexShader,fragmentShader,transparent:true,depthWrite:false}),points=new THREE.Points(g,m);points.frustumCulled=false;scene.add(points);
const data=new Uint8Array(192*192*4);
function render(){
 renderer.setRenderTarget(rt);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,192,192,data);renderer.setRenderTarget(null);
 let count=0,sum=0;for(let i=0;i<data.length;i+=4){if(data[i+3]>20)count++;sum+=data[i]+data[i+1]+data[i+2];}return {count,sum,center:[...data.slice((96*192+96)*4,(96*192+96)*4+4)]};
}

const memData=new Float32Array([1,1.5,1,1]),mem=new THREE.DataTexture(memData,1,1,THREE.RGBAFormat,THREE.FloatType);mem.needsUpdate=true;
u.uCarryMap.value=mem;u.uInteraction.value=6;u.uParticleReady.value=1;u.uLightingEnabled.value=0;
g.setAttribute('particleUV',new THREE.Float32BufferAttribute([.5,.5],2));
try{
 u.uCarryScale.value=0;const base=render().count;
 u.uCarryScale.value=1;const large=render().count;check('Contact grows sprite independently of motion',large>base*3,{base,large});
 memData[0]=.04;mem.needsUpdate=true;const releasing=render().count;
 check('Size eases down before release',releasing<large&&releasing>=base,{releasing});
 memData[0]=0;mem.needsUpdate=true;check('Expired contact restores original size',render().count===base);
 memData[0]=1;mem.needsUpdate=true;u.uHoverEnabled.value=0;check('Layer opt-out excludes growth',render().count===base);
 u.uHoverEnabled.value=1;u.uInteraction.value=5;check('Original flow keeps original size',render().count===base);
 return results;
}finally{window.carryScaleTestResults=results;renderer.setRenderTarget(saved.target);renderer.setClearColor(saved.color,saved.alpha);g.dispose();m.dispose();rt.dispose();mem.dispose();}
};
