import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHub} from '../src/github.js';
import {newQuiz,newQuestion,publishedQuiz} from '../src/core.js';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('default fetch keeps the browser global receiver',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=function(url){assert.equal(this,globalThis);assert.equal(url,'https://api.github.com/user');return Promise.resolve(response({login:'MrP01283'}));};
 try {const gh=new GitHub();assert.deepEqual(await gh.request('/user'),{login:'MrP01283'});} finally {globalThis.fetch=original;}
});
test('owner validation rejects other accounts and forgets token',async()=>{
 const gh=new GitHub(async()=>response({login:'somebody-else'}));await assert.rejects(gh.connect('test-token'),/владельцу/);assert.equal(gh.connected,false);
});
test('UTF-8 publication uses latest file SHA, explicit branch, and minimal public schema',async()=>{
 const draft=newQuiz();draft.title='Тест с кириллицей';const q=newQuestion();q.text='Что такое 1С?';q.options.forEach((o,i)=>o.text='Ответ '+i);draft.questions=[q];
 const pub=publishedQuiz(draft);let put;
 const gh=new GitHub(async(url,options)=>{
   if(url.endsWith('/user'))return response({login:'MrP01283'});
   if(options.method==='PUT'){put=JSON.parse(options.body);return response({commit:{html_url:'https://github.com/test/commit/1'}});}
   if(url.includes('/contents/'))return response({sha:'latest-file-sha',encoding:'base64',content:btoa(JSON.stringify({schemaVersion:1,tests:[]}))});
   return response({permissions:{push:true}});
 });
 await gh.connect('test-token');const out=await gh.mutate('publish',pub,null);assert.equal(put.sha,'latest-file-sha');assert.equal(put.branch,'main');
 const decoded=JSON.parse(Buffer.from(put.content,'base64').toString('utf8'));assert.equal(decoded.tests[0].title,draft.title);assert.equal(decoded.tests[0].baseRevision,undefined);assert.equal(out.catalog.tests.length,1);gh.disconnect();assert.equal(gh.connected,false);
});
test('GitHub conflict is shown instead of silently retrying a stale write',async()=>{
 const gh=new GitHub(async()=>response({message:'conflict'},409));await assert.rejects(gh.request('/test'),/изменился/);
});
test('catalog above inline content limit is loaded through its exact blob SHA',async()=>{
 const gh=new GitHub(async(url)=>url.includes('/git/blobs/')?response({encoding:'base64',content:btoa(JSON.stringify({schemaVersion:1,tests:[]}))}):response({sha:'blob-sha',encoding:'none',content:''}));
 assert.deepEqual((await gh.readCatalog()).catalog.tests,[]);
});
