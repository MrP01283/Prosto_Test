let database;
export async function openDB() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open('prosto-test-v1', 3);
    request.onupgradeneeded = () => {
      for (const store of ['drafts', 'attempts', 'activeAttempts', 'activeProgress']) {
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
// The large immutable snapshot and small frequent checkpoint share a transaction
// when created, replaced or removed. Legacy v1/v2 snapshots need no conversion.
async function getActiveAttempt(id) {
  const database=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=database.transaction(['activeAttempts','activeProgress'],'readonly');
    const base=tx.objectStore('activeAttempts').get(id),progress=tx.objectStore('activeProgress').get(id);
    tx.oncomplete=()=>{
      const saved=base.result,checkpoint=progress.result;
      resolve(saved&&checkpoint?.attemptId===saved.attemptId?{...saved,answers:checkpoint.answers,index:checkpoint.index,elapsedMs:checkpoint.elapsedMs}:saved);
    };
    tx.onerror=tx.onabort=()=>reject(new Error('Не удалось восстановить сохранённую попытку.'));
  });
}
async function replaceActiveAttempt(id,saved) {
  const database=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=database.transaction(['activeAttempts','activeProgress'],'readwrite');
    if(saved)tx.objectStore('activeAttempts').put(saved);else tx.objectStore('activeAttempts').delete(id);
    tx.objectStore('activeProgress').delete(id);
    tx.oncomplete=()=>resolve();
    tx.onerror=tx.onabort=()=>reject(new Error('Не удалось сохранить данные в браузере. Возможно, закончилось место или доступ к хранилищу отключён.'));
  });
}
export const db = {
  all: store => transaction(store, 'readonly', s => s.getAll()),
  get: (store, id) => store==='activeAttempts'?getActiveAttempt(id):transaction(store, 'readonly', s => s.get(id)),
  put: (store, value) => store==='activeAttempts'?replaceActiveAttempt(value.id,value):transaction(store, 'readwrite', s => s.put(structuredClone(value))),
  remove: (store, id) => store==='activeAttempts'?replaceActiveAttempt(id):transaction(store, 'readwrite', s => s.delete(id)),
};
// snapshotProgress() already detached these small values from the live attempt.
export const putActiveProgress = value => transaction('activeProgress','readwrite',store=>store.put(value));
// The stable attempt ID makes finishing idempotent, even if the page reloads at completion.
export async function completeAttempt(result, activeId) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx=database.transaction(['attempts','activeAttempts','activeProgress'],'readwrite');
    tx.objectStore('attempts').put(structuredClone(result));
    tx.objectStore('activeAttempts').delete(activeId);
    tx.objectStore('activeProgress').delete(activeId);
    tx.oncomplete=()=>resolve();
    tx.onerror=tx.onabort=()=>reject(new Error('Не удалось сохранить результат. Повторите сохранение.'));
  });
}
export async function requestPersistentStorage() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
