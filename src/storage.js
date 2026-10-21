let database;
export async function openDB() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open('prosto-test-v1', 2);
    request.onupgradeneeded = () => {
      for (const store of ['drafts', 'attempts', 'activeAttempts']) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store, {keyPath: 'id'});
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {request.result.close(); database = null;};
      resolve(request.result);
    };
    request.onerror = () => {database = null; reject(new Error('Браузер не разрешил открыть локальное хранилище. Проверьте настройки данных сайта.'));};
    request.onblocked = () => reject(new Error('Закройте другие вкладки сайта и повторите попытку.'));
  });
  return database;
}
async function transaction(store, mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(new Error('Не удалось сохранить данные в браузере. Возможно, закончилось место или доступ к хранилищу отключён.'));
  });
}
export const db = {
  all: store => transaction(store, 'readonly', s => s.getAll()),
  get: (store, id) => transaction(store, 'readonly', s => s.get(id)),
  put: (store, value) => transaction(store, 'readwrite', s => s.put(structuredClone(value))),
  remove: (store, id) => transaction(store, 'readwrite', s => s.delete(id)),
};
// The stable attempt ID makes finishing idempotent, even if the page reloads at completion.
export async function completeAttempt(result, activeId) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx=database.transaction(['attempts','activeAttempts'],'readwrite');
    tx.objectStore('attempts').put(structuredClone(result));
    tx.objectStore('activeAttempts').delete(activeId);
    tx.oncomplete=()=>resolve();
    tx.onerror=tx.onabort=()=>reject(new Error('Не удалось сохранить результат. Повторите сохранение.'));
  });
}
export async function requestPersistentStorage() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
