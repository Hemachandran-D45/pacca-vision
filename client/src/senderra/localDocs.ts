import type { UploadedDocInfo } from "@/components/documents/UploadDocumentModal";

const STORAGE_KEY = "pacca_uploaded_docs_v1";

export type StoredUploadedDoc = UploadedDocInfo & {
  timestamp: number;
};

export function getStoredUploadedDocs(): StoredUploadedDoc[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Retain uploads from the last 2 hours
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    return parsed.filter(
      (item) => item && typeof item.documentId === "string" && (!item.timestamp || item.timestamp > cutoff)
    );
  } catch {
    return [];
  }
}

export function saveStoredUploadedDocs(docs: UploadedDocInfo[]): StoredUploadedDoc[] {
  if (typeof window === "undefined" || !window.localStorage) return [];
  try {
    const existing = getStoredUploadedDocs();
    const map = new Map<string, StoredUploadedDoc>();
    for (const item of existing) {
      map.set(item.documentId, item);
    }
    for (const item of docs) {
      map.set(item.documentId, {
        ...item,
        timestamp: Date.now(),
      });
    }
    const list = Array.from(map.values()).slice(-50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return list;
  } catch {
    return [];
  }
}

export function pruneStoredUploadedDocs(liveIds: string[]) {
  if (typeof window === "undefined" || !window.localStorage || liveIds.length === 0) return;
  try {
    const existing = getStoredUploadedDocs();
    const liveSet = new Set(liveIds);
    const filtered = existing.filter((doc) => !liveSet.has(doc.documentId));
    if (filtered.length !== existing.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch {}
}
