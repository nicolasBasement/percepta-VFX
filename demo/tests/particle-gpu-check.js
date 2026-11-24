export default async () => {
const THREE=await import('three');
const {appearanceUniforms,interactionUniforms}=await import('./particle-editor.js');
const {fogUniforms}=await import('./scene-fx.js');
const {vertexShader,fragmentShader}=await import('./shaders.js');
const results=[];const check=(name,condition,detail)=>{results.push({name,pass:!!condition,detail});if(!condition)throw new Error(name+': '+JSON.stringify(detail));};
const {renderer}=window.percepta;
const savedClear=renderer.getClearColor(new THREE.Color()),savedAlpha=renderer.getClearAlpha();
const rt=new THREE.WebGLRenderTarget(160,160),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,1,.1,100);camera.position.z=5;
const u={...appearanceUniforms(),...interactionUniforms(),...fogUniforms(),uProgress:{value:0},uTime:{value:0},uSize:{value:28},uPixelRatio:{value:1},uScatter:{value:0},uMotion:{value:0},uStyle:{value:0},uField:{value:0}};
u.uFogDensity.value=0;u.uColorMode.value=1;u.uColorA.value.set('#ff0000');u.uSoftness.value=0;u.uInteraction.value=0;
const geometry=new THREE.BufferGeometry();
for(const [key,data]of Object.entries({position:[0,0,0],targetPosition:[0,0,0],sourceColor:[1,1,1],targetColor:[1,1,1],sourceNormal:[0,1,0],targetNormal:[0,1,0]}))geometry.setAttribute(key,new THREE.Float32BufferAttribute(data,3));
geometry.setAttribute('seed',new THREE.Float32BufferAttribute([.3],1));
const material=new THREE.ShaderMaterial({uniforms:u,vertexShader,fragmentShader,transparent:true,depthWrite:false});
const points=new THREE.Points(geometry,material);points.frustumCulled=false;scene.add(points);
const pixels=new Uint8Array(160*160*4);
function render(){
 renderer.setRenderTarget(rt);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,160,160,pixels);renderer.setRenderTarget(null);
 let count=0,x=0,y=0,hash=2166136261;
 for(let p=0;p<pixels.length;p+=4){hash=Math.imul(hash^pixels[p],16777619);hash=Math.imul(hash^pixels[p+3],16777619);if(pixels[p+3]>50){count++;x+=(p/4)%160;y+=Math.floor(p/4/160);}}
 return {count,x:x/count,y:y/count,hash:hash>>>0,center:Array.from(pixels.slice((80*160+80)*4,(80*160+80)*4+4))};
}
try{
 const shapes=[];for(let i=0;i<6;i++){u.uShape.value=i;shapes.push(render());}
 check('GPU: six distinct particle silhouettes',new Set(shapes.map(s=>s.hash)).size===6,shapes.map(s=>s.count));
 check('GPU: ring has transparent center',shapes[3].center[3]===0&&shapes[0].center[3]>100,{ring:shapes[3].center,circle:shapes[0].center});
 u.uShape.value=0;u.uOpacity.value=1;const solid=render();u.uOpacity.value=.2;const transparent=render();
 check('GPU: layer opacity changes alpha',transparent.center[3]<solid.center[3]*.3);u.uOpacity.value=1;
 u.uColorA.value.set('#00ff00');const green=render();check('GPU: custom color',green.center[1]>150&&green.center[0]<5,green.center);u.uColorA.value.set('#ff0000');
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');
 for(const [i,color]of ['#ff0000','#00ff00','#0000ff','#ffff00'].entries()){ctx.fillStyle=color;ctx.fillRect((i%2)*32,Math.floor(i/2)*32,32,32);}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
 u.uSprite.value=texture;u.uHasSprite.value=1;u.uShape.value=6;u.uSpritePixels.value.set(64,64);u.uAtlasGrid.value.set(2,2);
 const frames=[];for(let i=0;i<4;i++){u.uAtlasFrame.value=i;frames.push(render().center);}
 check('GPU: atlas top-left origin and row order',frames[0][0]>150&&frames[0][1]<5&&frames[1][1]>150&&frames[1][0]<5&&frames[2][2]>150&&frames[3][0]>150&&frames[3][1]>150,frames);
 u.uAtlasMode.value=2;u.uAtlasFrame.value=0;u.uAtlasFPS.value=2;u.uTime.value=.55;const animated=render().center;
 check('GPU: atlas animation advances frame',animated[1]>150&&animated[0]<5,animated);
 u.uAtlasMode.value=1;u.uTime.value=0;const seeded=render().center;
 check('GPU: stable random atlas frame per particle',seeded[1]>150&&seeded[0]<5,seeded);
 u.uAtlasMode.value=0;u.uAtlasFrame.value=0;u.uSpriteTint.value=1;u.uColorA.value.set('#0000ff');const tinted=render().center;
 check('GPU: sprite tint applies selected color',tinted[0]<5&&tinted[2]<5,tinted);
 u.uSpriteTint.value=0;u.uShape.value=0;u.uColorA.value.set('#ff0000');u.uHasSprite.value=0;
 geometry.attributes.position.setXYZ(0,.23,0,0);geometry.attributes.position.needsUpdate=true;
 const baseline=render();u.uPointerOrigin.value.set(0,0,5);u.uPointerDirection.value.set(0,0,-1);u.uPointerRadius.value=1;u.uPointerActive.value=1;u.uPointerStrength.value=.6;
 const interactions=[];for(let mode=1;mode<=4;mode++){u.uInteraction.value=mode;interactions.push(render());}
 check('GPU: repulsion moves away from pointer ray',interactions[0].x>baseline.x+5,{base:baseline.x,result:interactions[0].x});
 check('GPU: attraction moves toward pointer ray',interactions[1].x<baseline.x-2,{base:baseline.x,result:interactions[1].x});
 check('GPU: vortex and waves move particles',Math.abs(interactions[2].y-baseline.y)>3&&Math.abs(interactions[3].y-baseline.y)>1,interactions.map(x=>[x.x,x.y]));
 u.uHoverEnabled.value=0;check('GPU: per-layer mouse opt-out',render().hash===baseline.hash);u.uInteraction.value=0;
 u.uFogNear.value=0;u.uFogDensity.value=.3;u.uFogColor.value.set('#0000ff');const fog=render().center;
 check('GPU: depth fog colors distant points',fog[2]>50&&fog[0]<solid.center[0],fog);
 u.uFogDensity.value=0;u.uFogGround.value=1;const lowFog=render().center;check('GPU: low fog is independent',lowFog[2]>0,lowFog);
 u.uFogGround.value=0;u.uPattern.value=2;u.uPatternFill.value=.1;u.uPatternScale.value=.3;const scan=render();
 check('GPU: scan pattern filters points',scan.count===0,scan.count);

 u.uPattern.value=0;u.uFogGround.value=0;u.uFogDensity.value=0;u.uHoverEnabled.value=1;
 u.uInteraction.value=0;const resting=render();
 const flowData=new Float32Array(3*3*4);for(let i=0;i<flowData.length;i+=4)flowData[i]=.05;
 const flowTexture=new THREE.DataTexture(flowData,3,3,THREE.RGBAFormat,THREE.FloatType);flowTexture.needsUpdate=true;
 u.uParticleReady.value=1;u.uParticleMap.value=flowTexture;geometry.setAttribute('particleUV',new THREE.Float32BufferAttribute([.5,.5],2));
 u.uFlowMap.value=flowTexture;u.uFlowSize.value.set(3,3);u.uFlowViewHeight.value=2*Math.tan(camera.fov*Math.PI/360);
 u.uFlowRight.value.set(1,0,0);u.uFlowUp.value.set(0,1,0);u.uInteraction.value=5;u.uPointerActive.value=0;
 const flowing=render();
 check('GPU: persistent flow displaces particles without active cursor',flowing.x>resting.x+5,{rest:resting.x,flow:flowing.x});
 u.uHoverEnabled.value=0;check('GPU: layer opt-out excludes flow',render().hash===resting.hash);u.uHoverEnabled.value=1;
 camera.position.z=10;u.uInteraction.value=0;const farRest=render();u.uInteraction.value=5;const farFlow=render();
 check('GPU: screen-space flow has consistent perspective scale',Math.abs((farFlow.x-farRest.x)-(flowing.x-resting.x))<1.2,{near:flowing.x-resting.x,far:farFlow.x-farRest.x});
 camera.position.z=5;flowData.fill(0);flowTexture.needsUpdate=true;
 check('GPU: zero flow exactly restores rest position',render().hash===resting.hash);
 flowTexture.dispose();

 texture.dispose();
 return results;
}finally{renderer.setRenderTarget(null);renderer.setClearColor(savedClear,savedAlpha);rt.dispose();geometry.dispose();material.dispose();window.particleGPUResults=results;}
};
