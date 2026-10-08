import json,math,os
from PIL import Image,ImageDraw,ImageFont
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
colors=['#101719','#eac370','#4fc0b3','#d378a3','#789fef']
for name in ['drop1','t2','t4','t6','t8']:
 data=json.load(open(f'{root}/evidence/baseline-{name}.json'));s=data['snapshot'];scale=4
 im=Image.new('RGB',(288*scale,464*scale),'#101719');d=ImageDraw.Draw(im)
 def poly(v,c): d.polygon([(round(x*scale),round(y*scale))for x,y in v],fill=c)
 d.rectangle((24*scale,0,28*scale,424*scale),fill='#384945');d.rectangle((260*scale,0,264*scale,424*scale),fill='#384945');d.rectangle((24*scale,420*scale,264*scale,424*scale),fill='#384945')
 for b in s['bodies']:
  poly([(b['x']+.87*math.cos(math.pi/8+i*math.pi/4),b['y']+.87*math.sin(math.pi/8+i*math.pi/4))for i in range(8)],colors[b['color']])
 a=s['active']
 if a:
  for x,y in a['shape']:
   x=a['x']+x*24;y=a['y']+y*24;poly([(x,y),(x+24,y),(x+24,y+24),(x,y+24)],colors[a['color']])
 font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
 d.text((28*scale,432*scale),f"0.4.5 | actual Node game | {data['seconds']:.2f}s | {data['N']} grains",fill='#cbd9d1',font=font)
 im.save(f'{root}/evidence/baseline-{name}.png')
 im.crop((24*scale,320*scale,264*scale,424*scale)).save(f'{root}/evidence/baseline-{name}-detail.png')
