import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { BreadcrumbItem, ConnectedDriveAccount, DriveFile, OpenDocument, SaveStatus, ToastNotification } from './types';
import { googleDriveService } from './services/googleDriveService';
import { getFileTypeFromMimeAndExt, downloadBlob, blobToArrayBuffer } from './utils/fileTypeUtils';
import {
  getPersistedDirectoryHandle,
  savePersistedDirectoryHandle,
  readFilesFromDirectoryHandle,
} from './services/localDirectoryService';
import { fileBufferCache } from './services/fileBufferCache';

import { TabBar } from './components/Header/TabBar';
import { Header } from './components/Header/Header';
import { DriveExplorer } from './components/DriveExplorer/DriveExplorer';
import { ToastContainer } from './components/Common/ToastContainer';
import { SettingsModal, AppTheme } from './components/Settings/SettingsModal';
import { UnsavedChangesModal } from './components/Common/UnsavedChangesModal';

import { PdfEditor } from './components/Editors/PdfEditor/PdfEditor';
import { ExcelEditor } from './components/Editors/ExcelEditor/ExcelEditor';
import { ImageEditor } from './components/Editors/ImageEditor/ImageEditor';
import { DocEditor } from './components/Editors/DocEditor/DocEditor';

export function App() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: 'local-workspace', name: 'Local Drive' },
  ]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Multi-Account Google Drive State
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedDriveAccount[]>(
    googleDriveService.getAccounts()
  );
  const [activeAccountId, setActiveAccountId] = useState<string | null>(
    googleDriveService.getActiveAccount()?.id || (googleDriveService.isConnected() ? googleDriveService.getAccounts()[0]?.id : null) || 'local'
  );

  // Settings: 5 Themes & UI Scaling
  const [currentTheme, setCurrentTheme] = useState<AppTheme>(() => {
    return (localStorage.getItem('drive_studio_theme') as AppTheme) || 'dark';
  });
  const [uiScale, setUiScale] = useState<number>(() => {
    const saved = localStorage.getItem('drive_studio_ui_scale');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Multi-Document Tabs State (Persisted across page refreshes)
  const isSessionRestoredRef = React.useRef<boolean>(false);
  const [openDocuments, setOpenDocuments] = useState<OpenDocument[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    return localStorage.getItem('studio_active_tab_id_v1') || 'explorer';
  });

  // Unsaved changes confirmation modal state (only when closing a tab with unsaved updates)
  type PendingLeaveAction = {
    type: 'close-tab';
    docId: string;
    fileName: string;
  };

  const [pendingLeaveAction, setPendingLeaveAction] = useState<PendingLeaveAction | null>(null);
  const [isUnsavedModalSaving, setIsUnsavedModalSaving] = useState<boolean>(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('studio_is_header_collapsed_v1') === 'true';
  });

  // Persist open tabs and active document to localStorage (Only after session is restored!)
  useEffect(() => {
    if (!isSessionRestoredRef.current) return;

    if (openDocuments.length > 0) {
      const metaToSave = openDocuments.map((d) => ({
        id: d.id,
        file: {
          id: d.file.id,
          name: d.file.name,
          mimeType: d.file.mimeType,
          size: d.file.size,
          modifiedTime: d.file.modifiedTime,
          fileType: d.file.fileType,
          iconUrl: d.file.iconUrl,
          thumbnailLink: d.file.thumbnailLink,
          isLocal: d.file.isLocal,
          isFolder: d.file.isFolder,
          isDemo: d.file.isDemo,
          driveAccountId: d.file.driveAccountId,
        },
        driveAccountId: d.driveAccountId,
      }));
      localStorage.setItem('studio_open_docs_meta_v1', JSON.stringify(metaToSave));
    } else {
      localStorage.removeItem('studio_open_docs_meta_v1');
    }
    localStorage.setItem('studio_active_tab_id_v1', activeTabId);
  }, [openDocuments, activeTabId]);

  // Persist header collapse focus mode
  useEffect(() => {
    localStorage.setItem('studio_is_header_collapsed_v1', isHeaderCollapsed ? 'true' : 'false');
  }, [isHeaderCollapsed]);

  // Auto-Restore All Open Tabs and Active State on Page Refresh
  useEffect(() => {
    let isCancelled = false;

    const restoreSessionTabs = async () => {
      const savedMeta = localStorage.getItem('studio_open_docs_meta_v1');
      if (!savedMeta) {
        isSessionRestoredRef.current = true;
        return;
      }

      try {
        const metaList: Array<{ id: string; file: DriveFile; driveAccountId?: string }> = JSON.parse(savedMeta);
        if (!Array.isArray(metaList) || metaList.length === 0) {
          isSessionRestoredRef.current = true;
          return;
        }

        const restored: OpenDocument[] = [];

        for (const meta of metaList) {
          if (isCancelled) return;
          try {
            let buffer = await fileBufferCache.get(meta.file.id);

            // If not found in cache and not a local file, fetch it
            if (!buffer && !meta.file.isLocal && !meta.file.id.startsWith('local_')) {
              try {
                const res = await googleDriveService.downloadFile(
                  meta.file.id,
                  meta.file.mimeType,
                  undefined,
                  meta.driveAccountId || meta.file.driveAccountId
                );
                buffer = res.data;
              } catch (e) {
                console.warn(`Could not re-download ${meta.file.name}:`, e);
              }
            }

            if (buffer && buffer.byteLength > 0) {
              const blob = new Blob([buffer], { type: meta.file.mimeType });
              restored.push({
                id: meta.id,
                file: { ...meta.file, rawBlob: blob, rawArrayBuffer: buffer },
                arrayBuffer: buffer,
                modifiedBlob: blob,
                hasUnsavedChanges: false,
                saveStatus: 'idle',
                driveAccountId: meta.driveAccountId,
              });
            }
          } catch (err) {
            console.warn(`Could not restore tab ${meta.file.name}:`, err);
          }
        }

        if (!isCancelled && restored.length > 0) {
          setOpenDocuments(restored);
          const savedActive = localStorage.getItem('studio_active_tab_id_v1');
          if (savedActive && (savedActive === 'explorer' || restored.some((d) => d.id === savedActive))) {
            setActiveTabId(savedActive);
          } else {
            setActiveTabId(restored[restored.length - 1].id);
          }
        }
      } catch (e) {
        console.warn('Failed to parse saved session tabs:', e);
      } finally {
        isSessionRestoredRef.current = true;
      }
    };

    restoreSessionTabs();
    return () => {
      isCancelled = true;
    };
  }, []);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isConnectedToDrive, setIsConnectedToDrive] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [clipboard, setClipboard] = useState<{ file: DriveFile; operation: 'copy' | 'cut' } | null>(null);

  // Folder Navigation History (Back / Forward)
  const [navHistory, setNavHistory] = useState<Array<{ folderId: string; breadcrumbs: BreadcrumbItem[] }>>([
    { folderId: 'root', breadcrumbs: [{ id: 'local-workspace', name: 'Local Drive' }] },
  ]);
  const [navHistoryIndex, setNavHistoryIndex] = useState<number>(0);

  const canGoBack = navHistoryIndex > 0;
  const canGoForward = navHistoryIndex < navHistory.length - 1;

  const handleGoBack = () => {
    if (navHistoryIndex > 0) {
      const nextIndex = navHistoryIndex - 1;
      const target = navHistory[nextIndex];
      if (target) {
        setNavHistoryIndex(nextIndex);
        setCurrentFolderId(target.folderId);
        setBreadcrumbs(target.breadcrumbs);
        setSearchQuery('');
      }
    }
  };

  const handleGoForward = () => {
    if (navHistoryIndex < navHistory.length - 1) {
      const nextIndex = navHistoryIndex + 1;
      const target = navHistory[nextIndex];
      if (target) {
        setNavHistoryIndex(nextIndex);
        setCurrentFolderId(target.folderId);
        setBreadcrumbs(target.breadcrumbs);
        setSearchQuery('');
      }
    }
  };

  // Find currently active document
  const activeDocument = openDocuments.find((d) => d.id === activeTabId) || null;

  // Toast Helper with auto-deduplication
  const showToast = useCallback(
    (type: ToastNotification['type'], title: string, message?: string, duration: number = 4000) => {
      setToasts((prev) => {
        const isDuplicate = prev.some((t) => t.title === title && t.message === message);
        if (isDuplicate) return prev;
        const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const newToast: ToastNotification = { id, type, title, message, duration };
        setTimeout(() => {
          setToasts((current) => current.filter((t) => t.id !== id));
        }, duration);
        return [...prev, newToast];
      });
    },
    []
  );

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load Folder Files from Google Drive
  const loadFolderFiles = useCallback(
    async (folderId: string = currentFolderId, search: string = searchQuery) => {
      if (!googleDriveService.isConnected()) {
        setIsConnectedToDrive(false);
        return;
      }

      setIsLoading(true);
      try {
        const driveFiles = await googleDriveService.listFiles(folderId, search);
        setFiles(driveFiles);
        setIsConnectedToDrive(true);
      } catch (err: any) {
        console.error('Error loading files:', err);
        if (
          err.message?.includes('Authentication') ||
          err.message?.includes('credential') ||
          err.message?.includes('401')
        ) {
          setIsConnectedToDrive(false);
          showToast('warning', 'Session Expired', 'Please reconnect your Google Drive account.');
        } else {
          showToast('error', 'Failed to load Drive files', err.message || 'Please check your connection.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [currentFolderId, searchQuery, showToast]
  );

  // Offline Auto-Sync Worker (Triggers when internet connects or on app boot)
  useEffect(() => {
    const processOfflineQueue = async () => {
      if (!navigator.onLine || !googleDriveService.isConnected()) return;

      const pendingQueue = await fileBufferCache.getOfflineSyncQueue();
      if (!pendingQueue || pendingQueue.length === 0) return;

      showToast('info', 'Syncing Offline Changes', `Uploading ${pendingQueue.length} offline saved document(s) to Google Drive...`);

      for (const item of pendingQueue) {
        try {
          const blob = new Blob([item.buffer], { type: item.mimeType });
          await googleDriveService.uploadFileContent(
            item.fileId,
            item.fileName,
            item.mimeType,
            blob
          );
          await fileBufferCache.removeOfflineSync(item.fileId);
          
          setOpenDocuments((prev) =>
            prev.map((d) => (d.id === item.fileId ? { ...d, saveStatus: 'saved', hasUnsavedChanges: false } : d))
          );
        } catch (err) {
          console.warn(`Could not sync ${item.fileName} yet:`, err);
        }
      }

      showToast('success', 'Offline Sync Complete', 'All offline updates were successfully uploaded to Google Drive.');
      loadFolderFiles(currentFolderId, searchQuery);
    };

    window.addEventListener('online', processOfflineQueue);
    // Initial check on load
    processOfflineQueue();

    return () => {
      window.removeEventListener('online', processOfflineQueue);
    };
  }, [currentFolderId, searchQuery, loadFolderFiles, showToast]);

  // Switch Drive Account or Local
  const handleSelectAccount = async (accountId: string) => {
    if (accountId === 'local') {
      setActiveAccountId('local');
      setIsConnectedToDrive(false);
      try {
        const savedDirHandle = await getPersistedDirectoryHandle();
        if (savedDirHandle) {
          setIsLoading(true);
          const localFiles = await readFilesFromDirectoryHandle(savedDirHandle);
          setFiles(localFiles);
          setBreadcrumbs([{ id: 'local-dir', name: savedDirHandle.name || 'Local Drive' }]);
        } else {
          setFiles([]);
          setBreadcrumbs([{ id: 'local-workspace', name: 'Local Drive' }]);
        }
      } catch (e) {
        setFiles([]);
        setBreadcrumbs([{ id: 'local-workspace', name: 'Local Drive' }]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const switched = googleDriveService.switchAccount(accountId);
    if (switched) {
      setActiveAccountId(switched.id);
      setIsConnectedToDrive(true);
      setCurrentFolderId('root');
      const accountName = switched.name || switched.email.split('@')[0];
      setBreadcrumbs([{ id: 'root', name: `${accountName}'s Drive` }]);
      loadFolderFiles('root', '');
      showToast('info', `Switched to ${switched.email}`, 'Now viewing files for this Google Drive.');
    }
  };

  // Add / Connect Additional Google Drive Account
  const handleAddAccount = async () => {
    try {
      setIsLoading(true);
      const newAcc = await googleDriveService.loginNewAccount();
      const accountsList = googleDriveService.getAccounts();
      setConnectedAccounts([...accountsList]);
      setActiveAccountId(newAcc.id);
      setIsConnectedToDrive(true);
      setCurrentFolderId('root');
      const accountName = newAcc.name || newAcc.email.split('@')[0];
      setBreadcrumbs([{ id: 'root', name: `${accountName}'s Drive` }]);
      loadFolderFiles('root', '');
      showToast('success', 'Connected Google Drive!', `Added ${newAcc.email} to your workspaces.`);
    } catch (err: any) {
      if (err.name !== 'AbortError' && !err.message?.includes('cancelled')) {
        console.error('Error adding drive account:', err);
        showToast('error', 'Connection Failed', err.message || 'Could not connect Google Drive account.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Remove / Disconnect Specific Drive Account
  const handleRemoveAccount = (e: React.MouseEvent, accountId: string) => {
    e.stopPropagation();
    googleDriveService.removeAccount(accountId);
    const updated = [...googleDriveService.getAccounts()];
    setConnectedAccounts(updated);

    // Close open document tabs that belong to this disconnected account
    setOpenDocuments((prev) => {
      const remaining = prev.filter((d) => d.driveAccountId !== accountId);
      if (activeDocument && activeDocument.driveAccountId === accountId) {
        setActiveTabId('explorer');
      }
      return remaining;
    });

    if (activeAccountId === accountId) {
      if (updated.length > 0) {
        handleSelectAccount(updated[0].id);
      } else {
        handleSelectAccount('local');
      }
    }
    showToast('info', 'Disconnected Account', 'Removed Google Drive connection.');
  };

  // Restore active login session or persisted Local Drive on startup
  useEffect(() => {
    let isCancelled = false;

    async function initWorkspace() {
      if (googleDriveService.isConnected()) {
        setIsConnectedToDrive(true);
        const active = googleDriveService.getActiveAccount();
        if (active) {
          setActiveAccountId(active.id);
          const accountName = active.name || active.email.split('@')[0];
          setBreadcrumbs([{ id: 'root', name: `${accountName}'s Drive` }]);
        }
        loadFolderFiles(currentFolderId, searchQuery);
        return;
      }

      setIsConnectedToDrive(false);

      // By default, check if user had a local drive/folder opened previously
      try {
        const savedDirHandle = await getPersistedDirectoryHandle();
        if (savedDirHandle && !isCancelled) {
          setIsLoading(true);
          const localFiles = await readFilesFromDirectoryHandle(savedDirHandle);
          if (!isCancelled) {
            setFiles(localFiles);
            setBreadcrumbs([{ id: 'local-dir', name: savedDirHandle.name || 'Local Drive' }]);
          }
        } else if (!isCancelled) {
          setFiles([]);
          setBreadcrumbs([{ id: 'local-workspace', name: 'Local Drive' }]);
        }
      } catch (err) {
        console.warn('Could not auto-restore persisted directory:', err);
        if (!isCancelled) {
          setFiles([]);
          setBreadcrumbs([{ id: 'local-workspace', name: 'Local Drive' }]);
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }

    initWorkspace();
    return () => {
      isCancelled = true;
    };
  }, [currentFolderId, searchQuery, loadFolderFiles]);

  // Navigate into a subfolder
  const handleNavigateFolder = (folderId: string, folderName: string) => {
    const nextBreadcrumbs = [...breadcrumbs, { id: folderId, name: folderName }];
    setCurrentFolderId(folderId);
    setBreadcrumbs(nextBreadcrumbs);
    setSearchQuery('');

    setNavHistory((prev) => {
      const truncated = prev.slice(0, navHistoryIndex + 1);
      return [...truncated, { folderId, breadcrumbs: nextBreadcrumbs }];
    });
    setNavHistoryIndex((prev) => prev + 1);
  };

  // Navigate via breadcrumbs
  const handleNavigateBreadcrumb = (index: number) => {
    const target = breadcrumbs[index];
    if (!target) return;
    const nextBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(nextBreadcrumbs);
    setCurrentFolderId(target.id);
    setSearchQuery('');

    setNavHistory((prev) => {
      const truncated = prev.slice(0, navHistoryIndex + 1);
      return [...truncated, { folderId: target.id, breadcrumbs: nextBreadcrumbs }];
    });
    setNavHistoryIndex((prev) => prev + 1);
  };

  const openingFilesRef = React.useRef<Set<string>>(new Set());

  // Open a File in a New / Existing Tab (Idempotent & Double-Click Safe)
  const handleOpenFile = async (file: DriveFile) => {
    // If already open, switch to that tab immediately
    const existing = openDocuments.find((d) => d.id === file.id);
    if (existing) {
      setActiveTabId(file.id);
      return;
    }

    // Prevent concurrent duplicate openings from double clicks
    if (openingFilesRef.current.has(file.id)) {
      return;
    }
    openingFilesRef.current.add(file.id);

    setIsLoading(true);
    showToast('info', 'Loading Document', `Accessing "${file.name}"...`);

    try {
      let buffer: ArrayBuffer;
      let initialBlob: Blob;

      if (file.rawBlob) {
        initialBlob = file.rawBlob;
        buffer = file.rawArrayBuffer || (await file.rawBlob.arrayBuffer());
      } else if (file.fileHandle && typeof file.fileHandle.getFile === 'function') {
        const localFile = await file.fileHandle.getFile();
        initialBlob = localFile;
        buffer = await localFile.arrayBuffer();
      } else if (file.isLocal || file.id.startsWith('local_')) {
        throw new Error('Local file content could not be accessed.');
      } else {
        const { data } = await googleDriveService.downloadFile(
          file.id,
          file.mimeType,
          undefined,
          file.driveAccountId || (activeAccountId !== 'local' ? activeAccountId || undefined : undefined)
        );
        buffer = data;
        initialBlob = new Blob([buffer], { type: file.mimeType });
      }

      const newDoc: OpenDocument = {
        id: file.id,
        file: { ...file, rawBlob: initialBlob, rawArrayBuffer: buffer },
        arrayBuffer: buffer,
        modifiedBlob: initialBlob,
        hasUnsavedChanges: false,
        saveStatus: 'idle',
        driveAccountId: file.driveAccountId || (activeAccountId !== 'local' ? activeAccountId || undefined : undefined),
      };

      setOpenDocuments((prev) => {
        if (prev.some((d) => d.id === file.id)) {
          return prev;
        }
        return [...prev, newDoc];
      });
      setActiveTabId(file.id);
      showToast('success', `Opened ${file.name}`, `Ready in tab.`);
    } catch (err: any) {
      console.error('Failed to open file:', err);
      showToast('error', 'Failed to Open File', err.message || 'Could not fetch file content.');
    } finally {
      openingFilesRef.current.delete(file.id);
      setIsLoading(false);
    }
  };

  // Execute Closing a Document Tab
  const executeCloseTab = (docId: string) => {
    const remainingDocs = openDocuments.filter((d) => d.id !== docId);
    setOpenDocuments(remainingDocs);

    if (activeTabId === docId) {
      if (remainingDocs.length > 0) {
        setActiveTabId(remainingDocs[remainingDocs.length - 1].id);
      } else {
        setActiveTabId('explorer');
      }
    }
  };

  // Close a Document Tab (Intercepts with Unsaved Changes Modal)
  const handleCloseTab = (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();

    const docToClose = openDocuments.find((d) => d.id === docId);
    if (docToClose?.hasUnsavedChanges) {
      setPendingLeaveAction({
        type: 'close-tab',
        docId,
        fileName: docToClose.file.name,
      });
      return;
    }

    executeCloseTab(docId);
  };

  // Switch Tab (Directly switches tabs without popup modal, preserving unsaved changes in tabs)
  const handleRequestSelectTab = (targetTabId: string) => {
    if (targetTabId === activeTabId) return;
    setActiveTabId(targetTabId);
  };

  // Back to Files / Explorer (Directly switches view without popup modal, preserving open tabs)
  const handleRequestBackToExplorer = () => {
    setActiveTabId('explorer');
  };

  // Unsaved Changes Modal Option 1: Save & Close Tab
  const handleModalSaveAndContinue = async () => {
    if (!pendingLeaveAction) return;

    setIsUnsavedModalSaving(true);
    try {
      const action = pendingLeaveAction;
      const targetDoc = openDocuments.find((d) => d.id === action.docId);
      if (targetDoc) {
        await handleSaveDocument(targetDoc);
      }
      setPendingLeaveAction(null);
      executeCloseTab(action.docId);
    } catch (err: any) {
      console.error('Save before closing failed:', err);
      showToast('error', 'Save Failed', err.message || 'Could not save before closing.');
    } finally {
      setIsUnsavedModalSaving(false);
    }
  };

  // Unsaved Changes Modal Option 2: Continue without Saving (Discard & Close Tab)
  const handleModalContinueWithoutSaving = () => {
    if (!pendingLeaveAction) return;

    const action = pendingLeaveAction;
    const docToClose = openDocuments.find((d) => d.id === action.docId);
    if (docToClose) {
      try {
        localStorage.removeItem(`pdf_annotations_${docToClose.file.id || docToClose.file.name}`);
      } catch (e) {}
    }

    executeCloseTab(action.docId);
    setPendingLeaveAction(null);
  };

  // Unsaved Changes Modal Option 3: Close (Stay on Tab)
  const handleModalClose = () => {
    setPendingLeaveAction(null);
  };

  // Warn on browser reload / tab close when unsaved documents exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasAnyUnsaved = openDocuments.some((d) => d.hasUnsavedChanges);
      if (hasAnyUnsaved) {
        e.preventDefault();
        e.returnValue = 'This will lose your unsaved updates. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [openDocuments]);

  // Handle Binary Modification from any editor
  const handleEditorModify = (newBlob: Blob) => {
    if (!activeDocument) return;

    setOpenDocuments((prev) =>
      prev.map((doc) =>
        doc.id === activeDocument.id
          ? { ...doc, modifiedBlob: newBlob, hasUnsavedChanges: true, saveStatus: 'unsaved' }
          : doc
      )
    );
  };

  const handleSetHasUnsavedChanges = (hasChanges: boolean) => {
    if (!activeDocument) return;

    setOpenDocuments((prev) =>
      prev.map((doc) =>
        doc.id === activeDocument.id
          ? { ...doc, hasUnsavedChanges: hasChanges, saveStatus: hasChanges ? 'unsaved' : 'saved' }
          : doc
      )
    );
  };

  // Save to Google Drive or In-Place to Local Disk
  const handleSaveDocument = async (docToSave: OpenDocument) => {
    if (!docToSave) return;

    setOpenDocuments((prev) =>
      prev.map((d) => (d.id === docToSave.id ? { ...d, saveStatus: 'saving' } : d))
    );

    try {
      const { file, modifiedBlob } = docToSave;

      // 1. If opened via File System Access API handle (Local C:, D:, G: drive), save in-place directly to disk!
      if (file.fileHandle && typeof file.fileHandle.createWritable === 'function') {
        try {
          const writable = await file.fileHandle.createWritable();
          await writable.write(modifiedBlob);
          await writable.close();

          const newBuffer = await blobToArrayBuffer(modifiedBlob);
          setOpenDocuments((prev) =>
            prev.map((d) =>
              d.id === docToSave.id
                ? {
                    ...d,
                    arrayBuffer: newBuffer,
                    file: {
                      ...d.file,
                      rawBlob: modifiedBlob,
                      size: modifiedBlob.size,
                      modifiedTime: new Date().toISOString(),
                    },
                    hasUnsavedChanges: false,
                    saveStatus: 'saved',
                  }
                : d
            )
          );

          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id
                ? { ...f, rawBlob: modifiedBlob, size: modifiedBlob.size, modifiedTime: new Date().toISOString() }
                : f
            )
          );

          showToast('success', 'Saved Directly to Local File!', `Updated "${file.name}" in place on your disk.`);
          return;
        } catch (localWriteErr: any) {
          console.warn('Direct fileHandle write failed, attempting fallback:', localWriteErr);
        }
      }

      // 2. If not connected to Google Drive, save to in-memory blob
      if (!googleDriveService.isConnected()) {
        const newBuffer = await blobToArrayBuffer(modifiedBlob);

        setOpenDocuments((prev) =>
          prev.map((d) =>
            d.id === docToSave.id
              ? {
                  ...d,
                  arrayBuffer: newBuffer,
                  file: { ...d.file, rawBlob: modifiedBlob, size: modifiedBlob.size, modifiedTime: new Date().toISOString() },
                  hasUnsavedChanges: false,
                  saveStatus: 'saved',
                }
              : d
          )
        );

        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? { ...f, rawBlob: modifiedBlob, size: modifiedBlob.size, modifiedTime: new Date().toISOString() }
              : f
          )
        );

        showToast('success', 'Saved Directly in Local Cache!', 'File updated locally. Click "Download" to export or connect Google Drive to sync.');
        return;
      }

      // 3. Connected to Google Drive or Offline: Cache binary buffer locally first!
      const newBuffer = await blobToArrayBuffer(modifiedBlob);
      await fileBufferCache.set(docToSave.id, newBuffer);

      // If offline, queue for background sync when connection returns
      if (!navigator.onLine) {
        if (!file.id.startsWith('local_')) {
          await fileBufferCache.queueOfflineSync({
            fileId: docToSave.file.id,
            fileName: docToSave.file.name,
            mimeType: docToSave.file.mimeType,
            driveAccountId: docToSave.driveAccountId,
            modifiedTime: new Date().toISOString(),
            buffer: newBuffer,
          });
        }

        setOpenDocuments((prev) =>
          prev.map((d) =>
            d.id === docToSave.id
              ? {
                  ...d,
                  arrayBuffer: newBuffer,
                  file: {
                    ...d.file,
                    rawBlob: modifiedBlob,
                    size: modifiedBlob.size,
                    modifiedTime: new Date().toISOString(),
                  },
                  hasUnsavedChanges: false,
                  saveStatus: 'saved',
                }
              : d
          )
        );

        showToast('info', 'Saved to Offline Cache', `"${file.name}" is stored safely in local memory and will automatically sync to Google Drive once reconnected.`);
        return;
      }

      // Online Google Drive Upload
      let updated: DriveFile;
      if (file.id.startsWith('local_')) {
        // Upload local file to connected Google Drive
        updated = await googleDriveService.createNewFile(
          file.name,
          file.mimeType,
          modifiedBlob,
          currentFolderId !== 'root' ? currentFolderId : undefined,
          activeAccountId !== 'local' ? activeAccountId || undefined : undefined
        );
      } else {
        // Direct media update to Google Drive
        updated = await googleDriveService.uploadFileContent(
          file.id,
          file.name,
          file.mimeType,
          modifiedBlob,
          docToSave.driveAccountId || file.driveAccountId
        );
      }

      setOpenDocuments((prev) =>
        prev.map((d) =>
          d.id === docToSave.id
            ? {
                ...d,
                id: updated.id,
                arrayBuffer: newBuffer,
                file: {
                  ...d.file,
                  id: updated.id,
                  name: updated.name,
                  size: modifiedBlob.size,
                  modifiedTime: new Date().toISOString(),
                },
                hasUnsavedChanges: false,
                saveStatus: 'saved',
              }
            : d
        )
      );

      if (updated.id !== file.id && activeTabId === docToSave.id) {
        setActiveTabId(updated.id);
      }

      // Refresh files list so the explorer displays the updated file size and timestamp
      loadFolderFiles(currentFolderId, searchQuery);
      showToast('success', 'Synced to Google Drive!', `Successfully saved "${updated.name}".`);
    } catch (err: any) {
      console.warn('Save to Drive encountered an issue, storing in offline cache:', err);
      try {
        const fallbackBuffer = await blobToArrayBuffer(docToSave.modifiedBlob);
        await fileBufferCache.set(docToSave.id, fallbackBuffer);
        if (!docToSave.file.id.startsWith('local_')) {
          await fileBufferCache.queueOfflineSync({
            fileId: docToSave.file.id,
            fileName: docToSave.file.name,
            mimeType: docToSave.file.mimeType,
            driveAccountId: docToSave.driveAccountId,
            modifiedTime: new Date().toISOString(),
            buffer: fallbackBuffer,
          });
        }
        setOpenDocuments((prev) =>
          prev.map((d) =>
            d.id === docToSave.id
              ? {
                  ...d,
                  arrayBuffer: fallbackBuffer,
                  hasUnsavedChanges: false,
                  saveStatus: 'saved',
                }
              : d
          )
        );
        showToast('info', 'Saved in Offline Cache', `Network issue detected. "${docToSave.file.name}" was saved locally and queued for automatic sync when online.`);
      } catch (cacheErr) {
        setOpenDocuments((prev) =>
          prev.map((d) => (d.id === docToSave.id ? { ...d, saveStatus: 'error' } : d))
        );
        showToast('error', 'Save Failed', err.message || 'Failed to update file.');
      }
    }
  };

  const handleSaveToDrive = async () => {
    if (!activeDocument) return;
    await handleSaveDocument(activeDocument);
  };

  // Global Keyboard Shortcut: Ctrl+S / Cmd+S to Save to Drive / Disk
  useEffect(() => {
    const handleGlobalSaveShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
        if (activeDocument && activeDocument.saveStatus !== 'saving') {
          handleSaveToDrive();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalSaveShortcut, true);
    return () => window.removeEventListener('keydown', handleGlobalSaveShortcut, true);
  }, [activeDocument, handleSaveToDrive]);

  // Save as Copy
  const handleSaveAsCopy = async () => {
    if (!activeDocument) return;

    const { file, modifiedBlob } = activeDocument;
    const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
    const baseName = file.name.replace(ext, '');
    const copyName = `${baseName}_copy_${Date.now().toString().slice(-4)}${ext}`;

    setOpenDocuments((prev) =>
      prev.map((d) => (d.id === activeDocument.id ? { ...d, saveStatus: 'saving' } : d))
    );

    try {
      if (!googleDriveService.isConnected()) {
        const copyFile: DriveFile = {
          id: 'local-copy-' + Date.now(),
          name: copyName,
          mimeType: file.mimeType,
          fileType: file.fileType,
          size: modifiedBlob.size,
          modifiedTime: new Date().toISOString(),
          isLocal: true,
          parentFolderId: currentFolderId,
          rawBlob: modifiedBlob,
        };

        setFiles((prev) => [copyFile, ...prev]);
        handleOpenFile(copyFile);
        showToast('success', 'Saved as New Copy!', `Created "${copyName}"`);
        return;
      }

      const created = await googleDriveService.createNewFile(
        copyName,
        file.mimeType,
        modifiedBlob,
        currentFolderId !== 'root' ? currentFolderId : undefined,
        activeAccountId !== 'local' ? activeAccountId || undefined : undefined
      );

      setFiles((prev) => [created, ...prev]);
      handleOpenFile(created);
      showToast('success', 'Created Copy in Google Drive!', `Created "${created.name}"`);
    } catch (err: any) {
      console.error('Save as Copy error:', err);
      showToast('error', 'Copy Failed', err.message || 'Could not create new file.');
    }
  };

  // Download Local Copy
  const handleDownloadLocal = () => {
    if (!activeDocument) return;
    downloadBlob(activeDocument.modifiedBlob, activeDocument.file.name);
    showToast('info', 'File Downloaded', `Saved "${activeDocument.file.name}" to your computer.`);
  };

  // Native Open Local File Picker (Direct File System Access API with in-place save)
  const handleOpenLocalFilePicker = async () => {
    try {
      if ('showOpenFilePicker' in window) {
        const [fileHandle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'Supported Files (PDF, Excel, Images, Docs)',
              accept: {
                'application/pdf': ['.pdf'],
                'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                'application/vnd.ms-excel': ['.xls'],
                'text/plain': ['.txt', '.md'],
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
              },
            },
          ],
          multiple: false,
        });

        if (!fileHandle) return;
        const localFile = await fileHandle.getFile();
        const buffer = await localFile.arrayBuffer();
        const blob = new Blob([buffer], { type: localFile.type || 'application/octet-stream' });
        const fileType = getFileTypeFromMimeAndExt(localFile.type, localFile.name);

        const localDriveFile: DriveFile = {
          id: 'local_' + Date.now(),
          name: localFile.name,
          mimeType: localFile.type || 'application/octet-stream',
          fileType,
          size: localFile.size,
          modifiedTime: new Date(localFile.lastModified).toISOString(),
          isLocal: true,
          fileHandle,
          rawBlob: blob,
          rawArrayBuffer: buffer,
        };

        setFiles((prev) => [localDriveFile, ...prev]);
        handleOpenFile(localDriveFile);
        showToast('success', `Opened "${localFile.name}"`, 'Edit and click Save to write directly back to your local disk.');
      } else {
        // Fallback file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.md,.txt,.docx';
        input.onchange = (e: any) => {
          const f = e.target.files?.[0];
          if (f) handleUploadLocalFile(f);
        };
        input.click();
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error opening local file:', err);
        showToast('error', 'Open Failed', err.message || 'Could not open local file.');
      }
    }
  };

  // Open Entire Local Folder / Drive (e.g. C:, D:, G: directory)
  const handleOpenLocalFolder = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        if (!dirHandle) return;

        setIsLoading(true);
        await savePersistedDirectoryHandle(dirHandle);
        const loadedFiles = await readFilesFromDirectoryHandle(dirHandle);

        setFiles(loadedFiles);
        setBreadcrumbs([{ id: 'local-dir', name: dirHandle.name || 'Local Drive' }]);
        showToast('success', `Opened Folder "${dirHandle.name}"`, `Loaded ${loadedFiles.length} files from your disk.`);
      } else {
        showToast('warning', 'Folder Picker Not Supported', 'Please use "Open Local File" instead.');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error opening directory:', err);
        showToast('error', 'Folder Open Failed', err.message || 'Could not access folder.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Create New Folder (Google Drive or Local)
  const handleCreateFolder = async (folderName: string) => {
    if (!folderName.trim()) return;

    if (googleDriveService.isConnected()) {
      setIsLoading(true);
      try {
        const newFolder = await googleDriveService.createFolder(
          folderName.trim(),
          currentFolderId !== 'root' ? currentFolderId : undefined
        );
        setFiles((prev) => [newFolder, ...prev]);
        showToast('success', 'Folder Created in Google Drive!', `Created "${newFolder.name}".`);
      } catch (err: any) {
        console.error('Error creating folder:', err);
        showToast('error', 'Folder Creation Failed', err.message || 'Could not create folder in Google Drive.');
      } finally {
        setIsLoading(false);
      }
    } else {
      const localFolder: DriveFile = {
        id: 'local_folder_' + Date.now(),
        name: folderName.trim(),
        mimeType: 'application/vnd.google-apps.folder',
        fileType: 'unknown',
        isFolder: true,
        isLocal: true,
        parentFolderId: currentFolderId,
        modifiedTime: new Date().toISOString(),
      };
      setFiles((prev) => [localFolder, ...prev]);
      showToast('success', 'Folder Created!', `Created folder "${folderName.trim()}".`);
    }
  };

  // Upload Multiple Files to Google Drive or Local
  const handleUploadFilesToDrive = async (uploadedFiles: FileList) => {
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    setIsLoading(true);
    let successCount = 0;

    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      try {
        if (googleDriveService.isConnected()) {
          const created = await googleDriveService.createNewFile(
            file.name,
            file.type || 'application/octet-stream',
            file,
            currentFolderId !== 'root' ? currentFolderId : undefined
          );
          setFiles((prev) => [created, ...prev]);
          successCount++;
        } else {
          const buffer = await file.arrayBuffer();
          const blob = new Blob([buffer], { type: file.type || 'application/octet-stream' });
          const fileType = getFileTypeFromMimeAndExt(file.type, file.name);

          const localFile: DriveFile = {
            id: 'local_' + Date.now() + '_' + i,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            fileType,
            size: file.size,
            modifiedTime: new Date(file.lastModified).toISOString(),
            isLocal: true,
            parentFolderId: currentFolderId,
            rawBlob: blob,
            rawArrayBuffer: buffer,
          };
          setFiles((prev) => [localFile, ...prev]);
          successCount++;
        }
      } catch (err: any) {
        console.error('Failed to upload file:', file.name, err);
        showToast('error', `Failed to upload "${file.name}"`, err.message);
      }
    }

    setIsLoading(false);
    if (successCount > 0) {
      showToast(
        'success',
        googleDriveService.isConnected() ? 'Uploaded to Google Drive!' : 'Loaded Files!',
        `Successfully added ${successCount} file(s).`
      );
    }
  };

  // Copy File to Clipboard
  const handleCopyFile = (file: DriveFile) => {
    const fileWithAcc: DriveFile = {
      ...file,
      driveAccountId: file.driveAccountId || (activeAccountId !== 'local' ? activeAccountId || undefined : undefined),
    };
    setClipboard({ file: fileWithAcc, operation: 'copy' });
    showToast('info', `Copied "${file.name}"`, 'Navigate to any destination folder and click "Paste Here".');
  };

  // Cut File (Prepare for Move)
  const handleCutFile = (file: DriveFile) => {
    const fileWithAcc: DriveFile = {
      ...file,
      driveAccountId: file.driveAccountId || (activeAccountId !== 'local' ? activeAccountId || undefined : undefined),
    };
    setClipboard({ file: fileWithAcc, operation: 'cut' });
    showToast('info', `Cut "${file.name}"`, 'Navigate to destination folder and click "Paste Here" to move.');
  };

  // Cancel Clipboard
  const handleCancelClipboard = () => {
    setClipboard(null);
  };

  // Helper to extract binary data for universal cross-drive pasting
  const getFileBinary = async (file: DriveFile): Promise<{ blob: Blob; buffer: ArrayBuffer }> => {
    if (file.rawBlob) {
      const buffer = file.rawArrayBuffer || (await blobToArrayBuffer(file.rawBlob));
      return { blob: file.rawBlob, buffer };
    }
    if (file.fileHandle && typeof file.fileHandle.getFile === 'function') {
      const localFile = await file.fileHandle.getFile();
      const buffer = await localFile.arrayBuffer();
      const blob = new Blob([buffer], { type: localFile.type || file.mimeType || 'application/octet-stream' });
      return { blob, buffer };
    }
    if (file.isLocal || file.id.startsWith('local_')) {
      throw new Error('Local file binary data is not available.');
    }
    // Download binary from source Google Drive account
    const { data } = await googleDriveService.downloadFile(file.id, file.mimeType, undefined, file.driveAccountId);
    const blob = new Blob([data], { type: file.mimeType || 'application/octet-stream' });
    return { blob, buffer: data };
  };

  // Recursively copy a folder and all its contents across drives or locally
  const copyFolderRecursively = async (
    srcFolder: DriveFile,
    targetFolderId: string,
    targetAccountId?: string,
    targetIsLocal?: boolean
  ): Promise<DriveFile> => {
    // 1. Create the destination folder
    let createdFolder: DriveFile;
    if (!targetIsLocal) {
      createdFolder = await googleDriveService.createFolder(
        srcFolder.name,
        targetFolderId !== 'root' ? targetFolderId : undefined,
        targetAccountId
      );
    } else {
      createdFolder = {
        id: 'local_folder_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: srcFolder.name,
        mimeType: 'application/vnd.google-apps.folder',
        fileType: 'unknown',
        isFolder: true,
        isLocal: true,
        parentFolderId: targetFolderId,
        modifiedTime: new Date().toISOString(),
      };
      setFiles((prev) => [createdFolder, ...prev]);
    }

    // 2. Fetch children from source
    let children: DriveFile[] = [];
    if (!srcFolder.isLocal && !srcFolder.id.startsWith('local_')) {
      children = await googleDriveService.listFiles(srcFolder.id, undefined, srcFolder.driveAccountId);
    } else {
      children = files.filter((f) => f.parentFolderId === srcFolder.id);
    }

    // 3. Copy children recursively
    for (const child of children) {
      const childIsFolder = child.isFolder || child.mimeType === 'application/vnd.google-apps.folder';
      if (childIsFolder) {
        await copyFolderRecursively(child, createdFolder.id, targetAccountId, targetIsLocal);
      } else {
        const { blob, buffer } = await getFileBinary(child);
        if (!targetIsLocal) {
          await googleDriveService.createNewFile(
            child.name,
            child.mimeType,
            blob,
            createdFolder.id,
            targetAccountId
          );
        } else {
          const localChild: DriveFile = {
            ...child,
            id: 'local_file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: child.name,
            isLocal: true,
            parentFolderId: createdFolder.id,
            rawBlob: blob,
            rawArrayBuffer: buffer,
          };
          setFiles((prev) => [localChild, ...prev]);
        }
      }
    }

    return createdFolder;
  };

  // Universal Paste File into Current Folder (Local, Drive 1, Drive 2, Cross-Drive)
  const handlePasteFile = async () => {
    if (!clipboard) return;

    setIsLoading(true);
    try {
      const srcFile = clipboard.file;
      const isFolder = srcFile.isFolder || srcFile.mimeType === 'application/vnd.google-apps.folder';
      const isSrcLocal = srcFile.isLocal || srcFile.id.startsWith('local_');
      const isDestLocal = !isConnectedToDrive || activeAccountId === 'local';
      const isSameDriveAccount =
        !isSrcLocal &&
        !isDestLocal &&
        (srcFile.driveAccountId === activeAccountId || (!srcFile.driveAccountId && !activeAccountId));

      const targetAccountId = activeAccountId !== 'local' ? activeAccountId || undefined : undefined;

      if (clipboard.operation === 'copy') {
        if (isFolder) {
          // Folder copy (requires recursive folder & file copy)
          showToast('info', 'Copying Folder...', `Copying "${srcFile.name}" and all contents...`);
          const createdFolder = await copyFolderRecursively(srcFile, currentFolderId, targetAccountId, isDestLocal);
          if (!isDestLocal) {
            setFiles((prev) => [createdFolder, ...prev]);
          }
          showToast('success', 'Folder Copied!', `Pasted "${createdFolder.name}" into this folder.`);
        } else if (isSameDriveAccount) {
          // Native same-drive file copy
          const copied = await googleDriveService.copyFile(
            srcFile.id,
            currentFolderId !== 'root' ? currentFolderId : undefined,
            targetAccountId
          );
          setFiles((prev) => [copied, ...prev]);
          showToast('success', 'File Copied in Drive!', `Pasted "${copied.name}" into this folder.`);
        } else if (!isDestLocal) {
          // Cross-Drive or Local-to-Drive: upload binary directly to destination Google Drive account
          const { blob } = await getFileBinary(srcFile);
          const uploaded = await googleDriveService.createNewFile(
            srcFile.name,
            srcFile.mimeType,
            blob,
            currentFolderId !== 'root' ? currentFolderId : undefined,
            targetAccountId
          );
          setFiles((prev) => [uploaded, ...prev]);
          showToast('success', 'Pasted into Google Drive!', `Uploaded "${uploaded.name}" into this Drive folder.`);
        } else {
          // Paste into Local Drive (from Local or from Google Drive)
          const { blob, buffer } = await getFileBinary(srcFile);
          const copyName = isSrcLocal ? 'Copy_' + srcFile.name : srcFile.name;
          const localCopy: DriveFile = {
            ...srcFile,
            id: 'local_copy_' + Date.now(),
            name: copyName,
            isLocal: true,
            parentFolderId: currentFolderId,
            rawBlob: blob,
            rawArrayBuffer: buffer,
          };
          setFiles((prev) => [localCopy, ...prev]);
          showToast('success', 'File Pasted Locally!', `Added "${copyName}" to local folder.`);
        }
      } else if (clipboard.operation === 'cut') {
        if (isSameDriveAccount) {
          // Native same-drive move (Google Drive natively supports moving folders and files)
          const moved = await googleDriveService.moveFile(
            srcFile.id,
            srcFile.parentFolderId,
            currentFolderId !== 'root' ? currentFolderId : undefined,
            targetAccountId
          );
          setFiles((prev) => [moved, ...prev.filter((f) => f.id !== srcFile.id)]);
          showToast('success', isFolder ? 'Folder Moved in Drive!' : 'File Moved in Drive!', `Moved "${moved.name}" into this folder.`);
        } else if (isFolder) {
          // Cross-Drive or Local-to-Drive folder move
          showToast('info', 'Moving Folder...', `Moving "${srcFile.name}" and all contents...`);
          const createdFolder = await copyFolderRecursively(srcFile, currentFolderId, targetAccountId, isDestLocal);
          // Delete original from source account
          if (isSrcLocal) {
            setFiles((prev) => prev.filter((f) => f.id !== srcFile.id && f.parentFolderId !== srcFile.id));
          } else {
            try {
              await googleDriveService.deleteFile(srcFile.id, srcFile.driveAccountId);
            } catch (e) {
              console.warn('Could not delete original folder from source drive:', e);
            }
          }
          if (!isDestLocal) {
            setFiles((prev) => [createdFolder, ...prev.filter((f) => f.id !== srcFile.id)]);
          }
          showToast('success', 'Folder Moved!', `Moved "${createdFolder.name}" into this Drive folder.`);
        } else if (!isDestLocal) {
          // Move file from Local / Drive 1 into Drive 2/3
          const { blob } = await getFileBinary(srcFile);
          const uploaded = await googleDriveService.createNewFile(
            srcFile.name,
            srcFile.mimeType,
            blob,
            currentFolderId !== 'root' ? currentFolderId : undefined,
            targetAccountId
          );
          // Delete original from source account
          if (isSrcLocal) {
            setFiles((prev) => prev.filter((f) => f.id !== srcFile.id));
          } else {
            try {
              await googleDriveService.deleteFile(srcFile.id, srcFile.driveAccountId);
            } catch (e) {
              console.warn('Could not delete file from source drive:', e);
            }
          }
          setFiles((prev) => [uploaded, ...prev.filter((f) => f.id !== srcFile.id)]);
          showToast('success', 'File Moved to Google Drive!', `Moved "${uploaded.name}" into this Drive.`);
        } else {
          // Move file from Google Drive into Local Drive
          const { blob, buffer } = await getFileBinary(srcFile);
          const movedLocal: DriveFile = {
            ...srcFile,
            id: isSrcLocal ? srcFile.id : 'local_' + Date.now(),
            isLocal: true,
            parentFolderId: currentFolderId,
            rawBlob: blob,
            rawArrayBuffer: buffer,
          };
          if (!isSrcLocal) {
            try {
              await googleDriveService.deleteFile(srcFile.id, srcFile.driveAccountId);
            } catch (e) {
              console.warn('Could not delete file from source drive:', e);
            }
          }
          setFiles((prev) => [movedLocal, ...prev.filter((f) => f.id !== srcFile.id)]);
          showToast('success', 'File Moved Locally!', `Moved "${movedLocal.name}" into this folder.`);
        }
        setClipboard(null);
      }
    } catch (err: any) {
      console.error('Paste error:', err);
      showToast('error', 'Paste Failed (File Safe)', (err.message ? `${err.message}. ` : '') + 'Original file is safe in its original location.');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete File / Folder (Google Drive or Local)
  const handleDeleteFile = async (file: DriveFile) => {
    if (!window.confirm(`Are you sure you want to delete "${file.name}"?`)) {
      return;
    }

    setIsLoading(true);
    try {
      if (googleDriveService.isConnected() && !file.isLocal) {
        await googleDriveService.deleteFile(file.id, file.driveAccountId);
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        showToast('success', 'Deleted in Google Drive', `"${file.name}" was deleted.`);
      } else {
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        showToast('success', 'Removed Item', `Removed "${file.name}".`);
      }
    } catch (err: any) {
      console.error('Delete failed:', err);
      showToast('error', 'Delete Failed', err.message || 'Could not delete item.');
    } finally {
      setIsLoading(false);
    }
  };

  // Upload Local File from Disk (fallback)
  const handleUploadLocalFile = async (uploadedFile: File) => {
    try {
      const buffer = await uploadedFile.arrayBuffer();
      const fileType = getFileTypeFromMimeAndExt(uploadedFile.type, uploadedFile.name);

      const localDriveFile: DriveFile = {
        id: 'local_' + Date.now(),
        name: uploadedFile.name,
        mimeType: uploadedFile.type || 'application/octet-stream',
        fileType,
        size: uploadedFile.size,
        modifiedTime: new Date(uploadedFile.lastModified).toISOString(),
        isLocal: true,
        parentFolderId: currentFolderId,
        rawBlob: uploadedFile,
        rawArrayBuffer: buffer,
      };

      setFiles((prev) => [localDriveFile, ...prev]);
      handleOpenFile(localDriveFile);
    } catch (err: any) {
      console.error('Failed to load local file:', err);
      showToast('error', 'Load Failed', 'Could not parse local file.');
    }
  };

  // Rename File Title
  const handleRenameFile = (newName: string) => {
    if (!activeDocument) return;

    setOpenDocuments((prev) =>
      prev.map((d) =>
        d.id === activeDocument.id
          ? {
              ...d,
              file: { ...d.file, name: newName },
              hasUnsavedChanges: true,
              saveStatus: 'unsaved',
            }
          : d
      )
    );
  };

  // Apply Theme
  const applyTheme = (theme: AppTheme) => {
    setCurrentTheme(theme);
    localStorage.setItem('drive_studio_theme', theme);
    document.body.className = `theme-${theme} ${theme === 'light' ? 'light-theme' : 'dark-theme'}`;
  };

  // Apply UI Scaling
  const applyUiScale = (scale: number) => {
    setUiScale(scale);
    localStorage.setItem('drive_studio_ui_scale', scale.toString());
    document.documentElement.style.fontSize = `${scale * 100}%`;
    document.documentElement.style.setProperty('--ui-scale', scale.toString());
  };

  // Initialize theme & zoom on mount
  useEffect(() => {
    applyTheme(currentTheme);
    applyUiScale(uiScale);
  }, []);

  // Theme Toggle (Quick switch between dark and light)
  const handleToggleTheme = () => {
    const nextTheme: AppTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  };

  // Disconnect All Google Drives
  const handleDisconnectAll = () => {
    connectedAccounts.forEach((acc) => {
      googleDriveService.removeAccount(acc.id);
    });
    setConnectedAccounts([]);
    setOpenDocuments((prev) => prev.filter((d) => d.file.isLocal));
    handleSelectAccount('local');
    showToast('info', 'Disconnected All', 'All Google Drive accounts have been logged out.');
  };

  // Disconnect Drive
  const handleDisconnectDrive = () => {
    googleDriveService.logout();
    setIsConnectedToDrive(false);
    setFiles([]);
    setBreadcrumbs([{ id: 'root', name: 'Local Drive' }]);
    showToast('info', 'Disconnected', 'Google Drive session closed.');
  };

  return (
    <div className="app-container">
      {/* Top Browser-style Tab Bar & Header (Collapsible for Clean Reading Focus) */}
      {!isHeaderCollapsed && (
        <>
          <TabBar
            openDocuments={openDocuments}
            activeTabId={activeTabId}
            connectedAccounts={connectedAccounts}
            activeAccountId={activeAccountId}
            onSelectTab={handleRequestSelectTab}
            onSelectAccount={handleSelectAccount}
            onAddAccount={handleAddAccount}
            onRemoveAccount={handleRemoveAccount}
            onCloseTab={handleCloseTab}
            onOpenExplorer={handleRequestBackToExplorer}
          />

          <Header
            activeFile={activeDocument?.file || null}
            saveStatus={activeDocument?.saveStatus || 'idle'}
            hasUnsavedChanges={activeDocument?.hasUnsavedChanges || false}
            onBackToExplorer={handleRequestBackToExplorer}
            onSaveToDrive={handleSaveToDrive}
            onSaveAsCopy={handleSaveAsCopy}
            onDownloadLocal={handleDownloadLocal}
            onRenameFile={handleRenameFile}
            isDarkMode={currentTheme !== 'light'}
            onToggleTheme={handleToggleTheme}
            onOpenSettings={() => setIsSettingsOpen(true)}
            isConnectedToDrive={isConnectedToDrive}
          />
        </>
      )}

      {/* Main View Area */}
      <main className="app-main">
        {activeTabId === 'explorer' || !activeDocument ? (
          <DriveExplorer
            files={files}
            breadcrumbs={breadcrumbs}
            currentFolderId={currentFolderId}
            onNavigateFolder={handleNavigateFolder}
            onNavigateBreadcrumb={handleNavigateBreadcrumb}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onGoBack={handleGoBack}
            onGoForward={handleGoForward}
            onOpenFile={handleOpenFile}
            onUploadLocalFile={handleUploadLocalFile}
            onUploadFilesToDrive={handleUploadFilesToDrive}
            onCreateFolder={handleCreateFolder}
            onCopyFile={handleCopyFile}
            onCutFile={handleCutFile}
            onPasteFile={handlePasteFile}
            onDeleteFile={handleDeleteFile}
            onCancelClipboard={handleCancelClipboard}
            clipboard={clipboard}
            onOpenLocalFilePicker={handleOpenLocalFilePicker}
            onOpenLocalFolder={handleOpenLocalFolder}
            onConnectDrive={handleAddAccount}
            isConnectedToDrive={isConnectedToDrive}
            onDisconnectDrive={handleDisconnectDrive}
            onRefreshFiles={() => loadFolderFiles(currentFolderId, searchQuery)}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        ) : (
          <>
            {activeDocument.file.fileType === 'pdf' && (
              <PdfEditor
                key={activeDocument.id}
                file={activeDocument.file}
                arrayBuffer={activeDocument.arrayBuffer}
                onModify={handleEditorModify}
                onHasUnsavedChanges={handleSetHasUnsavedChanges}
                isHeaderCollapsed={isHeaderCollapsed}
                onToggleCollapseHeader={() => setIsHeaderCollapsed((prev) => !prev)}
              />
            )}

            {activeDocument.file.fileType === 'excel' && (
              <ExcelEditor
                key={activeDocument.id}
                file={activeDocument.file}
                arrayBuffer={activeDocument.arrayBuffer}
                onModify={handleEditorModify}
                onHasUnsavedChanges={handleSetHasUnsavedChanges}
              />
            )}

            {activeDocument.file.fileType === 'image' && (
              <ImageEditor
                key={activeDocument.id}
                file={activeDocument.file}
                arrayBuffer={activeDocument.arrayBuffer}
                onModify={handleEditorModify}
                onHasUnsavedChanges={handleSetHasUnsavedChanges}
              />
            )}

            {activeDocument.file.fileType === 'doc' && (
              <DocEditor
                key={activeDocument.id}
                file={activeDocument.file}
                arrayBuffer={activeDocument.arrayBuffer}
                onModify={handleEditorModify}
                onHasUnsavedChanges={handleSetHasUnsavedChanges}
              />
            )}

            {activeDocument.file.fileType === 'unknown' && (
              <div style={{ padding: '3rem', textAlign: 'center', margin: 'auto' }}>
                <h3>File Format Loaded</h3>
                <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  Preview is not available for mime type: {activeDocument.file.mimeType}
                </p>
                <button className="btn-primary" onClick={handleDownloadLocal} style={{ marginTop: '1rem' }}>
                  Download File Directly
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Settings Modal (5 Themes, UI Scaling, Account Management & Logout) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTheme={currentTheme}
        onSelectTheme={applyTheme}
        uiScale={uiScale}
        onSetUiScale={applyUiScale}
        connectedAccounts={connectedAccounts}
        onDisconnectAccount={(accId) => handleRemoveAccount({ stopPropagation: () => {} } as any, accId)}
        onDisconnectAll={handleDisconnectAll}
      />

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedChangesModal
        isOpen={Boolean(pendingLeaveAction)}
        fileName={pendingLeaveAction?.fileName || ''}
        onSaveAndContinue={handleModalSaveAndContinue}
        onContinueWithoutSaving={handleModalContinueWithoutSaving}
        onClose={handleModalClose}
        isSaving={isUnsavedModalSaving}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
