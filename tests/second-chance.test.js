import test from 'node:test';
import assert from 'node:assert/strict';
import {newQuiz, newQuestion, prepareQuestions, makeResult} from '../src/core.js';
import {snapshotAttempt, snapshotProgress, validAttemptSnapshot} from '../src/attempt-progress.js';
import {restoreQuestionQueue, restoreSecondChance, currentAnswers, recordAttemptAnswer,
  deferCurrentQuestion, advanceQuestionQueue, answeredQuestionCount,
  beginSecondChance, addSecondChanceResult} from '../src/question-queue.js';

function attempt() {
  const quiz=newQuiz();
  quiz.title='Второй шанс';
  quiz.questions=Array.from({length:4},(_,i)=>{
    const question=newQuestion();
    question.text=String(i);
    question.options.forEach((option,j)=>{option.text=String(j);});
    return question;
  });
  const state={quiz,questions:prepareQuestions(quiz),answers:[],index:0,
    attemptId:'second-chance',startedAt:1000,elapsedMs:0,activeSince:null,preview:false};
  return Object.assign(state,restoreQuestionQueue(state),restoreSecondChance({secondChance:true}));
}
function answer(state,correct) {
  const question=state.questions[state.index];
  const option=correct?question.correctOptionId:question.options.find(o=>o.id!==question.correctOptionId).id;
  recordAttemptAnswer(state,option);
}
function firstRound() {
  const state=attempt();
  deferCurrentQuestion(state);
  answer(state,false);advanceQuestionQueue(state);
  answer(state,true);advanceQuestionQueue(state);
  answer(state,false);advanceQuestionQueue(state);
  answer(state,false);
  return state;
}
function result(state) {
  return addSecondChanceResult(makeResult(state.quiz,state.questions,state.answers,1000,2000),state);
}

test('second chance preserves first answers, original percentage and the order of first mistakes',()=>{
  const state=firstRound(),original=structuredClone(state.answers),questions=structuredClone(state.questions);
  assert.deepEqual(state.wrongOrder,[1,3,0]);
  assert.equal(beginSecondChance(state),true);
  assert.equal(state.round,'second-intro');
  assert.deepEqual(state.queue,[1,3,0]);
  assert.equal(validAttemptSnapshot(snapshotAttempt(state),state.quiz.id),true);
  assert.equal(deferCurrentQuestion(state),false);
  assert.equal(recordAttemptAnswer(state,state.questions[state.index].correctOptionId),false);
  state.round='second';
  assert.equal(answeredQuestionCount(state),0);
  deferCurrentQuestion(state);
  assert.deepEqual(state.queue,[3,0,1]);
  answer(state,true);advanceQuestionQueue(state);
  answer(state,false);advanceQuestionQueue(state);
  answer(state,true);
  assert.equal(answeredQuestionCount(state),3);
  assert.equal(advanceQuestionQueue(state),false);
  assert.equal(beginSecondChance(state),false);
  assert.deepEqual(state.answers,original);
  assert.deepEqual(state.questions,questions);
  const final=result(state);
  assert.equal(final.correct,1);
  assert.equal(final.wrong,3);
  assert.equal(final.percent,25);
  assert.deepEqual(final.secondChance,{total:3,answered:3,correct:2,wrong:1,remaining:1});
  assert.equal(final.questions.filter(q=>q.retryCorrect).length,2);
  assert.equal(final.questions[0].selectedOptionId,original[0]);
  assert.equal(final.questions[0].retryCorrect,false);
});

test('intro and partial second-round checkpoints can be restored and finished early',()=>{
  const state=firstRound(),base=snapshotAttempt(state);
  beginSecondChance(state);
  const intro={...base,...snapshotProgress(state)};
  assert.equal(validAttemptSnapshot(intro,state.quiz.id),true);
  assert.equal(intro.round,'second-intro');
  assert.deepEqual(result(state).secondChance,{total:3,answered:0,correct:0,wrong:0,remaining:3});
  state.round='second';deferCurrentQuestion(state);answer(state,true);advanceQuestionQueue(state);
  const checkpoint=snapshotProgress(state),restored={...base,...checkpoint};
  assert.equal(validAttemptSnapshot(restored,state.quiz.id),true);
  assert.deepEqual(restored.queue,[0,1]);
  assert.equal(currentAnswers(restored),restored.retryAnswers);
  assert.equal(result(restored).percent,25);
  assert.deepEqual(result(restored).secondChance,{total:3,answered:1,correct:1,wrong:0,remaining:2});
  state.retryAnswers[3]='changed';state.queue.reverse();
  assert.notEqual(checkpoint.retryAnswers[3],'changed');
  assert.deepEqual(checkpoint.queue,[0,1]);
});

test('corrupt round state is rejected while legacy attempts still restore',()=>{
  const state=firstRound();beginSecondChance(state);
  const saved=snapshotAttempt(state);
  for(const patch of [
    {secondChance:false},{round:'third'},{wrongOrder:[1,3,0,2]},
    {wrongOrder:[1,3]},{wrongOrder:[1,1,0]},{retryAnswers:[null]},
    {queue:[2,1,3,0]},{queue:[3,1,0]},
  ])assert.equal(validAttemptSnapshot({...saved,...patch},state.quiz.id),false);
  const legacy=attempt();legacy.secondChance=false;
  const old=snapshotAttempt(legacy);
  for(const key of ['secondChance','round','wrongOrder','retryAnswers'])delete old[key];
  assert.equal(validAttemptSnapshot(old,legacy.quiz.id),true);
  assert.deepEqual(restoreSecondChance(old),{secondChance:false,round:'first',wrongOrder:[],retryAnswers:[]});
});

test('disabled mode and an error-free first round never start another round',()=>{
  const state=attempt();
  state.secondChance=false;answer(state,false);
  assert.equal(beginSecondChance(state),false);
  assert.equal(result(state).secondChance,undefined);
  const clean=attempt();
  for(let i=0;i<4;i++){answer(clean,true);advanceQuestionQueue(clean);}
  assert.equal(beginSecondChance(clean),false);
  assert.equal(result(clean).percent,100);
  assert.equal(result(clean).secondChance.total,0);
});
