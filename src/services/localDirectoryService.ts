import { DriveFile } from '../types';
import { getFileTypeFromMimeAndExt } from '../utils/fileTypeUtils';

const DB_NAME = 'DriveStudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'directory_handles';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e: any) => {
      const db = e.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePersistedDirectoryHandle(handle: any): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, 'active_local_dir');
  } catch (err) {
    console.warn('Failed to persist directory handle to IndexedDB:', err);
  }
}

export async function getPersistedDirectoryHandle(): Promise<any | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
      const req = store.get('active_local_dir');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

export async function clearPersistedDirectoryHandle(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete('active_local_dir');
  } catch (e) {}
}

export async function readFilesFromDirectoryHandle(dirHandle: any): Promise<DriveFile[]> {
  const loadedFiles: DriveFile[] = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      try {
        const f = await entry.getFile();
        const fileType = getFileTypeFromMimeAndExt(f.type, f.name);
        loadedFiles.push({
          id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          name: f.name,
          mimeType: f.type || 'application/octet-stream',
          fileType,
          size: f.size,
          modifiedTime: new Date(f.lastModified).toISOString(),
          isLocal: true,
          fileHandle: entry,
          isFolder: false,
        });
      } catch (e) {
        console.warn('Failed to read file from handle:', entry.name, e);
      }
    }
  }

  // Sort files with folders/alphabetical order
  loadedFiles.sort((a, b) => a.name.localeCompare(b.name));
  return loadedFiles;
}
