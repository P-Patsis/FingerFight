import {build} from 'esbuild';
await build({entryPoints:[new URL('./worker.mjs',import.meta.url).pathname],outfile:new URL('./dist/worker.mjs',import.meta.url).pathname,bundle:true,format:'esm',platform:'browser',target:'es2022',external:['node:*'],minify:true,legalComments:'eof'});
console.log('Built backend/dist/worker.mjs');
