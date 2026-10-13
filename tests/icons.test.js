import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIcon,validIcon,iconHTML,cropGeometry,MAX_ICON_LENGTH} from '../src/icons.js';
import {newQuiz,newQuestion,publishedQuiz,makeResult,validateCatalog,quizErrors} from '../src/core.js';

test('icon whitelist blocks executable images, external URLs and oversized input',()=>{
  for(const icon of [{type:'image',data:'https://example.com/a.png'},{type:'image',data:'data:image/svg+xml;base64,PHN2Zz4='},{type:'image',data:'data:image/png;base64,AA" onerror="alert(1)'},{type:'symbol',name:'<script>'},{type:'image',data:'data:image/png;base64,'+'A'.repeat(MAX_ICON_LENGTH)}]) {
    assert.equal(validIcon(icon),false);assert.deepEqual(normalizeIcon(icon),{type:'symbol',name:'book'});assert.ok(!iconHTML(icon).includes('<script>'));
  }
  assert.equal(validIcon({type:'image',data:'data:image/webp;base64,UklGRg=='}),true);
});
test('legacy quizzes remain valid and icons survive publication and result snapshots',()=>{
  const q=newQuiz();q.title='Test';q.questions=[newQuestion()];q.questions[0].text='Question';q.questions[0].options.forEach((o,i)=>o.text=String(i));
  delete q.icon;
  const legacy=publishedQuiz(q);delete legacy.icon;
  assert.equal(validateCatalog({schemaVersion:1,tests:[legacy]}).tests.length,1);
  assert.deepEqual(makeResult(q,q.questions,[],0,10).icon,{type:'symbol',name:'book'});
  q.icon={type:'image',data:'data:image/png;base64,aWNvbg==',privateField:'not published'};
  const published=publishedQuiz(q),result=makeResult(q,q.questions,[],0,10);
  assert.deepEqual(published.icon,{type:'image',data:q.icon.data});
  q.icon.data='changed';assert.equal(result.icon.data,published.icon.data);
  assert.ok(quizErrors(q).some(error=>error.includes('иконку')));
});
test('square crop clamps panning at every image edge for landscape, portrait and zoom',()=>{
  for(const [w,h] of [[900,300],[300,900],[256,256]])for(const zoom of [1,2,4])for(const pos of [-1000,0,100,10000]) {
    const crop=cropGeometry(w,h,zoom,pos,pos);
    assert.ok(crop.x-crop.side/2>=0);assert.ok(crop.y-crop.side/2>=0);
    assert.ok(crop.x+crop.side/2<=w);assert.ok(crop.y+crop.side/2<=h);
    assert.equal(crop.side,Math.min(w,h)/zoom);
  }
});
