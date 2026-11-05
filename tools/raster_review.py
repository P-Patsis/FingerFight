"""Small dependency-free raster of our review SVG's M/L/Q paths for inspecting generated art.
Not a browser renderer: omits text and uses flat polygon sampling without antialiasing.
Usage: python3 tools/raster_review.py artifacts/elemental-motion-review.svg
"""
import sys,re,math,struct,zlib,xml.etree.ElementTree as ET
from pathlib import Path
source=Path(sys.argv[1]);root=ET.parse(source).getroot();scale=.65
W,H=[round(float(root.attrib[k])*scale) for k in ['width','height']];pixels=bytearray(W*H*3)
def polygon(pts,color,alpha):
 if len(pts)<3 or alpha<=0:return
 r,g,b=color;alpha=min(1,alpha);iy0=max(0,math.floor(min(p[1] for p in pts)));iy1=min(H,math.ceil(max(p[1] for p in pts)))
 for y in range(iy0,iy1):
  Y=y+.5;cross=[]
  for a,bp in zip(pts,pts[1:]+pts[:1]):
   if (a[1]<=Y<bp[1]) or (bp[1]<=Y<a[1]):cross.append(a[0]+(Y-a[1])*(bp[0]-a[0])/(bp[1]-a[1]))
  cross.sort()
  for i in range(0,len(cross)-1,2):
   lo=max(0,math.ceil(cross[i]-.5));hi=min(W,math.ceil(cross[i+1]-.5))
   if hi<=lo:continue
   pos=(y*W+lo)*3
   if alpha==1:pixels[pos:pos+(hi-lo)*3]=bytes(color)*(hi-lo)
   else:
    for x in range(lo,hi):
     j=(y*W+x)*3
     for k,c in enumerate(color):pixels[j+k]=round(pixels[j+k]*(1-alpha)+c*alpha)
def color(s):
 if not s or s=='none':return None
 if s=='white':return (255,255,255)
 if len(s)==4:s='#'+''.join(c*2 for c in s[1:])
 return tuple(int(s[i:i+2],16) for i in [1,3,5])
def paths(d):
 tokens=re.findall(r'[MLQZmlqz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?',d);out=[];pts=[];i=0;cmd=None
 while i<len(tokens):
  if tokens[i].isalpha():cmd=tokens[i].upper();i+=1
  if cmd=='Z':
   if pts:pts.append(pts[0]);out.append(pts);pts=[]
   cmd=None;continue
  count=4 if cmd=='Q' else 2
  nums=list(map(float,tokens[i:i+count]));i+=count
  if cmd=='M':
   if pts:out.append(pts)
   pts=[tuple(nums)];cmd='L'
  elif cmd=='L':pts.append(tuple(nums))
  elif cmd=='Q':
   a=pts[-1];c=nums[:2];end=nums[2:]
   for k in range(1,13):
    t=k/12;pts.append(tuple((1-t)**2*a[j]+2*(1-t)*t*c[j]+t*t*end[j] for j in range(2)))
 if pts:out.append(pts)
 return out
def walk(node,offset=(0,0)):
 tag=node.tag.split('}')[-1];dx,dy=offset
 if 'translate' in node.attrib.get('transform',''):
  v=re.findall(r'[-\d.]+',node.attrib['transform']);dx+=float(v[0]);dy+=float(v[1]) if len(v)>1 else 0
 A=node.attrib;alpha=float(A.get('opacity','1'))
 if tag in ['path','rect']:
  if tag=='rect':
   x=float(A.get('x','0'));y=float(A.get('y','0'));w=W/scale if A.get('width')=='100%' else float(A['width']);h=H/scale if A.get('height')=='100%' else float(A['height']);ps=[[(x,y),(x+w,y),(x+w,y+h),(x,y+h)]]
  else:ps=paths(A['d'])
  for pts in ps:
   pts=[((x+dx)*scale,(y+dy)*scale) for x,y in pts];fill=color(A.get('fill','#000'));stroke=color(A.get('stroke'));width=float(A.get('stroke-width','1'))*scale
   if fill:polygon(pts,fill,alpha)
   if stroke:
    for a,b in zip(pts,pts[1:]):
     vx=b[0]-a[0];vy=b[1]-a[1];length=math.hypot(vx,vy)
     if length:
      nx=-vy/length*width/2;ny=vx/length*width/2;polygon([(a[0]+nx,a[1]+ny),(b[0]+nx,b[1]+ny),(b[0]-nx,b[1]-ny),(a[0]-nx,a[1]-ny)],stroke,alpha)
 for child in node:walk(child,(dx,dy))
walk(root)
def chunk(tag,data):return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
raw=b''.join(b'\0'+pixels[y*W*3:(y+1)*W*3] for y in range(H))
out=source.with_suffix('.png');out.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',W,H,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''));print(out)
