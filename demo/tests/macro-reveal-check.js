export default async () => {
  const app=window.percepta,c=app.cinema,$=id=>document.getElementById(id),results=[];
  const saved=structuredClone(app.studio.kit.getValues()),pose=c.camera.position.clone(),target=c.controls.target.clone();
  const check=(name,pass,detail)=>{results.push({name,pass:!!pass,detail});if(!pass)throw new Error(name+': '+JSON.stringify(detail));};
  const input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new Event('input',{bubbles:true}));};
  const scrub=p=>{c.setRevealProgress(p);for(let i=0;i<180;i++)c.updateCamera(1/60);c.controls.update();};
  try{
    $('reveal-macro').click();
    check('Macro preset configures detail, duration and visible particles',c.reveal.style===1&&c.reveal.duration===20&&c.reveal.hold===20&&c.reveal.enabled&&!c.reveal.playing);
    check('Macro starts at the detail distance immediately',Math.abs(c.camera.position.distanceTo(c.controls.target)-.55)<1e-8);
    check('Macro controls are visible and direction is hidden',!$('reveal-macro-controls').hidden&&$('reveal-direction').hidden);
    check('GPU mode is shared by every layer',app.editor.layers.every(l=>l.material.uniforms.uRevealStyle===c.material.uniforms.uRevealStyle)&&c.material.uniforms.uRevealStyle.value===1);
    const start=c.camera.position.clone(),focus=c.controls.target.clone(),distances=[];
    for(const p of [0,.2,.4,.6,.8,1]){scrub(p);distances.push(c.camera.position.distanceTo(c.controls.target));}
    check('Macro pulls back monotonically',distances.every((d,i)=>i===0||d>=distances[i-1]-1e-8),distances);
    check('Macro ends centered at the configured distance',Math.abs(distances.at(-1)-13.5)<1e-8&&c.controls.target.distanceTo(c.revealCenter)<1e-8);
    const final=c.camera.position.clone();scrub(.8);check('Final hold keeps the exact frame',c.camera.position.distanceTo(final)<1e-8);
    $('reveal-reset').click();check('Restart restores the same detail without a reverse flight',c.reveal.progress===0&&c.camera.position.distanceTo(start)<1e-8&&c.controls.target.distanceTo(focus)<1e-8);
    input('reveal-duration',2);$('reveal-play').click();for(let i=0;i<121;i++)c.updateCamera(1/60);
    check('Playback completes within its configured duration',c.reveal.progress===1&&!c.reveal.playing);
    $('reveal-play').click();check('Completed reveal can replay from the same first frame',c.reveal.playing&&c.reveal.progress===0&&c.camera.position.distanceTo(start)<1e-8);
    c.controls.dispatchEvent({type:'start'});c.controls.dispatchEvent({type:'end'});
    check('Manual orbit releases camera travel',!c.reveal.playing&&!c.reveal.driving);
    input('scroll-action','reveal');const morph=app.getState().target;c.handleWheel(100);
    check('Scroll scrubs reveal without morphing',c.reveal.target>0&&app.getState().target===morph);
    input('reveal-focus-x',.42);input('reveal-hold',30);scrub(.35);
    const exported=await app.studio.serializePreset(),r=exported.values.camera.reveal;
    check('Export retains style, focus, timing and progress',r.style==='1'&&r.focusX===.42&&r.hold===30&&r.duration===2&&r.progress===35);
    app.studio.kit.setValues({camera:{reveal:{style:'0',focusX:0,hold:0}}});app.studio.kit.setValues(exported.values);
    check('Preset restores form and GPU together',c.reveal.style===1&&c.reveal.focusX===.42&&c.reveal.hold===30&&c.material.uniforms.uRevealStyle.value===1&&$('reveal-focus-x').value==='0.42');
    c.resetCamera();check('Reset disables reveal and restores full visibility',!c.reveal.enabled&&!c.reveal.driving&&c.material.uniforms.uRevealEnabled.value===0);
    return results;
  }finally{
    c.resetCamera();app.studio.kit.setValues(saved);c.stopRevealMotion();c.camera.position.copy(pose);c.controls.target.copy(target);c.controls.update();
    window.macroRevealTestResults=results;
  }
};
