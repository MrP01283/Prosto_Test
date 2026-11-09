import { publicStatus } from '../src/public-status.js';
import { mkdir, cp, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateCatalog } from '../src/core.js';
import { buildPublicCatalog } from './public-catalog.js';
import { PUBLIC_QUIZ_FILE } from '../src/public-catalog.js';
const root=resolve(import.meta.dirname,'..');
const catalog=validateCatalog(JSON.parse(await readFile(resolve(root,'data/tests.json'),'utf8')));
await mkdir(resolve(root,'_site'),{recursive:true});
for(const path of ['index.html','.nojekyll','assets','src','data'])await cp(resolve(root,path),resolve(root,'_site',path),{recursive:true});
await writeFile(resolve(root,'_site','404.html'),await readFile(resolve(root,'index.html')));
await writeFile(resolve(root,'_site','data','status.json'),JSON.stringify(publicStatus(catalog)));
const dataDir = resolve(root, '_site', 'data');
const files = buildPublicCatalog(catalog);
for (const entry of await readdir(dataDir, {withFileTypes:true})) {
  if (entry.isFile() && PUBLIC_QUIZ_FILE.test(entry.name) && !files.has(entry.name)) {
    await unlink(resolve(dataDir, entry.name));
  }
}
for (const [name, body] of files) await writeFile(resolve(dataDir, name), body);
console.log('Built _site: application, catalog index and individual quizzes.');
