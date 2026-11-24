export default async () => {
const T=await import('three'),{ParticleDynamics}=await import('./particle-dynamics.js'),{interactionUniforms}=await import('./particle-editor.js');
const r=percepta.renderer,results=[],check=(name,pass,detail)=>{results.push({name,pass:!!pass,detail});if(!pass)throw new Error(name+': '+JSON.stringify(detail));};
const g=new T.BufferGeometry(),count=1024;
g.setAttribute('position',new T.BufferAttribute(new Float32Array(count*3),3));g.setAttribute('targetPosition',new T.BufferAttribute(new Float32Array(count*3),3));
g.setAttribute('seed',new T.BufferAttribute(Float32Array.from({length:count},(_,i)=>i/count),1));
const u={...interactionUniforms(),uProgress:{value:0}};u.uInteraction.value=6;
const c=new T.PerspectiveCamera(43,1,.1,100);c.position.z=5;c.updateMatrixWorld();
const d=new ParticleDynamics(r,u,g),flow={awake:false,inertia:.5,recovery:.6,swirl:.55,strength:.45,width:.04};
const read=memory=>{const a=new Float32Array(d.size*d.size*4);r.readRenderTargetPixels(memory?d.carryTargets[d.carryCurrent]:d.targets[d.current],0,0,d.size,d.size,a);return a;};
const advance=n=>{for(let i=0;i<n;i++)d.update(1/120,c,flow);};
const max=a=>Math.max(...Array.from({length:count},(_,i)=>Math.hypot(a[i*4],a[i*4+1])));
try{
 d.setPointer(.5,.5,true);advance(30);check('Stationary hover does not capture',read(true).every(v=>v===0));
 d.setPointer(.85,.85,true);advance(1);d.clear();d.setPointer(.85,.85,true);advance(1);d.setPointer(.9,.9,true);advance(1);
 check('Moving away from surface captures no particles',read(true).every(v=>v===0));
 d.clear();d.setPointer(.45,.5,true);advance(1);d.setPointer(.55,.5,true);advance(1);
 const mem=read(true),ids=Array.from({length:count},(_,i)=>i).filter(i=>mem[i*4]>0);
 check('Stroke captures only a subset',ids.length>350&&ids.length<750,ids.length);
 check('Particles have varied release times',new Set(ids.map(i=>mem[i*4].toFixed(3))).size>100);
 for(let step=0;step<60;step++){d.setPointer(.55+step/59*.2,.5,true);advance(1);}
 const state=read(),followed=ids.filter(i=>state[i*4]>.025).length;
 check('Captured particles follow outside original silhouette',followed>ids.length*.5,{followed,total:ids.length,maxTravel:max(state)});
 check('Uncaptured points preserve the surface',Array.from({length:count},(_,i)=>i).filter(i=>!ids.includes(i)).every(i=>state[i*4]===0&&state[i*4+1]===0));
 check('Travel is bounded',max(state)<.301);
 advance(300);check('Contact expires with cursor still present',read(true).every((v,i)=>i%4!==0||v===0));
 check('Released particles return home',max(read())<.002,max(read()));
 advance(500);check('Idle clears motion exactly',read().every(v=>v===0));
 d.clear();d.setPointer(.45,.5,true);advance(1);d.setPointer(.55,.5,true);advance(15);d.setPointer(.6,.5,false);advance(1);
 check('Leaving viewport releases contact',read(true).every(v=>v===0));
 d.clear();u.uInteraction.value=5;d.setPointer(.45,.5,true);advance(1);d.setPointer(.55,.5,true);advance(1);
 check('Original flow does not activate carry',read(true).every(v=>v===0));
 return results;
}finally{window.carryTestResults=results;d.dispose();g.dispose();}
};
