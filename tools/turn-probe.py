"""Authenticated, bidirectional TURN relay probe. Temporary credentials arrive on stdin.
Uses only Python stdlib. RFC 8489/8656; closes allocations even on failure.
This is a TURN protocol check, not a browser/WebRTC/camera test.
"""
import sys,json,socket,ssl,struct,secrets,hmac,hashlib,time
COOKIE=0x2112A442

def attr(kind,data):return struct.pack('!HH',kind,len(data))+data+b'\0'*((-len(data))%4)
def attrs(packet):
 out={};pos=20
 while pos+4<=len(packet):
  kind,n=struct.unpack('!HH',packet[pos:pos+4]);out[kind]=packet[pos+4:pos+4+n];pos+=4+((n+3)//4)*4
 return out

def peer(address):
 ip,port=address;raw=bytes(a^b for a,b in zip(socket.inet_aton(ip),struct.pack('!I',COOKIE)))
 return b'\0\x01'+struct.pack('!H',port^(COOKIE>>16))+raw

def unpeer(value):
 if len(value)<8 or value[1]!=1:raise RuntimeError('Expected an IPv4 relay allocation')
 port=struct.unpack('!H',value[2:4])[0]^(COOKIE>>16)
 return socket.inet_ntoa(bytes(a^b for a,b in zip(value[4:8],struct.pack('!I',COOKIE)))),port

class Relay:
 def __init__(self,mode,user,password):
  self.user=user.encode();self.password=password;self.realm=None;self.nonce=None;self.allocated=False
  self.sock=socket.socket(socket.AF_INET,socket.SOCK_DGRAM if mode=='udp' else socket.SOCK_STREAM);self.sock.settimeout(7);self.sock.connect(('turn.cloudflare.com',3478 if mode=='udp' else 443));self.udp=mode=='udp'
  if not self.udp:self.sock=ssl.create_default_context().wrap_socket(self.sock,server_hostname='turn.cloudflare.com')
 def packet(self,kind,body,authenticated):
  tid=secrets.token_bytes(12)
  if authenticated:
   body+=attr(6,self.user)+attr(0x14,self.realm)+attr(0x15,self.nonce)
   head=struct.pack('!HHI',kind,len(body)+24,COOKIE)+tid
   key=hashlib.md5(self.user+b':'+self.realm+b':'+self.password.encode()).digest()
   return head+body+attr(8,hmac.new(key,head+body,hashlib.sha1).digest()),tid
  return struct.pack('!HHI',kind,len(body),COOKIE)+tid+body,tid
 def recv(self):
  if self.udp:return self.sock.recv(65535)
  def exact(n):
   data=b''
   while len(data)<n:
    part=self.sock.recv(n-len(data))
    if not part:raise RuntimeError('TURN connection closed')
    data+=part
   return data
  head=exact(20);return head+exact(struct.unpack('!H',head[2:4])[0])
 def send(self,data):
  if self.udp:self.sock.send(data)
  else:self.sock.sendall(data)
 def request(self,kind,body=b'',authenticated=True):
  packet,tid=self.packet(kind,body,authenticated);self.send(packet)
  response=self.recv()
  if response[8:20]!=tid:raise RuntimeError('Unexpected TURN transaction')
  values=attrs(response)
  if 9 in values:
   v=values[9];code=(v[2]&7)*100+v[3]
   if code==401 and not authenticated:return response,values
   raise RuntimeError('TURN returned error '+str(code))
  return response,values
 def allocate(self):
  transport=attr(0x19,b'\x11\0\0\0');_,challenge=self.request(3,transport,False)
  self.realm=challenge.get(0x14);self.nonce=challenge.get(0x15)
  if not self.realm or not self.nonce:raise RuntimeError('Missing TURN authentication challenge')
  packet,values=self.request(3,transport)
  if struct.unpack('!H',packet[:2])[0]!=0x103:raise RuntimeError('No allocation success response')
  self.allocated=True;self.address=unpeer(values[0x16])
 def permit(self,other):self.request(8,attr(0x12,peer(other.address)))
 def relay_to(self,other,payload):
  packet,_=self.packet(0x16,attr(0x12,peer(other.address))+attr(0x13,payload),False);self.send(packet)
  received=other.recv()
  if struct.unpack('!H',received[:2])[0]!=0x17 or attrs(received).get(0x13)!=payload:raise RuntimeError('Relayed payload mismatch')
 def close(self):
  try:
   if self.allocated:self.request(4,attr(0x0d,struct.pack('!I',0)))
  except Exception:pass
  self.sock.close()

def probe(mode,credential):
 clients=[];started=time.monotonic()
 try:
  for _ in range(2):
   client=Relay(mode,credential['username'],credential['credential']);clients.append(client);client.allocate()
  a,b=clients;a.permit(b);b.permit(a);a.relay_to(b,b'fingerfight-relay-check');b.relay_to(a,b'fingerfight-relay-response')
  return {'transport':mode,'authenticatedAllocations':2,'bidirectionalPayload':True,'elapsedMs':round((time.monotonic()-started)*1000)}
 finally:
  for client in clients:client.close()

def lifetime_probe(credential,duration):
 clients=[];started=time.monotonic();last_refresh=started;last_ok=0
 try:
  for _ in range(2):
   client=Relay('udp',credential['username'],credential['credential']);clients.append(client);client.allocate()
  a,b=clients;a.permit(b);b.permit(a)
  while time.monotonic()-started<duration:
   try:
    if time.monotonic()-last_refresh>=60:
     for client in clients:client.request(4,attr(0x0d,struct.pack('!I',600)))
     a.permit(b);b.permit(a);last_refresh=time.monotonic()
    a.relay_to(b,b'fingerfight-expiry-check');b.relay_to(a,b'fingerfight-expiry-response');last_ok=round(time.monotonic()-started)
   except Exception as error:
    return {'lastPayloadSeconds':last_ok,'stoppedAtSeconds':round(time.monotonic()-started),'reason':str(error)}
   time.sleep(5)
  return {'lastPayloadSeconds':last_ok,'stillRelayingAtEnd':True}
 finally:
  for client in clients:client.close()

if __name__=='__main__':
 credential=json.load(sys.stdin)
 if '--lifetime' in sys.argv:
  print(json.dumps(lifetime_probe(credential,int(sys.argv[sys.argv.index('--lifetime')+1]))));sys.exit(0)
 if '--expect-revoked' in sys.argv or '--expect-rejected' in sys.argv:
  client=None;result={'revokedCredentialRejected':False}
  try:
   client=Relay('udp',credential['username'],credential['credential']);client.allocate();result['reason']='credential still accepted'
  except RuntimeError as error:
   result['reason']=str(error);result['revokedCredentialRejected']=str(error) in (['TURN returned error 401','TURN returned error 403','TURN returned error 441']+(['TURN returned error 400'] if '--expect-rejected' in sys.argv else []))
  except Exception as error:result['error']=str(error)
  finally:
   if client:client.close()
  print(json.dumps(result));sys.exit(0 if result['revokedCredentialRejected']else 1)
 results=[]
 for mode in ['udp','tls']:
  try:results.append(probe(mode,credential))
  except Exception as error:results.append({'transport':mode,'error':str(error)})
 print(json.dumps(results))
 sys.exit(0 if all(r.get('bidirectionalPayload')for r in results)else 1)
