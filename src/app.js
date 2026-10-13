import { rangeIds, moveSelectedQuestions, selectedNumbers } from './question-selection.js';
import { CONFIG } from './config.js';
import { uid, clone, escapeHTML as h, normalize, newQuiz, newQuestion, questionErrors, quizErrors, parseQuestionBlock, parseQuestionBatch, copyQuestion, mergeQuestions, prepareQuestions, allowsQuestionRange, normalizeQuestionRange, makeResult, publishedQuiz, draftFromPublic, formatDuration } from './core.js';
import { db, requestPersistentStorage } from './storage.js';
import { GitHub, loadPublicCatalog } from './github.js';
import { iconHTML, normalizeIcon } from './icons.js';
import { openIconEditor } from './icon-editor.js';
import { hasRememberedToken, hasVaultSession, rememberToken, restoreToken, forgetToken } from './token-vault.js';
import { isCreatorUnlocked, isCreatorRoute, unlockCreator, lockCreator } from './creator.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
let github = new GitHub();
const state = {catalog:{schemaVersion:1,tests:[]}, remote:null, drafts:[], attempts:[], publicError:'', githubError:'', storageError:'', editor:null, selected:null, startSelection:null, route:'', attempt:null, result:null, busy:false, filter:'all', search:'', review:'all', saving:false, saveError:'', unsaved:false};
const selection={quizId:null,mode:false,ids:new Set(),anchor:null};
let bulkRange=null;
let restoreAttempted=false, connectionEpoch=0;
let saveTimer, saveQueue = Promise.resolve(), editVersion = 0, toastTimer, routeVersion = 0, pendingConnection, copyState, pasteState, batchState, confirmation, connecting=false;
const date = value => new Intl.DateTimeFormat('ru', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const link = path => `#${path}`;
const btn = (text, action, cls='', attrs='') => `<button class="button ${cls}" data-action="${action}" ${attrs}>${text}</button>`;
const routeLink = (text, route, cls='') => `<a class="button ${cls}" href="${h(link(route))}">${text}</a>`;
const empty = (title, text, action='') => `<section class="card empty"><div class="empty-icon" aria-hidden="true">▤</div><h2>${title}</h2><p>${text}</p>${action}</section>`;
const notice = (text, type='') => `<div class="notice ${type}">${text}</div>`;
const currentQuestion = () => state.editor?.questions.find(q => q.id === state.selected);
const publicTests = () => (state.remote ?? state.catalog).tests;

function toast(text) {
  clearTimeout(toastTimer);
  document.querySelector('#toast').textContent = text;
  toastTimer = setTimeout(() => document.querySelector('#toast').textContent = '', 6500);
}
function errorMessage(error) { return error instanceof Error ? error.message : 'Не удалось выполнить действие. Повторите попытку.'; }
function themeButton() {return `<button class="icon-btn" data-action="theme" aria-label="${document.documentElement.dataset.theme==='dark'?'Светлая':'Тёмная'} тема" title="Переключить тему">${document.documentElement.dataset.theme==='dark'?'☀':'☾'}</button>`;}
function header(active='catalog', quiz=false) {
  return `<header class="header"><a class="brand" href="#/catalog"><img src="./assets/logo.svg" alt=""><span>Prosto Test</span></a>${quiz ? `<span class="muted small crumb">${iconHTML(state.attempt?.quiz.icon,'small')}${h(state.attempt?.quiz.title ?? 'Прохождение теста')}</span>` : `<nav class="nav" aria-label="Основная навигация"><a class="${active==='catalog'?'active':''}" href="#/catalog">Все тесты</a><a class="${active==='history'?'active':''}" href="#/history">История</a>${active==='admin'?'<a class="active" href="#/admin">Мои тесты</a>':''}</nav>`}<div class="header-end">${quiz?'':active==='admin'?btn(github.connected?'GitHub подключён':'Подключить GitHub',github.connected?'account':'connect','subtle editor-only')+btn('Выйти','creator-logout','subtle editor-only'):routeLink('Для создателя','/admin','subtle')}${themeButton()}</div></header>`;
}
function setContent(content, active='catalog', quiz=false) {
  app.innerHTML = header(active,quiz)+(active==='admin'&&state.githubError?notice(h(state.githubError),'error'):'')+content;
  document.title=(document.querySelector('main h1')?.textContent || (active==='admin'?'Конструктор':'Prosto Test'))+' · Prosto Test';
}
function creatorLoginPage() {
  setContent(`<main id="main" class="page narrow"><section class="card creator-login"><div class="eyebrow">Для создателя</div><h1>Вход в конструктор</h1><p class="muted">Введите пароль. Вход сохранится до закрытия этой вкладки.</p><form id="creator-login-form"><label class="field" for="creator-password">Пароль</label><input class="input" id="creator-password" name="creator-password" type="password" autocomplete="current-password" required><div id="creator-login-error" class="bad-text small mt-sm" role="alert"></div><button class="button primary full mt" type="submit">Войти</button></form>${routeLink('К тестам','/catalog','full mt-sm')}</section></main>`,'creator-login');
  document.querySelector('#creator-password').focus({preventScroll:true});
}
async function submitCreatorLogin(form) {
  const field=form.querySelector('#creator-password'),button=form.querySelector('[type=submit]'),box=form.querySelector('#creator-login-error');
  const password=field.value,version=routeVersion;field.value='';button.disabled=true;box.textContent='';
  try {
    if(await unlockCreator(password)){restoreAttempted=false;if(version===routeVersion)await route();}
    else {box.textContent='Неверный пароль. Попробуйте ещё раз.';field.focus();}
  } catch {box.textContent='Не удалось проверить пароль. Обновите страницу и повторите попытку.';}
  finally {if(button.isConnected)button.disabled=false;}
}
function storageNotice() {return state.storageError?notice(h(state.storageError),'error'):'';}

function catalogCards() {
  const tests = state.catalog.tests.filter(q => normalize(q.title).includes(normalize(state.search)));
  if (!state.catalog.tests.length) return empty('Пока нет опубликованных тестов','Когда создатель опубликует первый тест, он появится здесь.');
  if (!tests.length) return empty('Ничего не найдено','Попробуйте другое название.');
  return `<div class="tests-grid">${tests.map(q=>`<article class="card test-card"><div class="between">${iconHTML(q.icon)}${q.status==='closed'?'<span class="pill bad">Закрыт</span>':''}</div><h3>${h(q.title)}</h3>${q.description?`<p>${h(q.description)}</p>`:''}<div class="card-meta">${q.questions.length} вопросов${q.settings.questionCount!==null?` · в попытке ${q.settings.questionCount}`:''}</div><div class="actions">${q.status==='closed'?'<button class="button full" disabled>Тест закрыт</button>':routeLink('Начать тест',`/test/${q.id}`,'primary full')}</div></article>`).join('')}</div>`;
}
function catalogPage() {
  setContent(`<main id="main" class="page"><div class="between page-head"><div><div class="eyebrow">Каталог</div><h1>Доступные тесты</h1><p class="muted">Выберите тест и проверьте свои знания.</p></div><label class="search"><span class="sr-only">Поиск по названию теста</span><input class="input" name="catalog-search" placeholder="Поиск по названию теста" value="${h(state.search)}"></label></div>${state.publicError?notice(`${h(state.publicError)} ${btn('Повторить','refresh-public','compact')}`,'error'):''}<div id="catalog-list">${state.publicError?'':catalogCards()}</div></main>`);
}
function allAdminTests() {
  const map = new Map(publicTests().map(q => [q.id,{...q,local:false}]));
  for (const draft of state.drafts) {
    const remote=publicTests().find(q=>q.id===draft.id);
    map.set(draft.id,{...draft,status:remote?.status??draft.status,local:true,remote});
  }
  return [...map.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
function adminCards() {
  const all = allAdminTests();
  const quizzes = all.filter(q=>state.filter==='all'||(state.filter==='draft'?q.dirty||q.status==='draft':q.status===state.filter));
  if (!all.length) return empty('Создайте свой первый тест','Начните с названия и добавляйте вопросы вручную или одним текстовым блоком.',btn('＋ Создать тест','new','primary large'));
  if (!quizzes.length) return empty('Здесь пока пусто','Тестов с таким статусом нет.');
  return `<div class="tests-grid">${quizzes.map(q=>`<article class="card test-card"><div class="between">${iconHTML(q.icon)}<span class="pill ${q.status==='draft'?'warn':q.status==='closed'?'bad':'good'}">${q.status==='draft'?'Черновик':q.status==='closed'?'Закрыт':'Опубликован'}</span>${q.dirty&&q.baseRevision?'<span class="pill warn">Есть правки</span>':''}</div><h3>${h(q.title||'Без названия')}</h3><div class="card-meta">${q.questions.length} вопросов · ${h(date(q.updatedAt))}</div><div class="actions">${btn(q.status==='draft'?'Продолжить':'Редактировать','edit','primary',`data-id="${h(q.id)}"`)}${btn('Предпросмотр','preview-card','',`data-id="${h(q.id)}"`)}</div><div class="row wrap">${q.status!=='draft'?btn('Ссылка','share','link',`data-id="${h(q.id)}"`)+btn(q.status==='closed'?'Открыть':'Закрыть','toggle-status','link',`data-id="${h(q.id)}" data-remote`):''}${btn('Удалить','delete','link',`data-id="${h(q.id)}"`)}</div></article>`).join('')}</div>`;
}
function adminPage() {
  setContent(`<main id="main" class="page"><div class="between page-head"><div><div class="eyebrow">Конструктор</div><h1>Мои тесты</h1><p class="muted">Черновики, опубликованные тесты и управление ссылками.</p></div><div class="row wrap">${btn('Обновить','refresh-admin')}${btn('＋ Создать тест','new','primary large')}</div></div>${storageNotice()}<div class="notice mb">Черновики сохраняются на этом компьютере. Для публикации и изменения общедоступных тестов подключите GitHub владельца ${h(CONFIG.owner)}.</div><div class="tabs" aria-label="Фильтр тестов">${[['all','Все'],['draft','Черновики и правки'],['published','Опубликованные'],['closed','Закрытые']].map(([id,title])=>`<button data-action="filter" data-filter="${id}" class="${state.filter===id?'active':''}">${title}</button>`).join('')}</div><div id="admin-list">${adminCards()}</div></main>`,'admin');
}
function syncSelection() {
  const quiz=state.editor;
  if(selection.quizId!==quiz.id){selection.quizId=quiz.id;selection.mode=false;selection.ids.clear();selection.anchor=null;}
  const existing=new Set(quiz.questions.map(q=>q.id));
  selection.ids=new Set([...selection.ids].filter(id=>existing.has(id)));
  if(!existing.has(selection.anchor))selection.anchor=null;
}
function questionList() {
  return state.editor.questions.map((q,i)=>`<div class="q-row ${selection.ids.has(q.id)?'checked':''}"><input type="checkbox" data-action="toggle-question" data-id="${h(q.id)}" ${selection.ids.has(q.id)?'checked':''} aria-label="Выделить вопрос ${i+1}"><button class="q-item ${q.id===state.selected?'active':''} ${questionErrors(q).length?'invalid':''}" data-action="select-question" data-id="${h(q.id)}"><b>${i+1}</b><span>${h(q.text||'Новый вопрос')}</span></button>${selection.mode?btn('✎','open-question','q-edit',`data-id="${h(q.id)}" aria-label="Редактировать вопрос ${i+1}" title="Редактировать вопрос"`):''}</div>`).join('');
}
function selectionTools() {
  const count=selection.ids.size,total=state.editor.questions.length;
  return `<div class="selection-tools">${btn(selection.mode?'Завершить выделение':'Выделить несколько','selection-mode','compact full',`aria-pressed="${selection.mode}" ${!total&&!selection.mode?'disabled':''}`)}${selection.mode?`<div class="selection-count" role="status">Выбрано: ${count} из ${total}</div><div class="selection-buttons">${btn('Все','selection-all','compact',total?'':'disabled')}${btn('Снять','selection-clear','compact',count?'':'disabled')}${btn('Диапазон…','selection-range','compact',total?'':'disabled')}</div><p class="muted small">Клик — выбрать, Shift + клик — диапазон. ✎ — редактировать.</p><div class="selection-buttons">${btn('↑ Вверх','selection-up','compact',!count||selection.ids.has(state.editor.questions[0]?.id)?'disabled':'')}${btn('↓ Вниз','selection-down','compact',!count||selection.ids.has(state.editor.questions.at(-1)?.id)?'disabled':'')}</div>${btn('Переместить перед №…','selection-move','compact full',count&&count<total?'':'disabled')}${btn('Удалить выбранные','selection-delete','compact danger full',count?'':'disabled')}` : ''}</div>`;
}
function toggleSelectedQuestion(id,shift=false) {
  syncSelection();selection.mode=true;
  const list=state.editor.questions,anchor=list.findIndex(q=>q.id===selection.anchor),index=list.findIndex(q=>q.id===id);
  if(index<0)return;
  if(shift&&anchor>=0)rangeIds(list,Math.min(anchor,index)+1,Math.max(anchor,index)+1).forEach(id=>selection.ids.add(id));
  else {if(selection.ids.has(id))selection.ids.delete(id);else selection.ids.add(id);selection.anchor=id;}
  editorPage();
}
function openSelectionRange() {
  const total=state.editor.questions.length;if(!total)return;
  const indices=state.editor.questions.flatMap((q,i)=>selection.ids.has(q.id)?[i+1]:[]);
  bulkRange={from:indices[0]??1,to:indices.at(-1)??total,total};
  showDialog('Выделить диапазон вопросов',`<p class="muted">Номера соответствуют текущему порядку в конструкторе. Диапазон заменит текущее выделение.</p><div class="range-slider" id="bulk-range-slider"><div class="range-track"><div class="range-fill"></div></div><input type="range" data-bulk-bound="from" min="1" max="${total}" value="${bulkRange.from}" aria-label="Начало выделения" ${total===1?'disabled':''}><input type="range" data-bulk-bound="to" min="1" max="${total}" value="${bulkRange.to}" aria-label="Конец выделения" ${total===1?'disabled':''}></div><div class="range-fields"><label class="field">От<input class="input" type="number" data-bulk-bound="from" min="1" max="${total}" step="1" value="${bulkRange.from}"></label><span class="muted">—</span><label class="field">До включительно<input class="input" type="number" data-bulk-bound="to" min="1" max="${total}" step="1" value="${bulkRange.to}"></label></div><p id="bulk-range-count" class="muted small mt"></p><div id="bulk-range-error" class="bad-text small" role="alert"></div>`,btn('Отмена','close-dialog')+btn('Выделить','selection-apply-range','primary','id="bulk-range-apply"'));
  updateSelectionRange();
}
function updateSelectionRange(input=null,commit=false) {
  const r=bulkRange;
  if(input) {
    const bound=input.dataset.bulkBound,min=bound==='to'?r.from:1,max=bound==='from'?r.to:r.total;
    let value=input.valueAsNumber;
    if(commit||input.type==='range')value=Number.isFinite(value)?Math.max(min,Math.min(max,Math.trunc(value))):r[bound];
    else if(!Number.isInteger(value)||value<min||value>max){document.querySelector('#bulk-range-error').textContent=`Введите целое число от ${min} до ${max}.`;document.querySelector('#bulk-range-apply').disabled=true;return;}
    r[bound]=value;
  }
  for(const field of dialog.querySelectorAll('[data-bulk-bound]')) {
    if(field!==input||commit||input?.type==='range')field.value=r[field.dataset.bulkBound];
    if(field.type==='number'){field.min=field.dataset.bulkBound==='to'?r.from:1;field.max=field.dataset.bulkBound==='from'?r.to:r.total;}
  }
  const slider=document.querySelector('#bulk-range-slider');slider.style.setProperty('--range-start',`${(r.from-1)/Math.max(1,r.total-1)*100}%`);slider.style.setProperty('--range-end',`${(r.to-1)/Math.max(1,r.total-1)*100}%`);
  document.querySelector('#bulk-range-count').textContent=`Будет выделено: ${r.to-r.from+1} вопросов (№${r.from}–${r.to}).`;
  document.querySelector('#bulk-range-error').textContent='';document.querySelector('#bulk-range-apply').disabled=false;
}
function applyQuestionOrder(questions) {
  if(questions.every((q,i)=>q===state.editor.questions[i]))return;
  state.editor.questions=questions;markDirty();editorPage();
}
function optionRows(question) {
  return question.options.map((o,i)=>`<div class="option-row ${o.id===question.correctOptionId?'correct':''}"><label class="radio-wrap" title="Правильный вариант"><input type="radio" name="correct-option" value="${h(o.id)}" ${o.id===question.correctOptionId?'checked':''} aria-label="Вариант ${i+1} правильный"><span class="option-number">${i+1}</span></label><textarea rows="1" data-option="${h(o.id)}" aria-label="Текст варианта ${i+1}" placeholder="Вариант ответа">${h(o.text)}</textarea><button class="icon-btn" data-action="remove-option" data-id="${h(o.id)}" ${question.options.length<=2?'disabled':''} aria-label="Удалить вариант ${i+1}" title="Удалить вариант">×</button></div>`).join('');
}
function editorPage() {
  syncSelection();
  const quiz = state.editor, question = currentQuestion(), count = quiz.questions.length;
  const oldList = document.querySelector('#question-list');
  const sameQuiz = oldList?.dataset.quizId === quiz.id;
  const listScroll = sameQuiz ? oldList.scrollTop : 0;
  const pageScroll = sameQuiz ? {x:window.scrollX,y:window.scrollY} : null;
  const focused = sameQuiz && oldList.contains(document.activeElement) ? {action:document.activeElement.dataset.action,id:document.activeElement.dataset.id} : null;
  setContent(`<main id="main"><div class="desktop-hint card empty"><h2>Откройте конструктор на компьютере</h2><p>Проходить тесты можно с телефона. Для создания вопросов нужен широкий экран.</p>${routeLink('К тестам','/catalog','primary')}</div><div class="editor-top between wrap"><div><div class="eyebrow">${quiz.baseRevision?'Редактирование теста':'Черновик'}</div><p class="editor-title">${h(quiz.title||'Новый тест')}</p><span id="save-status" class="saved">${state.unsaved?'Сохраняем…':'✓ Сохранено в этом браузере'}</span></div><div class="editor-actions">${routeLink('Мои тесты','/admin')}${btn('Предпросмотр','preview')}${btn(quiz.baseRevision?'Опубликовать правки':'Опубликовать','publish','primary','data-remote')}</div></div><div class="editor-layout"><aside class="card editor-list"><div class="between"><h3>Вопросы</h3><span class="pill" id="question-count">${count}</span></div>${selectionTools()}<div id="question-list" class="question-list" data-quiz-id="${h(quiz.id)}">${questionList()}</div><div class="stack">${btn('＋ Новый вопрос','add-question','full')}${btn('Вставить полный вопрос','paste','subtle full')}${btn('Вставить блок вопросов','paste-batch','subtle full')}${btn('Из другого теста','copy','full')}</div></aside><section class="card editor-main">${question?`<div class="between wrap"><div><div class="eyebrow">Один правильный ответ</div><h2 class="mt-sm">Вопрос ${quiz.questions.indexOf(question)+1}</h2></div><div class="row">${btn('↑','move-up','compact',`aria-label="Переместить вопрос вверх" ${quiz.questions.indexOf(question)===0?'disabled':''}`)}${btn('↓','move-down','compact',`aria-label="Переместить вопрос вниз" ${quiz.questions.indexOf(question)===count-1?'disabled':''}`)}${btn('Удалить вопрос','remove-question','compact danger')}</div></div><label class="field mt" for="question-text">Текст вопроса</label><textarea id="question-text" name="question-text" rows="3" placeholder="Введите вопрос">${h(question.text)}</textarea><div class="between mt"><h3>Варианты ответа</h3><span class="muted small">Минимум два</span></div><div id="option-rows">${optionRows(question)}</div><div class="row wrap mt">${btn('＋ Добавить вариант','add-option')}${btn('Заменить из текста','paste-replace','subtle')}</div><p class="muted small mt">Кружком слева отметьте правильный вариант. При добавлении нового вопроса выбран первый.</p>`:empty('Добавьте первый вопрос','Введите его вручную или вставьте вопрос и все ответы одним блоком.',btn('＋ Новый вопрос','add-question','primary'))}</section><aside class="card editor-settings"><h3>Настройки теста</h3><div class="setting"><div class="row">${iconHTML(quiz.icon)}<div><b class="small">Иконка теста</b><div>${btn("Изменить","edit-icon","link")}</div></div></div></div><div class="setting"><label class="field" for="quiz-title">Название</label><input class="input" id="quiz-title" name="quiz-title" value="${h(quiz.title)}" placeholder="Название теста"><label class="field mt" for="quiz-description">Описание · необязательно</label><textarea id="quiz-description" name="quiz-description" rows="2" placeholder="Кратко о тесте">${h(quiz.description)}</textarea></div><div class="setting"><div class="setting-title">Вопросов в попытке</div><label class="check"><input type="radio" name="count-mode" value="all" ${quiz.settings.questionCount===null?'checked':''}>Все (${count})</label><label class="check mt-sm"><input type="radio" name="count-mode" value="part" ${quiz.settings.questionCount!==null?'checked':''} ${count<2?'disabled':''}>Случайная часть</label><div id="count-controls" class="${quiz.settings.questionCount===null?'hidden':''}"><input type="range" name="question-count-range" min="1" max="${Math.max(1,count-1)}" value="${quiz.settings.questionCount??Math.max(1,count-1)}" aria-label="Количество вопросов"><input class="input" type="number" name="question-count-number" min="1" max="${Math.max(1,count-1)}" value="${quiz.settings.questionCount??Math.max(1,count-1)}" aria-label="Точное количество вопросов"></div><label class="check mt"><input type="checkbox" name="allow-question-range" ${allowsQuestionRange(quiz)?'checked':''} ${quiz.settings.questionCount!==null?'disabled':''}>Разрешить выбор диапазона участнику</label><p>${quiz.settings.questionCount!==null?'Выбор диапазона недоступен при случайной части. Выберите «Все», чтобы включить его.':'Участник сможет выбрать номера вопросов перед началом. Настройка применяется после публикации.'}</p></div><div class="setting"><label class="check"><input type="checkbox" name="shuffle-questions" ${allowsQuestionRange(quiz)||quiz.settings.shuffleQuestions?'checked':''} ${allowsQuestionRange(quiz)?'disabled':''}>Перемешивать вопросы</label><label class="check mt"><input type="checkbox" name="shuffle-options" ${quiz.settings.shuffleOptions?'checked':''}>Перемешивать ответы</label><p>${allowsQuestionRange(quiz)?'Выбранный участником диапазон всегда перемешивается при прохождении.':'Настройки действуют при прохождении.'} Порядок в конструкторе сохраняется.</p></div><div class="setting">${btn('Создать отдельную копию','duplicate','full')}<p>Полезно для нового теста или сохранения правок при конфликте публикации.</p></div></aside></div></main>`,'admin');
  document.querySelector('#question-list').scrollTop = listScroll;
  if (focused) [...document.querySelectorAll('#question-list [data-action]')].find(el=>el.dataset.action===focused.action&&el.dataset.id===focused.id)?.focus({preventScroll:true});
  if (pageScroll) window.scrollTo(pageScroll.x,pageScroll.y);
  updateSaveStatus();
}

function findQuiz(id) { return state.catalog.tests.find(q=>q.id===id); }
function startPage(quiz, preview=false) {
  if (!quiz) return unavailable('Тест не найден','Возможно, создатель удалил его или ссылка неполная.');
  if (!preview && quiz.status==='closed') return unavailable('Тест закрыт','Создатель остановил доступ. Можно вернуться в каталог и выбрать другой тест.');
  const total = quiz.settings.questionCount ?? quiz.questions.length;
  state.startSelection = allowsQuestionRange(quiz) && quiz.questions.length ? {id:quiz.id,total:quiz.questions.length,from:1,to:quiz.questions.length} : null;
  setContent(`<main id="main" class="page narrow">${preview?notice('Пробное прохождение. Результат не попадёт в историю.','warning'):''}<section class="card start-card">${iconHTML(quiz.icon,"large")}<div class="eyebrow">${preview?'Предпросмотр':'Готовы начать?'}</div><h1>${h(quiz.title)}</h1>${quiz.description?`<p class="muted pre">${h(quiz.description)}</p>`:''}<div class="facts"><div class="fact"><b id="start-question-count">${total} вопросов</b><small id="start-question-note">${total<quiz.questions.length?`случайно из ${quiz.questions.length}`:'все вопросы теста'}</small></div><div class="fact"><b>Без лимита</b><small>время только измеряется</small></div><div class="fact"><b>Один ответ</b><small>на каждый вопрос</small></div></div>${state.startSelection?questionRangeControls():''}<p class="muted small">После верного ответа переход произойдёт через 0,7 секунды. После ошибки вы увидите правильный вариант и перейдёте дальше сами. Обновление страницы начнёт попытку заново.</p>${btn('Начать прохождение',preview?'start-preview':'start-test','primary large',`id="start-attempt" data-id="${h(quiz.id)}"`)}${preview?`<div class="mt">${routeLink('Вернуться в конструктор',`/edit/${quiz.id}`)}</div>`:''}</section></main>`);
  if (state.startSelection) syncQuestionRange();
}

function questionRangeControls() {
  const r=state.startSelection;
  return `<section class="question-range" aria-labelledby="range-title"><div class="between wrap"><h2 id="range-title">Какие вопросы пройти?</h2>${btn('Все вопросы','range-all','compact')}</div><p class="muted small">Номера соответствуют порядку вопросов в конструкторе. Выбранный диапазон перемешается при прохождении.</p><div class="range-slider"><div class="range-track"><div class="range-fill"></div></div><input type="range" data-range-bound="from" min="1" max="${r.total}" step="1" value="${r.from}" aria-label="Первый вопрос диапазона" ${r.total===1?'disabled':''}><input type="range" data-range-bound="to" min="1" max="${r.total}" step="1" value="${r.to}" aria-label="Последний вопрос диапазона" ${r.total===1?'disabled':''}></div><div class="range-fields"><label class="field">От<input class="input" type="number" data-range-bound="from" min="1" max="${r.total}" step="1" value="${r.from}" required></label><span class="muted">—</span><label class="field">До включительно<input class="input" type="number" data-range-bound="to" min="1" max="${r.total}" step="1" value="${r.to}" required></label></div><div id="range-error" class="bad-text small" role="status"></div></section>`;
}
function syncQuestionRange(activeInput=null) {
  const r=state.startSelection;
  for (const input of document.querySelectorAll('[data-range-bound]')) {
    const bound=input.dataset.rangeBound;
    if (input!==activeInput) input.value=r[bound];
    if (input.type==='number') {input.min=bound==='to'?r.from:1;input.max=bound==='from'?r.to:r.total;}
    else input.setAttribute('aria-valuetext',`Вопрос №${r[bound]}`);
  }
  const slider=document.querySelector('.range-slider');
  slider.style.setProperty('--range-start',`${(r.from-1)/Math.max(1,r.total-1)*100}%`);
  slider.style.setProperty('--range-end',`${(r.to-1)/Math.max(1,r.total-1)*100}%`);
  document.querySelector('#start-question-count').textContent=`${r.to-r.from+1} вопросов`;
  document.querySelector('#start-question-note').textContent=`№${r.from}–${r.to} из ${r.total}`;
  document.querySelector('#range-error').textContent='';
  document.querySelector('#start-attempt').disabled=false;
}
function updateQuestionRange(input,commit=false) {
  const r=state.startSelection;if(!r)return;
  const bound=input.dataset.rangeBound,min=bound==='to'?r.from:1,max=bound==='from'?r.to:r.total;
  let value=input.valueAsNumber;
  if(commit||input.type==='range') {
    value=Number.isFinite(value)?Math.max(min,Math.min(max,Math.trunc(value))):r[bound];
  } else if(!Number.isInteger(value)||value<min||value>max) {
    document.querySelector('#range-error').textContent=`Введите целое число от ${min} до ${max}.`;
    document.querySelector('#start-attempt').disabled=true;return;
  }
  r[bound]=value;syncQuestionRange(commit||input.type==='range'?null:input);
}
function rangeLabel(result) {return result.questionRange?`Вопросы №${result.questionRange.from}–${result.questionRange.to} из ${result.questionRange.poolSize}`:'';}
function unavailable(title,text) {setContent(`<main id="main" class="page narrow">${empty(h(title),h(text),routeLink('Все тесты','/catalog','primary'))}</main>`);}

function playPage() {
  const a=state.attempt;
  if (!a) return;
  const q=a.questions[a.index], selected=a.answers[a.index], answered=selected!==undefined, correct=selected===q.correctOptionId;
  setContent(`<main id="main" class="quiz-page">${a.preview?notice('Предпросмотр · попытка не сохраняется','warning'):''}${a.blocked?notice(`${h(a.blocked)} ${btn('Проверить соединение','retry-status','compact')}`,'error'):''}<div class="quiz-top mt-sm"><div><div class="eyebrow">${h(a.quiz.title)}</div><h1>Вопрос ${a.index+1} из ${a.questions.length}</h1>${a.questionRange?`<span class="muted small">№${q.originalIndex} в общем списке · диапазон ${a.questionRange.from}–${a.questionRange.to}</span>`:''}</div><span class="pill">◷ <span id="elapsed">${formatDuration(Date.now()-a.startedAt)}</span></span></div><progress class="progress" max="${a.questions.length}" value="${a.index}" aria-label="Прогресс"></progress><section class="card quiz-card"><h2>${h(q.text)}</h2>${q.options.map((o,i)=>`<button class="answer ${answered&&o.id===q.correctOptionId?'good':''} ${answered&&o.id===selected&&!correct?'bad':''}" data-action="answer" data-id="${h(o.id)}" ${answered||a.checking||a.blocked?'disabled':''}><span class="letter">${i<26?String.fromCharCode(65+i):i+1}</span><span class="answer-text">${h(o.text)}</span>${answered&&o.id===q.correctOptionId?'<span class="answer-tag">✓ Правильный ответ</span>':''}${answered&&o.id===selected&&!correct?'<span class="answer-tag">✕ Ваш ответ</span>':''}</button>`).join('')}<div class="feedback" aria-live="polite">${answered?(correct?'<span class="good-text">✓ Верно! Переходим дальше…</span>':`<span class="bad-text">Неверно. Правильный ответ выделен зелёным.</span>${btn(a.index===a.questions.length-1?'Посмотреть результат':'Следующий вопрос →','next-question','primary large')}`):`<span class="muted small">${a.checking?'Проверяем доступность теста…':'Выберите один вариант ответа'}</span>`}</div></section></main>`,'catalog',true);
}

function reviewCards(result) {
  const items=result.questions.map((q,i)=>({...q,number:i+1})).filter(q=>state.review==='all'||!q.correct);
  if (!items.length) return empty('Все ответы правильные','Вы прошли тест без ошибок.');
  return items.map(q=>`<article class="card review-card"><div class="between"><span class="eyebrow">Вопрос ${q.number}${result.questionRange?` · №${q.originalIndex} в общем списке`:''}</span><span class="pill ${q.correct?'good':'bad'}">${q.correct?'Верно':'Ошибка'}</span></div><h3>${h(q.text)}</h3><div class="review-options">${q.options.map(o=>`<div class="review-option ${o.id===q.correctOptionId?'good':''} ${o.id===q.selectedOptionId&&!q.correct?'bad':''}"><span class="pre grow">${h(o.text)}</span>${o.id===q.selectedOptionId?`<span class="pill ${q.correct?'good':'bad'}">Ваш ответ</span>`:''}${o.id===q.correctOptionId?'<span class="pill good">Правильный</span>':''}</div>`).join('')}</div></article>`).join('');
}
function resultPage(result, preview=false) {
  if (!result) return unavailable('Результат не найден','Он мог быть удалён вместе с данными браузера или сохранён на другом устройстве.');
  state.result=result;
  setContent(`<main id="main" class="page"><div class="eyebrow">${preview?'Пробная попытка':'Попытка завершена'}</div><h1>Результат теста</h1>${result.saveError?notice(h(result.saveError)+' Результат виден в этой вкладке, но не сохранён в историю.','error'):''}<div class="result-layout mt"><section><div class="card result-hero"><div class="between wrap"><div><div class="row">${iconHTML(result.icon)}<h2 class="no-margin">${h(result.title)}</h2></div>${result.questionRange?`<p class="muted small">${rangeLabel(result)}</p>`:''}<span class="muted small">${h(date(result.finishedAt))}</span></div><div class="score">${result.percent}%</div></div><div class="facts"><div class="fact"><b>${result.correct} из ${result.total}</b><small>правильных ответов</small></div><div class="fact"><b>${result.wrong}</b><small>неправильных ответов</small></div><div class="fact"><b>${formatDuration(result.durationMs)}</b><small>время прохождения</small></div></div></div><div class="between wrap mt"><h2>Разбор ответов</h2><div class="tabs"><button class="${state.review==='all'?'active':''}" data-action="review-filter" data-filter="all">Все · ${result.total}</button><button class="${state.review==='wrong'?'active':''}" data-action="review-filter" data-filter="wrong">Ошибки · ${result.wrong}</button></div></div><div id="review-list">${reviewCards(result)}</div></section><aside class="card result-aside"><h3>Продолжить обучение</h3><p class="muted small">Разберите ошибки или попробуйте пройти тест ещё раз.</p>${preview?routeLink('В конструктор',`/edit/${result.quizId}`,'primary full'):routeLink('Пройти снова',`/test/${result.quizId}`,'primary full')}${preview?'':routeLink('История попыток','/history','full mt-sm')}</aside></div></main>`,'history');
}
function historyPage() {
  const attempts=[...state.attempts].sort((a,b)=>b.finishedAt-a.finishedAt);
  setContent(`<main id="main" class="page"><div class="eyebrow">На этом устройстве</div><h1>История попыток</h1><p class="muted">Здесь сохраняются ваши завершённые тесты и подробный разбор ответов.</p>${storageNotice()}${attempts.length?`<div class="card table-wrap mt"><table class="history-table"><thead><tr><th>Тест</th><th>Дата</th><th>Результат</th><th>Время</th><th><span class="sr-only">Действие</span></th></tr></thead><tbody>${attempts.map(r=>`<tr><td><div class="row">${iconHTML(r.icon,"small")}<b>${h(r.title)}</b></div>${r.questionRange?`<div class="muted small mt-sm">${rangeLabel(r)}</div>`:''}</td><td>${h(date(r.finishedAt))}</td><td><span class="pill ${r.percent>=70?'good':'warn'}">${r.correct} из ${r.total} · ${r.percent}%</span></td><td>${formatDuration(r.durationMs)}</td><td>${routeLink('Посмотреть',`/result/${r.id}`)}</td></tr>`).join('')}</tbody></table></div>`:empty('История пока пуста','Пройдите любой доступный тест — результат появится здесь.',routeLink('Выбрать тест','/catalog','primary'))}<div class="notice mt">Закрытие браузера и перезагрузка компьютера не удаляют историю. Она хранится в этом браузере и профиле, без синхронизации с другими устройствами. Очистка данных сайта удалит её; в приватном режиме она исчезнет после закрытия окна.</div></main>`,'history');
}

function showDialog(title, body, actions='') {
  if (dialog.open) closeDialog();
  dialog.className='';
  dialog.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button class="icon-btn" data-action="close-dialog" aria-label="Закрыть окно">×</button></div><div class="dialog-body">${body}</div>${actions?`<div class="dialog-actions">${actions}</div>`:''}`;
  dialog.showModal();
}
function closeDialog() { dialog.close(); dialog.innerHTML=''; if (confirmation) {confirmation(false);confirmation=null;} }
dialog.addEventListener('cancel',event=>{if(connecting){event.preventDefault();return;}if(confirmation){confirmation(false);confirmation=null;}});
function ask(title,body,confirmText='Подтвердить',danger=false) {
  showDialog(h(title),`<p>${h(body)}</p>`,btn('Отмена','close-dialog')+btn(h(confirmText),'confirm',danger?'danger':'primary'));
  return new Promise(resolve=>confirmation=resolve);
}
function showErrors(errors) {showDialog('Проверьте тест',notice(`<ul>${errors.map(e=>`<li>${h(e)}</li>`).join('')}</ul>`,'error'),btn('Понятно','close-dialog','primary'));}

function connectDialog(after) {
  pendingConnection=after;restoreAttempted=true;connectionEpoch++;github.disconnect();
  showDialog('Подключение GitHub',`<p>Публиковать тесты может только аккаунт <b>${h(CONFIG.owner)}</b>.</p><ol class="login-steps"><li>В GitHub откройте <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">создание fine-grained personal access token</a>.</li><li>В Repository access выберите Only select repositories → <b>${h(CONFIG.repo)}</b>.</li><li>В Repository permissions задайте <b>Contents → Read and write</b>. Остальные права не нужны.</li><li>Выберите срок действия, создайте ключ и вставьте его ниже.</li></ol><form id="connect-form"><label class="field" for="github-token">Ключ доступа GitHub</label><input class="input" id="github-token" name="github-token" type="password" autocomplete="off" spellcheck="false" required placeholder="github_pat_…"><label class="check mt"><input type="checkbox" id="remember-github">Запомнить на этом компьютере</label><div id="vault-password-field" hidden><label class="field mt" for="vault-password">Пароль создателя для сохранения ключа</label><input class="input" id="vault-password" type="password" autocomplete="current-password"></div><p class="muted small">Ключ отправляется только в GitHub. С галочкой его зашифрованная копия сохранится в этом браузере и разблокируется при входе с паролем создателя. Без галочки подключение действует до обновления вкладки.</p><div id="connect-error">${state.githubError?notice(h(state.githubError),"error"):""}</div><div class="dialog-actions">${hasRememberedToken()?btn('Забыть сохранённый ключ','forget-token','danger'):''}${btn('Отмена','close-dialog')}<button class="button primary" type="submit">Подключить</button></div></form>`);
}
function accountDialog() {showDialog('GitHub подключён',`<p>Аккаунт: <b>${h(github.user)}</b></p><p class="muted">Репозиторий: ${h(CONFIG.owner)}/${h(CONFIG.repo)}.</p><p>${hasRememberedToken()?'Ключ сохранён в зашифрованном виде в этом браузере. После выхода из конструктора его разблокирует пароль создателя.':'Ключ действует только до обновления этой вкладки.'}</p>`,btn('Отключить до обновления','disconnect')+(hasRememberedToken()?btn('Забыть сохранённый ключ','forget-token','danger'):'')+btn('Готово','close-dialog','primary'));}

function updateConnectionView() {
  if(!isCreatorUnlocked())return;
  if(state.route==='/admin')adminPage();
  else if(state.route.startsWith('/edit/'))document.querySelector('.header').outerHTML=header('admin');
}
async function restoreGitHub() {
  if(restoreAttempted||github.connected||!isCreatorUnlocked()||!hasRememberedToken())return;
  restoreAttempted=true;const epoch=++connectionEpoch;
  const client=new GitHub();
  try {
    const token=await restoreToken();if(!token||epoch!==connectionEpoch||!isCreatorUnlocked())return;
    await client.connect(token);
    const remote=await client.readCatalog();
    if(epoch!==connectionEpoch||!isCreatorUnlocked()){client.disconnect();return;}
    github.disconnect();github=client;state.remote=remote.catalog;state.githubError='';updateConnectionView();
  }catch(error){
    client.disconnect();
    if(epoch===connectionEpoch&&isCreatorUnlocked()){state.githubError=errorMessage(error)+' Подключите GitHub заново.';updateConnectionView();toast(state.githubError);}
  }
}


function markDirty() {
  if (!state.editor) return;
  state.editor.dirty=true;state.editor.updatedAt=new Date().toISOString();state.unsaved=true;state.saveError='';editVersion++;
  updateSaveStatus();clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveDraft().catch(()=>{}),400);
}
function updateSaveStatus() {
  const el=document.querySelector('#save-status');
  if (!el)return;
  el.textContent=state.saveError?`Не сохранено: ${state.saveError}`:state.unsaved||state.saving?'Сохраняем…':'✓ Сохранено в этом браузере';
  el.classList.toggle('save-error',!!state.saveError);
}
async function saveDraft() {
  if (!state.editor || !state.unsaved) return saveQueue;
  clearTimeout(saveTimer);
  const draft=clone(state.editor), version=editVersion;
  state.saving=true;
  const write=saveQueue.catch(()=>{}).then(()=>db.put('drafts',draft));
  saveQueue=write;
  try {
    await write;
    const index=state.drafts.findIndex(q=>q.id===draft.id);
    if(index>=0)state.drafts[index]=draft;else state.drafts.push(draft);
    if(version===editVersion){state.unsaved=false;state.saveError='';}
  } catch(error) {state.saveError=errorMessage(error);throw error;}
  finally {state.saving=false;updateSaveStatus();}
}
async function flushDraft() {clearTimeout(saveTimer);if(state.unsaved)await saveDraft();await saveQueue;}
async function storeDraft(draft) {
  await db.put('drafts',draft);
  const index=state.drafts.findIndex(q=>q.id===draft.id);
  if(index<0)state.drafts.push(draft);else state.drafts[index]=clone(draft);
}
async function getDraft(id) {
  let draft=state.drafts.find(q=>q.id===id);
  const published=publicTests().find(q=>q.id===id);
  if(!draft){if(!published)return null;draft=draftFromPublic(published);await storeDraft(draft);}
  else if(!draft.dirty&&published&&draft.baseRevision!==published.revision){draft=draftFromPublic(published);await storeDraft(draft);}
  return clone(draft);
}
async function newDraft() {await flushDraft();const q=newQuiz();await storeDraft(q);await requestPersistentStorage();location.hash=link(`/edit/${q.id}`);}

function openPaste(replace=false) {
  pasteState={replace,parsed:null};
  showDialog(replace?'Заменить вопрос из текста':'Вставить полный вопрос',`<p class="muted small">Вставьте вопрос и ответы одним блоком. Каждый ответ должен начинаться с новой строки. Первый вариант станет правильным.</p><div class="preview-split"><div><label class="field" for="paste-text">Исходный текст</label><textarea id="paste-text" class="paste-input" placeholder="Вопрос&#10;A) Первый вариант&#10;B) Второй вариант"></textarea><label class="check mt-sm"><input id="strip-prefixes" type="checkbox" checked>Убирать номер вопроса и буквы вариантов ответа</label></div><div><label class="field">Предпросмотр</label><div class="parsed" id="paste-preview">Здесь появится вопрос после вставки текста.</div></div></div>`,btn('Отмена','close-dialog')+btn(replace?'Заменить вопрос':'Добавить вопрос','apply-paste','primary','id="apply-paste" disabled'));
}
function updatePaste() {
  const text=document.querySelector('#paste-text').value;
  try {
    const question=parseQuestionBlock(text,document.querySelector('#strip-prefixes').checked);pasteState.parsed=question;
    document.querySelector('#paste-preview').innerHTML=`<b class="pre">${h(question.text)}</b><ol>${question.options.map((o,i)=>`<li><span class="pre">${h(o.text)}</span>${i===0?'<br><span class="correct-label">✓ Правильный по умолчанию</span>':''}</li>`).join('')}</ol>`;
    document.querySelector('#apply-paste').disabled=false;
  } catch(error) {pasteState.parsed=null;document.querySelector('#paste-preview').textContent=text?errorMessage(error):'Здесь появится вопрос после вставки текста.';document.querySelector('#apply-paste').disabled=true;}
}
function openBatchPaste() {
  batchState=null;
  showDialog('Вставить блок вопросов',`<p class="muted small">Вставьте несколько пронумерованных вопросов с буквенными вариантами ответа. Они добавятся в конец теста. Первый ответ каждого вопроса станет правильным.</p><div class="preview-split"><div><label class="field" for="batch-text">Исходный текст</label><textarea id="batch-text" class="paste-input batch-input" placeholder="16. Первый вопрос&#10;A) Первый ответ&#10;B) Второй ответ&#10;&#10;17. Следующий вопрос&#10;A) Первый ответ&#10;B) Второй ответ"></textarea><label class="check mt-sm"><input id="batch-strip-prefixes" type="checkbox" checked>Убирать номер вопроса и буквы вариантов ответа</label></div><div><label class="field">Предпросмотр</label><div id="batch-summary" class="small muted mb">Вопросы ещё не добавлены.</div><div id="batch-preview" class="batch-preview">После вставки здесь появятся вопросы.</div></div></div>`,`<div id="batch-actions" class="row wrap">${btn('Отмена','close-dialog')}${btn('Добавить вопросы','apply-batch','primary','disabled')}</div>`);
  dialog.classList.add('batch-dialog');
}
function updateBatchPaste() {
  const text=document.querySelector('#batch-text').value;
  const parsed=parseQuestionBatch(text,document.querySelector('#batch-strip-prefixes').checked);
  batchState=parsed;
  const summary=document.querySelector('#batch-summary'),preview=document.querySelector('#batch-preview'),actions=document.querySelector('#batch-actions');
  if(!text.trim()) {batchState=null;summary.textContent='Вопросы ещё не добавлены.';preview.textContent='После вставки здесь появятся вопросы.';actions.innerHTML=btn('Отмена','close-dialog')+btn('Добавить вопросы','apply-batch','primary','disabled');return;}
  const duplicates=parsed.errors.length?0:mergeQuestions(state.editor.questions,parsed.questions,false,true).skipped;
  summary.innerHTML=parsed.errors.length?notice(`Добавление остановлено. Исправьте ошибки: ${parsed.errors.length}.`,'error'):`Распознано вопросов: <b>${parsed.questions.length}</b>. Добавятся в конец теста.${duplicates?notice(`Повторов по тексту: ${duplicates}. Выберите, пропустить их или добавить все.`,'warning'):''}`;
  const entryErrors=new Set(parsed.entries.flatMap(entry=>entry.errors));
  const leadingErrors=parsed.errors.filter(error=>!entryErrors.has(error));
  preview.innerHTML=(leadingErrors.length?notice(leadingErrors.map(h).join('<br>'),'error'):'')+parsed.entries.map((entry,index)=>`<details class="batch-question ${entry.errors.length?'invalid':''}" ${entry.errors.length||index===0?'open':''}><summary><b>Вопрос ${index+1}</b><span class="muted small">№${h(entry.sourceNumber)} в тексте · строка ${entry.line}</span></summary>${entry.errors.length?notice(entry.errors.map(h).join('<br>'),'error'):`<p class="pre">${h(entry.question.text)}</p><ol>${entry.question.options.map((o,i)=>`<li class="pre">${h(o.text)}${i===0?'<br><span class="good-text small">✓ Правильный по умолчанию</span>':''}</li>`).join('')}</ol>`}</details>`).join('');
  actions.innerHTML=btn('Отмена','close-dialog')+(parsed.errors.length?btn('Добавить вопросы','apply-batch','primary','disabled'):duplicates?btn('Пропустить повторы','apply-batch','',`data-duplicates="skip"`)+btn('Добавить все','apply-batch','primary',`data-duplicates="all"`):btn(`Добавить вопросы (${parsed.questions.length})`,'apply-batch','primary'));
}
function applyBatchPaste(includeDuplicates=false) {
  if(!batchState?.questions.length||batchState.errors.length)return;
  const merged=mergeQuestions(state.editor.questions,batchState.questions,includeDuplicates,true);
  batchState=null;closeDialog();
  if(merged.added){state.editor.questions=merged.questions;state.selected=merged.questions[merged.questions.length-merged.added].id;markDirty();editorPage();}
  toast(`Добавлено: ${merged.added}. Пропущено повторов: ${merged.skipped}.`);
}
function openCopy() {
  const sources=allAdminTests().filter(q=>q.id!==state.editor.id&&q.questions.length);
  if(!sources.length){showDialog('Пока неоткуда перенести вопросы','<p>Сначала создайте ещё один тест с вопросами.</p>',btn('Понятно','close-dialog','primary'));return;}
  copyState={sources,source:sources[0],selected:new Set()};
  showDialog('Добавить вопросы из другого теста',`<label class="field" for="copy-source">Тест-источник</label><select id="copy-source" class="copy-source">${sources.map(q=>`<option value="${h(q.id)}">${h(q.title||'Без названия')} · ${q.questions.length} вопросов</option>`).join('')}</select><div class="between mb"><span id="copy-count" class="small muted">Выбрано: 0</span>${btn('Выбрать все','copy-all','subtle compact')}</div><div id="copy-list" class="copy-list"></div><p class="muted small mt">Добавятся независимые копии. Изменения в исходном тесте на них не повлияют.</p>`,btn('Отмена','close-dialog')+btn('Добавить выбранные','apply-copy','primary','id="apply-copy" disabled'));
  renderCopyList();
}
function renderCopyList() {document.querySelector('#copy-list').innerHTML=copyState.source.questions.map((q,i)=>`<label class="check copy-row"><input type="checkbox" data-copy="${h(q.id)}" ${copyState.selected.has(q.id)?'checked':''}><span>${i+1}. ${h(q.text||'Пустой вопрос')}</span></label>`).join('');updateCopyCount();}
function updateCopyCount() {document.querySelector('#copy-count').textContent=`Выбрано: ${copyState.selected.size}`;document.querySelector('#apply-copy').disabled=!copyState.selected.size;}

async function refreshAdmin() {
  if(github.connected){state.remote=(await github.readCatalog()).catalog;}
  else {state.catalog=await loadPublicCatalog();state.publicError='';}
}
async function publishDraft() {
  await flushDraft();
  const errors=quizErrors(state.editor);if(errors.length){showErrors(errors);return;}
  if(!github.connected){connectDialog(publishDraft);return;}
  const draft=clone(state.editor);
  if(draft.status==='closed' && !(await ask('Открыть тест?','Публикация откроет ссылку для прохождения.','Опубликовать и открыть')))return;
  const publicQuiz=publishedQuiz(draft);
  await remoteAction(async()=>{
    const result=await github.mutate('publish',publicQuiz,draft.baseRevision);
    state.remote=result.catalog;
    state.editor=draftFromPublic(publicQuiz);state.unsaved=false;
    try {await storeDraft(state.editor);}catch(error){state.unsaved=true;state.saveError=errorMessage(error);}
    editorPage();
    showDialog('Тест отправлен на публикацию',`<p>Изменения сохранены в GitHub. Ссылка обновится после сборки GitHub Pages — обычно это занимает несколько минут.</p><label class="field" for="share-url">Ссылка на тест</label><input class="input" id="share-url" readonly value="${h(testURL(publicQuiz.id))}"><p class="muted small">${result.commit?`<a href="${h(result.commit)}" target="_blank" rel="noopener noreferrer">Посмотреть изменение в GitHub</a>`:''}</p>`,btn('Скопировать ссылку','copy-share')+btn('Готово','close-dialog','primary'));
  });
}
function testURL(id) {const url=new URL(location.href);url.hash=link(`/test/${id}`).slice(1);url.search='';return url.href;}
async function remoteAction(action) {
  if(state.busy)return;state.busy=true;
  app.inert=true;app.setAttribute('aria-busy','true');
  document.querySelectorAll('[data-remote]').forEach(el=>el.disabled=true);
  try {await action();}finally{state.busy=false;app.inert=false;app.removeAttribute('aria-busy');document.querySelectorAll('[data-remote]').forEach(el=>el.disabled=false);}
}
async function changeStatus(id) {
  if(!github.connected){connectDialog(()=>changeStatus(id));return;}
  const original=publicTests().find(q=>q.id===id);if(!original)throw new Error('Обновите список: опубликованный тест не найден.');
  const closing=original.status!=='closed';
  if(!(await ask(closing?'Закрыть тест?':'Открыть тест?',closing?'После обновления сайта ссылка покажет «Тест закрыт». Активные попытки остановятся при ближайшей проверке доступа.':'Тест снова станет доступен по прежней ссылке.',closing?'Закрыть':'Открыть')))return;
  await remoteAction(async()=>{
    const updated={...clone(original),status:closing?'closed':'published',revision:uid(),updatedAt:new Date().toISOString()};
    const result=await github.mutate('status',updated,original.revision);state.remote=result.catalog;
    const draft=state.drafts.find(q=>q.id===id);
    if(draft){draft.status=updated.status;if(draft.baseRevision===original.revision)draft.baseRevision=updated.revision;await storeDraft(draft);}
    adminPage();toast('Статус сохранён в GitHub. Изменение появится после обновления GitHub Pages.');
  });
}
async function deleteQuiz(id) {
  const local=state.drafts.find(q=>q.id===id), remote=publicTests().find(q=>q.id===id);
  if(remote&&!github.connected){connectDialog(()=>deleteQuiz(id));return;}
  if(!(await ask('Удалить тест?',remote?'Тест исчезнет из каталога, а его ссылка перестанет открывать прохождение. Локальный черновик также будет удалён.':'Черновик будет удалён из этого браузера.','Удалить',true)))return;
  await remoteAction(async()=>{
    if(remote){state.remote=(await github.mutate('delete',remote,remote.revision)).catalog;}
    if(local)await db.remove('drafts',id);
    state.drafts=state.drafts.filter(q=>q.id!==id);adminPage();toast(remote?'Удаление отправлено в GitHub.':'Черновик удалён.');
  });
}

async function beginAttempt(quiz,preview=false,range=null) {
  const errors=quizErrors(quiz);if(errors.length){showErrors(errors);return;}
  stopAttempt();
  const questionRange=allowsQuestionRange(quiz)?normalizeQuestionRange(quiz.questions.length,range??{}):null;
  state.attempt={quiz:clone(quiz),questionRange,questions:prepareQuestions(quiz,Math.random,questionRange),answers:[],index:0,startedAt:Date.now(),lastCheck:Date.now(),preview,blocked:'',checking:false,done:false,timer:null,advance:null,poll:null};
  const a=state.attempt;
  a.timer=setInterval(()=>{const elapsed=document.querySelector('#elapsed');if(elapsed)elapsed.textContent=formatDuration(Date.now()-a.startedAt);},1000);
  if(!preview)a.poll=setInterval(()=>checkAccess(a).catch(error=>{if(state.attempt===a){a.blocked=errorMessage(error);playPage();}}),CONFIG.statusInterval);
}
function stopAttempt() {const a=state.attempt;if(a){clearInterval(a.timer);clearInterval(a.poll);clearTimeout(a.advance);}state.attempt=null;}
async function checkAccess(a,force=false) {
  if(a.preview)return true;
  if(!force&&!a.blocked&&Date.now()-a.lastCheck<10000)return true;
  const catalog=await loadPublicCatalog();
  if(state.attempt!==a)return false;
  state.catalog=catalog;
  const quiz=catalog.tests.find(q=>q.id===a.quiz.id);
  if(!quiz||quiz.status==='closed'){
    stopAttempt();history.replaceState(null,'',link(`/test/${a.quiz.id}`));state.route=`/test/${a.quiz.id}`;
    unavailable(quiz?'Тест закрыт':'Тест удалён','Создатель прекратил доступ. Текущая попытка остановлена и не записана в историю.');return false;
  }
  a.blocked='';a.lastCheck=Date.now();return true;
}
async function chooseAnswer(optionId) {
  const a=state.attempt;if(!a||a.done||a.checking||a.blocked||a.answers[a.index]!==undefined)return;
  a.checking=true;playPage();
  try {
    if(!(await checkAccess(a,a.index===a.questions.length-1)))return;
    const q=a.questions[a.index];if(!q.options.some(o=>o.id===optionId))return;
    a.answers[a.index]=optionId;a.checking=false;playPage();
    if(optionId===q.correctOptionId)a.advance=setTimeout(()=>nextQuestion().catch(reportError),CONFIG.correctDelay);
  } catch(error){if(state.attempt===a){a.blocked=errorMessage(error);a.checking=false;playPage();}}
}
async function nextQuestion() {
  const a=state.attempt;if(!a||a.done||a.checking||a.answers[a.index]===undefined)return;
  clearTimeout(a.advance);a.checking=true;
  try {
    if(!(await checkAccess(a,a.index===a.questions.length-1)))return;
    if(a.index+1<a.questions.length){a.index++;a.checking=false;playPage();window.scrollTo(0,0);return;}
    a.done=true;
    const result=makeResult(a.quiz,a.questions,a.answers,a.startedAt,Date.now(),a.questionRange);
    if(!a.preview){try{await db.put('attempts',result);state.attempts.push(result);}catch(error){result.saveError=errorMessage(error);}}
    const preview=a.preview;stopAttempt();state.result=result;state.review='all';
    history.replaceState(null,'',link(preview?`/preview-result/${result.id}`:`/result/${result.id}`));state.route=preview?`/preview-result/${result.id}`:`/result/${result.id}`;
    resultPage(result,preview);window.scrollTo(0,0);
  } catch(error){if(state.attempt===a){a.blocked=errorMessage(error);a.checking=false;playPage();}}
}

async function route() {
  const version=++routeVersion;
  let path=location.hash.slice(1)||'/catalog';
  if(path==='/main')path='/catalog';
  if(state.attempt&&!state.attempt.done&&state.route.startsWith('/run')&&path!==state.route){
    if(!confirm('Прервать попытку? Незавершённый результат не сохранится.')){history.replaceState(null,'',link(state.route));return;}stopAttempt();
  }
  if(state.editor&&path!==`/edit/${state.editor.id}`){
    try{await flushDraft();}catch(error){history.replaceState(null,'',link(state.route));reportError(error);return;}
    state.editor=null;selection.quizId=null;selection.ids.clear();selection.mode=false;selection.anchor=null;
  }
  closeDialog();
  state.route=path;state.search='';
  const [routePath,query='']=path.split('?');
  const params=new URLSearchParams(query);
  const [section,id]=routePath.slice(1).split('/').map(decodeURIComponent);
  if(isCreatorRoute(section)) {
    if(!isCreatorUnlocked()){creatorLoginPage();return;}
    state.drafts=await db.all('drafts').catch(error=>{state.storageError=errorMessage(error);return state.drafts;});
    if(version!==routeVersion)return;
  }
  if(section==='catalog'){catalogPage();}
  else if(section==='admin'){adminPage();}
  else if(section==='edit'){
    state.editor=state.editor?.id===id?state.editor:await getDraft(id);
    if(version!==routeVersion)return;
    if(!state.editor)unavailable('Черновик не найден','Он хранится только в том браузере, в котором был создан.');
    else{if(!state.editor.questions.some(q=>q.id===state.selected))state.selected=state.editor.questions[0]?.id;editorPage();}
  }
  else if(section==='test'){
    setContent('<main id="main" class="loading">Проверяем доступность теста…</main>');
    try{state.catalog=await loadPublicCatalog();state.publicError='';if(version===routeVersion)startPage(findQuiz(id));}
    catch(error){if(version===routeVersion)unavailable('Не удалось открыть тест',errorMessage(error));}
  }
  else if(section==='preview'){
    const draft=await getDraft(id);if(version!==routeVersion)return;
    if(!draft)unavailable('Черновик не найден','Вернитесь в конструктор.');else startPage(draft,true);
  }
  else if(section==='run'||section==='run-preview'){
    if(!state.attempt){
      let quiz;
      if(section==='run-preview')quiz=await getDraft(id);
      else{state.catalog=await loadPublicCatalog();quiz=findQuiz(id);}
      if(version!==routeVersion)return;
      if(!quiz||quiz.status==='closed'&&section!=='run-preview'){startPage(quiz);return;}
      await beginAttempt(quiz,section==='run-preview',{from:params.get('from'),to:params.get('to')});
    }
    if(version===routeVersion)playPage();
  }
  else if(section==='history'){state.attempts=await db.all('attempts').catch(error=>{state.storageError=errorMessage(error);return state.attempts;});if(version===routeVersion)historyPage();}
  else if(section==='result'||section==='preview-result'){
    const result=state.result?.id===id?state.result:await db.get('attempts',id);
    if(version===routeVersion)resultPage(result,section==='preview-result');
  }
  else unavailable('Страница не найдена','Проверьте ссылку или вернитесь в каталог.');
  if(version===routeVersion&&isCreatorRoute(section))restoreGitHub();
  if(version===routeVersion){window.scrollTo(0,0);document.title=(document.querySelector('h1')?.textContent||'Конструктор')+' · Prosto Test';}
}

function reportError(error) {toast(errorMessage(error));}
async function handleAction(action,element,event={}) {
  const id=element?.dataset.id;
  if(action==='theme'){
    const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('prosto-test-theme',theme);}catch{}
    document.querySelectorAll('[data-action=theme]').forEach(el=>{el.textContent=theme==='dark'?'☀':'☾';el.setAttribute('aria-label',theme==='dark'?'Светлая тема':'Тёмная тема');});return;
  }
  if(action==='creator-logout'){
    await flushDraft();connectionEpoch++;restoreAttempted=false;state.githubError='';lockCreator();github.disconnect();state.remote=null;state.drafts=[];state.editor=null;pendingConnection=null;
    history.replaceState(null,'',link('/admin'));await route();return;
  }
  if(action==='close-dialog'){closeDialog();return;}
  if(action==='confirm'){const resolve=confirmation;confirmation=null;closeDialog();resolve?.(true);return;}
  if(action==='skip-duplicates'){const resolve=confirmation;confirmation=null;closeDialog();resolve?.('skip');return;}
  if(action==='connect'){connectDialog();return;}
  if(action==='account'){accountDialog();return;}
  if(action==='disconnect'){connectionEpoch++;restoreAttempted=true;github.disconnect();state.remote=null;state.githubError='';closeDialog();await route();return;}
  if(action==='forget-token'){forgetToken();connectionEpoch++;restoreAttempted=true;github.disconnect();state.remote=null;state.githubError='';closeDialog();await route();toast('Сохранённый ключ удалён из этого браузера.');return;}
  if(action==='edit-icon'){const quiz=state.editor;openIconEditor(quiz,showDialog,closeDialog,icon=>{if(state.editor!==quiz)return;quiz.icon=normalizeIcon(icon);markDirty();editorPage();});return;}
  if(action==='new'){await newDraft();return;}
  if(action==='refresh-public'){state.catalog=await loadPublicCatalog();state.publicError='';catalogPage();return;}
  if(action==='refresh-admin'){await refreshAdmin();adminPage();toast('Список обновлён.');return;}
  if(action==='filter'){state.filter=element.dataset.filter;adminPage();return;}
  if(action==='edit'){location.hash=link(`/edit/${id}`);return;}
  if(action==='preview-card'){const quiz=await getDraft(id);const errors=quizErrors(quiz);if(errors.length){showErrors(errors);return;}location.hash=link(`/preview/${id}`);return;}
  if(action==='preview'){await flushDraft();const errors=quizErrors(state.editor);if(errors.length){showErrors(errors);return;}location.hash=link(`/preview/${state.editor.id}`);return;}
  if(action==='publish'){await publishDraft();return;}
  if(action==='toggle-status'){await changeStatus(id);return;}
  if(action==='delete'){await deleteQuiz(id);return;}
  if(action==='share'){showDialog('Ссылка на тест',`<input class="input" id="share-url" readonly aria-label="Ссылка на тест" value="${h(testURL(id))}">`,btn('Скопировать','copy-share','primary'));return;}
  if(action==='copy-share'){const input=document.querySelector('#share-url');try{await navigator.clipboard.writeText(input.value);toast('Ссылка скопирована.');}catch{input.focus();input.select();toast('Скопируйте выделенную ссылку сочетанием Ctrl+C.');}return;}
  if(action==='selection-mode'){selection.mode=!selection.mode;if(!selection.mode){selection.ids.clear();selection.anchor=null;}editorPage();return;}
  if(action==='selection-all'){selection.ids=new Set(state.editor.questions.map(q=>q.id));editorPage();return;}
  if(action==='selection-clear'){selection.ids.clear();selection.anchor=null;editorPage();return;}
  if(action==='selection-range'){openSelectionRange();return;}
  if(action==='selection-apply-range'){selection.ids=new Set(rangeIds(state.editor.questions,bulkRange.from,bulkRange.to));selection.anchor=state.editor.questions[bulkRange.from-1].id;closeDialog();editorPage();return;}
  if(action==='toggle-question'||action==='select-question'&&(selection.mode||event.shiftKey)){toggleSelectedQuestion(id,event.shiftKey);return;}
  if(action==='select-question'||action==='open-question'){state.selected=id;selection.anchor=id;editorPage();return;}
  if(action==='selection-up'||action==='selection-down'){applyQuestionOrder(moveSelectedQuestions(state.editor.questions,selection.ids,action==='selection-up'?'up':'down'));return;}
  if(action==='selection-move'){
    showDialog('Переместить выбранные вопросы',`<p>Выбрано: ${selection.ids.size}. Вопросы соберутся в один блок с сохранением взаимного порядка.</p><label class="field" for="bulk-destination">Перед вопросом № (по текущему списку)</label><input class="input" id="bulk-destination" type="number" min="1" max="${state.editor.questions.length}" step="1" placeholder="Номер вопроса"><div id="bulk-move-error" class="bad-text small mt-sm" role="alert"></div>`,btn('Отмена','close-dialog')+btn('В конец','selection-move-end')+btn('Переместить','selection-move-apply','primary'));return;
  }
  if(action==='selection-move-apply'||action==='selection-move-end'){
    try{const target=action==='selection-move-end'?state.editor.questions.length+1:document.querySelector('#bulk-destination').valueAsNumber;const questions=moveSelectedQuestions(state.editor.questions,selection.ids,target);closeDialog();applyQuestionOrder(questions);}catch(error){document.querySelector('#bulk-move-error').textContent=errorMessage(error);}return;
  }
  if(action==='selection-delete'){
    const quiz=state.editor,ids=new Set(selection.ids);if(!ids.size)return;
    if(!(await ask('Удалить выбранные вопросы?',`Будет удалено: ${ids.size}. Номера: ${selectedNumbers(quiz.questions,ids)}. Удаление сохранится в черновике. Для изменения публичного теста нужна публикация.`,'Удалить',true)))return;
    if(state.editor!==quiz)return;
    const activeIndex=quiz.questions.findIndex(q=>q.id===state.selected);quiz.questions=quiz.questions.filter(q=>!ids.has(q.id));
    if(ids.has(state.selected))state.selected=quiz.questions[Math.min(activeIndex,quiz.questions.length-1)]?.id;
    if(quiz.settings.questionCount!==null)quiz.settings.questionCount=quiz.questions.length<2?null:Math.min(quiz.settings.questionCount,quiz.questions.length-1);
    selection.ids.clear();selection.anchor=null;markDirty();editorPage();toast(`Удалено вопросов: ${ids.size}.`);return;
  }
  if(action==='add-question'){const q=newQuestion();state.editor.questions.push(q);state.selected=q.id;markDirty();editorPage();return;}
  if(action==='remove-question'){
    if(!(await ask('Удалить вопрос?','Вопрос и его варианты ответа будут удалены из черновика.','Удалить',true)))return;
    const index=state.editor.questions.findIndex(q=>q.id===state.selected);state.editor.questions.splice(index,1);state.selected=state.editor.questions[Math.min(index,state.editor.questions.length-1)]?.id;
    if(state.editor.settings.questionCount!==null)state.editor.settings.questionCount=state.editor.questions.length<2?null:Math.min(state.editor.settings.questionCount,state.editor.questions.length-1);
    markDirty();editorPage();return;
  }
  if(action==='add-option'){currentQuestion().options.push({id:uid(),text:''});markDirty();editorPage();document.querySelectorAll('[data-option]').item(currentQuestion().options.length-1)?.focus();return;}
  if(action==='remove-option'){const q=currentQuestion();if(q.options.length<=2)return;q.options=q.options.filter(o=>o.id!==id);if(q.correctOptionId===id)q.correctOptionId=q.options[0].id;markDirty();editorPage();return;}
  if(action==='move-up'||action==='move-down'){const list=state.editor.questions,i=list.findIndex(q=>q.id===state.selected),j=i+(action==='move-up'?-1:1);if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];markDirty();editorPage();return;}
  if(action==='paste-batch'){openBatchPaste();return;}
  if(action==='apply-batch'){applyBatchPaste(element.dataset.duplicates==='all');return;}
  if(action==='paste'||action==='paste-replace'){openPaste(action==='paste-replace');return;}
  if(action==='apply-paste'){
    if(!pasteState.parsed)return;
    const q=pasteState.parsed, replace=pasteState.replace;
    if(replace){const index=state.editor.questions.findIndex(q=>q.id===state.selected);q.id=state.selected;state.editor.questions[index]=q;}else state.editor.questions.push(q);
    state.selected=q.id;closeDialog();markDirty();editorPage();return;
  }
  if(action==='copy'){openCopy();return;}
  if(action==='copy-all'){copyState.selected=new Set(copyState.source.questions.map(q=>q.id));renderCopyList();return;}
  if(action==='apply-copy'){
    const incoming=copyState.source.questions.filter(q=>copyState.selected.has(q.id));
    let merged=mergeQuestions(state.editor.questions,incoming);
    if(merged.skipped){
      showDialog('Найдены похожие вопросы',`<p>${merged.skipped} вопросов имеют такой же текст. Выберите, как поступить с повторами.</p>`,btn('Отмена','close-dialog')+btn('Пропустить повторы','skip-duplicates')+btn('Добавить все','confirm','primary'));
      const choice=await new Promise(resolve=>confirmation=resolve);
      if(!choice)return;
      if(choice===true)merged=mergeQuestions(state.editor.questions,incoming,true);
    }
    closeDialog();state.editor.questions=merged.questions;if(merged.added)state.selected=merged.questions[merged.questions.length-merged.added].id;markDirty();editorPage();toast(`Добавлено: ${merged.added}. Пропущено повторов: ${merged.skipped}.`);return;
  }
  if(action==='duplicate'){
    await flushDraft();const q=newQuiz();q.title=(state.editor.title||'Без названия')+' — копия';q.description=state.editor.description;q.icon=normalizeIcon(state.editor.icon);q.settings=clone(state.editor.settings);q.questions=state.editor.questions.map(copyQuestion);await storeDraft(q);location.hash=link(`/edit/${q.id}`);return;
  }
  if(action==='range-all'){state.startSelection.from=1;state.startSelection.to=state.startSelection.total;syncQuestionRange();return;}
  if(action==='start-test'||action==='start-preview'){
    const r=state.startSelection?.id===id?state.startSelection:null;
    location.hash=link(`/${action==='start-preview'?'run-preview':'run'}/${id}${r?`?from=${r.from}&to=${r.to}`:''}`);return;
  }
  if(action==='answer'){await chooseAnswer(id);return;}
  if(action==='next-question'){await nextQuestion();return;}
  if(action==='retry-status'){
    const a=state.attempt;if(!a)return;
    if(await checkAccess(a)){a.checking=false;playPage();if(a.answers[a.index]!==undefined){if(a.answers[a.index]===a.questions[a.index].correctOptionId)await nextQuestion();}}return;
  }
  if(action==='review-filter'){state.review=element.dataset.filter;resultPage(state.result,state.route.startsWith('/preview-result'));return;}
}

