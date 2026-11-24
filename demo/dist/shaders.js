export const vertexShader = /* glsl */`
attribute vec3 targetPosition;
attribute vec3 sourceColor;
attribute vec3 targetColor;
attribute vec3 sourceNormal;
attribute vec3 targetNormal;
attribute float seed;
attribute vec2 particleUV;
uniform sampler2D uParticleMap;
uniform sampler2D uCarryMap;
uniform float uCarryScale;
uniform float uParticleReady;

uniform float uLightingEnabled;
uniform float uLightType;
uniform vec3 uLightPosition;
uniform vec3 uLightColor;
uniform float uLightIntensity;
uniform float uLightRange;
uniform float uLightAngle;
uniform float uLightSize;
uniform float uLightShadow;
uniform float uLightCutoff;
uniform float uLightAffected;
uniform float uRevealEnabled;
uniform float uRevealProgress;
uniform float uRevealStyle;
varying vec3 vLightColor;


uniform float uInteraction;
uniform vec3 uPointerOrigin;
uniform vec3 uPointerDirection;
uniform float uPointerActive;
uniform float uPointerRadius;
uniform float uPointerStrength;
uniform float uHoverEnabled;
varying float vDepth;
varying float vHeight;

uniform float uProgress;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform float uScatter;
uniform float uMotion;
uniform float uStyle;
uniform float uField;

uniform float uShape;
uniform float uLayerSize;
uniform float uOpacity;
uniform float uRotation;
uniform float uRandomRotation;
uniform float uSoftness;
uniform float uOffset;
uniform float uColorMode;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uPattern;
uniform float uPatternScale;
uniform float uPatternFill;
varying float vSeed;
varying float vPatternMask;


uniform sampler2D uFlowMap;
uniform vec2 uFlowSize;
uniform vec3 uFlowRight;
uniform vec3 uFlowUp;
uniform float uFlowViewHeight;
vec2 readFlow(vec2 uv) {
  vec2 grid = clamp(uv * uFlowSize - .5, vec2(0.), uFlowSize - 1.);
  vec2 base = floor(grid), f = fract(grid);
  vec2 a = (base + .5) / uFlowSize;
  vec2 stepUV = 1. / uFlowSize;
  return mix(mix(texture2D(uFlowMap,a).xy,texture2D(uFlowMap,a+vec2(stepUV.x,0.)).xy,f.x),
             mix(texture2D(uFlowMap,a+vec2(0.,stepUV.y)).xy,texture2D(uFlowMap,a+stepUV).xy,f.x),f.y);
}

varying vec3 vColor;
varying float vAlpha;
void main() {
  float delay = seed * .19;
  float t = smoothstep(delay, .81 + delay, uProgress);
  float envelope = sin(t * 3.14159265);
  vec3 p = mix(position, targetPosition, t);
  vec3 normal = normalize(mix(sourceNormal, targetNormal, t) + .0001);
  float phase = seed * 62.83;
  vec3 flow = vec3(
    sin(p.y * 1.6 + phase + uTime * .22) + cos(p.z * 1.3 + phase),
    cos(p.z * 1.4 + phase + uTime * .19),
    sin(p.x * 1.5 + phase - uTime * .18)
  );
  p += flow * envelope * uScatter * 1.9;
  p += normal * sin(uTime * .85 + position.y * 2.8 + phase) * uMotion * .12;
  if (uField > .5) {
    p = position;
    p.y += sin(p.x * .65 + uTime * .27) * .18 + cos(p.z * .7 - uTime * .23) * .16;
  }

  vSeed = seed;
  vPatternMask = 1.;
  if (uField < .5) {
    p += normal * uOffset;
    float spacing = max(.01, uPatternScale);
    if (uPattern > .5 && uPattern < 1.5) {
      p = floor(p / spacing + .5) * spacing;
    } else if (uPattern > 1.5 && uPattern < 2.5) {
      vPatternMask = step(fract((p.y + 4.) / spacing), uPatternFill);
    } else if (uPattern > 2.5 && uPattern < 3.5) {
      vec3 cell = floor((p + 4.) / spacing);
      float checker = mod(cell.x + cell.y + cell.z, 2.);
      vPatternMask = (1. - checker) * step(seed, min(1., uPatternFill * 2.)) + checker * step(seed, max(0., uPatternFill * 2. - 1.));
    } else if (uPattern > 3.5) {
      vPatternMask = step(fract(length(p.xz) / spacing), uPatternFill);
    }
  }


  if (uField < .5 && uInteraction > .5 && uInteraction < 4.5 && uHoverEnabled > .5) {
    vec3 ray = p - uPointerOrigin;
    float along = dot(ray,uPointerDirection);
    vec3 radial = ray - uPointerDirection * along;
    float distance = length(radial);
    float radius = max(.01,uPointerRadius);
    float falloff = pow(max(0.,1. - distance/radius),2.) * uPointerActive * step(0.,along);
    vec3 direction = normalize(radial + vec3(.0001));
    float strength = uPointerStrength * falloff;
    if (uInteraction < 1.5) p += direction * strength * radius * 1.8;
    else if (uInteraction < 2.5) p -= radial * min(.94,strength*1.8);
    else if (uInteraction < 3.5) {
      float angle = strength * 4.5;
      p += radial * (cos(angle)-1.) + cross(uPointerDirection,radial) * sin(angle);
    } else {
      p += normal * sin(distance/radius*13. - uTime*4.) * strength * .65;
    }
  }


  if (uField < .5 && uInteraction > 4.5 && uHoverEnabled > .5) {
    vec4 viewPosition = modelViewMatrix * vec4(p,1.);
    vec4 clip = projectionMatrix * viewPosition;
    vec2 uv = clip.xy / max(.0001,clip.w) * .5 + .5;
    if (clip.w > 0. && min(uv.x,uv.y) >= 0. && max(uv.x,uv.y) <= 1.) {
      vec2 displacement;
      if(uParticleReady > .5) displacement=texture2D(uParticleMap,particleUV).xy;
      else {
        float angle=(fract(sin(seed*473.17+12.1)*14375.45)-.5)*3.2;
        displacement=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*readFlow(uv)*smoothstep(.16,.82,seed)*.4;
      }
      float viewHeight = -viewPosition.z * uFlowViewHeight;
      p += (uFlowRight*displacement.x + uFlowUp*displacement.y) * viewHeight;
    }
  }


  float illumination=1.,lightVisibility=1.,particleScale=1.;
  vLightColor=vec3(1.);
  if(uLightingEnabled>.5 && uField<.5 && uLightAffected>.5){
    vec3 surfaceP=mix(position,targetPosition,t);
    vec3 toLight=uLightPosition-surfaceP;
    float distanceToLight=length(toLight);
    vec3 L=normalize(toLight+vec3(.00001));
    float attenuation=1.;
    if(uLightType>.5 && uLightType<1.5)L=normalize(uLightPosition+vec3(.00001));
    else attenuation=1./(1.+pow(distanceToLight/max(.1,uLightRange),2.));
    if(uLightType>1.5){
      vec3 spotDirection=normalize(-uLightPosition+vec3(.00001));
      float cone=dot(-L,spotDirection);
      attenuation*=smoothstep(cos(uLightAngle),cos(uLightAngle*.72),cone);
    }
    illumination=max(0.,dot(normal,L))*uLightIntensity*attenuation;
    lightVisibility=mix(uLightShadow,1.,smoothstep(uLightCutoff,uLightCutoff+.18,illumination));
    vLightColor=uLightColor*(uLightShadow+illumination);
    particleScale=mix(1.,mix(.25,2.5,clamp(illumination/2.,0.,1.)),uLightSize);
  }
  if(uInteraction>5.5 && uField<.5 && uHoverEnabled>.5 && uParticleReady>.5){
    vec4 memory=texture2D(uCarryMap,particleUV);
    float carried=smoothstep(0.,.12,memory.y-memory.x)*smoothstep(0.,max(.001,min(.35,memory.y*.45)),memory.x)*memory.w;
    particleScale*=1.+carried*uCarryScale;
  }
  float revealVisibility=1.;
  if(uRevealEnabled>.5 && uRevealStyle<.5 && uField<.5){
    float stagger=seed*.7;
    revealVisibility=smoothstep(stagger,stagger+.3,uRevealProgress);
    particleScale*=mix(.25,1.,revealVisibility);
  }

  float light = .44 + .56 * abs(dot(normal, normalize(vec3(.4, .8, 1.))));
  if(uLightingEnabled>.5 && uField<.5 && uLightAffected>.5)light=1.;
  vec3 col = vec3(.72, .79, .83) * light;
  if (uStyle > .5 && uStyle < 1.5) {
    float band = smoothstep(-1.2, 1.9, p.y + sin(p.x * .8) * .4);
    col = mix(vec3(.16,.67,.86), vec3(.98,.16,.4), band) * (.65 + light * .5);
  }
  if (uStyle > 1.5 && uStyle < 2.5) {
    col = mix(sourceColor, targetColor, t) * (.7 + .3 * light);
  }
  if (uStyle > 2.5) {
    col = mix(vec3(.20,.26,.20), vec3(.35,.25,.59), step(.68,seed));
    col = mix(col,vec3(.16,.43,.15),step(.87,seed));
  }
  if (uField > .5) {
    col = uStyle > 2.5 ? vec3(.40,.46,.39) : (uStyle > .5 && uStyle < 1.5 ? vec3(.12,.32,.43) : vec3(.28,.35,.38));
  }

  if (uField < .5) {
    if (uColorMode > .5 && uColorMode < 1.5) col = uColorA;
    else if (uColorMode > 1.5 && uColorMode < 2.5) col = mix(uColorA, uColorB, smoothstep(-2.6,2.6,p.y));
    else if (uColorMode > 2.5 && uColorMode < 3.5) col = mix(uColorA,uColorB,seed);
    else if (uColorMode > 3.5) col = mix(sourceColor,targetColor,t);
  }

  vColor = col;
  vAlpha = uField > .5 ? .25 : (.66 + seed * .34) * uOpacity * lightVisibility * revealVisibility;
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  vDepth = -mv.z; vHeight = p.y;
  gl_Position = projectionMatrix * mv;
  // Macro shots retain perspective growth down to the near plane.
  float minPointDepth=(uRevealEnabled>.5 && uRevealStyle>.5 && uField<.5) ? .12 : 2.;
  gl_PointSize = clamp((uShape > 5.5 && uField < .5 ? 1.41421356 : 1.) * uSize * uLayerSize * particleScale * uPixelRatio * (10.5 / max(minPointDepth,-mv.z)) * (.72 + seed * .55), 1., 96.);
}
`;
export const fragmentShader = /* glsl */`
varying vec3 vLightColor;
uniform float uFogDensity;
uniform float uFogGround;
uniform float uFogNear;
uniform vec3 uFogColor;
varying float vDepth;
varying float vHeight;

uniform float uShape;
uniform float uRotation;
uniform float uRandomRotation;
uniform float uSoftness;
uniform float uField;
uniform sampler2D uSprite;
uniform float uHasSprite;
uniform vec2 uAtlasGrid;
uniform vec2 uSpritePixels;
uniform float uAtlasMode;
uniform float uAtlasFrame;
uniform float uAtlasFPS;
uniform float uSpriteTint;
uniform float uSpriteAlpha;
uniform float uTime;
varying vec3 vColor;
varying float vAlpha;
varying float vSeed;
varying float vPatternMask;
void main() {
  if (vPatternMask < .5 || vAlpha < .001) discard;
  vec2 q = vec2(gl_PointCoord.x, 1. - gl_PointCoord.y) - .5;
  float angle = uRotation + vSeed * 6.2831853 * uRandomRotation;
  q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * q;
  float shape = uField > .5 ? 0. : uShape;
  float alpha = vAlpha;
  vec3 color = vColor;
  if (shape > 5.5 && uHasSprite > .5) {
    q *= 1.41421356;
    float aspect = (uSpritePixels.x / uAtlasGrid.x) / (uSpritePixels.y / uAtlasGrid.y);
    q.x /= min(1., aspect);
    q.y *= max(1., aspect);
    vec2 local = q + .5;
    if (min(local.x,local.y) < 0. || max(local.x,local.y) > 1.) discard;
    float total = uAtlasGrid.x * uAtlasGrid.y;
    float frame = uAtlasFrame;
    if (uAtlasMode > .5 && uAtlasMode < 1.5) frame = floor(vSeed * total);
    else if (uAtlasMode > 1.5) frame = mod(uAtlasFrame + floor(uTime * uAtlasFPS),total);
    vec2 cell = vec2(mod(frame,uAtlasGrid.x), uAtlasGrid.y - 1. - floor(frame/uAtlasGrid.x));
    // Half-texel inset and no mipmaps prevent adjacent atlas cells from bleeding.
    vec2 inset = .5 * uAtlasGrid / uSpritePixels;
    local = mix(inset,vec2(1.) - inset,local);
    vec2 uv = (cell + local) / uAtlasGrid;
    vec4 sprite = texture2D(uSprite,uv);
    float luma = max(sprite.r,max(sprite.g,sprite.b));
    if (uSpriteAlpha > .5 && uSpriteAlpha < 1.5) sprite.a *= smoothstep(.01,.15,luma);
    else if (uSpriteAlpha > 1.5) sprite.a *= 1. - smoothstep(.8,.99,min(sprite.r,min(sprite.g,sprite.b)));
    color = sprite.rgb * mix(vec3(1.), vColor, uSpriteTint);
    alpha *= sprite.a;
  } else {
    float distance = length(q) - .44;
    if (shape > .5 && shape < 1.5) distance = max(abs(q.x),abs(q.y)) - .36;
    else if (shape > 1.5 && shape < 2.5) distance = (abs(q.x)+abs(q.y)-.46) * .7071;
    else if (shape > 2.5 && shape < 3.5) distance = abs(length(q)-.32)-.085;
    else if (shape > 3.5 && shape < 4.5) {
      float radius = .29 + .14 * cos(5. * atan(q.y,q.x));
      distance = length(q)-radius;
    } else if (shape > 4.5 && shape < 5.5) {
      distance = min(max(abs(q.x)-.11,abs(q.y)-.4),max(abs(q.x)-.4,abs(q.y)-.11));
    }
    float edge = max(fwidth(distance)*.6, .003) + uSoftness*.18;
    alpha *= 1. - smoothstep(-edge,edge,distance);
  }
  if (alpha < .005) discard;

  color *= vLightColor;
  float depth = max(0.,vDepth-uFogNear);
  float ground = exp(-max(vHeight+2.8,0.)*1.3) * uFogGround;
  float fog = clamp(1. - exp(-depth*depth*uFogDensity*uFogDensity - depth*ground*.12),0.,.96);
  color = mix(color,uFogColor,fog);
  alpha *= 1. - fog*.35;

  gl_FragColor = vec4(color,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
