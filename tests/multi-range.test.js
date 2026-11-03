import test from 'node:test';
import assert from 'node:assert/strict';
import {newQuiz,newQuestion,clone,normalizeQuestionRange,prepareQuestions,makeResult} from '../src/core.js';

function quiz(total=300) {
  const quiz=newQuiz();quiz.title='Несколько диапазонов';
  quiz.questions=Array.from({length:total},(_,index)=>{
    const question=newQuestion();question.text=`Вопрос ${index+1}`;
    question.options.forEach((option,index)=>option.text=`Вариант ${index+1}`);
    return question;
  });
  return quiz;
}
const numbers=questions=>questions.map(question=>question.originalIndex).sort((a,b)=>a-b);

test('multiple participant ranges select exact constructor positions before shuffling',()=>{
  const source=quiz(),before=clone(source);
  const questions=prepareQuestions(source,()=>0.27,{ranges:[{from:1,to:30},{from:80,to:100}]});
  const expected=[...Array.from({length:30},(_,i)=>i+1),...Array.from({length:21},(_,i)=>i+80)];
  assert.equal(questions.length,51);
  assert.deepEqual(numbers(questions),expected);
  assert.notDeepEqual(questions.map(question=>question.originalIndex),expected);
  assert.deepEqual(new Set(questions.map(question=>question.id)),new Set(expected.map(number=>source.questions[number-1].id)));
  assert.deepEqual(source,before);
});

test('overlapping and adjacent ranges merge and never duplicate a question',()=>{
  const selection={ranges:[{from:80,to:100},{from:10,to:30},{from:1,to:15},{from:31,to:40},{from:80,to:100}]};
  assert.deepEqual(normalizeQuestionRange(300,selection),{ranges:[{from:1,to:40},{from:80,to:100}]});
  const selected=prepareQuestions(quiz(),()=>0.4,selection);
  assert.equal(selected.length,61);
  assert.equal(new Set(selected.map(question=>question.id)).size,61);
});

test('multiple range bounds stay in the source pool and a reversed interval becomes one valid question',()=>{
  assert.deepEqual(normalizeQuestionRange(100,{ranges:[{from:-30,to:5},{from:95,to:350}]}),{ranges:[{from:1,to:5},{from:95,to:100}]});
  assert.deepEqual(normalizeQuestionRange(100,{ranges:[{from:50,to:20}]}),{from:50,to:50});
  assert.deepEqual(normalizeQuestionRange(1,{ranges:[{from:1,to:1},{from:-2,to:9}]}),{from:1,to:1});
});

test('participant multiple ranges cannot override the creator restrictions',()=>{
  const source=quiz(100),selection={ranges:[{from:1,to:2},{from:80,to:81}]};
  source.settings.allowQuestionRange=false;
  assert.equal(prepareQuestions(source,()=>0.2,selection).length,100);
  source.settings.allowQuestionRange=true;source.settings.questionCount=7;
  assert.equal(prepareQuestions(source,()=>0.2,selection).length,7);
});

test('result retains an independent normalized snapshot of every selected interval',()=>{
  const source=quiz(),selection={ranges:[{from:80,to:100},{from:1,to:30}]};
  const questions=prepareQuestions(source,()=>0.2,selection);
  const result=makeResult(source,questions,questions.map(question=>question.correctOptionId),1000,2000,selection);
  selection.ranges[0].from=250;selection.ranges.push({from:200,to:230});source.questions.reverse();
  assert.deepEqual(result.questionRange,{ranges:[{from:1,to:30},{from:80,to:100}],poolSize:300});
  assert.equal(result.total,51);assert.equal(result.percent,100);
  assert.deepEqual(numbers(result.questions),[...Array.from({length:30},(_,i)=>i+1),...Array.from({length:21},(_,i)=>i+80)]);
});
