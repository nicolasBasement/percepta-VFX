export default async () => {
 const c=percepta.cinema,$=id=>document.getElementById(id),results=[];
 const check=(name,pass,detail)=>results.push({name,pass,detail});
 const input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('input',{bubbles:true}));};
 const advance=()=>{for(let i=0;i<180;i++)c.updateCamera(1/60);};
 const pose=percepta.camera.position.clone(),target=c.controls.target.clone();
 const morph=percepta.getState().target;
 try{
 c.setRevealEnabled(true);c.setRevealProgress(0);advance();
 check('Reveal starts at configured distance',Math.abs(percepta.camera.position.distanceTo(target)-18)<.01);
 input('reveal-progress',100);advance();
 check('Reveal ends at configured distance',Math.abs(percepta.camera.position.distanceTo(target)-8.5)<.01);
 check('Reveal shares progress with GPU',c.material.uniforms.uRevealProgress.value===1);
 input('reveal-direction',1);c.setRevealProgress(0);advance();
 check('Detail-first direction begins close',Math.abs(percepta.camera.position.distanceTo(target)-3.5)<.01);
 c.setRevealProgress(1);advance();
 check('Detail-first direction reveals whole model',Math.abs(percepta.camera.position.distanceTo(target)-13.5)<.01);
 input('scroll-action','reveal');c.setRevealProgress(.2);
 c.viewport.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}));
 check('Reveal scroll leaves model morph unchanged',c.reveal.target>.2&&percepta.getState().target===morph);
 c.controls.dispatchEvent({type:'start'});
 check('Manual orbit releases reveal camera',!c.reveal.driving&&!c.reveal.playing);
 input('reveal-duration',1);c.setRevealProgress(0);advance();$('reveal-play').click();advance();
 check('Playback reaches final state',c.reveal.progress===1&&!c.reveal.playing);
 c.resetCamera();check('Reset restores full surface',!c.reveal.enabled&&c.material.uniforms.uRevealEnabled.value===0);
 input('scroll-action','morph');check('Normal wheel routes to morph',c.handleWheel(100)===false);
 }finally{
 input('reveal-direction',0);input('reveal-duration',4);input('scroll-action','morph');c.resetCamera();
 percepta.camera.position.copy(pose);c.controls.target.copy(target);c.controls.update();
 }
 window.cinematicUITestResults=results;return results;
};
