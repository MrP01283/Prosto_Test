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
    settings: {questionCount: null, allowQuestionRange: true, shuffleQuestions: true, shuffleOptions: true},
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
  if (quiz.settings.allowQuestionRange !== undefined && typeof quiz.settings.allowQuestionRange !== 'boolean') errors.push('Проверьте настройку выбора диапазона вопросов.');
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

export function parseQuestionBatch(text, strip = true) {
  const numbered = /^\s*(?:вопрос\s*)?(\d+)[.)]\s*(.*)$/iu;
  const labelled = /^\s*([A-ZА-ЯЁ]+)[.)]\s*(.*)$/iu;
  const blocks = [], errors = [];
  let block;
  text.replace(/^\uFEFF/u,'').replace(/\r\n?/g,'\n').split('\n').forEach((line,index) => {
    const start = line.match(numbered);
    if (start) {
      block = {sourceNumber:start[1], line:index+1, lines:[line.trim()]};
      blocks.push(block);
    } else if (block) block.lines.push(line.trim());
    else if (line.trim()) errors.push(`Строка ${index+1}: вопрос должен начинаться с номера, например «16. Текст вопроса».`);
  });
  const entries = blocks.map(block => {
    const issues = [], questionLines = [], answers = [], seen = new Set();
    for (const [index,line] of block.lines.entries()) {
      const match = index > 0 ? line.match(labelled) : null;
      if (match) {
        const label = match[1].toUpperCase();
        if (seen.has(label)) issues.push(`Строка ${block.line+index}: повторяется метка ответа «${label}».`);
        seen.add(label);
        answers.push({label, line:block.line+index, lines:[line], content:[match[2]]});
      } else if (answers.length) {
        answers.at(-1).lines.push(line);answers.at(-1).content.push(line);
      } else questionLines.push(index===0 ? line.replace(questionPrefix,'') : line);
    }
    const questionText = questionLines.join('\n').trim();
    if (!questionText) issues.push('Введите текст вопроса после номера.');
    if (answers.length < 2) issues.push('Нужны минимум два ответа с буквенными метками, например A) и B).');
    if (answers.length && !validAnswerLabels(answers.map(answer=>answer.label))) issues.push('Буквы ответов должны идти подряд, начиная с A или А. Проверьте пропущенные метки.');
    for (const answer of answers) {
      if (!answer.content.join('\n').trim()) issues.push(`Строка ${answer.line}: вариант «${answer.label}» пустой.`);
    }
    const options = answers.map(answer => ({id:uid(), text:(strip ? answer.content : answer.lines).join('\n').trim()}));
    // Removing the answer portion leaves the original question prefix intact when requested.
    const originalQuestion = block.lines.slice(0,answers[0] ? answers[0].line-block.line : block.lines.length).join('\n').trim();
    const question = {id:uid(),text:strip?questionText:originalQuestion,options,correctOptionId:options[0]?.id};
    const messages = issues.map(issue => `Вопрос №${block.sourceNumber} (строка ${block.line}): ${issue}`);
    errors.push(...messages);
    return {...block, question:issues.length?null:question, errors:messages};
  });
  if (!blocks.length && !errors.length) errors.push('Вставьте пронумерованные вопросы и ответы с буквенными метками.');
  return {entries, errors, questions:errors.length?[]:entries.map(entry=>entry.question)};
}

function validAnswerLabels(labels) {
  const lookalikes = {'А':'A','В':'B','С':'C','Е':'E','Н':'H','К':'K','М':'M','О':'O','Р':'P','Т':'T','Х':'X','У':'Y'};
  const reverse = Object.fromEntries(Object.entries(lookalikes).map(([a,b])=>[b,a]));
  return ['ABCDEFGHIJKLMNOPQRSTUVWXYZ','АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ','АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'].some((alphabet,script)=>labels.every((label,index)=>{
    let expected='',n=index+1;
    while(n>0){n--;expected=alphabet[n%alphabet.length]+expected;n=Math.floor(n/alphabet.length);}
    const map=script===0?lookalikes:reverse;
    return [...label].map(char=>map[char]??char).join('')===expected;
  }));
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

export function mergeQuestions(existing, incoming, includeDuplicates = false, ignoreNumbering = false) {
  const keyOf = question => normalize(ignoreNumbering ? question.text.replace(questionPrefix,'') : question.text);
  const seen = new Set(existing.map(keyOf));
  const questions = [...existing];
  let skipped = 0;
  for (const question of incoming) {
    const key = keyOf(question);
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

// Missing flags in older catalogs/drafts default to enabled for the full-question mode.
export function allowsQuestionRange(quiz) {
  return quiz.settings.questionCount === null && quiz.settings.allowQuestionRange !== false;
}

export function normalizeQuestionRange(total, range = {}) {
  if (!Number.isInteger(total) || total < 1) throw new Error('В тесте нет вопросов для выбора.');
  const bound = (value, fallback) => {
    const number = value === '' || value == null ? fallback : Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.min(total, Math.trunc(number))) : fallback;
  };
  const from = bound(range.from, 1);
  return {from, to: Math.max(from, bound(range.to, total))};
}

export function prepareQuestions(quiz, random = Math.random, range = null) {
  let questions = clone(quiz.questions).map((q, i) => ({...q, originalIndex: i + 1}));
  const selectedRange = range && allowsQuestionRange(quiz) ? normalizeQuestionRange(questions.length, range) : null;
  if (selectedRange) questions = questions.slice(selectedRange.from - 1, selectedRange.to);
  const count = quiz.settings.questionCount ?? questions.length;
  // A limited subset is always random; the question-order toggle controls its displayed order.
  if (count < questions.length) questions = shuffle(questions, random).slice(0, count);
  if (selectedRange || quiz.settings.shuffleQuestions) questions = shuffle(questions, random);
  else questions.sort((a, b) => a.originalIndex - b.originalIndex);
  if (quiz.settings.shuffleOptions) questions = questions.map(q => ({...q, options: shuffle(q.options, random)}));
  return questions;
}

export function makeResult(quiz, questions, answers, startedAt, finishedAt = Date.now(), questionRange = null) {
  const entries = questions.map((q, i) => ({...clone(q), selectedOptionId: answers[i] ?? null, correct: answers[i] === q.correctOptionId}));
  const correct = entries.filter(q => q.correct).length;
  return {id: uid(), quizId: quiz.id, title: quiz.title, revision: quiz.revision ?? null,
    questionRange: questionRange ? {...normalizeQuestionRange(quiz.questions.length, questionRange), poolSize: quiz.questions.length} : null,
    startedAt, finishedAt, durationMs: Math.max(0, finishedAt - startedAt),
    total: entries.length, correct, wrong: entries.length - correct,
    percent: entries.length ? Math.round(correct / entries.length * 100) : 0, questions: entries};
}

export function publishedQuiz(draft, status = 'published') {
  return {id: draft.id, title: draft.title.trim(), description: draft.description.trim(),
    questions: draft.questions.map(q => ({id: q.id, text: q.text.trim(), options: q.options.map(o => ({id: o.id, text: o.text.trim()})), correctOptionId: q.correctOptionId})),
    settings: {...clone(draft.settings), allowQuestionRange: allowsQuestionRange(draft)}, status, createdAt: draft.createdAt,
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
