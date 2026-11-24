export default async () => {
 const p=percepta,s=p.studio,results=[],check=(name,pass)=>{results.push({name,pass:!!pass});if(!pass)throw new Error(name);};
 await Promise.all([...s.assetTasks.values()]);
 const expected=JSON.parse(sessionStorage.getItem('percepta-qa-expected'));
 check('Reload restores selected version',s.getState().active===expected.amber);
 check('Reload restores GPU values and layer visibility',p.cinema.bloom.strength===.8&&p.editor.layers[1].visible&&p.editor.material.uniforms.uLightingEnabled.value===1);
 check('Reload restores persisted sprite and atlas',p.editor.layers[0]._storedAsset===expected.asset&&!!p.editor.layers[0].asset&&p.editor.layers[0].cols===4&&p.editor.layers[0].rows===2);
 check('Reload restores framing without activating reveal',Math.abs(s.readFraming().distance-11)<.05&&!p.cinema.reveal.enabled);
 const portable=await s.serializePreset();
 check('Export embeds images as data, not temporary URLs',portable.assets.length===1&&portable.assets[0].data.startsWith('data:image/png;base64,')&&!JSON.stringify(portable).includes('blob:'));
 check('Export omits action callbacks',portable.values.camera.capture===undefined&&portable.values.layers.layer1.sprite.upload===undefined);
 s.kit.setValues({finish:{bloom:{strength:0}},layers:{layer1:{sprite:{asset:''}},layer2:{visible:false}}});
 await s.importPreset(new File([JSON.stringify(portable)],'test-preset.json',{type:'application/json'}));await Promise.all([...s.assetTasks.values()]);
 check('Import restores controls and sprite',p.cinema.bloom.strength===.8&&p.editor.layers[1].visible&&p.editor.layers[0]._storedAsset===expected.asset);
 let rejected=false;try{await s.importPreset(new File(['{"format":"wrong"}'],'invalid.json'));}catch{rejected=true;}
 check('Invalid preset is rejected',rejected);
 s.kit.setValues({camera:{reveal:{enabled:true,progress:65,duration:1}}});
 await new Promise(r=>setTimeout(r,500));
 check('Reveal scrub remains enabled and reaches progress',p.cinema.reveal.enabled&&Math.abs(p.cinema.reveal.progress-.65)<.02);
 await s.onAction('camera.reveal.play');await new Promise(r=>setTimeout(r,1500));
 check('Reveal action completes playback',!p.cinema.reveal.playing&&p.cinema.reveal.progress>.99);
 await s.onAction('camera.reset');
 check('Reset camera updates DialKit and restores surface',!s.kit.getValues().camera.reveal.enabled&&p.editor.material.uniforms.uRevealEnabled.value===0);
 s.kit.setValue('layers.layer2.color.a','oklch(0.7 0.15 150)');
 check('DialKit wide-gamut colors convert for shader',p.editor.layers[1].material.uniforms.uColorA.value.toArray().every(Number.isFinite));
 sessionStorage.setItem('percepta-qa-reload-results',JSON.stringify(results));return results;
};
