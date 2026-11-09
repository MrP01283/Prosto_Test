import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicCatalog } from '../scripts/public-catalog.js';
import { newQuestion, newQuiz, publishedQuiz } from '../src/core.js';
import { loadPublicIndex, loadPublicQuiz, loadPublicStatus } from '../src/github.js';

function fixture() {
  const draft = newQuiz();
  draft.title = 'Тест';
  const question = newQuestion();
  question.text = 'Текст вопроса';
  question.options.forEach((option, index) => {option.text = `Ответ ${index + 1}`;});
  draft.questions.push(question);
  const quiz = publishedQuiz(draft);
  const files = buildPublicCatalog({tests:[quiz]});
  return {quiz, files};
}

test('index contains cards only and each revision addresses its own quiz body', async () => {
  const {quiz, files} = fixture();
  const paths = [];
  const fetcher = async (url, options) => {
    const file = url.pathname.split('/').pop();
    paths.push([file, options.cache]);
    return new Response(files.get(file));
  };
  const {tests:[entry]} = await loadPublicIndex(fetcher);
  assert.equal(entry.questionTotal, 1);
  assert.equal('questions' in entry, false);
  assert.deepEqual(paths, [['catalog.json', 'no-cache']]);
  assert.deepEqual(await loadPublicQuiz(entry, fetcher), quiz);
  assert.deepEqual(paths[1], [entry.file, 'default']);
  const closed = {...quiz, status:'closed', revision:'closed-revision'};
  const updated = buildPublicCatalog({tests:[closed]});
  assert.equal(updated.has(entry.file), false);
  const updatedEntry = JSON.parse(updated.get('catalog.json')).tests[0];
  assert.equal(updatedEntry.status, 'closed');
  await assert.rejects(loadPublicQuiz(updatedEntry, fetcherFor(quiz)), /обновился/);
});

const fetcherFor = data => async () => Response.json(data);
const bodyTimeout = () => {throw new DOMException('signal timed out', 'TimeoutError');};

test('timed-out response bodies retry once and report a readable error if both attempts fail', async () => {
  const {files} = fixture();
  let calls = 0;
  const data = await loadPublicIndex(async () => ++calls === 1 ?
    {ok:true, json:bodyTimeout} : new Response(files.get('catalog.json')));
  assert.equal(calls, 2);
  assert.equal(data.tests.length, 1);

  calls = 0;
  await assert.rejects(loadPublicStatus(async () => {
    calls++;
    return {ok:true, json:bodyTimeout};
  }), /Не удалось проверить доступность теста.*слишком много времени/);
  assert.equal(calls, 2);
});

test('temporary HTTP errors retry but a missing catalog is reported immediately', async () => {
  let calls = 0;
  const data = await loadPublicIndex(async () => ++calls === 1 ?
    new Response(null, {status:503}) : Response.json({schemaVersion:1, tests:[]}));
  assert.equal(data.tests.length, 0);
  assert.equal(calls, 2);

  calls = 0;
  await assert.rejects(loadPublicIndex(async () => {
    calls++;
    return new Response(null, {status:404});
  }), /HTTP 404/);
  assert.equal(calls, 1);
});
