export default async () => {
const {FlowField}=await import('./flow-field.js');
const results=[],check=(name,condition,detail)=>{results.push({name,pass:!!condition,detail});if(!condition)throw new Error(name+': '+JSON.stringify(detail));};
const advance=(f,seconds,rate=120)=>{for(let i=0;i<Math.round(seconds*rate);i++)f.update(1/rate);};
const stationary=new FlowField();stationary.move(.5,.5);for(let i=0;i<120;i++){stationary.move(.5,.5);stationary.update(1/120);}
check('A stationary mouse injects no force',!stationary.awake&&stationary.data.every(v=>v===0));
const simulate=(duration,rate=120)=>{
 const f=new FlowField();f.aspect=1.2;f.move(.3,.5);let peak=0,speed=0;
 const steps=Math.round(duration*rate);
 for(let i=1;i<=steps;i++){f.move(.3+.4*i/steps,.5);f.update(1/rate);peak=Math.max(peak,f.maxDisplacement);speed=Math.max(speed,f.maxVelocity);}
 for(let i=0;i<rate;i++){f.update(1/rate);peak=Math.max(peak,f.maxDisplacement);}
 return {f,peak,speed};
};
const fast=simulate(.125),slow=simulate(1.25);
check('Fast movement gives greater velocity',fast.speed>slow.speed*2,{fast:fast.speed,slow:slow.speed});
check('Fast movement produces a stronger wake',fast.peak>slow.peak*1.15,{fast:fast.peak,slow:slow.peak});
const f=new FlowField();f.move(.35,.5);f.move(.65,.5);f.update(1/60);
const release=f.maxDisplacement;advance(f,.1);
check('Displacement continues after input stops',f.maxDisplacement>release*1.5,{release,after:f.maxDisplacement});
advance(f,8);
check('All particles recover exactly without leaving viewport',!f.awake&&f.data.every(v=>v===0),f.getState());
const direction=new FlowField();direction.move(.3,.5);direction.move(.7,.5);direction.update(1/60);
let positive=0,negative=0;for(let i=2;i<direction.data.length;i+=4){if(direction.data[i]>0)positive+=direction.data[i];else negative-=direction.data[i];}
check('Impulse follows mouse direction instead of radial repulsion',positive>negative*20,{positive,negative});
const opposite=new FlowField();opposite.move(.7,.5);opposite.move(.3,.5);opposite.update(1/60);
let sum=0;for(let i=2;i<opposite.data.length;i+=4)sum+=opposite.data[i];
check('Reversed stroke reverses velocity',sum<0,sum);
const a=new FlowField(),b=new FlowField();for(const field of [a,b]){field.move(.3,.45);field.move(.7,.55);}
advance(a,.5,120);advance(b,.5,30);
let difference=0;for(let i=0;i<a.data.length;i++)difference=Math.max(difference,Math.abs(a.data[i]-b.data[i]));
check('Fixed-step integration agrees at 30 and 120 fps',difference<.000001,difference);
const zero=new FlowField();zero.strength=0;zero.move(.3,.5);zero.move(.7,.5);advance(zero,1);
check('Zero strength prevents injection',zero.data.every(v=>v===0));
const max=new FlowField();max.inertia=1;max.recovery=0;max.strength=1;max.swirl=1;max.move(.2,.5);
for(let i=0;i<120;i++){max.move(.5+Math.sin(i*.18)*.3,.5+Math.cos(i*.18)*.2);max.update(1/120);}
check('Strong repeated strokes stay finite and bounded',max.data.every(Number.isFinite)&&max.maxDisplacement<=.22001,max.getState());
const coast=new FlowField();coast.move(.4,.5);coast.move(.6,.5);coast.update(1/60);coast.endStroke();const before=coast.data.slice();coast.move(.95,.9);coast.update(0);
check('Re-entering does not create a jump impulse',coast.data.every((v,i)=>v===before[i]));
coast.clear();check('Clear removes position, velocity and input history',coast.data.every(v=>v===0)&&coast.previous===null);
const p=window.percepta,e=p.editor,$=id=>document.getElementById(id),wait=ms=>new Promise(r=>setTimeout(r,ms));
const set=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('input',{bubbles:true}));};
set('interaction-mode',5);set('camera-mode',0);set('flow-inertia',70);set('flow-recovery',50);set('flow-swirl',40);
check('Controls update simulation settings',e.flow.inertia===.7&&e.flow.recovery===.5&&e.flow.swirl===.4);
const view=$('viewport'),rect=view.getBoundingClientRect();
const move=x=>view.dispatchEvent(new PointerEvent('pointermove',{pointerType:'mouse',clientX:rect.left+rect.width*x,clientY:rect.top+rect.height*.5}));
move(.3);for(let i=1;i<=12;i++){move(.3+i*.025);await wait(8);}
check('Pointer events excite a persistent flow field',e.flow.awake&&e.flow.maxDisplacement>.005,e.flow.getState());
check('Flow texture receives simulated displacement',e.material.uniforms.uFlowMap.value.image.data===e.flow.data&&e.material.uniforms.uFlowSize.value.x===96);
$('layer-add').click();
check('All layers share the same flow simulation',e.layers[0].material.uniforms.uFlowMap===e.layers[1].material.uniforms.uFlowMap);
e.removeLayer(e.layer);
set('interaction-mode',1);
check('Switching modes clears residual flow',!e.flow.awake&&e.flow.data.every(v=>v===0)&&$('flow-controls').hidden);
set('interaction-mode',5);check('Flow mode exposes inertia controls',!$('flow-controls').hidden);
view.dispatchEvent(new PointerEvent('pointerleave',{pointerType:'mouse'}));set('flow-inertia',50);set('flow-recovery',60);set('flow-swirl',55);set('camera-mode',1);
window.flowTestResults=results;return results;
};
