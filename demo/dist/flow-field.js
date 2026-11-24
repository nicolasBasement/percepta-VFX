// Screen-space velocity field with advection and non-oscillating decay.
// Units: viewport heights. No particle count dependency, no radial position lock.
export class FlowField {
  constructor(size=96){
    this.size=size;this.data=new Float32Array(size*size*4);this.next=new Float32Array(this.data.length);
    this.strokes=[];this.previous=null;this.accumulator=0;this.awake=false;this.revision=0;
    this.aspect=1;this.width=.065;this.strength=.45;this.inertia=.5;this.recovery=.6;this.swirl=.55;
    this.maxDisplacement=0;this.maxVelocity=0;
  }
  move(x,y){
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    const previous=this.previous;this.previous={x,y};
    if(!previous)return;
    const dx=(x-previous.x)*this.aspect,dy=y-previous.y;
    if(Math.hypot(dx,dy)<.00001)return;
    this.strokes.push({x0:previous.x,y0:previous.y,x1:x,y1:y});
    // Bound event backlog while retaining the actual recent trajectory.
    if(this.strokes.length>64)this.strokes.shift();
  }
  endStroke(){this.previous=null;}
  clear(){
    this.data.fill(0);this.next.fill(0);this.strokes.length=0;this.previous=null;this.accumulator=0;
    this.awake=false;this.maxDisplacement=0;this.maxVelocity=0;this.revision++;
  }
  inject(stroke){
    const n=this.size,a=this.aspect,d=this.data;
    const dx=(stroke.x1-stroke.x0)*a,dy=stroke.y1-stroke.y0;
    const length=Math.hypot(dx,dy);if(length<1e-7||this.strength<=0)return;
    const width=Math.max(.012,this.width),steps=Math.min(24,Math.max(1,Math.ceil(length/(width*.45))));
    const gain=this.strength*20,impulseX=dx/steps*gain,impulseY=dy/steps*gain;
    const axisX=dx/length,axisY=dy/length;
    for(let s=0;s<steps;s++){
      const t=(s+.5)/steps,cx=stroke.x0+(stroke.x1-stroke.x0)*t,cy=stroke.y0+(stroke.y1-stroke.y0)*t;
      const x0=Math.max(1,Math.floor((cx-4*width/a)*n)),x1=Math.min(n-2,Math.ceil((cx+4*width/a)*n));
      const y0=Math.max(1,Math.floor((cy-4*width)*n)),y1=Math.min(n-2,Math.ceil((cy+4*width)*n));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const rx=((x+.5)/n-cx)*a,ry=(y+.5)/n-cy;
        const weight=Math.exp(-.5*(rx*rx+ry*ry)/(width*width));
        const bend=this.swirl*Math.sin((rx*axisX+ry*axisY)/width*2.5)*.65;
        const i=(y*n+x)*4;
        d[i+2]+=(impulseX-impulseY*bend)*weight;
        d[i+3]+=(impulseY+impulseX*bend)*weight;
        const speed=Math.hypot(d[i+2],d[i+3]);if(speed>2.5){d[i+2]*=2.5/speed;d[i+3]*=2.5/speed;}
      }
    }
    this.awake=true;
  }
  step(dt){
    const n=this.size,d=this.data,next=this.next,aspect=this.aspect;
    const returning=Math.exp(-(4+this.recovery*6)*dt),drag=Math.exp(-(9-this.inertia*5)*dt),mix=Math.min(.15,dt*5);
    let maxD=0,maxV=0;
    for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
      const i=(y*n+x)*4;
      // Semi-Lagrangian transport carries the impulse along its own flow.
      const bx=Math.max(0,Math.min(n-1.001,x-d[i+2]*dt*n/aspect*.65));
      const by=Math.max(0,Math.min(n-1.001,y-d[i+3]*dt*n*.65));
      const ix=Math.floor(bx),iy=Math.floor(by),fx=bx-ix,fy=by-iy;
      const j=(iy*n+ix)*4,k=j+n*4;
      let vx=(d[j+2]*(1-fx)+d[j+6]*fx)*(1-fy)+(d[k+2]*(1-fx)+d[k+6]*fx)*fy;
      let vy=(d[j+3]*(1-fx)+d[j+7]*fx)*(1-fy)+(d[k+3]*(1-fx)+d[k+7]*fx)*fy;
      const left=i-4,right=i+4,down=i-n*4,up=i+n*4;
      vx=vx*(1-mix)+(d[left+2]+d[right+2]+d[down+2]+d[up+2])*.25*mix;
      vy=vy*(1-mix)+(d[left+3]+d[right+3]+d[down+3]+d[up+3])*.25*mix;
      vx*=drag;vy*=drag;
      let px=(d[i]+vx*dt)*returning,py=(d[i+1]+vy*dt)*returning;
      const length=Math.hypot(px,py);
      if(length>.22){const scale=.22/length;px*=scale;py*=scale;vx*=.92;vy*=.92;}
      next[i]=px;next[i+1]=py;next[i+2]=vx;next[i+3]=vy;
      maxD=Math.max(maxD,Math.abs(px),Math.abs(py));maxV=Math.max(maxV,Math.abs(vx),Math.abs(vy));
    }
    this.data=next;this.next=d;this.maxDisplacement=maxD;this.maxVelocity=maxV;this.revision++;
    if(maxD<.000008&&maxV<.00006){this.data.fill(0);this.next.fill(0);this.awake=false;this.maxDisplacement=0;this.maxVelocity=0;}
  }
  update(dt){
    const before=this.revision;
    for(const stroke of this.strokes)this.inject(stroke);this.strokes.length=0;
    if(!this.awake){this.accumulator=0;return false;}
    this.accumulator+=Math.min(Math.max(dt,0),.05);
    const fixed=1/120;
    while(this.accumulator+1e-9>=fixed){this.step(fixed);this.accumulator-=fixed;if(!this.awake){this.accumulator=0;break;}}
    return this.revision!==before;
  }
  getState(){return {awake:this.awake,maxDisplacement:this.maxDisplacement,maxVelocity:this.maxVelocity,pendingStrokes:this.strokes.length};}
}