document.addEventListener('click',event=>{
  if(event.target.closest('.skip-link')){event.preventDefault();const main=document.querySelector('#main');main?.setAttribute('tabindex','-1');main?.focus();main?.scrollIntoView();return;}
  const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
  event.preventDefault();handleAction(el.dataset.action,el,event).catch(reportError);
});
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.dataset.bulkBound){updateSelectionRange(el);return;}
  if(el.dataset.rangeBound){updateQuestionRange(el);return;}
  if(el.name==='catalog-search'){state.search=el.value;document.querySelector('#catalog-list').innerHTML=catalogCards();return;}
  if(el.id==='paste-text'||el.id==='strip-prefixes'){updatePaste();return;}
  if(el.id==='batch-text'||el.id==='batch-strip-prefixes'){updateBatchPaste();return;}
  if(!state.editor)return;
  const q=currentQuestion();
  if(el.name==='quiz-title'){state.editor.title=el.value;document.querySelector('.editor-title').textContent=el.value||'Новый тест';}
  else if(el.name==='quiz-description')state.editor.description=el.value;
  else if(el.name==='question-text'){q.text=el.value;document.querySelector('#question-list').innerHTML=questionList();}
  else if(el.dataset.option){const option=q.options.find(o=>o.id===el.dataset.option);if(option)option.text=el.value;}
  else if(el.name==='correct-option'){q.correctOptionId=el.value;document.querySelectorAll('.option-row').forEach(row=>row.classList.toggle('correct',row.querySelector('input[type=radio]').checked));}
  else if(el.name==='allow-question-range'){state.editor.settings.allowQuestionRange=el.checked&&state.editor.settings.questionCount===null;markDirty();editorPage();return;}
  else if(el.name==='shuffle-questions')state.editor.settings.shuffleQuestions=el.checked;
  else if(el.name==='shuffle-options')state.editor.settings.shuffleOptions=el.checked;
  else if(el.name==='count-mode'){
    state.editor.settings.questionCount=el.value==='all'?null:Math.max(1,state.editor.questions.length-1);state.editor.settings.allowQuestionRange=el.value==='all';markDirty();editorPage();return;
  }
  else if(el.name==='question-count-range'||el.name==='question-count-number'){
    const count=Math.max(1,Math.min(Math.max(1,state.editor.questions.length-1),Number(el.value)||1));state.editor.settings.questionCount=count;
    document.querySelectorAll('[name^=question-count-]').forEach(input=>{if(input!==el)input.value=count;});
  }
  else return;
  markDirty();
});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='remember-github'){document.querySelector('#vault-password-field').hidden=!el.checked||hasVaultSession();document.querySelector('#vault-password').required=el.checked&&!hasVaultSession();return;}
  if(el.dataset.bulkBound){updateSelectionRange(el,true);return;}
  if(el.dataset.rangeBound){updateQuestionRange(el,true);return;}
  if(el.name==='question-count-number')el.value=state.editor.settings.questionCount;
  if(el.id==='copy-source'){copyState.source=copyState.sources.find(q=>q.id===el.value);copyState.selected.clear();renderCopyList();}
  if(el.dataset.copy){if(el.checked)copyState.selected.add(el.dataset.copy);else copyState.selected.delete(el.dataset.copy);updateCopyCount();}
});
document.addEventListener('submit',async event=>{
  if(event.target.id==='creator-login-form'){event.preventDefault();await submitCreatorLogin(event.target);return;}
  if(event.target.id!=='connect-form')return;event.preventDefault();
  const field=document.querySelector('#github-token'), button=event.target.querySelector('[type=submit]');
  const token=field.value,remember=document.querySelector('#remember-github').checked,passwordField=document.querySelector('#vault-password'),password=passwordField.value,epoch=++connectionEpoch;field.value='';passwordField.value='';button.disabled=true;button.textContent='Подключаем…';connecting=true;
  const client=new GitHub();
  dialog.querySelectorAll('[data-action=close-dialog],[data-action=forget-token]').forEach(el=>el.disabled=true);
  try{
    if(remember&&!hasVaultSession()&&!(await unlockCreator(password)))throw new Error('Неверный пароль создателя. Ключ не сохранён.');
    await client.connect(token);
    const remote=await client.readCatalog();
    if(epoch!==connectionEpoch||!isCreatorUnlocked()){client.disconnect();return;}
    if(remember)await rememberToken(token);else if(hasRememberedToken())forgetToken();
    if(epoch!==connectionEpoch||!isCreatorUnlocked()){client.disconnect();return;}
    github.disconnect();github=client;state.remote=remote.catalog;state.githubError='';restoreAttempted=true;
    const next=pendingConnection;pendingConnection=null;connecting=false;closeDialog();if(next)await next();else await route();toast(remember?'GitHub подключён. Ключ запомнен на этом компьютере.':'GitHub подключён до обновления вкладки.');
  }
  catch(error){client.disconnect();const box=document.querySelector('#connect-error');if(box)box.innerHTML=notice(h(errorMessage(error)),'error');else reportError(error);}
  finally{connecting=false;dialog.querySelectorAll('[data-action=close-dialog],[data-action=forget-token]').forEach(el=>el.disabled=false);if(button.isConnected){button.disabled=false;button.textContent='Подключить';}}
});
window.addEventListener('hashchange',()=>route().catch(reportError));
window.addEventListener('beforeunload',event=>{if(state.busy||state.unsaved||state.attempt&&!state.attempt.done){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&state.unsaved)saveDraft().catch(reportError);});

const loaded=await Promise.allSettled([loadPublicCatalog(),db.all('attempts')]);
if(loaded[0].status==='fulfilled')state.catalog=loaded[0].value;else state.publicError=errorMessage(loaded[0].reason);
if(loaded[1].status==='fulfilled')state.attempts=loaded[1].value;else state.storageError=errorMessage(loaded[1].reason);
route().catch(error=>unavailable('Не удалось открыть страницу',errorMessage(error)));
