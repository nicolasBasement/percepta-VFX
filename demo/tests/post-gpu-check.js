export default async () => {
 const T=await import('three'),c=percepta.cinema,r=percepta.renderer;
 const old={scene:c.scene,camera:c.camera,rs:c.renderPass.scene,rc:c.renderPass.camera,enabled:c.enabled,strength:c.bloom.strength,threshold:c.bloom.threshold,exposure:c.exposure,vignette:c.grade.uniforms.uVignette.value,grain:c.grade.uniforms.uGrain.value,clear:r.getClearColor(new T.Color()),alpha:r.getClearAlpha()};
 const s=new T.Scene(),cam=new T.OrthographicCamera(-1,1,1,-1,.1,10);cam.position.z=2;
 const g=new T.PlaneGeometry(.04,.04),m=new T.MeshBasicMaterial({color:new T.Color(2,2,2),toneMapped:false});s.add(new T.Mesh(g,m));
 const results=[],check=(name,pass,detail)=>results.push({name,pass,detail});
 const read=()=>{
 c.render(0,0);const gl=r.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,p=new Uint8Array(w*h*4);
 gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);
 let halo=0,total=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=p[(y*w+x)*4];total+=v;if((Math.abs(x-w/2)>w*.015||Math.abs(y-h/2)>h*.015)&&v>4)halo++;}
 return {halo,total,corner:p[0]};
 };
 try{
 Object.assign(c,{scene:s,camera:cam,enabled:true,exposure:1});c.renderPass.scene=s;c.renderPass.camera=cam;
 c.grade.uniforms.uVignette.value=0;c.grade.uniforms.uGrain.value=0;r.setClearColor(0,1);
 c.bloom.strength=0;const baseline=read();
 c.bloom.strength=1;c.bloom.threshold=.5;const bloom=read();
 check('Bloom creates halo outside bright geometry',bloom.halo>baseline.halo+100,{baseline:baseline.halo,bloom:bloom.halo});
 c.bloom.threshold=3;const threshold=read();
 check('Threshold excludes dimmer geometry',threshold.halo<bloom.halo*.1,{threshold:threshold.halo});
 c.bloom.strength=0;c.exposure=.5;const dark=read();c.exposure=2;const bright=read();
 check('Exposure controls final luminance',bright.total>dark.total);
 c.enabled=false;const off=read();check('Post toggle bypasses glow',off.halo===0);
 check('Black background stays black',bloom.corner===0);
 }finally{
 Object.assign(c,{scene:old.scene,camera:old.camera,enabled:old.enabled,exposure:old.exposure});
 c.renderPass.scene=old.rs;c.renderPass.camera=old.rc;c.bloom.strength=old.strength;c.bloom.threshold=old.threshold;
 c.grade.uniforms.uVignette.value=old.vignette;c.grade.uniforms.uGrain.value=old.grain;r.setClearColor(old.clear,old.alpha);g.dispose();m.dispose();c.render();
 }
 window.postTestResults=results;return results;
};
