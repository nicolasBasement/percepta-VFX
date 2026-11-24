export default async () => {
 const p=percepta,s=p.studio,{DialStore}=await import('./vendor/dialkit/index.js'),results=[];
 const check=(name,pass)=>{results.push({name,pass:!!pass});if(!pass)throw new Error(name);};
 const set=(id,value,event='input')=>{const e=document.getElementById(id);if(e.type==='checkbox')e.checked=value;else e.value=value;e.dispatchEvent(new Event(event,{bubbles:true}));};
 const original=JSON.parse(JSON.stringify(s.kit.getValues(),(k,v)=>v?.type==='action'?undefined:v)),active=s.getState().active;
 let qa;
 try{
 set('size',3.1);check('Visible global slider updates GPU and preset',p.editor.material.uniforms.uSize.value===3.1&&s.kit.getValues().particles.pointSize===3.1);
 set('interaction-mode','6');set('carry-duration',2.4);check('Mouse controls update stored mixed flow',s.kit.getValues().interaction.carry.releaseAfter===2.4&&p.editor.dynamics.carryDuration===2.4&&!document.getElementById('carry-controls').hidden);
 document.querySelectorAll('.layer-select')[1].click();set('layer-size',2.7);document.querySelectorAll('.layer-visible')[1].click();
 check('Selected layer controls and visibility persist',s.kit.getValues().layers.layer2.shape.scale===2.7&&s.kit.getValues().layers.layer2.visible&&p.editor.layers[1].visible);
 set('light-enabled',true,'change');set('bloom-strength',.6);
 check('Light and bloom are included in preset',s.kit.getValues().lighting.enabled&&s.kit.getValues().finish.bloom.strength===.6);
 set('preset-name','__QA flat editor');document.getElementById('save-preset').click();qa=DialStore.getActivePresetId(s.kit.id);
 set('size',1);set('layer-size',.5);set('bloom-strength',0);
 // Save the temporary edits separately, so the saved QA look remains intact.
 const other=DialStore.savePreset(s.kit.id,'__QA flat changed');
 DialStore.loadPreset(s.kit.id,qa);
 check('Loading a preset restores visible form controls',Number(document.getElementById('size').value)===3.1&&Number(document.getElementById('layer-size').value)===2.7&&Number(document.getElementById('bloom-strength').value)===.6);
 check('Preset restore reaches the scene',p.editor.material.uniforms.uSize.value===3.1&&p.cinema.bloom.strength===.6);
 DialStore.deletePreset(s.kit.id,other);
 document.querySelector('[data-editor-section="interaction-section"]').click();
 check('Direct navigation opens mouse settings',document.getElementById('interaction-section').open);
 check('Only one level of settings is visible',document.querySelectorAll('.editor-panel details details').length===0&&!document.getElementById('dialkit-host'));
 check('Visible UI stays English',!/[áéíóúñ]|Restablecer|Capas/.test(document.body.innerText));
 return results;
 }finally{
 if(active)DialStore.loadPreset(s.kit.id,active);
 s.kit.setValues(original);if(qa)DialStore.deletePreset(s.kit.id,qa);
 if(active)DialStore.loadPreset(s.kit.id,active);s.kit.setValues(original);DialStore.keepEdits(s.kit.id);
 p.editor.selected=p.editor.layers[0].id;p.editor.renderLayers();p.editor.syncForm();
 window.flatEditorResults=results;
 }
};
