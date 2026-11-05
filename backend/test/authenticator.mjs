// Software P-256 authenticator for real WebAuthn-verifier tests; no user/device credentials.
import {encodeCBOR} from '../node_modules/@levischuck/tiny-cbor/esm/index.js';
const enc=new TextEncoder(),b64=b=>Buffer.from(b).toString('base64url');
const concat=(...pieces)=>{const a=new Uint8Array(pieces.reduce((n,p)=>n+p.length,0));let i=0;for(const p of pieces){a.set(p,i);i+=p.length;}return a;};
const hash=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',typeof s==='string'?enc.encode(s):s));
function der(signature){const parts=[signature.slice(0,32),signature.slice(32)];const ints=parts.map(a=>{while(a.length>1&&a[0]===0)a=a.slice(1);if(a[0]&128)a=concat(new Uint8Array([0]),a);return concat(new Uint8Array([2,a.length]),a);});const content=concat(...ints);return concat(new Uint8Array([48,content.length]),content);}
export async function authenticator(rp='p-patsis.github.io',origin='https://p-patsis.github.io'){
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',keys.publicKey),credential=crypto.getRandomValues(new Uint8Array(32)),cid=b64(credential),rpHash=await hash(rp);let counter=0;
 const client=(type,challenge)=>enc.encode(JSON.stringify({type,challenge,origin,crossOrigin:false}));
 return {id:cid,async register(challenge){
  const cose=encodeCBOR(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
  const auth=concat(rpHash,new Uint8Array([0x45,0,0,0,0]),new Uint8Array(16),new Uint8Array([0,32]),credential,cose),attestation=encodeCBOR(new Map([['fmt','none'],['attStmt',new Map()],['authData',auth]]));
  return {id:cid,rawId:cid,type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:{clientDataJSON:b64(client('webauthn.create',challenge)),attestationObject:b64(attestation),transports:['internal']}};
 },async login(challenge){counter++;const c=client('webauthn.get',challenge),counterBytes=new Uint8Array(4);new DataView(counterBytes.buffer).setUint32(0,counter);const auth=concat(rpHash,new Uint8Array([5]),counterBytes),signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,concat(auth,await hash(c))));return {id:cid,rawId:cid,type:'public-key',authenticatorAttachment:'platform',clientExtensionResults:{},response:{clientDataJSON:b64(c),authenticatorData:b64(auth),signature:b64(der(signature)),userHandle:null}};
 }};
}
