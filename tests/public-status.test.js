import test from 'node:test';
import assert from 'node:assert/strict';
import {publicStatus,validatePublicStatus} from '../src/public-status.js';
import {loadPublicStatus} from '../src/github.js';
import {newQuiz,publishedQuiz,newQuestion} from '../src/core.js';

test('status manifest has only IDs and statuses, including closed tests',()=>{
 const catalog={tests:[{id:'open',status:'published',questions:['large text']},{id:'closed',status:'closed'}]};
 assert.deepEqual(publicStatus(catalog),{schemaVersion:1,tests:[{id:'open',status:'published'},{id:'closed',status:'closed'}]});
 assert.equal(validatePublicStatus(publicStatus(catalog)).tests.length,2);
 for(const data of [{schemaVersion:2,tests:[]},{schemaVersion:1,tests:[{id:'a',status:'draft'}]},{schemaVersion:1,tests:[{id:'a',status:'closed'},{id:'a',status:'published'}]}])assert.throws(()=>validatePublicStatus(data));
});
test('public access check fetches the small endpoint and surfaces failure instead of allowing access',async()=>{
 const data={schemaVersion:1,tests:[{id:'open',status:'published'}]};
 assert.deepEqual(await loadPublicStatus(async(url,options)=>{assert.ok(String(url).includes('/data/status.json?'));assert.equal(options.cache,'no-store');return new Response(JSON.stringify(data));}),data);
 await assert.rejects(loadPublicStatus(async()=>new Response('{}',{status:503})),/503/);
 await assert.rejects(loadPublicStatus(async()=>{throw new Error('offline');}),/интернет/);
});
test('missing status manifest falls back to the full validated catalog on older deployments',async()=>{
 const quiz=newQuiz(),q=newQuestion();quiz.title='Fallback';q.text='Question';q.options.forEach((o,i)=>o.text=String(i));quiz.questions=[q];
 const catalog={schemaVersion:1,tests:[publishedQuiz(quiz)]};let requests=0;
 const result=await loadPublicStatus(async url=>{requests++;return String(url).includes('/data/status.json')?new Response('',{status:404}):new Response(JSON.stringify(catalog));});
 assert.deepEqual(result,publicStatus(catalog));assert.equal(requests,2);
});
