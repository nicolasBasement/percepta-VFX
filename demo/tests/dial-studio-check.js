export default async () => {
 const p=percepta,s=p.studio,u=p.editor.material.uniforms,{DialStore}=await import('./vendor/dialkit/index.js');
 const results=[],check=(name,pass,detail)=>{results.push({name,pass:!!pass,detail});if(!pass)throw new Error(name);};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 sessionStorage.setItem('percepta-qa-backup',localStorage.getItem('dialkit:percepta-studio-v1')||'');
 const originalAssets=[...s.library.records.keys()];sessionStorage.setItem('percepta-qa-assets',JSON.stringify(originalAssets));
 try{
 s.kit.setValues({particles:{count:10000,pointSize:3.4,appearance:'1',morph:{scatter:35,organicMotion:10}},interaction:{mode:'6',carry:{blend:80,releaseAfter:2.1,growth:120}},layers:{layer1:{name:'QA Surface',color:{source:'1',a:'#ff8800'},shape:{type:'2'}},layer2:{visible:true,shape:{scale:2.5,opacity:32},response:{mouse:false,light:false}}},lighting:{enabled:true,intensity:1.5,position:{x:-3,y:4,z:6}},atmosphere:{depthFog:40,dust:20},finish:{bloom:{strength:.8},exposure:1.3},camera:{framing:{distance:11,azimuth:25,elevation:30}}});
 await wait(200);while(!p.getState().ready)await wait(50);
 check('DialKit changes particle density',p.getState().count===10000);
 check('Global point size and look reach GPU',u.uSize.value===3.4&&u.uStyle.value===1);
 check('Mixed-flow controls reach dynamics',u.uInteraction.value===6&&p.editor.dynamics.carryMix===.8&&p.editor.dynamics.carryDuration===2.1&&u.uCarryScale.value===1.2);
 check('Layer shape and color reach GPU',u.uShape.value===2&&u.uColorA.value.getHexString()==='ff8800');
 check('Second layer preserves independent settings',p.editor.layers[1].points.visible&&p.editor.layers[1].material.uniforms.uOpacity.value===.32&&p.editor.layers[1].material.uniforms.uHoverEnabled.value===0);
 check('Light controls reach shader',u.uLightingEnabled.value===1&&u.uLightPosition.value.x===-3&&u.uLightIntensity.value===1.5);
 check('Atmosphere controls reach volume and fog',Math.abs(u.uFogDensity.value-.048)<1e-8&&p.fx.volumes[0].visible);
 check('Post controls reach composer',p.cinema.bloom.strength===.8&&p.cinema.exposure===1.3);
 check('Framing reaches camera',Math.abs(p.camera.position.distanceTo(p.cinema.controls.target)-11)<.02);
 check('Disabled reveal stays disabled after restore',!p.cinema.reveal.enabled);
 await s.onAction('layers.layer1.sprite.example');await Promise.all([...s.assetTasks.values()]);
 const asset=s.kit.getValues().layers.layer1.sprite.asset;
 check('Sprite atlas uploaded and stored locally',!!asset&&!!p.editor.layers[0].asset&&s.library.records.has(asset));
 check('Atlas settings apply after async texture load',p.editor.layers[0].cols===4&&p.editor.layers[0].rows===2&&p.editor.layers[0].shape===6);
 document.getElementById('preset-name').value='__QA Amber';document.getElementById('save-preset').click();
 const amber=DialStore.getActivePresetId(s.kit.id);
 check('Save preset creates named DialKit version',DialStore.getPresets(s.kit.id).some(v=>v.id===amber&&v.name==='__QA Amber'));
 s.kit.setValues({lighting:{enabled:false},layers:{layer1:{sprite:{asset:''},color:{a:'#00ccff'}},layer2:{visible:false}},finish:{bloom:{strength:0}}});
 document.getElementById('preset-name').value='__QA Cyan';document.getElementById('save-preset').click();
 DialStore.loadPreset(s.kit.id,amber);await Promise.all([...s.assetTasks.values()]);
 check('Switching versions restores all groups',u.uLightingEnabled.value===1&&p.cinema.bloom.strength===.8&&p.editor.layers[1].visible&&u.uColorA.value.getHexString()==='ff8800');
 check('Switching versions restores sprite texture',p.editor.layers[0]._storedAsset===asset&&!!p.editor.layers[0].asset);
 const stored=JSON.parse(localStorage.getItem('dialkit:'+s.kit.id));
 check('Versions persist to browser storage',JSON.stringify(stored).includes('__QA Amber')&&JSON.stringify(stored).includes(asset));
 sessionStorage.setItem('percepta-qa-expected',JSON.stringify({amber,asset}));
 check('Visible interface is English',document.documentElement.lang==='en'&&!/partícula|cámara|Guardar|Reproducir|Secuencia/.test(document.body.innerText));
 return results;
 }finally{sessionStorage.setItem('percepta-qa-results',JSON.stringify(results));}
};
