export interface LocalDocDraft {
  docUid: string;
  title: string;
  contentJson: string;
  textLength: number;
  serverRevision: number;
  savedAt: number;
}

const DB_NAME = "chendoc-local";
const STORE_NAME = "doc-drafts";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function openDraftDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "docUid" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDraftDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function readLocalDraft(docUid: string) {
  const draft = (await withStore<LocalDocDraft | undefined>("readonly", (store) => store.get(docUid))) ?? null;
  if (draft && Date.now() - draft.savedAt > DRAFT_TTL_MS) {
    await removeLocalDraft(docUid);
    return null;
  }
  return draft;
}

export async function writeLocalDraft(draft: LocalDocDraft) {
  await withStore<IDBValidKey>("readwrite", (store) => store.put(draft));
}

export async function removeLocalDraft(docUid: string) {
  await withStore<undefined>("readwrite", (store) => store.delete(docUid));
}

export async function clearLocalDrafts() {
  await withStore<undefined>("readwrite", (store) => store.clear());
}
