// Package source imports only; does not build the app or deploy any function.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const out='/tmp/exec04-package';
for(const path of ['prepared/exec04/edge-entry.ts','prepared/exec04/endpoint.ts','prepared/exec04/queue-guard.ts','src/lib/marketplace/communications.ts','src/lib/remblai/service.ts','src/lib/remblai/conditions.ts']){
 const target=`${out}/${path}`;await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});
 let source=await readFile(path,'utf8');
 // Server endpoint imports pure matching/render functions; never bundles the browser client.
 if(path.endsWith('/communications.ts'))source=source.split('export async function exec04Call')[0];
 source=source.replace(/(from ['"])(\.[^'"]+?)(['"])/g,(_,start,p,end)=>`${start}${p}${/\.tsx?$/.test(p)?'':'.ts'}${end}`);
 await writeFile(target,source);
}
await writeFile(`${out}/deno.json`,JSON.stringify({imports:{zod:'npm:zod@3.25.76'},compilerOptions:{lib:['deno.window','dom','dom.iterable'],strict:true}}));
console.log('Prepared source tree:',out);