import {escapeHTML as h, normalize} from './core.js';

let disposeBrowser = null;

export function closeQuestionBrowser() {
  disposeBrowser?.();
  disposeBrowser = null;
}

export async function openQuestionBrowser({title, selection, loadQuiz, showDialog}) {
  closeQuestionBrowser();
  showDialog('Все вопросы', '<p role="status">Загружаем вопросы…</p>');
  const dialog = document.querySelector('#dialog');
  dialog.classList.add('question-browser-dialog');
  const controller = new AbortController();
  let entries = [], matches = [], renderVersion = 0, expandVersion = 0, searchTimer;
  let list, search, number, count, status;
  const expanded = new Set();
  const active = () => !controller.signal.aborted && dialog.open &&
    dialog.classList.contains('question-browser-dialog');
  const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));
  disposeBrowser = () => {
    controller.abort();
    clearTimeout(searchTimer);
    renderVersion++;
    expandVersion++;
  };

  function selected(position) {
    return selection?.mode === 'range' &&
      selection.ranges.some(range => position >= range.from && position <= range.to);
  }

  function otherOptionsHTML(entry) {
    return entry.question.options.map((option, index) => option.id === entry.correct?.id ? '' :
      `<div class="question-browser-option"><span class="muted small">Вариант ${index + 1}</span><span class="pre">${h(option.text)}</span></div>`).join('');
  }

  function cardHTML(entry) {
    const {question, correct, position} = entry;
    const open = expanded.has(position);
    const correctHTML = correct ?
      `<span class="question-browser-correct"><b class="small">✓ Правильный ответ · вариант ${question.options.indexOf(correct) + 1}</b><span class="pre">${h(correct.text)}</span></span>` :
      '<span class="muted small">Правильный ответ не отмечен</span>';
    return `<details class="question-browser-card" data-question-number="${position}" ${open?'open':''}><summary><span class="question-browser-meta"><b>Вопрос №${position}</b>${selected(position)?'<span class="pill">В диапазоне</span>':''}</span><span class="question-browser-title pre">${h(question.text || 'Без текста')}</span>${correctHTML}<span class="question-browser-more">Остальные варианты · ${question.options.length - (correct?1:0)}</span></summary><div class="question-browser-others" ${open?'data-loaded':''}>${open?otherOptionsHTML(entry):''}</div></details>`;
  }

  async function renderList() {
    const version = ++renderVersion;
    expandVersion++;
    const query = normalize(search.value);
    matches = entries.filter(entry => entry.search.includes(query));
    count.textContent = `Показано ${matches.length} из ${entries.length}`;
    status.textContent = '';
    list.replaceChildren();
    list.scrollTop = 0;
    list.setAttribute('aria-busy', 'true');
    if (!matches.length) {
      list.innerHTML = '<p class="muted">Ничего не найдено. Попробуйте другой текст.</p>';
    }
    for (let offset = 0; offset < matches.length; offset += 24) {
      if (!active() || version !== renderVersion) return false;
      list.insertAdjacentHTML('beforeend', matches.slice(offset, offset + 24).map(cardHTML).join(''));
      await yieldTask();
    }
    if (!active() || version !== renderVersion) return false;
    list.setAttribute('aria-busy', 'false');
    return true;
  }

  function populateOthers(card) {
    const others = card.querySelector('.question-browser-others');
    if (others.hasAttribute('data-loaded')) return;
    others.innerHTML = otherOptionsHTML(entries[Number(card.dataset.questionNumber) - 1]);
    others.setAttribute('data-loaded', '');
  }

  async function expandAll(open) {
    clearTimeout(searchTimer);
    // Apply pending search text before updating all currently matching cards.
    if (normalize(search.value) !== normalize(search.dataset.renderedQuery ?? '')) {
      await updateSearch();
      if (!active()) return;
    }
    const version = ++expandVersion;
    for (const entry of matches) {
      if (open) expanded.add(entry.position);
      else expanded.delete(entry.position);
    }
    const cards = [...list.querySelectorAll('details')];
    for (let offset = 0; offset < cards.length; offset += 24) {
      if (!active() || version !== expandVersion) return;
      for (const card of cards.slice(offset, offset + 24)) {
        if (open) populateOthers(card);
        card.open = open;
      }
      await yieldTask();
    }
  }

  function updateSearch() {
    clearTimeout(searchTimer);
    search.dataset.renderedQuery = search.value;
    return renderList();
  }

  async function jumpToQuestion() {
    const position = number.valueAsNumber;
    if (!Number.isInteger(position) || position < 1 || position > entries.length) {
      status.textContent = `Введите номер от 1 до ${entries.length}.`;
      number.focus();
      return;
    }
    search.value = '';
    if (!(await updateSearch())) return;
    const card = list.querySelector(`[data-question-number="${position}"]`);
    card.scrollIntoView({block:'start', behavior:'auto'});
    card.querySelector('summary').focus({preventScroll:true});
  }

  async function load() {
    const body = dialog.querySelector('.dialog-body');
    body.innerHTML = '<p role="status">Загружаем вопросы…</p>';
    try {
      const quiz = await loadQuiz();
      if (!active()) return;
      entries = quiz.questions.map((question, index) => ({
        question, position:index + 1, search:normalize(question.text),
        correct:question.options.find(option => option.id === question.correctOptionId),
      }));
      body.innerHTML = `<div class="question-browser-toolbar"><div class="question-browser-info"><b>${h(quiz.title || title)}</b><span class="muted small">${entries.length} вопросов${selection?.mode==='random'?' · случайные вопросы выберутся при запуске':''}</span></div><div class="question-browser-controls"><label class="question-browser-search"><span class="sr-only">Поиск по тексту вопроса</span><input class="input" id="question-browser-search" type="search" placeholder="Поиск по тексту вопроса"></label><div class="question-browser-jump"><label class="sr-only" for="question-browser-number">Номер вопроса</label><input class="input" id="question-browser-number" type="number" inputmode="numeric" min="1" max="${entries.length}" step="1" placeholder="№"><button type="button" class="button compact" data-browser-action="jump">Перейти</button></div></div><div class="between wrap"><span class="small muted" id="question-browser-count" role="status"></span><div class="row wrap"><button type="button" class="button compact" data-browser-action="expand">Раскрыть все</button><button type="button" class="button compact" data-browser-action="collapse">Свернуть все</button></div></div><div class="bad-text small" id="question-browser-error" role="status"></div></div><div class="question-browser-list" tabindex="0" aria-label="Все вопросы теста"></div>`;
      list = body.querySelector('.question-browser-list');
      search = body.querySelector('#question-browser-search');
      number = body.querySelector('#question-browser-number');
      count = body.querySelector('#question-browser-count');
      status = body.querySelector('#question-browser-error');
      await updateSearch();
    } catch (error) {
      if (!active()) return;
      body.innerHTML = `<div class="notice error" role="alert">${h(error.message || 'Не удалось загрузить вопросы.')} <button type="button" class="button compact" data-browser-action="retry">Повторить</button></div>`;
    }
  }

  dialog.addEventListener('input', event => {
    if (event.target !== search) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(updateSearch, 120);
  }, {signal:controller.signal});
  dialog.addEventListener('keydown', event => {
    if (event.target === number && event.key === 'Enter') {
      event.preventDefault();
      jumpToQuestion();
    }
  }, {signal:controller.signal});
  dialog.addEventListener('click', event => {
    const button = event.target.closest('[data-browser-action]');
    if (!button || !active()) return;
    if (button.dataset.browserAction === 'retry') load();
    if (button.dataset.browserAction === 'jump') jumpToQuestion();
    if (button.dataset.browserAction === 'expand') expandAll(true);
    if (button.dataset.browserAction === 'collapse') expandAll(false);
  }, {signal:controller.signal});
  dialog.addEventListener('toggle', event => {
    const card = event.target;
    if (!card.matches('.question-browser-card')) return;
    const position = Number(card.dataset.questionNumber);
    if (card.open) {
      expanded.add(position);
      populateOthers(card);
    } else expanded.delete(position);
  }, {capture:true, signal:controller.signal});
  await load();
}
