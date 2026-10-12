import test from 'node:test';
import assert from 'node:assert/strict';
import {parseQuestionBatch,mergeQuestions,quizErrors,newQuiz} from '../src/core.js';

const block = (number,text='Текст вопроса') => `${number}. ${text}\nA) Первый ответ\nB) Второй ответ`;

test('batch respects input order, arbitrary source numbers, blank lines and first correct answer',()=>{
 const result=parseQuestionBatch(`\uFEFF  ${block(101,'Первый')}\r\n\r\n\r\n${block(7,'Второй')}\r\n${block(7,'Третий')}\r\n`);
 assert.deepEqual(result.errors,[]);assert.equal(result.questions.length,3);
 assert.deepEqual(result.questions.map(q=>q.text),['Первый','Второй','Третий']);
 assert.deepEqual(result.entries.map(e=>e.sourceNumber),['101','7','7']);
 assert.ok(result.questions.every(q=>q.correctOptionId===q.options[0].id));
 const quiz=newQuiz();quiz.title='Проверка';quiz.questions=result.questions;assert.deepEqual(quizErrors(quiz),[]);
});
test('batch checkbox preserves or removes only leading question/answer labels',()=>{
 const text='16. Что означает 1С?\nпродолжение вопроса\nA) Ответ 2026\nпродолжение ответа\n\nB) Другой ответ';
 const stripped=parseQuestionBatch(text).questions[0],kept=parseQuestionBatch(text,false).questions[0];
 assert.equal(stripped.text,'Что означает 1С?\nпродолжение вопроса');
 assert.equal(kept.text,'16. Что означает 1С?\nпродолжение вопроса');
 assert.equal(stripped.options[0].text,'Ответ 2026\nпродолжение ответа');
 assert.equal(kept.options[0].text,'A) Ответ 2026\nпродолжение ответа');
});
test('batch accepts Cyrillic labels, visual letter substitutions and more than 26 options',()=>{
 assert.equal(parseQuestionBatch('1) Вопрос\nА) Первый\nБ) Второй\nВ) Третий').errors.length,0);
 assert.equal(parseQuestionBatch('1) Вопрос\nА) Первый\nB) Второй\nС) Третий').errors.length,0);
 const labels=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ','AA','AB'];
 const result=parseQuestionBatch('1. Вопрос\n'+labels.map(label=>`${label}) Ответ ${label}`).join('\n'));
 assert.deepEqual(result.errors,[]);assert.equal(result.questions[0].options.length,28);
});
test('any malformed block blocks the entire batch and reports its source number and line',()=>{
 for(const broken of ['77. Пустой','77.\nA) Ответ\nB) Другой','77. Вопрос\nA)\nB) Другой','77. Вопрос\nA) Один','77. Вопрос\nA) Один\nA) Два','77. Вопрос\nA) Один\nC) Три']){
   for(const strip of [true,false]){
     const result=parseQuestionBatch(block(16)+'\n\n'+broken,strip);
     assert.equal(result.questions.length,0);assert.ok(result.entries[0].question);
     assert.ok(result.errors.some(error=>error.includes('№77 (строка 5)')));
   }
 }
 assert.ok(parseQuestionBatch('Текст без номера\nA) Один\nB) Два').errors.length);
 assert.equal(parseQuestionBatch('').questions.length,0);
});
test('batch duplicate choices consider existing questions and internal duplicates regardless of source numbers',()=>{
 const existing=parseQuestionBatch(block(1,'Одинаковый')).questions;
 const incoming=parseQuestionBatch(block(100,'Одинаковый')+'\n\n'+block(200,'Новый')+'\n\n'+block(999,'Новый'),false).questions;
 const skipped=mergeQuestions(existing,incoming,false,true),all=mergeQuestions(existing,incoming,true,true);
 assert.equal(skipped.skipped,2);assert.equal(skipped.added,1);assert.equal(skipped.questions.length,2);
 assert.equal(all.added,3);assert.equal(new Set(all.questions.map(q=>q.id)).size,4);
 assert.equal(existing.length,1);assert.equal(incoming[0].text,'100. Одинаковый');
});
test('300+ question batch produces complete independently editable questions',()=>{
 const parsed=parseQuestionBatch(Array.from({length:350},(_,i)=>block(i+1,`Вопрос ${i+1}`)).join('\n\n'));
 assert.deepEqual(parsed.errors,[]);assert.equal(parsed.questions.length,350);
 assert.equal(new Set(parsed.questions.flatMap(q=>[q.id,...q.options.map(o=>o.id)])).size,1050);
});
