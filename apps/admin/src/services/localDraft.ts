export interface LocalDocDraft {
  docUid: string;
  title: string;
  contentJson: string;
  textLength: number;
  serverRevision: number;
  savedAt: number;
}

export interface LocalDraftHistory {
  docUid: string;
  entries: LocalDocDraft[];
  maxEntries?: number;
}

const DB_NAME = "chendoc-local";
const STORE_NAME = "doc-drafts";
const HISTORY_STORE_NAME = "doc-draft-history";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_ENTRIES = 5;

function openDraftDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "docUid" });
      }
      if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        db.createObjectStore(HISTORY_STORE_NAME, { keyPath: "docUid" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readLocalDraft(docUid: string) {
  const database = await openDraftDb();
  try {
    return await new Promise<LocalDocDraft | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(docUid);
      request.onsuccess = () => {
        const draft = request.result as LocalDocDraft | undefined;
        if (draft && Date.now() - draft.savedAt > DRAFT_TTL_MS) {
          // 过期，删除
          const delTx = database.transaction(STORE_NAME, "readwrite");
          delTx.objectStore(STORE_NAME).delete(docUid);
          resolve(null);
        } else {
          resolve(draft ?? null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function writeLocalDraft(draft: LocalDocDraft) {
  const database = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).put(draft);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function removeLocalDraft(docUid: string) {
  const database = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).delete(docUid);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function clearLocalDrafts() {
  const database = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const request = transaction.objectStore(STORE_NAME).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

// 获取草稿历史
export async function getLocalDraftHistory(docUid: string): Promise<LocalDocDraft[]> {
  try {
    const database = await openDraftDb();
    try {
      const history = await new Promise<LocalDraftHistory | undefined>((resolve, reject) => {
        const transaction = database.transaction(HISTORY_STORE_NAME, "readonly");
        const request = transaction.objectStore(HISTORY_STORE_NAME).get(docUid);
        request.onsuccess = () => resolve(request.result as LocalDraftHistory | undefined);
        request.onerror = () => reject(request.error);
      });
      if (!history) return [];
      const now = Date.now();
      return history.entries.filter(e => now - e.savedAt <= DRAFT_TTL_MS);
    } finally {
      database.close();
    }
  } catch {
    return [];
  }
}

// 保存草稿历史
export async function saveLocalDraftHistory(draft: LocalDocDraft): Promise<void> {
  try {
    const database = await openDraftDb();
    try {
      const history = await new Promise<LocalDraftHistory | undefined>((resolve, reject) => {
        const transaction = database.transaction(HISTORY_STORE_NAME, "readonly");
        const request = transaction.objectStore(HISTORY_STORE_NAME).get(draft.docUid);
        request.onsuccess = () => resolve(request.result as LocalDraftHistory | undefined);
        request.onerror = () => reject(request.error);
      }) ?? { docUid: draft.docUid, entries: [] };

      history.entries.unshift(draft);
      if (history.entries.length > MAX_HISTORY_ENTRIES) {
        history.entries = history.entries.slice(0, MAX_HISTORY_ENTRIES);
      }

      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(HISTORY_STORE_NAME, "readwrite");
        const request = transaction.objectStore(HISTORY_STORE_NAME).put(history);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  } catch {
    // 历史保存失败不影响主流程
  }
}

// 清理过期草稿
export async function cleanExpiredDrafts(): Promise<number> {
  let cleaned = 0;
  const now = Date.now();

  try {
    const database = await openDraftDb();
    try {
      // 清理主草稿
      const drafts = await new Promise<LocalDocDraft[]>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result as LocalDocDraft[]);
        request.onerror = () => reject(request.error);
      });

      for (const draft of drafts) {
        if (now - draft.savedAt > DRAFT_TTL_MS) {
          await removeLocalDraft(draft.docUid);
          cleaned++;
        }
      }

      // 清理历史记录
      const histories = await new Promise<LocalDraftHistory[]>((resolve, reject) => {
        const transaction = database.transaction(HISTORY_STORE_NAME, "readonly");
        const request = transaction.objectStore(HISTORY_STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result as LocalDraftHistory[]);
        request.onerror = () => reject(request.error);
      });

      for (const history of histories) {
        history.entries = history.entries.filter(e => now - e.savedAt <= DRAFT_TTL_MS);
        if (history.entries.length === 0) {
          await new Promise<void>((resolve, reject) => {
            const tx = database.transaction(HISTORY_STORE_NAME, "readwrite");
            const req = tx.objectStore(HISTORY_STORE_NAME).delete(history.docUid);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        } else {
          await new Promise<void>((resolve, reject) => {
            const tx = database.transaction(HISTORY_STORE_NAME, "readwrite");
            const req = tx.objectStore(HISTORY_STORE_NAME).put(history);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        }
      }
    } finally {
      database.close();
    }
  } catch {
    // 清理失败不影响使用
  }

  return cleaned;
}
