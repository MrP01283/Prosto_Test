import { CONFIG } from './config.js';
import { validateCatalog, applyCatalogChange } from './core.js';

export class GitHub {
  #token = '';
  user = null;
  constructor(fetcher = fetch) { this.fetch = fetcher; }
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

export async function loadPublicCatalog() {
  let response;
  try { response = await fetch(new URL(`../data/tests.json?v=${Date.now()}`, import.meta.url), {cache:'no-store', signal:AbortSignal.timeout(15000)}); }
  catch { throw new Error('Не удалось загрузить тесты. Проверьте интернет и повторите попытку.'); }
  if (!response.ok) throw new Error(`Каталог тестов недоступен (${response.status}). Попробуйте обновить страницу позже.`);
  return validateCatalog(await response.json());
}
