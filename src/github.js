import { publicStatus, validatePublicStatus } from './public-status.js';
import { CONFIG } from './config.js';
import { validateCatalog, applyCatalogChange } from './core.js';
import { PUBLIC_QUIZ_FILE, validatePublicIndex } from './public-catalog.js';

export class GitHub {
  #token = '';
  user = null;
  constructor(fetcher = globalThis.fetch.bind(globalThis)) { this.fetch = fetcher; }
  get connected() { return !!this.#token; }
  disconnect() { this.#token = ''; this.user = null; }
  async request(path, options = {}) {
    const headers = {'Accept':'application/vnd.github+json','X-GitHub-Api-Version':CONFIG.apiVersion};
    if (this.#token) headers.Authorization = `Bearer ${this.#token}`;
    if (options.body) headers['Content-Type'] = 'application/json';
    let response;
    try { response = await this.fetch(`https://api.github.com${path}`, {...options, headers, cache:'no-store', signal:AbortSignal.timeout(20000)}); }
    catch { throw new Error('Не удалось связаться с GitHub. Проверьте интернет и повторите действие.'); }
    if (!response.ok) {
      const messages = {401:'GitHub не принял ключ. Проверьте его срок действия.',403:'Нет нужных прав или достигнут лимит GitHub API. Для этого репозитория нужен Contents: Read and write.',404:'Репозиторий или файл не найден. Проверьте доступ ключа к Prosto_Test.',409:'Файл изменился во время публикации. Обновите список и повторите действие.',422:'GitHub не принял изменение. Проверьте права ключа и настройки ветки main.'};
      throw new Error(messages[response.status] || `GitHub вернул ошибку ${response.status}. Повторите позже.`);
    }
    return response.status === 204 ? null : response.json();
  }
  async connect(token) {
    this.disconnect();
    this.#token = token.trim();
    try {
      const user = await this.request('/user');
      if (user.login.toLowerCase() !== CONFIG.owner.toLowerCase()) throw new Error(`Публикация доступна только владельцу ${CONFIG.owner}.`);
      const repo = await this.request(`/repos/${CONFIG.owner}/${CONFIG.repo}`);
      if (!repo.permissions?.push) throw new Error('У аккаунта нет права изменять этот репозиторий.');
      this.user = user.login;
      return user.login;
    } catch (error) { this.disconnect(); throw error; }
  }
  async readCatalog() {
    const base = `/repos/${CONFIG.owner}/${CONFIG.repo}`;
    const file = await this.request(`${base}/contents/${CONFIG.dataPath}?ref=${encodeURIComponent(CONFIG.branch)}`);
    const blob = file.content ? file : await this.request(`${base}/git/blobs/${file.sha}`);
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string') throw new Error('Не удалось прочитать каталог GitHub.');
    const bytes = Uint8Array.from(atob(blob.content.replace(/\s/g,'')), c => c.charCodeAt(0));
    return {catalog: validateCatalog(JSON.parse(new TextDecoder().decode(bytes))), sha:file.sha};
  }
  async mutate(operation, quiz, expectedRevision) {
    if (!this.connected) throw new Error('Сначала подключите GitHub.');
    const {catalog, sha} = await this.readCatalog();
    const changed = applyCatalogChange(catalog, operation, quiz, expectedRevision);
    validateCatalog(changed);
    const bytes = new TextEncoder().encode(JSON.stringify(changed,null,2)+'\n');
    let binary = '';
    for (let start=0; start<bytes.length; start+=8192) binary += String.fromCharCode(...bytes.subarray(start,start+8192));
    const result = await this.request(`/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataPath}`, {
      method:'PUT', body:JSON.stringify({message:`${operation === 'delete' ? 'Remove' : 'Update'} quiz: ${quiz.title}`, content:btoa(binary), sha, branch:CONFIG.branch})
    });
    return {catalog:changed, commit:result.commit?.html_url};
  }
}

const browserFetch = (url, options) => globalThis.fetch(url, options);
const transientHTTP = new Set([408, 500, 502, 503, 504]);

async function readPublicJSON(path, label, fetcher, {
  cache = 'no-cache', timeouts = [15000, 20000], allowMissing = false,
} = {}) {
  const url = new URL(`../data/${path}`, import.meta.url);
  for (const [attempt, timeout] of timeouts.entries()) {
    const last = attempt === timeouts.length - 1;
    const signal = AbortSignal.timeout(timeout);
    let response;
    try {
      response = await fetcher(url, {cache:attempt && cache === 'default' ? 'reload' : cache, signal});
      if (response.ok) return await response.json();
    } catch (error) {
      if (signal.aborted || error?.name === 'TimeoutError') {
        if (!last) continue;
        throw new Error(`${label}. Загрузка заняла слишком много времени. Попробуйте ещё раз.`, {cause:error});
      }
      if (error instanceof SyntaxError) {
        throw new Error(`${label}. Сервер вернул некорректные данные.`, {cause:error});
      }
      if (!last) continue;
      throw new Error(`${label}. Проверьте интернет и повторите попытку.`, {cause:error});
    }
    if (allowMissing && response.status === 404) return undefined;
    if (!last && transientHTTP.has(response.status)) continue;
    throw new Error(`${label} (HTTP ${response.status}). Попробуйте ещё раз позже.`);
  }
}

export async function loadPublicIndex(fetcher = browserFetch) {
  return validatePublicIndex(await readPublicJSON(
    'catalog.json', 'Не удалось загрузить список тестов', fetcher, {timeouts:[8000, 15000]},
  ));
}

export async function loadPublicQuiz(entry, fetcher = browserFetch) {
  if (!PUBLIC_QUIZ_FILE.test(entry.file)) throw new Error('Не удалось определить файл теста.');
  const quiz = await readPublicJSON(entry.file, 'Не удалось загрузить вопросы', fetcher, {cache:'default'});
  validateCatalog({schemaVersion:1, tests:[quiz]});
  if (quiz.id !== entry.id || quiz.revision !== entry.revision || quiz.status !== entry.status ||
      quiz.questions.length !== entry.questionTotal) {
    throw new Error('Тест обновился во время загрузки. Нажмите «Повторить».');
  }
  return quiz;
}

export async function loadPublicCatalog(fetcher = browserFetch) {
  return validateCatalog(await readPublicJSON('tests.json', 'Не удалось загрузить тесты', fetcher));
}

export async function loadPublicStatus(fetcher = browserFetch) {
  const data = await readPublicJSON(
    `status.json?v=${Date.now()}`, 'Не удалось проверить доступность теста', fetcher,
    {cache:'no-store', timeouts:[5000, 8000], allowMissing:true},
  );
  // Older/custom deployments may not have the generated small manifest yet.
  return data === undefined ? publicStatus(await loadPublicCatalog(fetcher)) : validatePublicStatus(data);
}
