// Explicit preparation command, never a deployment or an app build.
// bun prepared/exec01b/package.ts => temporary JS bundle + typed Deno source tree.
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
const project=resolve(import.meta.dir,'../..');
const output='/tmp/exec01c-package';
await mkdir(`${output}/prepared/exec01b`,{recursive:true});
await mkdir(`${output}/src/lib/remblai`,{recursive:true});
await mkdir(`${output}/src/integrations/supabase`,{recursive:true});
function imports(text:string){return text.replace(/(from ['"])(\.[^'"]+?)(['"])/g,(_whole,start,path,end)=>`${start}${path}${path.endsWith('.ts')?'':'.ts'}${end}`);}
for(const file of await readdir(`${project}/prepared/exec01b`)){
 if(!file.endsWith('.ts')||file==='package.ts')continue;
 await writeFile(`${output}/prepared/exec01b/${file}`,imports(await readFile(`${project}/prepared/exec01b/${file}`,'utf8')));
}
for(const file of ['conditions','service','cloud-contract']){
 const source=(await readFile(`${project}/src/lib/remblai/${file}.ts`,'utf8')).replace('@/integrations/supabase/types','../../integrations/supabase/types');
 await writeFile(`${output}/src/lib/remblai/${file}.ts`,imports(source));
}
await writeFile(`${output}/src/integrations/supabase/types.ts`,await readFile(`${project}/src/integrations/supabase/types.ts`));
await writeFile(`${output}/deno.json`,JSON.stringify({imports:{zod:'npm:zod@3.25.76'},compilerOptions:{strict:false}}));
await build({entryPoints:[`${project}/prepared/exec01b/edge-entry.ts`],bundle:true,platform:'neutral',format:'esm',external:['npm:*'],outfile:`${output}/edge-entry.js`});
console.log('Préparation seulement : /tmp/exec01c-package. Aucun déploiement.');