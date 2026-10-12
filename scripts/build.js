import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateCatalog } from '../src/core.js';
const root=resolve(import.meta.dirname,'..');
validateCatalog(JSON.parse(await readFile(resolve(root,'data/tests.json'),'utf8')));
await mkdir(resolve(root,'_site'),{recursive:true});
for(const path of ['index.html','.nojekyll','assets','src','data'])await cp(resolve(root,path),resolve(root,'_site',path),{recursive:true});
await writeFile(resolve(root,'_site','404.html'),await readFile(resolve(root,'index.html')));
console.log('Built _site: only application files and the published catalog.');
