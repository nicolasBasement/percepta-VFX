// Per-particle contact memory: lifetime, total lifetime, cooldown, weight.
export const carryFragment=/* glsl */`
precision highp float;
uniform sampler2D uMemory,uSource,uTarget;
uniform mat4 uViewProjection;
uniform vec2 uCursor,uPreviousCursor;
uniform float uProgress,uAspect,uDt,uCarryEnabled,uCursorActive,uCursorMoving,uCarryRadius,uCarryDuration;
varying vec2 vUV;
float random(float s){return fract(sin(s)*43758.5453);}
void main(){
  vec4 source=texture2D(uSource,vUV),target=texture2D(uTarget,vUV);
  if(source.w<0.||uCarryEnabled<.5||uCursorActive<.5){gl_FragColor=vec4(0.);return;}
  vec4 memory=texture2D(uMemory,vUV);
  memory.x=max(0.,memory.x-uDt);memory.z=max(0.,memory.z-uDt);
  float seed=source.w,delay=seed*.19,t=smoothstep(delay,.81+delay,uProgress);
  vec4 clip=uViewProjection*vec4(mix(source.xyz,target.xyz,t),1.);
  vec2 uv=clip.xy/max(.0001,clip.w)*.5+.5;
  vec2 axis=(uCursor-uPreviousCursor)*vec2(uAspect,1.);
  vec2 relative=(uv-uPreviousCursor)*vec2(uAspect,1.);
  float along=clamp(dot(relative,axis)/max(.0000001,dot(axis,axis)),0.,1.);
  float distanceToStroke=length(relative-axis*along);
  float radius=max(.008,uCarryRadius);
  float weight=exp(-.5*pow(distanceToStroke/radius,2.));
  // Soft stochastic selection avoids a visible circular border or a solid sheet.
  if(memory.x<=0.&&memory.z<=0.&&uCursorMoving>.5&&clip.w>0.&&
     min(uv.x,uv.y)>=0.&&max(uv.x,uv.y)<=1.&&random(seed*531.7+4.2)<weight*.58){
    float life=uCarryDuration*(.55+.45*random(seed*117.3+9.1));
    memory=vec4(life,life,life+.65+random(seed*81.4),weight);
  }
  gl_FragColor=memory;
}
`;
export const carryEnvelope=`
float carryEnvelope(vec4 memory){
  return smoothstep(0.,.12,memory.y-memory.x)*smoothstep(0.,max(.001,min(.35,memory.y*.45)),memory.x)*memory.w;
}
`;
