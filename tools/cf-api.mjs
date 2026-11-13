// Official REST operations absent from the generated CLI's module-upload commands.
// Uses the same project-local, explicitly authorised OAuth login; never prints credentials.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
export async function cfRequest(path,{method='GET',body}={}){
 const credentials=JSON.parse(await readFile(new URL('.git/cloudflare-auth/cloudflare/config/default.json',root),'utf8'));
 if(typeof credentials.oauth_token!=='string'||Date.parse(credentials.expiration_time)<=Date.now())throw new Error('Run bash tools/cf.sh auth whoami to refresh the project login.');
 if(!path.startsWith('/accounts/')&&path!=='/graphql')throw new Error('Unsupported Cloudflare API path.');
 const form=body instanceof FormData;
 const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{Authorization:'Bearer '+credentials.oauth_token,...(body&&!form?{'Content-Type':'application/json'}:{})},body:body?(form?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(30000)});
 const value=await response.json();
 if(!response.ok||value.success===false)throw new Error(`Cloudflare ${method} ${path}: HTTP ${response.status}, error codes ${(value.errors||[]).map(e=>e.code).join(',')}`);
 return value;
}
export async function uploadWorker(){
 const target=JSON.parse(await readFile(new URL('backend/deploy-target.json',root),'utf8'));
 if(!/^[a-f0-9]{32}$/.test(target.account_id)||target.worker_name!=='fingerfight-api')throw new Error('Unexpected deployment target.');
 const metadata=JSON.parse(await readFile(new URL('backend/deploy.metadata.json',root),'utf8'));
 if(metadata.bindings.find(b=>b.name==='DB')?.id!==target.database_id)throw new Error('Database target mismatch.');
 metadata.keep_bindings=['secret_text'];
 const form=new FormData();form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.append('worker.mjs',new Blob([await readFile(new URL('backend/dist/worker.mjs',root))],{type:'application/javascript+module'}),'worker.mjs');
 const r=await cfRequest(`/accounts/${target.account_id}/workers/scripts/${target.worker_name}`,{method:'PUT',body:form});
 return{id:r.result?.id,handlers:r.result?.handlers,etag:r.result?.etag,created_on:r.result?.created_on,modified_on:r.result?.modified_on};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv[2]!=='upload')throw new Error('Usage: node tools/cf-api.mjs upload');
 console.log(JSON.stringify(await uploadWorker(),null,2));
}
