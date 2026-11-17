/**
 * What the page keeps in this browser: progress in localStorage, collections loaded from files in
 * IndexedDB (they can be several megabytes, more than localStorage holds).
 */
const stateKey = 'read-state';

export function loadState() {
  try {
    return JSON.parse(localStorage.getItem(stateKey) ?? 'null');
  } catch {
    return null;
  }
}
/** Returns an error message, or '' when saved. */
export function saveState(state) {
  try {
    localStorage.setItem(stateKey, JSON.stringify(state));
    return '';
  } catch (error) {
    return error.message;
  }
}

function openBase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('read', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('collections');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function run(mode, action) {
  return openBase().then((base) => new Promise((resolve, reject) => {
    const transaction = base.transaction('collections', mode);
    const request = action(transaction.objectStore('collections'));
    transaction.oncomplete = () => { base.close(); resolve(request.result); };
    transaction.onerror = () => { base.close(); reject(transaction.error); };
  }));
}
/** Every loaded collection: [{ name, problems }]. */
export async function loadCollections() {
  try {
    return (await run('readonly', (store) => store.getAll())) ?? [];
  } catch {
    return [];
  }
}
export const saveCollection = (collection) => run('readwrite', (store) => store.put(collection, collection.name));
export const removeCollection = (name) => run('readwrite', (store) => store.delete(name));
