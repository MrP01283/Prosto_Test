import test from 'node:test';
import assert from 'node:assert/strict';
import {newQuiz,newQuestion,prepareQuestions} from '../src/core.js';
import {activeAttemptKey,elapsedAttempt,pauseAttempt,snapshotAttempt,validAttemptSnapshot} from '../src/attempt-progress.js';
function attempt(){const quiz=newQuiz();quiz.title='Saved test';quiz.questions=Array.from({length:5},(_,i)=>{const q=newQuestion();q.text=String(i);q.options.forEach((o,j)=>o.text=String(j));return q;});return {quiz,questions:prepareQuestions(quiz),answers:[],index:0,attemptId:'stable-result-id',startedAt:100,elapsedMs:500,activeSince:1000,preview:false,questionRange:null};}
test('snapshots retain actual shuffled questions and answers without runtime fields',()=>{
  const a=attempt();a.answers[0]=a.questions[0].options[2].id;a.index=1;a.timer=123;
  const saved=snapshotAttempt(a,1500);assert.equal(saved.elapsedMs,1000);assert.equal(saved.timer,undefined);assert.equal(saved.attemptId,a.attemptId);assert.deepEqual(saved.questions,a.questions);assert.deepEqual(saved.answers,a.answers);assert.equal(validAttemptSnapshot(saved,a.quiz.id),true);
  a.questions.reverse();a.answers[0]='changed';assert.notDeepEqual(saved.questions,a.questions);assert.notEqual(saved.answers[0],'changed');
});
test('closed and hidden time is excluded, reload starts a new clock segment',()=>{
  const a=attempt();pauseAttempt(a,2000);assert.equal(elapsedAttempt(a,3602000),1500);
  const saved=snapshotAttempt(a,3602000);const restored={...saved,activeSince:9000};assert.equal(elapsedAttempt(restored,10000),2500);
});
test('invalid progress, foreign questions and mismatched modes are rejected',()=>{
  const a=attempt(),saved=snapshotAttempt(a,1100);assert.equal(validAttemptSnapshot(saved,a.quiz.id,true),false);
  for(const patch of [{schemaVersion:8},{index:5},{index:-1},{elapsedMs:-5},{answers:['unknown']},{index:1},{questions:[]},{attemptId:null}])assert.equal(validAttemptSnapshot({...saved,...patch},a.quiz.id),false);
  const foreign=structuredClone(saved);foreign.questions[0].id='foreign';assert.equal(validAttemptSnapshot(foreign,a.quiz.id),false);
  assert.notEqual(activeAttemptKey(a.quiz.id),activeAttemptKey(a.quiz.id,true));
});
