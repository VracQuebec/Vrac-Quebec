// Preparation only, never deployment or a Vite build.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const root='/tmp/exec03-package';
for(const file of ['prepared/exec03/edge-entry.ts','prepared/exec03/maps-provider.ts','prepared/exec03/search-endpoint.ts','src/lib/entrepreneur/search-sector.ts','src/lib/entrepreneur/transport-savings.ts','src/lib/parcours/geo-referentiel.ts']){
 await mkdir(`${root}/${file.slice(0,file.lastIndexOf('/'))}`,{recursive:true});
 const source=(await readFile(file,'utf8')).replace(/(from ['"])(\.[^'"]+)(['"])/g,(_,a,p,b)=>`${a}${p.endsWith('.ts')?p:p+'.ts'}${b}`);
 await writeFile(`${root}/${file}`,source);
}
console.log('Prepared sources: /tmp/exec03-package; no deployment.');