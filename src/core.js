export const uid = () => crypto.randomUUID();
export const clone = value => structuredClone(value);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const normalize = text => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');

export function newQuestion() {
  const options = Array.from({length: 5}, () => ({id: uid(), text: ''}));
  return {id: uid(), text: '', options, correctOptionId: options[0].id};
}

export function newQuiz() {
  const now = new Date().toISOString();
  return {id: uid(), title: '', description: '', questions: [],
    settings: {questionCount: null, shuffleQuestions: true, shuffleOptions: true},
    status: 'draft', createdAt: now, updatedAt: now, baseRevision: null, dirty: true};
}

export function questionErrors(question) {
  const errors = [];
  if (!question?.text?.trim()) errors.push('Введите текст вопроса.');
  if (!Array.isArray(question?.options) || question.options.length < 2) errors.push('Добавьте минимум два варианта ответа.');
  if (question?.options?.some(option => !option.text?.trim())) errors.push('Заполните или удалите пустые варианты ответа.');
  if (!question?.options?.some(option => option.id === question.correctOptionId)) errors.push('Отметьте правильный вариант.');
  return errors;
}

export function quizErrors(quiz) {
  const errors = [];
  if (!quiz.title.trim()) errors.push('Укажите название теста.');
  if (!quiz.questions.length) errors.push('Добавьте хотя бы один вопрос.');
  quiz.questions.forEach((q, i) => questionErrors(q).forEach(error => errors.push(`Вопрос ${i + 1}: ${error}`)));
  const count = quiz.settings.questionCount;
  if (count !== null && (!Number.isInteger(count) || count < 1 || count > quiz.questions.length)) errors.push('Количество вопросов должно быть от 1 до общего числа вопросов.');
  return errors;
}

// Prefixes are removed only at the beginning of a line; numbers inside the text stay intact.
const questionPrefix = /^\s*(?:вопрос\s*)?\d+[.)]\s*/iu;
const answerPrefix = /^\s*(?:[A-ZА-ЯЁ]|\d+)[.)]\s*/iu;
const letterPrefix = /^\s*[A-ZА-ЯЁ][.)]\s*/iu;
export function parseQuestionBlock(text, strip = true) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length < 3) throw new Error('Нужны вопрос и минимум два ответа, каждый с новой строки.');
  const firstMarked = lines.findIndex((line, i) => i > 0 && letterPrefix.test(line));
  let question, answers;
  if (firstMarked > 0) {
    question = lines.slice(0, firstMarked).join('\n');
    answers = [];
    for (const line of lines.slice(firstMarked)) {
      if (letterPrefix.test(line)) answers.push(line);
      else if (questionPrefix.test(line)) throw new Error('Похоже, вставлено несколько вопросов. Добавляйте по одному вопросу за раз.');
      else answers[answers.length - 1] += '\n' + line;
    }
  } else { [question, ...answers] = lines; }
  const options = answers.map(text => ({id: uid(), text: strip ? text.replace(answerPrefix, '') : text}));
  const parsed = {id: uid(), text: strip ? question.replace(questionPrefix, '') : question, options, correctOptionId: options[0]?.id};
  const errors = questionErrors(parsed);
  if (errors.length) throw new Error(errors.join(' '));
  return parsed;
}

export function copyQuestion(question) {
  let correctOptionId;
  const options = question.options.map(o => {
    const id = uid();
    if (o.id === question.correctOptionId) correctOptionId = id;
    return {id, text: o.text};
  });
  return {id: uid(), text: question.text, options, correctOptionId};
}

export function mergeQuestions(existing, incoming, includeDuplicates = false) {
  const seen = new Set(existing.map(q => normalize(q.text)));
  const questions = [...existing];
  let skipped = 0;
  for (const question of incoming) {
    const key = normalize(question.text);
    if (!includeDuplicates && seen.has(key)) { skipped++; continue; }
    questions.push(copyQuestion(question));
    seen.add(key);
  }
  return {questions, skipped, added: questions.length - existing.length};
}

