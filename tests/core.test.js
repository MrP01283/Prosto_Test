import test from 'node:test';
import assert from 'node:assert/strict';
import {newQuiz,newQuestion,parseQuestionBlock,quizErrors,prepareQuestions,makeResult,mergeQuestions,publishedQuiz,applyCatalogChange,validateCatalog,escapeHTML,clone} from '../src/core.js';
function question(text='Текст') {const q=newQuestion();q.text=text;q.options.forEach((o,i)=>o.text=`Ответ ${i+1}`);return q;}
function quiz(n=3) {const q=newQuiz();q.title='Проверка';q.questions=Array.from({length:n},(_,i)=>question(`Вопрос ${i+1}`));return q;}
test('empty catalog is valid and has no sample data',()=>assert.deepEqual(validateCatalog({schemaVersion:1,tests:[]}).tests,[]));
test('paste strips only prefixes and marks first correct',()=>{
 const q=parseQuestionBlock('4. Что означает 1С?\r\nA) База 2026\r\nB) Вариант 2\r\nC) Вариант 3');
 assert.equal(q.text,'Что означает 1С?');assert.equal(q.options[0].text,'База 2026');assert.equal(q.correctOptionId,q.options[0].id);
 const kept=parseQuestionBlock('4. Вопрос\nA) Первый\nB) Второй',false);assert.equal(kept.text,'4. Вопрос');assert.equal(kept.options[0].text,'A) Первый');
});
test('paste accepts Cyrillic prefixes and wrapped answers',()=>{
 const q=parseQuestionBlock('12) Вопрос\nпродолжение вопроса\nА) первый\nпродолжение ответа\nБ) второй');
 assert.equal(q.text,'Вопрос\nпродолжение вопроса');assert.equal(q.options.length,2);assert.equal(q.options[0].text,'первый\nпродолжение ответа');
});
test('unlabelled and numeric answers work; incomplete or multiple blocks rejected',()=>{
 assert.equal(parseQuestionBlock('1. Вопрос\n1) Ответ\n2) Другой').options.length,2);
 assert.equal(parseQuestionBlock('Вопрос\nПервый\nВторой').options[0].text,'Первый');
 assert.throws(()=>parseQuestionBlock('Вопрос\nA) Один'));assert.throws(()=>parseQuestionBlock('1. Вопрос\nA) Один\nB) Два\n2. Ещё вопрос\nA) Три\nB) Четыре'));
});
test('300+ questions sample randomly without mutating source or correct ids',()=>{
 const q=quiz(500),original=clone(q);q.settings.questionCount=37;q.settings.shuffleQuestions=false;
 const selected=prepareQuestions(q,()=>0.13);assert.equal(selected.length,37);assert.equal(new Set(selected.map(q=>q.id)).size,37);
 assert.deepEqual(selected.map(q=>q.originalIndex),selected.map(q=>q.originalIndex).sort((a,b)=>a-b));
 assert.ok(selected.some(q=>q.originalIndex>37));assert.deepEqual(q.questions,original.questions);
 assert.ok(selected.every(q=>q.options.some(o=>o.id===q.correctOptionId)));
});
test('more than ten options are supported and validation catches missing answers',()=>{
 const q=quiz(1);for(let i=0;i<12;i++)q.questions[0].options.push({id:crypto.randomUUID(),text:'Ещё ответ'});
 assert.deepEqual(quizErrors(q),[]);q.questions[0].options[2].text='';assert.ok(quizErrors(q).length);q.questions[0].correctOptionId='missing';assert.ok(quizErrors(q).length>1);
});
test('copies have independent IDs and duplicate questions can be skipped',()=>{
 const q=question('Один вопрос');const copied=mergeQuestions([], [q]).questions[0];assert.notEqual(copied.id,q.id);assert.notEqual(copied.options[0].id,q.options[0].id);assert.equal(copied.correctOptionId,copied.options[0].id);
 assert.equal(mergeQuestions([q],[question('  ОДИН  вопрос  ')]).skipped,1);assert.equal(mergeQuestions([q],[q],true).added,1);
});
test('results preserve chosen wrong answer, correct answer, score and question snapshot',()=>{
 const q=quiz(2),questions=prepareQuestions(q),answers=[questions[0].correctOptionId,questions[1].options.find(o=>o.id!==questions[1].correctOptionId).id];
 const r=makeResult(q,questions,answers,1000,61000);assert.equal(r.percent,50);assert.equal(r.correct,1);assert.equal(r.wrong,1);assert.equal(r.durationMs,60000);
 questions[0].text='changed';assert.notEqual(r.questions[0].text,'changed');assert.equal(r.questions[1].selectedOptionId,answers[1]);
});
test('publication omits local state and detects stale writes',()=>{
 const draft=quiz(),p=publishedQuiz(draft),cat={schemaVersion:1,tests:[p]};assert.equal(p.baseRevision,undefined);assert.equal(p.dirty,undefined);assert.equal(p.status,'published');
 assert.throws(()=>applyCatalogChange(cat,'publish',p,'old'));
 const updated=publishedQuiz(draft);assert.equal(applyCatalogChange(cat,'publish',updated,p.revision).tests[0].revision,updated.revision);
 assert.equal(applyCatalogChange(cat,'delete',p,p.revision).tests.length,0);
 assert.throws(()=>validateCatalog({schemaVersion:1,tests:[p,p]}));
});
test('question text renders safely as text',()=>assert.equal(escapeHTML('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;'));
