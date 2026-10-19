// Explicit preparation command, never a deployment or an app build.
// bun prepared/exec01b/package.ts => temporary JS bundle + typed Deno source tree.
import { mkdir, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { resolve,relative as relativePath,dirname } from 'node:path';
import { build } from 'esbuild';
const project=resolve(import.meta.dir,'../..');
const output='/tmp/exec01c-package';
await mkdir(`${output}/prepared/exec01b`,{recursive:true});
await mkdir(`${output}/src/lib/remblai`,{recursive:true});
await mkdir(`${output}/src/integrations/supabase`,{recursive:true});
function imports(text:string){return text.replace(/(from ['"])(\.[^'"]+?)(['"])/g,(_whole,start,path,end)=>`${start}${path}${/\.tsx?$/.test(path)?'':'.ts'}${end}`);}
for(const file of await readdir(`${project}/prepared/exec01b`)){
 if((!file.endsWith('.ts')&&!file.endsWith('.tsx'))||file==='package.ts')continue;
 await writeFile(`${output}/prepared/exec01b/${file}`,imports(await readFile(`${project}/prepared/exec01b/${file}`,'utf8')));
}
for(const file of ['conditions','service','cloud-contract','coordination']){
 const source=(await readFile(`${project}/src/lib/remblai/${file}.ts`,'utf8')).replace('@/integrations/supabase/types','../../integrations/supabase/types');
 await writeFile(`${output}/src/lib/remblai/${file}.ts`,imports(source));
}
await writeFile(`${output}/src/integrations/supabase/types.ts`,await readFile(`${project}/src/integrations/supabase/types.ts`));
for(const directory of ['matching','offers']){await mkdir(`${output}/src/lib/${directory}`,{recursive:true});for(const file of await readdir(`${project}/src/lib/${directory}`)){if(!file.endsWith('.ts'))continue;const source=(await readFile(`${project}/src/lib/${directory}/${file}`,'utf8')).replaceAll('@/lib/','../').replaceAll('@/integrations/','../../integrations/');await writeFile(`${output}/src/lib/${directory}/${file}`,imports(source));}}
const coordinationSource=(await readFile(`${output}/src/lib/remblai/coordination.ts`,'utf8')).replaceAll('@/lib/','../');await writeFile(`${output}/src/lib/remblai/coordination.ts`,imports(coordinationSource));
// Include the transitive pure matching graph, including type-only dependencies.
const visited=new Set<string>();
async function stage(path:string){
 if(visited.has(path))return;visited.add(path);
 const source=await readFile(`${project}/${path}`,'utf8');
 const dependencies=[...source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)].map(m=>m[1]);
 let normalized=source;
 for(const dependency of dependencies){
  if(!dependency.startsWith('.')&&!dependency.startsWith('@/'))continue;
  const absolute=dependency.startsWith('@/')?resolve(project,'src',dependency.slice(2)):resolve(project,path,'..',dependency);
  let target=/\.tsx?$/.test(absolute)?absolute:`${absolute}.ts`;
  try{await access(target);}catch{target=resolve(absolute,'index.ts');await access(target);}
  const relative=target.slice(project.length+1);
  if(!relative.startsWith('src/')&&!relative.startsWith('prepared/')&&!relative.startsWith('supabase/functions/_shared/'))throw Error('Dependency outside prepared source graph');
  await stage(relative);
  const resolvedImport=relativePath(dirname(path),relative);const importPath=resolvedImport.startsWith('.')?resolvedImport:`./${resolvedImport}`;
  normalized=normalized.replaceAll(`'${dependency}'`,`'${importPath}'`).replaceAll(`"${dependency}"`,`"${importPath}"`);
 }
 await mkdir(resolve(output,path,'..'),{recursive:true});await writeFile(resolve(output,path),imports(normalized));
}
await stage('prepared/exec01b/edge-entry.ts');
await stage('prepared/exec04/queue-guard.ts');
// Preserve the sender's existing relative imports in staging, without touching active sources.
for(const file of ['send-transactional-email.ts','process-email-queue.ts']){
 const source=await readFile(`${project}/prepared/exec01b/${file}`,'utf8');
 const adjusted=source.replaceAll("'../_shared/","'../../supabase/functions/_shared/");
 await writeFile(`${output}/prepared/exec01b/${file}`,adjusted);
 for(const match of [...source.matchAll(/from ['"]\.\.\/_shared\/([^'"]+)['"]/g)])await stage(`supabase/functions/_shared/${match[1]}`);
}
await writeFile(`${output}/deno.json`,JSON.stringify({imports:{zod:'npm:zod@3.25.76'},compilerOptions:{strict:false}}));
await build({entryPoints:[`${project}/prepared/exec01b/edge-entry.ts`],bundle:true,platform:'neutral',format:'esm',external:['npm:*'],outfile:`${output}/edge-entry.js`});
console.log('Préparation seulement : /tmp/exec01c-package. Aucun déploiement.');