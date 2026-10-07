// Original shaders for the fixed-grid larger surface. No external shader assets.
export const SITE_VERTEX=`#version 300 es
precision highp float;
precision highp int;
layout(location=0) in uvec4 aSeed;
uniform ivec2 uSize;
uniform highp usampler2D uMaterial;
flat out uvec4 vSeed;
void main(){
 uvec4 lo=texelFetch(uMaterial,ivec2(int(aSeed.z),0),0),hi=texelFetch(uMaterial,ivec2(int(aSeed.z),1),0);
 vec2 low=vec2(lo.zw)-4.0,high=vec2(hi.xy)-4.0;
 const vec2 corners[6]=vec2[6](vec2(0,0),vec2(1,0),vec2(0,1),vec2(0,1),vec2(1,0),vec2(1,1));
 vec2 world=vec2(aSeed.xy)+mix(low,high,corners[gl_VertexID]);
 gl_Position=vec4(world.x/float(uSize.x)*2.0-1.0,1.0-world.y/float(uSize.y)*2.0,0,1);vSeed=aSeed;
}`;
export const SITE_FRAGMENT=`#version 300 es
precision highp float;
precision highp int;
uniform ivec2 uSize;
uniform highp usampler2D uGrid;
uniform highp sampler2D uDistance;
uniform highp usampler2D uWinner;
uniform bool uSecond;
flat in uvec4 vSeed;
layout(location=0) out highp uint outOwner;
void main(){
 ivec2 pixel=ivec2(gl_FragCoord.xy),top=ivec2(pixel.x,uSize.y*2-1-pixel.y),cell=top/2;
 if(texelFetch(uGrid,cell,0).r!=vSeed.w)discard;
 uint id=vSeed.y*uint(uSize.x)+vSeed.x+1u;
 if(uSecond&&texelFetch(uWinner,pixel,0).r==id)discard;
 ivec2 delta=cell-ivec2(vSeed.xy)+4;int index=delta.y*9+delta.x,q=(top.y&1)*2+(top.x&1);
 float d=texelFetch(uDistance,ivec2(index,int(vSeed.z)),0)[q];if(d>=16.0)discard;
 gl_FragDepth=d/16.0;outOwner=id;
}`;
export const QUAD_VERTEX=`#version 300 es
precision highp float;
void main(){const vec2 p[3]=vec2[3](vec2(-1,-1),vec2(3,-1),vec2(-1,3));gl_Position=vec4(p[gl_VertexID],0,1);}`;
export const SHADE_FRAGMENT=`#version 300 es
precision highp float;
precision highp int;
uniform ivec2 uSize;
uniform highp usampler2D uGrid;
uniform highp usampler2D uWinner;
uniform highp usampler2D uRunner;
uniform highp usampler2D uMaterial;
uniform highp usampler2D uPalette;
uniform highp sampler2D uDistance;
uniform highp sampler2D uFace;
uniform bool uContrast;
uniform bool uClear;
out vec4 outColor;
const vec3 bg=vec3(12,17,19);
uint colorAt(ivec2 p){if(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,uSize)))return 0u;return texelFetch(uGrid,p,0).r;}
int tone(uint m){return int(texelFetch(uMaterial,ivec2(int(m),0),0).g);}
int kernel(uint id,ivec2 cell,out uint material){ivec2 at=ivec2(int((id-1u)%uint(uSize.x)),int((id-1u)/uint(uSize.x)));material=texelFetch(uGrid,at,0).g;ivec2 d=cell-at+4;return d.y*9+d.x;}
vec3 matte(uint c,int t){
 const vec3 colors[12]=vec3[12](vec3(213,172,94),vec3(228,185,104),vec3(236,199,118),vec3(244,208,127),vec3(64,170,158),vec3(74,185,172),vec3(84,195,183),vec3(91,205,191),vec3(188,100,142),vec3(202,112,155),vec3(214,124,168),vec3(222,134,177));
 return colors[(int(c)-1)*4+t];
}
void main(){
 ivec2 pixel=ivec2(gl_FragCoord.xy),top=ivec2(pixel.x,uSize.y*2-1-pixel.y),cell=top/2;uvec4 here=texelFetch(uGrid,cell,0);uint c=here.r;int q=(top.y&1)*2+(top.x&1);
 if(c==0u){outColor=vec4(bg/255.0,1);return;}
 bool up=colorAt(cell+ivec2(0,-1))==0u,down=colorAt(cell+ivec2(0,1))==0u,left=colorAt(cell+ivec2(-1,0))==0u,right=colorAt(cell+ivec2(1,0))==0u;
 int exposed=(up?1:0)+(left?2:0)+(right?4:0)+(down?8:0);
 ivec2 corner=ivec2((q&1)==0?-1:1,q<2?-1:1);
 bool clipped=(q<2?up:down)&&((q&1)==0?left:right)&&colorAt(cell+corner)!=c;
 bool pattern=c==1u?(cell.x+cell.y)%6>=2:c==2u?(cell.x%4<2&&cell.y%4<2):cell.y%4!=0;
 bool clearing=uClear&&here.b!=0u;uint owner=texelFetch(uWinner,pixel,0).r;
 if(owner==0u){int flags=(uContrast&&pattern?1:0)+(clearing?2:0),index=(((int(c)*4+tone(here.g))*16+exposed)*4+flags)*8+q+(clipped?4:0);outColor=vec4(texelFetch(uPalette,ivec2(index%1024,index/1024),0))/255.0;return;}
 uint m;int k=kernel(owner,cell,m);float best=texelFetch(uDistance,ivec2(k,int(m)),0)[q],face=texelFetch(uFace,ivec2(k,int(m)),0)[q],runner=16.0;uint second=texelFetch(uRunner,pixel,0).r;
 if(second!=0u){uint sm;int sk=kernel(second,cell,sm);runner=texelFetch(uDistance,ivec2(sk,int(sm)),0)[q];}
 float edge=runner-best,shade=face;if(edge<1.1&&face<-.8)shade-=7.0*(1.0-edge/1.1);int t=tone(m);vec3 base=matte(c,t);
 if(uContrast){base=c==1u?vec3(255,218,120):c==2u?vec3(69,146,212):vec3(241,114,182);float pat=c==1u?(pattern?3.0:-57.0):c==2u?(pattern?72.0:-9.0):(pattern?7.0:-69.0);const float tones[4]=float[4](-10.0,-4.0,1.0,7.0);shade+=pat*.6+tones[t];}
 if(clearing)shade+=24.0;vec3 rgb=roundEven(clamp(base+shade,vec3(0),vec3(255)));if(clipped)rgb=roundEven(rgb*.67+bg*.33);outColor=vec4(rgb/255.0,1);
}`;
