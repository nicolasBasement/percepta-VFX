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
try{
 const facing=render();check('Light: lit normal produces particles',facing.count>100,facing);
 u.uLightPosition.value.z=-5;const back=render();check('Light: opposite face is hidden',back.count===0,back.count);
 u.uLightAffected.value=0;check('Light: layer can opt out',render().count>100);u.uLightAffected.value=1;
 u.uLightPosition.value.z=5;u.uLightIntensity.value=0;check('Light: zero intensity hides particles without ambient fill',render().count===0);
 u.uLightIntensity.value=.5;const small=render();u.uLightIntensity.value=2;const big=render();check('Light: stronger light increases point size',big.count>small.count*3,{small:small.count,big:big.count});
 u.uLightColor.value.set('#ff0000');const red=render().center;check('Light: source color affects particles',red[0]>50&&red[1]===0&&red[2]===0,red);u.uLightColor.value.set('#ffffff');
 u.uLightType.value=0;u.uLightRange.value=2;u.uLightPosition.value.z=2;const near=render();u.uLightPosition.value.z=8;const far=render();check('Point light: distance reduces illumination',near.sum>far.sum*2,{near:near.sum,far:far.sum});
 g.attributes.position.setXYZ(0,1.2,0,0);g.attributes.targetPosition.setXYZ(0,1.2,0,0);g.attributes.position.needsUpdate=true;g.attributes.targetPosition.needsUpdate=true;
 u.uLightPosition.value.set(0,0,5);u.uLightRange.value=10;u.uLightType.value=0;const point=render();u.uLightType.value=2;u.uLightAngle.value=10*Math.PI/180;const spot=render();
 check('Spotlight: cone rejects points outside beam',point.count>0&&spot.count===0,{point:point.count,spot:spot.count});
 u.uLightType.value=1;u.uLightPosition.value.z=-5;u.uLightShadow.value=.4;check('Light: shadow fill restores dark faces',render().count>0);u.uLightShadow.value=0;
 u.uLightingEnabled.value=0;u.uRevealEnabled.value=1;u.uRevealProgress.value=0;check('Reveal: zero progress hides surface',render().count===0);
 u.uRevealProgress.value=.3;const partial=render();u.uRevealProgress.value=1;const full=render();check('Reveal: progressive size and visibility',partial.count>0&&partial.count<full.count,{partial:partial.count,full:full.count});
 u.uRevealEnabled.value=0;const normal=render();check('Reveal: full progress preserves normal rendering',normal.count===full.count&&normal.sum===full.sum);
 u.uRevealEnabled.value=1;u.uRevealStyle.value=1;u.uRevealProgress.value=0;
 check('Macro: particles are visible from the first frame',render().sum===full.sum);
 u.uRevealProgress.value=1;check('Macro: final surface matches normal rendering',render().sum===normal.sum);
 g.attributes.position.setXYZ(0,0,0,0);g.attributes.targetPosition.setXYZ(0,0,0,0);g.attributes.position.needsUpdate=true;g.attributes.targetPosition.needsUpdate=true;
 camera.position.z=.5;u.uSize.value=1;u.uRevealStyle.value=0;const clampedDetail=render();u.uRevealStyle.value=1;const macroDetail=render();
 check('Macro: nearby particles grow with perspective',macroDetail.count>clampedDetail.count*3,{classic:clampedDetail.count,macro:macroDetail.count});
 u.uField.value=1;const macroField=render();u.uRevealStyle.value=0;const classicField=render();
 check('Macro: floor rendering is unchanged',macroField.sum===classicField.sum&&macroField.count===classicField.count);
 return results;
}finally{renderer.setRenderTarget(saved.target);renderer.setClearColor(saved.color,saved.alpha);g.dispose();m.dispose();rt.dispose();window.lightingTestResults=results;}
};