export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function prepareQuestions(quiz, random = Math.random) {
  let questions = clone(quiz.questions).map((q, i) => ({...q, originalIndex: i + 1}));
  const count = quiz.settings.questionCount ?? questions.length;
  // A limited subset is always random; the question-order toggle controls its displayed order.
  if (count < questions.length) questions = shuffle(questions, random).slice(0, count);
  if (quiz.settings.shuffleQuestions) questions = shuffle(questions, random);
  else questions.sort((a, b) => a.originalIndex - b.originalIndex);
  if (quiz.settings.shuffleOptions) questions = questions.map(q => ({...q, options: shuffle(q.options, random)}));
  return questions;
}

export function makeResult(quiz, questions, answers, startedAt, finishedAt = Date.now()) {
  const entries = questions.map((q, i) => ({...clone(q), selectedOptionId: answers[i] ?? null, correct: answers[i] === q.correctOptionId}));
  const correct = entries.filter(q => q.correct).length;
  return {id: uid(), quizId: quiz.id, title: quiz.title, revision: quiz.revision ?? null,
    startedAt, finishedAt, durationMs: Math.max(0, finishedAt - startedAt),
    total: entries.length, correct, wrong: entries.length - correct,
    percent: entries.length ? Math.round(correct / entries.length * 100) : 0, questions: entries};
}

export function publishedQuiz(draft, status = 'published') {
  return {id: draft.id, title: draft.title.trim(), description: draft.description.trim(),
    questions: draft.questions.map(q => ({id: q.id, text: q.text.trim(), options: q.options.map(o => ({id: o.id, text: o.text.trim()})), correctOptionId: q.correctOptionId})),
    settings: clone(draft.settings), status, createdAt: draft.createdAt,
    updatedAt: new Date().toISOString(), revision: uid()};
}

export function draftFromPublic(quiz) {
  return {...clone(quiz), baseRevision: quiz.revision, dirty: false};
}

export function validateCatalog(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.tests)) throw new Error('Формат каталога не поддерживается.');
  const ids = new Set();
  for (const q of data.tests) {
    if (!q || typeof q.id !== 'string' || !q.id || ids.has(q.id) || typeof q.title !== 'string' || typeof q.description !== 'string' || !['published','closed'].includes(q.status) || typeof q.revision !== 'string' || !Array.isArray(q.questions) || !q.settings || ![true,false].includes(q.settings.shuffleQuestions) || ![true,false].includes(q.settings.shuffleOptions)) throw new Error('В каталоге повреждён тест.');
    ids.add(q.id);
    const questionIds = new Set();
    for (const question of q.questions) {
      if (typeof question.id !== 'string' || questionIds.has(question.id) || typeof question.text !== 'string' || !Array.isArray(question.options)) throw new Error('В каталоге повреждён вопрос.');
      questionIds.add(question.id);
      const optionIds = new Set();
      for (const option of question.options) {
        if (typeof option.id !== 'string' || optionIds.has(option.id) || typeof option.text !== 'string') throw new Error('В каталоге повреждён вариант ответа.');
        optionIds.add(option.id);
      }
    }
    if (quizErrors(q).length) throw new Error(`Тест «${q.title}» содержит незаполненные вопросы.`);
  }
  return data;
}

export function applyCatalogChange(catalog, operation, quiz, expectedRevision) {
  const current = catalog.tests.find(t => t.id === quiz.id);
  if ((current?.revision ?? null) !== (expectedRevision ?? null)) throw new Error('Тест уже изменён в другой вкладке. Обновите список. Ваш черновик сохранён; можно перенести изменения вручную или опубликовать его отдельной копией.');
  if (operation === 'delete') return {...catalog, tests: catalog.tests.filter(t => t.id !== quiz.id)};
  return {...catalog, tests: current ? catalog.tests.map(t => t.id === quiz.id ? quiz : t) : [...catalog.tests, quiz]};
}

export function formatDuration(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
  return (h ? `${h}:` : '') + `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
