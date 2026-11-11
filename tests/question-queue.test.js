import test from 'node:test';
import assert from 'node:assert/strict';
import { newQuiz, newQuestion, prepareQuestions, makeResult } from '../src/core.js';
import { snapshotAttempt, snapshotProgress, validAttemptSnapshot } from '../src/attempt-progress.js';
import { restoreQuestionQueue, answeredQuestionCount, deferCurrentQuestion, advanceQuestionQueue } from '../src/question-queue.js';

function attempt(count = 7) {
  const quiz = newQuiz();
  quiz.title = 'Отложенные вопросы';
  quiz.settings.shuffleQuestions = false;
  quiz.questions = Array.from({length:count}, (_, index) => {
    const question = newQuestion();
    question.text = `Вопрос ${index + 1}`;
    question.options.forEach((option, number) => {option.text = `Ответ ${number + 1}`;});
    return question;
  });
  const result = {quiz, questions:prepareQuestions(quiz), answers:[], index:0,
    attemptId:'deferred-attempt', startedAt:1000, elapsedMs:0, activeSince:null, preview:false};
  return Object.assign(result, restoreQuestionQueue(result));
}

function answer(attempt) {
  attempt.answers[attempt.index] = attempt.questions[attempt.index].correctOptionId;
}

test('deferred questions return after the initial pass in the order they were deferred', () => {
  const current = attempt();
  const originals = structuredClone(current.questions);
  for (let index = 0; index < 7; index++) {
    assert.equal(current.index, index);
    if (index === 2 || index === 6) {
      assert.equal(deferCurrentQuestion(current), true);
    } else {
      answer(current);
      assert.equal(advanceQuestionQueue(current), true);
    }
  }
  assert.deepEqual(current.queue, [2, 6]);
  assert.deepEqual(current.deferred, [2, 6]);
  assert.equal(answeredQuestionCount(current), 5);
  assert.deepEqual(current.questions, originals);
  assert.equal(current.answers[2], undefined);
  assert.equal(current.answers[6], undefined);

  // A second deferral rotates the remaining queue without duplicating a question.
  assert.equal(deferCurrentQuestion(current), true);
  assert.deepEqual(current.queue, [6, 2]);
  answer(current);
  assert.equal(deferCurrentQuestion(current), false);
  assert.equal(advanceQuestionQueue(current), true);
  assert.deepEqual(current.deferred, [2]);
  assert.equal(deferCurrentQuestion(current), false);
  answer(current);
  assert.equal(answeredQuestionCount(current), 7);
  assert.equal(advanceQuestionQueue(current), false);

  const result = makeResult(current.quiz, current.questions, current.answers, 1000, 2000);
  assert.equal(result.total, 7);
  assert.equal(result.correct, 7);
  assert.equal(new Set(result.questions.map(question => question.id)).size, 7);
  assert.deepEqual(result.questions.map(question => question.originalIndex), [1, 2, 3, 4, 5, 6, 7]);
});

test('small checkpoints preserve an out-of-order queue and detach it from subsequent changes', () => {
  const current = attempt(4);
  const base = snapshotAttempt(current);
  deferCurrentQuestion(current);
  answer(current);
  advanceQuestionQueue(current);
  deferCurrentQuestion(current);
  const checkpoint = snapshotProgress(current);
  const saved = {...base, ...checkpoint};
  assert.equal(validAttemptSnapshot(saved, current.quiz.id), true);
  assert.deepEqual(checkpoint.queue, [3, 0, 2]);
  assert.deepEqual(checkpoint.deferred, [0, 2]);
  assert.equal(checkpoint.questions, undefined);
  assert.equal(checkpoint.quiz, undefined);
  const restored = {...saved, ...restoreQuestionQueue(saved)};
  deferCurrentQuestion(restored);
  assert.deepEqual(checkpoint.queue, [3, 0, 2]);
  assert.deepEqual(checkpoint.deferred, [0, 2]);
  assert.deepEqual(restored.queue, [0, 2, 3]);
});

test('legacy attempts restore a sequential queue and invalid deferred state is rejected', () => {
  const current = attempt(3);
  answer(current);
  advanceQuestionQueue(current);
  const saved = snapshotAttempt(current);
  delete saved.queue;
  delete saved.deferred;
  assert.equal(validAttemptSnapshot(saved, current.quiz.id), true);
  assert.deepEqual(restoreQuestionQueue(saved), {queue:[1, 2], deferred:[]});
  for (const patch of [
    {queue:[], deferred:[]},
    {queue:[1, 1], deferred:[]},
    {queue:[1, 3], deferred:[]},
    {queue:[2, 1], deferred:[]},
    {queue:[1, 2], deferred:[0]},
    {queue:[1, 2], deferred:[2, 2]},
    {queue:[1, 2]},
    {queue:[1], deferred:[]},
    {queue:[1, 2, 0], deferred:[]},
  ]) assert.equal(validAttemptSnapshot({...saved, ...patch}, current.quiz.id), false);
});

test('one-question attempts cannot be deferred or advanced before an answer', () => {
  const current = attempt(1);
  assert.equal(deferCurrentQuestion(current), false);
  assert.equal(advanceQuestionQueue(current), false);
  assert.equal(answeredQuestionCount(current), 0);
  answer(current);
  assert.equal(answeredQuestionCount(current), 1);
});
