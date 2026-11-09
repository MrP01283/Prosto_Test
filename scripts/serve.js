import { publicStatus } from '../src/public-status.js';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { buildPublicCatalog } from './public-catalog.js';
import { PUBLIC_QUIZ_FILE } from '../src/public-catalog.js';
const root=resolve(import.meta.dirname,'..');
const port=Number(process.env.PORT||8787);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8'};
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const dataFile = url.pathname.startsWith('/data/') ? url.pathname.slice(6) : '';
    if(dataFile==='status.json'||dataFile==='catalog.json'||PUBLIC_QUIZ_FILE.test(dataFile)){
      const catalog=JSON.parse(await readFile(resolve(root,'data/tests.json'),'utf8'));
      const body=dataFile==='status.json'?JSON.stringify(publicStatus(catalog)):buildPublicCatalog(catalog).get(dataFile);
      if(body===undefined){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':types['.json'],'Cache-Control':'no-store'}).end(body);return;
    }
    let file=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    if(url.pathname.split('/').some(part=>part==='.git'||part==='.env'||part==='.local')){res.writeHead(403).end();return;}
    if((await stat(file)).isDirectory())file=resolve(file,'index.html');
    const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Не найдено');}
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}/`));
