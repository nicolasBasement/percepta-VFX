export default async () => {
const THREE=await import('three'),{ParticleDynamics}=await import('./particle-dynamics.js'),{interactionUniforms}=await import('./particle-editor.js');
const renderer=window.percepta.renderer,results=[];
const check=(name,condition,detail)=>{results.push({name,pass:!!condition,detail});if(!condition)throw new Error(name+': '+JSON.stringify(detail));};
const field=new Float32Array([0,0,.6,0,0,0,.6,0,0,0,.6,0,0,0,.6,0]);
const texture=new THREE.DataTexture(field,2,2,THREE.RGBAFormat,THREE.FloatType);texture.needsUpdate=true;
const uniforms={...interactionUniforms(),uProgress:{value:0}};uniforms.uFlowMap.value=texture;uniforms.uFlowSize.value.set(2,2);
function geometryFor(count){
 const g=new THREE.BufferGeometry(),positions=new Float32Array(count*3),seeds=Float32Array.from({length:count},(_,i)=>i/count);
 g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('targetPosition',new THREE.BufferAttribute(positions.slice(),3));g.setAttribute('seed',new THREE.BufferAttribute(seeds,1));return g;
}
const geometry=geometryFor(1024),camera=new THREE.PerspectiveCamera(43,1,.1,100);camera.position.z=5;camera.updateMatrixWorld();
const dynamics=new ParticleDynamics(renderer,uniforms,geometry),flow={awake:true,inertia:.5,recovery:.6,swirl:.55};
const read=()=>{const values=new Float32Array(dynamics.size*dynamics.size*4);renderer.readRenderTargetPixels(dynamics.targets[dynamics.current],0,0,dynamics.size,dynamics.size,values);return values;};
const maxOffset=data=>{let max=0;for(let i=0;i<data.length;i+=4)max=Math.max(max,Math.hypot(data[i],data[i+1]));return max;};
try{
 check('Independent GPU state available',dynamics.enabled);
 const originalTarget=renderer.getRenderTarget(),originalViewport=renderer.getViewport(new THREE.Vector4());
 for(let i=0;i<60;i++)dynamics.update(1/120,camera,flow);
 const moving=read();let still=0,moved=0,up=0,down=0;const distinct=new Set();
 for(let i=0;i<1024;i++){const x=moving[i*4],y=moving[i*4+1],magnitude=Math.hypot(x,y);if(magnitude<.000001)still++;else{moved++;distinct.add(Math.round(x*1e6)+':'+Math.round(y*1e6));}if(y>.001)up++;if(y<-.001)down++;}
 check('Coincident particles have independent trajectories',distinct.size>600,{distinct:distinct.size,moved,still});
 check('Particles disperse to both sides of the stroke',up>100&&down>100,{up,down});
 check('Some particles retain the silhouette',still>100&&still<300,still);
 check('Travel remains limited',maxOffset(moving)<.071,maxOffset(moving));
 check('Simulation preserves main render target and viewport',renderer.getRenderTarget()===originalTarget&&renderer.getViewport(new THREE.Vector4()).equals(originalViewport));
 field.fill(0);texture.needsUpdate=true;flow.awake=false;
 let crosses=0;
 for(let step=0;step<180;step++){dynamics.update(1/120,camera,flow);if(step%30===0){const state=read();for(let i=0;i<state.length;i+=4){if(state[i]*moving[i]<-1e-10||state[i+1]*moving[i+1]<-1e-10)crosses++;}}}
 check('Recovery never rebounds through the rest position',crosses===0,crosses);
 check('Independent offsets settle after force stops',maxOffset(read())<maxOffset(moving)*.025,{initial:maxOffset(moving),settled:maxOffset(read())});
 for(let i=0;i<360;i++)dynamics.update(1/120,camera,flow);
 check('Idle state clears exactly',read().every(v=>v===0)&&!dynamics.getState().active);
 const next=geometryFor(2500);dynamics.setGeometry(next);check('Density changes rebuild state texture',dynamics.size===50&&read().every(v=>v===0));next.dispose();
 const p=window.percepta,e=p.editor,set=(id,value,event='input')=>{const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event(event));},wait=ms=>new Promise(r=>setTimeout(r,ms));
 document.getElementById('layer-add').click();
 check('Layers share independent particle states',e.layers[0].material.uniforms.uParticleMap===e.layers[1].material.uniforms.uParticleMap);
 set('density',10000,'change');while(!p.getState().ready)await wait(100);
 check('Live density rebuild matches per-particle coordinates',e.dynamics.size===100&&e.layers.every(l=>l.points.geometry.attributes.particleUV.count===10000));
 set('progress',1500);await wait(1500);
 check('Morph still works with independent dynamics',Math.abs(p.getState().current-1.5)<.001&&e.dynamics.material.uniforms.uSource.value.image.width===100);
 e.removeLayer(e.layer);set('density',40000,'change');while(!p.getState().ready)await wait(100);set('progress',1000);
 window.grainTestResults=results;return results;
}finally{dynamics.dispose();geometry.dispose();texture.dispose();}
};
