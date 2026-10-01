const DATABASE_NAME = 'miao-motion';
const DATABASE_VERSION = 4;

/**
 * 非安全上下文（如 http 局域网访问）下 crypto.randomUUID 不可用，降级为时间+随机串。
 * 碰撞概率对本地模型库足够低，且调用方会按 sourceName/size/lastModified 去重。
 */
export function safeRandomId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* 某些受限环境访问 crypto 会抛错，直接走降级 */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function openAppDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
      let models;
      if (!db.objectStoreNames.contains('models')) {
        models = db.createObjectStore('models', { keyPath: 'id' });
        models.createIndex('updatedAt', 'updatedAt');
      } else if (transaction) {
        models = transaction.objectStore('models');
        if (!models.indexNames.contains('updatedAt')) models.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('profiles')) {
        const profiles = db.createObjectStore('profiles', { keyPath: 'id' });
        profiles.createIndex('updatedAt', 'updatedAt');
      }
      if ((event.oldVersion ?? 0) < 4 && transaction && models) {
        const legacy = transaction.objectStore('assets').get('current-vrm');
        legacy.onsuccess = () => {
          const value = legacy.result;
          if (!value?.data) return;
          const existing = models.get('current');
          existing.onsuccess = () => {
            if (!existing.result) {
              const data = value.data instanceof Blob ? value.data : new Blob([value.data], { type: value.type });
              models.put({ id: 'current', name: value.name ?? 'avatar.vrm', type: value.type ?? 'model/vrm', data, size: data.size, updatedAt: Date.now(), thumbnail: '' });
            }
            transaction.objectStore('assets').delete('current-vrm');
          };
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function complete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new DOMException('本地保存事务已取消', 'AbortError'));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listStoredModels() {
  const db = await openAppDatabase();
  try {
    const values = await requestValue(db.transaction('models').objectStore('models').getAll());
    return values.sort((a, b) => b.updatedAt - a.updatedAt);
  } finally { db.close(); }
}

export async function getStoredModel(id) {
  const db = await openAppDatabase();
  try { return await requestValue(db.transaction('models').objectStore('models').get(id)); }
  finally { db.close(); }
}

export async function putStoredModel(file, id) {
  const db = await openAppDatabase();
  try {
    const transaction = db.transaction('models', 'readwrite');
    const done = complete(transaction);
    const store = transaction.objectStore('models');
    const [value] = await Promise.all([new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const previous = request.result.find(model => id ? model.id === id : model.sourceName === file.name && model.size === file.size && model.lastModified === file.lastModified);
        const model = { ...previous, id: previous?.id ?? id ?? safeRandomId(), name: previous?.name ?? file.name, sourceName: file.name, lastModified: file.lastModified, type: file.type || 'model/vrm', data: file, size: file.size, updatedAt: Date.now(), thumbnail: previous?.thumbnail ?? '' };
        store.put(model);
        resolve(model);
      };
      request.onerror = () => reject(request.error);
    }), done]);
    return value;
  } finally { db.close(); }
}

export async function updateStoredModel(id, changes) {
  const db = await openAppDatabase();
  try {
    const transaction = db.transaction('models', 'readwrite');
    const store = transaction.objectStore('models');
    const done = complete(transaction);
    await Promise.all([new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        if (!request.result) {
          transaction.abort();
          reject(new Error('找不到模型记录'));
          return;
        }
        store.put({ ...request.result, ...changes, id, updatedAt: Date.now() });
        resolve();
      };
      request.onerror = () => reject(request.error);
    }), done]);
  } finally { db.close(); }
}

export async function deleteStoredModel(id) {
  const db = await openAppDatabase();
  try {
    const transaction = db.transaction('models', 'readwrite');
    transaction.objectStore('models').delete(id);
    await complete(transaction);
  } finally { db.close(); }
}

export async function listStoredProfiles() {
  const db = await openAppDatabase();
  try {
    const values = await requestValue(db.transaction('profiles').objectStore('profiles').getAll());
    return values.sort((a, b) => b.updatedAt - a.updatedAt);
  } finally { db.close(); }
}

export async function putStoredProfile(profile) {
  const db = await openAppDatabase();
  try {
    const transaction = db.transaction('profiles', 'readwrite');
    transaction.objectStore('profiles').put(profile);
    await complete(transaction);
  } finally { db.close(); }
}

export async function deleteStoredProfile(id) {
  const db = await openAppDatabase();
  try {
    const transaction = db.transaction('profiles', 'readwrite');
    transaction.objectStore('profiles').delete(id);
    await complete(transaction);
  } finally { db.close(); }
}
